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

/**
 * 이용자 로그인 · 토큰 재발급 · 인증 확인(게이트웨이 jwt-user 전략의 auth-user) 상태 — 정상 · 이용 제한 · 탈퇴 대기(사용자 결정 2026-11-09).
 * 이용 제한(BLOCK) · 탈퇴 대기(LEAVE_WAIT)도 로그인한다 — 새 예약 · 연장만 막히고(예약 도메인), 탈퇴 대기는 14일 안에 탈퇴를 철회할 수 있어야 한다.
 * 매니저 · 관리자 그룹의 BLOCK 은 로그인 불가 그대로(그 그룹은 t_state.is_login_allowed 로 판정).
 */
export const USER_LOGIN_STATES = ['ACTIVE', 'BLOCK', 'LEAVE_WAIT'];
