import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    FIXED_TIME,
    groupPlanRow,
    IMAGE_KEY,
    imageRow,
    internalHeaders,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
} from './room.test-helper.js';

const PATH = `/internal/v1/admin-service/room/group/${ROOM_GROUP_ID}`;
const IMAGE_A = 'a'.repeat(32);
const IMAGE_B = '1'.repeat(32);
const KEY_B = `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.png`;

describe('GET /internal/v1/admin-service/room/group/:room_group_id — 객실 그룹 상세 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity({description: '창가 객실', room_group_detail: {room_count: 2, has_shower: 1, has_tv: 0, has_pc: 1}}));
        repo.findRoomGroupImages.mockResolvedValue([
            imageRow({room_group_image_id: IMAGE_A}),
            imageRow({room_group_image_id: IMAGE_B, file_key: KEY_B, file_name: '욕실.png', content_type: 'image/png', sort_order: 1}),
        ]);
        repo.findRoomGroupPlanRows.mockResolvedValue([
            groupPlanRow({room_group_plan_id: '6'.repeat(32), room_plan_type_id: 'LONG', room_plan_type_name: '연박'}),
            groupPlanRow({room_group_plan_id: '4'.repeat(32), room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', is_used: 1, price: 25000}),
            groupPlanRow({is_used: 1, price: 89000}),
        ]);
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체의 그룹 · 사진(순서대로 CDN 주소) · 그룹 상품 3개(HOURLY · NIGHT · LONG 순)를 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledTimes(1);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(repo.findRoomGroupPlanRows).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(storage.getPublicUrl).toHaveBeenCalledTimes(2);
            expect(storage.getPublicUrl).toHaveBeenNthCalledWith(1, IMAGE_KEY);
            expect(storage.getPublicUrl).toHaveBeenNthCalledWith(2, KEY_B);
            expect(storage.createDownloadUrl).not.toHaveBeenCalled();
            expect(res.body).toEqual({
                room_group_id: ROOM_GROUP_ID,
                room_group_name: '스탠다드',
                description: '창가 객실',
                room_group_detail: {room_count: 2, has_shower: 1, has_tv: 0, has_pc: 1},
                images: [
                    {room_group_image_id: IMAGE_A, file_name: '객실.jpg', content_type: 'image/jpeg', sort_order: 0, image_url: `https://cdn.test/${IMAGE_KEY}`},
                    {room_group_image_id: IMAGE_B, file_name: '욕실.png', content_type: 'image/png', sort_order: 1, image_url: `https://cdn.test/${KEY_B}`},
                ],
                plans: [
                    {room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', is_used: 1, price: 25000},
                    {room_plan_type_id: 'NIGHT', room_plan_type_name: '1박', is_used: 1, price: 89000},
                    {room_plan_type_id: 'LONG', room_plan_type_name: '연박', is_used: 0, price: 0},
                ],
                created_at: FIXED_TIME.toISOString(),
                updated_at: FIXED_TIME.toISOString(),
            });
        });

        it('사진이 없으면 images [] · 열람 주소 없음', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce([]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body.images).toEqual([]);
            expect(storage.getPublicUrl).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹이 없으면(다른 업체 · 지운 그룹) 404, 사진 · 그룹 상품 조회 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
            expect(repo.findRoomGroupPlanRows).not.toHaveBeenCalled();
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
        it('그룹 ID 가 32자 hex 가 아니면 400 validation_errors.room_group_id, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/admin-service/room/group/xyz').set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '객실 그룹 ID가 올바르지 않습니다.', validation_errors: [{property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'}]});
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
