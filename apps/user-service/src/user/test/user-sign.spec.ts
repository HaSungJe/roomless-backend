import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {generateSnsLoginId, isAdult} from '../user.util.js';
import {bootCommandPath, createJwtServiceMock, createUserRepositoryMock, FIXED_TIME, ID_PATTERN, JwtServiceMock, runCommand, TEST_REPLY_TO, UserRepositoryMock} from './user.test-helper.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';

vi.mock(import('../user.util.js'), async (importOriginal) => ({...(await importOriginal()), isAdult: vi.fn(), generateSnsLoginId: vi.fn()}));
vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));
vi.mock('@app/common/utils/hash.js', () => ({sha256Hex: vi.fn()}));
vi.mock('@app/common/utils/cipher.js', () => ({encryptAesGcm: vi.fn(), decryptAesGcm: vi.fn()}));
vi.mock('@app/common/utils/jwt.js', () => ({extractJwtExpiresAt: vi.fn()}));

const MOCK_LOGIN_ID = 'KAKAO_20260101000000000';
const MOCK_LOGIN_PW = '$2b$12$mockhashvalue';
const MOCK_ACCESS_TOKEN = 'mock.access.token';
const MOCK_REFRESH_TOKEN = 'mock.refresh.token';
const MOCK_ACCESS_EXPIRES_AT = new Date(2026, 0, 1, 0, 20, 0);
const MOCK_REFRESH_EXPIRES_AT = new Date(2027, 0, 1);
const MOCK_REFRESH_HASH = 'a'.repeat(64);
const MOCK_REFRESH_ENCRYPTED = 'iv_hex:tag_hex:cipher_hex';
const UNDERAGE_MESSAGE = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';

const VALID_DTO = {sns_id: 'KAKAO', sns_user_id: 'kakao_user_123', gender: 'M', birth: '2000-01-01', nickname: '길동이', device_os: 'iOS', device_token: 'some-device-token'};

