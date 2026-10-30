import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {LessThanOrEqual, MoreThanOrEqual, Not} from 'typeorm';
import {RoomGroupPlanPriceUpdateDto, RoomGroupPlanPriceUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-price-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    groupPlanRow,
    MANAGER_ACTOR,
    priceRow,
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

const PARAM = {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT', room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID};
const PAYLOAD = {...PARAM, start_date: '2026-07-15', end_date: '2026-08-20', price: 130000, memo: '극성수기'};
const OVERLAP_MESSAGE = '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.';

describe('admin.room.group-plan-price-update — 상품별 기간 가격 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupPlan.mockResolvedValue(groupPlanRow());
        repo.findRoomGroupPlanPrice.mockResolvedValue(priceRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 그룹 상품의 기간 가격을 찾아 자기 자신을 뺀 겹침을 세고 4개 필드를 통째로 바꾼다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-plan-price-update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.findRoomGroupPlanPrice).toHaveBeenCalledWith({room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID, room_group_plan_id: ROOM_GROUP_PLAN_ID});
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledWith({
                room_group_plan_id: ROOM_GROUP_PLAN_ID,
                start_date: LessThanOrEqual('2026-08-20'),
                end_date: MoreThanOrEqual('2026-07-15'),
                room_group_plan_price_id: Not(ROOM_GROUP_PLAN_PRICE_ID),
            });
            expect(repo.updateRoomGroupPlanPrice).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoomGroupPlanPrice.mock.calls[0] as [unknown, RoomGroupPlanPriceEntity];
            expect(where).toEqual({room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID});
            expect(entity).toBeInstanceOf(RoomGroupPlanPriceEntity);
            expect(entity).toMatchObject({start_date: '2026-07-15', end_date: '2026-08-20', price: 130000, memo: '극성수기'});
            expect(entity.room_group_plan_id).toBeUndefined();
            expect(entity.is_deleted).toBeUndefined();
        });

        it('메모를 보내지 않으면 null 로 바꾼다(통째로 교체)', async () => {
            const {memo: _memo, ...withoutMemo} = PAYLOAD;

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: withoutMemo, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect((repo.updateRoomGroupPlanPrice.mock.calls[0][1] as RoomGroupPlanPriceEntity).memo).toBeNull();
        });
    });

    describe('[FAIL:service]', () => {
        it('기간 가격이 없으면(다른 그룹 상품 · 지운 것) failed 404, 수정 없음', async () => {
            repo.findRoomGroupPlanPrice.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '기간 가격을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it.each([
            ['없는 시작 날짜(02-30)', '2026-02-30', '2026-03-02', 'start_date', '없는 시작 날짜입니다.'],
            ['없는 종료 날짜(13월)', '2026-07-15', '2026-13-01', 'end_date', '없는 종료 날짜입니다.'],
            ['종료 < 시작', '2026-08-20', '2026-07-15', 'end_date', '종료 날짜는 시작 날짜보다 빠를 수 없습니다.'],
        ])('%s → failed 400 validation_errors.%s, 겹침 확인 · 수정 없음', async (_label, start_date, end_date, property, message) => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: {...PAYLOAD, start_date, end_date}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property, message}]}});
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹 상품 행이 없으면 failed 404, 기간 가격 조회 · 수정 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlanPrice).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹이 없으면 failed 404, 그룹 상품 조회 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('자기 자신 말고 다른 기간과 겹치면(선검사) failed 400, 수정 없음', async () => {
            repo.countRoomGroupPlanPrices.mockResolvedValueOnce(1);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: OVERLAP_MESSAGE, validation_errors: null}});
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('DB 배타 제약 위반(EXC 23P01 → repository 400)도 같은 failed 400', async () => {
            repo.updateRoomGroupPlanPrice.mockRejectedValueOnce(new BadRequestException({message: OVERLAP_MESSAGE}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: OVERLAP_MESSAGE, validation_errors: null}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('기간 요금 10,000,001원 → price', async () => {
            await expect(validateBody(RoomGroupPlanPriceUpdateDto, {start_date: '2026-07-15', end_date: '2026-08-20', price: 10000001})).resolves.toEqual({
                message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.',
                validation_errors: [{property: 'price', message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'}],
            });
        });

        it('기간 가격 ID 경로가 32자 hex 가 아니면 → room_group_plan_price_id', async () => {
            await expect(validateBody(RoomGroupPlanPriceUpdateParamDto, {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT', room_group_plan_price_id: 'xyz'})).resolves.toEqual({
                message: '기간 가격 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_plan_price_id', message: '기간 가격 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
