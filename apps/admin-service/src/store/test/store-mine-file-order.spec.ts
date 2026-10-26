import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createStoreRepositoryMock, fileRow, imageRow, MANAGER_ACTOR, runCommand, STORE_ID, StoreRepositoryMock, storeRow} from './store.test-helper.js';

const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);
const LICENSE = 'f'.repeat(32);

describe('admin.store.mine-file-order — 내 업체 사진 순서 변경 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        repo.findStoreFileRows.mockResolvedValue([
            fileRow({store_file_id: LICENSE, store_id: STORE_ID}),
            imageRow({store_file_id: A, sort_order: 0}),
            imageRow({store_file_id: B, sort_order: 1}),
            imageRow({store_file_id: C, sort_order: 2}),
        ]);
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 사진 전부를 받은 순서대로 0 부터 다시 매긴다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE_ORDER, payload: {store_file_ids: [C, A, B]}, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findStoreFileRows).toHaveBeenCalledWith(STORE_ID);
            expect(repo.updateStoreFile).toHaveBeenCalledTimes(3);
            const calls = repo.updateStoreFile.mock.calls as [unknown, StoreFileEntity][];
            expect(calls.map(([where]) => where)).toEqual([{store_file_id: C}, {store_file_id: A}, {store_file_id: B}]);
            expect(calls.map(([, entity]) => entity.sort_order)).toEqual([0, 1, 2]);
            expect(calls.every(([, entity]) => entity instanceof StoreFileEntity)).toBe(true);
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['빠짐', [C, A]],
            ['남음', [C, A, B, 'd'.repeat(32)]],
            ['겹침', [C, A, A]],
            ['사업자등록증 섞임', [C, A, LICENSE]],
        ])('%s → failed 400 validation_errors.store_file_ids, 순서 변경 없음', async (_label, store_file_ids) => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE_ORDER, payload: {store_file_ids}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '업체 사진 전체를 한 번씩 원하는 순서로 보내주세요.', validation_errors: [{property: 'store_file_ids', message: '업체 사진 전체를 한 번씩 원하는 순서로 보내주세요.'}]},
            });
            expect(repo.updateStoreFile).not.toHaveBeenCalled();
        });
    });
});
