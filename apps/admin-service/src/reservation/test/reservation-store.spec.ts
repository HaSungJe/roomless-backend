import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    createReservationRepositoryMock,
    internalHeaders,
    MANAGER_ACTOR,
    RESERVATION_ID,
    ReservationRepositoryMock,
    ROOM_GROUP_ID,
    storeReservationRow,
    ROOM_ID,
    ROOM_ID_2,
    STORE_ID,
} from './reservation.test-helper.js';

const PATH = '/internal/v1/admin-service/reservation/store';

describe('GET /internal/v1/admin-service/reservation/store — 내 업체 예약 현황 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-10T05:05:00Z'));
        repo = createReservationRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    it('[SUCCESS] 매니저 소속 업체 · 그날 [0시, 다음 날 0시) — 호실마다 예약(이용자 이름 · 휴대폰)을 붙인다, 예약 없는 호실은 빈 배열', async () => {
        repo.findStoreRoomRows.mockResolvedValueOnce([
            {room_id: ROOM_ID, room_name: '101호', floor: 1, room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', room_state_id: 'IN_USE', room_state_name: '사용중'},
            {room_id: ROOM_ID_2, room_name: '102호', floor: 1, room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', room_state_id: 'AVAILABLE', room_state_name: '예약가능'},
        ]);
        repo.findStoreReservationRows.mockResolvedValueOnce([
            {
                reservation_id: RESERVATION_ID,
                room_id: ROOM_ID,
                reservation_state_id: 'CONFIRMED',
                reservation_state_name: '예약 확정',
                room_plan_type_id: 'HOURLY',
                room_plan_type_name: '시간 이용',
                start_at: new Date('2026-11-10T00:00:00Z'),
                end_at: new Date('2026-11-10T03:00:00Z'),
                blocked_until: new Date('2026-11-10T03:30:00Z'),
                total_price: 30000,
                user_name: '김이용',
                user_phone: '01012345678',
                cancel_request_state_id: null,
                cancel_request_expires_at: null,
                cancel_request_created_at: null,
            },
        ]);

        const res = await request(app.getHttpServer()).get(PATH).query({date: '2026-11-10'}).set(internalHeaders(MANAGER_ACTOR));

        expect(res.status).toBe(200);
        expect(repo.findManagerStore).toHaveBeenCalledTimes(1);
        expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
        expect(repo.findStoreRoomRows).toHaveBeenCalledWith(STORE_ID);
        expect(repo.findStoreReservationRows).toHaveBeenCalledWith(STORE_ID, new Date('2026-11-09T15:00:00Z'), new Date('2026-11-10T15:00:00Z'));
        expect(res.body.date).toBe('2026-11-10');
        expect(res.body.list[0].reservations).toEqual([
            {
                reservation_id: RESERVATION_ID,
                reservation_state_id: 'CONFIRMED',
                reservation_state_name: '예약 확정',
                room_plan_type_id: 'HOURLY',
                room_plan_type_name: '시간 이용',
                start_at: '2026-11-10T00:00:00.000Z',
                end_at: '2026-11-10T03:00:00.000Z',
                blocked_until: '2026-11-10T03:30:00.000Z',
                total_price: 30000,
                user_name: '김이용',
                user_phone: '01012345678',
                cancel_request_state_id: null,
                cancel_request_created_at: null,
            },
        ]);
        expect(res.body.list[1]).toMatchObject({room_id: ROOM_ID_2, room_state_id: 'AVAILABLE', reservations: []});
    });

    /**
     * [CASES:cancel-request] 상태 — 업체 현황의 마지막 이용 중 취소 요청(만료는 읽을 때 계산, 사용자 확정 2026-11-07). 요청 14:00 · 만료 14:10, 지금 14:05 기준.
     * [이름, 저장된 상태, 지금, 보이는 상태]
     */
    it.each([
        ['요청 중 · 지금 = 만료 − 1초 → 요청 중', 'REQUESTED', '2026-11-10T05:09:59Z', 'REQUESTED'],
        ['요청 중 · 지금 = 만료 정각 → 만료', 'REQUESTED', '2026-11-10T05:10:00Z', 'EXPIRED'],
        ['승인(저장) → 그대로', 'APPROVED', '2026-11-10T05:05:00Z', 'APPROVED'],
        ['거절(저장) → 그대로', 'REJECTED', '2026-11-10T05:05:00Z', 'REJECTED'],
        ['만료(저장) → 그대로', 'EXPIRED', '2026-11-10T05:05:00Z', 'EXPIRED'],
    ])('[CASES:cancel-request] %s', async (_label, cancel_request_state_id, now, expected) => {
        vi.setSystemTime(new Date(now));
        repo.findStoreRoomRows.mockResolvedValueOnce([
            {room_id: ROOM_ID, room_name: '101호', floor: 1, room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', room_state_id: 'IN_USE', room_state_name: '사용중'},
        ]);
        repo.findStoreReservationRows.mockResolvedValueOnce([
            storeReservationRow({
                reservation_state_id: 'CHECKED_IN',
                reservation_state_name: '이용 중',
                cancel_request_state_id,
                cancel_request_expires_at: new Date('2026-11-10T05:10:00Z'),
                cancel_request_created_at: new Date('2026-11-10T05:00:00Z'),
            }),
        ]);

        const res = await request(app.getHttpServer()).get(PATH).query({date: '2026-11-10'}).set(internalHeaders(MANAGER_ACTOR));

        expect(res.status).toBe(200);
        expect(res.body.list[0].reservations[0]).toMatchObject({cancel_request_state_id: expected, cancel_request_created_at: '2026-11-10T05:00:00.000Z'});
    });

    it('[FAIL:service] 소속 업체가 없으면(탈퇴 · 지운 업체 포함) 404, 호실 조회 없음', async () => {
        repo.findManagerStore.mockResolvedValueOnce(null);

        const res = await request(app.getHttpServer()).get(PATH).query({date: '2026-11-10'}).set(internalHeaders(MANAGER_ACTOR));

        expect(res.status).toBe(404);
        expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
        expect(repo.findStoreRoomRows).not.toHaveBeenCalled();
    });

    it('[FAIL:validation] 날짜 형식이 아니면 400 → date', async () => {
        const res = await request(app.getHttpServer()).get(PATH).query({date: '11/10'}).set(internalHeaders(MANAGER_ACTOR));

        expect(res.status).toBe(400);
        expect(res.body.validation_errors).toEqual([{property: 'date', message: '날짜를 YYYY-MM-DD 로 입력해주세요.'}]);
    });
});
