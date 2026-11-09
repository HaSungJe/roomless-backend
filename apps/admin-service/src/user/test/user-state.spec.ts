import type {TestingModule} from '@nestjs/testing';
import {UserStateDto, UserStateParamDto} from '@app/contracts/user/dto/user-state.dto.js';
import {USER_ADMIN_COMMAND} from '@app/contracts/user/user.commands.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createUserRepositoryMock, runCommand, USER_ID, userRow, UserRepositoryMock, validateBody} from './user.test-helper.js';

describe('admin.user.state — 이용자 이용 제한 · 해제 (큐 경로)', () => {
    let repo: UserRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createUserRepositoryMock();
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 이용 제한 · 해제 1건
     *
     * @param payload path param + 본문
     * @returns 판정 · 결과
     */
    function runState(payload: Record<string, unknown>) {
        return runCommand(dispatcher, {type: USER_ADMIN_COMMAND.STATE, payload: {user_id: USER_ID, ...payload}});
    }

    describe('[CASES:member-state] 관리자 이용 제한 · 해제 — 정상 ↔ 이용 제한만 (사용자 결정 2026-11-09)', () => {
        it.each([
            ['정상 → 이용 제한(사유 저장)', 'ACTIVE', {state_id: 'BLOCK', block_comment: '부정 이용'}, {state_id: 'BLOCK', block_comment: '부정 이용'}],
            ['정상 → 이용 제한(사유 없음 → null)', 'ACTIVE', {state_id: 'BLOCK'}, {state_id: 'BLOCK', block_comment: null}],
            ['이용 제한 → 해제(사유를 보내도 지운다)', 'BLOCK', {state_id: 'ACTIVE', block_comment: '무시'}, {state_id: 'ACTIVE', block_comment: null}],
        ])('%s', async (_label, current, body, expected) => {
            repo.findUser.mockResolvedValueOnce(userRow({state_id: current, block_comment: current === 'BLOCK' ? '부정 이용' : null}));

            const {decision, result} = await runState(body);

            expect(decision.action).toBe('ack');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findUser).toHaveBeenCalledWith({user_id: USER_ID, login_scope: 'USER'});
            expect(repo.updateUser).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateUser.mock.calls[0] as [unknown, UserEntity];
            expect(where).toEqual({user_id: USER_ID, login_scope: 'USER', state_id: current});
            expect(entity).toBeInstanceOf(UserEntity);
            expect({state_id: entity.state_id, block_comment: entity.block_comment}).toEqual(expected);
        });

        it.each([
            ['같은 상태(정상 → 정상)', 'ACTIVE', 'ACTIVE', '이미 같은 상태입니다.'],
            ['같은 상태(이용 제한 → 이용 제한)', 'BLOCK', 'BLOCK', '이미 같은 상태입니다.'],
            ['탈퇴 대기 회원', 'LEAVE_WAIT', 'BLOCK', '탈퇴 대기 · 탈퇴 회원은 상태를 바꿀 수 없습니다.'],
            ['탈퇴 회원', 'LEAVE', 'ACTIVE', '탈퇴 대기 · 탈퇴 회원은 상태를 바꿀 수 없습니다.'],
        ])('%s → 400, 쓰기 없음', async (_label, current, next, message) => {
            repo.findUser.mockResolvedValueOnce(userRow({state_id: current}));

            const {decision, result} = await runState({state_id: next});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: null}});
            expect(repo.updateUser).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('이용자 그룹 회원이 아니면(없음 · 매니저 회원 ID — 조회 조건 login_scope USER) 404, 쓰기 없음', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const {result} = await runState({state_id: 'BLOCK'});

            expect(result?.error).toEqual({status_code: 404, body: {message: '이용자를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateUser).not.toHaveBeenCalled();
        });

        it('그 사이 상태가 바뀌었으면(탈퇴 신청 등 — 상태 조건 0행) 400 롤백', async () => {
            repo.findUser.mockResolvedValueOnce(userRow());
            repo.updateUser.mockResolvedValueOnce(false);

            const {result} = await runState({state_id: 'BLOCK'});

            expect(result?.error).toEqual({status_code: 400, body: {message: '회원 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('상태가 허용값 밖(LEAVE)이면 → state_id', async () => {
            await expect(validateBody(UserStateDto, {state_id: 'LEAVE'})).resolves.toEqual({
                message: '상태가 올바르지 않습니다.',
                validation_errors: [{property: 'state_id', message: '상태가 올바르지 않습니다.'}],
            });
        });

        it('이용 제한 사유가 255자를 넘으면 → block_comment', async () => {
            await expect(validateBody(UserStateDto, {state_id: 'BLOCK', block_comment: '가'.repeat(256)})).resolves.toEqual({
                message: '이용 제한 사유는 255자 이내로 입력해주세요.',
                validation_errors: [{property: 'block_comment', message: '이용 제한 사유는 255자 이내로 입력해주세요.'}],
            });
        });

        it('회원 ID 가 32자 hex 가 아니면 → user_id', async () => {
            await expect(validateBody(UserStateParamDto, {user_id: 'xyz'})).resolves.toEqual({
                message: '회원 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'user_id', message: '회원 ID가 올바르지 않습니다.'}],
            });
        });
    });
});
