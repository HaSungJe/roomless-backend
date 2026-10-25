/** store 내부 HTTP 경로 접두 */
const STORE_INTERNAL_BASE = '/internal/v1/admin-service/store';

/**
 * store 도메인(업체 · 입점 신청) RabbitMQ 명령 종류 (= 라우팅 키, admin-service 의 q.admin.cmd 가 `admin.#` 로 받는다).
 * 큐 경로 기준: 입점 신청 · 신청 취소 · 파일 등록 · 파일 삭제(이용자), 승인 · 반려 · 업체 수정 · 상태 변경(총관리자). 조회 · 업로드 주소는 내부 HTTP 동기 경로다.
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
} as const;
