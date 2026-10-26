import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createStoreRepositoryMock, MANAGER_ACTOR, runCommand, STORE_ID, StoreRepositoryMock, storeRow} from './store.test-helper.js';

describe('admin.store.mine-open — 내 업체 영업중 여부 변경 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findStoreByManager.mockResolvedValue(storeRow({is_open: 0}));
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('영업중 아님 → 영업중으로 바꾼다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_OPEN, payload: {is_open: 1}, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            const [where, entity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity.is_open).toBe(1);
            expect(entity.is_always_open).toBeUndefined();
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['같은 값', storeRow({is_open: 1}), 400, '이미 같은 상태입니다.'],
            ['소속 업체 없음', null, 404, '소속 업체를 찾을 수 없습니다.'],
        ])('%s → failed %s, 수정 없음', async (_label, store, status_code, message) => {
            repo.findStoreByManager.mockResolvedValueOnce(store);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_OPEN, payload: {is_open: 1}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code, body: {message, validation_errors: null}});
            expect(repo.updateStore).not.toHaveBeenCalled();
        });
    });
});
