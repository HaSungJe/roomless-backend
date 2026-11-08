import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {ReservationCancelDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createDoorStoreMock,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    detailEntity,
    DoorStoreMock,
    PAYMENT_ID,
    paymentEntity,
    QR,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    ROOM_ID,
    ROOM_QR_ID,
    roomEntity,
    roomQrEntity,
    runCommand,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID, cancel_reason: '일정이 바뀌었습니다'};

/** 이용 시작 후 취소 불가 메시지 */
const STARTED = '이용 시작 후에는 취소할 수 없습니다.';

/** 환불액 케이스 입력 — 이용 2026-11-10 13:00 ~ 16:00(한국 시각), 환불 마감 12:00 */
interface RefundCase {
    state?: string;
    disabled?: boolean;
    now: string;
    amount?: number;
    late_refund_percent?: number;
    refund_deadline_at?: string;
    refund: number | null;
}

/**
 * [CASES:cancel-refund] — 이용자 취소 환불액(사용자 확정 2026-11-03 · 사용중지 호실 2026-11-07). 기본 확정 · 결제 30,000원 · 환불 마감 12:00(60분 전) · 마감 뒤 50%.
 * 사용중지 호실이면 확정 · 이용 중을 끝 전까지 100%, 아니면 확정만 마감 전 100% · 마감 뒤 비율 · 시작 뒤 불가.
 * [이름, 입력 · 기대 환불액(null = 취소 불가 400)]
 */
const REFUND_CASES: [string, RefundCase][] = [
    ['1. 확정 · 마감 전(11:59) · 30,000원 → 30,000', {now: '2026-11-10T02:59:00Z', refund: 30000}],
    ['2. 확정 · 마감 정각(12:00) · 50% · 30,000원 → 15,000', {now: '2026-11-10T03:00:00Z', refund: 15000}],
    ['3. 확정 · 마감 뒤 · 50% · 33,333원 → 16,666(원 단위 내림)', {now: '2026-11-10T03:30:00Z', amount: 33333, refund: 16666}],
    ['4. 확정 · 마감 뒤 · 0% → 0(환불 없이 취소)', {now: '2026-11-10T03:30:00Z', late_refund_percent: 0, refund: 0}],
    ['5. 확정 · 시작 정각(13:00) · 사용중지 아님 → 취소 불가', {now: '2026-11-10T04:00:00Z', refund: null}],
    ['6. 이용 중 · 사용중지 아님 → 취소 불가', {state: 'CHECKED_IN', now: '2026-11-10T05:00:00Z', refund: null}],
    ['7. 확정 · 마감 뒤 · 사용중지 → 30,000(100%)', {disabled: true, now: '2026-11-10T03:30:00Z', refund: 30000}],
    ['8. 확정 · 시작 뒤(14:00) · 사용중지 → 30,000', {disabled: true, now: '2026-11-10T05:00:00Z', refund: 30000}],
    ['9. 이용 중 · 끝 − 1초(15:59:59) · 사용중지 → 30,000', {state: 'CHECKED_IN', disabled: true, now: '2026-11-10T06:59:59Z', refund: 30000}],
    ['10. 이용 중 · 끝 정각(16:00) · 사용중지 → 취소 불가', {state: 'CHECKED_IN', disabled: true, now: '2026-11-10T07:00:00Z', refund: null}],
    ['11. 확정 · 마감 뒤 · 비율 100% → 전액', {now: '2026-11-10T03:30:00Z', late_refund_percent: 100, refund: 30000}],
    ['12. 확정 · 마감 0분(마감 = 시작) · 12:59 → 100%', {now: '2026-11-10T03:59:00Z', refund_deadline_at: '2026-11-10T04:00:00Z', refund: 30000}],
];

