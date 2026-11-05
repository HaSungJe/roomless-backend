import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {DiscoveryRoomGroupImageResultDto, DiscoveryRoomGroupItemResultDto, DiscoveryRoomGroupPlanResultDto} from '@app/contracts/discovery/dto/discovery-room-group-list.dto.js';
import type {
    DiscoveryStoreBreakResultDto,
    DiscoveryStoreDetailResultDto,
    DiscoveryStoreHourResultDto,
    DiscoveryStoreImageResultDto,
    DiscoveryStorePlanResultDto,
} from '@app/contracts/discovery/dto/discovery-store-detail.dto.js';
import type {DiscoveryStoreItemResultDto} from '@app/contracts/discovery/dto/discovery-store-list.dto.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {DISCOVERY_DATE_FORMAT, DISCOVERY_EARTH_RADIUS_KM, DISCOVERY_PLAN_TYPE_ORDER} from './discovery.constants.js';
import type {DiscoveryRoomCountRow, DiscoveryStorePlanRow, DiscoveryStoreRow} from './interfaces/discovery.repository.interface.js';

/** 반경을 덮는 위경도 사각형 — 인덱스로 먼저 거를 범위 */
export interface RadiusBox {
    min_latitude: number;
    max_latitude: number;
    min_longitude: number;
    max_longitude: number;
}

/** 그룹 사진 + 그룹 ID — service 가 공개 주소를 붙여 넘긴다 */
export interface DiscoveryRoomGroupImage extends DiscoveryRoomGroupImageResultDto {
    room_group_id: string;
}

/**
 * 도 → 라디안
 *
 * @param degrees 도
 * @returns 라디안
 */
function toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
}

/**
 * 라디안 → 도
 *
 * @param radians 라디안
 * @returns 도
 */
function toDegrees(radians: number): number {
    return (radians * 180) / Math.PI;
}

/**
 * 시각 → HH:mm (DB time 'HH:mm:ss')
 *
 * @param time 시각
 * @returns HH:mm
 */
function toHourMinute(time: string): string {
    return dayjs(time, ['HH:mm:ss', 'HH:mm'], true).format('HH:mm');
}

/**
 * 반경을 덮는 위경도 사각형 — 위도 폭 = 반경 / R, 경도 폭 = asin(sin(반경 / R) / cos(위도))(원의 가장 동서쪽 접점까지). 극에 닿으면 경도 전체.
 * 경도 ±180 넘김은 다루지 않는다(국내 서비스). 지구 반지름은 거리 SQL 과 같은 DISCOVERY_EARTH_RADIUS_KM.
 *
 * @param latitude 중심 위도
 * @param longitude 중심 경도
 * @param radius_km 반경(km)
 * @returns 사각형
 */
export function toRadiusBox(latitude: number, longitude: number, radius_km: number): RadiusBox {
    const angle = radius_km / DISCOVERY_EARTH_RADIUS_KM;
    const latitude_delta = toDegrees(angle);
    const longitude_delta = Math.abs(latitude) + latitude_delta >= 90 ? 180 : toDegrees(Math.asin(Math.min(1, Math.sin(angle) / Math.cos(toRadians(latitude)))));
    return {min_latitude: latitude - latitude_delta, max_latitude: latitude + latitude_delta, min_longitude: longitude - longitude_delta, max_longitude: longitude + longitude_delta};
}

/**
 * 오늘(한국 날짜)
 *
 * @returns YYYY-MM-DD
 */
export function todayKst(): string {
    return dayjs().tz(KST_TIMEZONE).format(DISCOVERY_DATE_FORMAT);
}

/**
 * 반경 업체 항목
 *
 * @param row 업체 행
 * @param image_url 대표 사진 공개 주소(없으면 null)
 * @returns 항목
 */
