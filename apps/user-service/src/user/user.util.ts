import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import {UserAuthUserResultDto} from '@app/contracts/user/dto/user-auth-user.dto.js';
import type {LoginUserRow} from './interfaces/user.repository.interface.js';
import {ADULT_AGE} from './user.constants.js';

/**
 * 성인 여부 — 청소년보호법 기준: 만 19세가 되는 해의 1월 1일부터 성인(한국 날짜의 올해 − 출생 연도 ≥ 19). 생일은 보지 않는다.
 *
 * @param birth YYYY-MM-DD
 * @param now 기준 시각 (기본: 지금)
 * @returns 성인이면 true
 */
export function isAdult(birth: string, now: Date = new Date()): boolean {
    return dayjs(now).tz(KST_TIMEZONE).year() - dayjs(birth, 'YYYY-MM-DD').year() >= ADULT_AGE;
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
 * 로그인 이용자 조회 행을 게이트웨이 인증용 결과 DTO 로 바꾼다.
 *
 * @param row 로그인 이용자 조회 결과
 * @returns 로그인 이용자 정보
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
