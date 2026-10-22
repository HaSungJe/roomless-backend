import {UnauthorizedException} from '@nestjs/common';
import passportJwt from 'passport-jwt';
import type {InternalHttpClient, InternalService} from '../../modules/transport/internal-http.client.js';

const {ExtractJwt} = passportJwt;

/** 인증 실패 메시지 (토큰 없음 · 서명 오류 · 만료 · 로그인 불가 회원 · 다른 로그인 그룹 회원) */
export const AUTH_INVALID_MESSAGE = '로그인 정보가 유효하지 않습니다.';

/** access token payload */
export interface AccessPayload {
    type?: string;
    user_id?: string;
    session_id?: string;
}

/**
 * 그룹별 JWT 전략 공통 옵션 — Bearer 토큰, JWT_SECRET 서명(세 그룹 공통), `NODE_ENV=development` 면 만료를 검사하지 않는다.
 *
 * @returns passport-jwt 전략 옵션
 */
export function jwtStrategyOptions(): passportJwt.StrategyOptionsWithoutRequest {
    return {jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_SECRET || '', ignoreExpiration: process.env.NODE_ENV === 'development'};
}

/**
 * access 토큰이면 그 로그인 그룹의 서비스에 로그인 회원을 묻는다(그 그룹 · 로그인 가능 회원만 돌려준다).
 * 토큰 종류가 다르거나 서비스가 실패를 돌려주면(다른 그룹 · 로그인 불가 · 접속 실패) 모두 401.
 *
 * @param internalHttp 내부 HTTP 클라이언트
 * @param service 그룹의 서비스 (user · admin)
 * @param path 그룹의 로그인 회원 조회 경로 (뒤에 `/<user_id>`)
 * @param payload 검증된 JWT payload
 * @returns 로그인 회원 정보 (`request.user`)
 * @throws UnauthorizedException access 토큰이 아니거나 그 그룹의 로그인 가능 회원이 아님
 */
export async function fetchLoginUser<T>(internalHttp: InternalHttpClient, service: InternalService, path: string, payload: AccessPayload): Promise<T> {
    if (payload?.type !== 'access' || !payload.user_id) {
        throw new UnauthorizedException({message: AUTH_INVALID_MESSAGE});
    }
    try {
        return await internalHttp.request<T>(service, 'GET', `${path}/${encodeURIComponent(payload.user_id)}`);
    } catch {
        throw new UnauthorizedException({message: AUTH_INVALID_MESSAGE});
    }
}

/**
 * 그룹별 JWT 가드 공통 — 전략 결과를 받아 회원을 돌려주거나 한국어 401 을 던진다(passport 기본 영문 401 대신).
 *
 * @param error 전략 오류
 * @param user 전략이 돌려준 회원
 * @returns 회원
 * @throws UnauthorizedException 회원이 없거나 전략 오류
 */
export function passLoginUser<TUser>(error: unknown, user: TUser | false): TUser {
    if (error || !user) {
        throw new UnauthorizedException({message: AUTH_INVALID_MESSAGE});
    }
    return user;
}
