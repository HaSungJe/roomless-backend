import {In} from 'typeorm';
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {matchBcrypt} from '@app/common/utils/bcrypt.js';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {AdminRepositoryMock, bootHttpPath, createAdminRepositoryMock, createJwtServiceMock, FIXED_TIME, internalHeaders, JwtServiceMock} from './admin.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));
vi.mock('@app/common/utils/hash.js', () => ({sha256Hex: vi.fn()}));
vi.mock('@app/common/utils/cipher.js', () => ({encryptAesGcm: vi.fn(), decryptAesGcm: vi.fn()}));
vi.mock('@app/common/utils/jwt.js', () => ({extractJwtExpiresAt: vi.fn()}));

const PATH = '/internal/v1/admin/login';
const MOCK_ACCESS_TOKEN = 'mock.access.token';
const MOCK_REFRESH_TOKEN = 'mock.refresh.token';
const MOCK_ACCESS_EXPIRES_AT = new Date(2026, 0, 1, 0, 20, 0);
const MOCK_REFRESH_EXPIRES_AT = new Date(2027, 0, 1);
const ADMIN = {user_id: 'u'.repeat(32), login_pw: '$2b$12$stored', state_id: 'ACTIVE', block_comment: null, is_password_change_required: 1, auth_id: 'SUPER_ADMIN', login_scope: 'ADMIN'};
const BODY = {login_id: 'admin', login_pw: '1234'};
const ADMIN_WHERE = {login_id: 'admin', login_scope: 'ADMIN', state_id: In(['ACTIVE', 'BLOCK'])};

describe('POST /internal/v1/admin/login — 관리자 로그인 (동기 경로)', () => {
    let app: INestApplication;
    let repo: AdminRepositoryMock;
    let jwt: JwtServiceMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        vi.mocked(matchBcrypt).mockResolvedValue(true);
        vi.mocked(sha256Hex).mockReturnValue('d'.repeat(64));
        vi.mocked(encryptAesGcm).mockReturnValue('iv:tag:ct');
        vi.mocked(extractJwtExpiresAt).mockImplementation((token) => (token === MOCK_ACCESS_TOKEN ? MOCK_ACCESS_EXPIRES_AT : MOCK_REFRESH_EXPIRES_AT));
        repo = createAdminRepositoryMock();
        jwt = createJwtServiceMock(MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN);
        app = await bootHttpPath(repo, jwt);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    it('[SUCCESS] 관리자 그룹에서 찾고, 세션 · refresh 를 만든 뒤 토큰 4종 + 변경 필요 여부 + 권한 반환', async () => {
        repo.findAdmin.mockResolvedValueOnce(ADMIN);

        const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            access_token: MOCK_ACCESS_TOKEN,
            refresh_token: MOCK_REFRESH_TOKEN,
            access_token_expires_at: MOCK_ACCESS_EXPIRES_AT.toISOString(),
            refresh_token_expires_at: MOCK_REFRESH_EXPIRES_AT.toISOString(),
            is_password_change_required: 1,
            auth_id: 'SUPER_ADMIN',
        });
        expect(repo.findAdmin).toHaveBeenCalledTimes(1);
        expect(repo.findAdmin).toHaveBeenCalledWith(ADMIN_WHERE);
        expect(matchBcrypt).toHaveBeenCalledWith('1234', '$2b$12$stored');
        const session = repo.insertSession.mock.calls[0][0];
        expect(session).toMatchObject({user_id: ADMIN.user_id, ip: '10.0.0.1', is_deleted: 0});
        expect(repo.insertSessionRefresh).toHaveBeenCalledWith({
            session_id: session.session_id,
            refresh_hash: 'd'.repeat(64),
            refresh_encrypted: 'iv:tag:ct',
            previous_refresh_hash: null,
            expires_at: MOCK_REFRESH_EXPIRES_AT,
        });
    });

    it('[FAIL:auth] 다른 그룹 계정(관리자 그룹 조건으로 조회 null) → 없는 계정과 같은 404, 비밀번호 · 토큰 · 세션 없음', async () => {
        repo.findAdmin.mockResolvedValueOnce(null);

        const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

        expect(res.status).toBe(404);
        expect(res.body).toEqual({message: '잘못된 로그인 정보입니다.', validation_errors: null});
        expect(repo.findAdmin).toHaveBeenCalledWith(ADMIN_WHERE);
        expect(matchBcrypt).not.toHaveBeenCalled();
        expect(jwt.sign).not.toHaveBeenCalled();
        expect(repo.insertSession).not.toHaveBeenCalled();
    });

    it('[FAIL:service] 비밀번호가 틀리면 미존재와 같은 404', async () => {
        repo.findAdmin.mockResolvedValueOnce(ADMIN);
        vi.mocked(matchBcrypt).mockResolvedValueOnce(false);

        const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

        expect(res.status).toBe(404);
        expect(repo.insertSession).not.toHaveBeenCalled();
    });

    it('[FAIL:service] 정지 관리자이고 비밀번호가 맞으면 403 + block_comment', async () => {
        repo.findAdmin.mockResolvedValueOnce({...ADMIN, state_id: 'BLOCK', block_comment: '사유'});

        const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

        expect(res.status).toBe(403);
        expect(res.body).toEqual({message: '이용이 제한된 계정입니다.', validation_errors: null, block_comment: '사유'});
        expect(repo.insertSession).not.toHaveBeenCalled();
    });

    it('[FAIL:validation] 비밀번호 누락은 400, 조회 없음', async () => {
        const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({login_id: 'admin'});

        expect(res.status).toBe(400);
        expect(res.body.validation_errors).toEqual([{property: 'login_pw', message: '비밀번호를 입력해주세요.'}]);
        expect(repo.findAdmin).not.toHaveBeenCalled();
    });
});
