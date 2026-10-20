import type {TestingModule} from '@nestjs/testing';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createJwtServiceMock, createUserRepositoryMock, FIXED_TIME, runCommand, UserRepositoryMock} from './user.test-helper.js';

const ACTOR = {user_id: 'u'.repeat(32), auth_id: 'USER'};

describe('user.member.leave — 회원 탈퇴 신청 (큐 경로)', () => {
    let repo: UserRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        repo = createUserRepositoryMock();
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r')));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it.each(['ACTIVE', 'BLOCK'])('%s 회원을 LEAVE_WAIT 로 바꾸고 직전 상태 · 14일 뒤 예약시각을 저장, done(null)', async (state_id) => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, state_id});

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.LEAVE, payload: {leave_comment: '이용 빈도 낮음'}, actor: ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('user.member.leave.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findUser).toHaveBeenCalledWith({user_id: ACTOR.user_id});
            expect(repo.updateUser).toHaveBeenCalledTimes(1);
            expect(repo.updateUser).toHaveBeenCalledWith(
                {user_id: ACTOR.user_id},
                {state_id: 'LEAVE_WAIT', leave_previous_state_id: state_id, leave_comment: '이용 빈도 낮음', leave_reserved_at: '2026-01-15 00:00:00'},
            );
        });

        it('탈퇴 사유가 없으면 null 로 저장', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, state_id: 'ACTIVE'});

            await runCommand(dispatcher, {type: USER_COMMAND.LEAVE, payload: {}, actor: ACTOR});

            expect(repo.updateUser.mock.calls[0][1].leave_comment).toBeNull();
        });
    });

    describe('[FAIL:service]', () => {
        it('actor 가 없으면 failed 401, 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.LEAVE, payload: {}, actor: null});

            expect(result?.error).toEqual({status_code: 401, body: {message: '로그인이 필요합니다.', validation_errors: null}});
            expect(repo.findUser).not.toHaveBeenCalled();
        });

        it('회원이 없으면 failed 404', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.LEAVE, payload: {}, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '일치하는 회원이 없습니다.', validation_errors: null}});
            expect(repo.updateUser).not.toHaveBeenCalled();
        });

        it.each(['LEAVE_WAIT', 'LEAVE'])('이미 %s 면 failed 400', async (state_id) => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, state_id});

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.LEAVE, payload: {}, actor: ACTOR});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: '탈퇴를 신청할 수 없는 상태입니다.', validation_errors: null}});
            expect(repo.updateUser).not.toHaveBeenCalled();
        });
    });
});
