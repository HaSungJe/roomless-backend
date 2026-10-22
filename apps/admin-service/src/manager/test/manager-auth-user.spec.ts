import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createJwtServiceMock, createManagerRepositoryMock, internalHeaders, ManagerRepositoryMock} from './manager.test-helper.js';

const USER_ID = 'u'.repeat(32);
const ROW = {user_id: USER_ID, login_id: 'manager_01', name: '김매니저', auth_id: 'MANAGER', store_id: 's'.repeat(32), state_id: 'ACTIVE', is_login_allowed: 1};

describe('GET /internal/v1/admin-service/manager/auth-user/:user_id — 로그인 매니저 조회 (게이트웨이 jwt-manager 전략용)', () => {
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

    it('[SUCCESS] 로그인 매니저 행을 매니저 정보 DTO 로 돌려준다', async () => {
        repo.findLoginManager.mockResolvedValueOnce(ROW);

        const res = await request(app.getHttpServer()).get(`/internal/v1/admin-service/manager/auth-user/${USER_ID}`).set(internalHeaders());

        expect(res.status).toBe(200);
        expect(res.body).toEqual(ROW);
        expect(repo.findLoginManager).toHaveBeenCalledWith(USER_ID);
    });

    it('[FAIL:service] 매니저 그룹이 아니거나 로그인 불가 · 미존재(조회 null)면 404', async () => {
        repo.findLoginManager.mockResolvedValueOnce(null);

        const res = await request(app.getHttpServer()).get(`/internal/v1/admin-service/manager/auth-user/${USER_ID}`).set(internalHeaders());

        expect(res.status).toBe(404);
        expect(res.body).toEqual({message: '로그인 정보를 찾을 수 없습니다.', validation_errors: null});
    });

    it('[FAIL:validation] 32자를 넘는 회원 ID 는 400, 조회 없음', async () => {
        const res = await request(app.getHttpServer())
            .get(`/internal/v1/admin-service/manager/auth-user/${'x'.repeat(33)}`)
            .set(internalHeaders());

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('회원 ID가 올바르지 않습니다.');
        expect(repo.findLoginManager).not.toHaveBeenCalled();
    });

    it('[FAIL:internal] 내부 토큰 없이 호출하면 403', async () => {
        const res = await request(app.getHttpServer()).get(`/internal/v1/admin-service/manager/auth-user/${USER_ID}`);

        expect(res.status).toBe(403);
        expect(repo.findLoginManager).not.toHaveBeenCalled();
    });
});
