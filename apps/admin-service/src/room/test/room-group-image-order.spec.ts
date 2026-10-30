import type {TestingModule} from '@nestjs/testing';
import {RoomGroupImageOrderDto} from '@app/contracts/room/dto/room-group-image-order.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    imageRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const A = 'a'.repeat(32);
const B = '1'.repeat(32);
const C = '2'.repeat(32);
const ORDER_MESSAGE = '그룹 사진 전체를 한 번씩 원하는 순서로 보내주세요.';

describe('admin.room.group-image-order — 그룹 사진 순서 변경 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImages.mockResolvedValue([
            imageRow({room_group_image_id: A, sort_order: 0}),
            imageRow({room_group_image_id: B, sort_order: 1}),
            imageRow({room_group_image_id: C, sort_order: 2}),
        ]);
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 그룹 사진 전부를 받은 순서대로 0 부터 다시 매긴다(가장 앞이 대표)', async () => {
            const {decision, result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_IMAGE_ORDER,
                payload: {room_group_id: ROOM_GROUP_ID, room_group_image_ids: [C, A, B]},
                actor: MANAGER_ACTOR,
            });

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-image-order.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(repo.updateRoomGroupImage).toHaveBeenCalledTimes(3);
            const calls = repo.updateRoomGroupImage.mock.calls as [unknown, RoomGroupImageEntity][];
            expect(calls.map(([where]) => where)).toEqual([{room_group_image_id: C}, {room_group_image_id: A}, {room_group_image_id: B}]);
            expect(calls.map(([, entity]) => entity.sort_order)).toEqual([0, 1, 2]);
            expect(calls.every(([, entity]) => entity instanceof RoomGroupImageEntity)).toBe(true);
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['빠짐', [C, A]],
            ['남음', [C, A, B, '3'.repeat(32)]],
            ['겹침', [C, A, A]],
            ['다른 그룹 사진 섞임', [C, A, '4'.repeat(32)]],
        ])('%s → failed 400 validation_errors.room_group_image_ids, 순서 변경 없음', async (_label, room_group_image_ids) => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_ORDER, payload: {room_group_id: ROOM_GROUP_ID, room_group_image_ids}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: ORDER_MESSAGE, validation_errors: [{property: 'room_group_image_ids', message: ORDER_MESSAGE}]}});
            expect(repo.updateRoomGroupImage).not.toHaveBeenCalled();
        });

        it('그룹이 없으면 failed 404, 사진 조회 · 순서 변경 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_ORDER, payload: {room_group_id: ROOM_GROUP_ID, room_group_image_ids: [A, B, C]}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupImage).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('6장이면 → room_group_image_ids (한도)', async () => {
            const ids = ['0', '1', '2', '3', '4', '5'].map((digit) => digit.repeat(32));

            await expect(validateBody(RoomGroupImageOrderDto, {room_group_image_ids: ids})).resolves.toEqual({
                message: '객실 그룹 사진은 5장까지입니다.',
                validation_errors: [{property: 'room_group_image_ids', message: '객실 그룹 사진은 5장까지입니다.'}],
            });
        });

        it('항목이 32자 hex 가 아니면 → room_group_image_ids', async () => {
            await expect(validateBody(RoomGroupImageOrderDto, {room_group_image_ids: [A, 'xyz']})).resolves.toEqual({
                message: '사진 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_image_ids', message: '사진 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_ORDER, payload: {room_group_id: ROOM_GROUP_ID, room_group_image_ids: [A, B, C]}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
