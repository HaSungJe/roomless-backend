import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In} from 'typeorm';
import {
    applicationRow,
    bootHttpPath,
    createStoreRepositoryMock,
    FIXED_TIME,
    internalHeaders,
    STORE_CODE,
    STORE_ID,
    StoreRepositoryMock,
    storeRow,
    TEST_INTERNAL_TOKEN,
    USER_ACTOR,
} from './store.test-helper.js';

const PATH = '/internal/v1/admin-service/store/application/mine';
const WHERE = {user_id: USER_ACTOR.user_id};

describe('GET /internal/v1/admin-service/store/application/mine — 내 입점 신청 목록 (동기 경로)', () => {
    let app: INestApplication;
    let repo: StoreRepositoryMock;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('쿼리가 없으면 PaginationDto 기본값(1쪽 · 20개)으로 모든 상태를 센 뒤 목록을 돌려준다 — 승인 신청만 업체코드', async () => {
            repo.countApplications.mockResolvedValueOnce(2);
            repo.findApplicationList.mockResolvedValueOnce([
                applicationRow({store_application_id: 'd'.repeat(32), store_application_state_id: 'APPROVED', store_id: STORE_ID, reviewed_at: FIXED_TIME}),
                applicationRow({store_application_state_id: 'REJECTED', reject_comment: '서류 불충분', reviewed_at: FIXED_TIME}),
            ]);
            repo.findStores.mockResolvedValueOnce([storeRow()]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.countApplications).toHaveBeenCalledWith(WHERE);
            expect(repo.findApplicationList).toHaveBeenCalledWith(WHERE, 20, 0);
            expect(repo.findStores).toHaveBeenCalledTimes(1);
            expect(repo.findStores).toHaveBeenCalledWith({store_id: In([STORE_ID])});
            expect(res.body.list).toEqual([
                {
                    store_application_id: 'd'.repeat(32),
                    store_application_state_id: 'APPROVED',
                    store_name: '룸리스 강남점',
                    business_number: '1234567890',
                    reject_comment: null,
                    reviewed_at: FIXED_TIME.toISOString(),
                    created_at: FIXED_TIME.toISOString(),
                    store_code: STORE_CODE,
                },
                {
                    store_application_id: 'a'.repeat(32),
                    store_application_state_id: 'REJECTED',
                    store_name: '룸리스 강남점',
                    business_number: '1234567890',
                    reject_comment: '서류 불충분',
                    reviewed_at: FIXED_TIME.toISOString(),
                    created_at: FIXED_TIME.toISOString(),
                    store_code: null,
                },
            ]);
            expect(res.body.pagination).toMatchObject({total_count: 2, page: 1, max_page: 1});
        });

        it('승인 신청이 없으면 업체를 조회하지 않는다', async () => {
            repo.countApplications.mockResolvedValueOnce(1);
            repo.findApplicationList.mockResolvedValueOnce([applicationRow()]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body.list[0].store_code).toBeNull();
            expect(repo.findStores).not.toHaveBeenCalled();
        });

        it('page=2&size=5 (문자열 쿼리) 는 Pagination 이 숫자로 읽어 limit 5 · offset 5', async () => {
            repo.countApplications.mockResolvedValueOnce(12);
            repo.findApplicationList.mockResolvedValueOnce([]);

            const res = await request(app.getHttpServer()).get(`${PATH}?page=2&size=5`).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findApplicationList).toHaveBeenCalledWith(WHERE, 5, 5);
            expect(res.body.pagination).toMatchObject({total_count: 12, page: 2, max_page: 3});
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 틀리면 403(전역 InternalAuthGuard), 조회 없음', async () => {
            const res = await request(app.getHttpServer())
                .get(PATH)
                .set({'x-internal-token': `${TEST_INTERNAL_TOKEN}-wrong`});

            expect(res.status).toBe(403);
            expect(repo.countApplications).not.toHaveBeenCalled();
        });
    });
});
