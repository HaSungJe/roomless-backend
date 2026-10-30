import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createRoomRepositoryMock, internalHeaders, MANAGER_ACTOR, planRow, RoomRepositoryMock, STORE_ID, storeRow} from './room.test-helper.js';

const PATH = '/internal/v1/admin-service/room/plan';

describe('GET /internal/v1/admin-service/room/plan — 업체 상품 설정 조회 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomPlanRows.mockResolvedValue([
            planRow({room_plan_id: '3'.repeat(32), room_plan_type_id: 'LONG', room_plan_type_name: '연박', is_used: 0, days_of_week: 65, check_in_time: '16:00:00', check_out_time: '12:00:00'}),
            planRow({room_plan_id: '1'.repeat(32), room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', usage_hours: 3, check_in_time: null, check_out_time: null}),
            planRow(),
        ]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('잠그지 않고 내 업체를 찾아 종류 3행을 HOURLY · NIGHT · LONG 순으로 돌려준다 — 시각은 HH:mm, 종류에 없는 값은 null', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledTimes(1);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findRoomPlanRows).toHaveBeenCalledTimes(1);
            expect(repo.findRoomPlanRows).toHaveBeenCalledWith(STORE_ID);
            expect(res.body).toEqual({
                list: [
                    {room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', is_used: 1, days_of_week: 127, usage_hours: 3, check_in_time: null, check_out_time: null},
                    {room_plan_type_id: 'NIGHT', room_plan_type_name: '1박', is_used: 1, days_of_week: 127, usage_hours: null, check_in_time: '15:00', check_out_time: '11:00'},
                    {room_plan_type_id: 'LONG', room_plan_type_name: '연박', is_used: 0, days_of_week: 65, usage_hours: null, check_in_time: '16:00', check_out_time: '12:00'},
                ],
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면(탈퇴 · 지운 업체 포함) 404, 상품 설정 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomPlanRows).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH);

            expect(res.status).toBe(403);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
