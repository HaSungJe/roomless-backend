import {In} from 'typeorm';
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {matchBcrypt} from '@app/common/utils/bcrypt.js';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {bootHttpPath, createJwtServiceMock, createUserRepositoryMock, FIXED_TIME, internalHeaders, JwtServiceMock, UserRepositoryMock} from './user.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));
vi.mock('@app/common/utils/hash.js', () => ({sha256Hex: vi.fn()}));
vi.mock('@app/common/utils/cipher.js', () => ({encryptAesGcm: vi.fn(), decryptAesGcm: vi.fn()}));
vi.mock('@app/common/utils/jwt.js', () => ({extractJwtExpiresAt: vi.fn()}));

const PATH = '/internal/v1/user/general-login';
const MOCK_ACCESS_TOKEN = 'mock.access.token';
const MOCK_REFRESH_TOKEN = 'mock.refresh.token';
const MOCK_ACCESS_EXPIRES_AT = new Date(2026, 0, 1, 0, 20, 0);
const MOCK_REFRESH_EXPIRES_AT = new Date(2027, 0, 1);
const USER = {user_id: 'u'.repeat(32), login_pw: '$2b$12$stored', state_id: 'ACTIVE', block_comment: null, is_password_change_required: 1};
const BODY = {login_id: 'roomless_01', login_pw: 'abcd1234!'};

describe('POST /internal/v1/user/general-login — 일반 로그인 (동기 경로)', () => {
    let app: INestApplication;
    let repo: UserRepositoryMock;
    let jwt: JwtServiceMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        vi.mocked(matchBcrypt).mockResolvedValue(true);
        vi.mocked(sha256Hex).mockReturnValue('d'.repeat(64));
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
        it('비밀번호가 맞으면 토큰 4종 + 비밀번호 변경 필요 여부 반환', async () => {
            repo.findUser.mockResolvedValueOnce(USER);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                access_token: MOCK_ACCESS_TOKEN,
                refresh_token: MOCK_REFRESH_TOKEN,
                access_token_expires_at: MOCK_ACCESS_EXPIRES_AT.toISOString(),
                refresh_token_expires_at: MOCK_REFRESH_EXPIRES_AT.toISOString(),
                is_password_change_required: 1,
            });
            expect(repo.findUser).toHaveBeenCalledWith({login_id: 'roomless_01', state_id: In(['ACTIVE', 'BLOCK'])});
            expect(matchBcrypt).toHaveBeenCalledWith('abcd1234!', '$2b$12$stored');
            expect(repo.insertSession).toHaveBeenCalledTimes(1);
            expect(repo.insertSessionRefresh).toHaveBeenCalledTimes(1);
        });
    });

    describe('[FAIL:service]', () => {
        it('회원이 없으면 404, 비밀번호 비교 없음', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '잘못된 로그인 정보입니다.', validation_errors: null});
            expect(matchBcrypt).not.toHaveBeenCalled();
        });

        it('비밀번호가 틀리면 미존재와 같은 404', async () => {
            repo.findUser.mockResolvedValueOnce(USER);
            vi.mocked(matchBcrypt).mockResolvedValueOnce(false);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body.message).toBe('잘못된 로그인 정보입니다.');
            expect(repo.insertSession).not.toHaveBeenCalled();
        });

        it('정지 회원이라도 비밀번호가 틀리면 404 — 정지 여부를 노출하지 않는다', async () => {
            repo.findUser.mockResolvedValueOnce({...USER, state_id: 'BLOCK', block_comment: '사유'});
            vi.mocked(matchBcrypt).mockResolvedValueOnce(false);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body.block_comment).toBeUndefined();
        });

        it('정지 회원이고 비밀번호가 맞으면 403 + block_comment', async () => {
            repo.findUser.mockResolvedValueOnce({...USER, state_id: 'BLOCK', block_comment: '사유'});

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(403);
            expect(res.body).toEqual({message: '이용이 제한된 계정입니다.', validation_errors: null, block_comment: '사유'});
            expect(repo.insertSession).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('아이디 누락은 400', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({login_pw: 'x'});

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property: 'login_id', message: '아이디를 입력해주세요.'}]);
            expect(repo.findUser).not.toHaveBeenCalled();
        });
    });
});
