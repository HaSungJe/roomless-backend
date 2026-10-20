import {randomInt} from 'node:crypto';
import type {JwtService} from '@nestjs/jwt';
import dayjs from 'dayjs';
import {v4} from 'uuid';
import {sha256Hex} from '@app/common/utils/hash.js';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {UserAuthUserResultDto} from '@app/contracts/user/dto/user-auth-user.dto.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import type {LoginUserRow} from './interfaces/user.repository.interface.js';
import {DEFAULT_SMS_DAILY_LIMIT, SMS_CODE_TTL_MINUTES, TEMPORARY_PASSWORD_LENGTH} from './user.constants.js';

/** 한국 표준시 오프셋(ms) — 서머타임 없음 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 임시 비밀번호에 쓰는 문자 — 영문 대소문자 + 숫자 */
const TEMPORARY_PASSWORD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

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
    result.is_login_allowed = row.is_login_allowed;
    result.is_phone_verified = row.phone_verified_at ? 1 : 0;
    return result;
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
 * 그 시각이 속한 한국 날짜의 0시(KST) — 같은 번호 하루 발송 수를 세는 시작점.
 *
 * @param now 기준 시각
 * @returns 한국 날짜 0시의 Date
 */
export function kstDayStart(now: Date): Date {
    const kst = new Date(now.getTime() + KST_OFFSET_MS);
    kst.setUTCHours(0, 0, 0, 0);
    return new Date(kst.getTime() - KST_OFFSET_MS);
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

/**
 * 임시 비밀번호 SMS 본문 — 한글 70자 안(1건 과금).
 *
 * @param password 임시 비밀번호
 * @returns 본문
 */
export function temporaryPasswordText(password: string): string {
    return `[roomless] 임시 비밀번호 ${password} — 로그인 후 비밀번호를 바꿔주세요.`;
}
