import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {AdminRepositoryMock, bootHttpPath, createAdminRepositoryMock, createJwtServiceMock, FIXED_TIME, internalHeaders, JwtServiceMock} from './admin.test-helper.js';

vi.mock('@app/common/utils/hash.js', () => ({sha256Hex: vi.fn()}));
vi.mock('@app/common/utils/cipher.js', () => ({encryptAesGcm: vi.fn(), decryptAesGcm: vi.fn()}));
vi.mock('@app/common/utils/jwt.js', () => ({extractJwtExpiresAt: vi.fn()}));

const PATH = '/internal/v1/admin/token-refresh';
const OLD_REFRESH = 'old.refresh.token';
const OLD_HASH = 'o'.repeat(64);
const NEW_HASH = 'n'.repeat(64);
const MOCK_ACCESS_TOKEN = 'new.access.token';
const MOCK_REFRESH_TOKEN = 'new.refresh.token';
const MOCK_ACCESS_EXPIRES_AT = new Date(2026, 0, 1, 0, 20, 0);
const MOCK_REFRESH_EXPIRES_AT = new Date(2027, 0, 1);
const ONE_MINUTE_LATER = new Date(2026, 0, 1, 0, 1, 0);
const PAYLOAD = {type: 'refresh', user_id: 'u'.repeat(32), session_id: 's'.repeat(32)};

describe('POST /internal/v1/admin/token-refresh — 관리자 토큰 재발급 (동기 경로)', () => {
    let app: INestApplication;
    let repo: AdminRepositoryMock;
    let jwt: JwtServiceMock;

    /**
     * refresh · 세션은 정상이고 회원만 바꿔 깔아 둔다.
     *
     * @param admin 재검증 때 조회될 회원
     */
    const arrange = (admin: unknown) => {
        jwt.verify.mockReturnValueOnce(PAYLOAD);
        repo.findSessionRefresh.mockResolvedValueOnce({refresh_hash: OLD_HASH, expires_at: new Date(2026, 5, 1)});
        repo.findSession.mockResolvedValueOnce({session_id: PAYLOAD.session_id, ip: '10.0.0.1'});
        repo.findAdmin.mockResolvedValueOnce(admin);
    };

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        vi.mocked(sha256Hex).mockImplementation((token) => (token === OLD_REFRESH ? OLD_HASH : NEW_HASH));
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

    it('[SUCCESS] 관리자 그룹 회원이면 이전 refresh 를 단축하고 새 refresh 를 체인으로 저장한 뒤 토큰 4종', async () => {
        arrange({user_id: PAYLOAD.user_id, state_id: 'ACTIVE', login_scope: 'ADMIN'});

        const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders('10.0.0.1')).send({refresh_token: OLD_REFRESH});

        expect(res.status).toBe(200);
        expect(res.body.refresh_token).toBe(MOCK_REFRESH_TOKEN);
        expect(repo.updateSessionRefresh).toHaveBeenCalledWith({refresh_hash: OLD_HASH}, {expires_at: ONE_MINUTE_LATER});
        expect(repo.insertSessionRefresh).toHaveBeenCalledWith({
            session_id: PAYLOAD.session_id,
            refresh_hash: NEW_HASH,
            refresh_encrypted: 'iv:tag:ct',
            previous_refresh_hash: OLD_HASH,
            expires_at: MOCK_REFRESH_EXPIRES_AT,
        });
    });

    it.each([
        ['다른 그룹 회원(매니저)', {user_id: PAYLOAD.user_id, state_id: 'ACTIVE', login_scope: 'MANAGER'}],
        ['다른 그룹 회원(이용자)', {user_id: PAYLOAD.user_id, state_id: 'ACTIVE', login_scope: 'USER'}],
        ['정지 관리자', {user_id: PAYLOAD.user_id, state_id: 'BLOCK', login_scope: 'ADMIN'}],
    ])('[FAIL:auth] %s → 401 + 안전망으로 refresh 1분 뒤 만료, 새 refresh · 토큰 없음', async (_label, admin) => {
        arrange(admin);

        const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders('10.0.0.1')).send({refresh_token: OLD_REFRESH});

        expect(res.status).toBe(401);
        expect(res.body).toEqual({message: '유효하지 않은 토큰입니다.', validation_errors: null});
        expect(repo.updateSessionRefresh).toHaveBeenCalledWith({refresh_hash: OLD_HASH}, {expires_at: ONE_MINUTE_LATER});
        expect(repo.insertSessionRefresh).not.toHaveBeenCalled();
        expect(jwt.sign).not.toHaveBeenCalled();
    });

    it('[FAIL:service] access 토큰으로 재발급 시도는 401, 조회 없음', async () => {
        jwt.verify.mockReturnValueOnce({...PAYLOAD, type: 'access'});

        const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({refresh_token: OLD_REFRESH});

        expect(res.status).toBe(401);
        expect(repo.findSessionRefresh).not.toHaveBeenCalled();
    });
});
