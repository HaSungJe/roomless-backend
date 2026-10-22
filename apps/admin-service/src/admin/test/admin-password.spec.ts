import type {TestingModule} from '@nestjs/testing';
import {getBcrypt, matchBcrypt} from '@app/common/utils/bcrypt.js';
import {ADMIN_COMMAND} from '@app/contracts/admin/admin.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {AdminRepositoryMock, bootCommandPath, createAdminRepositoryMock, createJwtServiceMock, runCommand} from './admin.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));

const ACTOR = {user_id: 'u'.repeat(32), auth_id: 'SUPER_ADMIN'};
const STORED = '$2b$12$stored';
const DTO = {current_password: '1234', new_password: 'new5678!'};

describe('admin.admin.password — 관리자 비밀번호 변경 (큐 경로)', () => {
    let repo: AdminRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createAdminRepositoryMock();
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r')));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    it('[SUCCESS] 관리자 그룹에서 찾고, 현재 비밀번호가 맞고 새 비밀번호가 다르면 해시를 바꾸고 변경 필요 플래그를 내린다', async () => {
        repo.findAdmin.mockResolvedValueOnce({user_id: ACTOR.user_id, login_pw: STORED});
        vi.mocked(matchBcrypt).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        vi.mocked(getBcrypt).mockResolvedValueOnce('$2b$12$new');

        const {decision, result} = await runCommand(dispatcher, {type: ADMIN_COMMAND.PASSWORD, payload: DTO, actor: ACTOR});

        expect(decision.result?.type).toBe('admin.admin.password.done');
        expect(result).toEqual({result: null, error: null});
        expect(repo.findAdmin).toHaveBeenCalledWith({user_id: ACTOR.user_id, login_scope: 'ADMIN'});
        expect(getBcrypt).toHaveBeenCalledWith('new5678!');
        expect(repo.updateAdmin).toHaveBeenCalledWith({user_id: ACTOR.user_id}, {login_pw: '$2b$12$new', is_password_change_required: 0});
    });

    it('[FAIL:service] 관리자 그룹 회원이 없으면 failed 404, 비밀번호 비교 없음', async () => {
        repo.findAdmin.mockResolvedValueOnce(null);

        const {result} = await runCommand(dispatcher, {type: ADMIN_COMMAND.PASSWORD, payload: DTO, actor: ACTOR});

        expect(result?.error).toEqual({status_code: 404, body: {message: '회원 정보를 찾을 수 없습니다.', validation_errors: null}});
        expect(matchBcrypt).not.toHaveBeenCalled();
    });

    it('[FAIL:service] 현재 비밀번호가 틀리면 failed 400, 변경 없음', async () => {
        repo.findAdmin.mockResolvedValueOnce({user_id: ACTOR.user_id, login_pw: STORED});
        vi.mocked(matchBcrypt).mockResolvedValueOnce(false);

        const {result} = await runCommand(dispatcher, {type: ADMIN_COMMAND.PASSWORD, payload: DTO, actor: ACTOR});

        expect(result?.error).toEqual({status_code: 400, body: {message: '현재 비밀번호가 일치하지 않습니다.', validation_errors: null}});
        expect(repo.updateAdmin).not.toHaveBeenCalled();
    });

    it('[FAIL:auth] actor 없는 명령은 failed 401, 조회 없음', async () => {
        const {result} = await runCommand(dispatcher, {type: ADMIN_COMMAND.PASSWORD, payload: DTO, actor: null});

        expect(result?.error?.status_code).toBe(401);
        expect(repo.findAdmin).not.toHaveBeenCalled();
    });
});
