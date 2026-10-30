import type {FindOptionsWhere} from 'typeorm';
import type {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import type {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 업체 상품 설정 조회 행 — 업체 상품 설정 컬럼 + 상품 종류명 (QueryBuilder raw — t_room_plan_type 조인). 시각은 time 컬럼 값 그대로('HH:mm:ss') */
export interface RoomPlanRow {
    room_plan_id: string;
    store_id: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    is_used: number;
    days_of_week: number;
    usage_hours: number | null;
    check_in_time: string | null;
    check_out_time: string | null;
}

/** 객실 그룹 목록 행 — 그룹 컬럼 + 지워지지 않은 호실 수 · 대표 사진(지워지지 않은 사진 중 정렬 순서 · 등록일이 가장 앞) 저장 키 (QueryBuilder raw — 서브쿼리) */
export interface RoomGroupRow {
    room_group_id: string;
    room_group_name: string;
    created_at: Date;
    room_count: number;
    cover_file_key: string | null;
}

/** 그룹 상품 조회 행 — 그룹 상품 컬럼 + 상품 종류명 (QueryBuilder raw — t_room_plan_type 조인) */
export interface RoomGroupPlanRow {
    room_group_plan_id: string;
    room_group_id: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    is_used: number;
    price: number;
}

/** 호실 목록 행 — 호실 컬럼 + 그룹명 · 상태명 (QueryBuilder raw — t_room_group · t_room_state 조인) */
export interface RoomRow {
    room_id: string;
    room_group_id: string;
    room_group_name: string;
    room_name: string;
    floor: number;
    room_state_id: string;
    room_state_name: string;
    created_at: Date;
}

/** 호실 목록 조건 — 업체 + 선택 필터(층 · 그룹, 없으면 null) */
export interface RoomListFilter {
    store_id: string;
    floor: number | null;
    room_group_id: string | null;
}

/**
 * room repository 포트 — 업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 상품별 기간 가격 · 호실과, room 어휘로 다루는 매니저의 소속 업체(t_store · t_user)를 다룬다.
 * WHERE 는 service · util 이 만들고(배열 = OR) repository 는 실행 + DB 오류 변환만 한다. 소프트 삭제 테이블(그룹 · 사진 · 기간 가격 · 호실)의 is_deleted = 0 은 repository 가 붙인다.
 * insert · update 의 엔티티는 호출자가 `new XEntity()` + 필드 할당으로 만든다(@BeforeInsert/@BeforeUpdate 트리거).
 */
export interface RoomRepositoryInterface {
    /** 매니저의 소속 업체 (탈퇴 업체 · 지운 업체 제외) — lock 이면 업체 행을 잠근다(쓰기 트랜잭션 안에서만) */
    findManagerStore(user_id: string, lock: boolean): Promise<StoreEntity | null>;
    /** 업체 상품 설정 행 — 상품 종류명 포함(순서는 service 가 sortByPlanType) */
    findRoomPlanRows(store_id: string): Promise<RoomPlanRow[]>;
    /** 업체 상품 설정 단건 */
    findRoomPlan(where: FindOptionsWhere<RoomPlanEntity>): Promise<RoomPlanEntity | null>;
    /** 업체 상품 설정 수정 */
    updateRoomPlan(where: FindOptionsWhere<RoomPlanEntity>, entity: RoomPlanEntity): Promise<void>;
    /** 객실 그룹 개수 — 목록 */
    countRoomGroups(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[]): Promise<number>;
    /** 객실 그룹 목록 행 — 호실 수 · 대표 사진 키 포함, 등록일 최신순 */
    findRoomGroupRows(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[], limit: number, offset: number): Promise<RoomGroupRow[]>;
    /** 객실 그룹 단건 */
    findRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity | null>;
    /** 객실 그룹 등록 — 그룹명 UK → 400 */
    insertRoomGroup(entity: RoomGroupEntity): Promise<void>;
    /** 객실 그룹 수정 — 그룹명 UK → 400 */
    updateRoomGroup(where: FindOptionsWhere<RoomGroupEntity>, entity: RoomGroupEntity): Promise<void>;
    /** 객실 그룹 삭제 — 삭제 표시(소프트 삭제) */
    deleteRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<void>;
    /** 그룹 상품 등록 — 그룹 등록 때 상품 종류마다 1행 */
    insertRoomGroupPlans(entities: RoomGroupPlanEntity[]): Promise<void>;
    /** 그룹의 그룹 상품 행 — 상품 종류명 포함(순서는 service 가 sortByPlanType) */
    findRoomGroupPlanRows(room_group_id: string): Promise<RoomGroupPlanRow[]>;
    /** 그룹 상품 단건 */
    findRoomGroupPlan(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity | null>;
    /** 그룹 상품 수정 (사용 여부 · 요금) */
    updateRoomGroupPlan(where: FindOptionsWhere<RoomGroupPlanEntity>, entity: RoomGroupPlanEntity): Promise<void>;
    /** 그룹의 사진 — 정렬 순서 · 등록일 순 */
    findRoomGroupImages(room_group_id: string): Promise<RoomGroupImageEntity[]>;
    /** 그룹 사진 단건 */
    findRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<RoomGroupImageEntity | null>;
    /** 그룹 사진 등록 — 같은 키 → 400 */
    insertRoomGroupImage(entity: RoomGroupImageEntity): Promise<void>;
    /** 그룹 사진 수정 (정렬 순서) */
    updateRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>, entity: RoomGroupImageEntity): Promise<void>;
    /** 그룹 사진 삭제 — 삭제 표시(소프트 삭제, S3 객체는 service 가 지운다) */
    deleteRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<void>;
    /** 그룹 사진 여러 건 삭제 (그룹 삭제) — 삭제 표시(소프트 삭제) */
    deleteRoomGroupImages(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<void>;
    /** 기간 가격 개수 — 목록 · 겹침 확인 */
    countRoomGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<number>;
    /** 기간 가격 목록 — 시작 날짜 순 */
    findRoomGroupPlanPriceList(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, limit: number, offset: number): Promise<RoomGroupPlanPriceEntity[]>;
    /** 기간 가격 단건 */
    findRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity | null>;
    /** 기간 가격 등록 — 배타 제약(겹침) → 400 */
    insertRoomGroupPlanPrice(entity: RoomGroupPlanPriceEntity): Promise<void>;
    /** 기간 가격 수정 — 배타 제약(겹침) → 400 */
    updateRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, entity: RoomGroupPlanPriceEntity): Promise<void>;
    /** 기간 가격 삭제 — 삭제 표시(소프트 삭제), 조건에 맞는 행을 지웠으면 true */
    deleteRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<boolean>;
    /** 호실 개수 — 목록 */
    countRooms(where: FindOptionsWhere<RoomEntity>): Promise<number>;
    /** 호실 목록 행 — 그룹명 · 상태명 포함, 층 · 호실명 순 */
    findRoomRows(filter: RoomListFilter, limit: number, offset: number): Promise<RoomRow[]>;
    /** 호실 단건 */
    findRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
    /** 호실 등록 — 호실명 UK → 400 */
    insertRoom(entity: RoomEntity): Promise<void>;
    /** 호실 수정 (호실명 · 층 · 그룹 · 상태) — 호실명 UK → 400 */
    updateRoom(where: FindOptionsWhere<RoomEntity>, entity: RoomEntity): Promise<void>;
    /** 호실 삭제 — 삭제 표시(소프트 삭제) */
    deleteRoom(where: FindOptionsWhere<RoomEntity>): Promise<void>;
    /** 호실 여러 건 삭제 (그룹 삭제) — 삭제 표시(소프트 삭제) */
    deleteRooms(where: FindOptionsWhere<RoomEntity>): Promise<void>;
}
