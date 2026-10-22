import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder, UpdateQueryBuilder} from 'typeorm';
import {USER_NOT_EXIST_MESSAGE} from '@app/account/account.constants.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import {StateEntity} from '@app/database/entities/user/state.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {isForeignKeyViolation, isUniqueViolation} from '@app/database/typeorm-error.js';
import type {LoginManagerRow, ManagerRepositoryInterface} from '../interfaces/manager.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * 매니저 repository (아웃바운드 어댑터) — 공유 DB 의 t_user · t_session · t_session_refresh · t_sms_verification 을 직접 다룬다.
 * `txHost.tx` 는 `@Transactional()` 범위 안에서는 트랜잭션 EntityManager, 밖에서는 기본 EntityManager 다.
 */
@Injectable()
export class ManagerRepository implements ManagerRepositoryInterface {
    /**
     * @param txHost 트랜잭션 전파용 EntityManager 홀더
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_user repository (현재 트랜잭션 기준) */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /** t_session repository (현재 트랜잭션 기준) */
    private get sessions(): Repository<SessionEntity> {
        return this.txHost.tx.getRepository(SessionEntity);
    }

    /** t_session_refresh repository (현재 트랜잭션 기준) */
    private get sessionRefreshes(): Repository<SessionRefreshEntity> {
        return this.txHost.tx.getRepository(SessionRefreshEntity);
    }

    /** t_sms_verification repository (현재 트랜잭션 기준) */
    private get smsVerifications(): Repository<SmsVerificationEntity> {
        return this.txHost.tx.getRepository(SmsVerificationEntity);
    }

