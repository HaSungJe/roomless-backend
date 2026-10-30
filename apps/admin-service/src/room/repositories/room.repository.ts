import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {createValidationError} from '@app/common/utils/validation.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from '@app/database/entities/room/room-plan-type.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomStateEntity} from '@app/database/entities/room/room-state.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import {isExclusionViolation, isUniqueViolation} from '@app/database/typeorm-error.js';
import type {RoomGroupPlanRow, RoomGroupRow, RoomListFilter, RoomPlanRow, RoomRepositoryInterface, RoomRow} from '../interfaces/room.repository.interface.js';
import {ROOM_GROUP_IMAGE_TAKEN_MESSAGE, ROOM_GROUP_NAME_TAKEN_MESSAGE, ROOM_NAME_TAKEN_MESSAGE, ROOM_PLAN_PRICE_OVERLAP_MESSAGE, ROOM_STORE_STATE_LEAVE} from '../room.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * room repository (아웃바운드 어댑터) — t_room_plan · t_room_group · t_room_group_image · t_room_group_plan · t_room_group_plan_price · t_room 과
 * 룩업 t_room_plan_type · t_room_state(조인), 공유 DB 의 t_store · t_user(매니저의 소속 업체)를 직접 다룬다. `txHost.tx` 는 `@Transactional()` 범위 안에서는 트랜잭션 EntityManager 다.
 * 삭제는 소프트 삭제(is_deleted = 1)이고, is_deleted 가 있는 테이블(그룹 · 사진 · 기간 가격 · 호실)의 조회 · 개수 · 수정에는 항상 is_deleted = 0 을 붙인다(notDeleted · QueryBuilder 조건 — service 는 넣지 않는다).
 * 업체 상품 설정 · 그룹 상품은 종류마다 반드시 있는 행이라 지우지 않는다(is_deleted 없음).
 */
@Injectable()
export class RoomRepository implements RoomRepositoryInterface {
    /**
     * @param txHost 트랜잭션 전파용 EntityManager 홀더
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_store repository (현재 트랜잭션 기준) — 매니저의 소속 업체 */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_room_plan repository (현재 트랜잭션 기준) — 업체 상품 설정 */
    private get roomPlans(): Repository<RoomPlanEntity> {
        return this.txHost.tx.getRepository(RoomPlanEntity);
    }

    /** t_room_group repository (현재 트랜잭션 기준) */
    private get roomGroups(): Repository<RoomGroupEntity> {
        return this.txHost.tx.getRepository(RoomGroupEntity);
    }

