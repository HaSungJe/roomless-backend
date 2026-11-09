/** 상품 종류 — 룩업 t_room_plan_type 과 같은 값(room 도메인 상수와 같지만 도메인끼리 import 하지 않는다) */
export const RESERVATION_PLAN_TYPE = {HOURLY: 'HOURLY', NIGHT: 'NIGHT', LONG: 'LONG'} as const;

/** 상품 종류명 — 주문명 · SMS 에 쓴다(룩업 이름과 같다) */
export const RESERVATION_PLAN_TYPE_NAME: Record<string, string> = {HOURLY: '시간 이용', NIGHT: '1박', LONG: '연박'};

/** 호실 상태 — 예약가능(즉시 입실 조건) · 사용중지(예약 불가 · 이용자 전액 환불 취소) */
export const RESERVATION_ROOM_STATE = {AVAILABLE: 'AVAILABLE', DISABLED: 'DISABLED'} as const;

/** 예약을 받는 업체 상태 — 활성 */
export const RESERVATION_STORE_STATE_ACTIVE = 'ACTIVE';

/** 시간 이용 시작 시각 단위(분) — :00 · :30 (사용자 결정 2026-11-03) */
export const RESERVATION_HOURLY_STEP_MINUTES = 30;

/** 즉시 입실(분) — 시작이 지금부터 이 시간 안이면 호실이 예약가능일 때만 받는다 */
export const RESERVATION_IMMEDIATE_MINUTES = 30;

/** 날짜 형식 — 한국 날짜 */
export const RESERVATION_DATE_FORMAT = 'YYYY-MM-DD';

/** 토스 주문명 최대 길이 */
export const RESERVATION_ORDER_NAME_MAX_LENGTH = 100;

/** 예약을 찾을 수 없음 — 남의 예약 · 결제 대기 만료 건 포함 */
export const RESERVATION_NOT_FOUND_MESSAGE = '예약을 찾을 수 없습니다.';

/** 예약 업체를 찾을 수 없음 — 지워졌거나 활성이 아님 */
export const RESERVATION_STORE_NOT_FOUND_MESSAGE = '업체를 찾을 수 없습니다.';

/** 호실을 찾을 수 없음 */
export const RESERVATION_ROOM_NOT_FOUND_MESSAGE = '호실을 찾을 수 없습니다.';

/** 없는 날짜 */
export const RESERVATION_DATE_INVALID_MESSAGE = '없는 날짜입니다.';

/** 같은 호실의 점유 예약과 겹침 — 배타 제약 23P01 */
export const RESERVATION_TIME_TAKEN_MESSAGE = '이미 예약된 시간입니다.';

/** 상태 조건을 건 쓰기가 0행 — 그 사이 바뀌었다(crontab · 다른 요청) */
export const RESERVATION_STATE_CHANGED_MESSAGE = '예약 상태가 바뀌었습니다. 다시 확인해주세요.';

/** 취소할 수 없는 상태 */
export const RESERVATION_NOT_CANCELABLE_MESSAGE = '취소할 수 없는 예약입니다.';

/** 결제를 찾을 수 없음 */
export const RESERVATION_PAYMENT_NOT_FOUND_MESSAGE = '결제를 찾을 수 없습니다.';

/** QR 발급 뒤 다시 읽어도 없음 — 500 (내 예약 QR · 결제 확인) */
export const RESERVATION_QR_ISSUE_FAILED_MESSAGE = 'QR 정보를 발급하지 못했습니다. 관리자에게 문의해주세요.';

/** 이용 중 취소 요청이 없음 — 요청 조회 · 승인 · 거절 */
export const RESERVATION_CANCEL_REQUEST_NOT_FOUND_MESSAGE = '취소 요청이 없습니다.';

/** 승인 · 거절할 수 없는 요청 — 만료 · 이미 처리됨 */
export const RESERVATION_CANCEL_REQUEST_NOT_RESPONDABLE_MESSAGE = '승인할 수 없는 취소 요청입니다(만료 · 처리됨).';

/** 연장 — 이용 중이 아님(시작 전 · 끝남 · 취소 · 결제 대기) */
export const RESERVATION_EXTENSION_NOT_IN_USE_MESSAGE = '이용 중인 예약만 연장할 수 있습니다.';

/** 연장 — 결제하지 않아 만료된 연장이 있음(그 예약은 다시 연장할 수 없다 — 사용자 결정 2026-11-09) */
export const RESERVATION_EXTENSION_EXPIRED_MESSAGE = '결제하지 않은 연장이 있어 더 연장할 수 없습니다.';

/** 연장 — 결제 대기 중인 연장이 있음(판정 · 부분 유니크 UK_ReservationDetail_ReservationIdPending) */
export const RESERVATION_EXTENSION_PENDING_MESSAGE = '결제 대기 중인 연장이 있습니다.';

/** 연장 — 업체 영업중 아님 · 활성 아님 · 호실 사용중지 · 지운 업체 · 호실 */
export const RESERVATION_EXTENSION_UNAVAILABLE_MESSAGE = '지금은 연장할 수 없습니다.';

/** 연장 — 예약 상품이 연장 불가(업체 상품 설정 is_extendable 0) */
export const RESERVATION_EXTENSION_NOT_EXTENDABLE_MESSAGE = '연장할 수 없는 상품입니다.';

/** 연장 — 요금 상품(시간 이용 · 1박)을 팔지 않음 */
export const RESERVATION_EXTENSION_NOT_ON_SALE_MESSAGE = '연장 상품을 팔지 않는 업체입니다.';

/** 연장 — 영업시간 밖 · 브레이크 · 일시 예약불가 */
export const RESERVATION_EXTENSION_TIME_MESSAGE = '연장할 수 없는 시간입니다.';

/** 연장 — 다음 예약과 겹침(정비시간 포함 — 판정 · 배타 제약 EXC_Reservation_RoomIdBlockedRange) */
export const RESERVATION_EXTENSION_NEXT_RESERVATION_MESSAGE = '다음 예약이 있어 연장할 수 없습니다.';

/** 탈퇴 신청 중인 이용자의 예약 · 연장 — 정지 회원이 탈퇴 신청으로 제한을 피하지 못하게(사용자 결정 2026-11-09) */
export const RESERVATION_MEMBER_LEAVING_MESSAGE = '탈퇴 신청 중에는 예약할 수 없습니다.';

/** 예약할 수 있는 회원 상태 · 이용 제한 상태 */
export const RESERVATION_MEMBER_STATE = {ACTIVE: 'ACTIVE', BLOCK: 'BLOCK'} as const;