export function toDiscoveryStoreItem(row: DiscoveryStoreRow, image_url: string | null): DiscoveryStoreItemResultDto {
    return {
        store_id: row.store_id,
        store_name: row.store_name,
        address: row.address,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        distance_m: Number(row.distance_m),
        image_url,
        is_open: Number(row.is_open),
        is_always_open: Number(row.is_always_open),
        min_hourly_price: row.min_hourly_price === null ? null : Number(row.min_hourly_price),
        min_night_price: row.min_night_price === null ? null : Number(row.min_night_price),
    };
}

/**
 * 업체가 그 상품 종류를 파는지 — 업체 상품 설정 사용 중
 *
 * @param row 업체 상품 설정 행
 * @returns 팔면 true
 */
export function isStorePlanUsed(row: DiscoveryStorePlanRow): boolean {
    return Number(row.is_used) === 1;
}

/**
 * 그룹 상품을 파는지 — 업체가 그 종류를 팔고(사용 중인 업체 상품 설정) · 그룹 상품 사용 중 · 요금 > 0 (예약 판정 reservation.util.ts isGroupPlanOnSale 과 같은 기준)
 *
 * @param plan 그룹 상품
 * @param store_plans 사용 중인 업체 상품 설정
 * @returns 팔면 true
 */
export function isRoomGroupPlanOnSale(plan: RoomGroupPlanEntity, store_plans: DiscoveryStorePlanRow[]): boolean {
    return plan.is_used === 1 && plan.price > 0 && store_plans.some((row) => row.room_plan_type_id === plan.room_plan_type_id);
}

/**
 * 상품 종류 순(시간 이용 → 1박 → 연박)으로 정렬한 사본
 *
 * @param rows 업체 상품 설정 행
 * @returns 정렬한 사본
 */
export function sortStorePlanRows(rows: DiscoveryStorePlanRow[]): DiscoveryStorePlanRow[] {
    return [...rows].sort((a, b) => DISCOVERY_PLAN_TYPE_ORDER.indexOf(a.room_plan_type_id) - DISCOVERY_PLAN_TYPE_ORDER.indexOf(b.room_plan_type_id));
}

/**
 * 사진 항목 — 업체 사진 · 그룹 사진 공용
 *
 * @param image_url 공개 주소
 * @param sort_order 정렬 순서
 * @returns 항목
 */
export function toDiscoveryImage(image_url: string, sort_order: number): DiscoveryStoreImageResultDto {
    return {image_url, sort_order: Number(sort_order)};
}

/**
 * 영업시간 항목 — 휴무면 시각 null
 *
 * @param entity 요일 영업시간
 * @returns 항목
 */
export function toDiscoveryHour(entity: StoreHourEntity): DiscoveryStoreHourResultDto {
    return {
        day_of_week: entity.day_of_week,
        is_closed: entity.is_closed,
        open_time: entity.open_time ? toHourMinute(entity.open_time) : null,
        close_time: entity.close_time ? toHourMinute(entity.close_time) : null,
    };
}

/**
 * 브레이크타임 항목
 *
 * @param entity 브레이크타임
 * @returns 항목
 */
export function toDiscoveryBreak(entity: StoreBreakEntity): DiscoveryStoreBreakResultDto {
    return {start_time: toHourMinute(entity.start_time), end_time: toHourMinute(entity.end_time)};
}

/**
 * 상품 설정 항목 — 시각은 HH:mm
 *
 * @param row 업체 상품 설정 행
 * @returns 항목
 */
export function toDiscoveryStorePlan(row: DiscoveryStorePlanRow): DiscoveryStorePlanResultDto {
    return {
        room_plan_type_id: row.room_plan_type_id,
        room_plan_type_name: row.room_plan_type_name,
        days_of_week: Number(row.days_of_week),
        usage_hours: row.usage_hours === null ? null : Number(row.usage_hours),
        check_in_time: row.check_in_time ? toHourMinute(row.check_in_time) : null,
        check_out_time: row.check_out_time ? toHourMinute(row.check_out_time) : null,
        min_nights: row.min_nights === null ? null : Number(row.min_nights),
        max_nights: row.max_nights === null ? null : Number(row.max_nights),
    };
}

