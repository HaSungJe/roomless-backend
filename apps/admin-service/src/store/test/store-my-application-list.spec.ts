import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In} from 'typeorm';
import {applicationRow, bootHttpPath, createStoreRepositoryMock, FIXED_TIME, internalHeaders, StoreRepositoryMock, TEST_INTERNAL_TOKEN, USER_ACTOR} from './store.test-helper.js';

const PATH = '/internal/v1/admin-service/store/application/mine';
const WHERE = {user_id: USER_ACTOR.user_id, store_application_state_id: In(['WAIT', 'REJECTED'])};

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
        it('쿼리가 없으면 PaginationDto 기본값(1쪽 · 20개)으로 대기 · 반려 신청만 센 뒤 목록을 돌려준다', async () => {
            repo.countApplications.mockResolvedValueOnce(1);
            repo.findApplicationList.mockResolvedValueOnce([applicationRow({store_application_state_id: 'REJECTED', reject_comment: '서류 불충분', reviewed_at: FIXED_TIME})]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.countApplications).toHaveBeenCalledWith(WHERE);
            expect(repo.findApplicationList).toHaveBeenCalledWith(WHERE, 20, 0);
            expect(res.body.list).toEqual([
                {
                    store_application_id: 'a'.repeat(32),
                    store_application_state_id: 'REJECTED',
                    store_name: '룸리스 강남점',
                    business_number: '1234567890',
                    reject_comment: '서류 불충분',
                    reviewed_at: FIXED_TIME.toISOString(),
                    created_at: FIXED_TIME.toISOString(),
                },
            ]);
            expect(res.body.pagination).toMatchObject({total_count: 1, page: 1, max_page: 1});
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
        it('내부 토큰이 없으면 401, 조회 없음', async () => {
            const res = await request(app.getHttpServer())
                .get(PATH)
                .set({'x-internal-token': `${TEST_INTERNAL_TOKEN}-wrong`});

            expect(res.status).toBe(401);
            expect(repo.countApplications).not.toHaveBeenCalled();
        });
    });
});
