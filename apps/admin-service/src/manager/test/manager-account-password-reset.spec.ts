import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {temporaryPasswordText} from '@app/account/utils/password.js';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {ManagerAccountPasswordResetParamDto} from '@app/contracts/manager/dto/manager-account-password-reset.dto.js';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    accountRow,
    bootCommandPath,
    createJwtServiceMock,
    createManagerRepositoryMock,
    createSmsSenderMock,
    ManagerRepositoryMock,
    runCommand,
    SmsSenderMock,
    STAFF_ID,
    validateBody,
} from './manager.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));

const PAYLOAD = {user_id: STAFF_ID};

/** 로그인 총관리자 (게이트웨이 관리자 가드를 통과한 actor) */
const ADMIN_ACTOR = {user_id: 'd'.repeat(32), auth_id: 'SUPER_ADMIN'};

describe('admin.manager.account-password-reset — 업체 관리자 비밀번호 초기화 (총관리자 · 관리자, 큐 경로)', () => {
    let repo: ManagerRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createManagerRepositoryMock();
        sms = createSmsSenderMock();
        vi.mocked(getBcrypt).mockResolvedValue('hashed-temp-password');
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r'), sms));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 비밀번호 초기화 1건
     *
     * @returns 판정 · 결과
     */
    function runReset() {
        return runCommand(dispatcher, {type: MANAGER_COMMAND.ACCOUNT_PASSWORD_RESET, payload: PAYLOAD, actor: ADMIN_ACTOR});
    }

    describe('[SUCCESS]', () => {
        it.each([
            ['업체 관리자', accountRow()],
            ['정지된 업체 총관리자(로그인은 여전히 막힘)', accountRow({auth_id: 'HEAD_MANAGER', state_id: 'BLOCK'})],
            ['영업중지 업체의 계정', accountRow({store_state_id: 'SUSPEND'})],
        ])('%s — 임시 비밀번호(해시) + 변경 필요 표시, 그 휴대폰으로 임시 비밀번호 SMS(마지막)', async (_label, row) => {
            repo.findAccountRow.mockResolvedValueOnce(row);

            const {decision, result} = await runReset();

            expect(decision.action).toBe('ack');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findAccountRow).toHaveBeenCalledWith(STAFF_ID);
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
        it.each([
            ['계정 없음(삭제 · 다른 그룹)', null, 404, '업체 관리자를 찾을 수 없습니다.'],
            ['탈퇴 업체의 계정', accountRow({store_state_id: 'LEAVE', state_id: 'BLOCK'}), 400, '탈퇴한 업체의 계정입니다.'],
            ['휴대폰 번호 없음', accountRow({phone: null}), 400, '휴대폰 번호가 등록되지 않은 계정입니다.'],
        ])('%s → %s, 비밀번호 쓰기 · SMS 없음', async (_label, row, status_code, message) => {
            repo.findAccountRow.mockResolvedValueOnce(row);

            const {decision, result} = await runReset();

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code, body: {message, validation_errors: null}});
            expect(repo.updateManager).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:external]', () => {
        it('SMS 503 → 재시도(requeue)', async () => {
            repo.findAccountRow.mockResolvedValueOnce(accountRow());
            sms.send.mockRejectedValueOnce(new ServiceUnavailableException({message: 'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runReset();

            expect(decision.action).toBe('requeue');
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('회원 ID 가 32자 hex 가 아니면 → user_id', async () => {
            await expect(validateBody(ManagerAccountPasswordResetParamDto, {user_id: 'xyz'})).resolves.toEqual({
                message: '회원 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'user_id', message: '회원 ID가 올바르지 않습니다.'}],
            });
        });
    });
});
