import type {TestingModule} from '@nestjs/testing';
import {In, MoreThanOrEqual} from 'typeorm';
import {sha256Hex} from '@app/common/utils/hash.js';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import type {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {kstDayStart} from '../user.util.js';
import {bootCommandPath, createJwtServiceMock, createSmsSenderMock, createUserRepositoryMock, FIXED_TIME, runCommand, SmsSenderMock, UserRepositoryMock} from './user.test-helper.js';

vi.mock(import('../user.util.js'), async (importOriginal) => ({...(await importOriginal()), generateVerificationCode: vi.fn(() => '123456')}));

const USER_ID = 'u'.repeat(32);
const PHONE = '01012345678';
const CREATED_AT = new Date(2025, 5, 1, 9, 30);
const RECOVERY_STATES = In(['ACTIVE', 'BLOCK', 'LEAVE_WAIT']);
const PAYLOAD = {sms_verification_id: 'v'.repeat(32), code: '123456'};

/**
 * 아이디 찾기 인증 기록 — 사용 가능(만료 1분 전 · 미인증).
 *
 * @returns 인증 기록
 */
function verification(): Partial<SmsVerificationEntity> {
    return {
        sms_verification_id: PAYLOAD.sms_verification_id,
        sms_purpose_id: 'FIND_LOGIN_ID',
        user_id: USER_ID,
        phone: PHONE,
        code_hash: sha256Hex('123456'),
        attempt_count: 0,
        expires_at: new Date(FIXED_TIME.getTime() + 60 * 1000),
        verified_at: null,
    };
}

describe('아이디 찾기 (큐 경로)', () => {
    let repo: UserRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        repo = createUserRepositoryMock();
        sms = createSmsSenderMock();
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r'), sms));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    describe('user.member.find-login-id — 인증번호 발송', () => {
        it('[SUCCESS] 그 번호의 회원 기록을 남기고 SMS 를 보낸 뒤 인증 ID · 만료 시각', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: USER_ID});
            repo.countSmsVerifications.mockResolvedValueOnce(0);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.FIND_LOGIN_ID, payload: {phone: PHONE}});

            expect(repo.findUser).toHaveBeenCalledWith({phone: PHONE, state_id: RECOVERY_STATES});
            expect(repo.countSmsVerifications).toHaveBeenCalledWith({phone: PHONE, created_at: MoreThanOrEqual(kstDayStart(FIXED_TIME))});
            const inserted = repo.insertSmsVerification.mock.calls[0][0];
            expect(inserted).toMatchObject({sms_purpose_id: 'FIND_LOGIN_ID', user_id: USER_ID, phone: PHONE, code_hash: sha256Hex('123456')});
            expect(sms.send).toHaveBeenCalledWith({to: PHONE, text: '[roomless] 인증번호 [123456] — 5분 안에 입력해주세요.'});
            expect(result).toEqual({result: {sms_verification_id: inserted.sms_verification_id, expires_at: new Date(FIXED_TIME.getTime() + 5 * 60 * 1000).toISOString()}, error: null});
        });

        it('[FAIL:service] 그 번호로 가입한 회원이 없으면 404, 기록 · 발송 없음', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.FIND_LOGIN_ID, payload: {phone: PHONE}});

            expect(result?.error).toEqual({status_code: 404, body: {message: '일치하는 회원 정보가 없습니다.', validation_errors: null}});
            expect(repo.insertSmsVerification).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('[FAIL:business] 오늘 이미 10건이면 429, 기록 · 발송 없음', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: USER_ID});
            repo.countSmsVerifications.mockResolvedValueOnce(10);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.FIND_LOGIN_ID, payload: {phone: PHONE}});

            expect(result?.error?.status_code).toBe(429);
            expect(repo.insertSmsVerification).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });
    });

    describe('user.member.find-login-id-confirm — 인증번호 확인', () => {
        it('[SUCCESS] 일반 계정은 아이디 · 가입일시', async () => {
            repo.findSmsVerification.mockResolvedValueOnce(verification());
            repo.findUser.mockResolvedValueOnce({user_id: USER_ID, login_id: 'roomless_01', sns_id: null, created_at: CREATED_AT});
            repo.consumeSmsVerificationAttempt.mockResolvedValueOnce(true);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.FIND_LOGIN_ID_CONFIRM, payload: PAYLOAD});

            expect(result).toEqual({result: {login_id: 'roomless_01', sns_id: null, created_at: CREATED_AT.toISOString()}, error: null});
            expect(repo.findSmsVerification).toHaveBeenCalledWith({sms_verification_id: PAYLOAD.sms_verification_id, sms_purpose_id: 'FIND_LOGIN_ID'});
            expect(repo.findUser).toHaveBeenCalledWith({user_id: USER_ID, state_id: RECOVERY_STATES});
            expect(repo.consumeSmsVerificationAttempt).toHaveBeenCalledWith(PAYLOAD.sms_verification_id, 3);
            expect(repo.updateSmsVerification).toHaveBeenCalledWith({sms_verification_id: PAYLOAD.sms_verification_id}, {verified_at: FIXED_TIME});
        });

        it('[SUCCESS] SNS 계정은 자동 생성 아이디 대신 가입한 SNS · 가입일시', async () => {
            repo.findSmsVerification.mockResolvedValueOnce(verification());
            repo.findUser.mockResolvedValueOnce({user_id: USER_ID, login_id: 'KAKAO_20250601093000000', sns_id: 'KAKAO', created_at: CREATED_AT});
            repo.consumeSmsVerificationAttempt.mockResolvedValueOnce(true);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.FIND_LOGIN_ID_CONFIRM, payload: PAYLOAD});

            expect(result).toEqual({result: {login_id: null, sns_id: 'KAKAO', created_at: CREATED_AT.toISOString()}, error: null});
        });

        it('[FAIL:service] 인증 ID 의 기록이 없으면 404, 시도 소비 없음', async () => {
            repo.findSmsVerification.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.FIND_LOGIN_ID_CONFIRM, payload: PAYLOAD});

            expect(result?.error).toEqual({status_code: 404, body: {message: '인증 정보를 찾을 수 없습니다. 인증번호를 다시 요청해주세요.', validation_errors: null}});
            expect(repo.consumeSmsVerificationAttempt).not.toHaveBeenCalled();
        });

        it('[FAIL:service] 그 기록의 회원이 탈퇴 완료면 404, 시도 소비 없음', async () => {
            repo.findSmsVerification.mockResolvedValueOnce(verification());
            repo.findUser.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.FIND_LOGIN_ID_CONFIRM, payload: PAYLOAD});

            expect(result?.error).toEqual({status_code: 404, body: {message: '일치하는 회원 정보가 없습니다.', validation_errors: null}});
            expect(repo.consumeSmsVerificationAttempt).not.toHaveBeenCalled();
        });

        it('[FAIL:validation] 인증번호가 다르면 400, 인증 완료 없음', async () => {
            repo.findSmsVerification.mockResolvedValueOnce(verification());
            repo.findUser.mockResolvedValueOnce({user_id: USER_ID, login_id: 'roomless_01', sns_id: null, created_at: CREATED_AT});
            repo.consumeSmsVerificationAttempt.mockResolvedValueOnce(true);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.FIND_LOGIN_ID_CONFIRM, payload: {...PAYLOAD, code: '000000'}});

            expect(result?.error?.status_code).toBe(400);
            expect(result?.error?.body.validation_errors).toEqual([{property: 'code', message: '인증번호가 일치하지 않습니다.'}]);
            expect(repo.updateSmsVerification).not.toHaveBeenCalled();
        });
    });
});
