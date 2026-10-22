import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {AdminRepositoryMock, bootHttpPath, createAdminRepositoryMock, createJwtServiceMock, internalHeaders} from './admin.test-helper.js';

const USER_ID = 'u'.repeat(32);
const ROW = {user_id: USER_ID, login_id: 'admin', name: '총관리자', auth_id: 'SUPER_ADMIN', state_id: 'ACTIVE', is_login_allowed: 1};

describe('GET /internal/v1/admin/auth-user/:user_id — 로그인 관리자 조회 (게이트웨이 jwt-admin 전략용)', () => {
    let app: INestApplication;
    let repo: AdminRepositoryMock;

    beforeEach(async () => {
        repo = createAdminRepositoryMock();
        app = await bootHttpPath(repo, createJwtServiceMock('a', 'r'));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    it('[SUCCESS] 로그인 관리자 행을 관리자 정보 DTO 로 돌려준다', async () => {
        repo.findLoginAdmin.mockResolvedValueOnce(ROW);

        const res = await request(app.getHttpServer()).get(`/internal/v1/admin/auth-user/${USER_ID}`).set(internalHeaders());

        expect(res.status).toBe(200);
        expect(res.body).toEqual(ROW);
        expect(repo.findLoginAdmin).toHaveBeenCalledWith(USER_ID);
    });

    it('[FAIL:service] 관리자 그룹이 아니거나 로그인 불가 · 미존재(조회 null)면 404', async () => {
        repo.findLoginAdmin.mockResolvedValueOnce(null);

        const res = await request(app.getHttpServer()).get(`/internal/v1/admin/auth-user/${USER_ID}`).set(internalHeaders());

        expect(res.status).toBe(404);
        expect(res.body).toEqual({message: '로그인 정보를 찾을 수 없습니다.', validation_errors: null});
    });

    it('[FAIL:internal] 내부 토큰 없이 호출하면 403, 조회 없음', async () => {
        const res = await request(app.getHttpServer()).get(`/internal/v1/admin/auth-user/${USER_ID}`);

        expect(res.status).toBe(403);
        expect(repo.findLoginAdmin).not.toHaveBeenCalled();
    });
});
