import {v4} from 'uuid';

/**
 * 하이픈 없는 UUID v4 (32자) — user_id · session_id · sms_verification_id 등 PK 생성에 쓴다.
 *
 * @returns 32자 hex
 */
export function generateId(): string {
    return v4().replace(/-/g, '');
}
