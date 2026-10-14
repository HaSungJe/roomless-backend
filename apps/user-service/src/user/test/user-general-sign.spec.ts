import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {encryptAesGcm} from '@app/common/utils/cipher.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {isAdult} from '../user.util.js';
import {bootCommandPath, createJwtServiceMock, createUserRepositoryMock, FIXED_TIME, ID_PATTERN, JwtServiceMock, runCommand, UserRepositoryMock} from './user.test-helper.js';

vi.mock(import('../user.util.js'), async (importOriginal) => ({...(await importOriginal()), isAdult: vi.fn()}));
vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));
vi.mock('@app/common/utils/hash.js', () => ({sha256Hex: vi.fn()}));
vi.mock('@app/common/utils/cipher.js', () => ({encryptAesGcm: vi.fn(), decryptAesGcm: vi.fn()}));
vi.mock('@app/common/utils/jwt.js', () => ({extractJwtExpiresAt: vi.fn()}));

const MOCK_PW_HASH = '$2b$12$generalhash';
const MOCK_ACCESS_TOKEN = 'mock.access.token';
const MOCK_REFRESH_TOKEN = 'mock.refresh.token';
const MOCK_ACCESS_EXPIRES_AT = new Date(2026, 0, 1, 0, 20, 0);
const MOCK_REFRESH_EXPIRES_AT = new Date(2027, 0, 1);
const UNDERAGE_MESSAGE = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';

const VALID_DTO = {login_id: 'roomless_01', login_pw: 'abcd1234!', gender: 'F', birth: '1995-05-05', nickname: '룸리스'};

describe('user.member.general-sign — 일반 회원가입 (큐 경로)', () => {
    let repo: UserRepositoryMock;
    let jwt: JwtServiceMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        vi.mocked(isAdult).mockReturnValue(true);
        vi.mocked(getBcrypt).mockResolvedValue(MOCK_PW_HASH);
        vi.mocked(sha256Hex).mockReturnValue('b'.repeat(64));
        vi.mocked(encryptAesGcm).mockReturnValue('iv:tag:ct');
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

    describe('[SUCCESS]', () => {
        it('입력 아이디 · 해시 비밀번호로 회원을 만들고 sns 는 null, done 으로 토큰 4종', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.GENERAL_SIGN, payload: VALID_DTO, client_ip: '1.2.3.4'});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('user.member.general-sign.done');
            expect(result?.result).toEqual({
                access_token: MOCK_ACCESS_TOKEN,
                refresh_token: MOCK_REFRESH_TOKEN,
                access_token_expires_at: MOCK_ACCESS_EXPIRES_AT.toISOString(),
                refresh_token_expires_at: MOCK_REFRESH_EXPIRES_AT.toISOString(),
            });
            expect(getBcrypt).toHaveBeenCalledWith('abcd1234!');
            expect(repo.insertUser).toHaveBeenCalledTimes(1);
            expect(repo.insertUser.mock.calls[0][0]).toEqual({
                user_id: expect.stringMatching(ID_PATTERN),
                user_search_code: expect.stringMatching(ID_PATTERN),
                auth_id: 'USER',
                state_id: 'ACTIVE',
                sns_id: null,
                sns_user_id: null,
                login_id: 'roomless_01',
                login_pw: MOCK_PW_HASH,
                name: '룸리스',
                gender: 'F',
                birth: '1995-05-05',
                phone: null,
                nickname: '룸리스',
                device_os: null,
                device_token: null,
                is_password_change_required: 0,
            });
            const user_id = repo.insertUser.mock.calls[0][0].user_id;
            expect(repo.insertUserSetting).toHaveBeenCalledWith({user_setting_id: expect.stringMatching(ID_PATTERN), user_id, bio: null});
            expect(repo.insertSession).toHaveBeenCalledWith({session_id: expect.stringMatching(ID_PATTERN), user_id, ip: '1.2.3.4', device_os: null, device_token: null, is_delete: 0});
            expect(repo.insertSessionRefresh).toHaveBeenCalledWith({
                session_id: repo.insertSession.mock.calls[0][0].session_id,
                refresh_hash: 'b'.repeat(64),
                refresh_encrypted: 'iv:tag:ct',
                before_refresh_hash: null,
                end_at: MOCK_REFRESH_EXPIRES_AT,
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('만 18세 이하는 failed 400 + birth 입력 오류, 비밀번호 해시 · 쓰기 없음', async () => {
            vi.mocked(isAdult).mockReturnValue(false);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.GENERAL_SIGN, payload: VALID_DTO});

            expect(result?.error).toEqual({status_code: 400, body: {message: UNDERAGE_MESSAGE, validation_errors: [{property: 'birth', message: UNDERAGE_MESSAGE}]}});
            expect(getBcrypt).not.toHaveBeenCalled();
            expect(repo.insertUser).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('이미 존재하는 로그인 ID 면 failed 400, 이후 쓰기 없음', async () => {
            repo.insertUser.mockRejectedValueOnce(new BadRequestException({message: '이미 존재하는 로그인 ID입니다.'}));

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.GENERAL_SIGN, payload: VALID_DTO});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 존재하는 로그인 ID입니다.', validation_errors: null}});
            expect(repo.insertUserSetting).not.toHaveBeenCalled();
            expect(repo.insertSession).not.toHaveBeenCalled();
        });
    });
});
