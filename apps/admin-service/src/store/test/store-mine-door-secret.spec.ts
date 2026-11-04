import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {StoreMineDoorSecretDto} from '@app/contracts/store/dto/store-mine-door-secret.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createDoorStoreMock,
    createSmsSenderMock,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    DoorStoreMock,
    MANAGER_ACTOR,
    runCommand,
    STORE_ID,
    StoreRepositoryMock,
    storeRow,
    validateBody,
} from './store.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));

const SECRET = 'A1b2C3d4E5f6G7h8';
const PAYLOAD = {door_secret: SECRET};

describe('admin.store.mine-door-secret — 내 업체 문 소켓 시크릿 코드 설정 (업체 총관리자, 큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let door: DoorStoreMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        vi.mocked(getBcrypt).mockResolvedValue('hashed-secret');
        door = createDoorStoreMock();
        ({dispatcher, module} = await bootCommandPath(repo, createStorageGatewayMock(), createSmsSenderMock(), door));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 행을 잠가 찾고 시크릿을 bcrypt 해시로만 저장한다(다른 필드는 바꾸지 않는다)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_DOOR_SECRET, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(getBcrypt).toHaveBeenCalledTimes(1);
            expect(getBcrypt).toHaveBeenCalledWith(SECRET);
            expect(repo.updateStore).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity).toEqual(Object.assign(new StoreEntity(), {door_secret: 'hashed-secret'}));
        });

        it('저장한 뒤 그 업체 문 소켓 연결 끊기 명령을 보낸다(마지막 단계 — 옛 시크릿 연결을 남기지 않는다)', async () => {
            await runCommand(dispatcher, {type: STORE_COMMAND.MINE_DOOR_SECRET, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(door.disconnect).toHaveBeenCalledTimes(1);
            expect(door.disconnect).toHaveBeenCalledWith(STORE_ID);
            expect(door.disconnect.mock.invocationCallOrder[0]).toBeGreaterThan(repo.updateStore.mock.invocationCallOrder[0]);
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 failed 404, 해시 · 수정 없음', async () => {
            repo.findStoreByManager.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_DOOR_SECRET, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(getBcrypt).not.toHaveBeenCalled();
            expect(repo.updateStore).not.toHaveBeenCalled();
            expect(door.disconnect).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:infra]', () => {
        it('연결 끊기 명령이 Redis 503 이면 재시도(requeue) — 마지막 전달이면 dead + failed 503', async () => {
            door.disconnect.mockRejectedValue(new ServiceUnavailableException({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const first = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_DOOR_SECRET, payload: PAYLOAD, actor: MANAGER_ACTOR});
            const last = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_DOOR_SECRET, payload: PAYLOAD, actor: MANAGER_ACTOR, delivery_count: 3});

            expect(first.decision.action).toBe('requeue');
            expect(last.decision.action).toBe('dead');
            expect(last.result?.error).toEqual({status_code: 503, body: {message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.', validation_errors: null}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['15자', {door_secret: 'A1b2C3d4E5f6G7h'}, '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'],
            ['65자', {door_secret: 'A'.repeat(65)}, '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'],
            ['특수문자', {door_secret: 'A1b2C3d4E5f6G7h!'}, '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'],
            ['빈 값', {}, '시크릿 코드를 입력해주세요.'],
        ])('%s → door_secret', async (_label, body, message) => {
            await expect(validateBody(StoreMineDoorSecretDto, body)).resolves.toEqual({message, validation_errors: [{property: 'door_secret', message}]});
        });
    });
});
