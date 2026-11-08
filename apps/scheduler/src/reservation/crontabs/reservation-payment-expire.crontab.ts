import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {RESERVATION_DETAIL_TYPE, RESERVATION_REFUND_REASON, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {PAYMENT_GATEWAY} from '@app/integration/integration.symbols.js';
import {verifyPaymentLookup} from '@app/integration/integration.util.js';
import type {PaymentGatewayInterface, PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';
import {
    buildConfirmTransition,
    buildExpireTransition,
    buildExtensionConfirmTransition,
    buildExtensionExpireTransition,
    buildExtensionRefundTransition,
    buildRefundTransition,
} from '../reservation.util.js';

/** 결제 대기 만료 잠금 키 */
export const RESERVATION_PAYMENT_EXPIRE_LOCK = 'reservation.payment-expire';

/**
 * 결제 대기 만료 스케줄러 — 결제 대기 5분이 지난 예약을 토스 주문번호 조회로 가른다(사용자 결정 2026-11-03).
 * 토스는 승인된 결제만 조회 · 취소하므로 "취소 요청"이 아니라 조회로 판단한다 — 결제됨은 확정, 금액 다름은 환불 신청 + 만료, 미결제는 만료(호실이 풀린다).
 * 연장 구간(사용자 결정 2026-11-09)은 예약이 확정 · 이용 중이고 결제됨이면 확정(끝 · 합계 · QR 유효 끝), 금액 다름 · 예약이 끝났는데 결제됨은 환불 신청, 미결제는 만료 — 둘 다 잡아 둔 구간을 되돌리고 그 예약은 다시 연장할 수 없다.
 * 토스 503 · 건별 실패는 건너뛰고 다음 회차에 다시 본다(대상은 상태로 고르므로 두 번 돌아도 같은 결과).
 */
@Injectable()
export class ReservationPaymentExpireCrontab {
    /**
     * @param reservationRepository 예약 repository 포트
     * @param paymentGateway 결제 포트(토스)
     * @param jobLock 인스턴스 1대 실행 잠금
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayInterface,
        private readonly jobLock: JobLockService,
    ) {}

    /**
     * 1분마다(운영 전용) — 만료 시각이 지난 결제 대기를 확정 · 만료 · 환불 신청으로 정리한다.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async expirePendingPayments(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_PAYMENT_EXPIRE_LOCK, async () => {
            const now = new Date();
            const rows = await this.reservationRepository.findExpiredPendingRows(now);
            for (const row of rows) {
                try {
                    const lookup = await this.paymentGateway.findByPaymentId(row.payment_id);
                    const verdict = verifyPaymentLookup(lookup, row.payment_id, row.amount);
                    if (row.reservation_detail_type_id === RESERVATION_DETAIL_TYPE.EXTENSION) {
                        const active = row.reservation_state_id === RESERVATION_STATE.CONFIRMED || row.reservation_state_id === RESERVATION_STATE.CHECKED_IN;
                        if (verdict === 'PAID' && active) {
                            await this.reservationRepository.transitionExtension(row, buildExtensionConfirmTransition(lookup as PaymentLookupResult, row, now));
                        } else if (verdict === 'PAID' || verdict === 'MISMATCH') {
                            const reason = verdict === 'MISMATCH' ? RESERVATION_REFUND_REASON.AMOUNT_MISMATCH : RESERVATION_REFUND_REASON.LATE_PAYMENT;
                            await this.reservationRepository.transitionExtension(row, buildExtensionRefundTransition(lookup as PaymentLookupResult, reason, row, now));
                        } else {
                            await this.reservationRepository.transitionExtension(row, buildExtensionExpireTransition(row));
                        }
                    } else if (verdict === 'PAID') {
                        await this.reservationRepository.transitionPending(row, buildConfirmTransition(lookup as PaymentLookupResult, now));
                    } else if (verdict === 'MISMATCH') {
                        await this.reservationRepository.transitionPending(row, buildRefundTransition(lookup as PaymentLookupResult, RESERVATION_REFUND_REASON.AMOUNT_MISMATCH, now));
                    } else {
                        await this.reservationRepository.transitionPending(row, buildExpireTransition());
                    }
                } catch {
                    // 토스 503 · 건별 실패는 건너뛰고 다음 회차에 다시 본다
                }
            }
        });
    }
}
