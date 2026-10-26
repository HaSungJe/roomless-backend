import {In} from 'typeorm';
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {matchBcrypt} from '@app/common/utils/bcrypt.js';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {bootHttpPath, createJwtServiceMock, createManagerRepositoryMock, FIXED_TIME, internalHeaders, JwtServiceMock, ManagerRepositoryMock} from './manager.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));
vi.mock('@app/common/utils/hash.js', () => ({sha256Hex: vi.fn()}));
vi.mock('@app/common/utils/cipher.js', () => ({encryptAesGcm: vi.fn(), decryptAesGcm: vi.fn()}));
vi.mock('@app/common/utils/jwt.js', () => ({extractJwtExpiresAt: vi.fn()}));

const PATH = '/internal/v1/admin-service/manager/login';
const MOCK_ACCESS_TOKEN = 'mock.access.token';
const MOCK_REFRESH_TOKEN = 'mock.refresh.token';
const MOCK_ACCESS_EXPIRES_AT = new Date(2026, 0, 1, 0, 20, 0);
const MOCK_REFRESH_EXPIRES_AT = new Date(2027, 0, 1);
const STORE_ID = 's'.repeat(32);
const STORE_CODE = 'c'.repeat(32);
const MANAGER = {
    user_id: 'u'.repeat(32),
    login_pw: '$2b$12$stored',
    state_id: 'ACTIVE',
    block_comment: null,
    is_password_change_required: 1,
    auth_id: 'HEAD_MANAGER',
    login_scope: 'MANAGER',
    store_id: STORE_ID,
};
const BODY = {store_code: STORE_CODE, login_id: 'manager_01', login_pw: 'abcd1234!'};
const MANAGER_WHERE = {login_id: 'manager_01', login_scope: 'MANAGER', store_id: STORE_ID, state_id: In(['ACTIVE', 'BLOCK'])};

