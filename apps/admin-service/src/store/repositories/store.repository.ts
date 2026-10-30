import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder, UpdateQueryBuilder} from 'typeorm';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import {isUniqueViolation} from '@app/database/typeorm-error.js';
import type {StoreFileRow, StoreRepositoryInterface} from '../interfaces/store.repository.interface.js';
import {STORE_BUSINESS_NUMBER_TAKEN_MESSAGE, STORE_STATE} from '../store.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * store repository (아웃바운드 어댑터) — t_store_application · t_store · t_store_file · t_store_file_purpose · t_store_hour · t_store_break · t_store_unavailable_period 와
 * 공유 DB 의 t_user(신청자 · 업체 총관리자 · 업체 매니저) · 업체 상품 설정 t_room_plan 을 직접 다룬다. `txHost.tx` 는 `@Transactional()` 범위 안에서는 트랜잭션 EntityManager 다.
 * 삭제는 소프트 삭제(is_deleted = 1)이고, is_deleted 가 있는 테이블의 조회 · 개수 · 수정에는 항상 is_deleted = 0 을 붙인다(notDeleted · QueryBuilder 조건 — service 는 넣지 않는다).
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

    /** t_store_hour repository (현재 트랜잭션 기준) */
    private get storeHours(): Repository<StoreHourEntity> {
        return this.txHost.tx.getRepository(StoreHourEntity);
    }

    /** t_store_break repository (현재 트랜잭션 기준) */
    private get storeBreaks(): Repository<StoreBreakEntity> {
        return this.txHost.tx.getRepository(StoreBreakEntity);
    }

    /** t_store_unavailable_period repository (현재 트랜잭션 기준) */
    private get unavailablePeriods(): Repository<StoreUnavailablePeriodEntity> {
        return this.txHost.tx.getRepository(StoreUnavailablePeriodEntity);
    }

    /** t_room_plan repository (현재 트랜잭션 기준) — 업체 상품 설정, 입점 승인 때 상품 종류마다 1행 */
    private get roomPlans(): Repository<RoomPlanEntity> {
        return this.txHost.tx.getRepository(RoomPlanEntity);
    }

    /**
     * 입점 신청 단건
     *
     * @param where 조회 조건
     * @returns 신청 또는 null
     */
    async findApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<StoreApplicationEntity | null> {
        try {
            return await this.applications.findOne({where: notDeleted(where), loadRelationIds: true});
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
            return await this.applications.count({where: notDeleted(where)});
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
        return this.applications.createQueryBuilder('a').setFindOptions({where: notDeleted(where), order: {created_at: 'DESC'}, take: limit, skip: offset, loadRelationIds: true});
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
            const result = await this.applications.update(notDeleted(where), entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 삭제 — 취소. 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제). 업체 정보 파일은 같은 트랜잭션에서 먼저 삭제 표시한다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     * @returns 지웠으면 true, 조건에 맞는 행이 없으면 false
     */
    async deleteApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<boolean> {
        try {
            const entity = new StoreApplicationEntity();
            entity.is_deleted = 1;
            const result = await this.applications.update(notDeleted(where), entity);
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
     * 업체 정보 파일 조회 쿼리 — 지워지지 않은 파일만. 매핑 민감(용도 조인 · raw select)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
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
            .andWhere('f.is_deleted = 0')
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
            return await this.storeFiles.count({where: notDeleted(where)});
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
            return await this.storeFiles.findOne({where: notDeleted(where), loadRelationIds: true});
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
     * 업체 정보 파일 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제). S3 객체는 service 가 실제로 지운다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<void> {
        try {
            const entity = new StoreFileEntity();
            entity.is_deleted = 1;
            await this.storeFiles.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 수정 — 업체 사진 정렬 순서
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateStoreFile(where: FindOptionsWhere<StoreFileEntity>, entity: StoreFileEntity): Promise<void> {
        try {
            await this.storeFiles.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 신청의 업체 정보 파일 삭제 — 신청 취소. 아직 업체에 붙지 않은(store_id 없음) 파일만 삭제 표시한다(소프트 삭제) — 그 사이 승인된 신청의 파일은 남는다.
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
     * 신청의 업체 정보 파일 삭제 쿼리 — 삭제 표시(is_deleted = 1 · 수정일)로 바꾼다(소프트 삭제 — QueryBuilder 갱신은 훅이 돌지 않아 수정일을 직접 넣는다).
     * 매핑 민감(QueryBuilder 갱신 · 관계 컬럼 IS NULL)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_application_id 입점 신청 ID
     * @returns 쿼리 빌더
     */
    buildDeleteApplicationFilesQuery(store_application_id: string): UpdateQueryBuilder<StoreFileEntity> {
        return this.storeFiles
            .createQueryBuilder()
            .update(StoreFileEntity)
            .set({is_deleted: 1, updated_at: () => 'CURRENT_TIMESTAMP'})
            .where('store_application_id = :store_application_id', {store_application_id})
            .andWhere('store_id IS NULL')
            .andWhere('is_deleted = 0');
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
     * 업체 정보 파일 업체 지정 쿼리 — 지워지지 않은 파일만, 수정일도 넣는다(QueryBuilder 갱신은 훅이 돌지 않는다).
     * 매핑 민감(QueryBuilder 갱신 · 관계 컬럼)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_application_id 입점 신청 ID
     * @param store_id 등록한 업체 ID
     * @returns 쿼리 빌더
     */
    buildAssignStoreFilesQuery(store_application_id: string, store_id: string): UpdateQueryBuilder<StoreFileEntity> {
        return this.storeFiles
            .createQueryBuilder()
            .update(StoreFileEntity)
            .set({store_id, updated_at: () => 'CURRENT_TIMESTAMP'})
            .where('store_application_id = :store_application_id', {store_application_id})
            .andWhere('is_deleted = 0');
    }

    /**
     * 업체 단건
     *
     * @param where 조회 조건
     * @returns 업체 또는 null
     */
    async findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where: notDeleted(where), loadRelationIds: true});
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
            return await this.stores.find({where: notDeleted(where), loadRelationIds: true});
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
            return await this.stores.count({where: notDeleted(where)});
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
        return this.stores.createQueryBuilder('s').setFindOptions({where: notDeleted(where), order: {created_at: 'DESC'}, take: limit, skip: offset, loadRelationIds: true});
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
     * 업체 상품 설정 등록 — 입점 승인 때 상품 종류마다 1행. 방금 만든 업체라 UK · CHECK 위반이 없으므로 위반은 통일 500
     *
     * @param entities new RoomPlanEntity() + 할당 (상품 종류마다 1개)
     */
    async insertStorePlans(entities: RoomPlanEntity[]): Promise<void> {
        try {
            await this.roomPlans.insert(entities);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
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
            await this.stores.update(notDeleted(where), entity);
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

    /**
     * 매니저의 소속 업체 — 매니저 그룹 회원의 store_id 로 찾는다. 탈퇴 업체는 없는 것과 같다.
     *
     * @param user_id 로그인 매니저 ID
     * @param lock true 면 업체 행을 잠근다(FOR UPDATE — 같은 업체의 설정 쓰기를 한 번에 하나로). 트랜잭션 안에서만
     * @returns 업체 또는 null
     */
    async findStoreByManager(user_id: string, lock: boolean): Promise<StoreEntity | null> {
        try {
            return await this.buildStoreByManagerQuery(user_id, lock).getOne();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 매니저의 소속 업체 쿼리 — 매핑 민감(t_user 조인 · 관계 컬럼 · 잠금)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 로그인 매니저 ID
     * @param lock true 면 업체 행만 잠근다(FOR UPDATE OF s — 매니저 행은 잠그지 않는다)
     * @returns 쿼리 빌더
     */
    buildStoreByManagerQuery(user_id: string, lock: boolean): SelectQueryBuilder<StoreEntity> {
        const query = this.stores
            .createQueryBuilder('s')
            .innerJoin(UserEntity, 'u', 'u.store_id = s.store_id')
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('s.store_state_id <> :leave', {leave: STORE_STATE.LEAVE})
            .andWhere('s.is_deleted = 0')
            .loadAllRelationIds();
        return lock ? query.setLock('pessimistic_write', undefined, ['s']) : query;
    }

    /**
     * 업체의 요일별 영업시간
     *
     * @param store_id 업체 ID
     * @returns 요일 순
     */
    async findStoreHours(store_id: string): Promise<StoreHourEntity[]> {
        try {
            return await this.buildStoreHoursQuery(store_id).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 요일별 영업시간 쿼리 — 매핑 민감(관계 필드 where · 정렬)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreHoursQuery(store_id: string): SelectQueryBuilder<StoreHourEntity> {
        return this.storeHours.createQueryBuilder('h').setFindOptions({where: notDeleted<StoreHourEntity>({store_id}), order: {day_of_week: 'ASC'}, loadRelationIds: true});
    }

    /**
     * 요일별 영업시간 삭제 — 교체 전 기존 행을 삭제 표시한다(소프트 삭제 — 요일 UK 는 지워지지 않은 행끼리라 새 행이 들어간다)
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteStoreHours(where: FindOptionsWhere<StoreHourEntity>): Promise<void> {
        try {
            const entity = new StoreHourEntity();
            entity.is_deleted = 1;
            await this.storeHours.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 요일별 영업시간 등록 — 교체. 요일 UK · 시각 CHECK 는 service 가 먼저 막으므로 위반은 통일 500
     *
     * @param entities new StoreHourEntity() + 할당 (요일마다 1개)
     */
    async insertStoreHours(entities: StoreHourEntity[]): Promise<void> {
        try {
            await this.storeHours.insert(entities);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체의 브레이크타임
     *
     * @param store_id 업체 ID
     * @returns 시작 시각 순
     */
    async findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]> {
        try {
            return await this.buildStoreBreaksQuery(store_id).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 브레이크타임 쿼리 — 매핑 민감(관계 필드 where · 정렬)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreBreaksQuery(store_id: string): SelectQueryBuilder<StoreBreakEntity> {
        return this.storeBreaks.createQueryBuilder('b').setFindOptions({where: notDeleted<StoreBreakEntity>({store_id}), order: {start_time: 'ASC'}, loadRelationIds: true});
    }

    /**
     * 브레이크타임 삭제 — 교체 전 기존 행을 삭제 표시한다(소프트 삭제)
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteStoreBreaks(where: FindOptionsWhere<StoreBreakEntity>): Promise<void> {
        try {
            const entity = new StoreBreakEntity();
            entity.is_deleted = 1;
            await this.storeBreaks.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 브레이크타임 등록 — 교체
     *
     * @param entities new StoreBreakEntity() + 할당
     */
    async insertStoreBreaks(entities: StoreBreakEntity[]): Promise<void> {
        try {
            await this.storeBreaks.insert(entities);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 개수
     *
     * @param where 조회 조건 (목록 — 끝나지 않은 것, 겹침 — buildUnavailablePeriodOverlapWhere)
     * @returns 개수
     */
    async countUnavailablePeriods(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<number> {
        try {
            return await this.unavailablePeriods.count({where: notDeleted(where)});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 목록
     *
     * @param where 조회 조건
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 시작 순
     */
    async findUnavailablePeriodList(where: FindOptionsWhere<StoreUnavailablePeriodEntity>, limit: number, offset: number): Promise<StoreUnavailablePeriodEntity[]> {
        try {
            return await this.buildUnavailablePeriodListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 목록 쿼리 — 매핑 민감(관계 필드 where · MoreThan · LessThan 시각 비교)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     * 겹침 조건(count)도 같은 FindOptions where 경로라 Smoke 는 두 조건을 모두 이 빌더로 고정한다.
     *
     * @param where 조회 조건
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildUnavailablePeriodListQuery(where: FindOptionsWhere<StoreUnavailablePeriodEntity>, limit: number, offset: number): SelectQueryBuilder<StoreUnavailablePeriodEntity> {
        return this.unavailablePeriods.createQueryBuilder('p').setFindOptions({where: notDeleted(where), order: {starts_at: 'ASC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 일시 예약불가 등록 — 시작 < 종료(CHECK)는 service 가 먼저 막으므로 위반은 통일 500
     *
     * @param entity new StoreUnavailablePeriodEntity() + 할당
     */
    async insertUnavailablePeriod(entity: StoreUnavailablePeriodEntity): Promise<void> {
        try {
            await this.unavailablePeriods.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제). 업체를 조건에 넣으면 남의 업체 것 · 이미 지운 것은 0건이다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     * @returns 지웠으면 true, 조건에 맞는 행이 없으면 false
     */
    async deleteUnavailablePeriod(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<boolean> {
        try {
            const entity = new StoreUnavailablePeriodEntity();
            entity.is_deleted = 1;
            const result = await this.unavailablePeriods.update(notDeleted(where), entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
