import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {bootHttpPath, createJwtServiceMock, createUserRepositoryMock, FIXED_TIME, internalHeaders, JwtServiceMock, UserRepositoryMock} from './user.test-helper.js';

vi.mock('@app/common/utils/hash.js', () => ({sha256Hex: vi.fn()}));
vi.mock('@app/common/utils/cipher.js', () => ({encryptAesGcm: vi.fn(), decryptAesGcm: vi.fn()}));
vi.mock('@app/common/utils/jwt.js', () => ({extractJwtExpiresAt: vi.fn()}));

const PATH = '/internal/v1/user/token-refresh';
const OLD_REFRESH = 'old.refresh.token';
const OLD_HASH = 'o'.repeat(64);
const NEW_HASH = 'n'.repeat(64);
const MOCK_ACCESS_TOKEN = 'new.access.token';
const MOCK_REFRESH_TOKEN = 'new.refresh.token';
const MOCK_ACCESS_EXPIRES_AT = new Date(2026, 0, 1, 0, 20, 0);
const MOCK_REFRESH_EXPIRES_AT = new Date(2027, 0, 1);
const ONE_MINUTE_LATER = new Date(2026, 0, 1, 0, 1, 0);
const PAYLOAD = {type: 'refresh', user_id: 'u'.repeat(32), session_id: 's'.repeat(32)};
const INVALID = {message: '유효하지 않은 토큰입니다.', validation_errors: null};

