/**
 * 매니저 도메인(총매니저 · 매니저) RabbitMQ 명령 종류 (= 라우팅 키, admin-service 의 q.admin.cmd 가 `admin.#` 로 받는다).
 * 게이트웨이가 발행하고 admin-service 매니저 도메인의 `@OnCommand` 핸들러가 받는다. 큐 · 바인딩 상수는 admin.commands.ts.
 *
 * 큐 경로 기준: 비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화(등록된 휴대폰 SMS). 로그인 · 토큰 재발급은 내부 HTTP 동기 경로다.
 */
export const MANAGER_COMMAND = {
    /** 비밀번호 변경 (로그인 매니저) */
    PASSWORD: 'admin.manager.password',
    /** 아이디 찾기 — 인증번호 발송 */
    FIND_LOGIN_ID: 'admin.manager.find-login-id',
    /** 아이디 찾기 — 인증번호 확인 → 아이디 */
    FIND_LOGIN_ID_CONFIRM: 'admin.manager.find-login-id-confirm',
    /** 비밀번호 초기화 — 인증번호 발송 */
    PASSWORD_RESET: 'admin.manager.password-reset',
    /** 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호 SMS */
    PASSWORD_RESET_CONFIRM: 'admin.manager.password-reset-confirm',
} as const;

/** 매니저 도메인 내부 HTTP 경로 (게이트웨이 → admin-service) */
export const MANAGER_INTERNAL_PATH = {
    /** 매니저 로그인 */
    LOGIN: '/internal/v1/manager/login',
    /** 매니저 토큰 재발급 */
    TOKEN_REFRESH: '/internal/v1/manager/token-refresh',
    /** 로그인 매니저 조회(게이트웨이 jwt-manager 전략) — 뒤에 `/<user_id>` */
    AUTH_USER: '/internal/v1/manager/auth-user',
} as const;
