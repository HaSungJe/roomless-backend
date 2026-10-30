import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
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

const PATH = `/internal/v1/admin-service/room/group/${ROOM_GROUP_ID}/image/upload-url`;

/**
 * 그룹 사진 n장 (순서 0 ~ n-1)
 *
 * @param count 장 수
 * @returns 사진 행
 */
function images(count: number): Record<string, unknown>[] {
    return Array.from({length: count}, (_, index) => imageRow({room_group_image_id: String(index).repeat(32), sort_order: index}));
}

describe('POST /internal/v1/admin-service/room/group/:room_group_id/image/upload-url — 그룹 사진 업로드 주소 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImages.mockResolvedValue(images(4));
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그룹 사진 한도(5장) 안이면 store/<업체>/room-group/<그룹>/<uuid>.<ext> 공개 키로 업로드 주소를 준다', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/png'});

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(storage.createUploadUrl).toHaveBeenCalledTimes(1);
            const {key, content_type} = storage.createUploadUrl.mock.calls[0][0] as {key: string; content_type: string};
            expect(key).toMatch(new RegExp(`^store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/[a-f0-9]{32}\\.png$`));
            expect(content_type).toBe('image/png');
            expect(res.body).toEqual({file_key: key, upload_url: 'https://s3.test/upload', expires_at: new Date(2026, 0, 1, 0, 10).toISOString()});
        });

        it('JPG 는 .jpg 키 — 업로드마다 새 키', async () => {
            await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});
            await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            const [first, second] = storage.createUploadUrl.mock.calls.map(([input]) => (input as {key: string}).key);
            expect(first).toMatch(/\.jpg$/);
            expect(second).toMatch(/\.jpg$/);
            expect(first).not.toBe(second);
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹 사진이 5장이면 400, 업로드 주소 없음', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce(images(5));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '올릴 수 있는 사진 수를 넘었습니다.', validation_errors: null});
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체 · 지운 그룹) 404, 사진 조회 · 업로드 주소 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 404, 그룹 조회 · 업로드 주소 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('JPG · PNG 가 아니면 400 validation_errors.content_type, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/gif'});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: 'JPG · PNG 사진만 올릴 수 있습니다.', validation_errors: [{property: 'content_type', message: 'JPG · PNG 사진만 올릴 수 있습니다.'}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });

        it('그룹 ID 경로가 32자 hex 가 아니면 400 validation_errors.room_group_id', async () => {
            const res = await request(app.getHttpServer()).post('/internal/v1/admin-service/room/group/xyz/image/upload-url').set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toContainEqual({property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).post(PATH).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(403);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
