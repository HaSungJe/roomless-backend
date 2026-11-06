import type {ReservationStoreRoomResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';
import type {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import type {StoreReservationRow, StoreRoomRow} from './interfaces/reservation.repository.interface.js';
import {RESERVATION_DATE_FORMAT} from './reservation.constants.js';

/**
 * 'YYYY-MM-DD' 가 있는 날짜인지(2026-02-30 ✗).
 *
 * @param value 날짜 문자열
 * @returns 있는 날짜면 true
 */
export function isValidDate(value: string): boolean {
    return dayjs(value, RESERVATION_DATE_FORMAT, true).isValid();
}

/**
 * 한국 날짜 0시.
 *
 * @param date 'YYYY-MM-DD'
 * @returns 그 날 0시(한국 시각)
 */
export function toKstDay(date: string): Dayjs {
    return dayjs.tz(date, RESERVATION_DATE_FORMAT, KST_TIMEZONE);
}

/**
 * 지금(한국 시각).
 *
 * @returns 지금
 */
export function nowKst(): Dayjs {
    return dayjs().tz(KST_TIMEZONE);
}

/**
 * 업체 취소 SMS.
 *
 * @param store_name 상호명
 * @param start_at 입실 일시
 * @param reason 취소 사유
 * @returns 문구
 */
export function buildStoreCancelSms(store_name: string, start_at: Date, reason: string): string {
    return `[roomless] ${store_name} ${dayjs(start_at).tz(KST_TIMEZONE).format('M/D HH:mm')} 예약이 업체 사정으로 취소되었습니다. 결제 금액은 전액 환불됩니다. 사유: ${reason}`;
}

/**
 * 호실 이동 SMS.
 *
 * @param store_name 상호명
 * @param start_at 입실 일시
 * @param from_room 원래 호실명
 * @param to_room 옮긴 호실명
 * @returns 문구
 */
export function buildRoomChangeSms(store_name: string, start_at: Date, from_room: string, to_room: string): string {
    return `[roomless] ${store_name} ${dayjs(start_at).tz(KST_TIMEZONE).format('M/D HH:mm')} 예약 호실이 ${from_room}에서 ${to_room}로 변경되었습니다.`;
}

/**
 * 시각 → ISO 8601(없으면 null) — raw select 는 Date 로 온다.
 *
 * @param value 시각
 * @returns ISO 문자열 또는 null
 */
function toIso(value: Date | string | null): string | null {
    return value === null ? null : dayjs(value).toISOString();
}

/**
 * 업체 예약 현황 — 호실마다 그날 예약(입실 순)을 붙인다.
 *
 * @param rooms 지워지지 않은 호실(층 · 호실명 순)
 * @param rows 그날과 겹치는 예약(입실 순)
 * @returns 호실 목록
 */
export function toStoreReservationRooms(rooms: StoreRoomRow[], rows: StoreReservationRow[]): ReservationStoreRoomResultDto[] {
    return rooms.map((room) => ({
        room_id: room.room_id,
        room_name: room.room_name,
        floor: Number(room.floor),
        room_group_id: room.room_group_id,
        room_group_name: room.room_group_name,
        room_state_id: room.room_state_id,
        room_state_name: room.room_state_name,
        reservations: rows
            .filter((row) => row.room_id === room.room_id)
            .map((row) => ({
                reservation_id: row.reservation_id,
                reservation_state_id: row.reservation_state_id,
                reservation_state_name: row.reservation_state_name,
                room_plan_type_id: row.room_plan_type_id,
                room_plan_type_name: row.room_plan_type_name,
                start_at: toIso(row.start_at) as string,
                end_at: toIso(row.end_at) as string,
                blocked_until: toIso(row.blocked_until) as string,
                total_price: Number(row.total_price),
                user_name: row.user_name,
                user_phone: row.user_phone ?? null,
            })),
    }));
}

/**
 * QR 이 지금 유효한지 — [starts_at, ends_at) 안. 업체 취소가 끝낼 QR 을 고를 때 쓴다.
 *
 * @param roomQr QR 행
 * @param now 지금
 * @returns 지금 유효하면 true
 */
export function isRoomQrActive(roomQr: Pick<RoomQrEntity, 'starts_at' | 'ends_at'>, now: Date): boolean {
    const at = dayjs(now);
    return !at.isBefore(roomQr.starts_at) && at.isBefore(roomQr.ends_at);
}
