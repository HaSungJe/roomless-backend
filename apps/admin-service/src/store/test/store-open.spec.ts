import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {ADMIN_ACTOR, bootCommandPath, createStoreRepositoryMock, runCommand, STORE_ID, StoreRepositoryMock, storeRow} from './store.test-helper.js';

describe('admin.store.open — 업체 영업중 여부 변경 (총관리자 · 관리자, 큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findStore.mockResolvedValue(storeRow({is_open: 1}));
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('영업중 → 영업중 아님으로 바꾸고 다른 값은 건드리지 않는다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.OPEN, payload: {store_id: STORE_ID, is_open: 0}, actor: ADMIN_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStore).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.updateStore).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity.is_open).toBe(0);
            expect(entity.store_state_id).toBeUndefined();
            expect(entity.maintenance_minutes).toBeUndefined();
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['없는 업체', null, 404, '업체를 찾을 수 없습니다.'],
            ['탈퇴 업체', storeRow({store_state_id: 'LEAVE', is_open: 1}), 400, '탈퇴한 업체는 바꿀 수 없습니다.'],
            ['같은 값', storeRow({is_open: 0}), 400, '이미 같은 상태입니다.'],
        ])('%s → failed %s, 수정 없음', async (_label, store, status_code, message) => {
            repo.findStore.mockResolvedValueOnce(store);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.OPEN, payload: {store_id: STORE_ID, is_open: 0}, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code, body: {message, validation_errors: null}});
            expect(repo.updateStore).not.toHaveBeenCalled();
        });
    });
});
