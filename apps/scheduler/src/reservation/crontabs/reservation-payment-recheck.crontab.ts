import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {dayjs} from '@app/common/utils/dayjs.js';
import {PAYMENT_STATE, RESERVATION_REFUND_REASON} from '@app/contracts/reservation/reservation.constants.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {PAYMENT_GATEWAY} from '@app/integration/integration.symbols.js';
import {verifyPaymentLookup} from '@app/integration/integration.util.js';
import type {PaymentGatewayInterface, PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';
import {buildRefundRequest} from '../reservation.util.js';

/** 늦은 승인 재확인 잠금 키 */
export const RESERVATION_PAYMENT_RECHECK_LOCK = 'reservation.payment-recheck';

/** 만료 뒤 다시 확인하는 시간(분) — 토스 인증은 최대 30분 유효하다 */
const RESERVATION_PAYMENT_RECHECK_MINUTES = 30;

/**
 * 늦은 승인 재확인 스케줄러 — 결제 대기가 만료 · 취소된 뒤 프론트가 토스에서 늦게 승인한 결제를 찾아 환불 신청한다(만료 후 30분 동안).
 * 결제 확인 요청이 오면 그쪽이 먼저 환불 신청하고, 오지 않아도 여기서 잡는다 — 돈만 빠지는 일이 없게.
 */
@Injectable()
export class ReservationPaymentRecheckCrontab {
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
     * 5분마다(운영 전용) — 30분 안에 만료된 결제를 다시 조회해 승인됐으면 환불 신청한다.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async recheckExpiredPayments(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_PAYMENT_RECHECK_LOCK, async () => {
            const now = new Date();
            const payments = await this.reservationRepository.findRecheckPayments(dayjs(now).subtract(RESERVATION_PAYMENT_RECHECK_MINUTES, 'minute').toDate());
            for (const payment of payments) {
                try {
                    const lookup = await this.paymentGateway.findByPaymentId(payment.payment_id);
                    const verdict = verifyPaymentLookup(lookup, payment.payment_id, payment.amount);
                    if (verdict === 'PAID' || verdict === 'MISMATCH') {
                        await this.reservationRepository.updatePayment(
                            payment.payment_id,
                            PAYMENT_STATE.EXPIRED,
                            buildRefundRequest(lookup as PaymentLookupResult, RESERVATION_REFUND_REASON.LATE_PAYMENT, now),
                        );
                    }
                } catch {
                    // 토스 503 · 건별 실패는 건너뛰고 다음 회차에 다시 본다
                }
            }
        });
    }
}
