/** reservation 내부 HTTP 경로 접두 */
const RESERVATION_INTERNAL_BASE = '/internal/v1/user-service/reservation';

/**
 * reservation 도메인 RabbitMQ 명령 종류 (= 라우팅 키, user-service 의 q.user.cmd 가 `user.#` 로 받는다).
 * 예약 생성 · 결제 확인 · 취소는 이용자, 업체 취소 · 호실 이동은 매니저(업체 총관리자 · 업체 관리자 — 내 업체 예약만)다. 조회는 내부 HTTP 동기 경로다.
 */
export const RESERVATION_COMMAND = {
    /** 예약 생성 — 결제 대기 5분 (이용자) */
    CREATE: 'user.reservation.create',
    /** 결제 확인 — 토스 승인 결과를 토스 조회로 대조해 확정 (이용자) */
    PAYMENT_CONFIRM: 'user.reservation.payment-confirm',
    /** 이용자 취소 — 환불 규정대로 (이용자) */
    CANCEL: 'user.reservation.cancel',
    /** 업체 취소 — 100% 환불 + 이용자 SMS (매니저) */
    STORE_CANCEL: 'user.reservation.store-cancel',
    /** 호실 이동 — 같은 그룹 + 이용자 SMS (매니저) */
    ROOM_CHANGE: 'user.reservation.room-change',
} as const;

/**
 * reservation 도메인 내부 HTTP 경로 (게이트웨이 → user-service). 파라미터가 있는 경로는 함수로 만든다.
 */
export const RESERVATION_INTERNAL_PATH = {
    /** 호실별 예약 가능 시간 (GET, 인증 없음) */
    AVAILABILITY: `${RESERVATION_INTERNAL_BASE}/availability`,
    /** 내 예약 목록 (GET, 이용자) */
    LIST: RESERVATION_INTERNAL_BASE,
    /** 내 업체 예약 현황 (GET, 매니저) */
    STORE: `${RESERVATION_INTERNAL_BASE}/store`,
    /** 내 예약 상세 (GET, 이용자) */
    detail: (reservation_id: string) => `${RESERVATION_INTERNAL_BASE}/${encodeURIComponent(reservation_id)}`,
} as const;
