import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    ADMIN_ACTOR,
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

const PATH = `/internal/v1/admin-service/store/application/${APPLICATION_ID}`;
const LICENSE_KEY = `private/store-application/${APPLICATION_ID}/${'1'.repeat(32)}.jpg`;

describe('GET /internal/v1/admin-service/store/application/:store_application_id — 입점 신청 상세 (총관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: StoreRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findApplicationFileRows.mockResolvedValue([fileRow({file_key: LICENSE_KEY})]);
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('신청 · 신청자 · 파일(비공개는 서명 주소)을 모아 돌려준다 — 상태와 무관하게 조회', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow({store_application_state_id: 'APPROVED', store_id: 'b'.repeat(32)}));
            repo.findApplicant.mockResolvedValueOnce({user_id: USER_ACTOR.user_id, name: '김이용', nickname: '이용자', phone: '01099998888'});

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findApplication).toHaveBeenCalledWith({store_application_id: APPLICATION_ID});
            expect(repo.findApplicant).toHaveBeenCalledWith(USER_ACTOR.user_id);
            expect(storage.createDownloadUrl).toHaveBeenCalledWith(LICENSE_KEY);
            expect(storage.getPublicUrl).not.toHaveBeenCalled();
            expect(res.body).toMatchObject({
                store_application_id: APPLICATION_ID,
                user_id: USER_ACTOR.user_id,
                store_application_state_id: 'APPROVED',
                store_id: 'b'.repeat(32),
                owner_phone: '01012345678',
                application_comment: null,
                created_at: FIXED_TIME.toISOString(),
                applicant: {user_id: USER_ACTOR.user_id, name: '김이용', nickname: '이용자', phone: '01099998888'},
            });
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
            ]);
        });

        it('신청자 계정이 없으면 applicant 는 null (필드 생략 없음)', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow());
            repo.findApplicant.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body.applicant).toBeNull();
        });
    });

    describe('[FAIL:service]', () => {
        it('신청이 없으면 404, 신청자 · 파일 조회 없음', async () => {
            repo.findApplication.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '입점 신청을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findApplicant).not.toHaveBeenCalled();
            expect(repo.findApplicationFileRows).not.toHaveBeenCalled();
        });
    });
});
