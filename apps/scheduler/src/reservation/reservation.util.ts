import {BadRequestException} from '@nestjs/common';
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import {generateId} from '@app/common/utils/id.js';
import {PAYMENT_STATE, RESERVATION_STATE, USAGE_ROOM_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';
import type {ExpiredPendingRow, UsageRow} from './interfaces/reservation.repository.interface.js';

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

/** 연장 결제 대기 전환 — 결제 · 구간 · 예약(확정: 끝 · 합계, 그 밖: 점유 끝 되돌림) · QR(확정만 — 유효 끝 = 연장 끝) */
export interface ExtensionTransition {
    payment: PaymentEntity;
    detail: ReservationDetailEntity;
    reservation: ReservationEntity;
    room_qr: RoomQrEntity | null;
}

/**
 * 연장 결제 대기 → 확정 — 토스에서 승인된 결제 · 예약이 확정 · 이용 중. 문 쪽 Redis QR 은 QR 동기화가 1분 안에 새 유효 끝으로 맞춘다.
 *
 * @param lookup 토스 조회 결과
 * @param row 연장 구간 행
 * @param now 지금(승인 시각이 없을 때)
 * @returns 결제 DONE · 구간 CONFIRMED · 예약 끝 = 연장 끝 · 합계 + 연장 금액 · QR 유효 끝 = 연장 끝
 */
export function buildExtensionConfirmTransition(lookup: PaymentLookupResult, row: ExpiredPendingRow, now: Date): ExtensionTransition {
    const {payment} = buildConfirmTransition(lookup, now);
    const detail = new ReservationDetailEntity();
    detail.reservation_state_id = RESERVATION_STATE.CONFIRMED;
    const reservation = new ReservationEntity();
    reservation.end_at = row.detail_end_at;
    reservation.total_price = Number(row.total_price) + Number(row.price);
    const room_qr = new RoomQrEntity();
    room_qr.ends_at = row.detail_end_at;
    return {payment, detail, reservation, room_qr};
}

/**
 * 연장 결제 대기 → 환불 신청 + 만료 — 승인됐지만 금액이 다르거나, 예약이 더는 확정 · 이용 중이 아니다.
 *
 * @param lookup 토스 조회 결과
 * @param reason 환불 사유
 * @param row 연장 구간 행
 * @param now 지금
 * @returns 결제 REFUND_REQUESTED · 구간 EXPIRED · 점유 끝 되돌림
 */
export function buildExtensionRefundTransition(lookup: PaymentLookupResult, reason: string, row: ExpiredPendingRow, now: Date): ExtensionTransition {
    return {payment: buildRefundRequest(lookup, reason, now), ...buildExtensionRelease(row)};
}

/**
 * 연장 결제 대기 → 만료 — 승인된 결제가 없다(그 예약은 다시 연장할 수 없다).
 *
 * @param row 연장 구간 행
 * @returns 결제 EXPIRED · 구간 EXPIRED · 점유 끝 되돌림
 */
export function buildExtensionExpireTransition(row: ExpiredPendingRow): ExtensionTransition {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.EXPIRED;
    return {payment, ...buildExtensionRelease(row)};
}

/**
 * 연장을 놓은 구간 · 예약 — 구간 만료 · 점유 끝 = 지금 끝 + 정비시간(잡아 둔 연장 구간을 푼다).
 *
 * @param row 연장 구간 행
 * @returns 구간 EXPIRED · 예약 점유 끝 · QR 없음
 */
function buildExtensionRelease(row: ExpiredPendingRow): {detail: ReservationDetailEntity; reservation: ReservationEntity; room_qr: null} {
    const detail = new ReservationDetailEntity();
    detail.reservation_state_id = RESERVATION_STATE.EXPIRED;
    const reservation = new ReservationEntity();
    reservation.blocked_until = dayjs(row.reservation_end_at).add(Number(row.maintenance_minutes), 'minute').toDate();
    return {detail, reservation, room_qr: null};
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

/**
 * 이용이 시작된 예약의 QR — 유효 = 이용 시작 ~ 이용 끝, QR 은 32자 무작위(user-service 내 예약 QR 발급과 같은 값).
 *
 * @param row 이용 시작 · QR 맞추기 대상 예약
 * @returns QR 엔티티
 */
export function buildRoomQr(row: UsageRow): RoomQrEntity {
    const roomQr = new RoomQrEntity();
    roomQr.room_qr_id = generateId();
    roomQr.room_id = row.room_id;
    roomQr.reservation_id = row.reservation_id;
    roomQr.qr = generateId();
    roomQr.starts_at = row.start_at;
    roomQr.ends_at = row.end_at;
    return roomQr;
}

/** 이용 전환 — 예약 · 호실에 쓸 엔티티 */
export interface UsageTransition {
    reservation: ReservationEntity;
    room: RoomEntity;
}

/**
 * 이용 시작 — 예약 이용 중 · 호실 사용중(체크인 없이 시작 시각에 — 사용자 결정 2026-11-07).
 *
 * @returns 예약 CHECKED_IN · 호실 IN_USE
 */
export function buildUsageStartTransition(): UsageTransition {
    const reservation = new ReservationEntity();
    reservation.reservation_state_id = RESERVATION_STATE.CHECKED_IN;
    const room = new RoomEntity();
    room.room_state_id = USAGE_ROOM_STATE.IN_USE;
    return {reservation, room};
}

/**
 * 이용 종료 — 예약 이용 완료 · 호실 정비중(정비 뒤 업체가 예약가능으로 — 사용자 결정 2026-11-07).
 *
 * @returns 예약 COMPLETED · 호실 MAINTENANCE
 */
export function buildUsageEndTransition(): UsageTransition {
    const reservation = new ReservationEntity();
    reservation.reservation_state_id = RESERVATION_STATE.COMPLETED;
    const room = new RoomEntity();
    room.room_state_id = USAGE_ROOM_STATE.MAINTENANCE;
    return {reservation, room};
}

/**
 * QR 확인 링크 보냄 표시 — 보낸 시각(되돌릴 때는 null).
 *
 * @param sent_at 보낸 시각 또는 null
 * @returns 예약(qr_link_sent_at 만)
 */
export function buildQrLinkSent(sent_at: Date | null): ReservationEntity {
    const reservation = new ReservationEntity();
    reservation.qr_link_sent_at = sent_at;
    return reservation;
}

/**
 * QR 확인 링크 SMS — 예약 1건 화면 링크(QR 은 시작 시각부터 열린다 — 사용자 결정 2026-11-07).
 *
 * @param store_name 상호명
 * @param start_at 이용 시작
 * @param link 예약 화면 주소(`<USER_WEB_URL>/reservation/<예약 ID>`)
 * @returns 문구
 */
export function buildQrLinkSms(store_name: string, start_at: Date, link: string): string {
    return `[roomless] ${store_name} ${dayjs(start_at).tz(KST_TIMEZONE).format('M/D HH:mm')} 예약 — QR 확인: ${link}`;
}

/**
 * 이용자 화면 주소(USER_WEB_URL) — 끝의 / 를 뗀다. 비어 있으면 null(링크를 보내지 않는다).
 *
 * @returns 주소 또는 null
 */
export function readUserWebUrl(): string | null {
    const value = process.env.USER_WEB_URL?.trim().replace(/\/+$/, '');
    return value ? value : null;
}
