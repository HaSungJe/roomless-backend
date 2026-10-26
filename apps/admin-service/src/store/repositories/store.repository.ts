import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {DeleteQueryBuilder, FindOptionsWhere, Repository, SelectQueryBuilder, UpdateQueryBuilder} from 'typeorm';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {isUniqueViolation} from '@app/database/typeorm-error.js';
import type {StoreFileRow, StoreRepositoryInterface} from '../interfaces/store.repository.interface.js';
import {STORE_BUSINESS_NUMBER_TAKEN_MESSAGE} from '../store.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * store repository (아웃바운드 어댑터) — t_store_application · t_store · t_store_file · t_store_file_purpose 와
 * 공유 DB 의 t_user(신청자 · 업체 총관리자 · 업체 매니저)를 직접 다룬다. `txHost.tx` 는 `@Transactional()` 범위 안에서는 트랜잭션 EntityManager 다.
 */
@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    /**
     * @param txHost 트랜잭션 전파용 EntityManager 홀더
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_store_application repository (현재 트랜잭션 기준) */
    private get applications(): Repository<StoreApplicationEntity> {
        return this.txHost.tx.getRepository(StoreApplicationEntity);
    }

    /** t_store_file_purpose repository (현재 트랜잭션 기준) */
    private get storeFilePurposes(): Repository<StoreFilePurposeEntity> {
        return this.txHost.tx.getRepository(StoreFilePurposeEntity);
    }

    /** t_store_file repository (현재 트랜잭션 기준) */
    private get storeFiles(): Repository<StoreFileEntity> {
        return this.txHost.tx.getRepository(StoreFileEntity);
    }

    /** t_store repository (현재 트랜잭션 기준) */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_user repository (현재 트랜잭션 기준) */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /**
     * 입점 신청 단건
     *
     * @param where 조회 조건
     * @returns 신청 또는 null
     */
    async findApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<StoreApplicationEntity | null> {
        try {
            return await this.applications.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 개수
     *
     * @param where 조회 조건 (배열 = OR)
     * @returns 개수
     */
    async countApplications(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[]): Promise<number> {
        try {
            return await this.applications.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 목록
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 신청 목록 (신청일 최신순)
     */
    async findApplicationList(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[], limit: number, offset: number): Promise<StoreApplicationEntity[]> {
        try {
            return await this.buildApplicationListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 목록 쿼리 — 매핑 민감(관계 필드 where · ILike · 배열 OR)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildApplicationListQuery(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[], limit: number, offset: number): SelectQueryBuilder<StoreApplicationEntity> {
        return this.applications.createQueryBuilder('a').setFindOptions({where, order: {created_at: 'DESC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 입점 신청 등록
     *
     * @param entity new StoreApplicationEntity() + 할당
     */
    async insertApplication(entity: StoreApplicationEntity): Promise<void> {
        try {
            await this.applications.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 수정 — 승인 · 반려. 상태를 조건에 넣으면 그 사이 바뀐(취소 · 승인 · 반려) 신청은 0건이다.
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 바꿨으면 true, 조건에 맞는 행이 없으면 false
     */
    async updateApplication(where: FindOptionsWhere<StoreApplicationEntity>, entity: StoreApplicationEntity): Promise<boolean> {
        try {
            const result = await this.applications.update(where, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 삭제 — 취소. 업체 정보 파일(FK RESTRICT)을 같은 트랜잭션에서 먼저 지운다.
     *
     * @param where 삭제 조건
     * @returns 지웠으면 true, 조건에 맞는 행이 없으면 false
     */
    async deleteApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<boolean> {
        try {
            const result = await this.applications.delete(where);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 용도 단건
     *
     * @param store_file_purpose_id 용도 ID
     * @returns 용도(비공개 여부 포함) 또는 null
     */
    async findStoreFilePurpose(store_file_purpose_id: string): Promise<StoreFilePurposeEntity | null> {
        try {
            return await this.storeFilePurposes.findOne({where: {store_file_purpose_id}});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 신청의 업체 정보 파일
     *
     * @param store_application_id 입점 신청 ID
     * @returns 파일 행 (용도 · 정렬 순서, 비공개 여부 포함)
     */
    async findApplicationFileRows(store_application_id: string): Promise<StoreFileRow[]> {
        try {
            return await this.buildStoreFileRowsQuery('store_application_id', store_application_id).getRawMany<StoreFileRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체의 업체 정보 파일
     *
     * @param store_id 업체 ID
     * @returns 파일 행 (용도 · 정렬 순서, 비공개 여부 포함)
     */
    async findStoreFileRows(store_id: string): Promise<StoreFileRow[]> {
        try {
            return await this.buildStoreFileRowsQuery('store_id', store_id).getRawMany<StoreFileRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 조회 쿼리 — 매핑 민감(용도 조인 · raw select)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param column 기준 컬럼 (신청 · 업체)
     * @param id 신청 ID 또는 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreFileRowsQuery(column: 'store_application_id' | 'store_id', id: string): SelectQueryBuilder<StoreFileEntity> {
        return this.storeFiles
            .createQueryBuilder('f')
            .select('f.store_file_id', 'store_file_id')
            .addSelect('f.store_file_purpose_id', 'store_file_purpose_id')
            .addSelect('f.store_application_id', 'store_application_id')
            .addSelect('f.store_id', 'store_id')
            .addSelect('f.file_key', 'file_key')
            .addSelect('f.file_name', 'file_name')
            .addSelect('f.content_type', 'content_type')
            .addSelect('f.sort_order', 'sort_order')
            .addSelect('f.created_at', 'created_at')
            .addSelect('p.is_private', 'is_private')
            .innerJoin(StoreFilePurposeEntity, 'p', 'p.store_file_purpose_id = f.store_file_purpose_id')
            .where(`f.${column} = :id`, {id})
            .orderBy('f.store_file_purpose_id', 'ASC')
            .addOrderBy('f.sort_order', 'ASC')
            .addOrderBy('f.created_at', 'ASC');
    }

    /**
     * 업체 정보 파일 개수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countStoreFiles(where: FindOptionsWhere<StoreFileEntity>): Promise<number> {
        try {
            return await this.storeFiles.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 단건
     *
     * @param where 조회 조건
     * @returns 파일 또는 null
     */
    async findStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity | null> {
        try {
            return await this.storeFiles.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 등록 — 같은 저장 키는 400
     *
     * @param entity new StoreFileEntity() + 할당
     */
    async insertStoreFile(entity: StoreFileEntity): Promise<void> {
        try {
            await this.storeFiles.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_StoreFile_FileKey')) {
                throw new BadRequestException({message: '이미 등록된 파일입니다.'});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 업체 정보 파일 삭제
     *
     * @param where 삭제 조건
     */
    async deleteStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<void> {
        try {
            await this.storeFiles.delete(where);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 신청의 업체 정보 파일 삭제 — 신청 취소. 아직 업체에 붙지 않은(store_id 없음) 파일만 지운다 — 그 사이 승인된 신청의 파일은 남는다.
     *
     * @param store_application_id 입점 신청 ID
     */
    async deleteApplicationFiles(store_application_id: string): Promise<void> {
        try {
            await this.buildDeleteApplicationFilesQuery(store_application_id).execute();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 신청의 업체 정보 파일 삭제 쿼리 — 매핑 민감(QueryBuilder 삭제 · 관계 컬럼 IS NULL)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_application_id 입점 신청 ID
     * @returns 쿼리 빌더
     */
    buildDeleteApplicationFilesQuery(store_application_id: string): DeleteQueryBuilder<StoreFileEntity> {
        return this.storeFiles.createQueryBuilder().delete().from(StoreFileEntity).where('store_application_id = :store_application_id', {store_application_id}).andWhere('store_id IS NULL');
    }

    /**
     * 신청의 업체 정보 파일을 업체로 — 승인 때 store_id 를 채운다(파일은 옮기지 않는다)
     *
     * @param store_application_id 입점 신청 ID
     * @param store_id 등록한 업체 ID
     */
    async assignStoreFiles(store_application_id: string, store_id: string): Promise<void> {
        try {
            await this.buildAssignStoreFilesQuery(store_application_id, store_id).execute();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 업체 지정 쿼리 — 매핑 민감(QueryBuilder 갱신 · 관계 컬럼)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_application_id 입점 신청 ID
     * @param store_id 등록한 업체 ID
     * @returns 쿼리 빌더
     */
    buildAssignStoreFilesQuery(store_application_id: string, store_id: string): UpdateQueryBuilder<StoreFileEntity> {
        return this.storeFiles.createQueryBuilder().update(StoreFileEntity).set({store_id}).where('store_application_id = :store_application_id', {store_application_id});
    }

    /**
     * 업체 단건
     *
     * @param where 조회 조건
     * @returns 업체 또는 null
     */
    async findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 여러 건
     *
     * @param where 조회 조건
     * @returns 업체 목록
     */
    async findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]> {
        try {
            return await this.stores.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 개수
     *
     * @param where 조회 조건 (배열 = OR)
     * @returns 개수
     */
    async countStores(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number> {
        try {
            return await this.stores.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 목록
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 업체 목록 (등록일 최신순)
     */
    async findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]> {
        try {
            return await this.buildStoreListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 목록 쿼리 — 매핑 민감(관계 필드 where · ILike · 배열 OR)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildStoreListQuery(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): SelectQueryBuilder<StoreEntity> {
        return this.stores.createQueryBuilder('s').setFindOptions({where, order: {created_at: 'DESC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 업체 등록 — 사업자등록번호가 이미 있으면 400
     *
     * @param entity new StoreEntity() + 할당
     */
    async insertStore(entity: StoreEntity): Promise<void> {
        try {
            await this.stores.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_Store_BusinessNumber')) {
                throw new BadRequestException({message: STORE_BUSINESS_NUMBER_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 업체 수정
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void> {
        try {
            await this.stores.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 신청자 — t_user 이용자 그룹
     *
     * @param user_id 신청한 이용자 ID
     * @returns 회원 또는 null
     */
    async findApplicant(user_id: string): Promise<UserEntity | null> {
        try {
            return await this.users.findOne({where: {user_id, login_scope: LOGIN_SCOPE.USER}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 총관리자 계정 등록 — 아이디 · 휴대폰 번호 유일성은 업체 단위라 새 업체에서는 겹치지 않는다
     *
     * @param entity new UserEntity() + 할당
     */
    async insertHeadManager(entity: UserEntity): Promise<void> {
        try {
            await this.users.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그 업체 매니저 그룹 회원 상태 변경
     *
     * @param store_id 업체 ID
     * @param state_id 바꿀 상태
     * @param block_comment 정지 사유
     */
    async updateStoreManagers(store_id: string, state_id: string, block_comment: string | null): Promise<void> {
        try {
            await this.buildUpdateStoreManagersQuery(store_id, state_id, block_comment).execute();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 매니저 상태 변경 쿼리 — 매핑 민감(QueryBuilder 갱신 · 관계 컬럼 where)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @param state_id 바꿀 상태
     * @param block_comment 정지 사유
     * @returns 쿼리 빌더
     */
    buildUpdateStoreManagersQuery(store_id: string, state_id: string, block_comment: string | null): UpdateQueryBuilder<UserEntity> {
        return this.users
            .createQueryBuilder()
            .update(UserEntity)
            .set({state_id, block_comment, updated_at: () => 'CURRENT_TIMESTAMP'})
            .where('store_id = :store_id', {store_id})
            .andWhere('login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER});
    }
}
