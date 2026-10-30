import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    ADMIN_ACTOR,
    APPLICATION_ID,
    bootHttpPath,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    FIXED_TIME,
    fileRow,
    internalHeaders,
    STORE_CODE,
    STORE_ID,
    StorageGatewayMock,
    StoreRepositoryMock,
    storeRow,
} from './store.test-helper.js';

const PATH = `/internal/v1/admin-service/store/${STORE_ID}`;
const LICENSE_KEY = `private/store-application/${APPLICATION_ID}/${'1'.repeat(32)}.jpg`;
const IMAGE_KEY = `store/application/${APPLICATION_ID}/${'2'.repeat(32)}.png`;

describe('GET /internal/v1/admin-service/store/:store_id — 업체 상세 (총관리자, 동기 경로)', () => {
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
        it('업체 + 업체 정보 파일(사업자등록증 서명 주소 · 업체 사진 CDN 주소 · 정렬 순서)을 돌려준다', async () => {
            repo.findStore.mockResolvedValueOnce(storeRow());
            repo.findStoreFileRows.mockResolvedValueOnce([
                fileRow({file_key: LICENSE_KEY, store_id: STORE_ID}),
                fileRow({
                    store_file_id: 'e'.repeat(32),
                    store_file_purpose_id: 'STORE_IMAGE',
                    file_key: IMAGE_KEY,
                    file_name: '정면.png',
                    content_type: 'image/png',
                    is_private: 0,
                    sort_order: 2,
                    store_id: STORE_ID,
                }),
            ]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findStore).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.findStoreFileRows).toHaveBeenCalledWith(STORE_ID);
            expect(res.body).toMatchObject({
                store_id: STORE_ID,
                store_code: STORE_CODE,
                store_state_id: 'ACTIVE',
                introduction: null,
                is_always_open: 0,
                is_open: 0,
                maintenance_minutes: 0,
                booking_open_hours: 72,
                refund_deadline_hours: 1,
                suspend_comment: null,
                created_at: FIXED_TIME.toISOString(),
                updated_at: FIXED_TIME.toISOString(),
            });
            expect(res.body).not.toHaveProperty('store_detail');
            expect(res.body.files).toEqual([
                {
                    store_file_id: 'f'.repeat(32),
                    store_file_purpose_id: 'BUSINESS_LICENSE',
                    file_name: '사업자등록증.jpg',
                    content_type: 'image/jpeg',
                    is_private: 1,
                    file_url: `https://s3.test/signed/${LICENSE_KEY}`,
                    sort_order: 0,
                    created_at: FIXED_TIME.toISOString(),
                },
                {
                    store_file_id: 'e'.repeat(32),
                    store_file_purpose_id: 'STORE_IMAGE',
                    file_name: '정면.png',
                    content_type: 'image/png',
                    is_private: 0,
                    file_url: `https://cdn.test/${IMAGE_KEY}`,
                    sort_order: 2,
                    created_at: FIXED_TIME.toISOString(),
                },
            ]);
        });
    });

    describe('[FAIL:service]', () => {
        it('업체가 없으면 404, 파일 조회 없음', async () => {
            repo.findStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findStoreFileRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('업체 ID 가 32자 hex 가 아니면 400 validation_errors.store_id', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/admin-service/store/xyz').set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body.validation_errors.map((e: {property: string}) => e.property)).toEqual(['store_id']);
            expect(repo.findStore).not.toHaveBeenCalled();
        });
    });
});
