/**
 * 관리자 도메인(총관리자 · 관리자) RabbitMQ 명령 종류 (= 라우팅 키, `admin.#` 로 q.admin.cmd 에 바인딩).
 * 게이트웨이가 발행하고 admin-service 관리자 도메인의 `@OnCommand` 핸들러가 받는다.
 *
 * 큐 경로 기준: 비밀번호 변경. 관리자 그룹은 아이디 찾기 · 비밀번호 초기화가 없다. 로그인 · 토큰 재발급은 내부 HTTP 동기 경로다.
 */
export const ADMIN_COMMAND = {
    /** 비밀번호 변경 (로그인 관리자) */
    PASSWORD: 'admin.admin.password',
} as const;

/** admin-service 가 소비하는 명령 큐 — 매니저 · 관리자 도메인 명령(`admin.<도메인>.<action>`)을 함께 받는다 */
export const ADMIN_COMMAND_QUEUE = 'q.admin.cmd';

/** admin-service 명령 큐 바인딩 키 */
export const ADMIN_COMMAND_BINDING = 'admin.#';

/** 관리자 도메인 내부 HTTP 경로 (게이트웨이 → admin-service) */
export const ADMIN_INTERNAL_PATH = {
    /** 관리자 로그인 */
    LOGIN: '/internal/v1/admin-service/admin/login',
    /** 관리자 토큰 재발급 */
    TOKEN_REFRESH: '/internal/v1/admin-service/admin/token-refresh',
    /** 로그인 관리자 조회(게이트웨이 jwt-admin 전략) — 뒤에 `/<user_id>` */
    AUTH_USER: '/internal/v1/admin-service/admin/auth-user',
} as const;
