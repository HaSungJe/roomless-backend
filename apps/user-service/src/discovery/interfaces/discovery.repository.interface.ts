import type {FindOptionsWhere} from 'typeorm';
import type {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 반경 업체 조회 조건 — 중심 · 반경(m) · 인덱스로 먼저 거를 위경도 사각형 */
export interface DiscoveryStoreFilter {
    latitude: number;
    longitude: number;
    radius_m: number;
    min_latitude: number;
    max_latitude: number;
    min_longitude: number;
    max_longitude: number;
}

/** 반경 업체 행 (QueryBuilder raw — 별칭이 이 키와 같다) */
export interface DiscoveryStoreRow {
    store_id: string;
    store_name: string;
    address: string;
    latitude: number;
    longitude: number;
    distance_m: number;
    cover_file_key: string | null;
    is_open: number;
    is_always_open: number;
    min_hourly_price: number | null;
    min_night_price: number | null;
}

/** 업체 상품 설정 행 — 상품 종류명 조인 (QueryBuilder raw) */
export interface DiscoveryStorePlanRow {
    room_plan_type_id: string;
    room_plan_type_name: string;
    is_used: number;
    days_of_week: number;
    usage_hours: number | null;
    check_in_time: string | null;
    check_out_time: string | null;
    min_nights: number | null;
    max_nights: number | null;
    is_extendable: number;
    max_extensions: number;
}

/** 그룹별 예약 받을 호실 수 (QueryBuilder raw) */
export interface DiscoveryRoomCountRow {
    room_group_id: string;
    room_count: number;
}

/**
 * discovery repository 포트 — 공유 DB 의 업체 · 객실 표를 둘러보기 어휘로 읽기만 한다(사용자 결정 2026-11-03 — 공유 DB 직접 읽기).
 * is_deleted 가 있는 표는 repository 가 지워지지 않은 행만 읽는다.
 */
export interface DiscoveryRepositoryInterface {
    /** 반경 안의 활성 업체 — 가까운 순, limit 개 */
    findStoreRows(filter: DiscoveryStoreFilter, limit: number): Promise<DiscoveryStoreRow[]>;
    /** 업체 단건 */
    findDiscoveryStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 업체 정보 파일 — 정렬 순서 · 등록일 순 */
    findStoreImages(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity[]>;
    /** 요일 영업시간 — 요일 순 */
    findStoreHours(store_id: string): Promise<StoreHourEntity[]>;
    /** 브레이크타임 — 시작 순 */
    findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]>;
    /** 업체 상품 설정 + 종류명 */
    findStorePlanRows(store_id: string): Promise<DiscoveryStorePlanRow[]>;
    /** 객실 그룹 — 그룹명 순 */
    findRoomGroups(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity[]>;
    /** 그룹별 예약 받을 호실 수(호실이 없는 그룹은 행이 없다) */
    countBookableRooms(room_group_ids: string[]): Promise<DiscoveryRoomCountRow[]>;
    /** 객실 그룹 사진 — 정렬 순서 · 등록일 순 */
    findRoomGroupImages(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<RoomGroupImageEntity[]>;
    /** 그룹 상품 */
    findRoomGroupPlans(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity[]>;
    /** 기간 가격 — 시작 날짜 순 */
    findRoomGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity[]>;
}
