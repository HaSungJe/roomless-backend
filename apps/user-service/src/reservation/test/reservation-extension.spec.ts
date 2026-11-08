import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In, LessThan, MoreThan, Not} from 'typeorm';
import {
    bootHttpPath,
    createReservationRepositoryMock,
    detailEntity,
    everyDayHours,
    groupPlanEntity,
    internalHeaders,
    planEntity,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    ROOM_GROUP_PLAN_ID,
    ROOM_ID,
    roomEntity,
    STORE_ID,
    storeEntity,
    USER_ACTOR,
} from './reservation.test-helper.js';

const PATH = `/internal/v1/user-service/reservation/${RESERVATION_ID}/extension`;

/** 한국 시각 → Date (예: '2026-11-10 15:00') */
const kst = (value: string): Date => new Date(`${value.replace(' ', 'T')}:00+09:00`);

/** 판정 문구 */
const NOT_IN_USE = '이용 중인 예약만 연장할 수 있습니다.';
const EXPIRED = '결제하지 않은 연장이 있어 더 연장할 수 없습니다.';
const PENDING = '결제 대기 중인 연장이 있습니다.';
const UNAVAILABLE = '지금은 연장할 수 없습니다.';
const NOT_EXTENDABLE = '연장할 수 없는 상품입니다.';
const NOT_ON_SALE = '연장 상품을 팔지 않는 업체입니다.';
const TIME = '연장할 수 없는 시간입니다.';
const NEXT = '다음 예약이 있어 연장할 수 없습니다.';

/** 연장 판정 재료 — 기본은 시간 이용 이용 중 예약 13:00 ~ 16:00 · 정비 30분, 지금 15:00, 영업 10:00 ~ 22:00 · 이용 시간 4 · 시간 이용 30,000 · 1박 50,000 */
interface Scenario {
    now?: string;
    reservation?: Record<string, unknown>;
    details?: Record<string, unknown>[];
    store?: Record<string, unknown> | null;
    room?: Record<string, unknown> | null;
    plans?: Record<string, Record<string, unknown> | null>;
    group_plans?: Record<string, Record<string, unknown> | null>;
    periods?: Record<string, unknown>[];
    hours?: Record<string, unknown>[];
    breaks?: Record<string, unknown>[];
    unavailable?: Record<string, unknown>[];
    occupied?: Record<string, unknown>[];
}

