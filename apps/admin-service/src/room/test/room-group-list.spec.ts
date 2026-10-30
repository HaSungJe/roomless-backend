import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {ILike} from 'typeorm';
import {
    bootHttpPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    FIXED_TIME,
    IMAGE_KEY,
    internalHeaders,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupRow,
    RoomRepositoryMock,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
} from './room.test-helper.js';

const PATH = '/internal/v1/admin-service/room/group';
const OTHER_GROUP_ID = 'a'.repeat(32);

describe('GET /internal/v1/admin-service/room/group — 객실 그룹 목록 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.countRoomGroups.mockResolvedValue(2);
        repo.findRoomGroupRows.mockResolvedValue([roomGroupRow(), roomGroupRow({room_group_id: OTHER_GROUP_ID, room_group_name: '디럭스', room_count: 0, cover_file_key: null})]);
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('검색어가 없으면 내 업체 그룹만 같은 WHERE 로 세고 기본 페이지로 목록 — 대표 사진은 CDN 주소, 사진이 없으면 null', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.countRoomGroups).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.findRoomGroupRows).toHaveBeenCalledWith({store_id: STORE_ID}, 20, 0);
            expect(repo.countRoomGroups.mock.invocationCallOrder[0]).toBeLessThan(repo.findRoomGroupRows.mock.invocationCallOrder[0]);
            expect(storage.getPublicUrl).toHaveBeenCalledTimes(1);
            expect(storage.getPublicUrl).toHaveBeenCalledWith(IMAGE_KEY);
            expect(res.body.list).toEqual([
                {room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', room_count: 3, image_url: `https://cdn.test/${IMAGE_KEY}`, created_at: FIXED_TIME.toISOString()},
                {room_group_id: OTHER_GROUP_ID, room_group_name: '디럭스', room_count: 0, image_url: null, created_at: FIXED_TIME.toISOString()},
            ]);
            expect(res.body.pagination).toMatchObject({total_count: 2, page: 1, max_page: 1});
        });

        it('검색어는 그룹명 부분 일치(% · _ 이스케이프) — 같은 WHERE 로 세고 요청 페이지로 목록', async () => {
            repo.countRoomGroups.mockResolvedValueOnce(30);

            const res = await request(app.getHttpServer()).get(`${PATH}?keyword=a_b&page=2&size=10`).set(internalHeaders(MANAGER_ACTOR));

            const where = {store_id: STORE_ID, room_group_name: ILike('%a\\_b%')};
            expect(res.status).toBe(200);
            expect(repo.countRoomGroups).toHaveBeenCalledWith(where);
            expect(repo.findRoomGroupRows).toHaveBeenCalledWith(where, 10, 10);
            expect(res.body.pagination).toMatchObject({total_count: 30, page: 2, max_page: 3});
        });
    });

    describe('[FAIL:validation]', () => {
        it('검색어 101자면 400 validation_errors.keyword, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer())
                .get(`${PATH}?keyword=${'a'.repeat(101)}`)
                .set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '검색어는 100자 이내로 입력해주세요.', validation_errors: [{property: 'keyword', message: '검색어는 100자 이내로 입력해주세요.'}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 404, 개수 · 목록 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.countRoomGroups).not.toHaveBeenCalled();
            expect(repo.findRoomGroupRows).not.toHaveBeenCalled();
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