describe('user.reservation.cancel — 이용자 취소 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let door: DoorStoreMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
        repo = createReservationRepositoryMock();
        door = createDoorStoreMock();
        ({dispatcher, module} = await bootCommandPath(repo, createPaymentGatewayMock(), door));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 취소 명령 1건
     *
     * @param actor 로그인 이용자(없으면 null)
     * @returns 판정 · 결과
     */
    function runCancel(actor: typeof USER_ACTOR | null = USER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.CANCEL, payload: PAYLOAD, actor});
    }

    describe('[CASES:cancel-refund] 환불액', () => {
        it.each(REFUND_CASES)('%s', async (_label, input) => {
            vi.setSystemTime(new Date(input.now));
            repo.findReservation.mockResolvedValueOnce(
                reservationEntity({
                    reservation_state_id: input.state ?? 'CONFIRMED',
                    late_refund_percent: input.late_refund_percent ?? 50,
                    ...(input.refund_deadline_at ? {refund_deadline_at: new Date(input.refund_deadline_at)} : {}),
                }),
            );
            repo.findReservationRoom.mockResolvedValueOnce(roomEntity({room_state_id: input.disabled ? 'DISABLED' : 'AVAILABLE'}));
            repo.findPayment.mockResolvedValueOnce(paymentEntity({amount: input.amount ?? 30000}));

            const {result} = await runCancel();

            expect(repo.findReservationRoom).toHaveBeenCalledWith({room_id: ROOM_ID});
            expect(repo.findReservationDetails).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            if (input.refund === null) {
                expect(result?.error).toEqual({status_code: 400, body: {message: STARTED, validation_errors: null}});
                expect(repo.updateReservation).not.toHaveBeenCalled();
                expect(repo.updatePayment).not.toHaveBeenCalled();
                return;
            }
            expect(result?.result).toEqual({refund_amount: input.refund});
            expect(repo.updateReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, reservation_state_id: input.state ?? 'CONFIRMED'}, expect.any(ReservationEntity));
            if (input.refund > 0) {
                const [where, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
                expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'DONE'});
                expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', refund_amount: input.refund, refund_reason: input.disabled ? '사용중지 호실 취소' : '이용자 예약 취소'});
            } else {
                expect(repo.updatePayment).not.toHaveBeenCalled();
            }
        });
    });

    describe('[SUCCESS]', () => {
        it('확정 예약 — 예약 · 구간 CANCELED(주체 USER · 사유 · 시각), 상태 조건 CONFIRMED, 호실 상태는 그대로', async () => {
            await runCancel();

            const [where, canceled] = repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity];
            expect(where).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(canceled).toBeInstanceOf(ReservationEntity);
            expect(canceled).toMatchObject({reservation_state_id: 'CANCELED', cancel_actor: 'USER', cancel_reason: '일정이 바뀌었습니다', canceled_at: new Date('2026-11-09T00:00:00Z')});
            expect(repo.updateReservationDetails).toHaveBeenCalledWith(
                {reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'},
                expect.objectContaining({reservation_state_id: 'CANCELED'}),
            );
            expect(repo.findReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, user_id: USER_ACTOR.user_id});
            expect(repo.updateReservationRoom).not.toHaveBeenCalled();
            expect(repo.updateRoomQr).not.toHaveBeenCalled();
            expect(door.revokeQr).not.toHaveBeenCalled();
        });

        it('사용중지 호실의 이용 중 예약 — 예약 이용 중 → 취소 · 구간 확정 → 취소 · 100% 환불, QR 유효 종료 = 지금 → Redis 지우기(마지막), 호실 상태는 그대로', async () => {
            vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'CHECKED_IN'}));
            repo.findReservationRoom.mockResolvedValueOnce(roomEntity({room_state_id: 'DISABLED'}));
            repo.findRoomQr.mockResolvedValueOnce(roomQrEntity());

            const {decision, result} = await runCancel();

            expect(decision.action).toBe('ack');
            expect(result?.result).toEqual({refund_amount: 30000});
            expect(repo.updateReservation).toHaveBeenCalledWith(
                {reservation_id: RESERVATION_ID, reservation_state_id: 'CHECKED_IN'},
                expect.objectContaining({reservation_state_id: 'CANCELED', cancel_actor: 'USER'}),
            );
            expect(repo.updateReservationDetails).toHaveBeenCalledWith(
                {reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'},
                expect.objectContaining({reservation_state_id: 'CANCELED'}),
            );
            const [qrWhere, endedQr] = repo.updateRoomQr.mock.calls[0] as [unknown, RoomQrEntity];
            expect(qrWhere).toEqual({room_qr_id: ROOM_QR_ID});
            expect(endedQr).toBeInstanceOf(RoomQrEntity);
            expect(endedQr.ends_at).toEqual(new Date('2026-11-10T05:00:00Z'));
            expect(door.revokeQr).toHaveBeenCalledTimes(1);
            expect(door.revokeQr).toHaveBeenCalledWith(ROOM_ID, QR);
            expect(door.revokeQr.mock.invocationCallOrder[0]).toBeGreaterThan(repo.updatePayment.mock.invocationCallOrder[0]);
            expect(repo.updateReservationRoom).not.toHaveBeenCalled();
        });

        it('결제 대기 예약 — 취소 + 결제 EXPIRED(환불 없음), refund_amount null, 호실 · 결제 조회 없음', async () => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'PENDING'}));
            repo.findReservationDetails.mockResolvedValueOnce([detailEntity({reservation_state_id: 'PENDING'})]);

            const {result} = await runCancel();

            expect(result?.result).toEqual({refund_amount: null});
            expect(repo.findReservationDetails).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, reservation_state_id: 'PENDING'});
            const [where, expired] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'READY'});
            expect(expired.payment_state_id).toBe('EXPIRED');
            expect(repo.findPayment).not.toHaveBeenCalled();
            expect(repo.findReservationRoom).not.toHaveBeenCalled();
            expect(door.revokeQr).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it.each(['COMPLETED', 'CANCELED'])('%s 예약은 400 취소할 수 없는 예약, 쓰기 없음', async (state) => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: state}));

            const {result} = await runCancel();

            expect(result?.error).toEqual({status_code: 400, body: {message: '취소할 수 없는 예약입니다.', validation_errors: null}});
            expect(repo.updateReservation).not.toHaveBeenCalled();
        });

        it('남의 예약 · 결제 대기 만료 예약은 404', async () => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'EXPIRED'}));

            const {result} = await runCancel();

            expect(result?.error).toEqual({status_code: 404, body: {message: '예약을 찾을 수 없습니다.', validation_errors: null}});
        });

        it('그 사이 상태가 바뀌었으면(예약 조건 0행) 400, 결제 쓰기 없음', async () => {
            repo.updateReservation.mockResolvedValueOnce(false);

            const {result} = await runCancel();

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null}});
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });

        it('[FAIL:external] Redis 503 이면 재시도(requeue) — 취소 · 환불 신청은 롤백되어 다시 처리한다', async () => {
            vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'CHECKED_IN'}));
            repo.findReservationRoom.mockResolvedValueOnce(roomEntity({room_state_id: 'DISABLED'}));
            repo.findRoomQr.mockResolvedValueOnce(roomQrEntity());
            door.revokeQr.mockRejectedValueOnce(new ServiceUnavailableException({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runCancel();

            expect(decision.action).toBe('requeue');
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('사유가 없으면 → cancel_reason', async () => {
            await expect(validateBody(ReservationCancelDto, {})).resolves.toEqual({
                message: '취소 사유를 입력해주세요.',
                validation_errors: [{property: 'cancel_reason', message: '취소 사유를 입력해주세요.'}],
            });
        });

        it('사유가 256자면 → cancel_reason', async () => {
            await expect(validateBody(ReservationCancelDto, {cancel_reason: 'a'.repeat(256)})).resolves.toEqual({
                message: '취소 사유는 255자 이내로 입력해주세요.',
                validation_errors: [{property: 'cancel_reason', message: '취소 사유는 255자 이내로 입력해주세요.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 예약 조회 없음', async () => {
            const {result} = await runCancel(null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findReservation).not.toHaveBeenCalled();
        });
    });
});