describe('GET /internal/v1/user-service/reservation/:reservation_id/extension — 연장 조회 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        repo = createReservationRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    /**
     * 판정 재료를 mock 에 건다(종류별 업체 상품 설정 · 그룹 상품).
     *
     * @param scenario 기본에서 바꿀 것
     */
    function arrange(scenario: Scenario): void {
        vi.setSystemTime(kst(scenario.now ?? '2026-11-10 15:00'));
        repo.findReservation.mockResolvedValueOnce(
            reservationEntity({reservation_state_id: 'CHECKED_IN', start_at: kst('2026-11-10 13:00'), end_at: kst('2026-11-10 16:00'), total_price: 30000, ...scenario.reservation}),
        );
        repo.findReservationDetails.mockResolvedValueOnce(scenario.details ?? [detailEntity()]);
        repo.findReservationStore.mockResolvedValueOnce(scenario.store === undefined ? storeEntity() : scenario.store);
        repo.findReservationRoom.mockResolvedValueOnce(scenario.room === undefined ? roomEntity({room_state_id: 'IN_USE'}) : scenario.room);
        const plans: Record<string, Record<string, unknown> | null> = {
            HOURLY: planEntity('HOURLY', {usage_hours: 4}),
            NIGHT: planEntity('NIGHT', {check_in_time: '21:00:00'}),
            LONG: planEntity('LONG'),
            ...scenario.plans,
        };
        repo.findStorePlan.mockImplementation((where: {room_plan_type_id: string}) => Promise.resolve(plans[where.room_plan_type_id] ?? null));
        const group_plans: Record<string, Record<string, unknown> | null> = {
            HOURLY: groupPlanEntity('HOURLY', {price: 30000}),
            NIGHT: groupPlanEntity('NIGHT', {price: 50000}),
            ...scenario.group_plans,
        };
        repo.findGroupPlans.mockImplementation((where: {room_plan_type_id: string}) => Promise.resolve(group_plans[where.room_plan_type_id] ? [group_plans[where.room_plan_type_id]] : []));
        repo.findGroupPlanPrices.mockResolvedValueOnce(scenario.periods ?? []);
        repo.findStoreHours.mockResolvedValueOnce(scenario.hours ?? everyDayHours('10:00:00', '22:00:00'));
        repo.findStoreBreaks.mockResolvedValueOnce(scenario.breaks ?? []);
        repo.findUnavailablePeriods.mockResolvedValueOnce(scenario.unavailable ?? []);
        repo.findReservations.mockResolvedValueOnce(scenario.occupied ?? []);
    }

    /**
     * 연장 조회 1건
     *
     * @returns 응답
     */
    function getExtension() {
        return request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));
    }

    /**
     * [CASES:extension-stay] — 연장 구간 · 금액(사용자 확정 2026-11-09). 시간 이용 · 1박은 + 이용 시간(시간 이용 요금), 연박은 + 1일(1박 요금), 요금 기준일 = 연장 시작의 한국 날짜.
     * [이름, 재료, 기대 요금 상품 · 시작 · 끝 · 금액]
     */
    describe('[CASES:extension-stay] 연장 구간 · 금액', () => {
        it.each([
            ['1. 시간 이용 14:00 ~ 16:00(이용 시간 4) → 16:00 ~ 20:00 · 시간 이용 요금', {reservation: {start_at: kst('2026-11-10 14:00')}}, ['HOURLY', '2026-11-10 16:00', '2026-11-10 20:00', 30000]],
            [
                '2. 시간 이용 14:00 ~ 20:00(한 번 연장한 뒤) → 20:00 ~ 다음 날 00:00',
                {
                    now: '2026-11-10 19:00',
                    reservation: {start_at: kst('2026-11-10 14:00'), end_at: kst('2026-11-10 20:00')},
                    details: [detailEntity(), detailEntity({reservation_detail_type_id: 'EXTENSION'})],
                    store: storeEntity({is_always_open: 1}),
                },
                ['HOURLY', '2026-11-10 20:00', '2026-11-11 00:00', 30000],
            ],
            [
                '3. 시간 이용 22:00 ~ 02:00 → 02:00 ~ 06:00 · 요금 날짜는 연장 시작일(다음 날 — 11/11 기간 가격)',
                {
                    now: '2026-11-11 01:00',
                    reservation: {start_at: kst('2026-11-10 22:00'), end_at: kst('2026-11-11 02:00')},
                    store: storeEntity({is_always_open: 1}),
                    periods: [{room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: '2026-11-11', end_date: '2026-11-11', price: 45000, is_deleted: 0}],
                },
                ['HOURLY', '2026-11-11 02:00', '2026-11-11 06:00', 45000],
            ],
            [
                '4. 1박 21:00 ~ 다음 날 09:00 → 09:00 ~ 13:00 · 시간 이용 요금',
                {now: '2026-11-11 08:00', reservation: {room_plan_type_id: 'NIGHT', start_at: kst('2026-11-10 21:00'), end_at: kst('2026-11-11 09:00')}, hours: everyDayHours('08:00:00', '23:00:00')},
                ['HOURLY', '2026-11-11 09:00', '2026-11-11 13:00', 30000],
            ],
            [
                '5. 연박 11/10 15:00 ~ 11/12 11:00(2박) → 11/12 11:00 ~ 11/13 11:00 · 1박 요금 · 연장 뒤 3박(최대 30)',
                {now: '2026-11-12 10:00', reservation: {room_plan_type_id: 'LONG', start_at: kst('2026-11-10 15:00'), end_at: kst('2026-11-12 11:00')}},
                ['NIGHT', '2026-11-12 11:00', '2026-11-13 11:00', 50000],
            ],
            [
                '6. 연장 시작일이 기간 가격 안 → 기간 요금',
                {periods: [{room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: '2026-11-09', end_date: '2026-11-12', price: 40000, is_deleted: 0}]},
                ['HOURLY', '2026-11-10 16:00', '2026-11-10 20:00', 40000],
            ],
            [
                '7. 연장 시작일이 기간 가격 밖(전날까지) → 기본 요금',
                {periods: [{room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: '2026-11-01', end_date: '2026-11-09', price: 40000, is_deleted: 0}]},
                ['HOURLY', '2026-11-10 16:00', '2026-11-10 20:00', 30000],
            ],
        ] as [string, Scenario, [string, string, string, number]][])('%s', async (_label, scenario, [room_plan_type_id, start, end, amount]) => {
            arrange(scenario);

            const res = await getExtension();

            expect(res.status).toBe(200);
            expect(res.body).toEqual({reservation_id: RESERVATION_ID, is_extendable: 1, reason: null, room_plan_type_id, start_at: kst(start).toISOString(), end_at: kst(end).toISOString(), amount});
        });
    });

    /**
     * [CASES:extension-judge] — 연장 가능 판정(사용자 확정 2026-11-09). 위에서부터 첫 사유, null 이면 가능.
     * [이름, 재료, 기대 사유(null = 가능)]
     */
    describe('[CASES:extension-judge] 연장 가능 판정', () => {
        it.each([
            ['1. 확정 · 시작 전 → 이용 중 아님', {now: '2026-11-10 12:00', reservation: {reservation_state_id: 'CONFIRMED'}}, NOT_IN_USE],
            ['2. 이용 중 · 지금 = 끝 정각 → 이용 중 아님', {now: '2026-11-10 16:00'}, NOT_IN_USE],
            ['3-1. 취소 → 이용 중 아님', {reservation: {reservation_state_id: 'CANCELED'}}, NOT_IN_USE],
            ['3-2. 이용 완료 → 이용 중 아님', {reservation: {reservation_state_id: 'COMPLETED'}}, NOT_IN_USE],
            ['3-3. 결제 대기 → 이용 중 아님', {reservation: {reservation_state_id: 'PENDING'}}, NOT_IN_USE],
            ['4. 만료된 연장 구간이 있음', {details: [detailEntity(), detailEntity({reservation_detail_type_id: 'EXTENSION', reservation_state_id: 'EXPIRED'})]}, EXPIRED],
            ['5. 결제 대기 중인 연장 구간이 있음', {details: [detailEntity(), detailEntity({reservation_detail_type_id: 'EXTENSION', reservation_state_id: 'PENDING'})]}, PENDING],
            ['6-1. 업체 영업중 아님', {store: storeEntity({is_open: 0})}, UNAVAILABLE],
            ['6-2. 호실 사용중지', {room: roomEntity({room_state_id: 'DISABLED'})}, UNAVAILABLE],
            ['7. 예약 상품(시간 이용) 행 연장 불가', {plans: {HOURLY: planEntity('HOURLY', {usage_hours: 4, is_extendable: 0})}}, NOT_EXTENDABLE],
            [
                '8. 1박 예약 · 1박 행 연장 가능 · 시간 이용 행 연장 불가 → 가능(설정은 예약 상품 행)',
                {
                    now: '2026-11-11 08:00',
                    reservation: {room_plan_type_id: 'NIGHT', start_at: kst('2026-11-10 21:00'), end_at: kst('2026-11-11 09:00')},
                    plans: {HOURLY: planEntity('HOURLY', {usage_hours: 4, is_extendable: 0})},
                    hours: everyDayHours('08:00:00', '23:00:00'),
                },
                null,
            ],
            ['9. 확정 연장 3회 · 최대 3회 → 불가', {details: [detailEntity(), ...[1, 2, 3].map(() => detailEntity({reservation_detail_type_id: 'EXTENSION'}))]}, '연장은 최대 3회까지 할 수 있습니다.'],
            ['10. 확정 연장 2회 · 최대 3회 → 가능', {details: [detailEntity(), ...[1, 2].map(() => detailEntity({reservation_detail_type_id: 'EXTENSION'}))]}, null],
            ['11-1. 업체 시간 이용 미판매', {plans: {HOURLY: planEntity('HOURLY', {usage_hours: 4, is_used: 0})}}, NOT_ON_SALE],
            ['11-2. 그룹 시간 이용 요금 0', {group_plans: {HOURLY: groupPlanEntity('HOURLY', {price: 0})}}, NOT_ON_SALE],
            [
                '12. 연박 2박 · 최대 2박 → 불가',
                {
                    now: '2026-11-12 10:00',
                    reservation: {room_plan_type_id: 'LONG', start_at: kst('2026-11-10 15:00'), end_at: kst('2026-11-12 11:00')},
                    plans: {LONG: planEntity('LONG', {max_nights: 2})},
                },
                '연박은 최대 2박까지 연장할 수 있습니다.',
            ],
            ['13-1. 연장 구간(16:00 ~ 20:00)이 영업 끝(19:00)을 넘음', {hours: everyDayHours('10:00:00', '19:00:00')}, TIME],
            ['13-2. 브레이크(18:00 ~ 18:30)와 겹침', {breaks: [{store_id: STORE_ID, start_time: '18:00:00', end_time: '18:30:00', is_deleted: 0}]}, TIME],
            ['13-3. 일시 예약불가(17:00 ~ 18:00)와 겹침', {unavailable: [{store_id: STORE_ID, starts_at: kst('2026-11-10 17:00'), ends_at: kst('2026-11-10 18:00'), is_deleted: 0}]}, TIME],
            ['14. 다음 예약 시작(20:00) < 연장 끝 + 정비시간(20:30) → 불가', {occupied: [{room_id: ROOM_ID, start_at: kst('2026-11-10 20:00'), blocked_until: kst('2026-11-10 23:30')}]}, NEXT],
            ['15. 다음 예약 시작 = 연장 끝 + 정비시간(맞닿음) → 가능', {occupied: [{room_id: ROOM_ID, start_at: kst('2026-11-10 20:30'), blocked_until: kst('2026-11-10 23:30')}]}, null],
            ['16. 24시간 업체 · 영업시간(10:00 ~ 19:00) 밖 → 가능(브레이크만 본다)', {store: storeEntity({is_always_open: 1}), hours: everyDayHours('10:00:00', '19:00:00')}, null],
        ] as [string, Scenario, string | null][])('%s', async (_label, scenario, reason) => {
            arrange(scenario);

            const res = await getExtension();

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({reservation_id: RESERVATION_ID, is_extendable: reason === null ? 1 : 0, reason});
        });
    });

    describe('[SUCCESS]', () => {
        it('재료를 읽는 조건 — 내 예약 · 그 예약 구간 전부 · 예약 상품 행 · 요금 상품 행 · 그 그룹 요금 상품 · 연장 구간과 겹치는 일시 예약불가 · 그 호실의 다른 점유 예약(정비시간까지), 잡아 두지 않는다', async () => {
            arrange({reservation: {room_plan_type_id: 'NIGHT', start_at: kst('2026-11-10 21:00'), end_at: kst('2026-11-11 09:00')}, now: '2026-11-11 08:00'});

            const res = await getExtension();

            expect(res.status).toBe(200);
            expect(repo.findReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, user_id: USER_ACTOR.user_id});
            expect(repo.findReservationDetails).toHaveBeenCalledWith({reservation_id: RESERVATION_ID});
            expect(repo.findStorePlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.findStorePlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id: 'HOURLY'});
            expect(repo.findGroupPlans).toHaveBeenCalledWith({room_group_id: roomEntity().room_group_id, room_plan_type_id: 'HOURLY'});
            expect(repo.findGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: ROOM_GROUP_PLAN_ID});
            expect(repo.findUnavailablePeriods).toHaveBeenCalledWith({store_id: STORE_ID, starts_at: LessThan(kst('2026-11-11 13:00')), ends_at: MoreThan(kst('2026-11-11 09:00'))});
            expect(repo.findReservations).toHaveBeenCalledWith({
                room_id: ROOM_ID,
                reservation_id: Not(RESERVATION_ID),
                reservation_state_id: In(['PENDING', 'CONFIRMED', 'CHECKED_IN']),
                start_at: LessThan(kst('2026-11-11 13:30')),
                blocked_until: MoreThan(kst('2026-11-11 09:00')),
            });
            expect(repo.insertPayment).not.toHaveBeenCalled();
            expect(repo.updateReservationHold).not.toHaveBeenCalled();
        });

        it('시간 이용 예약은 예약 상품 행이 곧 요금 상품 행 — 업체 상품 설정을 한 번만 읽는다', async () => {
            arrange({});

            await getExtension();

            expect(repo.findStorePlan).toHaveBeenCalledTimes(1);
            expect(repo.findStorePlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id: 'HOURLY'});
        });

        it('요금 상품을 팔지 않아도 계산할 수 있는 구간은 채운다(그룹 상품이 없으면 금액 null)', async () => {
            arrange({group_plans: {HOURLY: null}});

            const res = await getExtension();

            expect(res.body).toEqual({
                reservation_id: RESERVATION_ID,
                is_extendable: 0,
                reason: NOT_ON_SALE,
                room_plan_type_id: 'HOURLY',
                start_at: kst('2026-11-10 16:00').toISOString(),
                end_at: kst('2026-11-10 20:00').toISOString(),
                amount: null,
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('내 예약이 아니면 404, 재료 조회 없음', async () => {
            repo.findReservation.mockResolvedValueOnce(null);

            const res = await getExtension();

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '예약을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findReservationDetails).not.toHaveBeenCalled();
        });

        it('결제 대기 만료 예약은 404', async () => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'EXPIRED'}));

            const res = await getExtension();

            expect(res.status).toBe(404);
        });
    });

    describe('[FAIL:validation]', () => {
        it('예약 ID 가 32자 hex 가 아니면 400 validation_errors.reservation_id, 예약 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/user-service/reservation/xyz/extension').set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '예약 ID가 올바르지 않습니다.', validation_errors: [{property: 'reservation_id', message: '예약 ID가 올바르지 않습니다.'}]});
            expect(repo.findReservation).not.toHaveBeenCalled();
        });
    });
});
