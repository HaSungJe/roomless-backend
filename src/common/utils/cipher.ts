import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function getKey(): Buffer {
    const hex = process.env.TOKEN_CIPHER_KEY || '';
    if (hex.length !== 64) {
        throw new Error('TOKEN_CIPHER_KEY must be 32 bytes (64 hex chars).');
    }
    return Buffer.from(hex, 'hex');
}

/**
 * AES-256-GCM 암호화
 * 반환 형식: `${iv_hex}:${tag_hex}:${ciphertext_hex}`
 */
export function encryptAesGcm(plain: string): string {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, getKey(), iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

/**
 * AES-256-GCM 복호화
 */
export function decryptAesGcm(encoded: string): string {
    const [ivHex, tagHex, ctHex] = encoded.split(':');
    const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]);
    return pt.toString('utf8');
}
