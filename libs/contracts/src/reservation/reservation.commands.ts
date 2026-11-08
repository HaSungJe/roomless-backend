/** reservation 내부 HTTP 경로 접두 — user-service (이용자) */
const RESERVATION_INTERNAL_BASE = '/internal/v1/user-service/reservation';

/** reservation 내부 HTTP 경로 접두 — admin-service (매니저) */
const RESERVATION_MANAGER_INTERNAL_BASE = '/internal/v1/admin-service/reservation';

/**
 * reservation 도메인 이용자 명령 종류 (= 라우팅 키, user-service 의 q.user.cmd 가 `user.#` 로 받는다) — 예약 생성 · 결제 확인 · 취소 · 이용 중 취소 요청 승인 · 거절 · 연장 신청. 조회는 내부 HTTP 동기 경로다.
 * 매니저의 업체 취소 · 호실 이동은 admin-service 의 RESERVATION_MANAGER_COMMAND 다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
export const RESERVATION_COMMAND = {
    /** 예약 생성 — 결제 대기 5분 (이용자) */
    CREATE: 'user.reservation.create',
    /** 결제 확인 — 토스 승인 결과를 토스 조회로 대조해 확정 (이용자) */
    PAYMENT_CONFIRM: 'user.reservation.payment-confirm',
    /** 이용자 취소 — 환불 규정대로 (이용자) */
    CANCEL: 'user.reservation.cancel',
    /** 이용 중 취소 요청 승인 — 업체 취소 · 100% 환불 (이용자) */
    CANCEL_REQUEST_APPROVE: 'user.reservation.cancel-request-approve',
    /** 이용 중 취소 요청 거절 — 예약은 그대로 (이용자) */
    CANCEL_REQUEST_REJECT: 'user.reservation.cancel-request-reject',
    /** 연장 신청 — 이용 중에만, 잡아 두기 + 결제 대기 5분 (이용자) */
    EXTEND: 'user.reservation.extend',
} as const;

/**
 * reservation 도메인 매니저 명령 종류 (= 라우팅 키, admin-service 의 q.admin.cmd 가 `admin.#` 로 받는다) — 업체 총관리자 · 업체 관리자가 내 업체 예약만 바꾼다.
 */
export const RESERVATION_MANAGER_COMMAND = {
    /** 업체 취소 — 시작 전 예약만, 100% 환불 + 이용자 SMS (매니저) */
    STORE_CANCEL: 'admin.reservation.store-cancel',
    /** 호실 이동 — 같은 그룹 + 이용자 SMS (매니저) */
    ROOM_CHANGE: 'admin.reservation.room-change',
    /** 이용 중 취소 요청 — 예약자 동의(승인 링크 SMS · 10분) (매니저) */
    USE_CANCEL_REQUEST: 'admin.reservation.use-cancel-request',
} as const;

/**
 * reservation 도메인 이용자 내부 HTTP 경로 (게이트웨이 → user-service). 파라미터가 있는 경로는 함수로 만든다.
 */
export const RESERVATION_INTERNAL_PATH = {
    /** 호실별 예약 가능 시간 (GET, 인증 없음) */
    AVAILABILITY: `${RESERVATION_INTERNAL_BASE}/availability`,
    /** 내 예약 목록 (GET, 이용자) */
    LIST: RESERVATION_INTERNAL_BASE,
    /** 내 예약 상세 (GET, 이용자) */
    detail: (reservation_id: string) => `${RESERVATION_INTERNAL_BASE}/${encodeURIComponent(reservation_id)}`,
    /** 내 예약 QR (GET, 이용자 — 이용 중에만 QR, 시작했는데 아직 확정이면 그 자리에서 이용 시작 · 발급) */
    qr: (reservation_id: string) => `${RESERVATION_INTERNAL_BASE}/${encodeURIComponent(reservation_id)}/qr`,
    /** 내 예약의 이용 중 취소 요청 (GET, 이용자 — 마지막 요청) */
    cancelRequest: (reservation_id: string) => `${RESERVATION_INTERNAL_BASE}/${encodeURIComponent(reservation_id)}/cancel-request`,
    /** 내 예약 연장 조회 (GET, 이용자 — 잡아 두지 않는다) */
    extension: (reservation_id: string) => `${RESERVATION_INTERNAL_BASE}/${encodeURIComponent(reservation_id)}/extension`,
} as const;

/**
 * reservation 도메인 매니저 내부 HTTP 경로 (게이트웨이 → admin-service).
 */
export const RESERVATION_MANAGER_INTERNAL_PATH = {
    /** 내 업체 예약 현황 (GET, 매니저) */
    STORE: `${RESERVATION_MANAGER_INTERNAL_BASE}/store`,
} as const;
