import type {TestingModule} from '@nestjs/testing';
import {In} from 'typeorm';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {sha256Hex} from '@app/common/utils/hash.js';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import type {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createJwtServiceMock, createManagerRepositoryMock, createSmsSenderMock, FIXED_TIME, ManagerRepositoryMock, runCommand, SmsSenderMock} from './manager.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));
vi.mock(import('@app/account/utils/sms-verification.js'), async (importOriginal) => ({...(await importOriginal()), generateVerificationCode: vi.fn(() => '123456')}));
vi.mock(import('@app/account/utils/password.js'), async (importOriginal) => ({...(await importOriginal()), generateTemporaryPassword: vi.fn(() => 'Abc123def4')}));

const USER_ID = 'u'.repeat(32);
const PHONE = '01012345678';
const RECOVERY_STATES = In(['ACTIVE', 'BLOCK', 'LEAVE_WAIT']);
const PAYLOAD = {sms_verification_id: 'v'.repeat(32), code: '123456'};

/**
 * 비밀번호 초기화 인증 기록 — 사용 가능(만료 1분 전 · 미인증).
 *
 * @returns 인증 기록
 */
function verification(): Partial<SmsVerificationEntity> {
    return {
        sms_verification_id: PAYLOAD.sms_verification_id,
        sms_purpose_id: 'PASSWORD_RESET',
        user_id: USER_ID,
        phone: PHONE,
        code_hash: sha256Hex('123456'),
        attempt_count: 0,
        expires_at: new Date(FIXED_TIME.getTime() + 60 * 1000),
        verified_at: null,
    };
}

describe('매니저 비밀번호 초기화 (큐 경로)', () => {
    let repo: ManagerRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        repo = createManagerRepositoryMock();
        sms = createSmsSenderMock();
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r'), sms));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    describe('admin.manager.password-reset — 인증번호 발송', () => {
        it('[SUCCESS] 아이디 + 번호가 같은 매니저이면 기록을 남기고 SMS 를 보낸 뒤 인증 ID · 만료 시각', async () => {
            repo.findManager.mockResolvedValueOnce({user_id: USER_ID});
            repo.countSmsVerifications.mockResolvedValueOnce(0);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.PASSWORD_RESET, payload: {login_id: 'manager_01', phone: PHONE}});

            expect(repo.findManager).toHaveBeenCalledTimes(1);
            expect(repo.findManager).toHaveBeenCalledWith({login_id: 'manager_01', phone: PHONE, login_scope: 'MANAGER', state_id: RECOVERY_STATES});
            const inserted = repo.insertSmsVerification.mock.calls[0][0];
            expect(inserted).toMatchObject({sms_purpose_id: 'PASSWORD_RESET', user_id: USER_ID, phone: PHONE});
            expect(sms.send).toHaveBeenCalledWith({to: PHONE, text: '[roomless] 인증번호 [123456] — 5분 안에 입력해주세요.'});
            expect(result).toEqual({result: {sms_verification_id: inserted.sms_verification_id, expires_at: new Date(FIXED_TIME.getTime() + 5 * 60 * 1000).toISOString()}, error: null});
        });

        it('[FAIL:service] 아이디 + 번호가 같은 매니저가 없으면(이용자 · 관리자 포함) 404, 기록 · 발송 없음', async () => {
            repo.findManager.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.PASSWORD_RESET, payload: {login_id: 'manager_01', phone: PHONE}});

            expect(result?.error).toEqual({status_code: 404, body: {message: '일치하는 회원 정보가 없습니다.', validation_errors: null}});
            expect(repo.countSmsVerifications).not.toHaveBeenCalled();
            expect(repo.insertSmsVerification).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('[FAIL:business] 오늘 이미 10건이면 429, 발송 없음', async () => {
            repo.findManager.mockResolvedValueOnce({user_id: USER_ID});
            repo.countSmsVerifications.mockResolvedValueOnce(10);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.PASSWORD_RESET, payload: {login_id: 'manager_01', phone: PHONE}});

            expect(result?.error?.status_code).toBe(429);
            expect(sms.send).not.toHaveBeenCalled();
        });
    });

    describe('admin.manager.password-reset-confirm — 인증번호 확인', () => {
        it('[SUCCESS] 임시 비밀번호로 바꾸고 변경 필요 표시 후, 그 기록의 번호로 SMS 를 마지막에 보낸다', async () => {
            repo.findSmsVerification.mockResolvedValueOnce(verification());
            repo.findManager.mockResolvedValueOnce({user_id: USER_ID});
            repo.consumeSmsVerificationAttempt.mockResolvedValueOnce(true);
            vi.mocked(getBcrypt).mockResolvedValueOnce('$2b$12$temp');

            const {decision, result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.PASSWORD_RESET_CONFIRM, payload: PAYLOAD});

            expect(decision.action).toBe('ack');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findSmsVerification).toHaveBeenCalledWith({sms_verification_id: PAYLOAD.sms_verification_id, sms_purpose_id: 'PASSWORD_RESET'});
            expect(repo.findManager).toHaveBeenCalledWith({user_id: USER_ID, login_scope: 'MANAGER', state_id: RECOVERY_STATES});
            expect(repo.updateSmsVerification).toHaveBeenCalledWith({sms_verification_id: PAYLOAD.sms_verification_id}, {verified_at: FIXED_TIME});
            expect(getBcrypt).toHaveBeenCalledWith('Abc123def4');
            expect(repo.updateManager).toHaveBeenCalledWith({user_id: USER_ID}, {login_pw: '$2b$12$temp', is_password_change_required: 1});
            expect(sms.send).toHaveBeenCalledWith({to: PHONE, text: '[roomless] 임시 비밀번호 Abc123def4 — 로그인 후 비밀번호를 바꿔주세요.'});
            expect(repo.updateManager.mock.invocationCallOrder[0]).toBeLessThan(sms.send.mock.invocationCallOrder[0]);
        });

        it('[FAIL:service] 인증 ID 의 기록이 없으면 404, 회원 조회 · 시도 소비 없음', async () => {
            repo.findSmsVerification.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.PASSWORD_RESET_CONFIRM, payload: PAYLOAD});

            expect(result?.error?.status_code).toBe(404);
            expect(repo.findManager).not.toHaveBeenCalled();
            expect(repo.consumeSmsVerificationAttempt).not.toHaveBeenCalled();
        });

        it('[FAIL:service] 그 기록의 회원이 탈퇴 완료 · 매니저 그룹이 아니면 404, 시도 소비 없음', async () => {
            repo.findSmsVerification.mockResolvedValueOnce(verification());
            repo.findManager.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.PASSWORD_RESET_CONFIRM, payload: PAYLOAD});

            expect(result?.error).toEqual({status_code: 404, body: {message: '일치하는 회원 정보가 없습니다.', validation_errors: null}});
            expect(repo.consumeSmsVerificationAttempt).not.toHaveBeenCalled();
        });

        it('[FAIL:validation] 인증번호가 다르면 400, 비밀번호 변경 · 발송 없음', async () => {
            repo.findSmsVerification.mockResolvedValueOnce(verification());
            repo.findManager.mockResolvedValueOnce({user_id: USER_ID});
            repo.consumeSmsVerificationAttempt.mockResolvedValueOnce(true);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.PASSWORD_RESET_CONFIRM, payload: {...PAYLOAD, code: '000000'}});

            expect(result?.error?.status_code).toBe(400);
            expect(getBcrypt).not.toHaveBeenCalled();
            expect(repo.updateManager).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });
    });
});
