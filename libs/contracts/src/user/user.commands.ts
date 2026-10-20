/**
 * 회원 도메인 RabbitMQ 명령 종류 (= 라우팅 키, `user.#` 로 q.user.cmd 에 바인딩).
 * 게이트웨이가 발행하고 user-service 의 `@OnCommand` 핸들러가 받는다.
 *
 * 큐 경로 기준: 회원 상태를 바꾸는 쓰기(가입 · 탈퇴 · 철회 · 비밀번호 변경 · SMS 인증 · 아이디 찾기 · 비밀번호 초기화).
 * 토큰을 즉시 돌려줘야 하는 로그인 · 토큰 재발급은 내부 HTTP 동기 경로다.
 */
export const USER_COMMAND = {
    /** SNS 회원가입 */
    SIGN: 'user.member.sign',
    /** 일반 회원가입 */
    GENERAL_SIGN: 'user.member.general-sign',
    /** 회원 탈퇴 신청 */
    LEAVE: 'user.member.leave',
    /** 회원 탈퇴 철회 */
    LEAVE_CANCEL: 'user.member.leave-cancel',
    /** 비밀번호 변경 */
    PASSWORD: 'user.member.password',
    /** 휴대폰 인증번호 발송 (로그인 회원) */
    PHONE_VERIFICATION: 'user.member.phone-verification',
    /** 휴대폰 인증번호 확인 → 회원정보에 번호 저장 (로그인 회원) */
    PHONE_VERIFICATION_CONFIRM: 'user.member.phone-verification-confirm',
    /** 아이디 찾기 — 인증번호 발송 */
    FIND_LOGIN_ID: 'user.member.find-login-id',
    /** 아이디 찾기 — 인증번호 확인 → 아이디 */
    FIND_LOGIN_ID_CONFIRM: 'user.member.find-login-id-confirm',
    /** 비밀번호 초기화 — 인증번호 발송 */
    PASSWORD_RESET: 'user.member.password-reset',
    /** 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호 SMS */
    PASSWORD_RESET_CONFIRM: 'user.member.password-reset-confirm',
} as const;

/** user-service 가 소비하는 명령 큐 */
export const USER_COMMAND_QUEUE = 'q.user.cmd';

/** user-service 명령 큐 바인딩 키 */
export const USER_COMMAND_BINDING = 'user.#';

/** user-service 내부 HTTP 경로 (게이트웨이 → user-service) */
export const USER_INTERNAL_PATH = {
    LOGIN: '/internal/v1/user/login',
    GENERAL_LOGIN: '/internal/v1/user/general-login',
    TOKEN_REFRESH: '/internal/v1/user/token-refresh',
    /** 로그인 회원 조회 — 뒤에 `/<user_id>` */
    AUTH_USER: '/internal/v1/user/auth-user',
} as const;
