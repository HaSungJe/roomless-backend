/**
 * 통계 도메인 내부 HTTP 경로 (게이트웨이 → admin-service). 조회만이라 RabbitMQ 명령은 없다.
 */
export const STATS_INTERNAL_PATH = {
    /** 전체 통계 (GET, 총관리자 · 관리자) */
    ALL: '/internal/v1/admin-service/stats',
    /** 내 업체 통계 (GET, 업체 총관리자 · 업체 관리자) */
    MINE: '/internal/v1/admin-service/stats/mine',
} as const;
