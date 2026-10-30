import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    createRoomRepositoryMock,
    groupPlanRow,
    internalHeaders,
    MANAGER_ACTOR,
    priceRow,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    ROOM_GROUP_PLAN_PRICE_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    STORE_ID,
    storeRow,
} from './room.test-helper.js';

const PATH = `/internal/v1/admin-service/room/group/${ROOM_GROUP_ID}/plan/NIGHT/price`;
const OTHER_PRICE_ID = 'a'.repeat(32);

describe('GET /internal/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price — 상품별 기간 가격 목록 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupPlan.mockResolvedValue(groupPlanRow());
        repo.countRoomGroupPlanPrices.mockResolvedValue(2);
        repo.findRoomGroupPlanPriceList.mockResolvedValue([
            priceRow(),
            priceRow({room_group_plan_price_id: OTHER_PRICE_ID, start_date: '2026-12-24', end_date: '2026-12-25', price: 150000, memo: null}),
        ]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹 × 종류의 그룹 상품으로 같은 WHERE 를 세고 기본 페이지로 시작 날짜 순 목록(YYYY-MM-DD)을 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: ROOM_GROUP_PLAN_ID});
            expect(repo.findRoomGroupPlanPriceList).toHaveBeenCalledWith({room_group_plan_id: ROOM_GROUP_PLAN_ID}, 20, 0);
            expect(res.body).toEqual({
                list: [
                    {room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID, start_date: '2026-07-01', end_date: '2026-08-31', price: 120000, memo: '여름 성수기'},
                    {room_group_plan_price_id: OTHER_PRICE_ID, start_date: '2026-12-24', end_date: '2026-12-25', price: 150000, memo: null},
                ],
                pagination: expect.objectContaining({total_count: 2, page: 1, max_page: 1}),
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹 상품 행이 없으면 404, 개수 · 목록 조회 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '상품 설정을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.findRoomGroupPlanPriceList).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체 · 지운 그룹) 404, 그룹 상품 · 개수 조회 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 404, 그룹 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('종류 경로가 HOURLY · NIGHT · LONG 이 아니면 400 validation_errors.room_plan_type_id, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(`/internal/v1/admin-service/room/group/${ROOM_GROUP_ID}/plan/WEEKLY/price`).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '상품 종류가 올바르지 않습니다.', validation_errors: [{property: 'room_plan_type_id', message: '상품 종류가 올바르지 않습니다.'}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
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
