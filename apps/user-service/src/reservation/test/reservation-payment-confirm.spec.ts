import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {In} from 'typeorm';
import {ReservationPaymentConfirmDto} from '@app/contracts/reservation/dto/reservation-payment-confirm.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createDoorStoreMock,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    detailEntity,
    DoorStoreMock,
    ID_PATTERN,
    NOW,
    PAYMENT_ID,
    PAYMENT_KEY,
    paymentEntity,
    PaymentGatewayMock,
    QR,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    ROOM_ID,
    roomQrEntity,
    runCommand,
    tossLookup,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {payment_id: PAYMENT_ID, payment_key: PAYMENT_KEY};

describe('user.reservation.payment-confirm — 결제 확인 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let payment: PaymentGatewayMock;
    let door: DoorStoreMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createReservationRepositoryMock();
        repo.findPayment.mockResolvedValue(paymentEntity({payment_state_id: 'READY', payment_key: null, method: null, approved_at: null, receipt_url: null}));
        repo.findReservationDetails.mockResolvedValue([detailEntity({reservation_state_id: 'PENDING'})]);
        repo.findReservation.mockResolvedValue(reservationEntity({reservation_state_id: 'PENDING'}));
        payment = createPaymentGatewayMock();
        door = createDoorStoreMock();
        ({dispatcher, module} = await bootCommandPath(repo, payment, door));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 결제 확인 명령 1건
     *
     * @param actor 로그인 이용자(없으면 null)
     * @returns 판정 · 결과
     */
    function runConfirm(actor: typeof USER_ACTOR | null = USER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.PAYMENT_CONFIRM, payload: PAYLOAD, actor});
    }

    describe('[SUCCESS]', () => {
        it('토스 조회가 결제됨이면 결제 DONE(결제 키 · 수단 · 승인 · 영수증) → 구간 → 예약 CONFIRMED, 모두 상태 조건', async () => {
            const {decision, result} = await runConfirm();

            expect(decision.action).toBe('ack');
            expect(result?.result).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(repo.findPayment).toHaveBeenCalledWith({payment_id: PAYMENT_ID, user_id: USER_ACTOR.user_id});
            expect(payment.getPayment).toHaveBeenCalledWith(PAYMENT_KEY);
            const [paymentWhere, done] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(paymentWhere).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'READY'});
            expect(done).toBeInstanceOf(PaymentEntity);
            expect(done).toMatchObject({payment_state_id: 'DONE', payment_key: PAYMENT_KEY, method: '카드', approved_at: new Date('2026-11-03T00:01:00Z'), receipt_url: 'https://receipt.test/1'});
            const [detailWhere, detail] = repo.updateReservationDetails.mock.calls[0] as [unknown, ReservationDetailEntity];
            expect(detailWhere).toEqual({payment_id: PAYMENT_ID, reservation_state_id: 'PENDING'});
            expect(detail.reservation_state_id).toBe('CONFIRMED');
            const [reservationWhere, reservation] = repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity];
            expect(reservationWhere).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'PENDING'});
            expect(reservation.reservation_state_id).toBe('CONFIRMED');
        });

        it('같은 결제 키로 이미 확정된 결제면 토스 조회 없이 지금 상태(중복 요청)', async () => {
            repo.findPayment.mockResolvedValueOnce(paymentEntity());
            repo.findReservation.mockResolvedValueOnce(reservationEntity());

            const {result} = await runConfirm();

            expect(result?.result).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(payment.getPayment).not.toHaveBeenCalled();
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });
    });

    describe('[SUCCESS] 이미 시작한 예약 — 바로 이용 중 · 호실 사용중 · QR 발급 (사용자 결정 2026-11-07)', () => {
        /** 지금 바로 예약 — 2026-11-03 08:59 ~ 12:59(한국), 지금 09:00 */
        const STARTED = {reservation_state_id: 'PENDING', start_at: new Date('2026-11-02T23:59:00Z'), end_at: new Date('2026-11-03T03:59:00Z')};

        it('확정 → 이용 중(확정 조건) → 호실 사용중(예약가능 · 예약완료 · 정비중 조건) → QR 발급(INSERT … ON CONFLICT) → 다시 읽기 → Redis 현재 QR, 결과 상태 CHECKED_IN', async () => {
            repo.findReservation.mockResolvedValue(reservationEntity(STARTED));
            repo.findRoomQr.mockResolvedValueOnce(roomQrEntity({starts_at: STARTED.start_at, ends_at: STARTED.end_at}));

            const {decision, result} = await runConfirm();

            expect(decision.action).toBe('ack');
            expect(result?.result).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CHECKED_IN'});
            expect(repo.updateReservation).toHaveBeenCalledTimes(2);
            const [confirmWhere, confirmed] = repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity];
            expect(confirmWhere).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'PENDING'});
            expect(confirmed.reservation_state_id).toBe('CONFIRMED');
            const [startWhere, started] = repo.updateReservation.mock.calls[1] as [unknown, ReservationEntity];
            expect(startWhere).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(started).toBeInstanceOf(ReservationEntity);
            expect(started.reservation_state_id).toBe('CHECKED_IN');
            const [roomWhere, room] = repo.updateReservationRoom.mock.calls[0] as [unknown, RoomEntity];
            expect(roomWhere).toEqual({room_id: ROOM_ID, room_state_id: In(['AVAILABLE', 'RESERVED', 'MAINTENANCE'])});
            expect(room).toBeInstanceOf(RoomEntity);
            expect(room.room_state_id).toBe('IN_USE');
            const [issued] = repo.insertRoomQr.mock.calls[0] as [RoomQrEntity];
            expect(issued).toBeInstanceOf(RoomQrEntity);
            expect(issued.room_qr_id).toMatch(ID_PATTERN);
            expect(issued.qr).toMatch(ID_PATTERN);
            expect(issued).toMatchObject({room_id: ROOM_ID, reservation_id: RESERVATION_ID, starts_at: STARTED.start_at, ends_at: STARTED.end_at});
            expect(repo.findRoomQr).toHaveBeenCalledWith({reservation_id: RESERVATION_ID});
            expect(door.setQr).toHaveBeenCalledTimes(1);
            expect(door.setQr).toHaveBeenCalledWith(ROOM_ID, QR, STARTED.end_at);
            expect(repo.updateReservationRoom.mock.invocationCallOrder[0]).toBeGreaterThan(repo.updateReservation.mock.invocationCallOrder[1]);
            expect(repo.insertRoomQr.mock.invocationCallOrder[0]).toBeGreaterThan(repo.updateReservationRoom.mock.invocationCallOrder[0]);
            expect(door.setQr.mock.invocationCallOrder[0]).toBeGreaterThan(repo.findRoomQr.mock.invocationCallOrder[0]);
        });

        it('시작 전 예약이면 확정만 — 이용 중 · 호실 · QR 쓰기 없음(시작 시각에 scheduler · 내 예약 QR)', async () => {
            const {result} = await runConfirm();

            expect(result?.result).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(repo.updateReservation).toHaveBeenCalledTimes(1);
            expect(repo.updateReservationRoom).not.toHaveBeenCalled();
            expect(repo.insertRoomQr).not.toHaveBeenCalled();
            expect(door.setQr).not.toHaveBeenCalled();
        });

        it('끝 시각이 지난 뒤 결제가 확인되면 확정만 — 이용 완료는 scheduler 가 한다', async () => {
            repo.findReservation.mockResolvedValue(reservationEntity({...STARTED, start_at: new Date('2026-11-02T20:00:00Z'), end_at: new Date('2026-11-02T23:00:00Z')}));

            const {result} = await runConfirm();

            expect(result?.result).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(repo.updateReservationRoom).not.toHaveBeenCalled();
            expect(repo.insertRoomQr).not.toHaveBeenCalled();
        });

        it('[FAIL:service] 이용 중으로 바꾸는 사이 scheduler 가 먼저 바꿨으면(확정 조건 0행) 400 롤백, 호실 · QR 쓰기 없음', async () => {
            repo.findReservation.mockResolvedValue(reservationEntity(STARTED));
            repo.updateReservation.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null}});
            expect(repo.updateReservationRoom).not.toHaveBeenCalled();
            expect(repo.insertRoomQr).not.toHaveBeenCalled();
        });

        it('[FAIL:external] Redis 503 이면 재시도(requeue) — 확정은 롤백되어 다시 확인한다', async () => {
            repo.findReservation.mockResolvedValue(reservationEntity(STARTED));
            repo.findRoomQr.mockResolvedValueOnce(roomQrEntity());
            door.setQr.mockRejectedValueOnce(new ServiceUnavailableException({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runConfirm();

            expect(decision.action).toBe('requeue');
        });

        it('[FAIL:service] 발급 뒤 다시 읽어도 없으면 500 → 재시도, Redis 쓰기 없음', async () => {
            repo.findReservation.mockResolvedValue(reservationEntity(STARTED));

            const {decision} = await runConfirm();

            expect(decision.action).toBe('requeue');
            expect(door.setQr).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service] 대조 — 쓰기 없음', () => {
        it('토스에서 승인 전(IN_PROGRESS)이면 400 결제가 완료되지 않았습니다', async () => {
            payment.getPayment.mockResolvedValueOnce(tossLookup({status: 'IN_PROGRESS'}));

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 400, body: {message: '결제가 완료되지 않았습니다.', validation_errors: null}});
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });

        it('주문번호가 다른 결제면 400 결제 정보가 맞지 않습니다 — 다른 주문이라 환불하지 않는다', async () => {
            payment.getPayment.mockResolvedValueOnce(tossLookup({order_id: '9'.repeat(32)}));

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 400, body: {message: '결제 정보가 맞지 않습니다.', validation_errors: null}});
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });

        it('다른 결제 키로 이미 확정된 결제면 400', async () => {
            repo.findPayment.mockResolvedValueOnce(paymentEntity({payment_key: 'tgen_other'}));

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 다른 결제로 확정된 예약입니다.', validation_errors: null}});
            expect(payment.getPayment).not.toHaveBeenCalled();
        });

        it('내 결제가 아니면 404', async () => {
            repo.findPayment.mockResolvedValueOnce(null);

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 404, body: {message: '결제를 찾을 수 없습니다.', validation_errors: null}});
            expect(payment.getPayment).not.toHaveBeenCalled();
        });

        it('그 사이 crontab 이 바꿨으면(결제 READY 조건 0행) 400, 예약 쓰기 없음(롤백)', async () => {
            repo.updatePayment.mockResolvedValueOnce(false);

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null}});
            expect(repo.updateReservation).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:committed] 환불 신청을 커밋하고 실패를 반환 — 재시도 없음', () => {
        it('금액이 다르면 토스 금액 전액 환불 신청 + 구간 · 예약 만료, failed 400 · ack', async () => {
            payment.getPayment.mockResolvedValueOnce(tossLookup({total_amount: 10000}));

            const {decision, result} = await runConfirm();

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: '결제 금액이 맞지 않아 결제를 취소했습니다.', validation_errors: null}});
            const [where, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'READY'});
            expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', payment_key: PAYMENT_KEY, refund_amount: 10000, refund_reason: '결제 금액 불일치', refund_requested_at: NOW});
            expect((repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity])[1].reservation_state_id).toBe('EXPIRED');
            expect((repo.updateReservationDetails.mock.calls[0] as [unknown, ReservationDetailEntity])[1].reservation_state_id).toBe('EXPIRED');
        });

        it('이미 만료된 예약에 늦게 온 결제면 환불 신청, 예약은 그대로, failed 400 · ack', async () => {
            repo.findPayment.mockResolvedValueOnce(paymentEntity({payment_state_id: 'EXPIRED', payment_key: null, approved_at: null}));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'EXPIRED'}));
            repo.findReservationDetails.mockResolvedValueOnce([detailEntity({reservation_state_id: 'EXPIRED'})]);

            const {decision, result} = await runConfirm();

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: '결제 대기 시간이 지나 결제를 취소했습니다. 다시 예약해주세요.', validation_errors: null}});
            const [where, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'EXPIRED'});
            expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', refund_amount: 30000, refund_reason: '결제 대기 시간 경과'});
            expect(repo.updateReservation).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('결제 ID 형식이 아니면 → payment_id', async () => {
            await expect(validateBody(ReservationPaymentConfirmDto, {payment_id: 'x', payment_key: PAYMENT_KEY})).resolves.toEqual({
                message: '결제 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'payment_id', message: '결제 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 결제 조회 없음', async () => {
            const {result} = await runConfirm(null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findPayment).not.toHaveBeenCalled();
        });
    });
});
