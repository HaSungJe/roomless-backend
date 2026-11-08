import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {ReservationStoreCancelDto} from '@app/contracts/reservation/dto/reservation-store-cancel.dto.js';
import {RESERVATION_MANAGER_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createReservationRepositoryMock,
    createSmsSenderMock,
    detailEntity,
    MANAGER_ACTOR,
    PAYMENT_ID,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    runCommand,
    SmsSenderMock,
    STORE_ID,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID, cancel_reason: '설비 고장'};

/** 이용 중 예약 업체 취소 거절 메시지 */
const IN_USE = '이용 중인 예약은 이용자 동의를 받아 취소합니다.';

describe('admin.reservation.store-cancel — 업체 취소 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
        repo = createReservationRepositoryMock();
        repo.findReservationUser.mockResolvedValue({user_id: USER_ACTOR.user_id, phone: '01012345678'});
        sms = createSmsSenderMock();
        ({dispatcher, module} = await bootCommandPath(repo, sms));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 업체 취소 명령 1건
     *
     * @returns 판정 · 결과
     */
    function runStoreCancel() {
        return runCommand(dispatcher, {type: RESERVATION_MANAGER_COMMAND.STORE_CANCEL, payload: PAYLOAD, actor: MANAGER_ACTOR});
    }

    it('[SUCCESS] 시작 전 확정 예약 — 예약 · 구간 CANCELED(주체 STORE) + 구간 금액 100% 환불 신청 + 이용자 SMS(마지막)', async () => {
        const {decision} = await runStoreCancel();

        expect(decision.action).toBe('ack');
        expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
        expect(repo.findReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, store_id: STORE_ID});
        expect(repo.findReservationUser).toHaveBeenCalledWith({user_id: USER_ACTOR.user_id});
        const [, canceled] = repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity];
        expect(canceled).toMatchObject({reservation_state_id: 'CANCELED', cancel_actor: 'STORE', cancel_reason: '설비 고장', canceled_at: new Date('2026-11-09T00:00:00Z')});
        const [where, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
        expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'DONE'});
        expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', refund_amount: 30000, refund_reason: '업체 예약 취소', refund_requested_at: new Date('2026-11-09T00:00:00Z')});
        expect(sms.send).toHaveBeenCalledTimes(1);
        expect(sms.send).toHaveBeenCalledWith({to: '01012345678', text: '[roomless] 루미 강남점 11/10 13:00 예약이 업체 사정으로 취소되었습니다. 결제 금액은 전액 환불됩니다. 사유: 설비 고장'});
        expect(sms.send.mock.invocationCallOrder[0]).toBeGreaterThan(repo.updatePayment.mock.invocationCallOrder[0]);
    });

    it('[SUCCESS] 결제 대기 예약 — 결제 EXPIRED(환불 없음)', async () => {
        repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'PENDING'}));
        repo.findReservationDetails.mockResolvedValueOnce([detailEntity({reservation_state_id: 'PENDING'})]);

        await runStoreCancel();

        const [where, expired] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
        expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'READY'});
        expect(expired.payment_state_id).toBe('EXPIRED');
    });

    it('[SUCCESS] 시작 1초 전(12:59:59) 확정 예약은 취소된다', async () => {
        vi.setSystemTime(new Date('2026-11-10T03:59:59Z'));

        const {decision} = await runStoreCancel();

        expect(decision.action).toBe('ack');
        expect(repo.updateReservation).toHaveBeenCalledTimes(1);
    });

    it('[SKIP] 이용자 번호가 없으면(휴대폰 인증 전) SMS 를 건너뛰고 done', async () => {
        repo.findReservationUser.mockResolvedValue({user_id: USER_ACTOR.user_id, phone: null});

        const {decision} = await runStoreCancel();

        expect(decision.action).toBe('ack');
        expect(sms.send).not.toHaveBeenCalled();
    });

    it.each([
        ['확정 · 시작 정각(13:00)', {}, '2026-11-10T04:00:00Z'],
        ['확정 · 시작 뒤(14:00 — scheduler 가 이용 중으로 바꾸기 전)', {}, '2026-11-10T05:00:00Z'],
        ['이용 중', {reservation_state_id: 'CHECKED_IN'}, '2026-11-10T05:00:00Z'],
        ['결제 대기 · 시작 뒤(지금 바로 예약)', {reservation_state_id: 'PENDING'}, '2026-11-10T04:01:00Z'],
    ])('[FAIL:service] %s 은 400 이용 중인 예약은 이용자 동의를 받아 취소합니다, 쓰기 · SMS 없음', async (_label, override, now) => {
        vi.setSystemTime(new Date(now));
        repo.findReservation.mockResolvedValueOnce(reservationEntity(override));

        const {result} = await runStoreCancel();

        expect(result?.error).toEqual({status_code: 400, body: {message: IN_USE, validation_errors: null}});
        expect(repo.updateReservation).not.toHaveBeenCalled();
        expect(repo.updatePayment).not.toHaveBeenCalled();
        expect(sms.send).not.toHaveBeenCalled();
    });

    it.each(['COMPLETED', 'CANCELED'])('[FAIL:service] %s 예약은 400 취소할 수 없는 예약, 쓰기 없음', async (state) => {
        repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: state}));

        const {result} = await runStoreCancel();

        expect(result?.error).toEqual({status_code: 400, body: {message: '취소할 수 없는 예약입니다.', validation_errors: null}});
        expect(repo.updateReservation).not.toHaveBeenCalled();
    });

    it('[FAIL:service] 다른 업체 예약(없음)은 404, 쓰기 없음', async () => {
        repo.findReservation.mockResolvedValueOnce(null);

        const {result} = await runStoreCancel();

        expect(result?.error).toEqual({status_code: 404, body: {message: '예약을 찾을 수 없습니다.', validation_errors: null}});
        expect(repo.updateReservation).not.toHaveBeenCalled();
    });

    it('[FAIL:external] SMS 503 이면 재시도(쓰기는 롤백 — 다시 돌 때 같은 결과)', async () => {
        sms.send.mockRejectedValueOnce(new ServiceUnavailableException({message: 'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.'}));

        const {decision} = await runStoreCancel();

        expect(decision.action).toBe('requeue');
    });

    it('[FAIL:validation] 사유가 없으면 → cancel_reason', async () => {
        await expect(validateBody(ReservationStoreCancelDto, {})).resolves.toEqual({
            message: '취소 사유를 입력해주세요.',
            validation_errors: [{property: 'cancel_reason', message: '취소 사유를 입력해주세요.'}],
        });
    });
});
