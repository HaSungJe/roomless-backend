import type {TestingModule} from '@nestjs/testing';
import {getBcrypt, matchBcrypt} from '@app/common/utils/bcrypt.js';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createJwtServiceMock, createUserRepositoryMock, runCommand, UserRepositoryMock} from './user.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));

const ACTOR = {user_id: 'u'.repeat(32), auth_id: 'MANAGER'};
const STORED = '$2b$12$stored';
const DTO = {current_password: 'old1234!', new_password: 'new5678!'};

describe('user.member.password — 비밀번호 변경 (큐 경로)', () => {
    let repo: UserRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createUserRepositoryMock();
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r')));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('현재 비밀번호가 맞고 새 비밀번호가 다르면 해시를 바꾸고 변경 필요 플래그를 내린다', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, login_pw: STORED});
            vi.mocked(matchBcrypt).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
            vi.mocked(getBcrypt).mockResolvedValueOnce('$2b$12$new');

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.PASSWORD, payload: DTO, actor: ACTOR});

            expect(decision.result?.type).toBe('user.member.password.done');
            expect(result).toEqual({result: null, error: null});
            expect(matchBcrypt).toHaveBeenNthCalledWith(1, 'old1234!', STORED);
            expect(matchBcrypt).toHaveBeenNthCalledWith(2, 'new5678!', STORED);
            expect(getBcrypt).toHaveBeenCalledWith('new5678!');
            expect(repo.updateUser).toHaveBeenCalledWith({user_id: ACTOR.user_id}, {login_pw: '$2b$12$new', is_password_change_required: 0});
        });
    });

    describe('[FAIL:service]', () => {
        it('회원이 없으면 failed 404', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PASSWORD, payload: DTO, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '회원 정보를 찾을 수 없습니다.', validation_errors: null}});
            expect(matchBcrypt).not.toHaveBeenCalled();
        });

        it('현재 비밀번호가 틀리면 failed 400', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, login_pw: STORED});
            vi.mocked(matchBcrypt).mockResolvedValueOnce(false);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PASSWORD, payload: DTO, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '현재 비밀번호가 일치하지 않습니다.', validation_errors: null}});
            expect(repo.updateUser).not.toHaveBeenCalled();
        });

        it('새 비밀번호가 기존과 같으면 failed 400', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, login_pw: STORED});
            vi.mocked(matchBcrypt).mockResolvedValueOnce(true).mockResolvedValueOnce(true);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PASSWORD, payload: DTO, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '기존 비밀번호와 다른 비밀번호를 입력해주세요.', validation_errors: null}});
            expect(getBcrypt).not.toHaveBeenCalled();
            expect(repo.updateUser).not.toHaveBeenCalled();
        });
    });
});
