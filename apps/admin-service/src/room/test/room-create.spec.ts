import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {createValidationError} from '@app/common/utils/validation.js';
import {RoomDto} from '@app/contracts/room/dto/room.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    ID_PATTERN,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PAYLOAD = {room_group_id: ROOM_GROUP_ID, room_name: '101호', floor: 1};
const NAME_TAKEN = '이미 있는 호실명입니다.';

describe('admin.room.create — 호실 등록 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체의 지워지지 않은 그룹에 예약가능 상태로 등록한다 — 업체는 그룹의 업체(= 내 업체)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.create.done');
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.insertRoom).toHaveBeenCalledTimes(1);
            const inserted = repo.insertRoom.mock.calls[0][0] as RoomEntity;
            expect(inserted).toBeInstanceOf(RoomEntity);
            expect(inserted.room_id).toMatch(ID_PATTERN);
            expect(inserted).toMatchObject({store_id: STORE_ID, room_group_id: ROOM_GROUP_ID, room_state_id: 'AVAILABLE', room_name: '101호', floor: 1, is_deleted: 0});
            expect(result).toEqual({result: {room_id: inserted.room_id}, error: null});
        });

        it('지하층(-1)도 등록한다', async () => {
            await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: {...PAYLOAD, room_name: 'B101호', floor: -1}, actor: MANAGER_ACTOR});

            expect(repo.insertRoom.mock.calls[0][0]).toMatchObject({room_name: 'B101호', floor: -1});
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹이 없으면(다른 업체 · 지운 그룹) failed 404, 등록 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.insertRoom).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 · 등록 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.insertRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('업체 안 지워지지 않은 같은 호실명이 있으면(UK 변환 — repository 400) failed 400 validation_errors.room_name', async () => {
            repo.insertRoom.mockRejectedValueOnce(new BadRequestException({message: NAME_TAKEN, validation_errors: createValidationError('room_name', NAME_TAKEN)}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: NAME_TAKEN, validation_errors: [{property: 'room_name', message: NAME_TAKEN}]}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['호실명 51자', {...PAYLOAD, room_name: '가'.repeat(51)}, 'room_name', '호실명은 50자 이내로 입력해주세요.'],
            ['층 201', {...PAYLOAD, floor: 201}, 'floor', '층은 -10 ~ 200 사이로 입력해주세요.'],
            ['층 -11', {...PAYLOAD, floor: -11}, 'floor', '층은 -10 ~ 200 사이로 입력해주세요.'],
            ['그룹 ID 가 32자 hex 가 아님', {...PAYLOAD, room_group_id: 'xyz'}, 'room_group_id', '객실 그룹 ID가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
