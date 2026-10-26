import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {ILike} from 'typeorm';
import {ADMIN_ACTOR, bootHttpPath, createStoreRepositoryMock, FIXED_TIME, internalHeaders, STORE_CODE, STORE_ID, StoreRepositoryMock, storeRow} from './store.test-helper.js';

const PATH = '/internal/v1/admin-service/store';

describe('GET /internal/v1/admin-service/store — 업체 목록 (총관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: StoreRepositoryMock;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.countStores.mockResolvedValue(1);
        repo.findStoreList.mockResolvedValue([storeRow()]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('조건이 없으면 전체를 세고 기본 페이지로 목록을 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.countStores).toHaveBeenCalledWith([{}]);
            expect(repo.findStoreList).toHaveBeenCalledWith([{}], 20, 0);
            expect(res.body.list).toEqual([
                {
                    store_id: STORE_ID,
                    store_code: STORE_CODE,
                    store_state_id: 'ACTIVE',
                    store_name: '룸리스 강남점',
                    business_number: '1234567890',
                    owner_name: '홍길동',
                    phone: '0212345678',
                    address: '서울시 강남구',
                    is_open: 0,
                    created_at: FIXED_TIME.toISOString(),
                },
            ]);
            expect(res.body.pagination).toMatchObject({total_count: 1, page: 1});
        });

        it('상태 + 검색어는 상호명 · 사업자번호 · 대표자명 OR 로 거른다', async () => {
            const res = await request(app.getHttpServer())
                .get(`${PATH}?store_state_id=SUSPEND&keyword=${encodeURIComponent('홍')}`)
                .set(internalHeaders(ADMIN_ACTOR));

            const where = [
                {store_state_id: 'SUSPEND', store_name: ILike('%홍%')},
                {store_state_id: 'SUSPEND', business_number: ILike('%홍%')},
                {store_state_id: 'SUSPEND', owner_name: ILike('%홍%')},
            ];
            expect(res.status).toBe(200);
            expect(repo.countStores).toHaveBeenCalledWith(where);
            expect(repo.findStoreList).toHaveBeenCalledWith(where, 20, 0);
        });
    });

    describe('[FAIL:validation]', () => {
        it('업체 상태가 목록에 없으면 400 validation_errors.store_state_id, 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(`${PATH}?store_state_id=CLOSED`).set(internalHeaders(ADMIN_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toContainEqual({property: 'store_state_id', message: '업체 상태가 올바르지 않습니다.'});
            expect(repo.countStores).not.toHaveBeenCalled();
        });
    });
});
