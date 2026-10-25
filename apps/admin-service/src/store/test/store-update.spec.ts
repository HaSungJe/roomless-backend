import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {ADMIN_ACTOR, bootCommandPath, createStoreRepositoryMock, runCommand, STORE_ID, StoreRepositoryMock, storeRow} from './store.test-helper.js';

const PAYLOAD = {store_id: STORE_ID, store_name: '룸리스 역삼점', owner_name: '김대표', phone: '0298765432', address: '서울시 강남구 역삼동', latitude: '37.5006', longitude: '127.0364'};

describe('admin.store.update — 업체 정보 수정 (큐 경로)', () => {
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
        it('사업자번호를 빼고 정보를 바꾼다 — 위경도는 숫자로, 상세주소가 없으면 null', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.UPDATE, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStore).toHaveBeenCalledWith({store_id: STORE_ID});
            const [where, entity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity).toMatchObject({
                store_name: '룸리스 역삼점',
                owner_name: '김대표',
                phone: '0298765432',
                address: '서울시 강남구 역삼동',
                address_detail: null,
                latitude: 37.5006,
                longitude: 127.0364,
            });
            expect(entity.business_number).toBeUndefined();
            expect(entity.store_state_id).toBeUndefined();
        });
    });

    describe('[FAIL:service]', () => {
        it('업체가 없으면 failed 404, 수정 없음', async () => {
            repo.findStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.UPDATE, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateStore).not.toHaveBeenCalled();
        });

        it('탈퇴 업체는 failed 400, 수정 없음', async () => {
            repo.findStore.mockResolvedValueOnce(storeRow({store_state_id: 'LEAVE'}));

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.UPDATE, payload: PAYLOAD, actor: ADMIN_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '탈퇴한 업체는 바꿀 수 없습니다.', validation_errors: null}});
            expect(repo.updateStore).not.toHaveBeenCalled();
        });
    });
});
