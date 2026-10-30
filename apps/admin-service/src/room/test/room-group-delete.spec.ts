import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {RoomGroupDeleteParamDto} from '@app/contracts/room/dto/room-group-delete.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    IMAGE_KEY,
    imageRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const KEY_B = `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.png`;
const PAYLOAD = {room_group_id: ROOM_GROUP_ID};

describe('admin.room.group-delete — 객실 그룹 삭제 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImages.mockResolvedValue([imageRow(), imageRow({room_group_image_id: 'a'.repeat(32), file_key: KEY_B, content_type: 'image/png', sort_order: 1})]);
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹의 사진 키를 먼저 읽고 호실 → 사진 → 그룹 순으로 소프트 삭제한 뒤 사진 S3 객체를 지운다(마지막)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-delete.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(repo.deleteRooms).toHaveBeenCalledTimes(1);
            expect(repo.deleteRooms).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID});
            expect(repo.deleteRoomGroupImages).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroupImages).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID});
            expect(repo.deleteRoomGroup).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID});
            expect(storage.remove).toHaveBeenCalledTimes(2);
            expect(storage.remove).toHaveBeenNthCalledWith(1, IMAGE_KEY);
            expect(storage.remove).toHaveBeenNthCalledWith(2, KEY_B);
            const order = [
                repo.findRoomGroupImages.mock.invocationCallOrder[0],
                repo.deleteRooms.mock.invocationCallOrder[0],
                repo.deleteRoomGroupImages.mock.invocationCallOrder[0],
                repo.deleteRoomGroup.mock.invocationCallOrder[0],
                storage.remove.mock.invocationCallOrder[0],
            ];
            expect(order).toEqual([...order].sort((a, b) => a - b));
        });

        it('사진이 없으면 S3 삭제 없이 행만 지운다', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce([]);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.deleteRooms).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroupImages).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroup).toHaveBeenCalledTimes(1);
            expect(storage.remove).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹이 없으면(다른 업체 · 이미 지운 그룹) failed 404, 삭제 · S3 삭제 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteRooms).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroupImages).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroup).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroup).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:infra]', () => {
        it('S3 삭제가 503 이면 재시도(requeue) — 결과 회신 없음', async () => {
            storage.remove.mockRejectedValueOnce(new ServiceUnavailableException({message: '파일 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('requeue');
            expect(decision.result).toBeNull();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('그룹 ID 경로가 32자 hex 가 아니면 → room_group_id', async () => {
            await expect(validateBody(RoomGroupDeleteParamDto, {room_group_id: 'xyz'})).resolves.toEqual({
                message: '객실 그룹 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
