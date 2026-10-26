import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createStorageGatewayMock, createStoreRepositoryMock, internalHeaders, MANAGER_ACTOR, STORE_ID, StorageGatewayMock, StoreRepositoryMock, storeRow} from './store.test-helper.js';

const PATH = '/internal/v1/admin-service/store/mine/file/upload-url';

describe('POST /internal/v1/admin-service/store/mine/file/upload-url — 내 업체 사진 업로드 주소 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: StoreRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        repo.findStoreFilePurpose.mockResolvedValue({store_file_purpose_id: 'STORE_IMAGE', is_private: 0});
        repo.countStoreFiles.mockResolvedValue(4);
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 사진 한도 안이면 store/<업체 ID>/ 공개 키로 업로드 주소를 준다', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/png'});

            expect(res.status).toBe(200);
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findStoreFilePurpose).toHaveBeenCalledWith('STORE_IMAGE');
            expect(repo.countStoreFiles).toHaveBeenCalledWith({store_id: STORE_ID, store_file_purpose_id: 'STORE_IMAGE'});
            expect(storage.createUploadUrl).toHaveBeenCalledTimes(1);
            const {key, content_type} = storage.createUploadUrl.mock.calls[0][0] as {key: string; content_type: string};
            expect(key).toMatch(new RegExp(`^store/${STORE_ID}/[a-f0-9]{32}\\.png$`));
            expect(content_type).toBe('image/png');
            expect(res.body).toEqual({file_key: key, upload_url: 'https://s3.test/upload', expires_at: new Date(2026, 0, 1, 0, 10).toISOString()});
        });
    });

    describe('[FAIL:service]', () => {
        it('업체 사진 5장이면 400, 업로드 주소 없음', async () => {
            repo.countStoreFiles.mockResolvedValueOnce(5);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '올릴 수 있는 파일 수를 넘었습니다.', validation_errors: null});
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 404, 업로드 주소 없음', async () => {
            repo.findStoreByManager.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(404);
            expect(res.body.message).toBe('소속 업체를 찾을 수 없습니다.');
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('JPG · PNG 가 아니면 400 validation_errors.content_type, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/gif'});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: 'JPG · PNG 사진만 올릴 수 있습니다.', validation_errors: [{property: 'content_type', message: 'JPG · PNG 사진만 올릴 수 있습니다.'}]});
            expect(repo.findStoreByManager).not.toHaveBeenCalled();
        });
    });
});
