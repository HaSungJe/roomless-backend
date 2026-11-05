import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In} from 'typeorm';
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import {ReservationAvailabilityDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import {
    bookableRoom,
    bootHttpPath,
    createReservationRepositoryMock,
    everyDayHours,
    groupPlanEntity,
    internalHeaders,
    NOW,
    planEntity,
    ReservationRepositoryMock,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    ROOM_ID,
    ROOM_ID_2,
    STORE_ID,
    storeEntity,
    validateBody,
} from './reservation.test-helper.js';

const PATH = '/internal/v1/user-service/reservation/availability';

/**
 * from ~ to(포함) 30분마다 'HH:mm'
 *
 * @param from 처음
 * @param to 끝
 * @returns 시각 목록
 */
function times(from: string, to: string): string[] {
    const result: string[] = [];
    for (let at = dayjs(`2000-01-01 ${from}`); !at.isAfter(dayjs(`2000-01-01 ${to}`)); at = at.add(30, 'minute')) {
        result.push(at.format('HH:mm'));
    }
    return result;
}

/** 재고 판정 케이스 입력 */
interface AvailabilityCase {
    query: Record<string, string>;
    now?: string;
    store?: Record<string, unknown>;
    plan?: Record<string, unknown>;
    hours?: Record<string, unknown>[];
    breaks?: Record<string, unknown>[];
    unavailable?: Record<string, unknown>[];
    occupied?: Record<string, unknown>[];
    room_state_id?: string;
    group_price?: number;
    prices?: Record<string, unknown>[];
    slots: string[];
    price?: number;
}

/**
 * [CASES:availability] — 재고 판정 · 요금 12개(사용자 결정 2026-11-03). 지금 2026-11-03(화) 09:00 한국 시각, 기본 업체 영업 10:00 ~ 22:00 · 정비 30분 · 72시간 전부터.
 * [이름, 입력 · 기대(시작 시각 한국 HH:mm · 금액)]
 */
const AVAILABILITY_CASES: [string, AvailabilityCase][] = [
    ['1. 시간 이용 3시간 · 영업 10 ~ 22시 — 10:00 ~ 19:00 30분마다', {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, slots: times('10:00', '19:00')}],
    [
        '2. 브레이크 13 ~ 14시 — 걸치는 시작 제외, 끝이 13:00 에 맞닿는 10:00 은 허용',
        {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, breaks: [{start_time: '13:00:00', end_time: '14:00:00'}], slots: ['10:00', ...times('14:00', '19:00')]},
    ],
    [
        '3. 자정 넘는 영업 18 ~ 06시 — 전날 영업으로 00:00 ~ 03:00, 그날 18:00 ~ 23:30',
        {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, hours: everyDayHours('18:00:00', '06:00:00'), slots: [...times('00:00', '03:00'), ...times('18:00', '23:30')]},
    ],
    [
        '4. 기존 점유 [12:00, 15:30) — 새 [시작, 끝 + 정비 30분)이 겹치면 제외',
        {
            query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'},
            occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-04T03:00:00Z'), blocked_until: new Date('2026-11-04T06:30:00Z')}],
            slots: times('15:30', '19:00'),
        },
    ],
    [
        '5. 오늘 10:10 · 정비중 호실 — 지난 시각 제외, 30분 안(10:30)은 예약가능 호실만',
        {query: {date: '2026-11-03', room_plan_type_id: 'HOURLY'}, now: '2026-11-03T01:10:00Z', room_state_id: 'MAINTENANCE', slots: times('11:00', '19:00')},
    ],
    [
        '6. 예약 가능 기간 24시간(24시간 업체) — 시작 ≤ 내일 09:00',
        {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, store: {booking_open_hours: 24, is_always_open: 1}, slots: times('00:00', '09:00')},
    ],
    ['7. 수요일 예약 불가(119) · 수요일 대실 — 없음', {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, plan: {days_of_week: 119}, slots: []}],
    [
        '7-2. 수요일 예약 불가 · 화요일 입실 숙박(화 → 수) — 입실일만 보므로 가능',
        {query: {date: '2026-11-03', room_plan_type_id: 'NIGHT'}, store: {is_always_open: 1}, plan: {days_of_week: 119}, slots: ['22:00']},
    ],
    [
        '8. 24시간 업체 + 브레이크 13 ~ 14시 — 하루 전체에서 브레이크에 걸치는 시작만 뺀다',
        {
            query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'},
            store: {is_always_open: 1},
            breaks: [{start_time: '13:00:00', end_time: '14:00:00'}],
            slots: [...times('00:00', '10:00'), ...times('14:00', '23:30')],
        },
    ],
    ['9. 숙박 22:00 → 09:00 · 영업 10 ~ 23시 — 체크아웃 09:00 이 영업시간 밖', {query: {date: '2026-11-04', room_plan_type_id: 'NIGHT'}, hours: everyDayHours('10:00:00', '23:00:00'), slots: []}],
    [
        '9-2. 숙박 22:00 → 09:00 · 영업 08 ~ 23시 — 체크인 · 체크아웃 모두 영업시간 안',
        {query: {date: '2026-11-04', room_plan_type_id: 'NIGHT'}, hours: everyDayHours('08:00:00', '23:00:00'), slots: ['22:00']},
    ],
    [
        '10. 연박 3박 · 수요일 예약 불가 · 화요일 입실 — 입실일만 보므로 가능',
        {query: {date: '2026-11-03', room_plan_type_id: 'LONG', nights: '3'}, store: {is_always_open: 1}, plan: {days_of_week: 119, min_nights: 2, max_nights: 5}, slots: ['15:00']},
    ],
    [
        '11. 연박 3박 요금 — 기간 가격(11/4 ~ 11/5) 박만 기간 요금 80,000 + 80,000 + 50,000',
        {
            query: {date: '2026-11-04', room_plan_type_id: 'LONG', nights: '3'},
            store: {is_always_open: 1},
            group_price: 50000,
            prices: [{room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: '2026-11-04', end_date: '2026-11-05', price: 80000, is_deleted: 0}],
            slots: ['15:00'],
            price: 210000,
        },
    ],
    [
        '12. 일시 예약불가 12:00 ~ 13:00 — 겹치는 시작 제외(13:00 맞닿음은 허용)',
        {
            query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'},
            unavailable: [{starts_at: new Date('2026-11-04T03:00:00Z'), ends_at: new Date('2026-11-04T04:00:00Z')}],
            slots: times('13:00', '19:00'),
        },
    ],
];

/** 둘째 그룹(디럭스) · 그 호실 · 그 그룹 상품 */
const ROOM_GROUP_ID_2 = '8'.repeat(32);
const ROOM_ID_3 = '7'.repeat(32);
const ROOM_GROUP_PLAN_ID_2 = '6'.repeat(32);

/** 지금 바로 케이스 입력 */
interface NowStayCase {
    now?: string;
    date?: string;
    store?: Record<string, unknown>;
    hours?: Record<string, unknown>[];
    breaks?: Record<string, unknown>[];
    unavailable?: Record<string, unknown>[];
    occupied?: Record<string, unknown>[];
    room_state_id?: string;
    slot: [string, string] | null;
}

/**
 * [CASES:now-stay] — 시간 이용 '지금 바로' 12개(사용자 확정 2026-11-06). 이용 시간 4시간(240분), 지금 2026-11-05 23:36:27(한국), 24시간 업체 · 정비 30분 · 예약가능 호실 기본.
 * [이름, 입력 · 기대(지금 바로 시간대 [start_at, end_at] — UTC ISO, 없으면 null)]
 */
const NOW_STAY_CASES: [string, NowStayCase][] = [
    ['1. 비어 있음 → 23:36 ~ 다음 날 03:36 (초는 버림)', {slot: ['2026-11-05T14:36:00.000Z', '2026-11-05T18:36:00.000Z']}],
    [
        '2. 다음 날 02:00 ~ 06:00 시간 이용 확정과 겹침 → 없음',
        {occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T17:00:00Z'), blocked_until: new Date('2026-11-05T21:30:00Z')}], slot: null},
    ],
    [
        '3. 다음 날 03:36 시작 예약 · 정비 0 → 맞닿아 가능',
        {
            store: {maintenance_minutes: 0},
            occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T18:36:00Z'), blocked_until: new Date('2026-11-05T22:36:00Z')}],
            slot: ['2026-11-05T14:36:00.000Z', '2026-11-05T18:36:00.000Z'],
        },
    ],
    ['4. 앞 예약 점유 끝 23:40(정비 30분 포함) → 없음', {occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T11:10:00Z'), blocked_until: new Date('2026-11-05T14:40:00Z')}], slot: null}],
    ['5. 같은 호실 1박(오늘 22:00 ~ 내일 11:00) → 없음', {occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T13:00:00Z'), blocked_until: new Date('2026-11-06T02:30:00Z')}], slot: null}],
    ['6. 결제 대기 예약(점유) 00:00 ~ 02:00 과 겹침 → 없음', {occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-05T15:00:00Z'), blocked_until: new Date('2026-11-05T17:30:00Z')}], slot: null}],
    ['7. 호실 정비중(예약가능 아님) → 없음', {room_state_id: 'MAINTENANCE', slot: null}],
    ['8. 영업시간 18:00 ~ 02:00(24시간 아님) — 끝 03:36 이 밖 → 없음', {store: {is_always_open: 0}, hours: everyDayHours('18:00:00', '02:00:00'), slot: null}],
    ['9. 브레이크 01:00 ~ 02:00 → 없음', {breaks: [{start_time: '01:00:00', end_time: '02:00:00'}], slot: null}],
    ['10. 일시 예약불가 내일 00:00 ~ 09:00 → 없음', {unavailable: [{starts_at: new Date('2026-11-05T15:00:00Z'), ends_at: new Date('2026-11-06T00:00:00Z')}], slot: null}],
    ['11. 영업중 아님(is_open 0) → 없음', {store: {is_open: 0}, slot: null}],
    ['12. 연도 경계 — 지금 2026-12-31 23:50:10 → 23:50 ~ 2027-01-01 03:50', {now: '2026-12-31T14:50:10Z', date: '2026-12-31', slot: ['2026-12-31T14:50:00.000Z', '2026-12-31T18:50:00.000Z']}],
];

describe('GET /internal/v1/user-service/reservation/availability — 객실 그룹별 예약 가능 시간 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createReservationRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[CASES:availability] 재고 판정 · 요금', () => {
        it.each(AVAILABILITY_CASES)('%s', async (_label, input) => {
            vi.setSystemTime(new Date(input.now ?? NOW.toISOString()));
            const type = input.query.room_plan_type_id;
            repo.findReservationStore.mockResolvedValueOnce(storeEntity(input.store));
            repo.findStorePlan.mockResolvedValueOnce(planEntity(type, input.plan));
            repo.findBookableRooms.mockResolvedValueOnce([bookableRoom({room_state_id: input.room_state_id ?? 'AVAILABLE'})]);
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity(type, {price: input.group_price ?? 30000})]);
            repo.findGroupPlanPrices.mockResolvedValueOnce(input.prices ?? []);
            repo.findStoreHours.mockResolvedValueOnce(input.hours ?? everyDayHours('10:00:00', '22:00:00'));
            repo.findStoreBreaks.mockResolvedValueOnce(input.breaks ?? []);
            repo.findUnavailablePeriods.mockResolvedValueOnce(input.unavailable ?? []);
            repo.findReservations.mockResolvedValueOnce(input.occupied ?? []);

            const res = await request(app.getHttpServer())
                .get(PATH)
                .query({store_id: STORE_ID, ...input.query})
                .set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.list).toHaveLength(1);
            const group = res.body.list[0];
            expect(group.slots.map((slot: {start_at: string}) => dayjs(slot.start_at).tz(KST_TIMEZONE).format('HH:mm'))).toEqual(input.slots);
            if (input.price !== undefined) {
                expect(group.price).toBe(input.price);
            }
        });
    });

    describe('[CASES:now-stay] 시간 이용 지금 바로', () => {
        it.each(NOW_STAY_CASES)('%s', async (_label, input) => {
            vi.setSystemTime(new Date(input.now ?? '2026-11-05T14:36:27Z'));
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_always_open: 1, ...input.store}));
            repo.findStorePlan.mockResolvedValueOnce(planEntity('HOURLY', {usage_hours: 4}));
            repo.findBookableRooms.mockResolvedValueOnce([bookableRoom({room_state_id: input.room_state_id ?? 'AVAILABLE'})]);
            repo.findStoreHours.mockResolvedValueOnce(input.hours ?? everyDayHours('10:00:00', '22:00:00'));
            repo.findStoreBreaks.mockResolvedValueOnce(input.breaks ?? []);
            repo.findUnavailablePeriods.mockResolvedValueOnce(input.unavailable ?? []);
            repo.findReservations.mockResolvedValueOnce(input.occupied ?? []);

            const res = await request(app.getHttpServer())
                .get(PATH)
                .query({store_id: STORE_ID, date: input.date ?? '2026-11-05', room_plan_type_id: 'HOURLY'})
                .set(internalHeaders());

            expect(res.status).toBe(200);
            const slots: {is_now: number}[] = res.body.list[0].slots;
            const nowSlot = slots.find((slot) => slot.is_now === 1) ?? null;
            if (input.slot) {
                expect(slots[0]).toEqual({start_at: input.slot[0], end_at: input.slot[1], is_now: 1, rooms: [{room_id: ROOM_ID, room_name: '101호', floor: 1}]});
            } else {
                expect(nowSlot).toBeNull();
            }
        });

        it('오늘이 아닌 날짜 · 1박이면 지금 바로 시간대가 없다', async () => {
            const tomorrow = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());
            repo.findStorePlan.mockResolvedValueOnce(planEntity('NIGHT'));
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('NIGHT')]);
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_always_open: 1}));
            const night = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-03', room_plan_type_id: 'NIGHT'}).set(internalHeaders());

            expect(tomorrow.body.list[0].slots.length).toBeGreaterThan(0);
            expect(tomorrow.body.list[0].slots.every((slot: {is_now: number}) => slot.is_now === 0)).toBe(true);
            expect(night.body.list[0].slots).toHaveLength(1);
            expect(night.body.list[0].slots[0].is_now).toBe(0);
        });
    });

    describe('[SUCCESS]', () => {
        it('응답 모양 · 조회 조건 — 그룹 → 시간대 → 호수, 활성 업체, 판매 중인 그룹 상품의 호실만, 점유 상태 · 조회 범위', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({room_plan_type_id: 'HOURLY', date: '2026-11-04', nights: null});
            expect(res.body.list[0]).toMatchObject({room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', price: 30000});
            expect(res.body.list[0].slots[0]).toEqual({start_at: '2026-11-04T01:00:00.000Z', end_at: '2026-11-04T04:00:00.000Z', is_now: 0, rooms: [{room_id: ROOM_ID, room_name: '101호', floor: 1}]});
            expect(repo.findReservationStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: 'ACTIVE'});
            expect(repo.findStorePlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id: 'HOURLY'});
            expect(repo.findGroupPlans).toHaveBeenCalledWith({room_group_id: In([ROOM_GROUP_ID]), room_plan_type_id: 'HOURLY'});
            expect(repo.findGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: In([ROOM_GROUP_PLAN_ID])});
            const [occupiedWhere] = repo.findReservations.mock.calls[0] as [Record<string, unknown>];
            expect(occupiedWhere.room_id).toEqual(In([ROOM_ID]));
            expect(occupiedWhere.reservation_state_id).toEqual(In(['PENDING', 'CONFIRMED', 'CHECKED_IN']));
        });

        it('그룹 2개 · 같은 그룹 호실 2개 — 그룹명 순, 101호가 점유한 시간대에는 102호만, 뒤 시간대는 101호 · 102호', async () => {
            repo.findBookableRooms.mockResolvedValueOnce([
                bookableRoom(),
                bookableRoom({room_id: ROOM_ID_2, room_name: '102호'}),
                bookableRoom({room_id: ROOM_ID_3, room_name: '201호', floor: 2, room_group_id: ROOM_GROUP_ID_2, room_group_name: '디럭스'}),
            ]);
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('HOURLY'), groupPlanEntity('HOURLY', {room_group_plan_id: ROOM_GROUP_PLAN_ID_2, room_group_id: ROOM_GROUP_ID_2, price: 50000})]);
            repo.findReservations.mockResolvedValueOnce([{room_id: ROOM_ID, start_at: new Date('2026-11-04T01:00:00Z'), blocked_until: new Date('2026-11-04T04:30:00Z')}]);

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.body.list.map((group: {room_group_name: string}) => group.room_group_name)).toEqual(['디럭스', '스탠다드']);
            expect(res.body.list[0]).toMatchObject({room_group_id: ROOM_GROUP_ID_2, price: 50000});
            const standard = res.body.list[1];
            expect(standard.slots[0].rooms).toEqual([{room_id: ROOM_ID_2, room_name: '102호', floor: 1}]);
            const after = standard.slots.find((slot: {start_at: string}) => slot.start_at === '2026-11-04T04:30:00.000Z');
            expect(after.rooms.map((room: {room_name: string}) => room.room_name)).toEqual(['101호', '102호']);
        });

        it('room_group_id 필터 — 그 그룹의 호실만으로 그룹 상품 · 점유 예약을 본다', async () => {
            repo.findBookableRooms.mockResolvedValueOnce([bookableRoom(), bookableRoom({room_id: ROOM_ID_3, room_name: '201호', floor: 2, room_group_id: ROOM_GROUP_ID_2, room_group_name: '디럭스'})]);
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('HOURLY', {room_group_plan_id: ROOM_GROUP_PLAN_ID_2, room_group_id: ROOM_GROUP_ID_2})]);

            const res = await request(app.getHttpServer())
                .get(PATH)
                .query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY', room_group_id: ROOM_GROUP_ID_2})
                .set(internalHeaders());

            expect(res.body.list).toHaveLength(1);
            expect(res.body.list[0].room_group_id).toBe(ROOM_GROUP_ID_2);
            expect(repo.findGroupPlans).toHaveBeenCalledWith({room_group_id: In([ROOM_GROUP_ID_2]), room_plan_type_id: 'HOURLY'});
            const [occupiedWhere] = repo.findReservations.mock.calls[0] as [Record<string, unknown>];
            expect(occupiedWhere.room_id).toEqual(In([ROOM_ID_3]));
        });

        it('업체에 없는 그룹이면 빈 목록 — 그룹 상품 조회 없음', async () => {
            const res = await request(app.getHttpServer())
                .get(PATH)
                .query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY', room_group_id: ROOM_GROUP_ID_2})
                .set(internalHeaders());

            expect(res.body.list).toEqual([]);
            expect(repo.findGroupPlans).not.toHaveBeenCalled();
        });

        it('그룹 상품을 팔지 않는 그룹(요금 0)은 나오지 않는다 — 빈 목록', async () => {
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('HOURLY', {price: 0})]);

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.body.list).toEqual([]);
            expect(repo.findReservations).not.toHaveBeenCalled();
        });

        it('영업중 아님(is_open 0) — 그룹은 나오지만 시간대가 없다', async () => {
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_open: 0}));

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.body.list).toHaveLength(1);
            expect(res.body.list[0].slots).toEqual([]);
        });
    });

    describe('[SKIP]', () => {
        it('업체가 이 상품을 팔지 않으면(is_used 0) 빈 목록 — 호실 조회 없음', async () => {
            repo.findStorePlan.mockResolvedValueOnce(planEntity('HOURLY', {is_used: 0}));

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.list).toEqual([]);
            expect(repo.findBookableRooms).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('업체가 없거나 활성이 아니면 404, 상품 조회 없음', async () => {
            repo.findReservationStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findStorePlan).not.toHaveBeenCalled();
        });

        it('연박 박수가 업체 설정(2 ~ 5박) 밖이면 400 validation_errors.nights', async () => {
            repo.findStorePlan.mockResolvedValueOnce(planEntity('LONG', {min_nights: 2, max_nights: 5}));

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'LONG', nights: '1'}).set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '연박은 2 ~ 5박으로 예약할 수 있습니다.', validation_errors: [{property: 'nights', message: '연박은 2 ~ 5박으로 예약할 수 있습니다.'}]});
            expect(repo.findBookableRooms).not.toHaveBeenCalled();
        });

        it('없는 날짜(2026-02-30)면 400 validation_errors.date, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-02-30', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '없는 날짜입니다.', validation_errors: [{property: 'date', message: '없는 날짜입니다.'}]});
            expect(repo.findReservationStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('연박인데 박수가 없으면 → nights', async () => {
            await expect(validateBody(ReservationAvailabilityDto, {store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'LONG'})).resolves.toEqual({
                message: '연박은 박수를 입력해주세요.',
                validation_errors: [{property: 'nights', message: '연박은 박수를 입력해주세요.'}],
            });
        });

        it('객실 그룹 ID 형식이 아니면 → room_group_id', async () => {
            await expect(validateBody(ReservationAvailabilityDto, {store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY', room_group_id: 'xyz'})).resolves.toEqual({
                message: '객실 그룹 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'}],
            });
        });

        it('날짜 형식이 아니면 → date', async () => {
            await expect(validateBody(ReservationAvailabilityDto, {store_id: STORE_ID, date: '20261104', room_plan_type_id: 'HOURLY'})).resolves.toEqual({
                message: '날짜를 YYYY-MM-DD 로 입력해주세요.',
                validation_errors: [{property: 'date', message: '날짜를 YYYY-MM-DD 로 입력해주세요.'}],
            });
        });
    });

    describe('[FAIL:internal]', () => {
        it('게이트웨이 내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'});

            expect(res.status).toBe(403);
            expect(repo.findReservationStore).not.toHaveBeenCalled();
        });
    });
});
