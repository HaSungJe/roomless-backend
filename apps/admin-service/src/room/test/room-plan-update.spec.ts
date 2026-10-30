import type {TestingModule} from '@nestjs/testing';
import {RoomPlanUpdateDto, RoomPlanUpdateParamDto} from '@app/contracts/room/dto/room-plan-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, planRow, ROOM_PLAN_ID, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const HOURLY_PAYLOAD = {room_plan_type_id: 'HOURLY', is_used: 1, days_of_week: 62, usage_hours: 4};

describe('admin.room.plan-update — 업체 상품 설정 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomPlan.mockResolvedValue(planRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('시간 이용(HOURLY) — 업체 행을 잠그고 그 업체의 종류 행을 찾아 이용 시간만 저장한다(보낸 입실 · 퇴실 시각은 NULL)', async () => {
            repo.findRoomPlan.mockResolvedValueOnce(planRow({room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', usage_hours: 3, check_in_time: null, check_out_time: null}));

            const {decision, result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.PLAN_UPDATE,
                payload: {...HOURLY_PAYLOAD, check_in_time: '15:00', check_out_time: '11:00'},
                actor: MANAGER_ACTOR,
            });

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.plan-update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomPlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id: 'HOURLY'});
            expect(repo.updateRoomPlan).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoomPlan.mock.calls[0] as [unknown, RoomPlanEntity];
            expect(where).toEqual({room_plan_id: ROOM_PLAN_ID});
            expect(entity).toBeInstanceOf(RoomPlanEntity);
            expect(entity).toMatchObject({is_used: 1, days_of_week: 62, usage_hours: 4, check_in_time: null, check_out_time: null});
            expect(entity.store_id).toBeUndefined();
        });

        it.each(['NIGHT', 'LONG'] as const)('%s — 입실 · 퇴실 시각만 저장한다(보낸 이용 시간은 NULL, 퇴실이 입실보다 이르면 다음 날)', async (room_plan_type_id) => {
            const {result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.PLAN_UPDATE,
                payload: {room_plan_type_id, is_used: 0, days_of_week: 127, usage_hours: 5, check_in_time: '15:00', check_out_time: '11:00'},
                actor: MANAGER_ACTOR,
            });

            expect(result).toEqual({result: null, error: null});
            expect(repo.findRoomPlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id});
            const [where, entity] = repo.updateRoomPlan.mock.calls[0] as [unknown, RoomPlanEntity];
            expect(where).toEqual({room_plan_id: ROOM_PLAN_ID});
            expect(entity).toBeInstanceOf(RoomPlanEntity);
            expect(entity).toMatchObject({is_used: 0, days_of_week: 127, usage_hours: null, check_in_time: '15:00', check_out_time: '11:00'});
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['시간 이용인데 이용 시간 없음', {room_plan_type_id: 'HOURLY', is_used: 1, days_of_week: 127}, 'usage_hours', '시간 이용은 이용 시간을 입력해주세요.'],
            ['1박인데 입실 시각 없음', {room_plan_type_id: 'NIGHT', is_used: 1, days_of_week: 127, check_out_time: '11:00'}, 'check_in_time', '입실 시각을 입력해주세요.'],
            ['연박인데 퇴실 시각 없음', {room_plan_type_id: 'LONG', is_used: 1, days_of_week: 127, check_in_time: '15:00'}, 'check_out_time', '퇴실 시각을 입력해주세요.'],
            ['1박인데 이용 시간만(시각 둘 다 없음) → 입실부터', {room_plan_type_id: 'NIGHT', is_used: 1, days_of_week: 127, usage_hours: 3}, 'check_in_time', '입실 시각을 입력해주세요.'],
            ['입실 = 퇴실', {room_plan_type_id: 'NIGHT', is_used: 1, days_of_week: 127, check_in_time: '12:00', check_out_time: '12:00'}, 'check_out_time', '입실과 퇴실 시각이 같을 수 없습니다.'],
        ])('%s → failed 400 validation_errors.%s, 수정 없음', async (_label, payload, property, message) => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.plan-update.failed');
            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property, message}]}});
            expect(repo.updateRoomPlan).not.toHaveBeenCalled();
        });

        it('종류 행이 없으면 failed 404, 수정 없음', async () => {
            repo.findRoomPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: HOURLY_PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoomPlan).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 종류 행 조회 · 수정 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: HOURLY_PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomPlan).not.toHaveBeenCalled();
            expect(repo.updateRoomPlan).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['예약 가능 요일 0(팔지 않으려면 사용 여부 0)', {is_used: 1, days_of_week: 0}, 'days_of_week', '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'],
            ['예약 가능 요일 128', {is_used: 1, days_of_week: 128}, 'days_of_week', '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'],
            ['이용 시간 25', {is_used: 1, days_of_week: 127, usage_hours: 25}, 'usage_hours', '이용 시간은 1 ~ 24시간 사이로 입력해주세요.'],
            ['입실 시각 24:00', {is_used: 1, days_of_week: 127, check_in_time: '24:00'}, 'check_in_time', '입실 시각을 HH:mm 으로 입력해주세요.'],
            ['사용 여부 2', {is_used: 2, days_of_week: 127}, 'is_used', '사용 여부가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomPlanUpdateDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it('이용 시간 · 시각은 선택 필드 — 종류 조합은 service 가 가른다', async () => {
            await expect(validateBody(RoomPlanUpdateDto, {is_used: 1, days_of_week: 127})).resolves.toBeNull();
        });

        it('종류 경로가 HOURLY · NIGHT · LONG 이 아니면 → room_plan_type_id', async () => {
            await expect(validateBody(RoomPlanUpdateParamDto, {room_plan_type_id: 'WEEKLY'})).resolves.toEqual({
                message: '상품 종류가 올바르지 않습니다.',
                validation_errors: [{property: 'room_plan_type_id', message: '상품 종류가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: HOURLY_PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
