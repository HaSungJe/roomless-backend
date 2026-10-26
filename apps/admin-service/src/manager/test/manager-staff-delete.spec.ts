import type {TestingModule} from '@nestjs/testing';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createJwtServiceMock, createManagerRepositoryMock, HEAD_ACTOR, headManagerRow, ManagerRepositoryMock, runCommand, STAFF_ID, staffRow} from './manager.test-helper.js';

describe('admin.manager.staff-delete — 업체 관리자 삭제 (큐 경로)', () => {
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
        it('탈퇴(LEAVE) + 원본 백업 + 아이디 DEL_<user_id> · 번호 NULL 마스킹(같은 아이디 · 번호 재등록 가능) · 기기 정보 삭제', async () => {
            const staff = staffRow();
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(staff);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_DELETE, payload: {user_id: STAFF_ID}, actor: HEAD_ACTOR});

            expect(result).toEqual({result: null, error: null});
            const [where, entity] = repo.updateStaff.mock.calls[0] as [unknown, UserEntity];
            expect(where).toEqual({user_id: STAFF_ID});
            expect(entity).toBeInstanceOf(UserEntity);
            expect(entity).toMatchObject({state_id: 'LEAVE', login_id: `DEL_${STAFF_ID}`, phone: null, device_os: null, device_token: null});
            expect(JSON.parse(entity.leave_backup as string)).toMatchObject({login_id: 'staff01', phone: '01022223333'});
        });
    });

    describe('[FAIL:service]', () => {
        it('대상이 없으면(다른 업체 · 자신 · 이미 삭제) failed 404, 변경 없음', async () => {
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_DELETE, payload: {user_id: STAFF_ID}, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '업체 관리자를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateStaff).not.toHaveBeenCalled();
        });
    });
});
