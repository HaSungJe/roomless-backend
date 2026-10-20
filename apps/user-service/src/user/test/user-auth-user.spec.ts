import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createJwtServiceMock, createUserRepositoryMock, internalHeaders, UserRepositoryMock} from './user.test-helper.js';

const USER_ID = 'u'.repeat(32);
const ROW = {
    user_id: USER_ID,
    login_id: 'roomless_01',
    name: '홍길동',
    gender: 'M',
    birth: '1990-01-01',
    nickname: '길동',
    auth_id: 'MANAGER',
    store_id: 's'.repeat(32),
    state_id: 'ACTIVE',
    phone_verified_at: null,
    is_login_allowed: 1,
};

describe('GET /internal/v1/user/auth-user/:user_id — 로그인 회원 조회 (게이트웨이 JWT 전략용)', () => {
    let app: INestApplication;
    let repo: UserRepositoryMock;

    beforeEach(async () => {
        repo = createUserRepositoryMock();
        app = await bootHttpPath(repo, createJwtServiceMock('a', 'r'));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    it('[SUCCESS] 로그인 회원 행을 회원 정보 DTO 로 돌려준다', async () => {
        repo.findLoginUser.mockResolvedValueOnce(ROW);

        const res = await request(app.getHttpServer()).get(`/internal/v1/user/auth-user/${USER_ID}`).set(internalHeaders());

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            user_id: USER_ID,
            login_id: 'roomless_01',
            name: '홍길동',
            gender: 'M',
            birth: '1990-01-01',
            nickname: '길동',
            auth_id: 'MANAGER',
            store_id: 's'.repeat(32),
            state_id: 'ACTIVE',
            is_login_allowed: 1,
            is_phone_verified: 0,
        });
        expect(repo.findLoginUser).toHaveBeenCalledWith(USER_ID);
    });

    it('[SUCCESS] 휴대폰 SMS 인증을 마친 회원이면 is_phone_verified 1', async () => {
        repo.findLoginUser.mockResolvedValueOnce({...ROW, phone_verified_at: new Date(2025, 11, 1)});

        const res = await request(app.getHttpServer()).get(`/internal/v1/user/auth-user/${USER_ID}`).set(internalHeaders());

        expect(res.status).toBe(200);
        expect(res.body.is_phone_verified).toBe(1);
    });

    it('[FAIL:service] 로그인 불가 · 미존재면 404', async () => {
        repo.findLoginUser.mockResolvedValueOnce(null);

        const res = await request(app.getHttpServer()).get(`/internal/v1/user/auth-user/${USER_ID}`).set(internalHeaders());

        expect(res.status).toBe(404);
        expect(res.body).toEqual({message: '로그인 정보를 찾을 수 없습니다.', validation_errors: null});
    });

    it('[FAIL:validation] 32자를 넘는 회원 ID 는 400, 조회 없음', async () => {
        const res = await request(app.getHttpServer())
            .get(`/internal/v1/user/auth-user/${'x'.repeat(33)}`)
            .set(internalHeaders());

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('회원 ID가 올바르지 않습니다.');
        expect(repo.findLoginUser).not.toHaveBeenCalled();
    });

    it('[FAIL:internal] 내부 토큰 없이 호출하면 403', async () => {
        const res = await request(app.getHttpServer()).get(`/internal/v1/user/auth-user/${USER_ID}`);

        expect(res.status).toBe(403);
        expect(repo.findLoginUser).not.toHaveBeenCalled();
    });
});