    /** t_room_group_plan repository (현재 트랜잭션 기준) — 그룹 상품 */
    private get roomGroupPlans(): Repository<RoomGroupPlanEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanEntity);
    }

    /** t_room_group_image repository (현재 트랜잭션 기준) */
    private get roomGroupImages(): Repository<RoomGroupImageEntity> {
        return this.txHost.tx.getRepository(RoomGroupImageEntity);
    }

    /** t_room_group_plan_price repository (현재 트랜잭션 기준) — 상품별 기간 가격 */
    private get roomGroupPlanPrices(): Repository<RoomGroupPlanPriceEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanPriceEntity);
    }

    /** t_room repository (현재 트랜잭션 기준) — 호실 */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /**
     * 매니저의 소속 업체 — 매니저 그룹 회원의 store_id 로 찾는다. 탈퇴 업체 · 지운 업체는 없는 것과 같다.
     *
     * @param user_id 로그인 매니저 ID
     * @param lock true 면 업체 행을 잠근다(FOR UPDATE — 같은 업체의 객실 설정 쓰기를 한 번에 하나로). 트랜잭션 안에서만
     * @returns 업체 또는 null
     */
    async findManagerStore(user_id: string, lock: boolean): Promise<StoreEntity | null> {
        try {
            return await this.buildManagerStoreQuery(user_id, lock).getOne();
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
    buildManagerStoreQuery(user_id: string, lock: boolean): SelectQueryBuilder<StoreEntity> {
        const query = this.stores
            .createQueryBuilder('s')
            .innerJoin(UserEntity, 'u', 'u.store_id = s.store_id')
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('s.store_state_id <> :leave', {leave: ROOM_STORE_STATE_LEAVE})
            .andWhere('s.is_deleted = 0')
            .loadAllRelationIds();
        return lock ? query.setLock('pessimistic_write', undefined, ['s']) : query;
    }

    /**
     * 업체 상품 설정 행 — 상품 종류명 포함
     *
     * @param store_id 업체 ID
     * @returns 상품 종류마다 1행 (순서는 service 가 sortByPlanType)
     */
    async findRoomPlanRows(store_id: string): Promise<RoomPlanRow[]> {
        try {
            return await this.buildRoomPlanRowsQuery(store_id).getRawMany<RoomPlanRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 상품 설정 조회 쿼리 — 매핑 민감(상품 종류 조인 · raw select — 별칭이 RoomPlanRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildRoomPlanRowsQuery(store_id: string): SelectQueryBuilder<RoomPlanEntity> {
        return this.roomPlans
            .createQueryBuilder('p')
            .select('p.room_plan_id', 'room_plan_id')
            .addSelect('p.store_id', 'store_id')
            .addSelect('p.room_plan_type_id', 'room_plan_type_id')
            .addSelect('t.room_plan_type_name', 'room_plan_type_name')
            .addSelect('p.is_used', 'is_used')
            .addSelect('p.days_of_week', 'days_of_week')
            .addSelect('p.usage_hours', 'usage_hours')
            .addSelect('p.check_in_time', 'check_in_time')
            .addSelect('p.check_out_time', 'check_out_time')
            .innerJoin(RoomPlanTypeEntity, 't', 't.room_plan_type_id = p.room_plan_type_id')
            .where('p.store_id = :store_id', {store_id});
    }

    /**
     * 업체 상품 설정 단건
     *
     * @param where 조회 조건
     * @returns 업체 상품 설정 또는 null
     */
    async findRoomPlan(where: FindOptionsWhere<RoomPlanEntity>): Promise<RoomPlanEntity | null> {
        try {
            return await this.roomPlans.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 상품 설정 수정 — 종류별 조합(CHECK CHK_RoomPlan_UsageHoursCheckInOutTime)은 service 가 먼저 맞추므로 위반은 통일 500
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomPlan(where: FindOptionsWhere<RoomPlanEntity>, entity: RoomPlanEntity): Promise<void> {
        try {
            await this.roomPlans.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 객실 그룹 개수
     *
     * @param where 조회 조건 (배열 = OR)
     * @returns 개수
     */
    async countRoomGroups(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[]): Promise<number> {
        try {
            return await this.roomGroups.count({where: notDeleted(where)});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 객실 그룹 목록 행
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 그룹 행 (등록일 최신순, 호실 수 · 대표 사진 키 포함)
     */
    async findRoomGroupRows(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[], limit: number, offset: number): Promise<RoomGroupRow[]> {
        try {
            return await this.buildRoomGroupRowsQuery(where, limit, offset).getRawMany<RoomGroupRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 객실 그룹 목록 쿼리 — WHERE 는 FindOptions 경로(setFindOptions — 관계 필드 · ILike · 배열 OR, 지워지지 않은 그룹만)로 만들고, select 는 RoomGroupRow 별칭으로 바꾼다.
     * 호실 수는 지워지지 않은 호실을 세는 서브쿼리, 대표 사진은 지워지지 않은 사진 중 정렬 순서 · 등록일이 가장 앞인 1장의 저장 키 서브쿼리다(없으면 NULL).
     * 매핑 민감(관계 필드 where · ILike · 배열 OR · 서브쿼리 · raw select)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildRoomGroupRowsQuery(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[], limit: number, offset: number): SelectQueryBuilder<RoomGroupEntity> {
        return this.roomGroups
            .createQueryBuilder('g')
            .setFindOptions({where: notDeleted(where), order: {created_at: 'DESC'}, take: limit, skip: offset})
            .select('g.room_group_id', 'room_group_id')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('g.created_at', 'created_at')
            .addSelect((sub) => sub.select('CAST(COUNT(*) AS integer)').from(RoomEntity, 'r').where('"r"."room_group_id" = "g"."room_group_id"').andWhere('"r"."is_deleted" = 0'), 'room_count')
            .addSelect(
                (sub) =>
                    sub
                        .select('"i"."file_key"')
                        .from(RoomGroupImageEntity, 'i')
                        .where('"i"."room_group_id" = "g"."room_group_id"')
                        .andWhere('"i"."is_deleted" = 0')
                        .orderBy('"i"."sort_order"', 'ASC')
                        .addOrderBy('"i"."created_at"', 'ASC')
                        .limit(1),
                'cover_file_key',
            );
    }

    /**
     * 객실 그룹 단건
     *
     * @param where 조회 조건
     * @returns 그룹 또는 null (상세정보는 @AfterLoad 가 기본값으로 채운다)
     */
    async findRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity | null> {
        try {
            return await this.roomGroups.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 객실 그룹 등록 — 같은 업체의 지워지지 않은 그룹명이 있으면 400(부분 유니크 UK_RoomGroup_StoreIdRoomGroupName — 선검사 없이 DB 가 막는다)
     *
     * @param entity new RoomGroupEntity() + 할당
     */
    async insertRoomGroup(entity: RoomGroupEntity): Promise<void> {
        try {
            await this.roomGroups.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_RoomGroup_StoreIdRoomGroupName')) {
                throw new BadRequestException({message: ROOM_GROUP_NAME_TAKEN_MESSAGE, validation_errors: createValidationError('room_group_name', ROOM_GROUP_NAME_TAKEN_MESSAGE)});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 객실 그룹 수정 — 같은 업체의 지워지지 않은 다른 그룹과 그룹명이 같으면 400
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomGroup(where: FindOptionsWhere<RoomGroupEntity>, entity: RoomGroupEntity): Promise<void> {
        try {
            await this.roomGroups.update(notDeleted(where), entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_RoomGroup_StoreIdRoomGroupName')) {
                throw new BadRequestException({message: ROOM_GROUP_NAME_TAKEN_MESSAGE, validation_errors: createValidationError('room_group_name', ROOM_GROUP_NAME_TAKEN_MESSAGE)});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 객실 그룹 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제 — 예약이 호실 · 그룹 상품을 가리킨다). 호실 · 사진은 service 가 같은 트랜잭션에서 함께 삭제 표시한다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<void> {
        try {
            const entity = new RoomGroupEntity();
            entity.is_deleted = 1;
            await this.roomGroups.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 등록 — 그룹 등록 때 상품 종류마다 1행. 방금 만든 그룹이라 UK 위반이 없으므로 위반은 통일 500
     *
     * @param entities new RoomGroupPlanEntity() + 할당 (상품 종류마다 1개)
     */
    async insertRoomGroupPlans(entities: RoomGroupPlanEntity[]): Promise<void> {
        try {
            await this.roomGroupPlans.insert(entities);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹의 그룹 상품 행 — 상품 종류명 포함
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 상품 종류마다 1행 (순서는 service 가 sortByPlanType)
     */
    async findRoomGroupPlanRows(room_group_id: string): Promise<RoomGroupPlanRow[]> {
        try {
            return await this.buildRoomGroupPlanRowsQuery(room_group_id).getRawMany<RoomGroupPlanRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 조회 쿼리 — 매핑 민감(상품 종류 조인 · raw select — 별칭이 RoomGroupPlanRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 쿼리 빌더
     */
    buildRoomGroupPlanRowsQuery(room_group_id: string): SelectQueryBuilder<RoomGroupPlanEntity> {
        return this.roomGroupPlans
            .createQueryBuilder('gp')
            .select('gp.room_group_plan_id', 'room_group_plan_id')
            .addSelect('gp.room_group_id', 'room_group_id')
            .addSelect('gp.room_plan_type_id', 'room_plan_type_id')
            .addSelect('t.room_plan_type_name', 'room_plan_type_name')
            .addSelect('gp.is_used', 'is_used')
            .addSelect('gp.price', 'price')
            .innerJoin(RoomPlanTypeEntity, 't', 't.room_plan_type_id = gp.room_plan_type_id')
            .where('gp.room_group_id = :room_group_id', {room_group_id});
    }

    /**
     * 그룹 상품 단건
     *
     * @param where 조회 조건
     * @returns 그룹 상품 또는 null
     */
    async findRoomGroupPlan(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity | null> {
        try {
            return await this.roomGroupPlans.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 수정 — 사용 여부 · 요금
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomGroupPlan(where: FindOptionsWhere<RoomGroupPlanEntity>, entity: RoomGroupPlanEntity): Promise<void> {
        try {
            await this.roomGroupPlans.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹의 사진
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 지워지지 않은 사진 (정렬 순서 · 등록일 순)
     */
    async findRoomGroupImages(room_group_id: string): Promise<RoomGroupImageEntity[]> {
        try {
            return await this.buildRoomGroupImagesQuery(room_group_id).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 사진 쿼리 — 매핑 민감(관계 필드 where · 정렬)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 쿼리 빌더
     */
    buildRoomGroupImagesQuery(room_group_id: string): SelectQueryBuilder<RoomGroupImageEntity> {
        return this.roomGroupImages
            .createQueryBuilder('i')
            .setFindOptions({where: notDeleted<RoomGroupImageEntity>({room_group_id}), order: {sort_order: 'ASC', created_at: 'ASC'}, loadRelationIds: true});
    }

    /**
     * 그룹 사진 단건
     *
     * @param where 조회 조건
     * @returns 사진 또는 null
     */
    async findRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<RoomGroupImageEntity | null> {
        try {
            return await this.roomGroupImages.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 사진 등록 — 같은 저장 키는 400(UK_RoomGroupImage_FileKey — 지운 행까지 전체)
     *
     * @param entity new RoomGroupImageEntity() + 할당
     */
    async insertRoomGroupImage(entity: RoomGroupImageEntity): Promise<void> {
        try {
            await this.roomGroupImages.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_RoomGroupImage_FileKey')) {
                throw new BadRequestException({message: ROOM_GROUP_IMAGE_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 그룹 사진 수정 — 정렬 순서
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>, entity: RoomGroupImageEntity): Promise<void> {
        try {
            await this.roomGroupImages.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 사진 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제). S3 객체는 service 가 실제로 지운다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<void> {
        try {
            const entity = new RoomGroupImageEntity();
            entity.is_deleted = 1;
            await this.roomGroupImages.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 사진 여러 건 삭제 — 그룹 삭제. 그 그룹의 지워지지 않은 사진을 모두 삭제 표시한다(소프트 삭제). S3 객체는 service 가 마지막에 지운다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRoomGroupImages(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<void> {
        try {
            const entity = new RoomGroupImageEntity();
            entity.is_deleted = 1;
            await this.roomGroupImages.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 개수
     *
     * @param where 조회 조건 (목록 — 그룹 상품, 겹침 — buildPlanPriceOverlapWhere)
     * @returns 개수
     */
    async countRoomGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<number> {
        try {
            return await this.roomGroupPlanPrices.count({where: notDeleted(where)});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 목록
     *
     * @param where 조회 조건
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 시작 날짜 순
     */
    async findRoomGroupPlanPriceList(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, limit: number, offset: number): Promise<RoomGroupPlanPriceEntity[]> {
        try {
            return await this.buildRoomGroupPlanPriceListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 목록 쿼리 — 매핑 민감(관계 필드 where · LessThanOrEqual · MoreThanOrEqual · Not 날짜 비교)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     * 겹침 조건(count)도 같은 FindOptions where 경로라 Smoke 는 두 조건을 모두 이 빌더로 고정한다.
     *
     * @param where 조회 조건
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildRoomGroupPlanPriceListQuery(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, limit: number, offset: number): SelectQueryBuilder<RoomGroupPlanPriceEntity> {
        return this.roomGroupPlanPrices.createQueryBuilder('pp').setFindOptions({where: notDeleted(where), order: {start_date: 'ASC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 기간 가격 단건
     *
     * @param where 조회 조건
     * @returns 기간 가격 또는 null
     */
    async findRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity | null> {
        try {
            return await this.roomGroupPlanPrices.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 등록 — 같은 그룹 상품의 지워지지 않은 다른 기간과 겹치면 400(배타 제약 EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange — service 선검사를 동시 요청이 함께 통과한 경우).
     * 시작 ≤ 종료(CHECK)는 service 가 먼저 막으므로 위반은 통일 500
     *
     * @param entity new RoomGroupPlanPriceEntity() + 할당
     */
    async insertRoomGroupPlanPrice(entity: RoomGroupPlanPriceEntity): Promise<void> {
        try {
            await this.roomGroupPlanPrices.insert(entity);
        } catch (error) {
            if (isExclusionViolation(error, 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange')) {
                throw new BadRequestException({message: ROOM_PLAN_PRICE_OVERLAP_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 기간 가격 수정 — 같은 그룹 상품의 지워지지 않은 다른 기간과 겹치면 400(배타 제약)
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, entity: RoomGroupPlanPriceEntity): Promise<void> {
        try {
            await this.roomGroupPlanPrices.update(notDeleted(where), entity);
        } catch (error) {
            if (isExclusionViolation(error, 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange')) {
                throw new BadRequestException({message: ROOM_PLAN_PRICE_OVERLAP_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 기간 가격 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제). 그룹 상품을 조건에 넣으면 다른 그룹 상품 것 · 이미 지운 것은 0건이다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     * @returns 지웠으면 true, 조건에 맞는 행이 없으면 false
     */
    async deleteRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<boolean> {
        try {
            const entity = new RoomGroupPlanPriceEntity();
            entity.is_deleted = 1;
            const result = await this.roomGroupPlanPrices.update(notDeleted(where), entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 개수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countRooms(where: FindOptionsWhere<RoomEntity>): Promise<number> {
        try {
            return await this.rooms.count({where: notDeleted(where)});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 목록 행
     *
     * @param filter 업체 + 선택 필터(층 · 그룹)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 호실 행 (층 · 호실명 순, 그룹명 · 상태명 포함)
     */
    async findRoomRows(filter: RoomListFilter, limit: number, offset: number): Promise<RoomRow[]> {
        try {
            return await this.buildRoomRowsQuery(filter, limit, offset).getRawMany<RoomRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 목록 쿼리 — 지워지지 않은 호실 · 그룹만(그룹 · 상태 조인), 층 · 그룹 필터는 값이 있을 때만 더한다.
     * 매핑 민감(조인 · raw select — 별칭이 RoomRow 키와 같다 · 동적 조립)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param filter 업체 + 선택 필터(층 · 그룹)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildRoomRowsQuery(filter: RoomListFilter, limit: number, offset: number): SelectQueryBuilder<RoomEntity> {
        const query = this.rooms
            .createQueryBuilder('r')
            .select('r.room_id', 'room_id')
            .addSelect('r.room_group_id', 'room_group_id')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('r.room_name', 'room_name')
            .addSelect('r.floor', 'floor')
            .addSelect('r.room_state_id', 'room_state_id')
            .addSelect('st.room_state_name', 'room_state_name')
            .addSelect('r.created_at', 'created_at')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = r.room_group_id')
            .innerJoin(RoomStateEntity, 'st', 'st.room_state_id = r.room_state_id')
            .where('r.store_id = :store_id', {store_id: filter.store_id})
            .andWhere('r.is_deleted = 0')
            .andWhere('g.is_deleted = 0');
        if (filter.floor !== null) {
            query.andWhere('r.floor = :floor', {floor: filter.floor});
        }
        if (filter.room_group_id !== null) {
            query.andWhere('r.room_group_id = :room_group_id', {room_group_id: filter.room_group_id});
        }
        return query.orderBy('r.floor', 'ASC').addOrderBy('r.room_name', 'ASC').limit(limit).offset(offset);
    }

    /**
     * 호실 단건
     *
     * @param where 조회 조건
     * @returns 호실 또는 null
     */
    async findRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null> {
        try {
            return await this.rooms.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 등록 — 같은 업체의 지워지지 않은 호실명이 있으면 400(부분 유니크 UK_Room_StoreIdRoomName — 선검사 없이 DB 가 막는다)
     *
     * @param entity new RoomEntity() + 할당
     */
    async insertRoom(entity: RoomEntity): Promise<void> {
        try {
            await this.rooms.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_Room_StoreIdRoomName')) {
                throw new BadRequestException({message: ROOM_NAME_TAKEN_MESSAGE, validation_errors: createValidationError('room_name', ROOM_NAME_TAKEN_MESSAGE)});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 호실 수정 — 호실명 · 층 · 그룹(이동) · 상태. 같은 업체의 지워지지 않은 다른 호실과 호실명이 같으면 400
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoom(where: FindOptionsWhere<RoomEntity>, entity: RoomEntity): Promise<void> {
        try {
            await this.rooms.update(notDeleted(where), entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_Room_StoreIdRoomName')) {
                throw new BadRequestException({message: ROOM_NAME_TAKEN_MESSAGE, validation_errors: createValidationError('room_name', ROOM_NAME_TAKEN_MESSAGE)});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 호실 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제 — 예약이 호실을 가리킨다)
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRoom(where: FindOptionsWhere<RoomEntity>): Promise<void> {
        try {
            const entity = new RoomEntity();
            entity.is_deleted = 1;
            await this.rooms.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 여러 건 삭제 — 그룹 삭제. 그 그룹의 지워지지 않은 호실을 모두 삭제 표시한다(소프트 삭제).
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRooms(where: FindOptionsWhere<RoomEntity>): Promise<void> {
        try {
            const entity = new RoomEntity();
            entity.is_deleted = 1;
            await this.rooms.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
