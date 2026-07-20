import { decode } from 'jsonwebtoken';

/**
 * JWT 문자열에서 exp(초) 를 추출해 Date 로 변환
 */
export function extractJwtExpiresAt(token: string): Date {
    const payload = decode(token) as {exp?: number} | null;
    if (!payload?.exp) {
        throw new Error('Invalid JWT: exp claim missing.');
    }
    return new Date(payload.exp * 1000);
}
