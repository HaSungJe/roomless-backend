import {createHash} from 'node:crypto';

/**
 * SHA-256 해시 (hex)
 *
 * @param input 원문
 * @returns 64자 hex 문자열
 */
export function sha256Hex(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex');
}
