import dayjs from 'dayjs';
import { JwtService } from '@nestjs/jwt';
import { extractJwtExpiresAt } from '@root/common/utils/jwt';

/**
 * 만 18세 초과 여부 확인 (만 18세 이하이면 false)
 * @param birth YYYY-MM-DD
 */
export function isAdult(birth: string): boolean {
    return dayjs().diff(dayjs(birth, 'YYYY-MM-DD'), 'year') > 18;
}

/**
 * SNS 로그인 ID 생성: {SNS_ID}_{YYYYMMDDHHmmssSSS}
 */
export function generateSnsLoginId(snsId: string): string {
    return `${snsId}_${dayjs().format('YYYYMMDDHHmmssSSS')}`;
}

export interface AccessRefreshSet {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
}

/**
 * access(20m) / refresh(365d) 토큰 한 쌍 발급 + 만료시각 추출
 * sign / login / tokenRefresh 공통 사용
 */
export function issueAccessAndRefresh(
    jwtService: JwtService,
    payload: {user_id: string; session_id: string},
): AccessRefreshSet {
    const accessToken = jwtService.sign({type: 'access', ...payload}, {expiresIn: '20m'});
    const refreshToken = jwtService.sign({type: 'refresh', ...payload}, {expiresIn: '365d'});
    return {
        accessToken,
        refreshToken,
        accessTokenExpiresAt: extractJwtExpiresAt(accessToken),
        refreshTokenExpiresAt: extractJwtExpiresAt(refreshToken),
    };
}
