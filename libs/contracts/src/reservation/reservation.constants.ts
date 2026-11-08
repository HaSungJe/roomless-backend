/**
 * 예약 · 결제 공통 값 — user-service(이용자 예약) · admin-service(업체 예약 · 호실 삭제 확인) · scheduler(만료 · 환불 crontab)가 함께 쓰고 API 응답 값이기도 하다.
 * 값은 룩업 시드(libs/database/src/seeder/seeder.targets.ts)와 같다.
 */

/** 예약 상태(t_reservation_state) — 예약 · 구간 */
export const RESERVATION_STATE = {PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', CHECKED_IN: 'CHECKED_IN', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED', EXPIRED: 'EXPIRED'} as const;

/** 호실을 점유하는 예약 상태 — 배타 제약 EXC_Reservation_RoomIdBlockedRange 의 WHERE 와 같다 */
export const RESERVATION_OCCUPYING_STATES: string[] = [RESERVATION_STATE.PENDING, RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN];

/** 예약 구간 종류(t_reservation_detail_type) */
export const RESERVATION_DETAIL_TYPE = {BASE: 'BASE', EXTENSION: 'EXTENSION'} as const;

/** 결제 상태(t_payment_state) */
export const PAYMENT_STATE = {READY: 'READY', DONE: 'DONE', FAILED: 'FAILED', EXPIRED: 'EXPIRED', REFUND_REQUESTED: 'REFUND_REQUESTED', REFUNDED: 'REFUNDED', REFUND_FAILED: 'REFUND_FAILED'} as const;

/** 취소 주체 — USER: 이용자, STORE: 업체 (CHK_Reservation_Cancel) */
export const RESERVATION_CANCEL_ACTOR = {USER: 'USER', STORE: 'STORE'} as const;

/** 결제 대기 유지 시간(분) — 예약 생성 뒤 이 시간 안에 결제가 확인되지 않으면 만료(사용자 결정 2026-11-03) */
export const RESERVATION_PAYMENT_PENDING_MINUTES = 5;

/** 결제 대기 만료 뒤 같은 이용자가 같은 호실을 다시 예약할 수 없는 시간(분) — 만료 시각(expires_at)부터 */
export const RESERVATION_REBOOK_BLOCK_MINUTES = 10;

/** 토스 환불 사유(cancelReason — 200자) — t_payment.refund_reason */
export const RESERVATION_REFUND_REASON = {
    USER: '이용자 예약 취소',
    STORE: '업체 예약 취소',
    DISABLED_ROOM: '사용중지 호실 취소',
    AMOUNT_MISMATCH: '결제 금액 불일치',
    LATE_PAYMENT: '결제 대기 시간 경과',
} as const;

/**
 * 이용 전환의 호실 상태 — 시작은 예약가능 · 예약완료 · 정비중일 때만 사용중(사용중지 · 사용중은 그대로), 끝 · 이용 중 업체 취소는 사용중일 때만 정비중.
 * 체크인 · 체크아웃 없이 예약 시간이 곧 이용이다 — user-service(결제 확인 · 내 예약 QR · 취소 동의 승인) · scheduler(이용 전환 crontab) 공통(사용자 결정 2026-11-07).
 */
export const USAGE_ROOM_STATE = {IN_USE: 'IN_USE', MAINTENANCE: 'MAINTENANCE', START_FROM: ['AVAILABLE', 'RESERVED', 'MAINTENANCE']} as const;

/** 이용 중 취소 요청 상태(t_reservation_cancel_request_state) — 요청 중인데 만료 시각이 지나면 읽을 때 만료로 본다 */
export const RESERVATION_CANCEL_REQUEST_STATE = {REQUESTED: 'REQUESTED', APPROVED: 'APPROVED', REJECTED: 'REJECTED', EXPIRED: 'EXPIRED'} as const;

/** 이용 중 취소 요청 유효 시간(분) — 예약 끝이 먼저면 예약 끝까지(사용자 결정 2026-11-07) */
export const RESERVATION_CANCEL_REQUEST_MINUTES = 10;
