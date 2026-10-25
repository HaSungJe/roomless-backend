import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {ILike} from 'typeorm';
import {ADMIN_ACTOR, applicationRow, bootHttpPath, createStoreRepositoryMock, FIXED_TIME, internalHeaders, StoreRepositoryMock, USER_ACTOR} from './store.test-helper.js';

const PATH = '/internal/v1/admin-service/store/application';

describe('GET /internal/v1/admin-service/store/application — 입점 신청 목록 (총관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: StoreRepositoryMock;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.countApplications.mockResolvedValue(1);
        repo.findApplicationList.mockResolvedValue([applicationRow({store_application_state_id: 'APPROVED', store_id: 'b'.repeat(32), reviewed_at: FIXED_TIME})]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('조건이 없으면 전체(승인 포함)를 세고 기본 페이지로 목록을 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.countApplications).toHaveBeenCalledWith([{}]);
            expect(repo.findApplicationList).toHaveBeenCalledWith([{}], 20, 0);
            expect(res.body).toEqual({
                list: [
                    {
                        store_application_id: 'a'.repeat(32),
                        user_id: USER_ACTOR.user_id,
                        store_application_state_id: 'APPROVED',
                        store_name: '룸리스 강남점',
                        business_number: '1234567890',
                        owner_name: '홍길동',
                        store_id: 'b'.repeat(32),
                        reviewed_at: FIXED_TIME.toISOString(),
                        created_at: FIXED_TIME.toISOString(),
                    },
                ],
                pagination: expect.objectContaining({total_count: 1, page: 1}),
            });
        });

        it('상태 + 검색어는 상호명 · 사업자번호 OR 로 거르고 같은 WHERE 로 센다', async () => {
            const res = await request(app.getHttpServer())
                .get(`${PATH}?store_application_state_id=WAIT&keyword=${encodeURIComponent('룸')}&page=2&size=10`)
                .set(internalHeaders(ADMIN_ACTOR));

            const where = [
                {store_application_state_id: 'WAIT', store_name: ILike('%룸%')},
                {store_application_state_id: 'WAIT', business_number: ILike('%룸%')},
            ];
            expect(res.status).toBe(200);
            expect(repo.countApplications).toHaveBeenCalledWith(where);
            expect(repo.findApplicationList).toHaveBeenCalledWith(where, 10, 10);
        });

        it('검색어의 % · _ 는 글자 그대로 찾도록 이스케이프한다', async () => {
            await request(app.getHttpServer())
                .get(`${PATH}?keyword=${encodeURIComponent('1_0%')}`)
                .set(internalHeaders(ADMIN_ACTOR));

            expect(repo.countApplications).toHaveBeenCalledWith([{store_name: ILike('%1\\_0\\%%')}, {business_number: ILike('%1\\_0\\%%')}]);
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['store_application_state_id=CANCELED', 'store_application_state_id', '신청 상태가 올바르지 않습니다.'],
            [`keyword=${'가'.repeat(101)}`, 'keyword', '검색어는 100자 이내로 입력해주세요.'],
        ])('%s → 400 validation_errors.%s', async (query, property, message) => {
            const res = await request(app.getHttpServer())
                .get(`${PATH}?${encodeURI(query)}`)
                .set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toContainEqual({property, message});
            expect(repo.countApplications).not.toHaveBeenCalled();
        });
    });
});