/**
 * 업체 상세 — 사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 · 정비시간은 넣지 않는다(사용자 결정 2026-11-06)
 *
 * @param store 업체
 * @param images 업체 사진 항목
 * @param hours 영업시간
 * @param breaks 브레이크타임
 * @param plans 사용 중인 상품 설정 행
 * @returns 상세
 */
export function toDiscoveryStoreDetail(
    store: StoreEntity,
    images: DiscoveryStoreImageResultDto[],
    hours: StoreHourEntity[],
    breaks: StoreBreakEntity[],
    plans: DiscoveryStorePlanRow[],
): DiscoveryStoreDetailResultDto {
    return {
        store_id: store.store_id,
        store_name: store.store_name,
        phone: store.phone,
        address: store.address,
        address_detail: store.address_detail ?? null,
        latitude: Number(store.latitude),
        longitude: Number(store.longitude),
        introduction: store.introduction ?? null,
        is_open: store.is_open,
        is_always_open: store.is_always_open,
        booking_open_hours: store.booking_open_hours,
        refund_deadline_minutes: store.refund_deadline_minutes,
        late_refund_percent: store.late_refund_percent,
        images,
        hours: hours.map(toDiscoveryHour),
        breaks: breaks.map(toDiscoveryBreak),
        plans: sortStorePlanRows(plans).map(toDiscoveryStorePlan),
    };
}

/**
 * 객실 그룹 목록 — 받은 그룹 순(그룹명 순)으로, 예약 받을 호실이 있고 판매 중인 상품이 있는 그룹만. 상품은 시간 이용 → 1박 → 연박, 기간 가격은 받은 순(시작 날짜 순).
 *
 * @param groups 객실 그룹
 * @param counts 그룹별 예약 받을 호실 수
 * @param store_plans 사용 중인 업체 상품 설정 행(종류명)
 * @param group_plans 판매 중인 그룹 상품
 * @param periods 그 그룹 상품들의 기간 가격(끝 날짜 ≥ 오늘)
 * @param images 그룹 사진(공개 주소)
 * @returns 그룹 목록
 */
export function toDiscoveryRoomGroups(
    groups: RoomGroupEntity[],
    counts: DiscoveryRoomCountRow[],
    store_plans: DiscoveryStorePlanRow[],
    group_plans: RoomGroupPlanEntity[],
    periods: RoomGroupPlanPriceEntity[],
    images: DiscoveryRoomGroupImage[],
): DiscoveryRoomGroupItemResultDto[] {
    const result: DiscoveryRoomGroupItemResultDto[] = [];
    for (const group of groups) {
        const room_count = Number(counts.find((row) => row.room_group_id === group.room_group_id)?.room_count ?? 0);
        const plans: DiscoveryRoomGroupPlanResultDto[] = [];
        for (const store_plan of sortStorePlanRows(store_plans)) {
            const plan = group_plans.find((item) => item.room_group_id === group.room_group_id && item.room_plan_type_id === store_plan.room_plan_type_id);
            if (plan) {
                plans.push({
                    room_plan_type_id: plan.room_plan_type_id,
                    room_plan_type_name: store_plan.room_plan_type_name,
                    price: plan.price,
                    period_prices: periods
                        .filter((item) => item.room_group_plan_id === plan.room_group_plan_id)
                        .map((item) => ({start_date: item.start_date, end_date: item.end_date, price: item.price, memo: item.memo ?? null})),
                });
            }
        }
        if (room_count === 0 || plans.length === 0) {
            continue;
        }
        result.push({
            room_group_id: group.room_group_id,
            room_group_name: group.room_group_name,
            description: group.description ?? null,
            room_group_detail: {
                room_count: group.room_group_detail.room_count,
                has_shower: group.room_group_detail.has_shower,
                has_tv: group.room_group_detail.has_tv,
                has_pc: group.room_group_detail.has_pc,
            },
            room_count,
            images: images.filter((image) => image.room_group_id === group.room_group_id).map((image) => toDiscoveryImage(image.image_url, image.sort_order)),
            plans,
        });
    }
    return result;
}
