import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {LessThanOrEqual, MoreThanOrEqual} from 'typeorm';
import {RoomGroupPlanPriceDto} from '@app/contracts/room/dto/room-group-plan-price.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    groupPlanRow,
    ID_PATTERN,
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
const PAYLOAD = {...PARAM, start_date: '2026-07-01', end_date: '2026-08-31', price: 120000, memo: '여름 성수기'};
const OVERLAP_MESSAGE = '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.';

describe('admin.room.group-plan-price — 상품별 기간 가격 등록 (큐 경로)', () => {
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
        it('업체 행 잠금 아래 그 그룹 상품의 겹침(시작 ≤ 새 종료 · 종료 ≥ 새 시작)을 세고 등록한다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-plan-price.done');
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledTimes(1);
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: LessThanOrEqual('2026-08-31'), end_date: MoreThanOrEqual('2026-07-01')});
            expect(repo.insertRoomGroupPlanPrice).toHaveBeenCalledTimes(1);
            const inserted = repo.insertRoomGroupPlanPrice.mock.calls[0][0] as RoomGroupPlanPriceEntity;
            expect(inserted).toBeInstanceOf(RoomGroupPlanPriceEntity);
            expect(inserted.room_group_plan_price_id).toMatch(ID_PATTERN);
            expect(inserted).toMatchObject({room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: '2026-07-01', end_date: '2026-08-31', price: 120000, memo: '여름 성수기', is_deleted: 0});
            expect(repo.countRoomGroupPlanPrices.mock.invocationCallOrder[0]).toBeLessThan(repo.insertRoomGroupPlanPrice.mock.invocationCallOrder[0]);
            expect(result).toEqual({result: {room_group_plan_price_id: inserted.room_group_plan_price_id}, error: null});
        });

        it.each([
            ['메모 없음', undefined],
            ['빈 메모', ''],
        ])('하루짜리(시작 = 종료)도 된다 — %s 는 null', async (_label, memo) => {
            const {result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_PLAN_PRICE,
                payload: {...PARAM, start_date: '2026-12-24', end_date: '2026-12-24', price: 150000, memo},
                actor: MANAGER_ACTOR,
            });

            expect(result?.error).toBeNull();
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: LessThanOrEqual('2026-12-24'), end_date: MoreThanOrEqual('2026-12-24')});
            expect(repo.insertRoomGroupPlanPrice.mock.calls[0][0]).toMatchObject({start_date: '2026-12-24', end_date: '2026-12-24', memo: null});
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['없는 시작 날짜(02-30)', '2026-02-30', '2026-03-02', 'start_date', '없는 시작 날짜입니다.'],
            ['없는 종료 날짜(13월)', '2026-07-01', '2026-13-01', 'end_date', '없는 종료 날짜입니다.'],
            ['종료 < 시작', '2026-08-31', '2026-07-01', 'end_date', '종료 날짜는 시작 날짜보다 빠를 수 없습니다.'],
        ])('%s → failed 400 validation_errors.%s, 겹침 확인 · 등록 없음', async (_label, start_date, end_date, property, message) => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: {...PAYLOAD, start_date, end_date}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property, message}]}});
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹 상품 행이 없으면 failed 404, 겹침 확인 · 등록 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체 · 지운 그룹) failed 404, 그룹 상품 조회 · 등록 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupPlanPrice).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('같은 그룹 상품의 다른 기간과 겹치면(선검사) failed 400, 등록 없음', async () => {
            repo.countRoomGroupPlanPrices.mockResolvedValueOnce(1);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: OVERLAP_MESSAGE, validation_errors: null}});
            expect(repo.insertRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('선검사를 지나 DB 배타 제약에 걸려도(EXC 23P01 → repository 400) 같은 failed 400 — 재시도 없음', async () => {
            repo.insertRoomGroupPlanPrice.mockRejectedValueOnce(new BadRequestException({message: OVERLAP_MESSAGE}));

            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: OVERLAP_MESSAGE, validation_errors: null}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['시작 날짜 모양(슬래시)', {start_date: '2026/07/01', end_date: '2026-08-31', price: 120000}, 'start_date', '시작 날짜를 YYYY-MM-DD 로 입력해주세요.'],
            ['종료 날짜 모양(한 자리 월)', {start_date: '2026-07-01', end_date: '2026-8-31', price: 120000}, 'end_date', '종료 날짜를 YYYY-MM-DD 로 입력해주세요.'],
            ['기간 요금 0원', {start_date: '2026-07-01', end_date: '2026-08-31', price: 0}, 'price', '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'],
            ['메모 31자', {start_date: '2026-07-01', end_date: '2026-08-31', price: 120000, memo: '가'.repeat(31)}, 'memo', '메모는 30자 이내로 입력해주세요.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomGroupPlanPriceDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it('메모 30자 · 요금 10,000,000원은 통과', async () => {
            await expect(validateBody(RoomGroupPlanPriceDto, {start_date: '2026-07-01', end_date: '2026-08-31', price: 10000000, memo: '가'.repeat(30)})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
