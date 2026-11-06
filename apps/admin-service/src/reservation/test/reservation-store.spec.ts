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
    ROOM_ID,
    ROOM_ID_2,
    STORE_ID,
} from './reservation.test-helper.js';

const PATH = '/internal/v1/admin-service/reservation/store';

describe('GET /internal/v1/admin-service/reservation/store — 내 업체 예약 현황 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        repo = createReservationRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
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
            },
        ]);
        expect(res.body.list[1]).toMatchObject({room_id: ROOM_ID_2, room_state_id: 'AVAILABLE', reservations: []});
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
