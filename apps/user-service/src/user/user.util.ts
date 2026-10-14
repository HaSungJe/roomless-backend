import type {JwtService} from '@nestjs/jwt';
import dayjs from 'dayjs';
import {v4} from 'uuid';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {UserAuthUserResultDto} from '@app/contracts/user/dto/user-auth-user.dto.js';
import type {LoginUserRow} from './interfaces/user.repository.interface.js';

/** access / refresh 토큰 한 쌍과 만료 시각 */
export interface AccessRefreshSet {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
}

/**
 * 하이픈 없는 UUID v4 (32자) — user_id · session_id 등 PK 생성에 쓴다.
 *
 * @returns 32자 hex
 */
export function generateId(): string {
    return v4().replace(/-/g, '');
}

/**
 * 만 18세 초과 여부 (만 18세 이하이면 false)
 *
 * @param birth YYYY-MM-DD
 * @returns 18세 초과면 true
 */
export function isAdult(birth: string): boolean {
    return dayjs().diff(dayjs(birth, 'YYYY-MM-DD'), 'year') > 18;
}

/**
 * SNS 로그인 ID 생성: {SNS_ID}_{YYYYMMDDHHmmssSSS}
 *
 * @param snsId SNS 유형
 * @returns 로그인 ID
 */
export function generateSnsLoginId(snsId: string): string {
    return `${snsId}_${dayjs().format('YYYYMMDDHHmmssSSS')}`;
}

/**
 * access(20m) / refresh(365d) 토큰 한 쌍 발급 + 만료시각 추출 — sign / login / tokenRefresh 공통.
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

/**
 * 로그인 회원 조회 행을 게이트웨이 인증용 결과 DTO 로 바꾼다.
 *
 * @param row 로그인 회원 조회 결과
 * @returns 로그인 회원 정보
 */
export function toUserAuthUserResult(row: LoginUserRow): UserAuthUserResultDto {
    const result = new UserAuthUserResultDto();
    result.user_id = row.user_id;
    result.login_id = row.login_id;
    result.name = row.name;
    result.gender = row.gender;
    result.birth = row.birth;
    result.nickname = row.nickname;
    result.auth_id = row.auth_id;
    result.store_id = row.store_id;
    result.state_id = row.state_id;
    result.is_login_able = row.is_login_able;
    return result;
}
