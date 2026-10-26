import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {In, Not} from 'typeorm';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createJwtServiceMock,
    createManagerRepositoryMock,
    HEAD_ACTOR,
    headManagerRow,
    ManagerRepositoryMock,
    runCommand,
    STAFF_ID,
    STORE_ID,
    staffRow,
} from './manager.test-helper.js';

const PAYLOAD = {user_id: STAFF_ID, name: '김직원2', phone: '01044445555', gender: 'F', birth: '1996-06-06'};

describe('admin.manager.staff-update — 업체 관리자 수정 (큐 경로)', () => {
    let repo: ManagerRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createManagerRepositoryMock();
        repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(staffRow());
        repo.countStaff.mockResolvedValue(0);
        ({dispatcher, module} = await bootCommandPath(repo, createJwtServiceMock('a', 'r')));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('내 업체의 업체 관리자를 찾아 이름(닉네임 같이) · 번호 · 성별 · 생년월일을 바꾼다 — 번호 중복은 자신 제외', async () => {
            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_UPDATE, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findManager).toHaveBeenNthCalledWith(2, {user_id: STAFF_ID, login_scope: 'MANAGER', auth_id: 'MANAGER', store_id: STORE_ID, state_id: In(['ACTIVE', 'BLOCK'])});
            expect(repo.countStaff).toHaveBeenCalledWith({phone: '01044445555', login_scope: 'MANAGER', store_id: STORE_ID, user_id: Not(STAFF_ID)});
            const [where, entity] = repo.updateStaff.mock.calls[0] as [unknown, UserEntity];
            expect(where).toEqual({user_id: STAFF_ID});
            expect(entity).toBeInstanceOf(UserEntity);
            expect(entity).toMatchObject({name: '김직원2', nickname: '김직원2', phone: '01044445555', gender: 'F', birth: '1996-06-06'});
            expect(entity.login_id).toBeUndefined();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('같은 업체의 다른 계정과 번호가 겹치면 failed 400 + validation_errors.phone, 수정 없음', async () => {
            repo.countStaff.mockResolvedValueOnce(1);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_UPDATE, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '이미 다른 계정에 등록된 휴대폰 번호입니다.', validation_errors: [{property: 'phone', message: '이미 다른 계정에 등록된 휴대폰 번호입니다.'}]},
            });
            expect(repo.updateStaff).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('대상이 없으면(다른 업체 · 자신 · 삭제) failed 404, 번호 확인 · 수정 없음', async () => {
            repo.findManager.mockReset();
            repo.findManager.mockResolvedValueOnce(headManagerRow()).mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_UPDATE, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '업체 관리자를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.countStaff).not.toHaveBeenCalled();
            expect(repo.updateStaff).not.toHaveBeenCalled();
        });

        it('경쟁 수정(repository UK 400)은 그대로 failed 400', async () => {
            repo.updateStaff.mockRejectedValueOnce(new BadRequestException({message: '이미 다른 계정에 등록된 휴대폰 번호입니다.'}));

            const {result} = await runCommand(dispatcher, {type: MANAGER_COMMAND.STAFF_UPDATE, payload: PAYLOAD, actor: HEAD_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 다른 계정에 등록된 휴대폰 번호입니다.', validation_errors: null}});
        });
    });
});
