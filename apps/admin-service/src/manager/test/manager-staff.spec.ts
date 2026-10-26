import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {staffRegisteredText} from '../manager.util.js';
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
    STORE_CODE,
    STORE_ID,
    storeRow,
} from './manager.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));

const PAYLOAD = {login_id: 'staff01', name: '김직원', phone: '01022223333', gender: 'M', birth: '1995-05-05'};

describe('admin.manager.staff — 업체 관리자 등록 (큐 경로)', () => {
    let repo: ManagerRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createManagerRepositoryMock();
        sms = createSmsSenderMock();
        repo.findManager.mockResolvedValue(headManagerRow());
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.countStaff.mockResolvedValue(0);
        vi.mocked(getBcrypt).mockResolvedValue('hashed-temp-password');
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r'), sms));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 총관리자의 업체에 업체 관리자 계정(임시 비밀번호 · 변경 필요)을 만들고 상호명 · 업체코드 · 아이디 · 임시 비밀번호를 SMS 로(마지막)', async () => {
            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(repo.findManager).toHaveBeenCalledWith({user_id: HEAD_ACTOR.user_id, login_scope: 'MANAGER', auth_id: 'HEAD_MANAGER'});
            expect(repo.findManagerStore).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.countStaff).toHaveBeenNthCalledWith(1, {login_id: 'staff01', login_scope: 'MANAGER', store_id: STORE_ID});
            expect(repo.countStaff).toHaveBeenNthCalledWith(2, {phone: '01022223333', login_scope: 'MANAGER', store_id: STORE_ID});

            const staff = repo.insertStaff.mock.calls[0][0] as UserEntity;
            expect(staff).toBeInstanceOf(UserEntity);
            expect(staff.user_id).toMatch(/^[a-f0-9]{32}$/);
            expect(staff).toMatchObject({
                auth_id: 'MANAGER',
                login_scope: 'MANAGER',
                state_id: 'ACTIVE',
                store_id: STORE_ID,
                login_id: 'staff01',
                login_pw: 'hashed-temp-password',
                name: '김직원',
                nickname: '김직원',
                gender: 'M',
                birth: '1995-05-05',
                phone: '01022223333',
                sns_id: null,
                is_password_change_required: 1,
                block_comment: null,
            });

            const temporaryPassword = vi.mocked(getBcrypt).mock.calls[0][0];
            expect(temporaryPassword).toMatch(/^[a-zA-Z0-9]{10}$/);
            expect(sms.send).toHaveBeenCalledWith({to: '01022223333', text: staffRegisteredText('룸리스 강남점', STORE_CODE, 'staff01', temporaryPassword)});
            expect(repo.insertStaff.mock.invocationCallOrder[0]).toBeLessThan(sms.send.mock.invocationCallOrder[0]);
            expect(result).toEqual({result: {user_id: staff.user_id}, error: null});
        });
    });

    describe('[FAIL:duplicate]', () => {
        it.each([
            ['아이디', [1, 0], 'login_id', '이미 사용 중인 아이디입니다.'],
            ['휴대폰 번호', [0, 1], 'phone', '이미 다른 계정에 등록된 휴대폰 번호입니다.'],
        ])('같은 업체에 같은 %s → failed 400 + validation_errors.%s, 등록 · SMS 없음', async (_label, counts, property, message) => {
            repo.countStaff.mockResolvedValueOnce(counts[0]).mockResolvedValueOnce(counts[1]);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property, message}]}});
            expect(repo.insertStaff).not.toHaveBeenCalled();
            expect(sms.send).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['업체 총관리자가 아님(조회 null)', () => repo.findManager.mockResolvedValueOnce(null)],
            ['소속 업체 없음', () => repo.findManagerStore.mockResolvedValueOnce(null)],
        ])('%s → failed 404, 확인 · 등록 없음', async (_label, arrange) => {
            arrange();

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.countStaff).not.toHaveBeenCalled();
            expect(repo.insertStaff).not.toHaveBeenCalled();
        });

        it('경쟁 등록(repository UK 400)은 그대로 failed 400, SMS 없음', async () => {
            repo.insertStaff.mockRejectedValueOnce(new BadRequestException({message: '이미 사용 중인 아이디입니다.'}));

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 사용 중인 아이디입니다.', validation_errors: null}});
            expect(sms.send).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:infra]', () => {
        it('SMS 503 은 재시도(requeue)', async () => {
            sms.send.mockRejectedValueOnce(new ServiceUnavailableException({message: 'SMS 발송을 사용할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(decision.action).toBe('requeue');
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManager).not.toHaveBeenCalled();
        });
    });
});