describe('POST /internal/v1/user/token-refresh — 토큰 재발급 (동기 경로)', () => {
    let app: INestApplication;
    let repo: UserRepositoryMock;
    let jwt: JwtServiceMock;

    /** 정상 흐름의 조회 결과를 깔아 둔다 */
    const arrangeValid = () => {
        jwt.verify.mockReturnValueOnce(PAYLOAD);
        repo.findSessionRefresh.mockResolvedValueOnce({refresh_hash: OLD_HASH, end_at: new Date(2026, 5, 1)});
        repo.findSession.mockResolvedValueOnce({session_id: PAYLOAD.session_id, ip: '10.0.0.1'});
        repo.findUser.mockResolvedValueOnce({user_id: PAYLOAD.user_id, state_id: 'ACTIVE'});
    };

    /** 401 이후 쓰기가 없는지 */
    const expectNoWrites = () => {
        expect(repo.updateSessionRefresh).not.toHaveBeenCalled();
        expect(repo.insertSessionRefresh).not.toHaveBeenCalled();
    };

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        vi.mocked(sha256Hex).mockImplementation((token) => (token === OLD_REFRESH ? OLD_HASH : NEW_HASH));
        vi.mocked(encryptAesGcm).mockReturnValue('iv:tag:ct');
        vi.mocked(extractJwtExpiresAt).mockImplementation((token) => (token === MOCK_ACCESS_TOKEN ? MOCK_ACCESS_EXPIRES_AT : MOCK_REFRESH_EXPIRES_AT));
        repo = createUserRepositoryMock();
        jwt = createJwtServiceMock(MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN);
        app = await bootHttpPath(repo, jwt);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('이전 refresh 를 1분 뒤 만료로 단축하고, 새 refresh 를 체인으로 저장한 뒤 토큰 4종 반환', async () => {
            arrangeValid();

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders('10.0.0.1')).send({refresh_token: OLD_REFRESH});

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                access_token: MOCK_ACCESS_TOKEN,
                refresh_token: MOCK_REFRESH_TOKEN,
                access_token_expires_at: MOCK_ACCESS_EXPIRES_AT.toISOString(),
                refresh_token_expires_at: MOCK_REFRESH_EXPIRES_AT.toISOString(),
            });
            expect(jwt.verify).toHaveBeenCalledWith(OLD_REFRESH);
            expect(repo.findSessionRefresh).toHaveBeenCalledWith({refresh_hash: OLD_HASH});
            expect(repo.findSession).toHaveBeenCalledWith({session_id: PAYLOAD.session_id});
            expect(repo.findUser).toHaveBeenCalledWith({user_id: PAYLOAD.user_id});
            expect(repo.updateSessionRefresh).toHaveBeenCalledTimes(1);
            expect(repo.updateSessionRefresh).toHaveBeenCalledWith({refresh_hash: OLD_HASH}, {end_at: ONE_MINUTE_LATER});
            expect(repo.insertSessionRefresh).toHaveBeenCalledWith({
                session_id: PAYLOAD.session_id,
                refresh_hash: NEW_HASH,
                refresh_encrypted: 'iv:tag:ct',
                before_refresh_hash: OLD_HASH,
                end_at: MOCK_REFRESH_EXPIRES_AT,
            });
            expect(repo.updateSessionRefresh.mock.invocationCallOrder[0]).toBeLessThan(repo.insertSessionRefresh.mock.invocationCallOrder[0]);
        });

        it('세션에 저장된 ip 가 없으면 ip 비교를 건너뛴다', async () => {
            jwt.verify.mockReturnValueOnce(PAYLOAD);
            repo.findSessionRefresh.mockResolvedValueOnce({refresh_hash: OLD_HASH, end_at: new Date(2026, 5, 1)});
            repo.findSession.mockResolvedValueOnce({session_id: PAYLOAD.session_id, ip: null});
            repo.findUser.mockResolvedValueOnce({user_id: PAYLOAD.user_id, state_id: 'ACTIVE'});

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders('99.99.99.99')).send({refresh_token: OLD_REFRESH});

            expect(res.status).toBe(200);
        });
    });

    describe('[FAIL:service] 401', () => {
        it('서명 · 만료 검증 실패', async () => {
            jwt.verify.mockImplementationOnce(() => {
                throw new Error('jwt expired');
            });

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({refresh_token: OLD_REFRESH});

            expect(res.status).toBe(401);
            expect(res.body).toEqual(INVALID);
            expect(repo.findSessionRefresh).not.toHaveBeenCalled();
            expectNoWrites();
        });

        it('access 토큰으로 재발급 시도', async () => {
            jwt.verify.mockReturnValueOnce({...PAYLOAD, type: 'access'});

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({refresh_token: OLD_REFRESH});

            expect(res.status).toBe(401);
            expect(repo.findSessionRefresh).not.toHaveBeenCalled();
        });

        it('DB 에 없는 refresh', async () => {
            jwt.verify.mockReturnValueOnce(PAYLOAD);
            repo.findSessionRefresh.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({refresh_token: OLD_REFRESH});

            expect(res.status).toBe(401);
            expect(repo.findSession).not.toHaveBeenCalled();
            expectNoWrites();
        });

        it('DB end_at 이 지난 refresh (체인 재사용 차단)', async () => {
            jwt.verify.mockReturnValueOnce(PAYLOAD);
            repo.findSessionRefresh.mockResolvedValueOnce({refresh_hash: OLD_HASH, end_at: new Date(2025, 11, 31)});

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({refresh_token: OLD_REFRESH});

            expect(res.status).toBe(401);
            expectNoWrites();
        });

        it('세션이 없음', async () => {
            jwt.verify.mockReturnValueOnce(PAYLOAD);
            repo.findSessionRefresh.mockResolvedValueOnce({refresh_hash: OLD_HASH, end_at: new Date(2026, 5, 1)});
            repo.findSession.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({refresh_token: OLD_REFRESH});

            expect(res.status).toBe(401);
            expectNoWrites();
        });

        it('로그인 시점 ip 와 다른 ip — 만료 단축 없이 거부', async () => {
            jwt.verify.mockReturnValueOnce(PAYLOAD);
            repo.findSessionRefresh.mockResolvedValueOnce({refresh_hash: OLD_HASH, end_at: new Date(2026, 5, 1)});
            repo.findSession.mockResolvedValueOnce({session_id: PAYLOAD.session_id, ip: '10.0.0.1'});

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders('10.0.0.2')).send({refresh_token: OLD_REFRESH});

            expect(res.status).toBe(401);
            expect(repo.findUser).not.toHaveBeenCalled();
            expectNoWrites();
        });

        it.each([
            ['회원 없음', null],
            ['탈퇴 대기 회원', {user_id: PAYLOAD.user_id, state_id: 'LEAVE_WAIT'}],
            ['정지 회원', {user_id: PAYLOAD.user_id, state_id: 'BLOCK'}],
        ])('%s — 안전망으로 refresh 를 1분 뒤 만료시키고 거부', async (_label, user) => {
            jwt.verify.mockReturnValueOnce(PAYLOAD);
            repo.findSessionRefresh.mockResolvedValueOnce({refresh_hash: OLD_HASH, end_at: new Date(2026, 5, 1)});
            repo.findSession.mockResolvedValueOnce({session_id: PAYLOAD.session_id, ip: '10.0.0.1'});
            repo.findUser.mockResolvedValueOnce(user);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders('10.0.0.1')).send({refresh_token: OLD_REFRESH});

            expect(res.status).toBe(401);
            expect(res.body).toEqual(INVALID);
            expect(repo.updateSessionRefresh).toHaveBeenCalledWith({refresh_hash: OLD_HASH}, {end_at: ONE_MINUTE_LATER});
            expect(repo.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('refresh_token 누락은 400', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '리프레시 토큰을 입력해주세요.', validation_errors: [{property: 'refresh_token', message: '리프레시 토큰을 입력해주세요.'}]});
            expect(jwt.verify).not.toHaveBeenCalled();
        });
    });
});
