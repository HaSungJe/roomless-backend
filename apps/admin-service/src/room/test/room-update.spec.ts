import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {createValidationError} from '@app/common/utils/validation.js';
import {RoomUpdateDto, RoomUpdateParamDto} from '@app/contracts/room/dto/room-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, ROOM_ID, roomEntity, roomGroupEntity, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const OTHER_GROUP_ID = 'a'.repeat(32);
const PAYLOAD = {room_id: ROOM_ID, room_group_id: OTHER_GROUP_ID, room_name: '201호', floor: 2};
const NAME_TAKEN = '이미 있는 호실명입니다.';

describe('admin.room.update — 호실 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoom.mockResolvedValue(roomEntity());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity({room_group_id: OTHER_GROUP_ID, room_group_name: '디럭스'}));
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 호실을 찾아 같은 업체의 다른 그룹으로 옮기고 호실명 · 층을 통째로 바꾼다(상태 · 업체는 그대로)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: OTHER_GROUP_ID, store_id: STORE_ID});
            expect(repo.updateRoom).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoom.mock.calls[0] as [unknown, RoomEntity];
            expect(where).toEqual({room_id: ROOM_ID});
            expect(entity).toBeInstanceOf(RoomEntity);
            expect(entity).toMatchObject({room_group_id: OTHER_GROUP_ID, room_name: '201호', floor: 2});
            expect(entity.room_state_id).toBeUndefined();
            expect(entity.store_id).toBeUndefined();
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면(다른 업체 · 지운 호실) failed 404, 수정 없음', async () => {
            repo.findRoom.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '호실을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });

        it('옮길 그룹이 없으면(다른 업체 그룹 · 지운 그룹) failed 404, 수정 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 호실 조회 · 수정 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoom).not.toHaveBeenCalled();
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('다른 호실과 호실명이 겹치면(UK 변환 — repository 400) failed 400 validation_errors.room_name', async () => {
            repo.updateRoom.mockRejectedValueOnce(new BadRequestException({message: NAME_TAKEN, validation_errors: createValidationError('room_name', NAME_TAKEN)}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: NAME_TAKEN, validation_errors: [{property: 'room_name', message: NAME_TAKEN}]}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('층 201 → floor', async () => {
            await expect(validateBody(RoomUpdateDto, {room_group_id: OTHER_GROUP_ID, room_name: '201호', floor: 201})).resolves.toEqual({
                message: '층은 -10 ~ 200 사이로 입력해주세요.',
                validation_errors: [{property: 'floor', message: '층은 -10 ~ 200 사이로 입력해주세요.'}],
            });
        });

        it('호실 ID 경로가 32자 hex 가 아니면 → room_id', async () => {
            await expect(validateBody(RoomUpdateParamDto, {room_id: 'xyz'})).resolves.toEqual({
                message: '호실 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_id', message: '호실 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
