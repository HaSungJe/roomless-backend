/**
 * 회원 권한(t_auth PK) — 게이트웨이 `@Roles(...)` 와 user-service 가 같은 값을 쓴다.
 */
export const AUTH_ID = {SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN', HEAD_MANAGER: 'HEAD_MANAGER', MANAGER: 'MANAGER', USER: 'USER'} as const;

/**
 * 로그인 그룹(t_user.login_scope) — 그룹마다 로그인 API 가 따로이고, 아이디 · 휴대폰 번호 UK 도 그룹 단위다.
 * USER = 이용자, MANAGER = 총매니저 · 매니저, ADMIN = 총관리자 · 관리자
 */
export const LOGIN_SCOPE = {USER: 'USER', MANAGER: 'MANAGER', ADMIN: 'ADMIN'} as const;

/** 로그인 그룹 값 */
export type LoginScope = (typeof LOGIN_SCOPE)[keyof typeof LOGIN_SCOPE];
