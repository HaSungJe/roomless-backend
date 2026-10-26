import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {MoreThanOrEqual} from 'typeorm';
import {sha256Hex} from '@app/common/utils/hash.js';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createJwtServiceMock, createSmsSenderMock, createUserRepositoryMock, FIXED_TIME, ID_PATTERN, runCommand, SmsSenderMock, UserRepositoryMock} from './user.test-helper.js';

vi.mock(import('@app/account/utils/sms-verification.js'), async (importOriginal) => ({...(await importOriginal()), generateVerificationCode: vi.fn(() => '123456')}));

const ACTOR = {user_id: 'u'.repeat(32), auth_id: 'USER'};
const PHONE = '01012345678';
const SMS_UNAVAILABLE = 'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.';

/**
 * 휴대폰 인증 기록 — 기본은 사용 가능(만료 1분 전 · 미인증).
 *
 * @param fields 덮어쓸 값
 * @returns 인증 기록
 */
function verification(fields: Partial<SmsVerificationEntity> = {}): Partial<SmsVerificationEntity> {
    return {
        sms_verification_id: 'v'.repeat(32),
        sms_purpose_id: 'PHONE_VERIFY',
        user_id: ACTOR.user_id,
        phone: PHONE,
        code_hash: sha256Hex('123456'),
        attempt_count: 0,
        expires_at: new Date(FIXED_TIME.getTime() + 60 * 1000),
        verified_at: null,
        ...fields,
    };
}

