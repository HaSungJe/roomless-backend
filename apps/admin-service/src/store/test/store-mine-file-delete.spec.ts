import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    imageRow,
    MANAGER_ACTOR,
    runCommand,
    STORE_ID,
    StorageGatewayMock,
    StoreRepositoryMock,
    storeRow,
} from './store.test-helper.js';

const FILE_ID = 'c'.repeat(32);
const IMAGE_KEY = `store/${STORE_ID}/${'2'.repeat(32)}.jpg`;

describe('admin.store.mine-file-delete — 내 업체 사진 삭제 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        repo.findStoreFile.mockResolvedValue(imageRow({store_file_id: FILE_ID, file_key: IMAGE_KEY}));
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체의 업체 사진만 찾아 행을 지운 뒤 저장소 파일을 지운다(마지막)', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE_DELETE, payload: {store_file_id: FILE_ID}, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findStoreFile).toHaveBeenCalledWith({store_file_id: FILE_ID, store_id: STORE_ID, store_file_purpose_id: 'STORE_IMAGE'});
            expect(repo.deleteStoreFile).toHaveBeenCalledWith({store_file_id: FILE_ID});
            expect(storage.remove).toHaveBeenCalledWith(IMAGE_KEY);
            expect(repo.deleteStoreFile.mock.invocationCallOrder[0]).toBeLessThan(storage.remove.mock.invocationCallOrder[0]);
        });
    });

    describe('[FAIL:service]', () => {
        it('파일이 없으면(사업자등록증 · 다른 업체 사진) failed 404, 삭제 없음', async () => {
            repo.findStoreFile.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE_DELETE, payload: {store_file_id: FILE_ID}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '파일을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteStoreFile).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });
    });
});
