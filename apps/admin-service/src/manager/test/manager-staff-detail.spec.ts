import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In} from 'typeorm';
import {
    bootHttpPath,
    createJwtServiceMock,
    createManagerRepositoryMock,
    FIXED_TIME,
    HEAD_ACTOR,
    headManagerRow,
    internalHeaders,
    ManagerRepositoryMock,
    STAFF_ID,
    STORE_ID,
    staffRow,
} from './manager.test-helper.js';

const PATH = `/internal/v1/admin-service/manager/staff/${STAFF_ID}`;

describe('GET /internal/v1/admin-service/manager/staff/:user_id — 업체 관리자 상세 (업체 총관리자, 동기 경로)', () => {
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
        it('내 업체 · 매니저 그룹 · 업체 관리자(MANAGER) · 삭제 안 된 계정을 찾아 상세(정지 사유 포함)', async () => {
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(staffRow({state_id: 'BLOCK', block_comment: '근무 종료'}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders('10.0.0.1', HEAD_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManager).toHaveBeenNthCalledWith(2, {user_id: STAFF_ID, login_scope: 'MANAGER', auth_id: 'MANAGER', store_id: STORE_ID, state_id: In(['ACTIVE', 'BLOCK'])});
            expect(res.body).toEqual({
                user_id: STAFF_ID,
                login_id: 'staff01',
                name: '김직원',
                phone: '01022223333',
                gender: 'M',
                birth: '1995-05-05',
                auth_id: 'MANAGER',
                state_id: 'BLOCK',
                block_comment: '근무 종료',
                is_password_change_required: 1,
                created_at: FIXED_TIME.toISOString(),
                updated_at: FIXED_TIME.toISOString(),
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('대상이 없으면(다른 업체 · 업체 총관리자 자신 · 삭제) 404', async () => {
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders('10.0.0.1', HEAD_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '업체 관리자를 찾을 수 없습니다.', validation_errors: null});
        });
    });

    describe('[FAIL:validation]', () => {
        it('회원 ID 가 32자 hex 가 아니면 400 validation_errors.user_id, 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/admin-service/manager/staff/abc').set(internalHeaders('10.0.0.1', HEAD_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body.validation_errors.map((e: {property: string}) => e.property)).toEqual(['user_id']);
            expect(repo.findManager).not.toHaveBeenCalled();
        });
    });
});
