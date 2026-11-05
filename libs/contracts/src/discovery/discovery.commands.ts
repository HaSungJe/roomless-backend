/** discovery 내부 HTTP 경로 접두 */
const DISCOVERY_INTERNAL_BASE = '/internal/v1/user-service/discovery';

/**
 * discovery 도메인 내부 HTTP 경로 (게이트웨이 → user-service). 이용자 둘러보기 — 로그인 없이 조회만(큐 명령 없음). 파라미터가 있는 경로는 함수로 만든다.
 */
export const DISCOVERY_INTERNAL_PATH = {
    /** 반경 업체 조회 (GET, 인증 없음) */
    STORE_LIST: `${DISCOVERY_INTERNAL_BASE}/store`,
    /** 업체 상세 (GET, 인증 없음) */
    storeDetail: (store_id: string) => `${DISCOVERY_INTERNAL_BASE}/store/${encodeURIComponent(store_id)}`,
    /** 업체의 객실 그룹 목록 (GET, 인증 없음) */
    roomGroupList: (store_id: string) => `${DISCOVERY_INTERNAL_BASE}/store/${encodeURIComponent(store_id)}/room-group`,
} as const;
