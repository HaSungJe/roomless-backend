import type {TestingModule} from '@nestjs/testing';
import {ReservationCancelRequestRejectParamDto} from '@app/contracts/reservation/dto/reservation-cancel-request-reject.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {ReservationCancelRequestEntity} from '@app/database/entities/reservation/reservation-cancel-request.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    CANCEL_REQUEST_ID,
    cancelRequestEntity,
    createDoorStoreMock,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    DoorStoreMock,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    runCommand,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID};

/** 지금 — 2026-11-10 14:05(한국 시각), 요청 14:00 · 만료 14:10 */
const NOW = new Date('2026-11-10T05:05:00Z');

/** 거절할 수 없는 요청 메시지 */
const NOT_RESPONDABLE = '승인할 수 없는 취소 요청입니다(만료 · 처리됨).';

describe('user.reservation.cancel-request-reject — 이용 중 취소 요청 거절 (큐 경로)', () => {
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
        door = createDoorStoreMock();
        ({dispatcher, module} = await bootCommandPath(repo, createPaymentGatewayMock(), door));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 거절 명령 1건
     *
     * @param actor 로그인 이용자(없으면 null)
     * @returns 판정 · 결과
     */
    function runReject(actor: typeof USER_ACTOR | null = USER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.CANCEL_REQUEST_REJECT, payload: PAYLOAD, actor});
    }

    /**
     * [CASES:cancel-request] 상태 — 거절할 수 있는가(사용자 확정 2026-11-07). 요청 14:00 · 만료 14:10.
     * [이름, 저장된 상태, 지금, 거절 가능]
     */
    describe('[CASES:cancel-request] 거절 가능', () => {
        it.each([
            ['요청 중 · 지금 = 만료 − 1초(14:09:59) → 거절', 'REQUESTED', '2026-11-10T05:09:59Z', true],
            ['요청 중 · 지금 = 만료 정각(14:10) → 만료 · 불가', 'REQUESTED', '2026-11-10T05:10:00Z', false],
            ['승인(저장) → 불가', 'APPROVED', '2026-11-10T05:05:00Z', false],
            ['거절(저장) → 불가', 'REJECTED', '2026-11-10T05:05:00Z', false],
            ['만료(저장) → 불가', 'EXPIRED', '2026-11-10T05:05:00Z', false],
        ])('%s', async (_label, reservation_cancel_request_state_id, now, respondable) => {
            vi.setSystemTime(new Date(now));
            repo.findLatestCancelRequest.mockResolvedValueOnce(cancelRequestEntity({reservation_cancel_request_state_id}));

            const {result} = await runReject();

            if (respondable) {
                expect(result).toEqual({result: null, error: null});
                expect(repo.updateCancelRequest).toHaveBeenCalledTimes(1);
                return;
            }
            expect(result?.error).toEqual({status_code: 400, body: {message: NOT_RESPONDABLE, validation_errors: null}});
            expect(repo.updateCancelRequest).not.toHaveBeenCalled();
        });
    });

    describe('[SUCCESS]', () => {
        it('요청만 거절(요청 중 조건 · 응답 시각) — 예약 · 결제 · QR · 호실은 그대로', async () => {
            const {decision, result} = await runReject();

            expect(decision.action).toBe('ack');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, user_id: USER_ACTOR.user_id});
            expect(repo.findLatestCancelRequest).toHaveBeenCalledWith({reservation_id: RESERVATION_ID});
            const [where, rejected] = repo.updateCancelRequest.mock.calls[0] as [unknown, ReservationCancelRequestEntity];
            expect(where).toEqual({reservation_cancel_request_id: CANCEL_REQUEST_ID, reservation_cancel_request_state_id: 'REQUESTED'});
            expect(rejected).toBeInstanceOf(ReservationCancelRequestEntity);
            expect(rejected).toMatchObject({reservation_cancel_request_state_id: 'REJECTED', responded_at: NOW});
            expect(repo.updateReservation).not.toHaveBeenCalled();
            expect(repo.updatePayment).not.toHaveBeenCalled();
            expect(repo.updateRoomQr).not.toHaveBeenCalled();
            expect(repo.updateReservationRoom).not.toHaveBeenCalled();
            expect(door.revokeQr).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('내 예약이 아니면 404, 요청 조회 없음', async () => {
            repo.findReservation.mockResolvedValueOnce(null);

            const {result} = await runReject();

            expect(result?.error).toEqual({status_code: 404, body: {message: '예약을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findLatestCancelRequest).not.toHaveBeenCalled();
        });

        it('결제 대기 만료 예약은 404', async () => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'EXPIRED'}));

            const {result} = await runReject();

            expect(result?.error).toEqual({status_code: 404, body: {message: '예약을 찾을 수 없습니다.', validation_errors: null}});
        });

        it('요청이 없으면 404 취소 요청이 없습니다', async () => {
            repo.findLatestCancelRequest.mockResolvedValueOnce(null);

            const {result} = await runReject();

            expect(result?.error).toEqual({status_code: 404, body: {message: '취소 요청이 없습니다.', validation_errors: null}});
            expect(repo.updateCancelRequest).not.toHaveBeenCalled();
        });

        it('그 사이 새 요청 · 다른 응답으로 바뀌었으면(요청 조건 0행) 400', async () => {
            repo.updateCancelRequest.mockResolvedValueOnce(false);

            const {result} = await runReject();

            expect(result?.error).toEqual({status_code: 400, body: {message: NOT_RESPONDABLE, validation_errors: null}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('예약 ID 경로가 32자 hex 가 아니면 → reservation_id', async () => {
            await expect(validateBody(ReservationCancelRequestRejectParamDto, {reservation_id: 'xyz'})).resolves.toEqual({
                message: '예약 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'reservation_id', message: '예약 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 예약 조회 없음', async () => {
            const {result} = await runReject(null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findReservation).not.toHaveBeenCalled();
        });
    });
});
