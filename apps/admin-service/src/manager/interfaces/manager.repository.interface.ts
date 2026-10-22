import type {FindOptionsWhere} from 'typeorm';
import type {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import type {SessionEntity} from '@app/database/entities/user/session.entity.js';
import type {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 로그인 매니저 조회 결과 — 회원 컬럼 + 상태의 로그인 가능 여부 (QueryBuilder raw) */
export interface LoginManagerRow {
    user_id: string;
    login_id: string;
    name: string;
    auth_id: string;
    store_id: string | null;
    state_id: string;
    is_login_allowed: number;
}

/**
 * 매니저 repository 포트 — 공유 DB 의 t_user(매니저 그룹) · 세션 · SMS 인증 기록을 매니저 도메인 어휘로 다룬다.
 * WHERE 는 service 가 만들고 repository 는 실행 + DB 오류 변환만 한다.
 * insert · update 의 엔티티는 호출자가 `new XEntity()` + 필드 할당으로 만든다(@BeforeInsert/@BeforeUpdate 트리거).
 */
export interface ManagerRepositoryInterface {
    /** 매니저 단건 조회 (t_user) */
    findManager(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    /** 로그인 매니저 조회 — 매니저 그룹 · 로그인 가능 상태만 */
    findLoginManager(user_id: string): Promise<LoginManagerRow | null>;
    /** 매니저 정보 수정 (t_user) */
    updateManager(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
    insertSession(entity: SessionEntity): Promise<void>;
    findSession(where: FindOptionsWhere<SessionEntity>): Promise<SessionEntity | null>;
    insertSessionRefresh(entity: SessionRefreshEntity): Promise<void>;
    findSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>): Promise<SessionRefreshEntity | null>;
    updateSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>, entity: SessionRefreshEntity): Promise<void>;
    /** SMS 인증 발송 기록 등록 */
    insertSmsVerification(entity: SmsVerificationEntity): Promise<void>;
    /** SMS 인증 기록 개수 — 같은 번호 하루 발송 수 */
    countSmsVerifications(where: FindOptionsWhere<SmsVerificationEntity>): Promise<number>;
    /** SMS 인증 기록 단건 — 인증 ID + 용도로 찾는다 */
    findSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>): Promise<SmsVerificationEntity | null>;
    /** 확인 시도 1회 소비 — 한도 미만일 때만 +1, 확인과 같은 트랜잭션. 한도에 닿았으면 false */
    consumeSmsVerificationAttempt(sms_verification_id: string, max_attempts: number): Promise<boolean>;
    /** SMS 인증 기록 수정 (verified_at) */
    updateSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>, entity: SmsVerificationEntity): Promise<void>;
}
