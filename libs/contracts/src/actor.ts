/**
 * 요청을 보낸 로그인 회원.
 * 게이트웨이가 JWT 를 검증해 만들고, 서비스는 이 값을 신뢰한다(서비스는 외부에 열려 있지 않다).
 * - 내부 HTTP: `x-actor-user-id` · `x-actor-auth-id` 헤더로 전달
 * - RabbitMQ: 메시지 봉투의 `actor` 로 전달
 */
export interface Actor {
    /** 회원 ID */
    user_id: string;
    /** 권한 ID (t_auth PK — SUPER_ADMIN · ADMIN · HEAD_MANAGER · MANAGER · USER) */
    auth_id: string;
}

/** 게이트웨이 → 서비스 내부 HTTP 헤더 */
export const INTERNAL_HEADER = {
    /** 게이트웨이만 아는 공유 비밀 — 서비스는 이 값이 일치하는 요청만 받는다 */
    TOKEN: 'x-internal-token',
    /** 로그인 회원 ID */
    ACTOR_USER_ID: 'x-actor-user-id',
    /** 로그인 회원 권한 ID */
    ACTOR_AUTH_ID: 'x-actor-auth-id',
    /** 클라이언트 IP (게이트웨이가 받은 원래 IP) */
    CLIENT_IP: 'x-client-ip',
} as const;
