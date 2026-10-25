import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    APPLICATION_ID,
    applicationRow,
    bootCommandPath,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    runCommand,
    StorageGatewayMock,
    StoreRepositoryMock,
    USER_ACTOR,
} from './store.test-helper.js';

const FILE_ID = 'f'.repeat(32);
const FILE_KEY = `private/store-application/${APPLICATION_ID}/${'1'.repeat(32)}.jpg`;
const PAYLOAD = {store_application_id: APPLICATION_ID, store_file_id: FILE_ID};

describe('admin.store.application-file-delete — 업체 정보 파일 삭제 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findApplication.mockResolvedValue(applicationRow());
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 신청의 파일 행을 지운 뒤 저장소 파일을 지운다(마지막)', async () => {
            repo.findStoreFile.mockResolvedValueOnce({store_file_id: FILE_ID, file_key: FILE_KEY});

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE_DELETE, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreFile).toHaveBeenCalledWith({store_file_id: FILE_ID, store_application_id: APPLICATION_ID});
            expect(repo.deleteStoreFile).toHaveBeenCalledWith({store_file_id: FILE_ID});
            expect(storage.remove).toHaveBeenCalledWith(FILE_KEY);
            expect(repo.deleteStoreFile.mock.invocationCallOrder[0]).toBeLessThan(storage.remove.mock.invocationCallOrder[0]);
        });
    });

    describe('[FAIL:service]', () => {
        it('그 신청의 파일이 아니면(다른 신청 파일 포함) failed 404, 삭제 없음', async () => {
            repo.findStoreFile.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE_DELETE, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '파일을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteStoreFile).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });

        it('반려 신청은 failed 400, 파일 조회 · 삭제 없음', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow({store_application_state_id: 'REJECTED'}));

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE_DELETE, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result?.error?.status_code).toBe(400);
            expect(repo.findStoreFile).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });
    });
});
