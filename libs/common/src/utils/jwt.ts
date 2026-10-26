import jsonwebtoken from 'jsonwebtoken';
import {dayjs} from '@app/common/utils/dayjs.js';

/**
 * JWT 문자열에서 exp(초)를 추출해 Date 로 변환한다(서명 검증 없음).
 *
 * @param token JWT
 * @returns 만료 시각
 * @throws exp 클레임이 없으면 Error
 */
export function extractJwtExpiresAt(token: string): Date {
    const payload = jsonwebtoken.decode(token) as {exp?: number} | null;
    if (!payload?.exp) {
        throw new Error('Invalid JWT: exp claim missing.');
    }
    return dayjs.unix(payload.exp).toDate();
}
