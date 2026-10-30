import type {TestingModule} from '@nestjs/testing';
import {RoomGroupImageDeleteParamDto} from '@app/contracts/room/dto/room-group-image-delete.dto.js';
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
    ROOM_GROUP_IMAGE_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PAYLOAD = {room_group_id: ROOM_GROUP_ID, room_group_image_id: ROOM_GROUP_IMAGE_ID};

describe('admin.room.group-image-delete — 그룹 사진 삭제 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImage.mockResolvedValue(imageRow());
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹의 사진만 찾아 행을 소프트 삭제한 뒤 S3 객체를 지운다(마지막)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-image-delete.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImage).toHaveBeenCalledWith({room_group_image_id: ROOM_GROUP_IMAGE_ID, room_group_id: ROOM_GROUP_ID});
            expect(repo.deleteRoomGroupImage).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroupImage).toHaveBeenCalledWith({room_group_image_id: ROOM_GROUP_IMAGE_ID});
            expect(storage.remove).toHaveBeenCalledTimes(1);
            expect(storage.remove).toHaveBeenCalledWith(IMAGE_KEY);
            expect(repo.deleteRoomGroupImage.mock.invocationCallOrder[0]).toBeLessThan(storage.remove.mock.invocationCallOrder[0]);
            expect(repo.updateRoomGroupImage).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('사진이 없으면(다른 그룹 · 이미 지운 사진) failed 404, 삭제 · S3 삭제 없음', async () => {
            repo.findRoomGroupImage.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '사진을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteRoomGroupImage).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체) failed 404, 사진 조회 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupImage).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroupImage).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('사진 ID 경로가 32자 hex 가 아니면 → room_group_image_id', async () => {
            await expect(validateBody(RoomGroupImageDeleteParamDto, {room_group_id: ROOM_GROUP_ID, room_group_image_id: 'xyz'})).resolves.toEqual({
                message: '사진 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_image_id', message: '사진 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
