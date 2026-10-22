import {randomInt} from 'node:crypto';
import {TEMPORARY_PASSWORD_LENGTH} from '../account.constants.js';

/** 임시 비밀번호에 쓰는 문자 — 영문 대소문자 + 숫자 */
const TEMPORARY_PASSWORD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * 영문 + 숫자 10자리 임시 비밀번호 — 영문 · 숫자가 각각 1자 이상이라 비밀번호 변경 규칙(영문 + 숫자 필수)을 통과한다.
 *
 * @returns 임시 비밀번호
 */
export function generateTemporaryPassword(): string {
    for (;;) {
        const password = Array.from({length: TEMPORARY_PASSWORD_LENGTH}, () => TEMPORARY_PASSWORD_CHARS[randomInt(TEMPORARY_PASSWORD_CHARS.length)]).join('');
        if (/[A-Za-z]/.test(password) && /\d/.test(password)) {
            return password;
        }
    }
}

/**
 * 임시 비밀번호 SMS 본문 — 한글 70자 안(1건 과금).
 *
 * @param password 임시 비밀번호
 * @returns 본문
 */
export function temporaryPasswordText(password: string): string {
    return `[roomless] 임시 비밀번호 ${password} — 로그인 후 비밀번호를 바꿔주세요.`;
}
