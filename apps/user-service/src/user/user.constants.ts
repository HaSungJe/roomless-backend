/**
 * 이용자 도메인 상수 — 도메인 값과, 여러 메서드 · 파일이 함께 쓰는 사용자 노출 메시지.
 * 매니저 · 관리자 도메인과 함께 쓰는 값 · 메시지는 libs/account 의 account.constants.ts 다.
 * 한 곳에서만 쓰는 메시지는 throw 옆에 인라인 한국어 리터럴로 둔다.
 */

/** 성인 나이 — 청소년보호법: 만 19세가 되는 해의 1월 1일부터 성인 */
export const ADULT_AGE = 19;

/** 미성년자 가입 제한 (SNS 가입) — 청소년보호법 기준 */
export const UNDERAGE_MESSAGE = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';

/** 탈퇴 신청 · 철회 대상 회원 없음 */
export const NO_MATCHING_USER_MESSAGE = '일치하는 회원이 없습니다.';

/** 이미 휴대폰 인증을 마친 회원 (발송 · 확인) */
export const PHONE_ALREADY_VERIFIED_MESSAGE = '이미 휴대폰 인증을 마쳤습니다.';

/** 이용자 그룹의 다른 계정이 이미 인증한 번호 — 번호 1개 = 계정 1개 (service 발송 확인 · repository UK_User_PhoneLoginScope) */
export const PHONE_TAKEN_MESSAGE = '이미 가입된 번호입니다.';
