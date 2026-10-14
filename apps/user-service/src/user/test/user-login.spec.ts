import {In} from 'typeorm';
import {INestApplication, InternalServerErrorException} from '@nestjs/common';
import request from 'supertest';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {bootHttpPath, createJwtServiceMock, createUserRepositoryMock, FIXED_TIME, ID_PATTERN, internalHeaders, JwtServiceMock, UserRepositoryMock} from './user.test-helper.js';

vi.mock('@app/common/utils/hash.js', () => ({sha256Hex: vi.fn()}));
vi.mock('@app/common/utils/cipher.js', () => ({encryptAesGcm: vi.fn(), decryptAesGcm: vi.fn()}));
vi.mock('@app/common/utils/jwt.js', () => ({extractJwtExpiresAt: vi.fn()}));

const PATH = '/internal/v1/user/login';
const MOCK_ACCESS_TOKEN = 'mock.access.token';
const MOCK_REFRESH_TOKEN = 'mock.refresh.token';
const MOCK_ACCESS_EXPIRES_AT = new Date(2026, 0, 1, 0, 20, 0);
const MOCK_REFRESH_EXPIRES_AT = new Date(2027, 0, 1);
const ACTIVE_USER = {user_id: 'u'.repeat(32), state_id: 'ACTIVE', block_comment: null};

describe('POST /internal/v1/user/login — SNS 로그인 (동기 경로)', () => {
    let app: INestApplication;
    let repo: UserRepositoryMock;
    let jwt: JwtServiceMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        vi.mocked(sha256Hex).mockReturnValue('c'.repeat(64));
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
        it('ACTIVE 회원이면 세션 · refresh 를 만들고 토큰 4종 반환, 클라이언트 IP 는 게이트웨이 헤더 값', async () => {
            repo.findUser.mockResolvedValueOnce(ACTIVE_USER);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders('9.9.9.9')).send({sns_id: 'KAKAO', sns_user_id: 'kakao_1'});

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                access_token: MOCK_ACCESS_TOKEN,
                refresh_token: MOCK_REFRESH_TOKEN,
                access_token_expires_at: MOCK_ACCESS_EXPIRES_AT.toISOString(),
                refresh_token_expires_at: MOCK_REFRESH_EXPIRES_AT.toISOString(),
            });
            expect(repo.findUser).toHaveBeenCalledWith({sns_id: 'KAKAO', sns_user_id: 'kakao_1', state_id: In(['ACTIVE', 'BLOCK'])});
            expect(repo.updateUser).not.toHaveBeenCalled();
            expect(repo.insertSession).toHaveBeenCalledWith({
                session_id: expect.stringMatching(ID_PATTERN),
                user_id: ACTIVE_USER.user_id,
                ip: '9.9.9.9',
                device_os: null,
                device_token: null,
                is_delete: 0,
            });
            expect(repo.insertSessionRefresh).toHaveBeenCalledWith({
                session_id: repo.insertSession.mock.calls[0][0].session_id,
                refresh_hash: 'c'.repeat(64),
                refresh_encrypted: 'iv:tag:ct',
                before_refresh_hash: null,
                end_at: MOCK_REFRESH_EXPIRES_AT,
            });
        });

        it('device_os · device_token 둘 다 오면 회원의 마지막 로그인 기기를 갱신한다', async () => {
            repo.findUser.mockResolvedValueOnce(ACTIVE_USER);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({sns_id: 'KAKAO', sns_user_id: 'kakao_1', device_os: 'AOS', device_token: 'tok'});

            expect(res.status).toBe(200);
            expect(repo.updateUser).toHaveBeenCalledTimes(1);
            expect(repo.updateUser).toHaveBeenCalledWith({user_id: ACTIVE_USER.user_id}, {device_os: 'AOS', device_token: 'tok'});
            expect(repo.insertSession.mock.calls[0][0]).toMatchObject({device_os: 'AOS', device_token: 'tok'});
        });
    });

    describe('[FAIL:validation]', () => {
        it('device_token 만 오면 400 + device_os 입력 오류, 조회 없음', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({sns_id: 'KAKAO', sns_user_id: 'kakao_1', device_token: 'tok'});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({
                message: 'device_token 입력 시 device_os 도 입력해야 합니다.',
                validation_errors: [{property: 'device_os', message: 'device_token 입력 시 device_os 도 입력해야 합니다.'}],
            });
            expect(repo.findUser).not.toHaveBeenCalled();
        });

        it('허용되지 않은 SNS 유형은 400', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({sns_id: 'TWITTER', sns_user_id: 'x'});

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('유효하지 않은 SNS 유형입니다.');
        });
    });

    describe('[FAIL:service]', () => {
        it('회원이 없으면 404', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({sns_id: 'KAKAO', sns_user_id: 'none'});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '잘못된 로그인 정보입니다.', validation_errors: null});
            expect(repo.insertSession).not.toHaveBeenCalled();
        });

        it('정지 회원이면 403 + block_comment, 세션 생성 없음', async () => {
            repo.findUser.mockResolvedValueOnce({...ACTIVE_USER, state_id: 'BLOCK', block_comment: '운영정책 위반'});

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({sns_id: 'KAKAO', sns_user_id: 'kakao_1', device_os: 'AOS', device_token: 'tok'});

            expect(res.status).toBe(403);
            expect(res.body).toEqual({message: '이용이 제한된 계정입니다.', validation_errors: null, block_comment: '운영정책 위반'});
            expect(repo.updateUser).not.toHaveBeenCalled();
            expect(repo.insertSession).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository]', () => {
        it('세션 저장 실패는 500, refresh 저장 없음', async () => {
            repo.findUser.mockResolvedValueOnce(ACTIVE_USER);
            repo.insertSession.mockRejectedValueOnce(new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({sns_id: 'KAKAO', sns_user_id: 'kakao_1'});

            expect(res.status).toBe(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(repo.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:internal]', () => {
        it('내부 토큰이 없거나 틀리면 403, 조회 없음', async () => {
            const missing = await request(app.getHttpServer()).post(PATH).send({sns_id: 'KAKAO', sns_user_id: 'kakao_1'});
            const wrong = await request(app.getHttpServer()).post(PATH).set(INTERNAL_HEADER.TOKEN, 'wrong').send({sns_id: 'KAKAO', sns_user_id: 'kakao_1'});

            expect(missing.status).toBe(403);
            expect(missing.body).toEqual({message: '내부 요청만 허용됩니다.', validation_errors: null});
            expect(wrong.status).toBe(403);
            expect(repo.findUser).not.toHaveBeenCalled();
        });
    });
});
