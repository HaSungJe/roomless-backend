import type {TestingModule} from '@nestjs/testing';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createJwtServiceMock, createManagerRepositoryMock, HEAD_ACTOR, headManagerRow, ManagerRepositoryMock, runCommand, STAFF_ID, staffRow} from './manager.test-helper.js';

describe('admin.manager.staff-state — 업체 관리자 정지 · 해제 (큐 경로)', () => {
    let repo: ManagerRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createManagerRepositoryMock();
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r')));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('정상 → 정지: 상태 BLOCK + 정지 사유', async () => {
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(staffRow());

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_STATE, payload: {user_id: STAFF_ID, state_id: 'BLOCK', block_comment: '근무 종료'}, actor: HEAD_ACTOR});

            expect(result).toEqual({result: null, error: null});
            const [where, entity] = repo.updateManager.mock.calls[0] as [unknown, UserEntity];
            expect(where).toEqual({user_id: STAFF_ID});
            expect(entity).toBeInstanceOf(UserEntity);
            expect(entity).toMatchObject({state_id: 'BLOCK', block_comment: '근무 종료'});
        });

        it('사유 없이 정지하면 정지 사유 null', async () => {
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(staffRow());

            await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_STATE, payload: {user_id: STAFF_ID, state_id: 'BLOCK'}, actor: HEAD_ACTOR});

            expect(repo.updateManager.mock.calls[0][1]).toMatchObject({state_id: 'BLOCK', block_comment: null});
        });

        it('정지 → 해제: 상태 ACTIVE + 정지 사유를 지운다(사유를 보내도 남기지 않는다)', async () => {
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(staffRow({state_id: 'BLOCK', block_comment: '근무 종료'}));

            await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_STATE, payload: {user_id: STAFF_ID, state_id: 'ACTIVE', block_comment: '무시'}, actor: HEAD_ACTOR});

            expect(repo.updateManager.mock.calls[0][1]).toMatchObject({state_id: 'ACTIVE', block_comment: null});
        });
    });

    describe('[FAIL:service]', () => {
        it('같은 상태로 바꾸면 failed 400, 변경 없음', async () => {
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(staffRow({state_id: 'BLOCK'}));

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_STATE, payload: {user_id: STAFF_ID, state_id: 'BLOCK'}, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 같은 상태입니다.', validation_errors: null}});
            expect(repo.updateManager).not.toHaveBeenCalled();
        });

        it('대상이 없으면(다른 업체 · 자신 · 삭제) failed 404, 변경 없음', async () => {
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_STATE, payload: {user_id: STAFF_ID, state_id: 'BLOCK'}, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '업체 관리자를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateManager).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_STATE, payload: {user_id: STAFF_ID, state_id: 'BLOCK'}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManager).not.toHaveBeenCalled();
        });
    });
});
