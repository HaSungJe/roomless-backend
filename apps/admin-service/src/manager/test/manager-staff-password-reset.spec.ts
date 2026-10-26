import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {temporaryPasswordText} from '@app/account/utils/password.js';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createJwtServiceMock,
    createManagerRepositoryMock,
    createSmsSenderMock,
    HEAD_ACTOR,
    headManagerRow,
    ManagerRepositoryMock,
    runCommand,
    SmsSenderMock,
    STAFF_ID,
    staffRow,
} from './manager.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));

const PAYLOAD = {user_id: STAFF_ID};

describe('admin.manager.staff-password-reset — 업체 관리자 비밀번호 초기화 (큐 경로)', () => {
    let repo: ManagerRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createManagerRepositoryMock();
        sms = createSmsSenderMock();
        repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(staffRow());
        vi.mocked(getBcrypt).mockResolvedValue('hashed-temp-password');
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r'), sms));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('임시 비밀번호(해시) + 변경 필요 표시로 바꾸고, 업체 관리자 휴대폰으로 임시 비밀번호 SMS(마지막)', async () => {
            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_PASSWORD_RESET, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result).toEqual({result: null, error: null});
            const [where, entity] = repo.updateManager.mock.calls[0] as [unknown, UserEntity];
            expect(where).toEqual({user_id: STAFF_ID});
            expect(entity).toBeInstanceOf(UserEntity);
            expect(entity).toMatchObject({login_pw: 'hashed-temp-password', is_password_change_required: 1});
            const temporaryPassword = vi.mocked(getBcrypt).mock.calls[0][0];
            expect(temporaryPassword).toMatch(/^[a-zA-Z0-9]{10}$/);
            expect(sms.send).toHaveBeenCalledWith({to: '01022223333', text: temporaryPasswordText(temporaryPassword)});
            expect(repo.updateManager.mock.invocationCallOrder[0]).toBeLessThan(sms.send.mock.invocationCallOrder[0]);
        });
    });

    describe('[FAIL:service]', () => {
        it('대상이 없으면 failed 404, 변경 · SMS 없음', async () => {
            repo.findManager.mockReset();
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_PASSWORD_RESET, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '업체 관리자를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateManager).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('휴대폰 번호가 없는 계정이면 failed 400, 변경 · SMS 없음', async () => {
            repo.findManager.mockReset();
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(staffRow({phone: null}));

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_PASSWORD_RESET, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '휴대폰 번호가 등록되지 않은 계정입니다.', validation_errors: null}});
            expect(repo.updateManager).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:infra]', () => {
        it('SMS 503 은 재시도(requeue)', async () => {
            sms.send.mockRejectedValueOnce(new ServiceUnavailableException({message: 'SMS 발송을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_PASSWORD_RESET, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(decision.action).toBe('requeue');
        });
    });
});
