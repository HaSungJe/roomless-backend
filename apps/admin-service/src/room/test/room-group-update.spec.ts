import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {createValidationError} from '@app/common/utils/validation.js';
import {RoomGroupUpdateDto, RoomGroupUpdateParamDto} from '@app/contracts/room/dto/room-group-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, ROOM_GROUP_ID, roomGroupEntity, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const NAME_TAKEN = '이미 있는 그룹명입니다.';
const PAYLOAD = {room_group_id: ROOM_GROUP_ID, room_group_name: '디럭스'};

describe('admin.room.group-update — 객실 그룹 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity({description: '창가 객실', room_group_detail: {room_count: 3, has_shower: 0, has_tv: 0, has_pc: 0}}));
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹을 찾아 그룹명 · 설명 · 상세정보(보낸 항목 + 기본값으로 통째로 — 지금 값과 합치지 않는다)를 바꾼다', async () => {
            const {decision, result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_UPDATE,
                payload: {...PAYLOAD, description: '넓은 객실', room_group_detail: {room_count: 2, has_pc: 0}},
                actor: MANAGER_ACTOR,
            });

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.updateRoomGroup).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoomGroup.mock.calls[0] as [unknown, RoomGroupEntity];
            expect(where).toEqual({room_group_id: ROOM_GROUP_ID});
            expect(entity).toBeInstanceOf(RoomGroupEntity);
            expect(entity).toMatchObject({room_group_name: '디럭스', description: '넓은 객실'});
            expect(entity.room_group_detail).toEqual({room_count: 2, has_shower: 1, has_tv: 1, has_pc: 0});
            expect(entity.store_id).toBeUndefined();
            expect(entity.is_deleted).toBeUndefined();
        });

        it('상세정보를 보내지 않으면 그대로(엔티티에 넣지 않는다), 설명을 보내지 않으면 null', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            const entity = repo.updateRoomGroup.mock.calls[0][1] as RoomGroupEntity;
            expect(entity.room_group_name).toBe('디럭스');
            expect(entity.description).toBeNull();
            expect(entity.room_group_detail).toBeUndefined();
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹이 없으면(다른 업체 · 지운 그룹) failed 404, 수정 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoomGroup).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 · 수정 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.updateRoomGroup).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('다른 그룹과 그룹명이 겹치면(UK 변환 — repository 400) failed 400 validation_errors.room_group_name', async () => {
            repo.updateRoomGroup.mockRejectedValueOnce(new BadRequestException({message: NAME_TAKEN, validation_errors: createValidationError('room_group_name', NAME_TAKEN)}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: NAME_TAKEN, validation_errors: [{property: 'room_group_name', message: NAME_TAKEN}]}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('샤워실 유무 3 → room_group_detail.has_shower', async () => {
            await expect(validateBody(RoomGroupUpdateDto, {room_group_name: '디럭스', room_group_detail: {has_shower: 3}})).resolves.toEqual({
                message: '샤워실 유무가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_detail.has_shower', message: '샤워실 유무가 올바르지 않습니다.'}],
            });
        });

        it('그룹 ID 경로가 32자 hex 가 아니면 → room_group_id', async () => {
            await expect(validateBody(RoomGroupUpdateParamDto, {room_group_id: 'xyz'})).resolves.toEqual({
                message: '객실 그룹 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
