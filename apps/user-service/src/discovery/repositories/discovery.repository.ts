import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from '@app/database/entities/room/room-plan-type.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import {DISCOVERY_EARTH_RADIUS_KM, DISCOVERY_PLAN_TYPE, DISCOVERY_ROOM_STATE_DISABLED, DISCOVERY_STORE_IMAGE_PURPOSE, DISCOVERY_STORE_STATE_ACTIVE} from '../discovery.constants.js';
import type {DiscoveryRepositoryInterface, DiscoveryRoomCountRow, DiscoveryStoreFilter, DiscoveryStorePlanRow, DiscoveryStoreRow} from '../interfaces/discovery.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * 중심(:latitude, :longitude)과 업체 "s" 사이 대원 거리(m) — haversine, 지구 반지름 DISCOVERY_EARTH_RADIUS_KM(반경 사각형과 같은 값).
 * 부동소수 오차로 ASIN 인자가 1 을 넘지 않게 LEAST 로 막는다.
 */
const DISTANCE_SQL = `(${2 * DISCOVERY_EARTH_RADIUS_KM * 1000} * ASIN(LEAST(1, SQRT(POWER(SIN(RADIANS("s"."latitude" - :latitude) / 2), 2) + COS(RADIANS(:latitude)) * COS(RADIANS("s"."latitude")) * POWER(SIN(RADIANS("s"."longitude" - :longitude) / 2), 2)))))`;

/** 그 그룹에 예약 받을 호실(지워지지 않고 사용중지 아님)이 있는지 — 최저가 서브쿼리용 */
const GROUP_HAS_BOOKABLE_ROOM_SQL = 'EXISTS (SELECT 1 FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0 AND "r"."room_state_id" <> :disabled_state)';

/**
 * discovery repository (아웃바운드 어댑터) — 공유 DB 의 업체 · 객실 표(store · room 도메인 표)를 둘러보기 어휘로 읽기만 한다.
 * is_deleted 가 있는 표의 조회에는 항상 is_deleted = 0 을 붙인다(notDeleted · QueryBuilder 는 서브쿼리 표까지).
 */
