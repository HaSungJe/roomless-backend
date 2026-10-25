/** 업체 상태 — t_store_state PK (seeder.targets.ts 의 STORE_STATE_SEED_DATA 와 같다) */
export const STORE_STATE = {ACTIVE: 'ACTIVE', SUSPEND: 'SUSPEND', LEAVE: 'LEAVE'} as const;

/** 입점 신청 상태 — t_store_application_state PK */
export const STORE_APPLICATION_STATE = {WAIT: 'WAIT', APPROVED: 'APPROVED', REJECTED: 'REJECTED'} as const;

/** 신청자가 볼 수 있는 신청 상태 — 승인되면 신청자는 그 신청을 볼 수 없다 */
export const STORE_APPLICATION_VISIBLE_STATES = ['WAIT', 'REJECTED'];

/** 업체 정보 파일 용도 — t_store_file_purpose PK (비공개 여부는 그 룩업의 is_private) */
export const STORE_FILE_PURPOSE = {BUSINESS_LICENSE: 'BUSINESS_LICENSE', STORE_IMAGE: 'STORE_IMAGE'} as const;

/** 용도별 파일 한도 — 신청 1건 기준 */
export const STORE_FILE_LIMIT: Record<string, number> = {BUSINESS_LICENSE: 1, STORE_IMAGE: 5};

/** 파일 MIME 타입 → 확장자 */
export const STORE_FILE_EXTENSION: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png'};

/** 업체 총관리자 아이디 생성 시도 횟수 — 겹치면 다시 만든다 */
export const HEAD_MANAGER_LOGIN_ID_ATTEMPTS = 5;

/** 업체 탈퇴로 정지한 매니저의 정지 사유 */
export const STORE_LEAVE_BLOCK_COMMENT = '업체 탈퇴로 이용이 정지되었습니다.';

/** 입점 신청 없음 — 남의 신청 · 승인된 내 신청 포함(존재를 드러내지 않는다) */
export const STORE_APPLICATION_NOT_FOUND_MESSAGE = '입점 신청을 찾을 수 없습니다.';

/** 대기 중이 아닌 신청을 바꾸려 할 때 */
export const STORE_APPLICATION_NOT_WAITING_MESSAGE = '대기 중인 입점 신청만 처리할 수 있습니다.';

/** 업체 없음 */
export const STORE_NOT_FOUND_MESSAGE = '업체를 찾을 수 없습니다.';

/** 사업자등록번호 중복 — 대기 신청 · 등록 업체 (service · repository) */
export const STORE_BUSINESS_NUMBER_TAKEN_MESSAGE = '이미 신청 · 등록된 사업자등록번호입니다.';

/** 대표자 휴대폰 번호가 다른 매니저 계정에 있을 때 (repository) */
export const HEAD_MANAGER_PHONE_TAKEN_MESSAGE = '이미 다른 매니저 계정에 등록된 휴대폰 번호입니다.';

/** 용도별 파일 한도 초과 */
export const STORE_FILE_LIMIT_MESSAGE = '올릴 수 있는 파일 수를 넘었습니다.';

/** 파일 용도가 룩업에 없을 때 */
export const STORE_FILE_PURPOSE_INVALID_MESSAGE = '파일 용도가 올바르지 않습니다.';

/** 탈퇴 업체를 바꾸려 할 때 */
export const STORE_LEAVE_LOCKED_MESSAGE = '탈퇴한 업체는 바꿀 수 없습니다.';
