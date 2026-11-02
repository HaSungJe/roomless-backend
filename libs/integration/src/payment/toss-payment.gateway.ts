import {BadRequestException, Injectable, Logger, OnApplicationBootstrap, ServiceUnavailableException} from '@nestjs/common';
import {dayjs} from '@app/common/utils/dayjs.js';
import {PAYMENT_FAILED_MESSAGE, PAYMENT_REQUEST_TIMEOUT_MS, PAYMENT_UNAVAILABLE_MESSAGE, TOSS_API_BASE_URL} from '../integration.constants.js';
import {classifyTossFailure} from '../integration.util.js';
import type {PaymentCancelInput, PaymentCancelResult, PaymentEnvironment, PaymentGatewayInterface, PaymentLookupResult} from '../interfaces/integration.interface.js';

/** 토스 결제 객체 — 쓰는 필드만 */
interface TossPayment {
    paymentKey: string;
    orderId: string;
    status: string;
    totalAmount: number;
    method: string | null;
    approvedAt: string | null;
    receipt: {url: string} | null;
    cancels: {cancelAmount: number; canceledAt: string}[] | null;
}

/** 토스 응답 1건 — 상태 코드 · 성공 여부 · 본문(JSON 이 아니면 null) */
interface TossResponse {
    status: number;
    ok: boolean;
    body: unknown;
}

/**
 * 토스 결제 객체를 포트 결과로 바꾼다.
 *
 * @param payment 토스 결제 객체
 * @returns 조회 결과
 */
function toLookupResult(payment: TossPayment): PaymentLookupResult {
    return {
        payment_key: payment.paymentKey,
        order_id: payment.orderId,
        status: payment.status,
        total_amount: payment.totalAmount,
        method: payment.method ?? null,
        approved_at: payment.approvedAt ? dayjs(payment.approvedAt).toDate() : null,
        receipt_url: payment.receipt?.url ?? null,
    };
}

/**
 * 결제 어댑터 — 토스페이먼츠 API(https://api.tosspayments.com). 시크릿 키 TOSS_SECRET_KEY 를 Basic 인증(`키:` 를 base64)으로 쓴다.
 * 결제창 · 승인은 프론트가 하고, 여기서는 조회(검증) · 전액 취소(환불)만 한다. 취소는 Idempotency-Key cancel-<payment_id> 로 재시도해도 한 번만 된다.
 * 실패 분류는 classifyTossFailure — 업무 400(토스 메시지 · code) / 일시 503 / 결제 없음(조회 null · 취소 400).
 * 세팅: docs/guides/toss-setup.md
 */
@Injectable()
export class TossPaymentGateway implements PaymentGatewayInterface, OnApplicationBootstrap {
    private readonly logger = new Logger(TossPaymentGateway.name);

    /**
     * TOSS_SECRET_KEY 가 비어 있으면 부팅 때 한 번 경고한다. 부팅은 막지 않고 결제 요청만 실패한다.
     */
    onApplicationBootstrap(): void {
        if (!process.env.TOSS_SECRET_KEY) {
            this.logger.warn('TOSS_SECRET_KEY 가 비어 있어 결제를 확인 · 환불할 수 없습니다 — docs/guides/toss-setup.md');
        }
    }

    /**
     * 결제 환경 — 시크릿 키가 test_ 로 시작하면 TEST, 아니면 LIVE.
     *
     * @returns TEST | LIVE
     */
    environment(): PaymentEnvironment {
        return this.secretKey().startsWith('test_') ? 'TEST' : 'LIVE';
    }

    /**
     * 결제 키로 결제를 읽는다.
     *
     * @param payment_key 토스 결제 키
     * @returns 결제 — 없으면 null
     */
    async getPayment(payment_key: string): Promise<PaymentLookupResult | null> {
        return this.lookup(`/v1/payments/${encodeURIComponent(payment_key)}`);
    }

    /**
     * 주문번호(우리 payment_id)로 결제를 읽는다.
     *
     * @param payment_id 우리 결제 ID(= 토스 orderId)
     * @returns 결제 — 없으면 null
     */
    async findByPaymentId(payment_id: string): Promise<PaymentLookupResult | null> {
        return this.lookup(`/v1/payments/orders/${encodeURIComponent(payment_id)}`);
    }

