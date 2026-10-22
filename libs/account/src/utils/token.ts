import type {JwtService} from '@nestjs/jwt';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';

/** access / refresh 토큰 한 쌍과 만료 시각 */
export interface AccessRefreshSet {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
}

/**
 * access(20m) / refresh(365d) 토큰 한 쌍 발급 + 만료시각 추출 — 가입 · 로그인 · 재발급 공통(이용자 · 매니저 · 관리자).
 *
 * @param jwtService JWT 서명기
 * @param payload 토큰에 담을 회원 · 세션
 * @returns 토큰 한 쌍
 */
export function issueAccessAndRefresh(jwtService: JwtService, payload: {user_id: string; session_id: string}): AccessRefreshSet {
    const accessToken = jwtService.sign({type: 'access', ...payload}, {expiresIn: '20m'});
    const refreshToken = jwtService.sign({type: 'refresh', ...payload}, {expiresIn: '365d'});
    return {accessToken, refreshToken, accessTokenExpiresAt: extractJwtExpiresAt(accessToken), refreshTokenExpiresAt: extractJwtExpiresAt(refreshToken)};
}
