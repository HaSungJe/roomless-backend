import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    accountRow,
    bootHttpPath,
    createJwtServiceMock,
    createManagerRepositoryMock,
    FIXED_TIME,
    internalHeaders,
    ManagerRepositoryMock,
    STAFF_ID,
    STORE_CODE,
    STORE_ID,
} from './manager.test-helper.js';

const PATH = '/internal/v1/admin-service/manager/account';

/** 로그인 총관리자 (게이트웨이 관리자 가드를 통과한 actor) */
const ADMIN_ACTOR = {user_id: 'd'.repeat(32), auth_id: 'SUPER_ADMIN'};

describe('GET /internal/v1/admin-service/manager/account — 업체 관리자 목록 (총관리자 · 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: ManagerRepositoryMock;

    beforeEach(async () => {
        repo = createManagerRepositoryMock();
        app = await bootHttpPath(repo, createJwtServiceMock('a', 'r'));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('필터 없음 — 빈 필터(모두 null)로 count → 페이지(기본 20 · 0) → 목록, 항목에 업체(상호명 · 업체코드 · 상태)', async () => {
            repo.countAccounts.mockResolvedValueOnce(2);
            repo.findAccountRows.mockResolvedValueOnce([accountRow(), accountRow({user_id: 'f'.repeat(32), auth_id: 'HEAD_MANAGER', phone: null, is_password_change_required: '1'})]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders('10.0.0.1', ADMIN_ACTOR));

            expect(res.status).toBe(200);
            const filter = {user_id: null, keyword: null, store_id: null, auth_id: null, state_id: null};
            expect(repo.countAccounts).toHaveBeenCalledWith(filter);
            expect(repo.findAccountRows).toHaveBeenCalledWith(filter, 20, 0);
            expect(repo.countAccounts.mock.invocationCallOrder[0]).toBeLessThan(repo.findAccountRows.mock.invocationCallOrder[0]);
            expect(res.body.list[0]).toEqual({
                user_id: STAFF_ID,
                store_id: STORE_ID,
                store_name: '룸리스 강남점',
                store_code: STORE_CODE,
                store_state_id: 'ACTIVE',
                login_id: 'staff01',
                name: '김직원',
                phone: '01022223333',
                auth_id: 'MANAGER',
                state_id: 'ACTIVE',
                is_password_change_required: 0,
                created_at: FIXED_TIME.toISOString(),
            });
            expect(res.body.list[1]).toMatchObject({auth_id: 'HEAD_MANAGER', phone: null, is_password_change_required: 1});
            expect(res.body.pagination).toMatchObject({total_count: 2});
        });

        it('모든 필터 — 검색어 · 업체 · 권한 · 상태를 그대로 필터로, 페이지 2 · 10개면 limit 10 · offset 10', async () => {
            repo.countAccounts.mockResolvedValueOnce(15);

            const res = await request(app.getHttpServer())
                .get(PATH)
                .query({keyword: '강남', store_id: STORE_ID, auth_id: 'HEAD_MANAGER', state_id: 'BLOCK', page: 2, size: 10})
                .set(internalHeaders('10.0.0.1', ADMIN_ACTOR));

            expect(res.status).toBe(200);
            const filter = {user_id: null, keyword: '강남', store_id: STORE_ID, auth_id: 'HEAD_MANAGER', state_id: 'BLOCK'};
            expect(repo.countAccounts).toHaveBeenCalledWith(filter);
            expect(repo.findAccountRows).toHaveBeenCalledWith(filter, 10, 10);
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['권한이 허용값 밖', {auth_id: 'USER'}, 'auth_id', '권한이 올바르지 않습니다.'],
            ['상태가 허용값 밖(삭제 LEAVE)', {state_id: 'LEAVE'}, 'state_id', '상태가 올바르지 않습니다.'],
            ['업체 ID 가 32자 hex 아님', {store_id: 'xyz'}, 'store_id', '업체 ID가 올바르지 않습니다.'],
            ['검색어 101자', {keyword: 'a'.repeat(101)}, 'keyword', '검색어는 100자 이내로 입력해주세요.'],
        ])('%s → 400 validation_errors.%s, 조회 없음', async (_label, query, property, message) => {
            const res = await request(app.getHttpServer()).get(PATH).query(query).set(internalHeaders('10.0.0.1', ADMIN_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property, message}]);
            expect(repo.countAccounts).not.toHaveBeenCalled();
        });
    });
});
