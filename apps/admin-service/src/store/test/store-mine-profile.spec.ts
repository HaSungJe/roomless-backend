import type {TestingModule} from '@nestjs/testing';
import {StoreMineProfileDto} from '@app/contracts/store/dto/store-mine-profile.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createStoreRepositoryMock, MANAGER_ACTOR, runCommand, STORE_ID, StoreRepositoryMock, storeRow, validateBody} from './store.test-helper.js';

describe('admin.store.mine-profile — 내 업체 소개 수정 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 행을 잠가 찾고 소개 · 연락처만 바꾼다', async () => {
            const payload = {introduction: '깨끗한 룸입니다.', phone: '0298765432'};

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.updateStore).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity.introduction).toBe('깨끗한 룸입니다.');
            expect(entity.phone).toBe('0298765432');
            expect(entity.store_name).toBeUndefined();
            expect(entity.business_number).toBeUndefined();
        });

        it('소개를 빼면 null', async () => {
            await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload: {phone: '0298765432'}, actor: MANAGER_ACTOR});

            const entity = repo.updateStore.mock.calls[0][1] as StoreEntity;
            expect(entity.introduction).toBeNull();
        });

        it('예전 클라이언트가 편의시설(store_detail)을 보내도 소개 · 연락처만 바꾼다 — 편의시설은 객실 그룹으로 옮겼다', async () => {
            const payload = {phone: '0298765432', store_detail: {room_count: 3, has_tv: 1}};

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            const entity = repo.updateStore.mock.calls[0][1] as StoreEntity;
            expect(entity).not.toHaveProperty('store_detail');
            expect(
                Object.entries(entity)
                    .filter(([, value]) => value !== undefined)
                    .map(([key]) => key)
                    .sort(),
            ).toEqual(['introduction', 'phone']);
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 failed 404, 수정 없음', async () => {
            repo.findStoreByManager.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload: {phone: '0298765432'}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('연락처가 숫자 8 ~ 11자리가 아니면 → phone', async () => {
            const body = await validateBody(StoreMineProfileDto, {phone: '02-123-4567'});

            expect(body).toEqual({message: '업체 연락처를 숫자만 정확히 입력해주세요.', validation_errors: [{property: 'phone', message: '업체 연락처를 숫자만 정확히 입력해주세요.'}]});
        });

        it('정상 본문은 통과한다', async () => {
            await expect(validateBody(StoreMineProfileDto, {introduction: '소개', phone: '0212345678'})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload: {phone: '0298765432'}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findStoreByManager).not.toHaveBeenCalled();
        });
    });
});