describe('POST /internal/v1/admin-service/manager/login — 매니저 로그인 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ManagerRepositoryMock;
    let jwt: JwtServiceMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        vi.mocked(matchBcrypt).mockResolvedValue(true);
        vi.mocked(sha256Hex).mockReturnValue('d'.repeat(64));
        vi.mocked(encryptAesGcm).mockReturnValue('iv:tag:ct');
        vi.mocked(extractJwtExpiresAt).mockImplementation((token) => (token === MOCK_ACCESS_TOKEN ? MOCK_ACCESS_EXPIRES_AT : MOCK_REFRESH_EXPIRES_AT));
        repo = createManagerRepositoryMock();
        repo.findManagerStore.mockResolvedValue({store_id: STORE_ID, store_code: STORE_CODE});
        jwt = createJwtServiceMock(MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN);
        app = await bootHttpPath(repo, jwt);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('업체코드로 업체를 찾고 그 업체의 매니저 그룹에서 찾아, 세션 · refresh 를 만든 뒤 토큰 4종 + 변경 필요 여부 + 권한 · 소속 업체 반환', async () => {
            repo.findManager.mockResolvedValueOnce(MANAGER);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                access_token: MOCK_ACCESS_TOKEN,
                refresh_token: MOCK_REFRESH_TOKEN,
                access_token_expires_at: MOCK_ACCESS_EXPIRES_AT.toISOString(),
                refresh_token_expires_at: MOCK_REFRESH_EXPIRES_AT.toISOString(),
                is_password_change_required: 1,
                auth_id: 'HEAD_MANAGER',
                store_id: STORE_ID,
            });
            expect(repo.findManagerStore).toHaveBeenCalledWith({store_code: STORE_CODE});
            expect(repo.findManager).toHaveBeenCalledTimes(1);
            expect(repo.findManager).toHaveBeenCalledWith(MANAGER_WHERE);
            expect(matchBcrypt).toHaveBeenCalledWith('abcd1234!', '$2b$12$stored');
            const session = repo.insertSession.mock.calls[0][0];
            expect(session).toMatchObject({user_id: MANAGER.user_id, ip: '10.0.0.1', device_os: null, device_token: null, is_deleted: 0});
            expect(jwt.sign).toHaveBeenNthCalledWith(1, {type: 'access', user_id: MANAGER.user_id, session_id: session.session_id}, {expiresIn: '20m'});
            expect(repo.insertSessionRefresh).toHaveBeenCalledWith({
                session_id: session.session_id,
                refresh_hash: 'd'.repeat(64),
                refresh_encrypted: 'iv:tag:ct',
                previous_refresh_hash: null,
                expires_at: MOCK_REFRESH_EXPIRES_AT,
            });
            expect(repo.updateManager).not.toHaveBeenCalled();
        });

        it('device_os · device_token 둘 다 오면 마지막 로그인 기기를 갱신한다', async () => {
            repo.findManager.mockResolvedValueOnce(MANAGER);

            await request(app.getHttpServer())
                .post(PATH)
                .set(internalHeaders())
                .send({...BODY, device_os: 'iOS', device_token: 'tok'});

            expect(repo.updateManager).toHaveBeenCalledWith({user_id: MANAGER.user_id}, {device_os: 'iOS', device_token: 'tok'});
        });
    });

    describe('[FAIL:auth]', () => {
        it('업체코드가 없는 업체면 없는 계정과 같은 404, 계정 조회 · 비밀번호 · 세션 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '잘못된 로그인 정보입니다.', validation_errors: null});
            expect(repo.findManager).not.toHaveBeenCalled();
            expect(matchBcrypt).not.toHaveBeenCalled();
            expect(repo.insertSession).not.toHaveBeenCalled();
        });

        it('다른 그룹 · 다른 업체 계정(그 업체 · 매니저 그룹 조건으로 조회 null) → 없는 계정과 같은 404, 비밀번호 · 토큰 · 세션 없음', async () => {
            repo.findManager.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '잘못된 로그인 정보입니다.', validation_errors: null});
            expect(repo.findManager).toHaveBeenCalledWith(MANAGER_WHERE);
            expect(matchBcrypt).not.toHaveBeenCalled();
            expect(jwt.sign).not.toHaveBeenCalled();
            expect(repo.insertSession).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('비밀번호가 틀리면 미존재와 같은 404', async () => {
            repo.findManager.mockResolvedValueOnce(MANAGER);
            vi.mocked(matchBcrypt).mockResolvedValueOnce(false);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body.message).toBe('잘못된 로그인 정보입니다.');
            expect(repo.insertSession).not.toHaveBeenCalled();
        });

        it('정지 매니저라도 비밀번호가 틀리면 404 — 정지 여부를 노출하지 않는다', async () => {
            repo.findManager.mockResolvedValueOnce({...MANAGER, state_id: 'BLOCK', block_comment: '사유'});
            vi.mocked(matchBcrypt).mockResolvedValueOnce(false);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body.block_comment).toBeUndefined();
        });

        it('정지 매니저이고 비밀번호가 맞으면 403 + block_comment, 세션 없음', async () => {
            repo.findManager.mockResolvedValueOnce({...MANAGER, state_id: 'BLOCK', block_comment: '사유'});

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(403);
            expect(res.body).toEqual({message: '이용이 제한된 계정입니다.', validation_errors: null, block_comment: '사유'});
            expect(repo.insertSession).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('아이디 누락은 400, 조회 없음', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({store_code: STORE_CODE, login_pw: 'x'});

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property: 'login_id', message: '아이디를 입력해주세요.'}]);
            expect(repo.findManager).not.toHaveBeenCalled();
        });

        it.each([
            [{login_id: 'manager_01', login_pw: 'x'}, '업체코드를 입력해주세요.'],
            [{store_code: 'xyz', login_id: 'manager_01', login_pw: 'x'}, '업체코드가 올바르지 않습니다.'],
        ])('업체코드 누락 · 형식 오류 %o → 400 validation_errors.store_code, 업체 조회 없음', async (body, message) => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(body);

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property: 'store_code', message}]);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:internal]', () => {
        it('내부 토큰 없이 호출하면 403, 조회 없음', async () => {
            const res = await request(app.getHttpServer()).post(PATH).send(BODY);

            expect(res.status).toBe(403);
            expect(repo.findManager).not.toHaveBeenCalled();
        });
    });
});
