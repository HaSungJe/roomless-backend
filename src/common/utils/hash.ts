import { createHash } from 'crypto';

/**
 * SHA-256 해시 (hex)
 */
export function sha256Hex(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex');
}
