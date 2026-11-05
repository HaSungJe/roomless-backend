import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In, MoreThanOrEqual} from 'typeorm';
import {
    bootHttpPath,
    createDiscoveryRepositoryMock,
    DiscoveryRepositoryMock,
    groupPlanEntity,
    internalHeaders,
    ROOM_GROUP_ID,
    ROOM_GROUP_ID_2,
    ROOM_GROUP_ID_3,
    roomGroupEntity,
    STORE_ID,
    storePlanRow,
} from './discovery.test-helper.js';

const PATH = `/internal/v1/user-service/discovery/store/${STORE_ID}/room-group`;

/** 스탠다드(ROOM_GROUP_ID) · 디럭스(ROOM_GROUP_ID_2) · 빈 그룹(ROOM_GROUP_ID_3 — 예약 받을 호실 없음) */
const STANDARD_HOURLY = groupPlanEntity('1'.repeat(32), ROOM_GROUP_ID, 'HOURLY', 1, 30000);
const STANDARD_NIGHT_FREE = groupPlanEntity('2'.repeat(32), ROOM_GROUP_ID, 'NIGHT', 1, 0);
const STANDARD_LONG = groupPlanEntity('3'.repeat(32), ROOM_GROUP_ID, 'LONG', 1, 90000);
const DELUXE_HOURLY_OFF = groupPlanEntity('4'.repeat(32), ROOM_GROUP_ID_2, 'HOURLY', 0, 40000);
const DELUXE_NIGHT = groupPlanEntity('5'.repeat(32), ROOM_GROUP_ID_2, 'NIGHT', 1, 70000);
const EMPTY_HOURLY = groupPlanEntity('9'.repeat(32), ROOM_GROUP_ID_3, 'HOURLY', 1, 20000);

describe('GET /internal/v1/user-service/discovery/store/:store_id/room-group — 업체의 객실 그룹 목록 (동기 경로, 로그인 없음)', () => {
    let app: INestApplication;
    let repo: DiscoveryRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-05T15:30:00Z'));
        repo = createDiscoveryRepositoryMock();
        repo.findStorePlanRows.mockResolvedValue([storePlanRow('HOURLY'), storePlanRow('NIGHT'), storePlanRow('LONG', {is_used: 0})]);
        repo.findRoomGroups.mockResolvedValue([roomGroupEntity(ROOM_GROUP_ID_2, '디럭스'), roomGroupEntity(ROOM_GROUP_ID_3, '빈 그룹'), roomGroupEntity(ROOM_GROUP_ID, '스탠다드')]);
        repo.countBookableRooms.mockResolvedValue([
            {room_group_id: ROOM_GROUP_ID, room_count: 3},
            {room_group_id: ROOM_GROUP_ID_2, room_count: 2},
        ]);
        repo.findRoomGroupPlans.mockResolvedValue([STANDARD_HOURLY, STANDARD_NIGHT_FREE, STANDARD_LONG, DELUXE_HOURLY_OFF, DELUXE_NIGHT, EMPTY_HOURLY]);
        repo.findRoomGroupPlanPrices.mockResolvedValue([{room_group_plan_id: STANDARD_HOURLY.room_group_plan_id, start_date: '2026-12-20', end_date: '2026-12-31', price: 45000, memo: '연말'}]);
        repo.findRoomGroupImages.mockResolvedValue([
            {room_group_id: ROOM_GROUP_ID, file_key: 'g/standard-1.jpg', sort_order: 0},
            {room_group_id: ROOM_GROUP_ID, file_key: 'g/standard-2.jpg', sort_order: 1},
        ]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그룹명 순 그대로, 호실 없는 그룹 제외, 판매 중인 상품만(미사용 · 요금 0 · 업체가 안 파는 종류 제외), 기간 가격 · 사진은 그 그룹에', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                list: [
                    {
                        room_group_id: ROOM_GROUP_ID_2,
                        room_group_name: '디럭스',
                        description: '디럭스 설명',
                        room_group_detail: {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 0},
                        room_count: 2,
                        images: [],
                        plans: [{room_plan_type_id: 'NIGHT', room_plan_type_name: '1박', price: 70000, period_prices: []}],
                    },
                    {
                        room_group_id: ROOM_GROUP_ID,
                        room_group_name: '스탠다드',
                        description: '스탠다드 설명',
                        room_group_detail: {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 0},
                        room_count: 3,
                        images: [
                            {image_url: 'https://cdn.test/g/standard-1.jpg', sort_order: 0},
                            {image_url: 'https://cdn.test/g/standard-2.jpg', sort_order: 1},
                        ],
                        plans: [
                            {
                                room_plan_type_id: 'HOURLY',
                                room_plan_type_name: '시간 이용',
                                price: 30000,
                                period_prices: [{start_date: '2026-12-20', end_date: '2026-12-31', price: 45000, memo: '연말'}],
                            },
                        ],
                    },
                ],
            });
        });

        it('조회 조건 — 활성 업체, 그룹 ID 들로 호실 수 · 그룹 상품 · 사진, 판매 중인 그룹 상품의 끝 날짜 ≥ 오늘(한국 11-06) 기간 가격', async () => {
            await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            const group_ids = [ROOM_GROUP_ID_2, ROOM_GROUP_ID_3, ROOM_GROUP_ID];
            expect(repo.findDiscoveryStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: 'ACTIVE'});
            expect(repo.findRoomGroups).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.countBookableRooms).toHaveBeenCalledWith(group_ids);
            expect(repo.findRoomGroupPlans).toHaveBeenCalledWith({room_group_id: In(group_ids)});
            expect(repo.findRoomGroupPlanPrices).toHaveBeenCalledWith({
                room_group_plan_id: In([STANDARD_HOURLY.room_group_plan_id, DELUXE_NIGHT.room_group_plan_id, EMPTY_HOURLY.room_group_plan_id]),
                end_date: MoreThanOrEqual('2026-11-06'),
            });
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith({room_group_id: In(group_ids)});
        });
    });

    describe('[SKIP]', () => {
        it('업체가 파는 상품 종류가 없으면 빈 목록 — 그룹 조회 없음', async () => {
            repo.findStorePlanRows.mockResolvedValueOnce([storePlanRow('HOURLY', {is_used: 0})]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.body).toEqual({list: []});
            expect(repo.findRoomGroups).not.toHaveBeenCalled();
        });

        it('그룹이 없으면 빈 목록 — 호실 수 조회 없음', async () => {
            repo.findRoomGroups.mockResolvedValueOnce([]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.body).toEqual({list: []});
            expect(repo.countBookableRooms).not.toHaveBeenCalled();
        });

        it('판매 중인 그룹 상품이 없으면 빈 목록 — 기간 가격 · 사진 조회 없음', async () => {
            repo.findRoomGroupPlans.mockResolvedValueOnce([DELUXE_HOURLY_OFF, STANDARD_NIGHT_FREE, STANDARD_LONG]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.body).toEqual({list: []});
            expect(repo.findRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('업체가 없거나 활성이 아니면 404, 상품 설정 조회 없음', async () => {
            repo.findDiscoveryStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findStorePlanRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('업체 ID 가 32자 hex 가 아니면 400 validation_errors.store_id, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/user-service/discovery/store/xyz/room-group').set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '업체 ID가 올바르지 않습니다.', validation_errors: [{property: 'store_id', message: '업체 ID가 올바르지 않습니다.'}]});
            expect(repo.findDiscoveryStore).not.toHaveBeenCalled();
        });
    });
});
