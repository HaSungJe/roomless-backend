import type {FindOptionsWhere} from 'typeorm';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
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

/** 업체 관리자 관리 필터 (총관리자 · 관리자) — null 이면 그 조건 없음, user_id 는 상세 */
export interface ManagerAccountFilter {
    user_id: string | null;
    keyword: string | null;
    store_id: string | null;
    auth_id: string | null;
    state_id: string | null;
}

/** 업체 관리자 행 — 매니저 계정 + 업체(상호명 · 업체코드 · 업체 상태) (QueryBuilder raw) */
export interface ManagerAccountRow {
    user_id: string;
    store_id: string;
    store_name: string;
    store_code: string;
    store_state_id: string;
    login_id: string;
    name: string;
    phone: string | null;
    gender: string;
    birth: string;
    auth_id: string;
    state_id: string;
    block_comment: string | null;
    is_password_change_required: number;
    created_at: Date;
}

/**
 * 매니저 repository 포트 — 공유 DB 의 t_user(매니저 그룹 · 업체 인력) · 세션 · SMS 인증 기록과 매니저 소속 업체(t_store)를 매니저 도메인 어휘로 다룬다.
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
    /** 매니저 소속 업체 (t_store) — 업체코드 · 업체 ID 로 찾는다 */
    findManagerStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 업체 인력 수 (t_user 매니저 그룹) — 목록 · 같은 업체 안 아이디 · 번호 확인 */
    countStaff(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number>;
    /** 업체 인력 목록 — 업체 총관리자가 위, 등록일 최신순 */
    findStaffList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]>;
    /** 업체 관리자 계정 등록 — 업체 안 아이디 · 휴대폰 번호 UK → 400 */
    insertStaff(entity: UserEntity): Promise<void>;
    /** 업체 관리자 수정 · 삭제 — 업체 안 휴대폰 번호 UK → 400 */
    updateStaff(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
    /** 업체 관리자 수 (총관리자 · 관리자 — 전체 업체, 업체 조인 · 검색) */
    countAccounts(filter: ManagerAccountFilter): Promise<number>;
    /** 업체 관리자 목록 — 등록 최신순 */
    findAccountRows(filter: ManagerAccountFilter, limit: number, offset: number): Promise<ManagerAccountRow[]>;
    /** 업체 관리자 단건 — 매니저 그룹 · ACTIVE · BLOCK 만 */
    findAccountRow(user_id: string): Promise<ManagerAccountRow | null>;
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
