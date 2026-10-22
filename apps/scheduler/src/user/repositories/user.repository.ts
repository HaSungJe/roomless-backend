import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserRepositoryInterface} from '../interfaces/user.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * scheduler 의 회원 repository (아웃바운드 어댑터) — crontab 이 쓰는 t_user 조회 · 수정.
 * crontab 은 트랜잭션 없이 건별로 처리하므로 `txHost.tx` 는 기본 EntityManager 다.
 */
@Injectable()
export class UserRepository implements UserRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_user repository (현재 트랜잭션 기준) */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /**
     * 회원 목록 조회
     *
     * @param where 조회 조건
     * @returns 회원 목록
     */
    async findUsers(where: FindOptionsWhere<UserEntity>): Promise<UserEntity[]> {
        try {
            return await this.buildUsersQuery(where).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 회원 목록 조회 쿼리 — find 와 같은 동작(setFindOptions + loadRelationIds). FK 문자열 where 가 매핑 민감이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건
     * @returns 쿼리 빌더
     */
    buildUsersQuery(where: FindOptionsWhere<UserEntity>): SelectQueryBuilder<UserEntity> {
        return this.users.createQueryBuilder('u').setFindOptions({where, loadRelationIds: true});
    }

    /**
     * 회원 정보 수정 — new UserEntity() + 할당으로 호출(@BeforeUpdate updated_at 트리거)
     *
     * @param where 수정 조건
     * @param entity 수정할 값
     */
    async updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void> {
        try {
            await this.users.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
