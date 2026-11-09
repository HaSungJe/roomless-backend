/**
 * 이용자 관리 도메인 상수(admin-service — 총관리자 · 관리자) — 도메인 값과 여러 메서드가 함께 쓰는 사용자 노출 메시지.
 * 한 곳에서만 쓰는 메시지는 throw 옆에 인라인 한국어 리터럴로 둔다.
 */

/** 이용자 그룹이 아니거나 없는 회원 — 상세 · 예약 이력 · 이용 제한 */
export const USER_NOT_FOUND_MESSAGE = '이용자를 찾을 수 없습니다.';

/** 관리자가 바꿀 수 있는 이용자 상태 — 정상 ↔ 이용 제한(사용자 결정 2026-11-09) */
export const USER_CHANGEABLE_STATES = ['ACTIVE', 'BLOCK'];

/** 이용 제한 상태 — 사유를 남긴다 */
export const USER_STATE_BLOCK = 'BLOCK';

/** 진행 중 예약 상태 — 결제 대기 · 확정 · 이용 중 */
export const USER_RESERVATION_IN_PROGRESS_STATES = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
