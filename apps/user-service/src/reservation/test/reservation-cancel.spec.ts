import type {TestingModule} from '@nestjs/testing';
import {ReservationCancelDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createReservationRepositoryMock,
    detailEntity,
    PAYMENT_ID,
    paymentEntity,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    runCommand,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID, cancel_reason: '일정이 바뀌었습니다'};

/** 환불액 케이스 입력 — 이용 2026-11-10 13:00 ~ 16:00(한국 시각) */
interface RefundCase {
    now: string;
    amount?: number;
    late_refund_percent?: number;
    refund_deadline_at?: string;
    refund: number | null;
}

/**
 * [CASES:refund] — 이용자 취소 환불액 8개(사용자 결정 2026-11-03). 기본 결제 30,000원 · 환불 마감 12:00(60분 전) · 마감 뒤 50%.
 * [이름, 입력 · 기대 환불액(null = 취소 불가 400)]
 */
const REFUND_CASES: [string, RefundCase][] = [
    ['1. 마감 전(11:59) — 100%', {now: '2026-11-10T02:59:00Z', refund: 30000}],
    ['2. 마감 정각(12:00) — 마감 뒤 50%', {now: '2026-11-10T03:00:00Z', refund: 15000}],
    ['3. 15,001원 · 50% — 원 단위 내림 7,500', {now: '2026-11-10T03:30:00Z', amount: 15001, refund: 7500}],
    ['4. 비율 0% — 0원(환불 없이 취소)', {now: '2026-11-10T03:30:00Z', late_refund_percent: 0, refund: 0}],
    ['5. 비율 100% — 전액', {now: '2026-11-10T03:30:00Z', late_refund_percent: 100, refund: 30000}],
    ['6. 시작 정각(13:00) — 취소 불가', {now: '2026-11-10T04:00:00Z', refund: null}],
    ['7. 시작 뒤(13:30) — 취소 불가', {now: '2026-11-10T04:30:00Z', refund: null}],
    ['8. 마감 0분(마감 = 시작) · 12:59 — 100%', {now: '2026-11-10T03:59:00Z', refund_deadline_at: '2026-11-10T04:00:00Z', refund: 30000}],
];

describe('user.reservation.cancel — 이용자 취소 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
        repo = createReservationRepositoryMock();
        ({dispatcher, module} = await bootCommandPath(repo));
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

    describe('[CASES:refund] 환불액', () => {
        it.each(REFUND_CASES)('%s', async (_label, input) => {
            vi.setSystemTime(new Date(input.now));
            repo.findReservation.mockResolvedValueOnce(
                reservationEntity({late_refund_percent: input.late_refund_percent ?? 50, ...(input.refund_deadline_at ? {refund_deadline_at: new Date(input.refund_deadline_at)} : {})}),
            );
            repo.findPayment.mockResolvedValueOnce(paymentEntity({amount: input.amount ?? 30000}));

            const {result} = await runCancel();

            if (input.refund === null) {
                expect(result?.error).toEqual({status_code: 400, body: {message: '이용 시작 후에는 취소할 수 없습니다.', validation_errors: null}});
                expect(repo.updateReservation).not.toHaveBeenCalled();
                return;
            }
            expect(result?.result).toEqual({refund_amount: input.refund});
            if (input.refund > 0) {
                const [where, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
                expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'DONE'});
                expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', refund_amount: input.refund, refund_reason: '이용자 예약 취소'});
            } else {
                expect(repo.updatePayment).not.toHaveBeenCalled();
            }
        });
    });

    describe('[SUCCESS]', () => {
        it('확정 예약 — 예약 · 구간 CANCELED(주체 USER · 사유 · 시각), 상태 조건 CONFIRMED', async () => {
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
        });

        it('결제 대기 예약 — 취소 + 결제 EXPIRED(환불 없음), refund_amount null', async () => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'PENDING'}));
            repo.findReservationDetails.mockResolvedValueOnce([detailEntity({reservation_state_id: 'PENDING'})]);

            const {result} = await runCancel();

            expect(result?.result).toEqual({refund_amount: null});
            const [where, expired] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'READY'});
            expect(expired.payment_state_id).toBe('EXPIRED');
            expect(repo.findPayment).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it.each(['CHECKED_IN', 'COMPLETED', 'CANCELED'])('%s 예약은 400 취소할 수 없는 예약, 쓰기 없음', async (state) => {
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