describe('user.member.sign — SNS 회원가입 (큐 경로)', () => {
    let repo: UserRepositoryMock;
    let jwt: JwtServiceMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        vi.mocked(isAdult).mockReturnValue(true);
        vi.mocked(generateSnsLoginId).mockReturnValue(MOCK_LOGIN_ID);
        vi.mocked(getBcrypt).mockResolvedValue(MOCK_LOGIN_PW);
        vi.mocked(sha256Hex).mockReturnValue(MOCK_REFRESH_HASH);
        vi.mocked(encryptAesGcm).mockReturnValue(MOCK_REFRESH_ENCRYPTED);
        vi.mocked(extractJwtExpiresAt).mockImplementation((token) => (token === MOCK_ACCESS_TOKEN ? MOCK_ACCESS_EXPIRES_AT : MOCK_REFRESH_EXPIRES_AT));

        repo = createUserRepositoryMock();
        jwt = createJwtServiceMock(MOCK_ACCESS_TOKEN, MOCK_REFRESH_TOKEN);
        ({dispatcher, module} = await bootCommandPath(repo, jwt));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /** 실패 후 쓰기가 하나도 일어나지 않았는지 */
    const expectNoWrites = () => {
        expect(repo.insertUser).not.toHaveBeenCalled();
        expect(repo.insertUserSetting).not.toHaveBeenCalled();
        expect(repo.insertSession).not.toHaveBeenCalled();
        expect(repo.insertSessionRefresh).not.toHaveBeenCalled();
    };

    describe('[SUCCESS]', () => {
        it('회원 · 설정 · 세션 · refresh 를 순서대로 만들고 done 으로 토큰 4종을 회신한다', async () => {
            const {decision, command, result} = await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: VALID_DTO, client_ip: '127.0.0.1'});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('user.member.sign.done');
            expect(decision.result?.request_id).toBe(command.request_id);
            expect(decision.result?.meta.reply_to).toBe(TEST_REPLY_TO);
            expect(result).toEqual({
                result: {
                    access_token: MOCK_ACCESS_TOKEN,
                    refresh_token: MOCK_REFRESH_TOKEN,
                    access_token_expires_at: MOCK_ACCESS_EXPIRES_AT.toISOString(),
                    refresh_token_expires_at: MOCK_REFRESH_EXPIRES_AT.toISOString(),
                },
                error: null,
            });

            // t_user
            expect(repo.insertUser).toHaveBeenCalledTimes(1);
            const user = repo.insertUser.mock.calls[0][0];
            expect(user).toBeInstanceOf(UserEntity);
            expect(user.user_id).toMatch(ID_PATTERN);
            expect(user.user_search_code).toMatch(ID_PATTERN);
            expect(user).toEqual({
                user_id: user.user_id,
                user_search_code: user.user_search_code,
                auth_id: 'USER',
                state_id: 'ACTIVE',
                sns_id: 'KAKAO',
                sns_user_id: 'kakao_user_123',
                login_id: MOCK_LOGIN_ID,
                login_pw: MOCK_LOGIN_PW,
                name: '길동이',
                gender: 'M',
                birth: '2000-01-01',
                phone: null,
                nickname: '길동이',
                device_os: 'iOS',
                device_token: 'some-device-token',
                is_password_change_required: 0,
            });
            expect(getBcrypt).toHaveBeenCalledWith(MOCK_LOGIN_ID);
            expect(generateSnsLoginId).toHaveBeenCalledWith('KAKAO');

            // t_user_setting
            const setting = repo.insertUserSetting.mock.calls[0][0];
            expect(setting).toEqual({user_setting_id: expect.stringMatching(ID_PATTERN), user_id: user.user_id, bio: null});

            // t_session — 게이트웨이가 넘긴 클라이언트 IP
            const session = repo.insertSession.mock.calls[0][0];
            expect(session).toEqual({session_id: expect.stringMatching(ID_PATTERN), user_id: user.user_id, ip: '127.0.0.1', device_os: 'iOS', device_token: 'some-device-token', is_delete: 0});

            // 토큰 발급
            expect(jwt.sign).toHaveBeenNthCalledWith(1, {type: 'access', user_id: user.user_id, session_id: session.session_id}, {expiresIn: '20m'});
            expect(jwt.sign).toHaveBeenNthCalledWith(2, {type: 'refresh', user_id: user.user_id, session_id: session.session_id}, {expiresIn: '365d'});

            // t_session_refresh
            expect(repo.insertSessionRefresh).toHaveBeenCalledWith({
                session_id: session.session_id,
                refresh_hash: MOCK_REFRESH_HASH,
                refresh_encrypted: MOCK_REFRESH_ENCRYPTED,
                before_refresh_hash: null,
                end_at: MOCK_REFRESH_EXPIRES_AT,
            });
            expect(sha256Hex).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN);
            expect(encryptAesGcm).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN);

            // 순서: user → setting → session → refresh
            const order = [repo.insertUser, repo.insertUserSetting, repo.insertSession, repo.insertSessionRefresh].map((fn) => fn.mock.invocationCallOrder[0]);
            expect(order).toEqual([...order].sort((a, b) => a - b));
        });

        it('device 정보가 없으면 회원 · 세션의 device 컬럼은 null', async () => {
            const {device_os: _os, device_token: _token, ...dto} = VALID_DTO;

            await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: dto});

            expect(repo.insertUser.mock.calls[0][0]).toMatchObject({device_os: null, device_token: null});
            expect(repo.insertSession.mock.calls[0][0]).toMatchObject({device_os: null, device_token: null});
        });

        it('클라이언트 IP 가 없으면 세션 ip 는 null', async () => {
            await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: VALID_DTO, client_ip: null});

            expect(repo.insertSession.mock.calls[0][0].ip).toBeNull();
        });
    });

    describe('[FAIL:service]', () => {
        it('만 18세 이하는 failed 400 + birth 입력 오류, 쓰기 없음', async () => {
            vi.mocked(isAdult).mockReturnValue(false);

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: {...VALID_DTO, birth: '2010-01-01'}});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('user.member.sign.failed');
            expect(result).toEqual({result: null, error: {status_code: 400, body: {message: UNDERAGE_MESSAGE, validation_errors: [{property: 'birth', message: UNDERAGE_MESSAGE}]}}});
            expect(isAdult).toHaveBeenCalledWith('2010-01-01');
            expectNoWrites();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('이미 가입된 SNS 계정이면 failed 400, 이후 쓰기 없음', async () => {
            repo.insertUser.mockRejectedValueOnce(new BadRequestException({message: '이미 가입된 SNS 계정입니다.'}));

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: VALID_DTO});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 가입된 SNS 계정입니다.', validation_errors: null}});
            expect(repo.insertUserSetting).not.toHaveBeenCalled();
            expect(repo.insertSession).not.toHaveBeenCalled();
            expect(repo.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository]', () => {
        it('DB 장애(500)는 재시도 여유가 있으면 회신 없이 requeue', async () => {
            repo.insertSession.mockRejectedValueOnce(new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}));

            const {decision} = await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: VALID_DTO, delivery_count: 0});

            expect(decision).toEqual({action: 'requeue', result: null});
            expect(repo.insertSessionRefresh).not.toHaveBeenCalled();
        });

        it('마지막 시도에서도 DB 장애면 failed 500 회신 후 DLQ', async () => {
            repo.insertSession.mockRejectedValueOnce(new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}));

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: VALID_DTO, delivery_count: 3});

            expect(decision.action).toBe('dead');
            expect(decision.result?.meta.attempt).toBe(4);
            expect(result?.error).toEqual({status_code: 500, body: {message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.', validation_errors: null}});
        });
    });
});
