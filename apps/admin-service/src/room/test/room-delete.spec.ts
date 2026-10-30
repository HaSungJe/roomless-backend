import type {TestingModule} from '@nestjs/testing';
import {RoomDeleteParamDto} from '@app/contracts/room/dto/room-delete.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, ROOM_ID, roomEntity, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const PAYLOAD = {room_id: ROOM_ID};

describe('admin.room.delete — 호실 삭제 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoom.mockResolvedValue(roomEntity());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 호실을 찾아 소프트 삭제한다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.delete.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(repo.deleteRoom).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoom).toHaveBeenCalledWith({room_id: ROOM_ID});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면(다른 업체 · 이미 지운 호실) failed 404, 삭제 없음', async () => {
            repo.findRoom.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '호실을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteRoom).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 호실 조회 · 삭제 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoom).not.toHaveBeenCalled();
            expect(repo.deleteRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('호실 ID 경로가 32자 hex 가 아니면 → room_id', async () => {
            await expect(validateBody(RoomDeleteParamDto, {room_id: 'xyz'})).resolves.toEqual({
                message: '호실 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_id', message: '호실 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.DELETE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
