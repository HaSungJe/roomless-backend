/**
 * 회원 도메인 상수 — 도메인 값과, 여러 메서드 · 파일이 함께 쓰는 사용자 노출 메시지.
 * 한 곳에서만 쓰는 메시지는 throw 옆에 인라인 한국어 리터럴로 둔다.
 */

/** SMS 인증 용도 — t_sms_purpose PK (seeder.targets.ts 의 SMS_PURPOSE_SEED_DATA 와 같다) */
export const SMS_PURPOSE = {PHONE_VERIFY: 'PHONE_VERIFY', FIND_LOGIN_ID: 'FIND_LOGIN_ID', PASSWORD_RESET: 'PASSWORD_RESET'} as const;

/** 인증번호 유효 시간(분) */
export const SMS_CODE_TTL_MINUTES = 5;

/** 인증번호 1건당 확인 시도 한도 */
export const SMS_MAX_ATTEMPTS = 3;

/** 같은 번호 하루 발송 한도 기본값 — env SMS_VERIFICATION_DAILY_LIMIT 가 없거나 잘못됐을 때 */
export const DEFAULT_SMS_DAILY_LIMIT = 10;

/** 임시 비밀번호 길이 */
export const TEMPORARY_PASSWORD_LENGTH = 10;

/** 아이디 찾기 · 비밀번호 초기화 대상 상태 (탈퇴 완료 제외) */
export const ACCOUNT_RECOVERY_STATES = ['ACTIVE', 'BLOCK', 'LEAVE_WAIT'];

/** 만 18세 이하 가입 제한 (SNS · 일반 가입) */
export const UNDERAGE_MESSAGE = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';

/** 로그인 실패 — 아이디 · 비밀번호 · 상태 불일치 (SNS · 일반 로그인) */
export const INVALID_LOGIN_MESSAGE = '잘못된 로그인 정보입니다.';

/** 정지 계정 로그인 (SNS · 일반 로그인) */
export const BLOCKED_ACCOUNT_MESSAGE = '이용이 제한된 계정입니다.';

/** 토큰 재발급 실패 — 서명 · 만료 · 세션 · IP · 회원 상태 */
export const INVALID_TOKEN_MESSAGE = '유효하지 않은 토큰입니다.';

/** 탈퇴 신청 · 철회 대상 회원 없음 */
export const NO_MATCHING_USER_MESSAGE = '일치하는 회원이 없습니다.';

/** 로그인 회원 없음 (비밀번호 변경 · 휴대폰 인증) */
export const USER_NOT_FOUND_MESSAGE = '회원 정보를 찾을 수 없습니다.';

/** FK 대상 회원 없음 (repository 쓰기) */
export const USER_NOT_EXIST_MESSAGE = '존재하지 않는 회원입니다.';

/** 이미 휴대폰 인증을 마친 회원 (발송 · 확인) */
export const PHONE_ALREADY_VERIFIED_MESSAGE = '이미 휴대폰 인증을 마쳤습니다.';

/** 다른 계정이 이미 인증한 번호 — 번호 1개 = 계정 1개 (service 발송 확인 · repository UK_User_Phone) */
export const PHONE_TAKEN_MESSAGE = '이미 가입된 번호입니다.';

/** 같은 번호 하루 발송 한도 초과 */
export const SMS_DAILY_LIMIT_MESSAGE = '오늘은 이 번호로 인증번호를 더 보낼 수 없습니다. 내일 다시 시도해주세요.';

/** 확인할 인증 기록이 없을 때 — 인증 ID 가 틀렸거나 다른 회원 · 용도의 기록 */
export const SMS_VERIFICATION_NOT_FOUND_MESSAGE = '인증 정보를 찾을 수 없습니다. 인증번호를 다시 요청해주세요.';

/** 인증 기록 상태별 거부 메시지 (checkSmsVerification) */
export const SMS_STATE_MESSAGE: Record<'USED' | 'EXPIRED', string> = {
    USED: '이미 사용한 인증번호입니다. 인증번호를 다시 요청해주세요.',
    EXPIRED: '인증번호가 만료되었습니다. 인증번호를 다시 요청해주세요.',
};

/** 확인 시도 한도 초과 */
export const SMS_ATTEMPTS_EXCEEDED_MESSAGE = '인증번호 입력 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.';

/** 인증번호 불일치 */
export const SMS_CODE_MISMATCH_MESSAGE = '인증번호가 일치하지 않습니다.';

/** 아이디 찾기 · 비밀번호 초기화에서 일치하는 회원이 없을 때 */
export const ACCOUNT_NOT_FOUND_MESSAGE = '일치하는 회원 정보가 없습니다.';