    /**
     * 전액 취소(환불).
     *
     * @param input 결제 ID · 결제 키 · 사유
     * @returns 취소 금액 · 시각
     */
    async cancel(input: PaymentCancelInput): Promise<PaymentCancelResult> {
        const response = await this.request('POST', `/v1/payments/${encodeURIComponent(input.payment_key)}/cancel`, {cancelReason: input.reason}, `cancel-${input.payment_id}`);
        if (!response.ok) {
            throw this.toException(response, '환불');
        }
        const cancels = (response.body as TossPayment).cancels ?? [];
        const last = cancels[cancels.length - 1];
        return {canceled_amount: last?.cancelAmount ?? 0, canceled_at: last ? dayjs(last.canceledAt).toDate() : new Date()};
    }

    /**
     * 조회 요청 — 결제 없음(404 NOT_FOUND_PAYMENT)은 null.
     *
     * @param path API 경로
     * @returns 결제 또는 null
     */
    private async lookup(path: string): Promise<PaymentLookupResult | null> {
        const response = await this.request('GET', path);
        if (response.ok) {
            return toLookupResult(response.body as TossPayment);
        }
        if (classifyTossFailure(response.status, response.body).kind === 'NOT_FOUND') {
            return null;
        }
        throw this.toException(response, '조회');
    }

    /**
     * 토스 API 1번 — 닿지 못하거나 시간이 넘으면(본문 읽기 포함) 503.
     *
     * @param method HTTP 메서드
     * @param path API 경로
     * @param body 요청 본문(POST)
     * @param idempotency_key 멱등키(POST)
     * @returns 상태 코드 · 성공 여부 · 본문
     */
    private async request(method: 'GET' | 'POST', path: string, body?: object, idempotency_key?: string): Promise<TossResponse> {
        const headers: Record<string, string> = {authorization: `Basic ${Buffer.from(`${this.secretKey()}:`).toString('base64')}`};
        const init: RequestInit = {method, headers, signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS)};
        if (body !== undefined) {
            headers['content-type'] = 'application/json';
            init.body = JSON.stringify(body);
        }
        if (idempotency_key) {
            headers['idempotency-key'] = idempotency_key;
        }
        let response: Response;
        let text: string;
        try {
            response = await fetch(`${TOSS_API_BASE_URL}${path}`, init);
            text = await response.text();
        } catch (error) {
            this.logger.error(`토스 요청 실패(${method} ${path}): ${(error as Error)?.message ?? error}`);
            throw new ServiceUnavailableException({message: PAYMENT_UNAVAILABLE_MESSAGE});
        }
        let parsed: unknown = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = null;
        }
        return {status: response.status, ok: response.ok, body: parsed};
    }

    /**
     * 실패 응답을 예외로 바꾼다 — 업무 실패 400(토스 메시지 · payment_error_code), 일시 실패 · 결제 없음 외 분류는 503.
     * 취소의 결제 없음(404)은 업무 실패로 본다.
     *
     * @param response 토스 응답
     * @param action 로그에 남길 동작 이름
     * @returns 던질 예외
     */
    private toException(response: TossResponse, action: string): BadRequestException | ServiceUnavailableException {
        const failure = classifyTossFailure(response.status, response.body);
        if (failure.kind === 'RETRY') {
            this.logger.error(`토스 ${action} 일시 실패: ${response.status} ${failure.code ?? ''} ${failure.message ?? ''}`);
            return new ServiceUnavailableException({message: PAYMENT_UNAVAILABLE_MESSAGE});
        }
        return new BadRequestException({message: failure.message ?? PAYMENT_FAILED_MESSAGE, payment_error_code: failure.code});
    }

    /**
     * 시크릿 키 — 없으면 503.
     *
     * @returns TOSS_SECRET_KEY
     */
    private secretKey(): string {
        const key = process.env.TOSS_SECRET_KEY;
        if (!key) {
            throw new ServiceUnavailableException({message: PAYMENT_UNAVAILABLE_MESSAGE});
        }
        return key;
    }
}
