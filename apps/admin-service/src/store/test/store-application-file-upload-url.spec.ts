import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    APPLICATION_ID,
    applicationRow,
    bootHttpPath,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    internalHeaders,
    StorageGatewayMock,
    StoreRepositoryMock,
    USER_ACTOR,
} from './store.test-helper.js';

const PATH = `/internal/v1/admin-service/store/application/mine/${APPLICATION_ID}/file/upload-url`;

describe('POST /internal/v1/admin-service/store/application/mine/:store_application_id/file/upload-url — 업체 정보 파일 업로드 주소 (동기 경로)', () => {
    let app: INestApplication;
    let repo: StoreRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        storage = createStorageGatewayMock();
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('비공개 용도(사업자등록증)는 private/ 키로 업로드 주소를 발급한다', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow());
            repo.findStoreFilePurpose.mockResolvedValueOnce({store_file_purpose_id: 'BUSINESS_LICENSE', is_private: 1});
            repo.countStoreFiles.mockResolvedValueOnce(0);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(USER_ACTOR)).send({store_file_purpose_id: 'BUSINESS_LICENSE', content_type: 'image/jpeg'});

            expect(res.status).toBe(200);
            expect(repo.findStoreFilePurpose).toHaveBeenCalledWith('BUSINESS_LICENSE');
            expect(repo.countStoreFiles).toHaveBeenCalledWith({store_application_id: APPLICATION_ID, store_file_purpose_id: 'BUSINESS_LICENSE'});
            const {key, content_type} = storage.createUploadUrl.mock.calls[0][0];
            expect(key).toMatch(new RegExp(`^private/store-application/${APPLICATION_ID}/[a-f0-9]{32}\\.jpg$`));
            expect(content_type).toBe('image/jpeg');
            expect(res.body).toEqual({file_key: key, upload_url: 'https://s3.test/upload', expires_at: new Date(2026, 0, 1, 0, 10).toISOString()});
        });

        it('공개 용도(업체 사진)는 store/ 키 — 접두는 용도 룩업의 is_private 로 정한다', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow());
            repo.findStoreFilePurpose.mockResolvedValueOnce({store_file_purpose_id: 'STORE_IMAGE', is_private: 0});
            repo.countStoreFiles.mockResolvedValueOnce(4);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(USER_ACTOR)).send({store_file_purpose_id: 'STORE_IMAGE', content_type: 'image/png'});

            expect(res.status).toBe(200);
            expect(storage.createUploadUrl.mock.calls[0][0].key).toMatch(new RegExp(`^store/application/${APPLICATION_ID}/[a-f0-9]{32}\\.png$`));
        });
    });

    describe('[FAIL:service]', () => {
        it('반려 신청은 400, 용도 조회 · 주소 발급 없음', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow({store_application_state_id: 'REJECTED'}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(USER_ACTOR)).send({store_file_purpose_id: 'BUSINESS_LICENSE', content_type: 'image/jpeg'});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '대기 중인 입점 신청만 처리할 수 있습니다.', validation_errors: null});
            expect(repo.findStoreFilePurpose).not.toHaveBeenCalled();
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });

        it('남의 신청 · 승인 신청은 404', async () => {
            repo.findApplication.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(USER_ACTOR)).send({store_file_purpose_id: 'BUSINESS_LICENSE', content_type: 'image/jpeg'});

            expect(res.status).toBe(404);
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });

        it('용도 룩업이 없으면 400', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow());
            repo.findStoreFilePurpose.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(USER_ACTOR)).send({store_file_purpose_id: 'BUSINESS_LICENSE', content_type: 'image/jpeg'});

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('파일 용도가 올바르지 않습니다.');
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });

        it.each([
            ['BUSINESS_LICENSE', 1, 1],
            ['STORE_IMAGE', 0, 5],
        ])('%s 가 한도(%#)에 닿으면 400', async (purpose, is_private, count) => {
            repo.findApplication.mockResolvedValueOnce(applicationRow());
            repo.findStoreFilePurpose.mockResolvedValueOnce({store_file_purpose_id: purpose, is_private});
            repo.countStoreFiles.mockResolvedValueOnce(count);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(USER_ACTOR)).send({store_file_purpose_id: purpose, content_type: 'image/jpeg'});

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('올릴 수 있는 파일 수를 넘었습니다.');
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            [{store_file_purpose_id: 'BUSINESS_LICENSE', content_type: 'image/gif'}, 'content_type', 'JPG · PNG 사진만 올릴 수 있습니다.'],
            [{store_file_purpose_id: 'X', content_type: 'image/jpeg'}, 'store_file_purpose_id', '파일 용도가 올바르지 않습니다.'],
        ])('%o → 400 validation_errors.%s', async (body, property, message) => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(USER_ACTOR)).send(body);

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toContainEqual({property, message});
            expect(repo.findApplication).not.toHaveBeenCalled();
        });
    });
});
