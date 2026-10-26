import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    fileRow,
    imageRow,
    MANAGER_ACTOR,
    runCommand,
    STORE_ID,
    StorageGatewayMock,
    StoreRepositoryMock,
    storeRow,
} from './store.test-helper.js';

const IMAGE_KEY = `store/${STORE_ID}/${'3'.repeat(32)}.jpg`;
const PAYLOAD = {file_key: IMAGE_KEY, file_name: '라운지.jpg', content_type: 'image/jpeg'};

describe('admin.store.mine-file — 내 업체 사진 등록 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        repo.findStoreFilePurpose.mockResolvedValue({store_file_purpose_id: 'STORE_IMAGE', is_private: 0});
        repo.findStoreFileRows.mockResolvedValue([fileRow({store_id: STORE_ID}), imageRow({store_file_id: '4'.repeat(32), sort_order: 0}), imageRow({store_file_id: '5'.repeat(32), sort_order: 2})]);
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('키 · 한도 · 업로드를 확인하고 업체에만 붙여 마지막 순서(가장 큰 순서 + 1)로 등록한다', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(storage.exists).toHaveBeenCalledWith(IMAGE_KEY);
            expect(repo.insertStoreFile).toHaveBeenCalledTimes(1);
            const inserted = repo.insertStoreFile.mock.calls[0][0] as StoreFileEntity;
            expect(inserted).toBeInstanceOf(StoreFileEntity);
            expect(inserted.store_file_id).toMatch(/^[a-f0-9]{32}$/);
            expect(inserted).toMatchObject({
                store_file_purpose_id: 'STORE_IMAGE',
                store_application_id: null,
                store_id: STORE_ID,
                file_key: IMAGE_KEY,
                file_name: '라운지.jpg',
                content_type: 'image/jpeg',
                sort_order: 3,
            });
            expect(result).toEqual({result: {store_file_id: inserted.store_file_id}, error: null});
        });

        it('업체 사진이 없으면(사업자등록증만) 순서 0', async () => {
            repo.findStoreFileRows.mockResolvedValueOnce([fileRow({store_id: STORE_ID})]);

            await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect((repo.insertStoreFile.mock.calls[0][0] as StoreFileEntity).sort_order).toBe(0);
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['다른 업체 키', `store/${'9'.repeat(32)}/${'3'.repeat(32)}.jpg`, 'image/jpeg'],
            ['신청 접두 키', `store/application/${'a'.repeat(32)}/${'3'.repeat(32)}.jpg`, 'image/jpeg'],
            ['확장자 불일치', `store/${STORE_ID}/${'3'.repeat(32)}.png`, 'image/jpeg'],
        ])('%s → failed 400 validation_errors.file_key, 업로드 확인 · 등록 없음', async (_label, file_key, content_type) => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE, payload: {...PAYLOAD, file_key, content_type}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '업로드 주소로 받은 저장 키가 아닙니다.', validation_errors: [{property: 'file_key', message: '업로드 주소로 받은 저장 키가 아닙니다.'}]},
            });
            expect(storage.exists).not.toHaveBeenCalled();
            expect(repo.insertStoreFile).not.toHaveBeenCalled();
        });

        it('업체 사진이 5장이면 failed 400, 등록 없음', async () => {
            repo.findStoreFileRows.mockResolvedValueOnce([0, 1, 2, 3, 4].map((sort_order) => imageRow({store_file_id: String(sort_order).repeat(32), sort_order})));

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '올릴 수 있는 파일 수를 넘었습니다.', validation_errors: null}});
            expect(repo.insertStoreFile).not.toHaveBeenCalled();
        });

        it('저장소에 아직 없으면 failed 400, 등록 없음', async () => {
            storage.exists.mockResolvedValueOnce(false);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.', validation_errors: null}});
            expect(repo.insertStoreFile).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 용도 조회 없음', async () => {
            repo.findStoreByManager.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_FILE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error?.status_code).toBe(404);
            expect(repo.findStoreFilePurpose).not.toHaveBeenCalled();
        });
    });
});
