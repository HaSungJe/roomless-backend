import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {RoomGroupImageDto} from '@app/contracts/room/dto/room-group-image.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    ID_PATTERN,
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

const NEW_KEY = `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.jpg`;
const PAYLOAD = {room_group_id: ROOM_GROUP_ID, file_key: NEW_KEY, file_name: '침대.jpg', content_type: 'image/jpeg'};
const KEY_INVALID = '업로드 주소로 받은 저장 키가 아닙니다.';

describe('admin.room.group-image — 그룹 사진 등록 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImages.mockResolvedValue([
            imageRow({sort_order: 0}),
            imageRow({room_group_image_id: 'a'.repeat(32), file_key: `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'4'.repeat(32)}.jpg`, sort_order: 2}),
        ]);
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('키 모양 · 한도 · 업로드를 확인하고 그 그룹에 마지막 순서(가장 큰 순서 + 1)로 등록한다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-image.done');
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(storage.exists).toHaveBeenCalledWith(NEW_KEY);
            expect(repo.insertRoomGroupImage).toHaveBeenCalledTimes(1);
            const inserted = repo.insertRoomGroupImage.mock.calls[0][0] as RoomGroupImageEntity;
            expect(inserted).toBeInstanceOf(RoomGroupImageEntity);
            expect(inserted.room_group_image_id).toMatch(ID_PATTERN);
            expect(inserted).toMatchObject({room_group_id: ROOM_GROUP_ID, file_key: NEW_KEY, file_name: '침대.jpg', content_type: 'image/jpeg', sort_order: 3, is_deleted: 0});
            expect(result).toEqual({result: {room_group_image_id: inserted.room_group_image_id}, error: null});
        });

        it('사진이 없으면 순서 0 (대표 사진)', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce([]);

            await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect((repo.insertRoomGroupImage.mock.calls[0][0] as RoomGroupImageEntity).sort_order).toBe(0);
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['다른 업체 키', `store/${'9'.repeat(32)}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.jpg`, 'image/jpeg'],
            ['다른 그룹 키', `store/${STORE_ID}/room-group/${'a'.repeat(32)}/${'3'.repeat(32)}.jpg`, 'image/jpeg'],
            ['업체 사진 키(그룹 경로 없음)', `store/${STORE_ID}/${'3'.repeat(32)}.jpg`, 'image/jpeg'],
            ['확장자 불일치', `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.png`, 'image/jpeg'],
        ])('%s → failed 400 validation_errors.file_key, 업로드 확인 · 등록 없음', async (_label, file_key, content_type) => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: {...PAYLOAD, file_key, content_type}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: KEY_INVALID, validation_errors: [{property: 'file_key', message: KEY_INVALID}]}});
            expect(storage.exists).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });

        it('그룹 사진이 5장이면 failed 400, 업로드 확인 · 등록 없음', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce([0, 1, 2, 3, 4].map((sort_order) => imageRow({room_group_image_id: String(sort_order).repeat(32), sort_order})));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '올릴 수 있는 사진 수를 넘었습니다.', validation_errors: null}});
            expect(storage.exists).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });

        it('저장소에 아직 없으면 failed 400, 등록 없음', async () => {
            storage.exists.mockResolvedValueOnce(false);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.', validation_errors: null}});
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });

        it('그룹이 없으면 failed 404, 사진 조회 · 등록 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error?.status_code).toBe(404);
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('같은 키가 이미 등록돼 있으면(UK 변환 — repository 400) failed 400', async () => {
            repo.insertRoomGroupImage.mockRejectedValueOnce(new BadRequestException({message: '이미 등록된 사진입니다.'}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 등록된 사진입니다.', validation_errors: null}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['GIF', {file_key: NEW_KEY, file_name: '침대.gif', content_type: 'image/gif'}, 'content_type', 'JPG · PNG 사진만 올릴 수 있습니다.'],
            ['파일명 256자', {file_key: NEW_KEY, file_name: '가'.repeat(256), content_type: 'image/jpeg'}, 'file_name', '파일명은 255자 이내로 입력해주세요.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomGroupImageDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
