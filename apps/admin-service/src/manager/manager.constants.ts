/** 업체 인력 상태 — 삭제(LEAVE)되지 않은 매니저 계정 (ACTIVE: 정상, BLOCK: 정지) */
export const STAFF_STATES = ['ACTIVE', 'BLOCK'];

/** 업체 관리자 없음 — 다른 업체 · 업체 총관리자 자신 · 삭제된 계정 포함 */
export const STAFF_NOT_FOUND_MESSAGE = '업체 관리자를 찾을 수 없습니다.';

/** 같은 업체에 같은 아이디 (service · repository) */
export const STAFF_LOGIN_ID_TAKEN_MESSAGE = '이미 사용 중인 아이디입니다.';

/** 같은 업체에 같은 휴대폰 번호 (service · repository) */
export const STAFF_PHONE_TAKEN_MESSAGE = '이미 다른 계정에 등록된 휴대폰 번호입니다.';

/** 업체 총관리자의 소속 업체가 없을 때(데이터 이상) */
export const MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';
