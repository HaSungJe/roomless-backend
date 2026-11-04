import type {ReservationAvailabilityRoomResultDto, ReservationAvailabilitySlotResultDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import type {ReservationDetailResultDto} from '@app/contracts/reservation/dto/reservation-detail.dto.js';
import type {ReservationListItemResultDto} from '@app/contracts/reservation/dto/reservation-list.dto.js';
import type {ReservationQrResultDto} from '@app/contracts/reservation/dto/reservation-qr.dto.js';
import type {ReservationStoreRoomResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';
import type {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import type {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {BookableRoomRow, ReservationListRow, ReservationSegmentRow, StoreReservationRow, StoreRoomRow} from './interfaces/reservation.repository.interface.js';
import {
    RESERVATION_DATE_FORMAT,
    RESERVATION_HOURLY_STEP_MINUTES,
    RESERVATION_IMMEDIATE_MINUTES,
    RESERVATION_ORDER_NAME_MAX_LENGTH,
    RESERVATION_PLAN_TYPE,
    RESERVATION_PLAN_TYPE_NAME,
    RESERVATION_QR_STATES,
    RESERVATION_ROOM_STATE,
} from './reservation.constants.js';

/** 이용 구간 — 입실일(요일 · 요금 기준일, 한국 날짜 0시) · 시작 · 끝(한국 시각) */
export interface Stay {
    day: Dayjs;
    start: Dayjs;
    end: Dayjs;
}

/** 점유 구간 — 같은 호실의 점유 예약 [start_at, blocked_until) */
export interface OccupiedRange {
    room_id: string;
    start_at: Date;
    blocked_until: Date;
}

/** 재고 판정 재료 — 업체 · 상품 설정 · 영업시간 · 브레이크 · 일시 예약불가(지워지지 않은 행) */
export interface BookingContext {
    now: Dayjs;
    is_open: number;
    is_always_open: number;
    booking_open_hours: number;
    maintenance_minutes: number;
    room_plan_type_id: string;
    days_of_week: number;
    hours: StoreHourEntity[];
    breaks: StoreBreakEntity[];
    unavailable: StoreUnavailablePeriodEntity[];
}

/** 시각 창 — [start, end) */
interface TimeWindow {
    start: Dayjs;
    end: Dayjs;
}

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
 * 날짜 위의 하루 안 시각 — 'HH:mm' · 'HH:mm:ss'(time 컬럼) 모두 받는다.
 *
 * @param day 그 날 0시(한국 시각)
 * @param time 하루 안 시각
 * @returns 그 날 그 시각
 */
function atTimeOfDay(day: Dayjs, time: string): Dayjs {
    const parsed = dayjs(time, ['HH:mm:ss', 'HH:mm'], true);
    return day.add(parsed.hour() * 60 + parsed.minute(), 'minute');
}

/**
 * 하루 창 — 끝이 시작보다 이르거나 같으면 다음 날 끝(자정 넘김, 형제 store.util.ts toDailyRange).
 *
 * @param day 그 날 0시
 * @param start_time 시작 시각
 * @param end_time 끝 시각
 * @returns [시작, 끝)
 */
function toDailyWindow(day: Dayjs, start_time: string, end_time: string): TimeWindow {
    const start = atTimeOfDay(day, start_time);
    const end = atTimeOfDay(day, end_time);
    return {start, end: end.isAfter(start) ? end : end.add(1, 'day')};
}

/**
 * 맞닿거나 겹치는 창을 합친다(Mon 10:00~24:00 + Tue 00:00~ 처럼 이어지는 영업은 한 창).
 *
 * @param windows 창 목록
 * @returns 시작 순으로 합친 창
 */
function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
    const sorted = [...windows].sort((a, b) => a.start.diff(b.start));
    const merged: TimeWindow[] = [];
    for (const window of sorted) {
        const last = merged[merged.length - 1];
        if (last && !window.start.isAfter(last.end)) {
            last.end = window.end.isAfter(last.end) ? window.end : last.end;
        } else {
            merged.push({...window});
        }
    }
    return merged;
}

/**
 * 영업시간 창 — firstDay ~ lastDay 의 요일 행(휴무 제외)으로 만들고 합친다. 자정을 넘는 전날 영업은 firstDay 를 하루 앞당겨 넘기면 잡힌다.
 *
 * @param hours 요일별 영업시간
 * @param firstDay 첫 날 0시
 * @param lastDay 마지막 날 0시
 * @returns 영업 창
 */
function listBusinessWindows(hours: StoreHourEntity[], firstDay: Dayjs, lastDay: Dayjs): TimeWindow[] {
    const windows: TimeWindow[] = [];
    for (let day = firstDay; !day.isAfter(lastDay); day = day.add(1, 'day')) {
        const row = hours.find((hour) => hour.day_of_week === day.day());
        if (row && row.is_closed !== 1 && row.open_time !== null && row.close_time !== null) {
            windows.push(toDailyWindow(day, row.open_time, row.close_time));
        }
    }
    return mergeWindows(windows);
}

/**
 * 브레이크타임 창 — 매일 같은 시각(firstDay ~ lastDay).
 *
 * @param breaks 브레이크타임
 * @param firstDay 첫 날 0시
 * @param lastDay 마지막 날 0시
 * @returns 브레이크 창
 */
function listBreakWindows(breaks: StoreBreakEntity[], firstDay: Dayjs, lastDay: Dayjs): TimeWindow[] {
    const windows: TimeWindow[] = [];
    for (let day = firstDay; !day.isAfter(lastDay); day = day.add(1, 'day')) {
        for (const item of breaks) {
            windows.push(toDailyWindow(day, item.start_time, item.end_time));
        }
    }
    return windows;
}

/**
 * 영업시간 · 브레이크 — 시간 이용은 구간 전체가 영업시간 안 · 브레이크와 안 겹침, 1박 · 연박은 체크인 [여는, 닫는) · 체크아웃 (여는, 닫는] 이 각각 영업시간 안 · 브레이크 안이 아님.
 * 24시간 업체는 영업시간을 보지 않는다(브레이크는 본다). 사용자 결정 2026-11-03
 *
 * @param stay 이용 구간
 * @param context 재고 판정 재료
 * @returns 맞으면 true
 */
function isWithinStoreHours(stay: Stay, context: BookingContext): boolean {
    const firstDay = stay.day.subtract(1, 'day');
    const lastDay = toKstDay(stay.end.format(RESERVATION_DATE_FORMAT));
    const breaks = listBreakWindows(context.breaks, firstDay, lastDay);
    const hours = context.is_always_open === 1 ? null : listBusinessWindows(context.hours, firstDay, lastDay);
    if (context.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY) {
        const overlapsBreak = breaks.some((window) => window.start.isBefore(stay.end) && window.end.isAfter(stay.start));
        const inHours = hours === null || hours.some((window) => !window.start.isAfter(stay.start) && !window.end.isBefore(stay.end));
        return !overlapsBreak && inHours;
    }
    const checkInBreak = breaks.some((window) => !window.start.isAfter(stay.start) && window.end.isAfter(stay.start));
    const checkOutBreak = breaks.some((window) => window.start.isBefore(stay.end) && !window.end.isBefore(stay.end));
    const checkInHours = hours === null || hours.some((window) => !window.start.isAfter(stay.start) && window.end.isAfter(stay.start));
    const checkOutHours = hours === null || hours.some((window) => window.start.isBefore(stay.end) && !window.end.isBefore(stay.end));
    return !checkInBreak && !checkOutBreak && checkInHours && checkOutHours;
}

/**
 * 이용 구간 1개 — 시간 이용은 시작 시각 + 이용 시간, 1박은 체크인 ~ 다음 날 체크아웃(항상 날짜를 넘긴다 — 사용자 결정 2026-11-03), 연박은 체크인 ~ 박수 뒤 날의 체크아웃.
 * 상품 설정의 nullable 컬럼은 종류별 CHECK(CHK_RoomPlan_*)가 채워 둔다.
 *
 * @param plan 업체 상품 설정
 * @param day 입실일 0시
 * @param start_time 시간 이용 시작 시각(HH:mm) — 그 밖은 null
 * @param nights 연박 박수 — 그 밖은 null
 * @returns 이용 구간
 */
export function toStay(plan: RoomPlanEntity, day: Dayjs, start_time: string | null, nights: number | null): Stay {
    if (plan.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY) {
        const start = atTimeOfDay(day, start_time as string);
        return {day, start, end: start.add(plan.usage_hours as number, 'hour')};
    }
    const start = atTimeOfDay(day, plan.check_in_time as string);
    const stay_nights = plan.room_plan_type_id === RESERVATION_PLAN_TYPE.NIGHT ? 1 : (nights as number);
    return {day, start, end: atTimeOfDay(day.add(stay_nights, 'day'), plan.check_out_time as string)};
}

/**
 * 그 날의 이용 구간 후보 — 시간 이용은 30분마다(00:00 ~ 23:30), 1박 · 연박은 1개.
 *
 * @param plan 업체 상품 설정
 * @param day 입실일 0시
 * @param nights 연박 박수 — 그 밖은 null
 * @returns 후보 구간(시작 순)
 */
export function listStays(plan: RoomPlanEntity, day: Dayjs, nights: number | null): Stay[] {
    if (plan.room_plan_type_id !== RESERVATION_PLAN_TYPE.HOURLY) {
        return [toStay(plan, day, null, nights)];
    }
    const stays: Stay[] = [];
    for (let minute = 0; minute < 24 * 60; minute += RESERVATION_HOURLY_STEP_MINUTES) {
        const start = day.add(minute, 'minute');
        stays.push({day, start, end: start.add(plan.usage_hours as number, 'hour')});
    }
    return stays;
}

/**
 * 후보 구간들이 걸치는 전체 범위 — 일시 예약불가 · 점유 예약을 한 번에 읽는 조회 범위(끝은 정비시간까지).
 *
 * @param stays 후보 구간
 * @param maintenance_minutes 정비시간(분)
 * @returns [처음 시작, 마지막 끝 + 정비시간)
 */
export function toStaysRange(stays: Stay[], maintenance_minutes: number): {from: Date; to: Date} {
    const from = stays.reduce((min, stay) => (stay.start.isBefore(min) ? stay.start : min), stays[0].start);
    const to = stays.reduce((max, stay) => (stay.end.isAfter(max) ? stay.end : max), stays[0].end).add(maintenance_minutes, 'minute');
    return {from: from.toDate(), to: to.toDate()};
}

/**
 * 연박 박수가 업체 설정 안인지.
 *
 * @param plan 업체 상품 설정(연박)
 * @param nights 박수
 * @returns 최소 ~ 최대면 true
 */
export function isNightsAllowed(plan: RoomPlanEntity, nights: number): boolean {
    return nights >= (plan.min_nights as number) && nights <= (plan.max_nights as number);
}

/**
 * 그룹 상품을 파는지 — 사용 중 · 요금 > 0.
 *
 * @param plan 그룹 상품
 * @returns 팔면 true
 */
export function isGroupPlanOnSale(plan: RoomGroupPlanEntity): boolean {
    return plan.is_used === 1 && plan.price > 0;
}

/**
 * 재고 판정 재료를 묶는다.
 *
 * @param now 지금(한국 시각)
 * @param store 업체
 * @param plan 업체 상품 설정
 * @param hours 요일별 영업시간
 * @param breaks 브레이크타임
 * @param unavailable 일시 예약불가(조회 범위와 겹치는 것)
 * @returns 재료
 */
export function buildBookingContext(
    now: Dayjs,
    store: StoreEntity,
    plan: RoomPlanEntity,
    hours: StoreHourEntity[],
    breaks: StoreBreakEntity[],
    unavailable: StoreUnavailablePeriodEntity[],
): BookingContext {
    return {
        now,
        is_open: store.is_open,
        is_always_open: store.is_always_open,
        booking_open_hours: store.booking_open_hours,
        maintenance_minutes: store.maintenance_minutes,
        room_plan_type_id: plan.room_plan_type_id,
        days_of_week: plan.days_of_week,
        hours,
        breaks,
        unavailable,
    };
}

/**
 * 재고 판정 — 업체 영업중 · 호실 사용중지 아님 · 시작(지금 이후 · 예약 가능 기간 안, 즉시 입실은 예약가능 호실만) · 입실일 요일 ·
 * 영업시간 · 브레이크 · 일시 예약불가 · 점유([시작, 끝 + 정비시간)이 점유 예약과 겹치지 않음). 반열린 구간이라 맞닿음은 된다.
 *
 * @param stay 이용 구간
 * @param context 재고 판정 재료
 * @param room_state_id 호실 상태
 * @param occupied 그 호실의 점유 예약
 * @returns 예약할 수 있으면 true
 */
export function isStayBookable(stay: Stay, context: BookingContext, room_state_id: string, occupied: OccupiedRange[]): boolean {
    if (context.is_open !== 1 || room_state_id === RESERVATION_ROOM_STATE.DISABLED) {
        return false;
    }
    if (stay.start.isBefore(context.now) || stay.start.isAfter(context.now.add(context.booking_open_hours, 'hour'))) {
        return false;
    }
    if (stay.start.isBefore(context.now.add(RESERVATION_IMMEDIATE_MINUTES, 'minute')) && room_state_id !== RESERVATION_ROOM_STATE.AVAILABLE) {
        return false;
    }
    if ((context.days_of_week & (1 << stay.day.day())) === 0) {
        return false;
    }
    if (!isWithinStoreHours(stay, context)) {
        return false;
    }
    if (context.unavailable.some((period) => dayjs(period.starts_at).isBefore(stay.end) && dayjs(period.ends_at).isAfter(stay.start))) {
        return false;
    }
    const blocked_until = stay.end.add(context.maintenance_minutes, 'minute');
    return !occupied.some((range) => dayjs(range.start_at).isBefore(blocked_until) && dayjs(range.blocked_until).isAfter(stay.start));
}

/**
 * 하루 요금 — 그 날짜가 기간 가격(시작 · 끝 날짜 포함) 안이면 기간 요금, 아니면 기본 요금.
 *
 * @param day 날짜 0시
 * @param base_price 그룹 상품 기본 요금
 * @param periods 그룹 상품의 기간 가격(지워지지 않은 행)
 * @returns 요금(원)
 */
function priceOn(day: Dayjs, base_price: number, periods: RoomGroupPlanPriceEntity[]): number {
    const period = periods.find((item) => !day.isBefore(toKstDay(item.start_date)) && !day.isAfter(toKstDay(item.end_date)));
    return period ? period.price : base_price;
}

/**
 * 금액 — 시간 이용 · 1박은 입실일 요금, 연박은 박마다(입실일, +1일, …) 요금 합계. 사용자 결정 2026-11-03
 *
 * @param room_plan_type_id 상품 종류
 * @param day 입실일 0시
 * @param nights 연박 박수 — 그 밖은 null
 * @param base_price 그룹 상품 기본 요금
 * @param periods 그룹 상품의 기간 가격
 * @returns 금액(원)
 */
export function calculateStayPrice(room_plan_type_id: string, day: Dayjs, nights: number | null, base_price: number, periods: RoomGroupPlanPriceEntity[]): number {
    const count = room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? (nights as number) : 1;
    let total = 0;
    for (let index = 0; index < count; index += 1) {
        total += priceOn(day.add(index, 'day'), base_price, periods);
    }
    return total;
}

/**
 * 호실별 예약 가능 시간 — 이 상품을 파는 그룹(그룹 상품 판매 · 요금 > 0)의 호실만, 구간은 재고 판정을 지난 것만.
 *
 * @param rooms 지워지지 않은 호실(층 · 호실명 순)
 * @param group_plans 판매 중인 그룹 상품
 * @param periods 그 그룹 상품들의 기간 가격
 * @param stays 후보 구간
 * @param context 재고 판정 재료
 * @param occupied 호실들의 점유 예약
 * @param nights 연박 박수 — 그 밖은 null
 * @returns 호실 목록
 */
export function toAvailabilityRooms(
    rooms: BookableRoomRow[],
    group_plans: RoomGroupPlanEntity[],
    periods: RoomGroupPlanPriceEntity[],
    stays: Stay[],
    context: BookingContext,
    occupied: OccupiedRange[],
    nights: number | null,
): ReservationAvailabilityRoomResultDto[] {
    const result: ReservationAvailabilityRoomResultDto[] = [];
    for (const room of rooms) {
        const plan = group_plans.find((item) => item.room_group_id === room.room_group_id);
        if (!plan) {
            continue;
        }
        const roomOccupied = occupied.filter((range) => range.room_id === room.room_id);
        const price = calculateStayPrice(
            context.room_plan_type_id,
            stays[0].day,
            nights,
            plan.price,
            periods.filter((item) => item.room_group_plan_id === plan.room_group_plan_id),
        );
        result.push({
            room_id: room.room_id,
            room_name: room.room_name,
            floor: Number(room.floor),
            room_group_id: room.room_group_id,
            room_group_name: room.room_group_name,
            price,
            slots: stays.filter((stay) => isStayBookable(stay, context, room.room_state_id, roomOccupied)).map(toSlot),
        });
    }
    return result;
}

/**
 * 구간 → 응답(ISO 8601).
 *
 * @param stay 이용 구간
 * @returns 구간 응답
 */
export function toSlot(stay: Stay): ReservationAvailabilitySlotResultDto {
    return {start_at: stay.start.toISOString(), end_at: stay.end.toISOString()};
}

/**
 * 토스 주문명 — `<상호명> <호실명> <상품명>`(연박은 박수), 100자로 자른다.
 *
 * @param store_name 상호명
 * @param room_name 호실명
 * @param room_plan_type_id 상품 종류
 * @param nights 연박 박수 — 그 밖은 null
 * @returns 주문명
 */
export function buildOrderName(store_name: string, room_name: string, room_plan_type_id: string, nights: number | null): string {
    const plan = room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? `${RESERVATION_PLAN_TYPE_NAME[room_plan_type_id]} ${nights}박` : RESERVATION_PLAN_TYPE_NAME[room_plan_type_id];
    return `${store_name} ${room_name} ${plan}`.slice(0, RESERVATION_ORDER_NAME_MAX_LENGTH);
}

/**
 * 이용자 취소 환불액 — 환불 마감 전 100%, 마감 ~ 이용 시작 전 결제 금액 × 비율(원 단위 내림), 시작 뒤(시작 정각 포함)는 취소 불가(null). 사용자 결정 2026-11-03
 *
 * @param amount 결제 금액(원)
 * @param now 지금
 * @param refund_deadline_at 환불 마감(예약 때 저장)
 * @param start_at 이용 시작
 * @param late_refund_percent 마감 뒤 환불 비율(예약 때 저장)
 * @returns 환불액 — 취소할 수 없으면 null
 */
export function calculateRefundAmount(amount: number, now: Dayjs, refund_deadline_at: Date, start_at: Date, late_refund_percent: number): number | null {
    if (!now.isBefore(dayjs(start_at))) {
        return null;
    }
    if (now.isBefore(dayjs(refund_deadline_at))) {
        return amount;
    }
    return Math.floor((amount * late_refund_percent) / 100);
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
 * 내 예약 목록 항목.
 *
 * @param row 목록 행
 * @returns 항목
 */
export function toReservationListItem(row: ReservationListRow): ReservationListItemResultDto {
    return {
        reservation_id: row.reservation_id,
        store_id: row.store_id,
        store_name: row.store_name,
        room_id: row.room_id,
        room_name: row.room_name,
        room_group_name: row.room_group_name,
        room_plan_type_id: row.room_plan_type_id,
        room_plan_type_name: row.room_plan_type_name,
        reservation_state_id: row.reservation_state_id,
        reservation_state_name: row.reservation_state_name,
        start_at: toIso(row.start_at) as string,
        end_at: toIso(row.end_at) as string,
        total_price: Number(row.total_price),
        refund_deadline_at: toIso(row.refund_deadline_at) as string,
        created_at: toIso(row.created_at) as string,
    };
}

/**
 * 내 예약 상세 — 목록 항목 + 취소 정보 + 구간 · 결제.
 *
 * @param row 목록 행
 * @param segments 구간 행(시작 순)
 * @returns 상세
 */
export function toReservationDetail(row: ReservationListRow, segments: ReservationSegmentRow[]): ReservationDetailResultDto {
    return {
        ...toReservationListItem(row),
        late_refund_percent: Number(row.late_refund_percent),
        canceled_at: toIso(row.canceled_at),
        cancel_actor: row.cancel_actor ?? null,
        cancel_reason: row.cancel_reason ?? null,
        segments: segments.map((segment) => ({
            reservation_detail_id: segment.reservation_detail_id,
            reservation_detail_type_id: segment.reservation_detail_type_id,
            reservation_detail_type_name: segment.reservation_detail_type_name,
            reservation_state_id: segment.reservation_state_id,
            start_at: toIso(segment.start_at) as string,
            end_at: toIso(segment.end_at) as string,
            price: Number(segment.price),
            expires_at: toIso(segment.expires_at),
            payment: {
                payment_id: segment.payment_id,
                payment_state_id: segment.payment_state_id,
                payment_state_name: segment.payment_state_name,
                amount: Number(segment.amount),
                method: segment.method ?? null,
                approved_at: toIso(segment.approved_at),
                receipt_url: segment.receipt_url ?? null,
                refund_amount: segment.refund_amount === null ? null : Number(segment.refund_amount),
                refunded_at: toIso(segment.refunded_at),
            },
        })),
    };
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

/** 내 예약 QR 판정 — SHOW: 지금 QR 을 준다, ISSUE: 발급해서 준다, OUT_OF_TIME: 이용 시간 밖, NO_QR: QR 을 볼 수 없는 예약 */
export type ReservationQrVerdict = 'SHOW' | 'ISSUE' | 'OUT_OF_TIME' | 'NO_QR';

/**
 * 내 예약 QR 판정 — 확정 · 이용 중 예약의 이용 구간 [start_at, end_at) 안일 때만. QR 행이 없으면 발급(사용자 결정 2026-11-04),
 * 있으면 지금 유효할 때만 준다(업체가 끝낸 QR — ends_at ≤ 지금 — 은 볼 수 없다).
 *
 * @param reservation 예약 (상태 · 이용 구간)
 * @param roomQr 그 예약의 QR 행 (없으면 null)
 * @param now 지금
 * @returns 판정
 */
export function judgeReservationQr(
    reservation: Pick<ReservationEntity, 'reservation_state_id' | 'start_at' | 'end_at'>,
    roomQr: Pick<RoomQrEntity, 'starts_at' | 'ends_at'> | null,
    now: Date,
): ReservationQrVerdict {
    if (!RESERVATION_QR_STATES.includes(reservation.reservation_state_id)) {
        return 'NO_QR';
    }
    const at = dayjs(now);
    if (at.isBefore(reservation.start_at) || !at.isBefore(reservation.end_at)) {
        return 'OUT_OF_TIME';
    }
    if (!roomQr) {
        return 'ISSUE';
    }
    return isRoomQrActive(roomQr, now) ? 'SHOW' : 'NO_QR';
}

/**
 * QR 이 지금 유효한지 — [starts_at, ends_at) 안. 업체 취소가 끝낼 QR 을 고를 때도 쓴다.
 *
 * @param roomQr QR 행
 * @param now 지금
 * @returns 지금 유효하면 true
 */
export function isRoomQrActive(roomQr: Pick<RoomQrEntity, 'starts_at' | 'ends_at'>, now: Date): boolean {
    const at = dayjs(now);
    return !at.isBefore(roomQr.starts_at) && at.isBefore(roomQr.ends_at);
}

/**
 * 내 예약 QR 응답
 *
 * @param roomQr QR 행
 * @returns QR · 유효 시작 · 끝(ISO 8601)
 */
export function toReservationQr(roomQr: RoomQrEntity): ReservationQrResultDto {
    return {reservation_id: roomQr.reservation_id, room_id: roomQr.room_id, qr: roomQr.qr, qr_starts_at: dayjs(roomQr.starts_at).toISOString(), qr_ends_at: dayjs(roomQr.ends_at).toISOString()};
}
