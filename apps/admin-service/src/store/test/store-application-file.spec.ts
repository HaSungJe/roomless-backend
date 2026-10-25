import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
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

const LICENSE_KEY = `private/store-application/${APPLICATION_ID}/${'1'.repeat(32)}.jpg`;
const PAYLOAD = {store_application_id: APPLICATION_ID, store_file_purpose_id: 'BUSINESS_LICENSE', file_key: LICENSE_KEY, file_name: '사업자등록증.jpg', content_type: 'image/jpeg'};

describe('admin.store.application-file — 업체 정보 파일 등록 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findApplication.mockResolvedValue(applicationRow());
        repo.findStoreFilePurpose.mockResolvedValue({store_file_purpose_id: 'BUSINESS_LICENSE', is_private: 1});
        repo.countStoreFiles.mockResolvedValue(0);
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('키 모양 · 한도 · 업로드를 확인하고 신청에 붙여 등록한다(업체는 승인 때)', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE, payload: PAYLOAD, actor: USER_ACTOR});

            expect(storage.exists).toHaveBeenCalledWith(LICENSE_KEY);
            expect(repo.insertStoreFile).toHaveBeenCalledTimes(1);
            const inserted = repo.insertStoreFile.mock.calls[0][0] as StoreFileEntity;
            expect(inserted).toBeInstanceOf(StoreFileEntity);
            expect(inserted).toMatchObject({
                store_file_purpose_id: 'BUSINESS_LICENSE',
                store_application_id: APPLICATION_ID,
                store_id: null,
                file_key: LICENSE_KEY,
                file_name: '사업자등록증.jpg',
                content_type: 'image/jpeg',
                sort_order: 0,
            });
            expect(result).toEqual({result: {store_file_id: inserted.store_file_id}, error: null});
        });

        it('정렬 순서는 같은 용도의 지금 개수', async () => {
            repo.findStoreFilePurpose.mockResolvedValueOnce({store_file_purpose_id: 'STORE_IMAGE', is_private: 0});
            repo.countStoreFiles.mockResolvedValueOnce(3);
            const imageKey = `store/application/${APPLICATION_ID}/${'2'.repeat(32)}.png`;

            await runCommand(dispatcher, {
                type: STORE_COMMAND.APPLICATION_FILE,
                payload: {...PAYLOAD, store_file_purpose_id: 'STORE_IMAGE', file_key: imageKey, content_type: 'image/png'},
                actor: USER_ACTOR,
            });

            expect(repo.insertStoreFile.mock.calls[0][0]).toMatchObject({store_file_purpose_id: 'STORE_IMAGE', file_key: imageKey, sort_order: 3});
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['다른 신청의 키', `private/store-application/${'9'.repeat(32)}/${'1'.repeat(32)}.jpg`, 'image/jpeg'],
            ['비공개 용도인데 공개 접두', `store/application/${APPLICATION_ID}/${'1'.repeat(32)}.jpg`, 'image/jpeg'],
            ['형식과 확장자 불일치', LICENSE_KEY, 'image/png'],
        ])('%s 이면 failed 400 + validation_errors.file_key, 업로드 확인 · 등록 없음', async (_label, file_key, content_type) => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE, payload: {...PAYLOAD, file_key, content_type}, actor: USER_ACTOR});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '업로드 주소로 받은 저장 키가 아닙니다.', validation_errors: [{property: 'file_key', message: '업로드 주소로 받은 저장 키가 아닙니다.'}]},
            });
            expect(storage.exists).not.toHaveBeenCalled();
            expect(repo.insertStoreFile).not.toHaveBeenCalled();
        });

        it('S3 에 아직 없으면 failed 400, 등록 없음', async () => {
            storage.exists.mockResolvedValueOnce(false);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.', validation_errors: null}});
            expect(repo.insertStoreFile).not.toHaveBeenCalled();
        });

        it('남의 신청 · 승인 신청은 failed 404', async () => {
            repo.findApplication.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result?.error?.status_code).toBe(404);
            expect(repo.insertStoreFile).not.toHaveBeenCalled();
        });

        it('반려 신청 · 한도 초과는 failed 400', async () => {
            repo.findApplication.mockResolvedValueOnce(applicationRow({store_application_state_id: 'REJECTED'}));
            const rejected = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE, payload: PAYLOAD, actor: USER_ACTOR});
            repo.countStoreFiles.mockResolvedValueOnce(1);
            const full = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE, payload: PAYLOAD, actor: USER_ACTOR});

            expect(rejected.result?.error?.body.message).toBe('대기 중인 입점 신청만 처리할 수 있습니다.');
            expect(full.result?.error?.body.message).toBe('올릴 수 있는 파일 수를 넘었습니다.');
            expect(repo.insertStoreFile).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository]', () => {
        it('같은 키 등록(repository 400)은 그대로 failed 400', async () => {
            repo.insertStoreFile.mockRejectedValueOnce(new BadRequestException({message: '이미 등록된 파일입니다.'}));

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION_FILE, payload: PAYLOAD, actor: USER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 등록된 파일입니다.', validation_errors: null}});
        });
    });
});
