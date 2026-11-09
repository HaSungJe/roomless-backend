import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {ReservationExtendParamDto} from '@app/contracts/reservation/dto/reservation-extend.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    everyDayHours,
    groupPlanEntity,
    ID_PATTERN,
    PaymentGatewayMock,
    planEntity,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    ROOM_ID,
    roomEntity,
    runCommand,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID};

/** 한국 시각 → Date */
const kst = (value: string): Date => new Date(`${value.replace(' ', 'T')}:00+09:00`);

/** 이용 중 예약 — 13:00 ~ 16:00(한국 시각) · 정비 30분 · 합계 30,000 */
const IN_USE = {reservation_state_id: 'CHECKED_IN', start_at: kst('2026-11-10 13:00'), end_at: kst('2026-11-10 16:00'), total_price: 30000};

describe('user.reservation.extend — 연장 신청 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let payment: PaymentGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(kst('2026-11-10 15:00'));
        repo = createReservationRepositoryMock();
        repo.findReservation.mockResolvedValue(reservationEntity(IN_USE));
        repo.findReservationRoom.mockResolvedValue(roomEntity({room_state_id: 'IN_USE'}));
        repo.findStorePlan.mockResolvedValue(planEntity('HOURLY', {usage_hours: 4}));
        repo.findGroupPlans.mockResolvedValue([groupPlanEntity('HOURLY', {price: 30000})]);
        repo.findStoreHours.mockResolvedValue(everyDayHours('10:00:00', '22:00:00'));
        payment = createPaymentGatewayMock();
        ({dispatcher, module} = await bootCommandPath(repo, payment));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 연장 신청 1건
     *
     * @param actor 로그인 이용자(없으면 null)
     * @returns 판정 · 결과
     */
    function runExtend(actor: typeof USER_ACTOR | null = USER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.EXTEND, payload: PAYLOAD, actor});
    }

    describe('[SUCCESS]', () => {
        it('결제(READY) → 연장 구간(EXTENSION · PENDING · 5분) → 잡아 두기(점유 끝 = 새 끝 + 정비시간, 상태 · 끝 조건) 순서, 결과는 토스 결제 정보', async () => {
            const {decision, result} = await runExtend();

            expect(decision.action).toBe('ack');
            const [paid] = repo.insertPayment.mock.calls[0] as [PaymentEntity];
            expect(paid).toBeInstanceOf(PaymentEntity);
            expect(paid.payment_id).toMatch(ID_PATTERN);
            expect(paid).toMatchObject({
                user_id: USER_ACTOR.user_id,
                payment_state_id: 'READY',
                environment: 'TEST',
                order_name: '루미 강남점 101호 연장 4시간',
                amount: 30000,
                payment_key: null,
                refund_amount: null,
            });
            const [detail] = repo.insertReservationDetail.mock.calls[0] as [ReservationDetailEntity];
            expect(detail).toBeInstanceOf(ReservationDetailEntity);
            expect(detail.reservation_detail_id).toMatch(ID_PATTERN);
            expect(detail).toMatchObject({
                reservation_id: RESERVATION_ID,
                reservation_detail_type_id: 'EXTENSION',
                room_plan_type_id: 'HOURLY',
                reservation_state_id: 'PENDING',
                payment_id: paid.payment_id,
                start_at: kst('2026-11-10 16:00'),
                end_at: kst('2026-11-10 20:00'),
                price: 30000,
                expires_at: kst('2026-11-10 15:05'),
            });
            const [where, held] = repo.updateReservationHold.mock.calls[0] as [unknown, ReservationEntity];
            expect(where).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CHECKED_IN', end_at: kst('2026-11-10 16:00')});
            expect(held).toBeInstanceOf(ReservationEntity);
            expect(held.blocked_until).toEqual(kst('2026-11-10 20:30'));
            expect(held.end_at).toBeUndefined();
            expect(repo.insertReservationDetail.mock.invocationCallOrder[0]).toBeGreaterThan(repo.insertPayment.mock.invocationCallOrder[0]);
            expect(repo.updateReservationHold.mock.invocationCallOrder[0]).toBeGreaterThan(repo.insertReservationDetail.mock.invocationCallOrder[0]);
            expect(result?.result).toEqual({
                reservation_id: RESERVATION_ID,
                reservation_detail_id: detail.reservation_detail_id,
                payment_id: paid.payment_id,
                order_name: '루미 강남점 101호 연장 4시간',
                amount: 30000,
                expires_at: kst('2026-11-10 15:05').toISOString(),
                start_at: kst('2026-11-10 16:00').toISOString(),
                end_at: kst('2026-11-10 20:00').toISOString(),
            });
        });

        it('연박 — 1일 연장 · 1박 요금 · 주문명 연장 1일', async () => {
            vi.setSystemTime(kst('2026-11-12 10:00'));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({...IN_USE, room_plan_type_id: 'LONG', start_at: kst('2026-11-10 15:00'), end_at: kst('2026-11-12 11:00')}));
            repo.findStorePlan.mockImplementation((where: {room_plan_type_id: string}) => Promise.resolve(planEntity(where.room_plan_type_id)));
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('NIGHT', {price: 50000})]);

            const {result} = await runExtend();

            expect(result?.result).toMatchObject({order_name: '루미 강남점 101호 연장 1일', amount: 50000, end_at: kst('2026-11-13 11:00').toISOString()});
            const [detail] = repo.insertReservationDetail.mock.calls[0] as [ReservationDetailEntity];
            expect(detail).toMatchObject({room_plan_type_id: 'NIGHT', start_at: kst('2026-11-12 11:00'), end_at: kst('2026-11-13 11:00'), price: 50000});
        });
    });

    describe('[FAIL:service] 판정 — 조회와 같은 문구로 400, 쓰기 없음', () => {
        it.each([
            [
                '이용 중 아님(시작 전)',
                () => repo.findReservation.mockResolvedValueOnce(reservationEntity({...IN_USE, reservation_state_id: 'CONFIRMED', start_at: kst('2026-11-10 15:30')})),
                '이용 중인 예약만 연장할 수 있습니다.',
            ],
            [
                '다음 예약과 겹침',
                () => repo.findReservations.mockResolvedValueOnce([{room_id: ROOM_ID, start_at: kst('2026-11-10 20:00'), blocked_until: kst('2026-11-10 23:00')}]),
                '다음 예약이 있어 연장할 수 없습니다.',
            ],
        ])('%s', async (_label, arrange, message) => {
            arrange();

            const {result} = await runExtend();

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: null}});
            expect(repo.insertPayment).not.toHaveBeenCalled();
            expect(repo.insertReservationDetail).not.toHaveBeenCalled();
            expect(repo.updateReservationHold).not.toHaveBeenCalled();
        });

        it('[CASES:member-state] 이용 제한(BLOCK) 회원 → 400 이용이 제한된 계정입니다., 결제 · 구간 · 잡아 두기 없음', async () => {
            repo.findReservationUser.mockResolvedValueOnce({user_id: USER_ACTOR.user_id, state_id: 'BLOCK', block_comment: '부정 이용'});

            const {result} = await runExtend();

            expect(result?.error).toEqual({status_code: 400, body: {message: '이용이 제한된 계정입니다.', validation_errors: null}});
            expect(repo.findReservationUser).toHaveBeenCalledWith({user_id: USER_ACTOR.user_id});
            expect(repo.insertPayment).not.toHaveBeenCalled();
            expect(repo.insertReservationDetail).not.toHaveBeenCalled();
            expect(repo.updateReservationHold).not.toHaveBeenCalled();
        });

        it('내 예약이 아니면 404, 쓰기 없음', async () => {
            repo.findReservation.mockResolvedValueOnce(null);

            const {result} = await runExtend();

            expect(result?.error).toEqual({status_code: 404, body: {message: '예약을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('잡아 두는 사이 예약이 바뀌었으면(상태 · 끝 조건 0행) 400 롤백', async () => {
            repo.updateReservationHold.mockResolvedValueOnce(false);

            const {result} = await runExtend();

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null}});
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('잡아 두기가 다음 예약과 겹치면(배타 제약 — repository 400) failed 400', async () => {
            repo.updateReservationHold.mockRejectedValueOnce(new BadRequestException({message: '다음 예약이 있어 연장할 수 없습니다.'}));

            const {result} = await runExtend();

            expect(result?.error).toEqual({status_code: 400, body: {message: '다음 예약이 있어 연장할 수 없습니다.', validation_errors: null}});
        });

        it('겹친 연장 신청(결제 대기 구간 부분 유니크 — repository 400)이면 failed 400, 잡아 두기 없음', async () => {
            repo.insertReservationDetail.mockRejectedValueOnce(new BadRequestException({message: '결제 대기 중인 연장이 있습니다.'}));

            const {result} = await runExtend();

            expect(result?.error).toEqual({status_code: 400, body: {message: '결제 대기 중인 연장이 있습니다.', validation_errors: null}});
            expect(repo.updateReservationHold).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:external]', () => {
        it('토스 키가 없으면(결제 환경 503) 재시도, 쓰기 없음', async () => {
            payment.environment.mockImplementationOnce(() => {
                throw new ServiceUnavailableException({message: '결제 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'});
            });

            const {decision} = await runExtend();

            expect(decision.action).toBe('requeue');
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('예약 ID 경로가 32자 hex 가 아니면 → reservation_id', async () => {
            await expect(validateBody(ReservationExtendParamDto, {reservation_id: 'xyz'})).resolves.toEqual({
                message: '예약 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'reservation_id', message: '예약 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 예약 조회 없음', async () => {
            const {result} = await runExtend(null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findReservation).not.toHaveBeenCalled();
        });
    });
});
