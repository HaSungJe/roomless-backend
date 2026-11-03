import type {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import type {PendingTransition} from '../reservation.util.js';

/** 결제 대기가 끝난 기본 구간 행 — 구간 + 결제(QueryBuilder raw) */
export interface ExpiredPendingRow {
    reservation_id: string;
    payment_id: string;
    amount: number;
}

/**
 * 예약 repository 포트(scheduler) — 결제 대기 만료 · 늦은 승인 · 환불 crontab 의 데이터 접근. 상태 전환은 상태 조건을 건다(두 번 돌아도 같은 결과).
 */
export interface ReservationRepositoryInterface {
    /** 결제 대기 만료 시각이 지난 기본 구간(구간 PENDING · 결제 READY) */
    findExpiredPendingRows(now: Date): Promise<ExpiredPendingRow[]>;
    /** 결제 대기 전환 — 결제(READY) → 구간(PENDING) → 예약(PENDING) 을 한 트랜잭션으로, 결제가 이미 바뀌었으면 false */
    transitionPending(row: ExpiredPendingRow, transition: PendingTransition): Promise<boolean>;
    /** 다시 확인할 만료 결제 — 결제 EXPIRED · since 뒤에 바뀜 */
    findRecheckPayments(since: Date): Promise<PaymentEntity[]>;
    /** 환불 신청 결제 */
    findRefundRequestedPayments(): Promise<PaymentEntity[]>;
    /** 결제 수정 — 상태 조건(from_state)을 건 쓰기, 1행이면 true */
    updatePayment(payment_id: string, from_state: string, entity: PaymentEntity): Promise<boolean>;
}
