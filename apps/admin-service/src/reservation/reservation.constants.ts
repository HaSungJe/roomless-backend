import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';

/** 호실 상태 — 사용중지(옮길 수 없는 호실) */
export const RESERVATION_ROOM_STATE_DISABLED = 'DISABLED';

/** 업체 탈퇴 상태 — 매니저의 소속 업체에서 뺀다 (store 도메인 상수는 import 하지 않는다) */
export const RESERVATION_STORE_STATE_LEAVE = 'LEAVE';

/** 업체 예약 현황에 나오는 예약 상태 — 결제 대기 · 확정 · 이용 중 · 이용 완료 */
export const RESERVATION_STORE_VISIBLE_STATES: string[] = [RESERVATION_STATE.PENDING, RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN, RESERVATION_STATE.COMPLETED];

/** 날짜 형식 — 한국 날짜 */
export const RESERVATION_DATE_FORMAT = 'YYYY-MM-DD';

/** 예약을 찾을 수 없음 — 다른 업체 예약 포함 */
export const RESERVATION_NOT_FOUND_MESSAGE = '예약을 찾을 수 없습니다.';

/** 호실을 찾을 수 없음 */
export const RESERVATION_ROOM_NOT_FOUND_MESSAGE = '호실을 찾을 수 없습니다.';

/** 매니저의 소속 업체를 찾을 수 없음 — 탈퇴 · 지운 업체 포함 */
export const RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';

/** 없는 날짜 */
export const RESERVATION_DATE_INVALID_MESSAGE = '없는 날짜입니다.';

/** 옮길 호실의 점유 예약과 겹침 — 배타 제약 23P01 */
export const RESERVATION_ROOM_TAKEN_MESSAGE = '옮길 호실에 겹치는 예약이 있습니다.';

/** 상태 조건을 건 쓰기가 0행 — 그 사이 바뀌었다(crontab · 다른 요청) */
export const RESERVATION_STATE_CHANGED_MESSAGE = '예약 상태가 바뀌었습니다. 다시 확인해주세요.';

/** 취소할 수 없는 상태 */
export const RESERVATION_NOT_CANCELABLE_MESSAGE = '취소할 수 없는 예약입니다.';

/** 이용자 화면 주소(USER_WEB_URL)가 없음 — 이용 중 취소 요청의 승인 링크를 만들 수 없다(503) */
export const RESERVATION_USER_WEB_URL_MISSING_MESSAGE = '이용자 화면 주소가 설정되지 않아 요청할 수 없습니다. 관리자에게 문의해주세요.';

/** 이미 진행 중인 이용 중 취소 요청 — 부분 유니크 UK_ReservationCancelRequest_ReservationIdRequested */
export const RESERVATION_CANCEL_REQUEST_DUPLICATE_MESSAGE = '이미 진행 중인 취소 요청이 있습니다.';
