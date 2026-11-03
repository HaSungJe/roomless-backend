import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    createSmsSenderMock,
    MANAGER_ACTOR,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    roomEntity,
    ROOM_ID,
    ROOM_ID_2,
    runCommand,
    SmsSenderMock,
    STORE_ID,
    USER_ACTOR,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID, room_id: ROOM_ID_2};

describe('user.reservation.room-change — 호실 이동 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
        repo = createReservationRepositoryMock();
        repo.findReservationUser.mockImplementation(async (where: {user_id: string}) =>
            where.user_id === MANAGER_ACTOR.user_id ? {user_id: MANAGER_ACTOR.user_id, store_id: STORE_ID} : {user_id: USER_ACTOR.user_id, phone: '01012345678'},
        );
        repo.findReservationRoom.mockImplementation(async (where: {room_id: string}) => (where.room_id === ROOM_ID ? roomEntity() : roomEntity({room_id: ROOM_ID_2, room_name: '102호'})));
        sms = createSmsSenderMock();
        ({dispatcher, module} = await bootCommandPath(repo, createPaymentGatewayMock(), sms));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 호실 이동 명령 1건
     *
     * @returns 판정 · 결과
     */
    function runChange() {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.ROOM_CHANGE, payload: PAYLOAD, actor: MANAGER_ACTOR});
    }

    it('[SUCCESS] 같은 그룹 · 사용 가능한 호실로 room_id 만 바꾸고(상태 조건 CONFIRMED) 이용자 SMS', async () => {
        const {decision} = await runChange();

        expect(decision.action).toBe('ack');
        expect(repo.findReservationRoom).toHaveBeenCalledWith({room_id: ROOM_ID_2, store_id: STORE_ID});
        const [where, entity] = repo.changeReservationRoom.mock.calls[0] as [unknown, ReservationEntity];
        expect(where).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
        expect(entity).toBeInstanceOf(ReservationEntity);
        expect(entity).toEqual(Object.assign(new ReservationEntity(), {room_id: ROOM_ID_2}));
        expect(sms.send).toHaveBeenCalledWith({to: '01012345678', text: '[roomless] 루미 강남점 11/10 13:00 예약 호실이 101호에서 102호로 변경되었습니다.'});
    });

    it.each([
        ['다른 그룹 호실', roomEntity({room_id: ROOM_ID_2, room_group_id: '7'.repeat(32)}), '같은 객실 그룹의 호실로만 옮길 수 있습니다.'],
        ['사용중지 호실', roomEntity({room_id: ROOM_ID_2, room_state_id: 'DISABLED'}), '사용중지된 호실로는 옮길 수 없습니다.'],
    ])('[FAIL:service] %s 이면 400 validation_errors.room_id, 이동 없음', async (_label, target, message) => {
        repo.findReservationRoom.mockImplementation(async (where: {room_id: string}) => (where.room_id === ROOM_ID ? roomEntity() : target));

        const {result} = await runChange();

        expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property: 'room_id', message}]}});
        expect(repo.changeReservationRoom).not.toHaveBeenCalled();
    });

    it('[FAIL:service] 이용 시작 뒤 · 확정이 아닌 예약은 400', async () => {
        repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'PENDING'}));

        const {result} = await runChange();

        expect(result?.error).toEqual({status_code: 400, body: {message: '이용 시작 전의 확정 예약만 옮길 수 있습니다.', validation_errors: null}});
        expect(repo.changeReservationRoom).not.toHaveBeenCalled();
    });

    it('[FAIL:duplicate] 옮길 호실에 겹치는 예약(배타 제약 — repository 400)이면 failed 400, SMS 없음', async () => {
        repo.changeReservationRoom.mockRejectedValueOnce(new BadRequestException({message: '옮길 호실에 겹치는 예약이 있습니다.'}));

        const {result} = await runChange();

        expect(result?.error).toEqual({status_code: 400, body: {message: '옮길 호실에 겹치는 예약이 있습니다.', validation_errors: null}});
        expect(sms.send).not.toHaveBeenCalled();
    });

    it('[SECURITY] actor 없는 명령은 failed 401', async () => {
        const {result} = await runCommand(dispatcher, {type: RESERVATION_COMMAND.ROOM_CHANGE, payload: PAYLOAD, actor: null});

        expect(result?.error?.status_code).toBe(401);
        expect(repo.findReservation).not.toHaveBeenCalled();
    });
});
