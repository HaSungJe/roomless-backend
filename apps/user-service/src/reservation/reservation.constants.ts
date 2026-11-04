import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';

/** 상품 종류 — 룩업 t_room_plan_type 과 같은 값(room 도메인 상수와 같지만 도메인끼리 import 하지 않는다) */
export const RESERVATION_PLAN_TYPE = {HOURLY: 'HOURLY', NIGHT: 'NIGHT', LONG: 'LONG'} as const;

/** 상품 종류명 — 주문명 · SMS 에 쓴다(룩업 이름과 같다) */
export const RESERVATION_PLAN_TYPE_NAME: Record<string, string> = {HOURLY: '시간 이용', NIGHT: '1박', LONG: '연박'};

/** 호실 상태 — 예약가능(즉시 입실 조건) · 사용중지(예약 불가) */
export const RESERVATION_ROOM_STATE = {AVAILABLE: 'AVAILABLE', DISABLED: 'DISABLED'} as const;

/** 예약을 받는 업체 상태 — 활성 */
export const RESERVATION_STORE_STATE_ACTIVE = 'ACTIVE';

/** 업체 예약 현황에 나오는 예약 상태 — 결제 대기 · 확정 · 이용 중 · 이용 완료 */
export const RESERVATION_STORE_VISIBLE_STATES: string[] = [RESERVATION_STATE.PENDING, RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN, RESERVATION_STATE.COMPLETED];

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

/** 매니저의 소속 업체를 찾을 수 없음 */
export const RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';

/** 없는 날짜 */
export const RESERVATION_DATE_INVALID_MESSAGE = '없는 날짜입니다.';

/** 같은 호실의 점유 예약과 겹침 — 배타 제약 23P01 */
export const RESERVATION_TIME_TAKEN_MESSAGE = '이미 예약된 시간입니다.';

/** 옮길 호실의 점유 예약과 겹침 — 배타 제약 23P01 */
export const RESERVATION_ROOM_TAKEN_MESSAGE = '옮길 호실에 겹치는 예약이 있습니다.';

/** 상태 조건을 건 쓰기가 0행 — 그 사이 바뀌었다(crontab · 다른 요청) */
export const RESERVATION_STATE_CHANGED_MESSAGE = '예약 상태가 바뀌었습니다. 다시 확인해주세요.';

/** 취소할 수 없는 상태 */
export const RESERVATION_NOT_CANCELABLE_MESSAGE = '취소할 수 없는 예약입니다.';

/** 결제를 찾을 수 없음 */
export const RESERVATION_PAYMENT_NOT_FOUND_MESSAGE = '결제를 찾을 수 없습니다.';

/** QR 을 내주는 예약 상태 — 확정 · 이용 중 */
export const RESERVATION_QR_STATES: string[] = [RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN];