@Injectable()
export class DiscoveryRepository implements DiscoveryRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_store */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_store_file */
    private get storeFiles(): Repository<StoreFileEntity> {
        return this.txHost.tx.getRepository(StoreFileEntity);
    }

    /** t_store_hour */
    private get storeHours(): Repository<StoreHourEntity> {
        return this.txHost.tx.getRepository(StoreHourEntity);
    }

    /** t_store_break */
    private get storeBreaks(): Repository<StoreBreakEntity> {
        return this.txHost.tx.getRepository(StoreBreakEntity);
    }

    /** t_room_plan */
    private get roomPlans(): Repository<RoomPlanEntity> {
        return this.txHost.tx.getRepository(RoomPlanEntity);
    }

    /** t_room_group */
    private get roomGroups(): Repository<RoomGroupEntity> {
        return this.txHost.tx.getRepository(RoomGroupEntity);
    }

    /** t_room */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /** t_room_group_image */
    private get roomGroupImages(): Repository<RoomGroupImageEntity> {
        return this.txHost.tx.getRepository(RoomGroupImageEntity);
    }

    /** t_room_group_plan */
    private get roomGroupPlans(): Repository<RoomGroupPlanEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanEntity);
    }

    /** t_room_group_plan_price */
    private get roomGroupPlanPrices(): Repository<RoomGroupPlanPriceEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanPriceEntity);
    }

    /**
     * 반경 안의 활성 업체 — 가까운 순(같으면 업체 ID 순), limit 개
     *
     * @param filter 중심 · 반경 · 사각형
     * @param limit 개수(서비스가 잘림 판단용으로 1개 더)
     * @returns 업체 행
     */
    async findStoreRows(filter: DiscoveryStoreFilter, limit: number): Promise<DiscoveryStoreRow[]> {
        try {
            return await this.buildStoreRowsQuery(filter, limit).getRawMany<DiscoveryStoreRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 반경 업체 쿼리 — 활성 · 지워지지 않은 업체를 위경도 사각형(인덱스 IDX_Store_LatitudeLongitude)으로 먼저 거르고 대원 거리 ≤ 반경만 남긴다.
     * 대표 사진(지워지지 않은 업체 사진 중 정렬 순서 · 등록일이 가장 앞인 1장의 키)과 상품 종류별 최저가(업체 상품 설정 사용 · 그룹 상품 사용 · 요금 > 0 ·
     * 지워지지 않은 그룹 · 예약 받을 호실이 있는 그룹의 기본 요금 최솟값, 없으면 NULL)는 서브쿼리다.
     * 매핑 민감(서브쿼리 · raw select — 별칭이 DiscoveryStoreRow 키와 같다 · 같은 이름 파라미터 재사용)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param filter 중심 · 반경 · 사각형
     * @param limit 개수
     * @returns 쿼리 빌더
     */
    buildStoreRowsQuery(filter: DiscoveryStoreFilter, limit: number): SelectQueryBuilder<StoreEntity> {
        return this.stores
            .createQueryBuilder('s')
            .select('s.store_id', 'store_id')
            .addSelect('s.store_name', 'store_name')
            .addSelect('s.address', 'address')
            .addSelect('s.latitude', 'latitude')
            .addSelect('s.longitude', 'longitude')
            .addSelect(`CAST(ROUND(${DISTANCE_SQL}) AS integer)`, 'distance_m')
            .addSelect(
                (sub) =>
                    sub
                        .select('"f"."file_key"')
                        .from(StoreFileEntity, 'f')
                        .where('"f"."store_id" = "s"."store_id"')
                        .andWhere('"f"."store_file_purpose_id" = :image_purpose')
                        .andWhere('"f"."is_deleted" = 0')
                        .orderBy('"f"."sort_order"', 'ASC')
                        .addOrderBy('"f"."created_at"', 'ASC')
                        .limit(1),
                'cover_file_key',
            )
            .addSelect('s.is_open', 'is_open')
            .addSelect('s.is_always_open', 'is_always_open')
            .addSelect(
                (sub) =>
                    sub
                        .select('MIN("gp"."price")')
                        .from(RoomGroupPlanEntity, 'gp')
                        .innerJoin(RoomGroupEntity, 'g', '"g"."room_group_id" = "gp"."room_group_id"')
                        .innerJoin(RoomPlanEntity, 'p', '"p"."store_id" = "g"."store_id" AND "p"."room_plan_type_id" = "gp"."room_plan_type_id"')
                        .where('"g"."store_id" = "s"."store_id"')
                        .andWhere('"g"."is_deleted" = 0')
                        .andWhere('"gp"."room_plan_type_id" = :hourly_type')
                        .andWhere('"gp"."is_used" = 1')
                        .andWhere('"gp"."price" > 0')
                        .andWhere('"p"."is_used" = 1')
                        .andWhere(GROUP_HAS_BOOKABLE_ROOM_SQL),
                'min_hourly_price',
            )
            .addSelect(
                (sub) =>
                    sub
                        .select('MIN("gp"."price")')
                        .from(RoomGroupPlanEntity, 'gp')
                        .innerJoin(RoomGroupEntity, 'g', '"g"."room_group_id" = "gp"."room_group_id"')
                        .innerJoin(RoomPlanEntity, 'p', '"p"."store_id" = "g"."store_id" AND "p"."room_plan_type_id" = "gp"."room_plan_type_id"')
                        .where('"g"."store_id" = "s"."store_id"')
                        .andWhere('"g"."is_deleted" = 0')
                        .andWhere('"gp"."room_plan_type_id" = :night_type')
                        .andWhere('"gp"."is_used" = 1')
                        .andWhere('"gp"."price" > 0')
                        .andWhere('"p"."is_used" = 1')
                        .andWhere(GROUP_HAS_BOOKABLE_ROOM_SQL),
                'min_night_price',
            )
            .where('s.store_state_id = :active_state')
            .andWhere('s.is_deleted = 0')
            .andWhere('s.latitude BETWEEN :min_latitude AND :max_latitude')
            .andWhere('s.longitude BETWEEN :min_longitude AND :max_longitude')
            .andWhere(`${DISTANCE_SQL} <= :radius_m`)
            .orderBy('"distance_m"', 'ASC')
            .addOrderBy('s.store_id', 'ASC')
            .limit(limit)
            .setParameters({
                ...filter,
                active_state: DISCOVERY_STORE_STATE_ACTIVE,
                image_purpose: DISCOVERY_STORE_IMAGE_PURPOSE,
                hourly_type: DISCOVERY_PLAN_TYPE.HOURLY,
                night_type: DISCOVERY_PLAN_TYPE.NIGHT,
                disabled_state: DISCOVERY_ROOM_STATE_DISABLED,
            });
    }

    /**
     * 업체 단건 — 지워지지 않은 업체
     *
     * @param where 조회 조건 (service 는 is_deleted 를 넣지 않는다)
     * @returns 업체 또는 null
     */
    async findDiscoveryStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 — 지워지지 않은 행, 정렬 순서 · 등록일 순
     *
     * @param where 조회 조건 (업체 · 용도)
     * @returns 파일 목록
     */
    async findStoreImages(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity[]> {
        try {
            return await this.storeFiles.find({where: notDeleted(where), order: {sort_order: 'ASC', created_at: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 요일 영업시간 — 지워지지 않은 행, 요일 순
     *
     * @param store_id 업체 ID
     * @returns 영업시간 목록
     */
    async findStoreHours(store_id: string): Promise<StoreHourEntity[]> {
        try {
            return await this.storeHours.find({where: notDeleted<StoreHourEntity>({store_id}), order: {day_of_week: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 브레이크타임 — 지워지지 않은 행, 시작 순
     *
     * @param store_id 업체 ID
     * @returns 브레이크타임 목록
     */
    async findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]> {
        try {
            return await this.storeBreaks.find({where: notDeleted<StoreBreakEntity>({store_id}), order: {start_time: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 상품 설정 + 종류명
     *
     * @param store_id 업체 ID
     * @returns 상품 설정 행
     */
    async findStorePlanRows(store_id: string): Promise<DiscoveryStorePlanRow[]> {
        try {
            return await this.buildStorePlanRowsQuery(store_id).getRawMany<DiscoveryStorePlanRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 상품 설정 쿼리 — 상품 종류명 조인(삭제 표시 없는 표). 매핑 민감(조인 · raw select — 별칭이 DiscoveryStorePlanRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStorePlanRowsQuery(store_id: string): SelectQueryBuilder<RoomPlanEntity> {
        return this.roomPlans
            .createQueryBuilder('p')
            .select('p.room_plan_type_id', 'room_plan_type_id')
            .addSelect('t.room_plan_type_name', 'room_plan_type_name')
            .addSelect('p.is_used', 'is_used')
            .addSelect('p.days_of_week', 'days_of_week')
            .addSelect('p.usage_hours', 'usage_hours')
            .addSelect('p.check_in_time', 'check_in_time')
            .addSelect('p.check_out_time', 'check_out_time')
            .addSelect('p.min_nights', 'min_nights')
            .addSelect('p.max_nights', 'max_nights')
            .innerJoin(RoomPlanTypeEntity, 't', 't.room_plan_type_id = p.room_plan_type_id')
            .where('p.store_id = :store_id', {store_id});
    }

    /**
     * 객실 그룹 — 지워지지 않은 그룹, 그룹명 순(엔티티로 읽어 상세정보 기본값을 @AfterLoad 가 채운다)
     *
     * @param where 조회 조건
     * @returns 그룹 목록
     */
    async findRoomGroups(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity[]> {
        try {
            return await this.roomGroups.find({where: notDeleted(where), order: {room_group_name: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹별 예약 받을 호실 수
     *
     * @param room_group_ids 그룹 ID 목록 (비어 있지 않다 — service 가 거른다)
     * @returns 그룹별 수
     */
    async countBookableRooms(room_group_ids: string[]): Promise<DiscoveryRoomCountRow[]> {
        try {
            return await this.buildBookableRoomCountsQuery(room_group_ids).getRawMany<DiscoveryRoomCountRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹별 예약 받을 호실 수 쿼리 — 지워지지 않고 사용중지가 아닌 호실을 그룹으로 묶어 센다. 매핑 민감(IN 펼침 · GROUP BY · raw select)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param room_group_ids 그룹 ID 목록
     * @returns 쿼리 빌더
     */
    buildBookableRoomCountsQuery(room_group_ids: string[]): SelectQueryBuilder<RoomEntity> {
        return this.rooms
            .createQueryBuilder('r')
            .select('r.room_group_id', 'room_group_id')
            .addSelect('CAST(COUNT(*) AS integer)', 'room_count')
            .where('r.room_group_id IN (:...room_group_ids)', {room_group_ids})
            .andWhere('r.is_deleted = 0')
            .andWhere('r.room_state_id <> :disabled_state', {disabled_state: DISCOVERY_ROOM_STATE_DISABLED})
            .groupBy('r.room_group_id');
    }

    /**
     * 객실 그룹 사진 — 지워지지 않은 행, 정렬 순서 · 등록일 순
     *
     * @param where 조회 조건 (그룹 In)
     * @returns 사진 목록
     */
    async findRoomGroupImages(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<RoomGroupImageEntity[]> {
        try {
            return await this.roomGroupImages.find({where: notDeleted(where), order: {sort_order: 'ASC', created_at: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 — 받은 조건 그대로(삭제 표시 없는 표 — 종류마다 1행)
     *
     * @param where 조회 조건 (그룹 In)
     * @returns 그룹 상품 목록
     */
    async findRoomGroupPlans(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity[]> {
        try {
            return await this.roomGroupPlans.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 — 지워지지 않은 행, 시작 날짜 순
     *
     * @param where 조회 조건 (그룹 상품 In · 끝 날짜 ≥ 오늘)
     * @returns 기간 가격 목록
     */
    async findRoomGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity[]> {
        try {
            return await this.roomGroupPlanPrices.find({where: notDeleted(where), order: {start_date: 'ASC'}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
