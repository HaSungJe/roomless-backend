import type {ReservationStoreRoomResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {RESERVATION_CANCEL_REQUEST_MINUTES, RESERVATION_CANCEL_REQUEST_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';
import type {ReservationCancelRequestEntity} from '@app/database/entities/reservation/reservation-cancel-request.entity.js';
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
 * 이용 중 취소 요청 SMS — 예약자 승인 링크(로그인해 승인 · 거절 — 사용자 결정 2026-11-07).
 *
 * @param store_name 상호명
 * @param link 승인 화면 주소(`<USER_WEB_URL>/reservation/<예약 ID>/cancel-request`)
 * @returns 문구
 */
export function buildUseCancelRequestSms(store_name: string, link: string): string {
    return `[roomless] ${store_name}에서 이용 중인 예약 취소를 요청했습니다(전액 환불). 동의하려면 ${RESERVATION_CANCEL_REQUEST_MINUTES}분 안에 확인해주세요: ${link}`;
}

/**
 * 이용자 화면 주소(USER_WEB_URL) — 끝의 / 를 뗀다. 비어 있으면 null(승인 링크를 만들 수 없다).
 *
 * @returns 주소 또는 null
 */
export function readUserWebUrl(): string | null {
    const value = process.env.USER_WEB_URL?.trim().replace(/\/+$/, '');
    return value ? value : null;
}

/**
 * 이용 중 취소 요청 만료 시각 — min(요청 + 10분, 예약 끝)(사용자 결정 2026-11-07).
 *
 * @param requested_at 요청 시각
 * @param end_at 예약 끝
 * @returns 만료 시각
 */
export function cancelRequestExpiresAt(requested_at: Date, end_at: Date): Date {
    const limit = dayjs(requested_at).add(RESERVATION_CANCEL_REQUEST_MINUTES, 'minute');
    return limit.isBefore(end_at) ? limit.toDate() : dayjs(end_at).toDate();
}

/**
 * 이용 중 취소 요청의 보이는 상태 — 요청 중인데 만료 시각이 지났으면(정각 포함) 만료(만료는 저장하지 않고 읽을 때 계산한다 — user-service 와 같은 규칙).
 *
 * @param request 요청 (상태 · 만료)
 * @param now 지금
 * @returns 보이는 상태
 */
export function cancelRequestState(request: Pick<ReservationCancelRequestEntity, 'reservation_cancel_request_state_id' | 'expires_at'>, now: Date): string {
    if (request.reservation_cancel_request_state_id !== RESERVATION_CANCEL_REQUEST_STATE.REQUESTED) {
        return request.reservation_cancel_request_state_id;
    }
    return dayjs(now).isBefore(request.expires_at) ? RESERVATION_CANCEL_REQUEST_STATE.REQUESTED : RESERVATION_CANCEL_REQUEST_STATE.EXPIRED;
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
 * 업체 예약 현황 — 호실마다 그날 예약(입실 순)을 붙인다. 마지막 이용 중 취소 요청은 보이는 상태(만료 계산)로.
 *
 * @param rooms 지워지지 않은 호실(층 · 호실명 순)
 * @param rows 그날과 겹치는 예약(입실 순)
 * @param now 지금(취소 요청 만료 계산)
 * @returns 호실 목록
 */
export function toStoreReservationRooms(rooms: StoreRoomRow[], rows: StoreReservationRow[], now: Date): ReservationStoreRoomResultDto[] {
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
                cancel_request_state_id:
                    row.cancel_request_state_id && row.cancel_request_expires_at
                        ? cancelRequestState({reservation_cancel_request_state_id: row.cancel_request_state_id, expires_at: dayjs(row.cancel_request_expires_at).toDate()}, now)
                        : null,
                cancel_request_created_at: toIso(row.cancel_request_created_at ?? null),
            })),
    }));
}