describe('휴대폰 SMS 인증 (큐 경로)', () => {
    let repo: UserRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;
    const savedLimit = process.env.SMS_VERIFICATION_DAILY_LIMIT;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(FIXED_TIME);
        delete process.env.SMS_VERIFICATION_DAILY_LIMIT;
        repo = createUserRepositoryMock();
        sms = createSmsSenderMock();
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r'), sms));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        if (savedLimit === undefined) {
            delete process.env.SMS_VERIFICATION_DAILY_LIMIT;
        } else {
            process.env.SMS_VERIFICATION_DAILY_LIMIT = savedLimit;
        }
        await module.close();
    });

    describe('user.member.phone-verification — 인증번호 발송', () => {
        it('[SUCCESS] 기록을 남기고 SMS 를 마지막에 보낸 뒤 인증 ID · 만료 시각을 돌려준다', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, phone_verified_at: null, login_scope: 'USER'}).mockResolvedValueOnce(null);
            repo.countSmsVerifications.mockResolvedValueOnce(9);

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION, payload: {phone: PHONE}, actor: ACTOR});

            expect(decision.action).toBe('ack');
            expect(repo.findUser).toHaveBeenNthCalledWith(1, {user_id: ACTOR.user_id});
            expect(repo.findUser).toHaveBeenNthCalledWith(2, {phone: PHONE, login_scope: 'USER'});
            // 하루 발송 수는 한국 날짜 0시부터 센다 — FIXED_TIME(2026-01-01)의 한국 0시 = 2025-12-31T15:00Z
            expect(repo.countSmsVerifications).toHaveBeenCalledWith({phone: PHONE, created_at: MoreThanOrEqual(new Date('2025-12-31T15:00:00.000Z'))});
            expect(repo.insertSmsVerification).toHaveBeenCalledTimes(1);
            const inserted = repo.insertSmsVerification.mock.calls[0][0];
            expect(inserted).toBeInstanceOf(SmsVerificationEntity);
            expect(inserted).toEqual({
                sms_verification_id: expect.stringMatching(ID_PATTERN),
                sms_purpose_id: 'PHONE_VERIFY',
                user_id: ACTOR.user_id,
                phone: PHONE,
                code_hash: sha256Hex('123456'),
                attempt_count: 0,
                expires_at: new Date(FIXED_TIME.getTime() + 5 * 60 * 1000),
                verified_at: null,
                ip: '10.0.0.1',
            });
            expect(sms.send).toHaveBeenCalledTimes(1);
            expect(sms.send).toHaveBeenCalledWith({to: PHONE, text: '[roomless] 인증번호 [123456] — 5분 안에 입력해주세요.'});
            expect(repo.insertSmsVerification.mock.invocationCallOrder[0]).toBeLessThan(sms.send.mock.invocationCallOrder[0]);
            expect(result).toEqual({result: {sms_verification_id: inserted.sms_verification_id, expires_at: new Date(FIXED_TIME.getTime() + 5 * 60 * 1000).toISOString()}, error: null});
        });

        it('[FAIL:service] 이미 인증한 회원은 400, 발송 없음', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, phone_verified_at: new Date(2025, 11, 1)});

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION, payload: {phone: PHONE}, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 휴대폰 인증을 마쳤습니다.', validation_errors: null}});
            expect(repo.countSmsVerifications).not.toHaveBeenCalled();
            expect(repo.insertSmsVerification).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('[FAIL:duplicate] 다른 계정이 인증한 번호는 400 + phone 입력 오류, 발송 없음', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, phone_verified_at: null, login_scope: 'USER'}).mockResolvedValueOnce({user_id: 'o'.repeat(32)});

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION, payload: {phone: PHONE}, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 가입된 번호입니다.', validation_errors: [{property: 'phone', message: '이미 가입된 번호입니다.'}]}});
            expect(repo.insertSmsVerification).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it.each([
            [undefined, 10],
            ['3', 3],
        ])('[FAIL:business] 한도 env %s — 오늘 %i건 보냈으면 429, 기록 · 발송 없음', async (limit, sent) => {
            if (limit !== undefined) process.env.SMS_VERIFICATION_DAILY_LIMIT = limit;
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, phone_verified_at: null, login_scope: 'USER'}).mockResolvedValueOnce(null);
            repo.countSmsVerifications.mockResolvedValueOnce(sent);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION, payload: {phone: PHONE}, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 429, body: {message: '오늘은 이 번호로 인증번호를 더 보낼 수 없습니다. 내일 다시 시도해주세요.', validation_errors: null}});
            expect(repo.insertSmsVerification).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('[FAIL:service] 회원이 없으면 404', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION, payload: {phone: PHONE}, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '회원 정보를 찾을 수 없습니다.', validation_errors: null}});
            expect(sms.send).not.toHaveBeenCalled();
        });

        it('[FAIL:infra] SMS 발송이 503 이면 재시도(requeue), 마지막 시도면 failed 503 + dead', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, phone_verified_at: null, login_scope: 'USER'}).mockResolvedValueOnce(null);
            repo.countSmsVerifications.mockResolvedValue(0);
            sms.send.mockRejectedValue(new ServiceUnavailableException({message: SMS_UNAVAILABLE}));

            const first = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION, payload: {phone: PHONE}, actor: ACTOR});
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, phone_verified_at: null, login_scope: 'USER'}).mockResolvedValueOnce(null);
            const last = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION, payload: {phone: PHONE}, actor: ACTOR, delivery_count: 3});

            expect(first.decision.action).toBe('requeue');
            expect(last.decision.action).toBe('dead');
            expect(last.result?.error).toEqual({status_code: 503, body: {message: SMS_UNAVAILABLE, validation_errors: null}});
        });

        it('[FAIL:auth] actor 없는 명령은 401, 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION, payload: {phone: PHONE}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findUser).not.toHaveBeenCalled();
        });
    });

    describe('user.member.phone-verification-confirm — 인증번호 확인', () => {
        const PAYLOAD = {sms_verification_id: 'v'.repeat(32), code: '123456'};

        /** 확인 전 회원 · 인증 기록을 준비한다 */
        function arrange(record: Partial<SmsVerificationEntity> | null = verification(), consumed = true): void {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, phone_verified_at: null, login_scope: 'USER'});
            repo.findSmsVerification.mockResolvedValueOnce(record);
            repo.consumeSmsVerificationAttempt.mockResolvedValueOnce(consumed);
        }

        it('[SUCCESS] 시도 1회를 소비하고 일치하면 인증 완료 + 그 기록의 번호를 회원정보에 저장', async () => {
            arrange();

            const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION_CONFIRM, payload: PAYLOAD, actor: ACTOR});

            expect(decision.action).toBe('ack');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findSmsVerification).toHaveBeenCalledWith({sms_verification_id: PAYLOAD.sms_verification_id, sms_purpose_id: 'PHONE_VERIFY', user_id: ACTOR.user_id});
            expect(repo.consumeSmsVerificationAttempt).toHaveBeenCalledWith(PAYLOAD.sms_verification_id, 3);
            expect(repo.updateSmsVerification).toHaveBeenCalledWith({sms_verification_id: PAYLOAD.sms_verification_id}, {verified_at: FIXED_TIME});
            expect(repo.updateUser).toHaveBeenCalledWith({user_id: ACTOR.user_id}, {phone: PHONE, phone_verified_at: FIXED_TIME});
        });

        it('[FAIL:service] 인증 ID 의 기록이 없으면(틀린 ID · 다른 회원 · 다른 용도) 404, 시도 소비 없음', async () => {
            arrange(null);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION_CONFIRM, payload: PAYLOAD, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '인증 정보를 찾을 수 없습니다. 인증번호를 다시 요청해주세요.', validation_errors: null}});
            expect(repo.consumeSmsVerificationAttempt).not.toHaveBeenCalled();
        });

        it.each([
            ['이미 사용', {verified_at: new Date(2025, 11, 31)}, '이미 사용한 인증번호입니다. 인증번호를 다시 요청해주세요.'],
            ['만료', {expires_at: FIXED_TIME}, '인증번호가 만료되었습니다. 인증번호를 다시 요청해주세요.'],
        ])('[FAIL:service] %s 기록은 400, 시도 소비 없음', async (_label, fields, message) => {
            arrange(verification(fields));

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION_CONFIRM, payload: PAYLOAD, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: null}});
            expect(repo.consumeSmsVerificationAttempt).not.toHaveBeenCalled();
        });

        it('[FAIL:business] 시도 3회를 다 썼으면 400, 인증 · 번호 저장 없음', async () => {
            arrange(verification(), false);

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION_CONFIRM, payload: PAYLOAD, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '인증번호 입력 횟수를 초과했습니다. 인증번호를 다시 요청해주세요.', validation_errors: null}});
            expect(repo.updateSmsVerification).not.toHaveBeenCalled();
            expect(repo.updateUser).not.toHaveBeenCalled();
        });

        it('[FAIL:validation] 인증번호가 다르면 400 + code 입력 오류 — 시도는 1회 소비, 인증 · 번호 저장 없음', async () => {
            arrange();

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION_CONFIRM, payload: {...PAYLOAD, code: '654321'}, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '인증번호가 일치하지 않습니다.', validation_errors: [{property: 'code', message: '인증번호가 일치하지 않습니다.'}]}});
            expect(repo.consumeSmsVerificationAttempt).toHaveBeenCalledTimes(1);
            expect(repo.updateSmsVerification).not.toHaveBeenCalled();
            expect(repo.updateUser).not.toHaveBeenCalled();
        });

        it('[FAIL:service] 이미 인증한 회원은 400, 기록 조회 없음', async () => {
            repo.findUser.mockResolvedValueOnce({user_id: ACTOR.user_id, phone_verified_at: new Date(2025, 11, 1)});

            const {result} = await runCommand(dispatcher, {type: USER_COMMAND.PHONE_VERIFICATION_CONFIRM, payload: PAYLOAD, actor: ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 휴대폰 인증을 마쳤습니다.', validation_errors: null}});
            expect(repo.findSmsVerification).not.toHaveBeenCalled();
        });
    });
});
