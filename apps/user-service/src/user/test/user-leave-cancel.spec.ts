import type {TestingModule} from '@nestjs/testing';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createJwtServiceMock, createUserRepositoryMock, runCommand, UserRepositoryMock} from './user.test-helper.js';

const ACTOR = {user_id: 'u'.repeat(32), auth_id: 'USER'};

describe('user.member.leave-cancel — 회원 탈퇴 철회 (큐 경로)', () => {
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
        it.each([
            ['BLOCK', 'BLOCK'],
            [null, 'ACTIVE'],
        ])('직전 상태 %s → %s 로 복원하고 예약 · 스냅샷 · 사유를 비운다', async (prev, restored) => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, state_id: 'LEAVE_WAIT', leave_prev_state_id: prev});

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.LEAVE_CANCEL, payload: {}, actor: ACTOR});

            expect(decision.result?.type).toBe('user.member.leave-cancel.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.updateUser).toHaveBeenCalledWith({user_id: ACTOR.user_id}, {state_id: restored, leave_reserved_at: null, leave_prev_state_id: null, leave_comment: null});
        });
    });

    describe('[FAIL:service]', () => {
        it('회원이 없으면 failed 404', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.LEAVE_CANCEL, payload: {}, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '일치하는 회원이 없습니다.', validation_errors: null}});
            expect(repo.updateUser).not.toHaveBeenCalled();
        });

        it('LEAVE_WAIT 가 아니면 failed 400', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, state_id: 'ACTIVE', leave_prev_state_id: null});

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.LEAVE_CANCEL, payload: {}, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '탈퇴 철회를 할 수 없는 상태입니다.', validation_errors: null}});
            expect(repo.updateUser).not.toHaveBeenCalled();
        });

        it('actor 가 없으면 failed 401', async () => {
            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.LEAVE_CANCEL, payload: {}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findUser).not.toHaveBeenCalled();
        });
    });
});
