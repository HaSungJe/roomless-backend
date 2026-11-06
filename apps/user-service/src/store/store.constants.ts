/** 입점 신청 상태 — t_store_application_state PK */
export const STORE_APPLICATION_STATE = {WAIT: 'WAIT', APPROVED: 'APPROVED', REJECTED: 'REJECTED'} as const;

/** 용도별 파일 한도 — 신청 1건 기준 */
export const STORE_FILE_LIMIT: Record<string, number> = {BUSINESS_LICENSE: 1, STORE_IMAGE: 5};

/** 파일 MIME 타입 → 확장자 */
export const STORE_FILE_EXTENSION: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png'};

/** 입점 신청 없음 — 남의 신청 포함(존재를 드러내지 않는다) */
export const STORE_APPLICATION_NOT_FOUND_MESSAGE = '입점 신청을 찾을 수 없습니다.';

/** 대기 중이 아닌 신청을 바꾸려 할 때 */
export const STORE_APPLICATION_NOT_WAITING_MESSAGE = '대기 중인 입점 신청만 처리할 수 있습니다.';

/** 사업자등록번호 중복 — 대기 신청 · 등록 업체 */
export const STORE_BUSINESS_NUMBER_TAKEN_MESSAGE = '이미 신청 · 등록된 사업자등록번호입니다.';

/** 용도별 파일 한도 초과 */
export const STORE_FILE_LIMIT_MESSAGE = '올릴 수 있는 파일 수를 넘었습니다.';

/** 파일 용도가 룩업에 없을 때 */
export const STORE_FILE_PURPOSE_INVALID_MESSAGE = '파일 용도가 올바르지 않습니다.';

/** 업체 정보 파일 없음 — 남의 신청의 파일 포함 (신청 파일 삭제) */
export const STORE_FILE_NOT_FOUND_MESSAGE = '파일을 찾을 수 없습니다.';

/** 업로드 주소로 발급하지 않은 저장 키 (신청 파일 등록) */
export const STORE_FILE_KEY_INVALID_MESSAGE = '업로드 주소로 받은 저장 키가 아닙니다.';

/** 저장소에 아직 파일이 없다 (신청 파일 등록) */
export const STORE_FILE_NOT_UPLOADED_MESSAGE = '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.';