    /**
     * 매니저 단건 조회
     *
     * @param where 조회 조건
     * @returns 매니저 또는 null
     */
    async findManager(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.users.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 로그인 매니저 조회 — 매니저 그룹이고 로그인 가능 상태(is_login_allowed = 1)인 회원만.
     *
     * @param user_id 회원 ID
     * @returns 로그인 매니저 또는 null
     */
    async findLoginManager(user_id: string): Promise<LoginManagerRow | null> {
        try {
            return (await this.buildLoginManagerQuery(user_id).getRawOne<LoginManagerRow>()) ?? null;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 로그인 매니저 조회 쿼리 — 매핑 민감(조인 · raw select)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 회원 ID
     * @returns 쿼리 빌더
     */
    buildLoginManagerQuery(user_id: string): SelectQueryBuilder<UserEntity> {
        return this.users
            .createQueryBuilder('u')
            .select('u.user_id', 'user_id')
            .addSelect('u.login_id', 'login_id')
            .addSelect('u.name', 'name')
            .addSelect('u.auth_id', 'auth_id')
            .addSelect('u.store_id', 'store_id')
            .addSelect('u.state_id', 'state_id')
            .addSelect('s.is_login_allowed', 'is_login_allowed')
            .innerJoin(StateEntity, 's', 's.state_id = u.state_id')
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('s.is_login_allowed = 1');
    }

    /**
     * 매니저 정보 수정 — new UserEntity() + 할당으로 호출(@BeforeUpdate updated_at 트리거).
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateManager(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void> {
        try {
            await this.users.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 세션 등록
     *
     * @param entity new SessionEntity() + 할당
     */
    async insertSession(entity: SessionEntity): Promise<void> {
        try {
            await this.sessions.insert(entity);
        } catch (error) {
            if (isForeignKeyViolation(error, 'FK_Session_User')) {
                throw new BadRequestException({message: USER_NOT_EXIST_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 세션 단건 조회
     *
     * @param where 조회 조건
     * @returns 세션 또는 null
     */
    async findSession(where: FindOptionsWhere<SessionEntity>): Promise<SessionEntity | null> {
        try {
            return await this.sessions.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * Refresh Token 등록
     *
     * @param entity new SessionRefreshEntity() + 할당
     */
    async insertSessionRefresh(entity: SessionRefreshEntity): Promise<void> {
        try {
            await this.sessionRefreshes.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_SessionRefresh_RefreshHash')) {
                throw new BadRequestException({message: '이미 존재하는 Refresh Token입니다.'});
            } else if (isForeignKeyViolation(error, 'FK_SessionRefresh_Session')) {
                throw new BadRequestException({message: '존재하지 않는 세션입니다.'});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * Refresh 세션 단건 조회
     *
     * @param where 조회 조건
     * @returns refresh 또는 null
     */
    async findSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>): Promise<SessionRefreshEntity | null> {
        try {
            return await this.sessionRefreshes.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * Refresh 세션 수정 (expires_at 단축 등)
     *
     * @param where 수정 조건
     * @param entity new SessionRefreshEntity() + 할당
     */
    async updateSessionRefresh(where: FindOptionsWhere<SessionRefreshEntity>, entity: SessionRefreshEntity): Promise<void> {
        try {
            await this.sessionRefreshes.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * SMS 인증 발송 기록 등록 — FK 위반을 제약명별 400 으로 바꾼다.
     *
     * @param entity new SmsVerificationEntity() + 할당
     */
    async insertSmsVerification(entity: SmsVerificationEntity): Promise<void> {
        try {
            await this.smsVerifications.insert(entity);
        } catch (error) {
            if (isForeignKeyViolation(error, 'FK_SmsVerification_SmsPurpose')) {
                throw new BadRequestException({message: '존재하지 않는 SMS 인증 용도입니다.'});
            } else if (isForeignKeyViolation(error, 'FK_SmsVerification_User')) {
                throw new BadRequestException({message: USER_NOT_EXIST_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * SMS 인증 기록 개수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countSmsVerifications(where: FindOptionsWhere<SmsVerificationEntity>): Promise<number> {
        try {
            return await this.smsVerifications.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * SMS 인증 기록 단건 — 확인은 발송 결과로 내려준 인증 ID 로 한다.
     *
     * @param where 조회 조건 (인증 ID + 용도)
     * @returns 인증 기록 또는 null
     */
    async findSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>): Promise<SmsVerificationEntity | null> {
        try {
            return await this.smsVerifications.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 확인 시도 1회 소비 — attempt_count < max 인 행만 원자적으로 +1 한다.
     * 확인과 같은 트랜잭션에서 실행한다 — 인증번호 불일치는 service 가 예외를 return 해 트랜잭션이 커밋되므로 소비한 횟수가 남는다.
     *
     * @param sms_verification_id 인증 기록 ID
     * @param max_attempts 시도 한도
     * @returns 소비했으면 true, 이미 한도에 닿았으면 false
     */
    async consumeSmsVerificationAttempt(sms_verification_id: string, max_attempts: number): Promise<boolean> {
        try {
            const result = await this.buildConsumeSmsVerificationAttemptQuery(sms_verification_id, max_attempts).execute();
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 확인 시도 소비 쿼리 — 매핑 민감(QueryBuilder 갱신 · 식 할당)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param sms_verification_id 인증 기록 ID
     * @param max_attempts 시도 한도
     * @returns 쿼리 빌더
     */
    buildConsumeSmsVerificationAttemptQuery(sms_verification_id: string, max_attempts: number): UpdateQueryBuilder<SmsVerificationEntity> {
        return this.smsVerifications
            .createQueryBuilder()
            .update(SmsVerificationEntity)
            .set({attempt_count: () => 'attempt_count + 1', updated_at: () => 'CURRENT_TIMESTAMP'})
            .where('sms_verification_id = :sms_verification_id', {sms_verification_id})
            .andWhere('attempt_count < :max_attempts', {max_attempts});
    }

    /**
     * SMS 인증 기록 수정 (verified_at)
     *
     * @param where 수정 조건
     * @param entity new SmsVerificationEntity() + 할당
     */
    async updateSmsVerification(where: FindOptionsWhere<SmsVerificationEntity>, entity: SmsVerificationEntity): Promise<void> {
        try {
            await this.smsVerifications.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
