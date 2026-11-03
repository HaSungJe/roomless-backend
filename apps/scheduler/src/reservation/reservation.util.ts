import {BadRequestException} from '@nestjs/common';
import {PAYMENT_STATE, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';

/** 결제 대기 전환 — 결제 · 구간 · 예약에 쓸 엔티티 */
export interface PendingTransition {
    payment: PaymentEntity;
    detail: ReservationDetailEntity;
    reservation: ReservationEntity;
}

/**
 * 결제 대기 → 확정 — 토스에서 승인된 결제.
 *
 * @param lookup 토스 조회 결과
 * @param now 지금(승인 시각이 없을 때)
 * @returns 결제 DONE · 구간 · 예약 CONFIRMED
 */
export function buildConfirmTransition(lookup: PaymentLookupResult, now: Date): PendingTransition {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.DONE;
    payment.payment_key = lookup.payment_key;
    payment.method = lookup.method;
    payment.approved_at = lookup.approved_at ?? now;
    payment.receipt_url = lookup.receipt_url;
    return {payment, ...buildStateEntities(RESERVATION_STATE.CONFIRMED)};
}

/**
 * 결제 대기 → 만료 — 승인된 결제가 없다.
 *
 * @returns 결제 · 구간 · 예약 EXPIRED
 */
export function buildExpireTransition(): PendingTransition {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.EXPIRED;
    return {payment, ...buildStateEntities(RESERVATION_STATE.EXPIRED)};
}

/**
 * 결제 대기 → 환불 신청 + 만료 — 승인됐지만 금액이 다르다.
 *
 * @param lookup 토스 조회 결과
 * @param reason 환불 사유
 * @param now 지금
 * @returns 결제 REFUND_REQUESTED · 구간 · 예약 EXPIRED
 */
export function buildRefundTransition(lookup: PaymentLookupResult, reason: string, now: Date): PendingTransition {
    return {payment: buildRefundRequest(lookup, reason, now), ...buildStateEntities(RESERVATION_STATE.EXPIRED)};
}

/**
 * 환불 신청 결제 — 토스가 받은 금액 전액(승인 키 · 시각 포함 — CHK_Payment_Approved).
 *
 * @param lookup 토스 조회 결과
 * @param reason 환불 사유
 * @param now 지금
 * @returns 결제 REFUND_REQUESTED
 */
export function buildRefundRequest(lookup: PaymentLookupResult, reason: string, now: Date): PaymentEntity {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
    payment.payment_key = lookup.payment_key;
    payment.method = lookup.method;
    payment.approved_at = lookup.approved_at ?? now;
    payment.receipt_url = lookup.receipt_url;
    payment.refund_amount = lookup.total_amount;
    payment.refund_reason = reason;
    payment.refund_requested_at = now;
    return payment;
}

/**
 * 환불 완료 결제.
 *
 * @param refunded_at 토스 취소 시각
 * @returns 결제 REFUNDED
 */
export function buildRefunded(refunded_at: Date): PaymentEntity {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.REFUNDED;
    payment.refunded_at = refunded_at;
    return payment;
}

/**
 * 환불 실패 결제 — 토스 업무 실패(400)의 code · message(CHK_Payment_Failure — 메시지 필수).
 *
 * @param error 결제 포트의 업무 실패
 * @returns 결제 REFUND_FAILED
 */
export function buildRefundFailed(error: BadRequestException): PaymentEntity {
    const body = error.getResponse() as {message?: unknown; payment_error_code?: unknown};
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.REFUND_FAILED;
    payment.failure_code = typeof body.payment_error_code === 'string' ? body.payment_error_code : null;
    payment.failure_message = typeof body.message === 'string' ? body.message.slice(0, 255) : error.message.slice(0, 255);
    return payment;
}

/**
 * 구간 · 예약 상태 엔티티.
 *
 * @param state 바꿀 예약 상태
 * @returns 구간 · 예약
 */
function buildStateEntities(state: string): {detail: ReservationDetailEntity; reservation: ReservationEntity} {
    const detail = new ReservationDetailEntity();
    detail.reservation_state_id = state;
    const reservation = new ReservationEntity();
    reservation.reservation_state_id = state;
    return {detail, reservation};
}
