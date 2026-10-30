import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {createValidationError} from '@app/common/utils/validation.js';
import {RoomGroupDto} from '@app/contracts/room/dto/room-group.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, ID_PATTERN, MANAGER_ACTOR, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const NAME_TAKEN = '이미 있는 그룹명입니다.';

describe('admin.room.group-create — 객실 그룹 등록 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 행을 잠그고 그룹을 넣은 뒤(상세정보는 알려진 항목만 + 빠진 항목은 기본값) 그룹 상품 3행(HOURLY · NIGHT · LONG — 사용 안 함 · 0원)을 넣는다', async () => {
            const {decision, result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_CREATE,
                payload: {room_group_name: '스탠다드', description: '창가 객실', room_group_detail: {has_tv: 0, unknown: 1}},
                actor: MANAGER_ACTOR,
            });

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-create.done');
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.insertRoomGroup).toHaveBeenCalledTimes(1);
            const group = repo.insertRoomGroup.mock.calls[0][0] as RoomGroupEntity;
            expect(group).toBeInstanceOf(RoomGroupEntity);
            expect(group.room_group_id).toMatch(ID_PATTERN);
            expect(group).toMatchObject({store_id: STORE_ID, room_group_name: '스탠다드', description: '창가 객실', is_deleted: 0});
            expect(group.room_group_detail).toEqual({room_count: 1, has_shower: 1, has_tv: 0, has_pc: 1});
            expect(repo.insertRoomGroupPlans).toHaveBeenCalledTimes(1);
            const plans = repo.insertRoomGroupPlans.mock.calls[0][0] as RoomGroupPlanEntity[];
            expect(plans).toHaveLength(3);
            expect(plans.every((plan) => plan instanceof RoomGroupPlanEntity && ID_PATTERN.test(plan.room_group_plan_id))).toBe(true);
            expect(new Set(plans.map((plan) => plan.room_group_plan_id)).size).toBe(3);
            expect(plans.map(({room_group_id, room_plan_type_id, is_used, price}) => ({room_group_id, room_plan_type_id, is_used, price}))).toEqual([
                {room_group_id: group.room_group_id, room_plan_type_id: 'HOURLY', is_used: 0, price: 0},
                {room_group_id: group.room_group_id, room_plan_type_id: 'NIGHT', is_used: 0, price: 0},
                {room_group_id: group.room_group_id, room_plan_type_id: 'LONG', is_used: 0, price: 0},
            ]);
            expect(repo.insertRoomGroup.mock.invocationCallOrder[0]).toBeLessThan(repo.insertRoomGroupPlans.mock.invocationCallOrder[0]);
            expect(result).toEqual({result: {room_group_id: group.room_group_id}, error: null});
        });

        it('설명 · 상세정보를 보내지 않으면 설명 null, 상세정보는 기본값 전부', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_CREATE, payload: {room_group_name: '스탠다드'}, actor: MANAGER_ACTOR});

            expect(result?.error).toBeNull();
            const group = repo.insertRoomGroup.mock.calls[0][0] as RoomGroupEntity;
            expect(group.description).toBeNull();
            expect(group.room_group_detail).toEqual({room_count: 1, has_shower: 1, has_tv: 1, has_pc: 1});
            expect(repo.insertRoomGroupPlans).toHaveBeenCalledTimes(1);
        });

        it('빈 설명은 null, 상세정보의 null 항목은 값이 없는 것 — 기본값으로 채운다', async () => {
            await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_CREATE,
                payload: {room_group_name: '스탠다드', description: '', room_group_detail: {room_count: 2, has_pc: null}},
                actor: MANAGER_ACTOR,
            });

            const group = repo.insertRoomGroup.mock.calls[0][0] as RoomGroupEntity;
            expect(group.description).toBeNull();
            expect(group.room_group_detail).toEqual({room_count: 2, has_shower: 1, has_tv: 1, has_pc: 1});
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('같은 업체에 지워지지 않은 같은 그룹명이 있으면(UK 변환 — repository 400) failed 400 validation_errors.room_group_name, 그룹 상품 없음', async () => {
            repo.insertRoomGroup.mockRejectedValueOnce(new BadRequestException({message: NAME_TAKEN, validation_errors: createValidationError('room_group_name', NAME_TAKEN)}));

            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_CREATE, payload: {room_group_name: '스탠다드'}, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: NAME_TAKEN, validation_errors: [{property: 'room_group_name', message: NAME_TAKEN}]}});
            expect(repo.insertRoomGroupPlans).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 failed 404, 그룹 · 그룹 상품 등록 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_CREATE, payload: {room_group_name: '스탠다드'}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.insertRoomGroup).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupPlans).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe — 상세정보는 점 경로', () => {
        it.each([
            ['그룹명 101자', {room_group_name: '가'.repeat(101)}, 'room_group_name', '그룹명은 100자 이내로 입력해주세요.'],
            ['설명 2,001자', {room_group_name: '스탠다드', description: '가'.repeat(2001)}, 'description', '설명은 2,000자 이내로 입력해주세요.'],
            ['방 개수 21', {room_group_name: '스탠다드', room_group_detail: {room_count: 21}}, 'room_group_detail.room_count', '방 개수는 1 ~ 20 사이로 입력해주세요.'],
            ['방 개수 0', {room_group_name: '스탠다드', room_group_detail: {room_count: 0}}, 'room_group_detail.room_count', '방 개수는 1 ~ 20 사이로 입력해주세요.'],
            ['TV 유무 2', {room_group_name: '스탠다드', room_group_detail: {has_tv: 2}}, 'room_group_detail.has_tv', 'TV 유무가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomGroupDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it('선언 안 된 상세 항목은 게이트웨이가 막지 않는다(whitelist 꺼짐) — service 가 버린다', async () => {
            await expect(validateBody(RoomGroupDto, {room_group_name: '스탠다드', room_group_detail: {has_tv: 0, unknown: 1}})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_CREATE, payload: {room_group_name: '스탠다드'}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
