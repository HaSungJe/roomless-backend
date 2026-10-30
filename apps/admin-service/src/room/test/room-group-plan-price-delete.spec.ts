import type {TestingModule} from '@nestjs/testing';
import {RoomGroupPlanPriceDeleteParamDto} from '@app/contracts/room/dto/room-group-plan-price-delete.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    groupPlanRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    ROOM_GROUP_PLAN_PRICE_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PAYLOAD = {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT', room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID};

describe('admin.room.group-plan-price-delete — 상품별 기간 가격 삭제 (큐 경로)', () => {
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
        it('그 그룹 상품의 기간 가격만 소프트 삭제한다(조회 없이 affected 로 판별)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-plan-price-delete.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.deleteRoomGroupPlanPrice).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroupPlanPrice).toHaveBeenCalledWith({room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID, room_group_plan_id: ROOM_GROUP_PLAN_ID});
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('지운 행이 없으면(다른 그룹 상품 · 이미 지운 것) failed 404', async () => {
            repo.deleteRoomGroupPlanPrice.mockResolvedValueOnce(false);

            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 404, body: {message: '기간 가격을 찾을 수 없습니다.', validation_errors: null}});
        });

        it('그룹 상품 행이 없으면 failed 404, 삭제 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체) failed 404, 그룹 상품 조회 · 삭제 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 · 삭제 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroupPlanPrice).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('기간 가격 ID 경로가 32자 hex 가 아니면 → room_group_plan_price_id', async () => {
            await expect(validateBody(RoomGroupPlanPriceDeleteParamDto, {...PAYLOAD, room_group_plan_price_id: 'xyz'})).resolves.toEqual({
                message: '기간 가격 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_plan_price_id', message: '기간 가격 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
