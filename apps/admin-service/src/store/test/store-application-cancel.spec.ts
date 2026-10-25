import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {In} from 'typeorm';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    APPLICATION_ID,
    applicationRow,
    bootCommandPath,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    fileRow,
    runCommand,
    StorageGatewayMock,
    StoreRepositoryMock,
    USER_ACTOR,
} from './store.test-helper.js';

const PAYLOAD = {store_application_id: APPLICATION_ID};
const LICENSE_KEY = `private/store-application/${APPLICATION_ID}/${'1'.repeat(32)}.jpg`;
const IMAGE_KEY = `store/application/${APPLICATION_ID}/${'2'.repeat(32)}.png`;

describe('admin.store.application-cancel — 입점 신청 취소 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findApplication.mockResolvedValue(applicationRow());
        repo.findApplicationFileRows.mockResolvedValue([
            fileRow({file_key: LICENSE_KEY}),
            fileRow({store_file_id: 'e'.repeat(32), store_file_purpose_id: 'STORE_IMAGE', file_key: IMAGE_KEY, is_private: 0}),
        ]);
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('대기 중 내 신청이면 파일 행 → 신청 행을 지우고(대기 조건) 저장소 파일을 마지막에 지운다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_CANCEL, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findApplication).toHaveBeenCalledWith({store_application_id: APPLICATION_ID, user_id: USER_ACTOR.user_id, store_application_state_id: In(['WAIT', 'REJECTED'])});
            expect(repo.findApplicationFileRows).toHaveBeenCalledWith(APPLICATION_ID);
            expect(repo.deleteApplicationFiles).toHaveBeenCalledWith(APPLICATION_ID);
            expect(repo.deleteApplication).toHaveBeenCalledWith({store_application_id: APPLICATION_ID, user_id: USER_ACTOR.user_id, store_application_state_id: 'WAIT'});
            expect(repo.deleteApplicationFiles.mock.invocationCallOrder[0]).toBeLessThan(repo.deleteApplication.mock.invocationCallOrder[0]);
            expect(storage.remove).toHaveBeenCalledTimes(2);
            expect(storage.remove).toHaveBeenNthCalledWith(1, LICENSE_KEY);
            expect(storage.remove).toHaveBeenNthCalledWith(2, IMAGE_KEY);
            expect(repo.deleteApplication.mock.invocationCallOrder[0]).toBeLessThan(storage.remove.mock.invocationCallOrder[0]);
        });

        it('파일이 없으면 저장소 삭제 없이 신청만 지운다', async () => {
            repo.findApplicationFileRows.mockResolvedValueOnce([]);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_CANCEL, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.deleteApplication).toHaveBeenCalledTimes(1);
            expect(storage.remove).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('남의 신청 · 승인 신청(조건에 걸리지 않음)은 failed 404, 삭제 없음', async () => {
            repo.findApplication.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_CANCEL, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '입점 신청을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteApplicationFiles).not.toHaveBeenCalled();
            expect(repo.deleteApplication).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });

        it('반려 신청은 failed 400, 삭제 없음', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow({store_application_state_id: 'REJECTED'}));

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_CANCEL, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '대기 중인 입점 신청만 처리할 수 있습니다.', validation_errors: null}});
            expect(repo.deleteApplicationFiles).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });

        it('그 사이 승인 · 반려돼 신청 삭제가 0건이면 failed 400(롤백), 저장소 파일은 지우지 않는다', async () => {
            repo.deleteApplication.mockResolvedValueOnce(false);

            const {decision, result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_CANCEL, payload: PAYLOAD, actor: USER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: '대기 중인 입점 신청만 처리할 수 있습니다.', validation_errors: null}});
            expect(storage.remove).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:infra]', () => {
        it('저장소 삭제 503 은 재시도(requeue)', async () => {
            storage.remove.mockRejectedValueOnce(new ServiceUnavailableException({message: '파일 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_CANCEL, payload: PAYLOAD, actor: USER_ACTOR});

            expect(decision.action).toBe('requeue');
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 조회 · 삭제 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_CANCEL, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findApplication).not.toHaveBeenCalled();
            expect(repo.deleteApplication).not.toHaveBeenCalled();
        });
    });
});
