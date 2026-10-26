import type {StoreDetail} from '@app/database/entities/store/store.entity.js';

/** 업체 상태 — t_store_state PK (seeder.targets.ts 의 STORE_STATE_SEED_DATA 와 같다) */
export const STORE_STATE = {ACTIVE: 'ACTIVE', SUSPEND: 'SUSPEND', LEAVE: 'LEAVE'} as const;

/** 입점 신청 상태 — t_store_application_state PK */
export const STORE_APPLICATION_STATE = {WAIT: 'WAIT', APPROVED: 'APPROVED', REJECTED: 'REJECTED'} as const;

/** 업체 정보 파일 용도 — t_store_file_purpose PK (비공개 여부는 그 룩업의 is_private) */
export const STORE_FILE_PURPOSE = {BUSINESS_LICENSE: 'BUSINESS_LICENSE', STORE_IMAGE: 'STORE_IMAGE'} as const;

/** 용도별 파일 한도 — 신청 · 업체 1건 기준(업체 사진은 승인 때 넘어온 것 포함) */
export const STORE_FILE_LIMIT: Record<string, number> = {BUSINESS_LICENSE: 1, STORE_IMAGE: 5};

/** 파일 MIME 타입 → 확장자 */
export const STORE_FILE_EXTENSION: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png'};

/** 업체 탈퇴로 정지한 매니저의 정지 사유 */
export const STORE_LEAVE_BLOCK_COMMENT = '업체 탈퇴로 이용이 정지되었습니다.';

/** 입점 신청 없음 — 남의 신청 포함(존재를 드러내지 않는다) */
export const STORE_APPLICATION_NOT_FOUND_MESSAGE = '입점 신청을 찾을 수 없습니다.';

/** 대기 중이 아닌 신청을 바꾸려 할 때 */
export const STORE_APPLICATION_NOT_WAITING_MESSAGE = '대기 중인 입점 신청만 처리할 수 있습니다.';

/** 업체 없음 */
export const STORE_NOT_FOUND_MESSAGE = '업체를 찾을 수 없습니다.';

/** 사업자등록번호 중복 — 대기 신청 · 등록 업체 (service · repository) */
export const STORE_BUSINESS_NUMBER_TAKEN_MESSAGE = '이미 신청 · 등록된 사업자등록번호입니다.';

/** 용도별 파일 한도 초과 */
export const STORE_FILE_LIMIT_MESSAGE = '올릴 수 있는 파일 수를 넘었습니다.';

/** 파일 용도가 룩업에 없을 때 */
export const STORE_FILE_PURPOSE_INVALID_MESSAGE = '파일 용도가 올바르지 않습니다.';

/** 탈퇴 업체를 바꾸려 할 때 */
export const STORE_LEAVE_LOCKED_MESSAGE = '탈퇴한 업체는 바꿀 수 없습니다.';

/** 편의시설(t_store.store_detail)로 저장하는 항목 — 검증 파이프가 선언 안 된 키를 거르지 않으므로 service 가 이 항목만 남긴다 */
export const STORE_DETAIL_KEYS: (keyof StoreDetail)[] = ['room_count', 'has_shower', 'has_tv', 'has_pc'];

/** 매니저의 소속 업체 없음 — 탈퇴 업체 포함 (내 업체 설정) */
export const STORE_MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';

/** 업체 정보 파일 없음 — 남의 신청 · 업체의 파일, 지울 수 없는 용도 포함 (신청 파일 삭제 · 업체 사진 삭제) */
export const STORE_FILE_NOT_FOUND_MESSAGE = '파일을 찾을 수 없습니다.';

/** 업로드 주소로 발급하지 않은 저장 키 (신청 파일 · 업체 사진 등록) */
export const STORE_FILE_KEY_INVALID_MESSAGE = '업로드 주소로 받은 저장 키가 아닙니다.';

/** 저장소에 아직 파일이 없다 (신청 파일 · 업체 사진 등록) */
export const STORE_FILE_NOT_UPLOADED_MESSAGE = '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.';

/** 바꾸려는 값이 지금과 같다 (업체 상태 · 영업중 여부) */
export const STORE_SAME_STATE_MESSAGE = '이미 같은 상태입니다.';

/** 일시 예약불가 입력 형식 — 한국 시각 분 단위 (dayjs 형식 문자열) */
export const STORE_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';
