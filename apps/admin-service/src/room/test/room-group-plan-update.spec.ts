import type {TestingModule} from '@nestjs/testing';
import {RoomGroupPlanUpdateDto, RoomGroupPlanUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    groupPlanRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PARAM = {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'};
const SELL_PRICE_MESSAGE = '판매하려면 요금을 1원 이상 입력해주세요.';

describe('admin.room.group-plan-update — 그룹 상품 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupPlan.mockResolvedValue(groupPlanRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹 × 경로의 종류 행을 찾아 사용 여부 · 요금을 바꾼다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 89000}, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-plan-update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.updateRoomGroupPlan).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoomGroupPlan.mock.calls[0] as [unknown, RoomGroupPlanEntity];
            expect(where).toEqual({room_group_plan_id: ROOM_GROUP_PLAN_ID});
            expect(entity).toBeInstanceOf(RoomGroupPlanEntity);
            expect(entity).toMatchObject({is_used: 1, price: 89000});
            expect(entity.room_group_id).toBeUndefined();
            expect(entity.room_plan_type_id).toBeUndefined();
        });

        it('판매 안 함(is_used 0)이면 요금 0 도 된다', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 0, price: 0}, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.updateRoomGroupPlan.mock.calls[0][1]).toMatchObject({is_used: 0, price: 0});
        });
    });

    describe('[FAIL:service]', () => {
        it('판매(is_used 1)인데 요금 0 이면 failed 400 validation_errors.price, 수정 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 0}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: SELL_PRICE_MESSAGE, validation_errors: [{property: 'price', message: SELL_PRICE_MESSAGE}]}});
            expect(repo.updateRoomGroupPlan).not.toHaveBeenCalled();
        });

        it('그룹 상품 행이 없으면 failed 404, 수정 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 89000}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoomGroupPlan).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체 · 지운 그룹) failed 404, 그룹 상품 조회 · 수정 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 89000}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupPlan).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['요금 10,000,001원', {is_used: 1, price: 10000001}, 'price', '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'],
            ['요금 -1원', {is_used: 0, price: -1}, 'price', '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'],
            ['사용 여부 2', {is_used: 2, price: 1000}, 'is_used', '사용 여부가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomGroupPlanUpdateDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it('종류 경로가 HOURLY · NIGHT · LONG 이 아니면 → room_plan_type_id', async () => {
            await expect(validateBody(RoomGroupPlanUpdateParamDto, {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'WEEKLY'})).resolves.toEqual({
                message: '상품 종류가 올바르지 않습니다.',
                validation_errors: [{property: 'room_plan_type_id', message: '상품 종류가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 89000}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
