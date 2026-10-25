import type {TestingModule} from '@nestjs/testing';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createStoreRepositoryMock, runCommand, StoreRepositoryMock, USER_ACTOR} from './store.test-helper.js';

const DTO = {
    store_name: '룸리스 강남점',
    business_number: '1234567890',
    owner_name: '홍길동',
    owner_phone: '01012345678',
    phone: '0212345678',
    address: '서울시 강남구',
    latitude: 37.4979,
    longitude: 127.0276,
};

describe('admin.store.application — 입점 신청 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.countApplications.mockResolvedValue(0);
        repo.countStores.mockResolvedValue(0);
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('대기 신청 · 같은 사업자번호가 없으면 대기 신청을 등록하고 신청 ID 를 돌려준다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION, payload: DTO, actor: USER_ACTOR});

            expect(decision.result?.type).toBe('admin.store.application.done');
            expect(repo.countApplications).toHaveBeenNthCalledWith(1, {user_id: USER_ACTOR.user_id, store_application_state_id: 'WAIT'});
            expect(repo.countApplications).toHaveBeenNthCalledWith(2, {business_number: '1234567890', store_application_state_id: 'WAIT'});
            expect(repo.countStores).toHaveBeenCalledWith({business_number: '1234567890'});
            expect(repo.insertApplication).toHaveBeenCalledTimes(1);
            const inserted = repo.insertApplication.mock.calls[0][0] as StoreApplicationEntity;
            expect(inserted).toBeInstanceOf(StoreApplicationEntity);
            expect(inserted.store_application_id).toMatch(/^[a-f0-9]{32}$/);
            expect(inserted).toMatchObject({
                user_id: USER_ACTOR.user_id,
                store_application_state_id: 'WAIT',
                store_id: null,
                owner_name: '홍길동',
                owner_phone: '01012345678',
                address_detail: null,
                application_comment: null,
                reject_comment: null,
                reviewed_at: null,
                latitude: 37.4979,
                longitude: 127.0276,
            });
            expect(result).toEqual({result: {store_application_id: inserted.store_application_id}, error: null});
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('대기 중 신청이 있으면 failed 400, 사업자번호 확인 · 등록 없음', async () => {
            repo.countApplications.mockResolvedValueOnce(1);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION, payload: DTO, actor: USER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 대기 중인 입점 신청이 있습니다.', validation_errors: null}});
            expect(repo.countStores).not.toHaveBeenCalled();
            expect(repo.insertApplication).not.toHaveBeenCalled();
        });

        it.each([
            ['같은 사업자번호의 대기 신청', 1, 0],
            ['같은 사업자번호의 등록 업체', 0, 1],
        ])('%s 이 있으면 failed 400 + validation_errors.business_number', async (_label, applications, stores) => {
            repo.countApplications.mockResolvedValueOnce(0).mockResolvedValueOnce(applications);
            repo.countStores.mockResolvedValueOnce(stores);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION, payload: DTO, actor: USER_ACTOR});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '이미 신청 · 등록된 사업자등록번호입니다.', validation_errors: [{property: 'business_number', message: '이미 신청 · 등록된 사업자등록번호입니다.'}]},
            });
            expect(repo.insertApplication).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.APPLICATION, payload: DTO, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.countApplications).not.toHaveBeenCalled();
        });
    });
});
