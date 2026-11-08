import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {ReservationCancelRequestApproveParamDto} from '@app/contracts/reservation/dto/reservation-cancel-request-approve.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationCancelRequestEntity} from '@app/database/entities/reservation/reservation-cancel-request.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    CANCEL_REQUEST_ID,
    cancelRequestEntity,
    createDoorStoreMock,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    DoorStoreMock,
    PAYMENT_ID,
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

const PAYLOAD = {reservation_id: RESERVATION_ID};

/** 지금 — 2026-11-10 14:05(한국 시각), 이용 13:00 ~ 16:00 · 요청 14:00 · 만료 14:10 */
const NOW = new Date('2026-11-10T05:05:00Z');

/** 승인할 수 없는 요청 메시지 */
const NOT_RESPONDABLE = '승인할 수 없는 취소 요청입니다(만료 · 처리됨).';

describe('user.reservation.cancel-request-approve — 이용 중 취소 요청 승인 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let door: DoorStoreMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createReservationRepositoryMock();
        repo.findReservation.mockResolvedValue(reservationEntity({reservation_state_id: 'CHECKED_IN'}));
        repo.findLatestCancelRequest.mockResolvedValue(cancelRequestEntity());
        repo.findReservationRoom.mockResolvedValue(roomEntity({room_state_id: 'IN_USE'}));
        repo.findRoomQr.mockResolvedValue(roomQrEntity());
        door = createDoorStoreMock();
        ({dispatcher, module} = await bootCommandPath(repo, createPaymentGatewayMock(), door));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 승인 명령 1건
     *
     * @param actor 로그인 이용자(없으면 null)
     * @returns 판정 · 결과
     */
    function runApprove(actor: typeof USER_ACTOR | null = USER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.CANCEL_REQUEST_APPROVE, payload: PAYLOAD, actor});
    }

    /**
     * [CASES:cancel-request] 상태 — 승인할 수 있는가(사용자 확정 2026-11-07). 요청 14:00 · 만료 14:10.
     * [이름, 저장된 상태, 지금, 승인 가능]
     */
    describe('[CASES:cancel-request] 승인 가능', () => {
        it.each([
            ['요청 중 · 지금 = 만료 − 1초(14:09:59) → 승인', 'REQUESTED', '2026-11-10T05:09:59Z', true],
            ['요청 중 · 지금 = 만료 정각(14:10) → 만료 · 불가', 'REQUESTED', '2026-11-10T05:10:00Z', false],
            ['승인(저장) → 불가', 'APPROVED', '2026-11-10T05:05:00Z', false],
            ['거절(저장) → 불가', 'REJECTED', '2026-11-10T05:05:00Z', false],
            ['만료(저장) → 불가', 'EXPIRED', '2026-11-10T05:05:00Z', false],
        ])('%s', async (_label, reservation_cancel_request_state_id, now, respondable) => {
            vi.setSystemTime(new Date(now));
            repo.findLatestCancelRequest.mockResolvedValueOnce(cancelRequestEntity({reservation_cancel_request_state_id}));

            const {result} = await runApprove();

            if (respondable) {
                expect(result?.result).toEqual({refund_amount: 30000});
                expect(repo.updateCancelRequest).toHaveBeenCalledTimes(1);
                return;
            }
            expect(result?.error).toEqual({status_code: 400, body: {message: NOT_RESPONDABLE, validation_errors: null}});
            expect(repo.updateReservation).not.toHaveBeenCalled();
            expect(repo.updatePayment).not.toHaveBeenCalled();
            expect(repo.updateCancelRequest).not.toHaveBeenCalled();
            expect(door.revokeQr).not.toHaveBeenCalled();
        });
    });

    /**
     * [CASES:room-state] 종료 — 이용 중 취소 승인은 이용 종료와 같다: 사용중만 정비중, 그 밖은 그대로(사용자 확정 2026-11-07).
     * [이름, 호실 상태, 정비중으로 바꾸는가]
     */
    describe('[CASES:room-state] 종료 — 호실 상태 → 정비중 / 그대로', () => {
        it.each([
            ['사용중 + 종료 → 정비중', 'IN_USE', true],
            ['예약가능 + 종료 → 그대로', 'AVAILABLE', false],
            ['사용중지 + 종료 → 그대로', 'DISABLED', false],
            ['정비중 + 종료 → 그대로', 'MAINTENANCE', false],
        ])('%s', async (_label, room_state_id, changes) => {
            repo.findReservationRoom.mockResolvedValueOnce(roomEntity({room_state_id}));

            const {result} = await runApprove();

            expect(result?.result).toEqual({refund_amount: 30000});
            expect(repo.findReservationRoom).toHaveBeenCalledWith({room_id: ROOM_ID});
            if (!changes) {
                expect(repo.updateReservationRoom).not.toHaveBeenCalled();
                return;
            }
            const [where, room] = repo.updateReservationRoom.mock.calls[0] as [unknown, RoomEntity];
            expect(where).toEqual({room_id: ROOM_ID, room_state_id: 'IN_USE'});
            expect(room).toBeInstanceOf(RoomEntity);
            expect(room.room_state_id).toBe('MAINTENANCE');
        });
    });

    describe('[SUCCESS]', () => {
        it('업체 취소와 같은 결과 — 예약 · 구간 취소(주체 업체 · 요청 사유) · 전액 환불 신청 · QR 유효 종료 = 지금 · 요청 승인, Redis 지우기는 마지막', async () => {
            const {decision, result} = await runApprove();

            expect(decision.action).toBe('ack');
            expect(result?.result).toEqual({refund_amount: 30000});
            expect(repo.findReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, user_id: USER_ACTOR.user_id});
            expect(repo.findLatestCancelRequest).toHaveBeenCalledWith({reservation_id: RESERVATION_ID});
            const [where, canceled] = repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity];
            expect(where).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CHECKED_IN'});
            expect(canceled).toBeInstanceOf(ReservationEntity);
            expect(canceled).toMatchObject({reservation_state_id: 'CANCELED', cancel_actor: 'STORE', cancel_reason: '배관 누수로 객실을 쓸 수 없습니다', canceled_at: NOW});
            expect(repo.findReservationDetails).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            const [detailWhere, detail] = repo.updateReservationDetails.mock.calls[0] as [unknown, ReservationDetailEntity];
            expect(detailWhere).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(detail.reservation_state_id).toBe('CANCELED');
            const [paymentWhere, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(paymentWhere).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'DONE'});
            expect(refund).toBeInstanceOf(PaymentEntity);
            expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', refund_amount: 30000, refund_reason: '업체 예약 취소', refund_requested_at: NOW});
            const [qrWhere, endedQr] = repo.updateRoomQr.mock.calls[0] as [unknown, RoomQrEntity];
            expect(qrWhere).toEqual({room_qr_id: ROOM_QR_ID});
            expect(endedQr).toBeInstanceOf(RoomQrEntity);
            expect(endedQr.ends_at).toEqual(NOW);
            const [requestWhere, approved] = repo.updateCancelRequest.mock.calls[0] as [unknown, ReservationCancelRequestEntity];
            expect(requestWhere).toEqual({reservation_cancel_request_id: CANCEL_REQUEST_ID, reservation_cancel_request_state_id: 'REQUESTED'});
            expect(approved).toBeInstanceOf(ReservationCancelRequestEntity);
            expect(approved).toMatchObject({reservation_cancel_request_state_id: 'APPROVED', responded_at: NOW});
            expect(door.revokeQr).toHaveBeenCalledTimes(1);
            expect(door.revokeQr).toHaveBeenCalledWith(ROOM_ID, QR);
            expect(door.revokeQr.mock.invocationCallOrder[0]).toBeGreaterThan(repo.updateCancelRequest.mock.invocationCallOrder[0]);
        });

        it('확정 예약(scheduler 가 이용 중으로 바꾸기 전)도 승인된다 — 상태 조건 CONFIRMED, QR 이 없으면 QR 쓰기 · Redis 없음', async () => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'CONFIRMED'}));
            repo.findRoomQr.mockResolvedValueOnce(null);

            const {result} = await runApprove();

            expect(result?.result).toEqual({refund_amount: 30000});
            expect(repo.updateReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'}, expect.any(ReservationEntity));
            expect(repo.updateRoomQr).not.toHaveBeenCalled();
            expect(door.revokeQr).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('내 예약이 아니면 404, 요청 조회 없음', async () => {
            repo.findReservation.mockResolvedValueOnce(null);

            const {result} = await runApprove();

            expect(result?.error).toEqual({status_code: 404, body: {message: '예약을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findLatestCancelRequest).not.toHaveBeenCalled();
        });

        it('요청이 없으면 404 취소 요청이 없습니다, 쓰기 없음', async () => {
            repo.findLatestCancelRequest.mockResolvedValueOnce(null);

            const {result} = await runApprove();

            expect(result?.error).toEqual({status_code: 404, body: {message: '취소 요청이 없습니다.', validation_errors: null}});
            expect(repo.updateReservation).not.toHaveBeenCalled();
        });

        it.each([
            ['이용자가 먼저 취소한 예약(CANCELED)', {reservation_state_id: 'CANCELED'}],
            ['끝난 예약(COMPLETED)', {reservation_state_id: 'COMPLETED'}],
            ['끝 시각이 지난 이용 중 예약', {reservation_state_id: 'CHECKED_IN', end_at: new Date('2026-11-10T05:00:00Z')}],
        ])('%s 는 400 예약 상태가 바뀌었습니다, 쓰기 없음', async (_label, override) => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity(override));

            const {result} = await runApprove();

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null}});
            expect(repo.updateReservation).not.toHaveBeenCalled();
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });

        it('그 사이 예약 상태가 바뀌었으면(예약 조건 0행) 400, 결제 · 요청 쓰기 없음', async () => {
            repo.updateReservation.mockResolvedValueOnce(false);

            const {result} = await runApprove();

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null}});
            expect(repo.updatePayment).not.toHaveBeenCalled();
            expect(repo.updateCancelRequest).not.toHaveBeenCalled();
        });

        it('그 사이 새 요청 · 다른 응답으로 바뀌었으면(요청 조건 0행) 400 롤백, Redis 지우기 없음', async () => {
            repo.updateCancelRequest.mockResolvedValueOnce(false);

            const {result} = await runApprove();

            expect(result?.error).toEqual({status_code: 400, body: {message: NOT_RESPONDABLE, validation_errors: null}});
            expect(door.revokeQr).not.toHaveBeenCalled();
        });

        it('[FAIL:external] Redis 503 이면 재시도(requeue) — 취소 · 환불 · 승인은 롤백되어 다시 처리한다', async () => {
            door.revokeQr.mockRejectedValueOnce(new ServiceUnavailableException({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runApprove();

            expect(decision.action).toBe('requeue');
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('예약 ID 경로가 32자 hex 가 아니면 → reservation_id', async () => {
            await expect(validateBody(ReservationCancelRequestApproveParamDto, {reservation_id: 'xyz'})).resolves.toEqual({
                message: '예약 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'reservation_id', message: '예약 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 예약 조회 없음', async () => {
            const {result} = await runApprove(null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findReservation).not.toHaveBeenCalled();
        });
    });
});
