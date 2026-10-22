/**
 * 이용자 도메인 RabbitMQ 명령 종류 (= 라우팅 키, `user.#` 로 q.user.cmd 에 바인딩).
 * 게이트웨이가 발행하고 user-service 의 `@OnCommand` 핸들러가 받는다.
 *
 * 큐 경로 기준: 회원 상태를 바꾸는 쓰기(가입 · 탈퇴 · 철회 · SMS 인증 · 아이디 찾기). 이용자는 SNS 로만 가입해 비밀번호가 없다.
 * 토큰을 즉시 돌려줘야 하는 로그인 · 토큰 재발급은 내부 HTTP 동기 경로다.
 * 매니저 · 관리자 도메인 명령은 admin-service 의 `admin.*`(manager.commands.ts · admin.commands.ts)다.
 */
export const USER_COMMAND = {
    /** SNS 회원가입 (이용자는 SNS 가입만) */
    SIGN: 'user.member.sign',
    /** 회원 탈퇴 신청 */
    LEAVE: 'user.member.leave',
    /** 회원 탈퇴 철회 */
    LEAVE_CANCEL: 'user.member.leave-cancel',
    /** 휴대폰 인증번호 발송 (로그인 이용자) */
    PHONE_VERIFICATION: 'user.member.phone-verification',
    /** 휴대폰 인증번호 확인 → 회원정보에 번호 저장 (로그인 이용자) */
    PHONE_VERIFICATION_CONFIRM: 'user.member.phone-verification-confirm',
    /** 아이디 찾기 — 인증번호 발송 */
    FIND_LOGIN_ID: 'user.member.find-login-id',
    /** 아이디 찾기 — 인증번호 확인 → 가입한 SNS */
    FIND_LOGIN_ID_CONFIRM: 'user.member.find-login-id-confirm',
} as const;

/** user-service 가 소비하는 명령 큐 */
export const USER_COMMAND_QUEUE = 'q.user.cmd';

/** user-service 명령 큐 바인딩 키 */
export const USER_COMMAND_BINDING = 'user.#';

/** 이용자 도메인 내부 HTTP 경로 (게이트웨이 → user-service) */
export const USER_INTERNAL_PATH = {
    /** 이용자 SNS 로그인 */
    LOGIN: '/internal/v1/user-service/user/login',
    /** 이용자 토큰 재발급 */
    TOKEN_REFRESH: '/internal/v1/user-service/user/token-refresh',
    /** 로그인 이용자 조회(게이트웨이 jwt-user 전략) — 뒤에 `/<user_id>` */
    AUTH_USER: '/internal/v1/user-service/user/auth-user',
} as const;
