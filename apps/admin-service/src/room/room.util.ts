import {randomUUID} from 'node:crypto';
import {LessThanOrEqual, MoreThanOrEqual, Not} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {dayjs} from '@app/common/utils/dayjs.js';
import type {RoomGroupDetailImageResultDto, RoomGroupDetailPlanResultDto, RoomGroupDetailResultDto} from '@app/contracts/room/dto/room-group-detail.dto.js';
import type {RoomGroupListItemResultDto} from '@app/contracts/room/dto/room-group-list.dto.js';
import type {RoomGroupPlanPriceItemResultDto} from '@app/contracts/room/dto/room-group-plan-price-list.dto.js';
import type {RoomListItemResultDto} from '@app/contracts/room/dto/room-list.dto.js';
import type {RoomPlanItemResultDto} from '@app/contracts/room/dto/room-plan-list.dto.js';
import type {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {ROOM_GROUP_DETAIL_DEFAULTS} from '@app/database/entities/room/room-group.entity.js';
import type {RoomGroupDetail, RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {RoomGroupPlanRow, RoomGroupRow, RoomPlanRow, RoomRow} from './interfaces/room.repository.interface.js';
import {ROOM_DATE_FORMAT, ROOM_GROUP_DETAIL_KEYS, ROOM_IMAGE_EXTENSION, ROOM_PLAN_TYPE_ORDER, ROOM_STATE_TRANSITIONS} from './room.constants.js';

/**
 * 업체 관리자가 호실 상태를 바꿀 수 있는지 — 정비중 → 예약가능(정비 완료) · 예약가능 / 정비중 → 사용중지 · 사용중지 → 예약가능(사용 재개)만.
 * 그 밖(예약완료 · 사용중에서, 예약완료 · 사용중 · 정비중으로, 같은 상태로, 모르는 상태)은 false.
 *
 * @param from 지금 상태 (t_room.room_state_id)
 * @param to 바꿀 상태
 * @returns 바꿀 수 있으면 true
 */
export function canChangeRoomState(from: string, to: string): boolean {
    return ROOM_STATE_TRANSITIONS.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to);
}

/**
 * 저장할 객실 그룹 상세정보 — 알려진 항목(ROOM_GROUP_DETAIL_KEYS) 중 값이 있는 것만 남기고, 빠진 항목은 지금 기본값(ROOM_GROUP_DETAIL_DEFAULTS)으로 채워 전부 만든다.
 * 선언 안 된 키는 버린다(ValidationPipe whitelist 꺼짐 · 큐 경로는 다시 검증하지 않는다). 입력 · 항목이 null 이면 보내지 않은 것과 같다.
 *
 * @param dto 상세정보 입력 (없거나 null 이면 기본값 그대로)
 * @returns 상세정보 (항목 모두)
 */
export function buildRoomGroupDetail(dto?: Partial<Record<keyof RoomGroupDetail, number | null>> | null): RoomGroupDetail {
    const detail: Record<keyof RoomGroupDetail, number> = {...ROOM_GROUP_DETAIL_DEFAULTS};
    for (const key of ROOM_GROUP_DETAIL_KEYS) {
        const value = dto?.[key];
        if (value !== undefined && value !== null) {
            detail[key] = value;
        }
    }
    return detail as RoomGroupDetail;
}

/**
 * 그룹 사진 저장 키 접두 — 공개(CDN 은 store/ 접두만 읽는다).
 *
 * @param store_id 업체 ID
 * @param room_group_id 객실 그룹 ID
 * @returns 접두 (끝에 / 없음)
 */
function roomGroupImagePrefix(store_id: string, room_group_id: string): string {
    return `store/${store_id}/room-group/${room_group_id}`;
}

/**
 * 그룹 사진 저장 키 — `store/<store_id>/room-group/<room_group_id>/<uuid 32자>.<jpg|png>`. 업로드마다 새 키다(같은 키를 덮어쓰지 않는다 — CDN 캐시).
 *
 * @param store_id 업체 ID
 * @param room_group_id 객실 그룹 ID
 * @param content_type MIME 타입 (image/jpeg · image/png)
 * @returns 저장 키
 */
export function buildRoomGroupImageKey(store_id: string, room_group_id: string, content_type: string): string {
    return `${roomGroupImagePrefix(store_id, room_group_id)}/${randomUUID().replace(/-/g, '')}.${ROOM_IMAGE_EXTENSION[content_type]}`;
}

/**
 * 등록하려는 키가 그 업체 · 그룹 · 형식으로 발급한 키 모양(`<접두>/<uuid 32자>.<확장자>`)인지 — 다른 업체 · 그룹의 키나 다른 접두를 막는다.
 *
 * @param file_key 등록하려는 키
 * @param store_id 업체 ID
 * @param room_group_id 객실 그룹 ID
 * @param content_type MIME 타입
 * @returns 맞으면 true
 */
export function isRoomGroupImageKey(file_key: string, store_id: string, room_group_id: string, content_type: string): boolean {
    const prefix = roomGroupImagePrefix(store_id, room_group_id);
    const extension = ROOM_IMAGE_EXTENSION[content_type];
    return Boolean(extension) && file_key.startsWith(`${prefix}/`) && new RegExp(`^[a-f0-9]{32}\\.${extension}$`).test(file_key.slice(prefix.length + 1));
}

/**
 * 새 그룹 사진의 정렬 순서 — 지금 사진의 가장 큰 순서 + 1, 없으면 0. 삭제로 빈 번호가 있어도 마지막에 붙는다.
 *
 * @param images 지금 그룹 사진 (지워지지 않은 것)
 * @returns 정렬 순서
 */
export function nextSortOrder(images: {sort_order: number}[]): number {
    return images.length > 0 ? Math.max(...images.map((image) => Number(image.sort_order))) + 1 : 0;
}

/**
 * 받은 ID 목록이 지금 ID 전부를 빠짐 · 남음 · 겹침 없이 담았는지 (순서 무관).
 *
 * @param ids 받은 ID 목록
 * @param current 지금 ID 목록
 * @returns 같은 집합이면 true
 */
export function isSameIdSet(ids: string[], current: string[]): boolean {
    return ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
}

/**
 * 상품 종류 순서(시간 이용 · 1박 · 연박 — ROOM_PLAN_TYPE_ORDER)로 정렬한 새 배열 — 모르는 종류는 맨 뒤.
 *
 * @param rows 상품 종류 ID 가 있는 행
 * @returns 정렬한 새 배열 (원본은 그대로)
 */
export function sortByPlanType<T extends {room_plan_type_id: string}>(rows: T[]): T[] {
    const rank = (row: T): number => {
        const index = ROOM_PLAN_TYPE_ORDER.indexOf(row.room_plan_type_id);
        return index === -1 ? ROOM_PLAN_TYPE_ORDER.length : index;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
}

/**
 * 있는 날짜인지 — 'YYYY-MM-DD' strict 파싱(2026-02-30 · 13월은 false).
 *
 * @param value 날짜 문자열
 * @returns 있는 날짜면 true
 */
export function isValidDate(value: string): boolean {
    return dayjs(value, ROOM_DATE_FORMAT, true).isValid();
}

/**
 * 기간 가격 겹침 WHERE — 같은 그룹 상품의 다른 기간 중 시작 ≤ 새 종료 그리고 종료 ≥ 새 시작(시작 · 종료 날짜 둘 다 포함 — 하루만 겹쳐도 겹침). 수정이면 자기 자신은 뺀다.
 *
 * @param room_group_plan_id 그룹 상품 ID
 * @param start_date 새 시작 날짜 'YYYY-MM-DD'
 * @param end_date 새 종료 날짜 'YYYY-MM-DD'
 * @param exclude_id 수정하는 기간 가격 ID (등록이면 null)
 * @returns WHERE
 */
export function buildPlanPriceOverlapWhere(room_group_plan_id: string, start_date: string, end_date: string, exclude_id: string | null): FindOptionsWhere<RoomGroupPlanPriceEntity> {
    const where: FindOptionsWhere<RoomGroupPlanPriceEntity> = {room_group_plan_id, start_date: LessThanOrEqual(end_date), end_date: MoreThanOrEqual(start_date)};
    return exclude_id ? {...where, room_group_plan_price_id: Not(exclude_id)} : where;
}

/**
 * time 컬럼 값('HH:mm:ss')을 'HH:mm' 으로 — 기준일(2000-01-01, UTC) 위의 dayjs 로 바꿔 형식만 맞춘다(서버 시간대와 무관).
 *
 * @param value 하루 안 시각 또는 null
 * @returns 'HH:mm' 또는 null
 */
export function toTimeOfDay(value: string | null): string | null {
    return value ? dayjs.utc(`2000-01-01 ${value}`).format('HH:mm') : null;
}

/**
 * 하루 안 시각 두 개가 같은지 — 'HH:mm' · 'HH:mm:ss' 를 섞어도 된다(기준일 2000-01-01, UTC 위의 dayjs 로 비교 — 서버 시간대와 무관).
 *
 * @param a 하루 안 시각
 * @param b 하루 안 시각
 * @returns 같으면 true
 */
export function isSameTimeOfDay(a: string, b: string): boolean {
    return dayjs.utc(`2000-01-01 ${a}`).isSame(dayjs.utc(`2000-01-01 ${b}`));
}

/**
 * 업체 상품 설정 항목.
 *
 * @param row 업체 상품 설정 행
 * @returns 항목 (시각은 'HH:mm' 또는 null)
 */
export function toRoomPlanItem(row: RoomPlanRow): RoomPlanItemResultDto {
    return {
        room_plan_type_id: row.room_plan_type_id,
        room_plan_type_name: row.room_plan_type_name,
        is_used: Number(row.is_used),
        days_of_week: Number(row.days_of_week),
        usage_hours: row.usage_hours === null ? null : Number(row.usage_hours),
        check_in_time: toTimeOfDay(row.check_in_time),
        check_out_time: toTimeOfDay(row.check_out_time),
    };
}

/**
 * 객실 그룹 목록 항목.
 *
 * @param row 객실 그룹 목록 행
 * @param image_url 대표 사진 CDN 주소 (사진이 없으면 null)
 * @returns 항목
 */
export function toRoomGroupListItem(row: RoomGroupRow, image_url: string | null): RoomGroupListItemResultDto {
    return {room_group_id: row.room_group_id, room_group_name: row.room_group_name, room_count: Number(row.room_count), image_url, created_at: dayjs(row.created_at).toISOString()};
}

/**
 * 객실 그룹 상세 — 상세정보는 알려진 항목을 모두(빠진 항목은 기본값) 담는다.
 *
 * @param group 객실 그룹
 * @param images 사진 항목 (정렬 순서 순)
 * @param plans 그룹 상품 항목 (상품 종류 순)
 * @returns 상세
 */
export function toRoomGroupDetail(group: RoomGroupEntity, images: RoomGroupDetailImageResultDto[], plans: RoomGroupDetailPlanResultDto[]): RoomGroupDetailResultDto {
    return {
        room_group_id: group.room_group_id,
        room_group_name: group.room_group_name,
        description: group.description ?? null,
        room_group_detail: buildRoomGroupDetail(group.room_group_detail),
        images,
        plans,
        created_at: group.created_at.toISOString(),
        updated_at: group.updated_at.toISOString(),
    };
}

/**
 * 객실 그룹 사진 항목.
 *
 * @param image 그룹 사진
 * @param image_url CDN 공개 주소
 * @returns 항목
 */
export function toRoomGroupImageItem(image: RoomGroupImageEntity, image_url: string): RoomGroupDetailImageResultDto {
    return {room_group_image_id: image.room_group_image_id, file_name: image.file_name, content_type: image.content_type, sort_order: Number(image.sort_order), image_url};
}

/**
 * 그룹 상품 항목.
 *
 * @param row 그룹 상품 행
 * @returns 항목
 */
export function toRoomGroupPlanItem(row: RoomGroupPlanRow): RoomGroupDetailPlanResultDto {
    return {room_plan_type_id: row.room_plan_type_id, room_plan_type_name: row.room_plan_type_name, is_used: Number(row.is_used), price: Number(row.price)};
}

/**
 * 기간 가격 목록 항목 — 날짜는 date 컬럼 값 그대로('YYYY-MM-DD').
 *
 * @param price 기간 가격
 * @returns 항목
 */
export function toRoomGroupPlanPriceItem(price: RoomGroupPlanPriceEntity): RoomGroupPlanPriceItemResultDto {
    return {room_group_plan_price_id: price.room_group_plan_price_id, start_date: price.start_date, end_date: price.end_date, price: price.price, memo: price.memo ?? null};
}

/**
 * 호실 목록 항목.
 *
 * @param row 호실 목록 행
 * @returns 항목
 */
export function toRoomListItem(row: RoomRow): RoomListItemResultDto {
    return {
        room_id: row.room_id,
        room_group_id: row.room_group_id,
        room_group_name: row.room_group_name,
        room_name: row.room_name,
        floor: Number(row.floor),
        room_state_id: row.room_state_id,
        room_state_name: row.room_state_name,
        created_at: dayjs(row.created_at).toISOString(),
    };
}
