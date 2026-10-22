import type {FindOptionsWhere} from 'typeorm';
import type {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import type {SessionEntity} from '@app/database/entities/user/session.entity.js';
import type {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import type {UserSettingEntity} from '@app/database/entities/user/user-setting.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 로그인 회원 조회 결과 — 회원 컬럼 + 상태의 로그인 가능 여부 (QueryBuilder raw) */
export interface LoginUserRow {
    user_id: string;
    login_id: string;
    name: string;
    gender: string;
    birth: string;
    nickname: string;
    auth_id: string;
    store_id: string | null;
    state_id: string;
    /** 휴대폰 SMS 인증일 (미인증 null) */
    phone_verified_at: Date | null;
    is_login_allowed: number;
}

/**
 * 회원 repository 포트.
 * WHERE 는 service 가 만들고 repository 는 실행 + DB 오류 변환만 한다.
 * insert · update 의 엔티티는 호출자가 `new XEntity()` + 필드 할당으로 만든다(@BeforeInsert/@BeforeUpdate 트리거).
 */
export interface UserRepositoryInterface {
    insertUser(entity: UserEntity): Promise<void>;
    insertUserSetting(entity: UserSettingEntity): Promise<void>;
    insertSession(entity: SessionEntity): Promise<void>;
    insertSessionRefresh(entity: SessionRefreshEntity): Promise<void>;
    findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    findLoginUser(user_id: string): Promise<LoginUserRow | null>;
    findSession(where: FindOptionsWhere<SessionEntity>): Promise<SessionEntity | null>;
    findSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>): Promise<SessionRefreshEntity | null>;
    updateSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>, entity: SessionRefreshEntity): Promise<void>;
    updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
    /** SMS 인증 발송 기록 등록 */
    insertSmsVerification(entity: SmsVerificationEntity): Promise<void>;
    /** SMS 인증 기록 개수 — 같은 번호 하루 발송 수 */
    countSmsVerifications(where: FindOptionsWhere<SmsVerificationEntity>): Promise<number>;
    /** SMS 인증 기록 단건 — 인증 ID + 용도(+ 회원)로 찾는다 */
    findSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>): Promise<SmsVerificationEntity | null>;
    /** 확인 시도 1회 소비 — 한도 미만일 때만 +1, 확인과 같은 트랜잭션. 한도에 닿았으면 false */
    consumeSmsVerificationAttempt(sms_verification_id: string, max_attempts: number): Promise<boolean>;
    /** SMS 인증 기록 수정 (verified_at) */
    updateSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>, entity: SmsVerificationEntity): Promise<void>;
}
