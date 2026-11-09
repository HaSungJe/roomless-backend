import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {Not} from 'typeorm';
import {bootHttpPath, createUserRepositoryMock, internalHeaders, USER_ID, userRow, UserRepositoryMock} from './user.test-helper.js';

const PATH = `/internal/v1/admin-service/user/${USER_ID}/reservation`;

/** 예약 이력 raw 행 — 금액은 문자열이 올 수 있다 */
const ROW = {
    reservation_id: 'r'.repeat(32),
    store_id: 'b'.repeat(32),
    store_name: '룸리스 강남점',
    room_name: '101호',
    room_group_name: '스탠다드',
    room_plan_type_id: 'HOURLY',
    room_plan_type_name: '시간 이용',
    reservation_state_id: 'CANCELED',
    reservation_state_name: '취소',
    start_at: new Date('2026-11-10T04:00:00Z'),
    end_at: new Date('2026-11-10T07:00:00Z'),
    total_price: '30000',
    canceled_at: new Date('2026-11-09T01:00:00Z'),
    cancel_actor: 'USER',
    created_at: new Date('2026-11-08T01:00:00Z'),
};

describe('GET /internal/v1/admin-service/user/:user_id/reservation — 이용자 예약 이력 (동기 경로)', () => {
    let app: INestApplication;
    let repo: UserRepositoryMock;

    beforeEach(async () => {
        repo = createUserRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('이용자 확인 → 결제 대기 만료 제외 count → 페이지 → 목록(이용 시작 최신순), 시각 ISO · 금액 숫자', async () => {
            repo.findUser.mockResolvedValueOnce(userRow());
            repo.countUserReservations.mockResolvedValueOnce(1);
            repo.findUserReservationRows.mockResolvedValueOnce([ROW]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(repo.findUser).toHaveBeenCalledWith({user_id: USER_ID, login_scope: 'USER'});
            expect(repo.countUserReservations).toHaveBeenCalledWith({user_id: USER_ID, reservation_state_id: Not('EXPIRED')});
            expect(repo.findUserReservationRows).toHaveBeenCalledWith(USER_ID, 20, 0);
            expect(res.body.list).toEqual([
                {
                    reservation_id: 'r'.repeat(32),
                    store_id: 'b'.repeat(32),
                    store_name: '룸리스 강남점',
                    room_name: '101호',
                    room_group_name: '스탠다드',
                    room_plan_type_id: 'HOURLY',
                    room_plan_type_name: '시간 이용',
                    reservation_state_id: 'CANCELED',
                    reservation_state_name: '취소',
                    start_at: '2026-11-10T04:00:00.000Z',
                    end_at: '2026-11-10T07:00:00.000Z',
                    total_price: 30000,
                    canceled_at: '2026-11-09T01:00:00.000Z',
                    cancel_actor: 'USER',
                    created_at: '2026-11-08T01:00:00.000Z',
                },
            ]);
            expect(res.body.pagination).toMatchObject({total_count: 1});
        });

        it('취소가 아니면 취소 시각 · 주체 null, 페이지 2 · 10개면 limit 10 · offset 10', async () => {
            repo.findUser.mockResolvedValueOnce(userRow());
            repo.countUserReservations.mockResolvedValueOnce(15);
            repo.findUserReservationRows.mockResolvedValueOnce([{...ROW, reservation_state_id: 'COMPLETED', canceled_at: null, cancel_actor: null}]);

            const res = await request(app.getHttpServer()).get(PATH).query({page: 2, size: 10}).set(internalHeaders());

            expect(repo.findUserReservationRows).toHaveBeenCalledWith(USER_ID, 10, 10);
            expect(res.body.list[0]).toMatchObject({canceled_at: null, cancel_actor: null});
        });
    });

    describe('[FAIL:service]', () => {
        it('이용자 그룹 회원이 아니면 404, 예약 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '이용자를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.countUserReservations).not.toHaveBeenCalled();
            expect(repo.findUserReservationRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('회원 ID 가 32자 hex 가 아니면 400 validation_errors.user_id', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/admin-service/user/xyz/reservation').set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property: 'user_id', message: '회원 ID가 올바르지 않습니다.'}]);
            expect(repo.findUser).not.toHaveBeenCalled();
        });
    });
});
