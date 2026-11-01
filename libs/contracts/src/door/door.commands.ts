/**
 * 문 도메인 규격 — RabbitMQ 명령은 없다. 문 열기 · 닫기는 문 쪽 타 업체 프로그램이 결과를 바로 받아야 하고 DB 쓰기가 없어
 * 내부 HTTP 동기 경로다(로그인 · 토큰 재발급처럼). 공개 경로는 `/api/v1/user-service/door/…`.
 */

/** 문 도메인 내부 HTTP 경로 (게이트웨이 → user-service) */
export const DOOR_INTERNAL_PATH = {
    /** QR 로 문 열기 */
    OPEN: '/internal/v1/user-service/door/open',
    /** 문 닫기 */
    CLOSE: '/internal/v1/user-service/door/close',
} as const;
