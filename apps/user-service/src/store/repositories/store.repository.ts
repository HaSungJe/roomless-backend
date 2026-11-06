import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder, UpdateQueryBuilder} from 'typeorm';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import {isUniqueViolation} from '@app/database/typeorm-error.js';
import type {StoreFileRow, StoreRepositoryInterface} from '../interfaces/store.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * store repository (이용자 입점 신청) — 공유 DB 의 입점 신청 · 업체 정보 파일 · 파일 용도 · 업체를 직접 다룬다(admin-service store 와 같은 표 — 이용자 기능이라 user-service 에 둔다, 사용자 결정 2026-11-07).
 * 지우는 동작은 소프트 삭제(is_deleted = 1)이고, 조회 · 개수 · 수정에는 is_deleted = 0 을 항상 붙인다.
 */
@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_store_application */
    private get applications(): Repository<StoreApplicationEntity> {
        return this.txHost.tx.getRepository(StoreApplicationEntity);
    }

    /** t_store_file_purpose */
    private get storeFilePurposes(): Repository<StoreFilePurposeEntity> {
        return this.txHost.tx.getRepository(StoreFilePurposeEntity);
    }

    /** t_store_file */
    private get storeFiles(): Repository<StoreFileEntity> {
        return this.txHost.tx.getRepository(StoreFileEntity);
    }

    /** t_store */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
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
}
