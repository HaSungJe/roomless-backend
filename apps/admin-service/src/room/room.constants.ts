import type {RoomGroupDetail} from '@app/database/entities/room/room-group.entity.js';

/**
 * 호실 상태 — t_room_state PK (seeder.targets.ts 의 ROOM_STATE_SEED_DATA 와 같다).
 * 예약 → 예약완료(Phase 17) · 체크인 → 사용중 · 체크아웃 → 정비중(Phase 19) · 정비 완료 → 예약가능(업체 관리자), 사용중지는 업체 관리자가 켜고 끈다.
 */
export const ROOM_STATE = {AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', IN_USE: 'IN_USE', MAINTENANCE: 'MAINTENANCE', DISABLED: 'DISABLED'} as const;

/** 업체 관리자가 바꿀 수 있는 호실 상태 전환 [지금 상태, 바꿀 상태] — 정비 완료 · 사용중지 · 사용 재개 (canChangeRoomState) */
export const ROOM_STATE_TRANSITIONS: [string, string][] = [
    [ROOM_STATE.MAINTENANCE, ROOM_STATE.AVAILABLE],
    [ROOM_STATE.AVAILABLE, ROOM_STATE.DISABLED],
    [ROOM_STATE.MAINTENANCE, ROOM_STATE.DISABLED],
    [ROOM_STATE.DISABLED, ROOM_STATE.AVAILABLE],
];

/** 상품 종류 — t_room_plan_type PK (seeder.targets.ts 의 ROOM_PLAN_TYPE_SEED_DATA 와 같다) */
export const ROOM_PLAN_TYPE = {HOURLY: 'HOURLY', NIGHT: 'NIGHT', LONG: 'LONG'} as const;

/** 상품 종류 순서 — 시간 이용 · 1박 · 연박 (업체 상품 설정 목록 · 그룹 상세의 그룹 상품 · 그룹 등록 때 만드는 그룹 상품 3행) */
export const ROOM_PLAN_TYPE_ORDER: string[] = [ROOM_PLAN_TYPE.HOURLY, ROOM_PLAN_TYPE.NIGHT, ROOM_PLAN_TYPE.LONG];

/** 그룹 사진 한도 — 그룹 1개 기준 */
export const ROOM_GROUP_IMAGE_LIMIT = 5;

/** 객실 그룹 상세정보의 알려진 항목 — 입력에서 이 항목만 남긴다(선언 안 된 키는 버린다). 항목을 더하면 RoomGroupDetail · ROOM_GROUP_DETAIL_DEFAULTS 와 함께 고친다 */
export const ROOM_GROUP_DETAIL_KEYS: (keyof RoomGroupDetail)[] = ['room_count', 'has_shower', 'has_tv', 'has_pc'];

/** 그룹 사진 MIME 타입 → 확장자 */
export const ROOM_IMAGE_EXTENSION: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png'};

/** 기간 가격 날짜 입력 형식 — 한국 날짜 (dayjs 형식 문자열) */
export const ROOM_DATE_FORMAT = 'YYYY-MM-DD';

/** 탈퇴 업체 상태 — t_store_state PK. 매니저의 소속 업체에서 뺀다(store 도메인 상수는 import 하지 않는다) */
export const ROOM_STORE_STATE_LEAVE = 'LEAVE';

/** 매니저의 소속 업체 없음 — 탈퇴 업체 · 지운 업체 포함 (모든 객실 관리 API) */
export const ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';

/** 객실 그룹 없음 — 남의 업체 그룹 · 지운 그룹 포함 */
export const ROOM_GROUP_NOT_FOUND_MESSAGE = '객실 그룹을 찾을 수 없습니다.';

/** 호실 없음 — 남의 업체 호실 · 지운 호실 포함 */
export const ROOM_NOT_FOUND_MESSAGE = '호실을 찾을 수 없습니다.';

/** 그룹명 중복 — 같은 업체의 지워지지 않은 그룹 (repository — UK_RoomGroup_StoreIdRoomGroupName) */
export const ROOM_GROUP_NAME_TAKEN_MESSAGE = '이미 있는 그룹명입니다.';

/** 호실명 중복 — 같은 업체의 지워지지 않은 호실 (repository — UK_Room_StoreIdRoomName) */
export const ROOM_NAME_TAKEN_MESSAGE = '이미 있는 호실명입니다.';

/** 그룹 사진 없음 — 다른 그룹 사진 · 지운 사진 포함 (사진 삭제 · 순서) */
export const ROOM_GROUP_IMAGE_NOT_FOUND_MESSAGE = '사진을 찾을 수 없습니다.';

/** 그룹 사진 한도 초과 (업로드 주소 · 사진 등록) */
export const ROOM_GROUP_IMAGE_LIMIT_MESSAGE = '올릴 수 있는 사진 수를 넘었습니다.';

/** 같은 저장 키로 다시 등록 (repository — UK_RoomGroupImage_FileKey) */
export const ROOM_GROUP_IMAGE_TAKEN_MESSAGE = '이미 등록된 사진입니다.';

/** 업로드 주소로 발급하지 않은 저장 키 (그룹 사진 등록) */
export const ROOM_FILE_KEY_INVALID_MESSAGE = '업로드 주소로 받은 저장 키가 아닙니다.';

/** 저장소에 아직 파일이 없다 (그룹 사진 등록) */
export const ROOM_FILE_NOT_UPLOADED_MESSAGE = '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.';

/** 업체 상품 설정 · 그룹 상품 없음 — 종류마다 행이 늘 있으므로 보통은 생기지 않는다 */
export const ROOM_PLAN_NOT_FOUND_MESSAGE = '상품 설정을 찾을 수 없습니다.';

/** 기간 가격 없음 — 다른 그룹 상품의 기간 가격 · 지운 기간 가격 포함 */
export const ROOM_PLAN_PRICE_NOT_FOUND_MESSAGE = '기간 가격을 찾을 수 없습니다.';

/** 기간 가격 겹침 — 같은 그룹 상품의 지워지지 않은 다른 기간과 날짜가 겹친다 (service 선검사 · repository — EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange) */
export const ROOM_PLAN_PRICE_OVERLAP_MESSAGE = '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.';

/** 기간 가격 시작 날짜가 없는 날짜 — 2026-02-30 등 (validation_errors.start_date) */
export const ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE = '없는 시작 날짜입니다.';

/** 기간 가격 종료 날짜가 없는 날짜 (validation_errors.end_date) */
export const ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE = '없는 종료 날짜입니다.';

/** 기간 가격 종료 날짜가 시작 날짜보다 이르다 (validation_errors.end_date) */
export const ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE = '종료 날짜는 시작 날짜보다 빠를 수 없습니다.';

/** 업체 관리자가 바꿀 수 없는 호실 상태 전환 (canChangeRoomState 가 false) */
export const ROOM_STATE_CHANGE_INVALID_MESSAGE = '지금 상태에서는 바꿀 수 없습니다.';
