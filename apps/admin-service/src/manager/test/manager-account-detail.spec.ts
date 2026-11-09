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

const PATH = `/internal/v1/admin-service/manager/account/${STAFF_ID}`;

/** 로그인 총관리자 (게이트웨이 관리자 가드를 통과한 actor) */
const ADMIN_ACTOR = {user_id: 'd'.repeat(32), auth_id: 'ADMIN'};

describe('GET /internal/v1/admin-service/manager/account/:user_id — 업체 관리자 상세 (총관리자 · 관리자, 동기 경로)', () => {
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
        it('회원 ID 로 찾아 업체 · 성별 · 생년월일 · 정지 사유까지 돌려준다(업체 총관리자도 대상)', async () => {
            repo.findAccountRow.mockResolvedValueOnce(accountRow({auth_id: 'HEAD_MANAGER', state_id: 'BLOCK', block_comment: '업체 요청'}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders('10.0.0.1', ADMIN_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findAccountRow).toHaveBeenCalledWith(STAFF_ID);
            expect(res.body).toEqual({
                user_id: STAFF_ID,
                store_id: STORE_ID,
                store_name: '룸리스 강남점',
                store_code: STORE_CODE,
                store_state_id: 'ACTIVE',
                login_id: 'staff01',
                name: '김직원',
                phone: '01022223333',
                gender: 'M',
                birth: '1995-05-05',
                auth_id: 'HEAD_MANAGER',
                state_id: 'BLOCK',
                block_comment: '업체 요청',
                is_password_change_required: 0,
                created_at: FIXED_TIME.toISOString(),
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('매니저 그룹 계정이 아니거나 삭제됐으면(조회 조건 밖) 404', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders('10.0.0.1', ADMIN_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '업체 관리자를 찾을 수 없습니다.', validation_errors: null});
        });
    });

    describe('[FAIL:validation]', () => {
        it('회원 ID 가 32자 hex 가 아니면 400 validation_errors.user_id, 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/admin-service/manager/account/xyz').set(internalHeaders('10.0.0.1', ADMIN_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property: 'user_id', message: '회원 ID가 올바르지 않습니다.'}]);
            expect(repo.findAccountRow).not.toHaveBeenCalled();
        });
    });
});
