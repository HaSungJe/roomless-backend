import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In} from 'typeorm';
import {
    APPLICATION_ID,
    applicationRow,
    bootHttpPath,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    FIXED_TIME,
    fileRow,
    internalHeaders,
    StorageGatewayMock,
    StoreRepositoryMock,
    USER_ACTOR,
} from './store.test-helper.js';

const PATH = `/internal/v1/admin-service/store/application/mine/${APPLICATION_ID}`;
const LICENSE_KEY = `private/store-application/${APPLICATION_ID}/${'1'.repeat(32)}.jpg`;
const IMAGE_KEY = `store/application/${APPLICATION_ID}/${'2'.repeat(32)}.png`;

describe('GET /internal/v1/admin-service/store/application/mine/:store_application_id — 내 입점 신청 상세 (동기 경로)', () => {
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
        it('내 대기 · 반려 신청을 찾고, 파일 열람 주소는 용도의 is_private 로 고른다(1 서명 · 0 CDN)', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow());
            repo.findApplicationFileRows.mockResolvedValueOnce([
                fileRow({file_key: LICENSE_KEY, is_private: 1}),
                fileRow({store_file_id: 'e'.repeat(32), store_file_purpose_id: 'STORE_IMAGE', file_key: IMAGE_KEY, file_name: '정면.png', content_type: 'image/png', is_private: 0}),
            ]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findApplication).toHaveBeenCalledWith({store_application_id: APPLICATION_ID, user_id: USER_ACTOR.user_id, store_application_state_id: In(['WAIT', 'REJECTED'])});
            expect(repo.findApplicationFileRows).toHaveBeenCalledWith(APPLICATION_ID);
            expect(storage.createDownloadUrl).toHaveBeenCalledTimes(1);
            expect(storage.createDownloadUrl).toHaveBeenCalledWith(LICENSE_KEY);
            expect(storage.getPublicUrl).toHaveBeenCalledTimes(1);
            expect(storage.getPublicUrl).toHaveBeenCalledWith(IMAGE_KEY);
            expect(res.body).toMatchObject({store_application_id: APPLICATION_ID, owner_name: '홍길동', owner_phone: '01012345678', address_detail: null, reject_comment: null, reviewed_at: null});
            expect(res.body.files).toEqual([
                {
                    store_file_id: 'f'.repeat(32),
                    store_file_purpose_id: 'BUSINESS_LICENSE',
                    file_name: '사업자등록증.jpg',
                    content_type: 'image/jpeg',
                    is_private: 1,
                    file_url: `https://s3.test/signed/${LICENSE_KEY}`,
                    created_at: FIXED_TIME.toISOString(),
                },
                {
                    store_file_id: 'e'.repeat(32),
                    store_file_purpose_id: 'STORE_IMAGE',
                    file_name: '정면.png',
                    content_type: 'image/png',
                    is_private: 0,
                    file_url: `https://cdn.test/${IMAGE_KEY}`,
                    created_at: FIXED_TIME.toISOString(),
                },
            ]);
        });
    });

    describe('[FAIL:service]', () => {
        it('남의 신청 · 승인된 신청(조건에 걸리지 않음)은 404, 파일 조회 없음', async () => {
            repo.findApplication.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '입점 신청을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findApplicationFileRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('신청 ID 가 32자 hex 가 아니면 400 validation_errors.store_application_id', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/admin-service/store/application/mine/abc').set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body.validation_errors.map((e: {property: string}) => e.property)).toEqual(['store_application_id']);
            expect(repo.findApplication).not.toHaveBeenCalled();
        });
    });
});
