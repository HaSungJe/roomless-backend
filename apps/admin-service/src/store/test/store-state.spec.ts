import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {ADMIN_ACTOR, bootCommandPath, createStoreRepositoryMock, runCommand, STORE_ID, StoreRepositoryMock, storeRow} from './store.test-helper.js';

describe('admin.store.state — 업체 상태 변경 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findStore.mockResolvedValue(storeRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('영업중지는 상태만 바꾸고 매니저 계정은 그대로 둔다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.STATE, payload: {store_id: STORE_ID, store_state_id: 'SUSPEND'}, actor: ADMIN_ACTOR});

            expect(result).toEqual({result: null, error: null});
            const [where, entity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity.store_state_id).toBe('SUSPEND');
            expect(entity.business_number).toBeUndefined();
            expect(repo.updateStoreManagers).not.toHaveBeenCalled();
        });

        it('탈퇴는 매니저 계정을 정지하고 사업자번호를 DELETE_<store_id> 로 마스킹한다(원래 값은 delete_backup)', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.STATE, payload: {store_id: STORE_ID, store_state_id: 'LEAVE'}, actor: ADMIN_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.updateStoreManagers).toHaveBeenCalledWith(STORE_ID, 'BLOCK', '업체 탈퇴로 이용이 정지되었습니다.');
            expect(repo.updateStore.mock.calls[0][1]).toMatchObject({store_state_id: 'LEAVE', business_number: `DELETE_${STORE_ID}`, delete_backup: JSON.stringify({business_number: '1234567890'})});
        });

        it('영업중지 → 활성으로 되돌릴 수 있다', async () => {
            repo.findStore.mockResolvedValueOnce(storeRow({store_state_id: 'SUSPEND'}));

            await runCommand(dispatcher, {type: STORE_COMMAND.STATE, payload: {store_id: STORE_ID, store_state_id: 'ACTIVE'}, actor: ADMIN_ACTOR});

            expect(repo.updateStore.mock.calls[0][1].store_state_id).toBe('ACTIVE');
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['업체 없음', null, 'SUSPEND', 404, '업체를 찾을 수 없습니다.'],
            ['탈퇴 업체 (되돌릴 수 없음)', storeRow({store_state_id: 'LEAVE'}), 'ACTIVE', 400, '탈퇴한 업체는 바꿀 수 없습니다.'],
            ['같은 상태', storeRow({store_state_id: 'ACTIVE'}), 'ACTIVE', 400, '이미 같은 상태입니다.'],
        ])('%s → failed %s, 상태 · 매니저 변경 없음', async (_label, store, store_state_id, status_code, message) => {
            repo.findStore.mockResolvedValueOnce(store);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.STATE, payload: {store_id: STORE_ID, store_state_id}, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code, body: {message, validation_errors: null}});
            expect(repo.updateStore).not.toHaveBeenCalled();
            expect(repo.updateStoreManagers).not.toHaveBeenCalled();
        });
    });
});
