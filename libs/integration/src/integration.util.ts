import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import {TOSS_PAYMENT_STATUS_DONE} from './integration.constants.js';
import type {PaymentLookupResult} from './interfaces/integration.interface.js';

/** 문 시각 형식 — 한국 시각 yyyyMMddHHmmss (Redis 문 정보의 시각 칸) */
const DOOR_TIME_FORMAT = 'YYYYMMDDHHmmss';

/**
 * 문을 열거나 닫은 시각 — 한국 시각 `yyyyMMddHHmmss`(밀리초는 버린다). admin-service(바로 열기 · 문 소켓 QR 확인 · 잠금)가 쓴다.
 *
 * @param at 시각
 * @returns 예: 20261101022459
 */
export function toDoorTime(at: Date): string {
    return dayjs(at).tz(KST_TIMEZONE).format(DOOR_TIME_FORMAT);
}

/**
 * 국내 휴대폰 번호를 E.164 로 바꾼다 — `010-1234-5678` · `01012345678` → `+821012345678`.
 * 이미 `+` 로 시작하면 국가번호가 붙은 것으로 보고 숫자만 남긴다. 번호 형식 검증은 입력 DTO 몫이다.
 *
 * @param phone 휴대폰 번호
 * @returns E.164 번호
 */
export function toE164KrPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (phone.trim().startsWith('+')) {
        return `+${digits}`;
    }
    return `+82${digits.replace(/^0/, '')}`;
}

/** 토스가 4xx 로 돌려줘도 잠시 뒤 다시 하면 되는 오류 코드 */
const TOSS_RETRYABLE_ERROR_CODES = new Set(['PROVIDER_ERROR', 'IDEMPOTENT_REQUEST_PROCESSING']);

/** 토스 실패 분류 — BUSINESS: 업무 실패(400, 재시도 없음), RETRY: 일시 실패(503, 재시도), NOT_FOUND: 결제 없음 */
export interface TossFailure {
    /** 분류 */
    kind: 'BUSINESS' | 'RETRY' | 'NOT_FOUND';
    /** 토스 오류 코드 — 본문에 없으면 null */
    code: string | null;
    /** 토스 오류 메시지 — 본문에 없으면 null */
    message: string | null;
}

/**
 * 토스 오류 응답을 분류한다 — 404 NOT_FOUND_PAYMENT 는 결제 없음, 5xx · 401(우리 키) · 409(처리 중) · 재시도 코드는 일시 실패, 그 밖 4xx 는 업무 실패.
 * 네트워크 오류 · 시간 초과는 응답이 없어 어댑터가 따로 503 으로 바꾼다.
 *
 * @param status HTTP 상태 코드(2xx 가 아닌 값)
 * @param body 응답 본문(JSON 이 아니면 null)
 * @returns 분류 · 토스 code · message
 */
export function classifyTossFailure(status: number, body: unknown): TossFailure {
    const error = body !== null && typeof body === 'object' ? (body as {code?: unknown; message?: unknown}) : {};
    const code = typeof error.code === 'string' ? error.code : null;
    const message = typeof error.message === 'string' ? error.message : null;
    if (status === 404 && code === 'NOT_FOUND_PAYMENT') {
        return {kind: 'NOT_FOUND', code, message};
    }
    if (status >= 500 || status === 401 || status === 409 || (code !== null && TOSS_RETRYABLE_ERROR_CODES.has(code))) {
        return {kind: 'RETRY', code, message};
    }
    return {kind: 'BUSINESS', code, message};
}

/** 토스 조회 대조 결과 — PAID: 결제됨, NOT_PAID: 미결제(없음 · 승인 전 · 취소 · 중단), MISMATCH: 금액 다름(환불), FOREIGN: 다른 주문의 결제(환불하지 않는다) */
export type PaymentLookupVerdict = 'PAID' | 'NOT_PAID' | 'MISMATCH' | 'FOREIGN';

/**
 * 토스에서 다시 읽은 결제를 우리 결제 행과 대조한다 — 결제 확인(user-service) · 결제 대기 만료(scheduler)가 같은 판정을 쓴다.
 * 승인 완료(DONE)가 아니면 미결제, 주문번호가 다르면 다른 주문(다른 이용자일 수 있어 환불하지 않는다), 금액이 다르면 불일치(환불).
 *
 * @param lookup 토스 조회 결과(없으면 null)
 * @param payment_id 우리 결제 ID(= 토스 orderId)
 * @param amount 우리 결제 금액(원)
 * @returns 대조 결과
 */
export function verifyPaymentLookup(lookup: PaymentLookupResult | null, payment_id: string, amount: number): PaymentLookupVerdict {
    if (!lookup || lookup.status !== TOSS_PAYMENT_STATUS_DONE) {
        return 'NOT_PAID';
    }
    if (lookup.order_id !== payment_id) {
        return 'FOREIGN';
    }
    if (lookup.total_amount !== amount) {
        return 'MISMATCH';
    }
    return 'PAID';
}
