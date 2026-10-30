/** store 내부 HTTP 경로 접두 */
const STORE_INTERNAL_BASE = '/internal/v1/admin-service/store';

/**
 * store 도메인(업체 · 입점 신청) RabbitMQ 명령 종류 (= 라우팅 키, admin-service 의 q.admin.cmd 가 `admin.#` 로 받는다).
 * 큐 경로 기준: 입점 신청 · 신청 취소 · 파일 등록 · 파일 삭제(이용자), 승인 · 반려 · 업체 수정 · 상태 변경 · 영업중 여부(총관리자 · 관리자), 내 업체 설정(업체 관리자). 조회 · 업로드 주소는 내부 HTTP 동기 경로다.
 */
export const STORE_COMMAND = {
    /** 입점 신청 (이용자) */
    APPLICATION: 'admin.store.application',
    /** 입점 신청 취소 (이용자 — 대기 중 내 신청, 신청 · 파일 삭제) */
    APPLICATION_CANCEL: 'admin.store.application-cancel',
    /** 신청에 업체 정보 파일 등록 (이용자 — 대기 중 내 신청) */
    APPLICATION_FILE: 'admin.store.application-file',
    /** 신청의 업체 정보 파일 삭제 (이용자 — 대기 중 내 신청) */
    APPLICATION_FILE_DELETE: 'admin.store.application-file-delete',
    /** 입점 승인 (총관리자) */
    APPLICATION_APPROVE: 'admin.store.application-approve',
    /** 입점 반려 (총관리자) */
    APPLICATION_REJECT: 'admin.store.application-reject',
    /** 업체 정보 수정 (총관리자) */
    UPDATE: 'admin.store.update',
    /** 업체 상태 변경 (총관리자) */
    STATE: 'admin.store.state',
    /** 업체 영업중 여부 변경 (총관리자 · 관리자) */
    OPEN: 'admin.store.open',
    /** 내 업체 소개 · 연락처 수정 (업체 관리자) */
    MINE_PROFILE: 'admin.store.mine-profile',
    /** 내 업체 사진 등록 (업체 관리자) */
    MINE_FILE: 'admin.store.mine-file',
    /** 내 업체 사진 삭제 (업체 관리자) */
    MINE_FILE_DELETE: 'admin.store.mine-file-delete',
    /** 내 업체 사진 순서 변경 (업체 관리자) */
    MINE_FILE_ORDER: 'admin.store.mine-file-order',
    /** 내 업체 영업시간 설정 — 연중무휴 · 요일별 (업체 관리자) */
    MINE_HOURS: 'admin.store.mine-hours',
    /** 내 업체 브레이크타임 설정 (업체 관리자) */
    MINE_BREAKS: 'admin.store.mine-breaks',
    /** 내 업체 정비시간 설정 (업체 관리자) */
    MINE_MAINTENANCE: 'admin.store.mine-maintenance',
    /** 내 업체 영업중 여부 변경 (업체 관리자) */
    MINE_OPEN: 'admin.store.mine-open',
    /** 내 업체 예약 · 환불 규정 설정 (업체 관리자) */
    MINE_RESERVATION_POLICY: 'admin.store.mine-reservation-policy',
    /** 내 업체 일시 예약불가 등록 (업체 관리자) */
    MINE_UNAVAILABLE_PERIOD: 'admin.store.mine-unavailable-period',
    /** 내 업체 일시 예약불가 삭제 (업체 관리자) */
    MINE_UNAVAILABLE_PERIOD_DELETE: 'admin.store.mine-unavailable-period-delete',
} as const;

/**
 * store 도메인 내부 HTTP 경로 (게이트웨이 → admin-service). 파라미터가 있는 경로는 함수로 만든다 — 게이트웨이가 경로 문자열을 이어 붙이지 않는다.
 */
export const STORE_INTERNAL_PATH = {
    /** 내 입점 신청 목록 (GET) */
    MY_APPLICATION_LIST: `${STORE_INTERNAL_BASE}/application/mine`,
    /** 내 입점 신청 상세 (GET) */
    myApplication: (store_application_id: string) => `${STORE_INTERNAL_BASE}/application/mine/${encodeURIComponent(store_application_id)}`,
    /** 파일 업로드 주소 (POST) */
    myApplicationFileUploadUrl: (store_application_id: string) => `${STORE_INTERNAL_BASE}/application/mine/${encodeURIComponent(store_application_id)}/file/upload-url`,
    /** 입점 신청 목록 (GET, 총관리자) */
    APPLICATION_LIST: `${STORE_INTERNAL_BASE}/application`,
    /** 입점 신청 상세 (GET, 총관리자) */
    application: (store_application_id: string) => `${STORE_INTERNAL_BASE}/application/${encodeURIComponent(store_application_id)}`,
    /** 업체 목록 (GET, 총관리자) */
    STORE_LIST: STORE_INTERNAL_BASE,
    /** 업체 상세 (GET, 총관리자) */
    store: (store_id: string) => `${STORE_INTERNAL_BASE}/${encodeURIComponent(store_id)}`,
    /** 내 업체 상세 (GET, 업체 관리자) */
    MINE: `${STORE_INTERNAL_BASE}/mine`,
    /** 내 업체 사진 업로드 주소 (POST, 업체 관리자) */
    MINE_FILE_UPLOAD_URL: `${STORE_INTERNAL_BASE}/mine/file/upload-url`,
    /** 내 업체 일시 예약불가 목록 (GET, 업체 관리자) */
    MINE_UNAVAILABLE_PERIOD_LIST: `${STORE_INTERNAL_BASE}/mine/unavailable-period`,
} as const;
