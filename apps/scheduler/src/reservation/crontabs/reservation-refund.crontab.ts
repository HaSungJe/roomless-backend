import {BadRequestException, Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {PAYMENT_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {PAYMENT_GATEWAY} from '@app/integration/integration.symbols.js';
import type {PaymentGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';
import {buildRefundFailed, buildRefunded} from '../reservation.util.js';

/** 환불 처리 잠금 키 */
export const RESERVATION_REFUND_LOCK = 'reservation.refund';

/**
 * 환불 처리 스케줄러 — 환불 신청(REFUND_REQUESTED) 결제를 토스 취소로 환불한다(백그라운드 환불 — 사용자 결정 2026-10-29).
 * 금액은 결제의 refund_amount(전액 또는 일부), 멱등키 cancel-<payment_id> 라 다시 돌아도 한 번만 취소된다.
 * 업무 실패(400)는 REFUND_FAILED(관리자가 따로 처리), 일시 실패(503)는 건너뛰고 다음 회차에 다시 한다.
 */
@Injectable()
export class ReservationRefundCrontab {
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
     * 1분마다(운영 전용) — 환불 신청 결제를 토스로 환불한다.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async refundRequestedPayments(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_REFUND_LOCK, async () => {
            const payments = await this.reservationRepository.findRefundRequestedPayments();
            for (const payment of payments) {
                try {
                    const result = await this.paymentGateway.cancel({
                        payment_id: payment.payment_id,
                        payment_key: payment.payment_key as string,
                        reason: payment.refund_reason as string,
                        amount: payment.refund_amount as number,
                    });
                    await this.reservationRepository.updatePayment(payment.payment_id, PAYMENT_STATE.REFUND_REQUESTED, buildRefunded(result.canceled_at));
                } catch (error) {
                    if (error instanceof BadRequestException) {
                        await this.reservationRepository.updatePayment(payment.payment_id, PAYMENT_STATE.REFUND_REQUESTED, buildRefundFailed(error)).catch(() => false);
                    }
                    // 일시 실패(503) · 건별 실패는 건너뛰고 다음 회차에 다시 한다
                }
            }
        });
    }
}
