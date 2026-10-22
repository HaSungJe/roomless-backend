import {randomInt} from 'node:crypto';
import {sha256Hex} from '@app/common/utils/hash.js';
import {generateId} from '@app/common/utils/id.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import {DEFAULT_SMS_DAILY_LIMIT, SMS_CODE_TTL_MINUTES} from '../account.constants.js';

/** SMS 인증 기록 상태 — 사용 가능 · 이미 사용 · 만료 */
export type SmsVerificationState = 'USABLE' | 'USED' | 'EXPIRED';

/** buildSmsVerification 입력 */
export interface SmsVerificationInput {
    sms_purpose_id: string;
    user_id: string;
    phone: string;
    /** 인증번호 원문 — 해시로만 저장한다 */
    code: string;
    ip: string;
    now: Date;
}

/**
 * 숫자 6자리 인증번호 (암호학적 난수, 앞자리 0 유지).
 *
 * @returns 000000 ~ 999999
 */
export function generateVerificationCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * 같은 번호 하루 발송 한도 — env SMS_VERIFICATION_DAILY_LIMIT. 없거나 숫자가 아니거나 0 이하면 기본 10.
 *
 * @returns 한도
 */
export function getSmsDailyLimit(): number {
    const parsed = parseInt(process.env.SMS_VERIFICATION_DAILY_LIMIT ?? '', 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_SMS_DAILY_LIMIT;
}

/**
 * SMS 인증 기록 상태 — 이미 인증했으면 USED, 만료 시각이 지났으면(같으면 포함) EXPIRED.
 *
 * @param verification 인증 기록
 * @param now 기준 시각
 * @returns 상태
 */
export function checkSmsVerification(verification: SmsVerificationEntity, now: Date): SmsVerificationState {
    if (verification.verified_at) {
        return 'USED';
    }
    if (verification.expires_at.getTime() <= now.getTime()) {
        return 'EXPIRED';
    }
    return 'USABLE';
}

/**
 * SMS 인증 발송 기록 — 인증번호는 SHA-256 해시로만, 만료는 발송 + 5분.
 *
 * @param input 용도 · 회원 · 번호 · 인증번호 · IP · 기준 시각
 * @returns 저장할 엔티티
 */
export function buildSmsVerification(input: SmsVerificationInput): SmsVerificationEntity {
    const entity = new SmsVerificationEntity();
    entity.sms_verification_id = generateId();
    entity.sms_purpose_id = input.sms_purpose_id;
    entity.user_id = input.user_id;
    entity.phone = input.phone;
    entity.code_hash = sha256Hex(input.code);
    entity.attempt_count = 0;
    entity.expires_at = new Date(input.now.getTime() + SMS_CODE_TTL_MINUTES * 60 * 1000);
    entity.verified_at = null;
    entity.ip = input.ip || null;
    return entity;
}

/**
 * 인증번호 SMS 본문 — 한글 70자 안(1건 과금).
 *
 * @param code 인증번호
 * @returns 본문
 */
export function smsVerificationText(code: string): string {
    return `[roomless] 인증번호 [${code}] — ${SMS_CODE_TTL_MINUTES}분 안에 입력해주세요.`;
}
