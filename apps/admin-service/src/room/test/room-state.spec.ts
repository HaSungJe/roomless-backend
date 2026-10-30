import type {TestingModule} from '@nestjs/testing';
import {RoomStateDto} from '@app/contracts/room/dto/room-state.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, ROOM_ID, roomEntity, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const STATE_INVALID = '지금 상태에서는 바꿀 수 없습니다.';
const DTO_STATE_INVALID = '바꿀 수 있는 호실 상태가 아닙니다.';

describe('admin.room.state — 호실 상태 변경 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoom.mockResolvedValue(roomEntity({room_state_id: 'MAINTENANCE'}));
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('정비 완료 — 그 업체 정비중 호실을 예약가능으로 바꾼다(상태만)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: 'AVAILABLE'}, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.state.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(repo.updateRoom).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoom.mock.calls[0] as [unknown, RoomEntity];
            expect(where).toEqual({room_id: ROOM_ID});
            expect(entity).toBeInstanceOf(RoomEntity);
            expect(entity.room_state_id).toBe('AVAILABLE');
            expect(entity.room_name).toBeUndefined();
            expect(entity.floor).toBeUndefined();
            expect(entity.room_group_id).toBeUndefined();
        });
    });

    describe('[CASES:canChangeRoomState] 업체 관리자 전환 표 (사용자 결정 2026-10-31)', () => {
        it.each([
            ['MAINTENANCE', 'AVAILABLE', true],
            ['AVAILABLE', 'DISABLED', true],
            ['MAINTENANCE', 'DISABLED', true],
            ['DISABLED', 'AVAILABLE', true],
            ['AVAILABLE', 'AVAILABLE', false],
            ['DISABLED', 'DISABLED', false],
            ['RESERVED', 'AVAILABLE', false],
            ['RESERVED', 'DISABLED', false],
            ['IN_USE', 'AVAILABLE', false],
            ['IN_USE', 'DISABLED', false],
            ['UNKNOWN', 'AVAILABLE', false],
        ] as const)('%s → %s : 허용 %s', async (from, to, allowed) => {
            repo.findRoom.mockResolvedValueOnce(roomEntity({room_state_id: from}));

            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: to}, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            if (allowed) {
                expect(result).toEqual({result: null, error: null});
                expect(repo.updateRoom).toHaveBeenCalledTimes(1);
                expect(repo.updateRoom.mock.calls[0][0]).toEqual({room_id: ROOM_ID});
                expect((repo.updateRoom.mock.calls[0][1] as RoomEntity).room_state_id).toBe(to);
            } else {
                expect(result?.error).toEqual({status_code: 400, body: {message: STATE_INVALID, validation_errors: null}});
                expect(repo.updateRoom).not.toHaveBeenCalled();
            }
        });

        it.each([
            ['AVAILABLE', 'MAINTENANCE'],
            ['AVAILABLE', 'RESERVED'],
        ] as const)('%s → %s : 게이트웨이 DTO 가 거부하고(AVAILABLE · DISABLED 만), 지나쳐 와도 service 가 400', async (from, to) => {
            await expect(validateBody(RoomStateDto, {room_state_id: to})).resolves.toEqual({message: DTO_STATE_INVALID, validation_errors: [{property: 'room_state_id', message: DTO_STATE_INVALID}]});

            repo.findRoom.mockResolvedValueOnce(roomEntity({room_state_id: from}));
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: to}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: STATE_INVALID, validation_errors: null}});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면(다른 업체 · 지운 호실) failed 404, 상태 변경 없음', async () => {
            repo.findRoom.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: 'AVAILABLE'}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '호실을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 호실 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: 'AVAILABLE'}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoom).not.toHaveBeenCalled();
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('AVAILABLE · DISABLED 는 통과', async () => {
            await expect(validateBody(RoomStateDto, {room_state_id: 'AVAILABLE'})).resolves.toBeNull();
            await expect(validateBody(RoomStateDto, {room_state_id: 'DISABLED'})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: 'AVAILABLE'}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
