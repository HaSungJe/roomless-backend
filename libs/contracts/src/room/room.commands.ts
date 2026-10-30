/** room 내부 HTTP 경로 접두 */
const ROOM_INTERNAL_BASE = '/internal/v1/admin-service/room';

/**
 * room 도메인(객실 관리 — 업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 기간 가격 · 호실) RabbitMQ 명령 종류 (= 라우팅 키, admin-service 의 q.admin.cmd 가 `admin.#` 로 받는다).
 * 모두 업체 관리자(업체 총관리자 · 업체 관리자)의 내 업체 쓰기다. 조회 · 업로드 주소는 내부 HTTP 동기 경로다.
 */
export const ROOM_COMMAND = {
    /** 업체 상품 설정 수정 — 종류별 (업체 관리자) */
    PLAN_UPDATE: 'admin.room.plan-update',
    /** 객실 그룹 등록 — 그룹 상품 3행을 함께 만든다 (업체 관리자) */
    GROUP_CREATE: 'admin.room.group-create',
    /** 객실 그룹 수정 (업체 관리자) */
    GROUP_UPDATE: 'admin.room.group-update',
    /** 객실 그룹 삭제 — 그 그룹의 호실 · 사진도 함께 삭제 (업체 관리자) */
    GROUP_DELETE: 'admin.room.group-delete',
    /** 객실 그룹 사진 등록 (업체 관리자) */
    GROUP_IMAGE: 'admin.room.group-image',
    /** 객실 그룹 사진 순서 변경 (업체 관리자) */
    GROUP_IMAGE_ORDER: 'admin.room.group-image-order',
    /** 객실 그룹 사진 삭제 (업체 관리자) */
    GROUP_IMAGE_DELETE: 'admin.room.group-image-delete',
    /** 그룹 상품 수정 — 종류별 사용 여부 · 기본 요금 (업체 관리자) */
    GROUP_PLAN_UPDATE: 'admin.room.group-plan-update',
    /** 상품별 기간 가격 등록 (업체 관리자) */
    GROUP_PLAN_PRICE: 'admin.room.group-plan-price',
    /** 상품별 기간 가격 수정 (업체 관리자) */
    GROUP_PLAN_PRICE_UPDATE: 'admin.room.group-plan-price-update',
    /** 상품별 기간 가격 삭제 (업체 관리자) */
    GROUP_PLAN_PRICE_DELETE: 'admin.room.group-plan-price-delete',
    /** 호실 등록 (업체 관리자) */
    CREATE: 'admin.room.create',
    /** 호실 수정 — 그룹 이동 포함 (업체 관리자) */
    UPDATE: 'admin.room.update',
    /** 호실 삭제 (업체 관리자) */
    DELETE: 'admin.room.delete',
    /** 호실 상태 변경 — 정비 완료 · 사용중지 · 사용 재개 (업체 관리자) */
    STATE: 'admin.room.state',
} as const;

/**
 * room 도메인 내부 HTTP 경로 (게이트웨이 → admin-service). 파라미터가 있는 경로는 함수로 만든다 — 게이트웨이가 경로 문자열을 이어 붙이지 않는다.
 */
export const ROOM_INTERNAL_PATH = {
    /** 업체 상품 설정 목록 (GET, 업체 관리자) */
    PLAN_LIST: `${ROOM_INTERNAL_BASE}/plan`,
    /** 객실 그룹 목록 (GET, 업체 관리자) */
    GROUP_LIST: `${ROOM_INTERNAL_BASE}/group`,
    /** 객실 그룹 상세 (GET, 업체 관리자) */
    group: (room_group_id: string) => `${ROOM_INTERNAL_BASE}/group/${encodeURIComponent(room_group_id)}`,
    /** 객실 그룹 사진 업로드 주소 (POST, 업체 관리자) */
    groupImageUploadUrl: (room_group_id: string) => `${ROOM_INTERNAL_BASE}/group/${encodeURIComponent(room_group_id)}/image/upload-url`,
    /** 상품별 기간 가격 목록 (GET, 업체 관리자) */
    groupPlanPrices: (room_group_id: string, room_plan_type_id: string) => `${ROOM_INTERNAL_BASE}/group/${encodeURIComponent(room_group_id)}/plan/${encodeURIComponent(room_plan_type_id)}/price`,
    /** 호실 목록 (GET, 업체 관리자) */
    ROOM_LIST: ROOM_INTERNAL_BASE,
} as const;
