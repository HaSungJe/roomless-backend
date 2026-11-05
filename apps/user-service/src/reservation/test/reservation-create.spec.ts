import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import type {Actor} from '@app/contracts/actor.js';
import {ReservationDto} from '@app/contracts/reservation/dto/reservation.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    groupPlanEntity,
    ID_PATTERN,
    NOW,
    PaymentGatewayMock,
    planEntity,
    ReservationRepositoryMock,
    ROOM_GROUP_ID,
    ROOM_ID,
    runCommand,
    STORE_ID,
    storeEntity,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const HOURLY = {room_id: ROOM_ID, room_plan_type_id: 'HOURLY', date: '2026-11-04', start_time: '13:30'};

/** 지금 바로(시간 이용 · 오늘 2026-11-03) */
const NOW_HOURLY = {room_id: ROOM_ID, room_plan_type_id: 'HOURLY', date: '2026-11-03', is_now: 1};

describe('user.reservation.create — 예약 생성 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let payment: PaymentGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createReservationRepositoryMock();
        payment = createPaymentGatewayMock();
        ({dispatcher, module} = await bootCommandPath(repo, payment));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('결제(READY · TEST) → 예약(PENDING · 정비 · 환불 마감 · 비율 저장) → 기본 구간(PENDING · 결제 대기 5분) 순으로 쓰고 결제 정보를 돌려준다', async () => {
            const {decision, result} = await runCreate(HOURLY);

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('user.reservation.create.done');
            const [paid] = repo.insertPayment.mock.calls[0] as [PaymentEntity];
            expect(paid).toBeInstanceOf(PaymentEntity);
            expect(paid.payment_id).toMatch(ID_PATTERN);
            expect(paid).toMatchObject({
                user_id: USER_ACTOR.user_id,
                payment_state_id: 'READY',
                environment: 'TEST',
                order_name: '루미 강남점 101호 시간 이용',
                amount: 30000,
                payment_key: null,
                refund_amount: null,
            });
            const [reservation] = repo.insertReservation.mock.calls[0] as [ReservationEntity];
            expect(reservation).toBeInstanceOf(ReservationEntity);
            expect(reservation).toMatchObject({
                user_id: USER_ACTOR.user_id,
                store_id: STORE_ID,
                room_id: ROOM_ID,
                room_plan_type_id: 'HOURLY',
                reservation_state_id: 'PENDING',
                start_at: new Date('2026-11-04T04:30:00Z'),
                end_at: new Date('2026-11-04T07:30:00Z'),
                maintenance_minutes: 30,
                blocked_until: new Date('2026-11-04T08:00:00Z'),
                total_price: 30000,
                refund_deadline_at: new Date('2026-11-04T03:30:00Z'),
                late_refund_percent: 50,
                canceled_at: null,
                cancel_actor: null,
                cancel_reason: null,
            });
            const [detail] = repo.insertReservationDetail.mock.calls[0] as [ReservationDetailEntity];
            expect(detail).toBeInstanceOf(ReservationDetailEntity);
            expect(detail).toMatchObject({
                reservation_id: reservation.reservation_id,
                reservation_detail_type_id: 'BASE',
                reservation_state_id: 'PENDING',
                payment_id: paid.payment_id,
                price: 30000,
                expires_at: new Date('2026-11-03T00:05:00Z'),
            });
            expect(repo.insertPayment.mock.invocationCallOrder[0]).toBeLessThan(repo.insertReservation.mock.invocationCallOrder[0]);
            expect(result?.result).toEqual({
                reservation_id: reservation.reservation_id,
                payment_id: paid.payment_id,
                order_name: '루미 강남점 101호 시간 이용',
                amount: 30000,
                expires_at: '2026-11-03T00:05:00.000Z',
                start_at: '2026-11-04T04:30:00.000Z',
                end_at: '2026-11-04T07:30:00.000Z',
            });
            expect(repo.countRecentExpired).toHaveBeenCalledWith(USER_ACTOR.user_id, ROOM_ID, new Date('2026-11-02T23:50:00Z'));
        });

        it('연박 3박 — 주문명에 박수, 금액은 박마다 합계, 끝은 3일 뒤 체크아웃', async () => {
            repo.findStorePlan.mockResolvedValueOnce(planEntity('LONG'));
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('LONG', {price: 50000})]);
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_always_open: 1}));

            await runCreate({room_id: ROOM_ID, room_plan_type_id: 'LONG', date: '2026-11-04', nights: 3});

            const [paid] = repo.insertPayment.mock.calls[0] as [PaymentEntity];
            expect(paid).toMatchObject({order_name: '루미 강남점 101호 연박 3박', amount: 150000});
            const [reservation] = repo.insertReservation.mock.calls[0] as [ReservationEntity];
            expect(reservation.start_at).toEqual(new Date('2026-11-04T06:00:00Z'));
            expect(reservation.end_at).toEqual(new Date('2026-11-07T02:00:00Z'));
        });

        it('1박 10:00 → 12:00 — 퇴실 시각이 입실보다 늦어도 항상 다음 날 퇴실', async () => {
            repo.findStorePlan.mockResolvedValueOnce(planEntity('NIGHT', {check_in_time: '10:00:00', check_out_time: '12:00:00'}));
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('NIGHT')]);
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_always_open: 1}));

            await runCreate({room_id: ROOM_ID, room_plan_type_id: 'NIGHT', date: '2026-11-04'});

            const [reservation] = repo.insertReservation.mock.calls[0] as [ReservationEntity];
            expect(reservation.start_at).toEqual(new Date('2026-11-04T01:00:00Z'));
            expect(reservation.end_at).toEqual(new Date('2026-11-05T03:00:00Z'));
            expect(reservation.blocked_until).toEqual(new Date('2026-11-05T03:30:00Z'));
        });
    });

    describe('[SUCCESS] 지금 바로', () => {
        it('지금 10:21:45 → 10:21 ~ 13:21 (분 단위 내림 · 시작 시각 없이), 점유 끝 13:51 · 환불 마감 09:21', async () => {
            vi.setSystemTime(new Date('2026-11-03T01:21:45Z'));

            const {decision} = await runCreate(NOW_HOURLY);

            expect(decision.action).toBe('ack');
            const [reservation] = repo.insertReservation.mock.calls[0] as [ReservationEntity];
            expect(reservation).toMatchObject({
                start_at: new Date('2026-11-03T01:21:00Z'),
                end_at: new Date('2026-11-03T04:21:00Z'),
                blocked_until: new Date('2026-11-03T04:51:00Z'),
                refund_deadline_at: new Date('2026-11-03T00:21:00Z'),
            });
        });
    });

    describe('[FAIL:service] 지금 바로', () => {
        it('1박이면 400 validation_errors.is_now, 호실 조회 없음', async () => {
            const {result} = await runCreate({...NOW_HOURLY, room_plan_type_id: 'NIGHT'});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '지금 바로 이용은 시간 이용만 예약할 수 있습니다.', validation_errors: [{property: 'is_now', message: '지금 바로 이용은 시간 이용만 예약할 수 있습니다.'}]},
            });
            expect(repo.findReservationRoom).not.toHaveBeenCalled();
        });

        it('오늘이 아닌 날짜면 400 validation_errors.date, 호실 조회 없음', async () => {
            const {result} = await runCreate({...NOW_HOURLY, date: '2026-11-04'});

            expect(result?.error).toEqual({
                status_code: 400,
                body: {message: '지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.', validation_errors: [{property: 'date', message: '지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.'}]},
            });
            expect(repo.findReservationRoom).not.toHaveBeenCalled();
        });

        it('점유와 겹치면 400 예약할 수 없는 시간, 결제 쓰기 없음', async () => {
            vi.setSystemTime(new Date('2026-11-03T01:21:45Z'));
            repo.findReservations.mockResolvedValueOnce([{room_id: ROOM_ID, start_at: new Date('2026-11-03T02:00:00Z'), blocked_until: new Date('2026-11-03T05:30:00Z')}]);

            const {result} = await runCreate(NOW_HOURLY);

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약할 수 없는 시간입니다.', validation_errors: null}});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면 404, 쓰기 없음', async () => {
            repo.findReservationRoom.mockResolvedValueOnce(null);

            const {result} = await runCreate(HOURLY);

            expect(result?.error).toEqual({status_code: 404, body: {message: '호실을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('업체가 활성이 아니면 404', async () => {
            repo.findReservationStore.mockResolvedValueOnce(null);

            const {result} = await runCreate(HOURLY);

            expect(result?.error?.status_code).toBe(404);
            expect(repo.findReservationStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: 'ACTIVE'});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('그룹 상품을 팔지 않으면 400 판매하지 않는 상품, 쓰기 없음', async () => {
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('HOURLY', {is_used: 0})]);

            const {result} = await runCreate(HOURLY);

            expect(result?.error).toEqual({status_code: 400, body: {message: '판매하지 않는 상품입니다.', validation_errors: null}});
            expect(repo.findGroupPlans).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'HOURLY'});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('같은 호실에서 10분 안에 결제 대기가 만료된 적이 있으면 400, 재고 판정 없음', async () => {
            repo.countRecentExpired.mockResolvedValueOnce(1);

            const {result} = await runCreate(HOURLY);

            expect(result?.error).toEqual({status_code: 400, body: {message: '결제하지 않아 만료된 호실은 10분 뒤에 다시 예약할 수 있습니다.', validation_errors: null}});
            expect(repo.findStoreHours).not.toHaveBeenCalled();
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('재고 판정에 걸리면(영업시간 밖 07:00 시작) 400, 쓰기 없음', async () => {
            const {result} = await runCreate({...HOURLY, start_time: '07:00'});

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약할 수 없는 시간입니다.', validation_errors: null}});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('없는 날짜면 400 validation_errors.date, 호실 조회 없음', async () => {
            const {result} = await runCreate({...HOURLY, date: '2026-02-30'});

            expect(result?.error).toEqual({status_code: 400, body: {message: '없는 날짜입니다.', validation_errors: [{property: 'date', message: '없는 날짜입니다.'}]}});
            expect(repo.findReservationRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('같은 호실 점유 겹침(배타 제약 — repository 400)이면 failed 400, 구간 쓰기 없음', async () => {
            repo.insertReservation.mockRejectedValueOnce(new BadRequestException({message: '이미 예약된 시간입니다.'}));

            const {result} = await runCreate(HOURLY);

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 예약된 시간입니다.', validation_errors: null}});
            expect(repo.insertReservationDetail).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:external]', () => {
        it('토스 키가 없으면(결제 환경 503) 재시도, 쓰기 없음', async () => {
            payment.environment.mockImplementationOnce(() => {
                throw new ServiceUnavailableException({message: '결제 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'});
            });

            const {decision} = await runCreate(HOURLY);

            expect(decision.action).toBe('requeue');
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('시간 이용 시작 시각이 30분 단위가 아니면 → start_time', async () => {
            await expect(validateBody(ReservationDto, {...HOURLY, start_time: '13:15'})).resolves.toEqual({
                message: '시작 시각을 30분 단위 HH:mm 으로 입력해주세요.',
                validation_errors: [{property: 'start_time', message: '시작 시각을 30분 단위 HH:mm 으로 입력해주세요.'}],
            });
        });

        it('연박 박수가 181 이면 → nights', async () => {
            await expect(validateBody(ReservationDto, {room_id: ROOM_ID, room_plan_type_id: 'LONG', date: '2026-11-04', nights: 181})).resolves.toEqual({
                message: '박수는 1 ~ 180박 사이로 입력해주세요.',
                validation_errors: [{property: 'nights', message: '박수는 1 ~ 180박 사이로 입력해주세요.'}],
            });
        });

        it('지금 바로 이용 여부가 0 · 1 이 아니면 → is_now', async () => {
            await expect(validateBody(ReservationDto, {...HOURLY, is_now: 2})).resolves.toEqual({
                message: '지금 바로 이용 여부가 올바르지 않습니다.',
                validation_errors: [{property: 'is_now', message: '지금 바로 이용 여부가 올바르지 않습니다.'}],
            });
        });

        it('시간 이용 + 지금 바로 1 이면 시작 시각 없이 통과', async () => {
            await expect(validateBody(ReservationDto, NOW_HOURLY)).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 호실 조회 없음', async () => {
            const {result} = await runCreate(HOURLY, null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findReservationRoom).not.toHaveBeenCalled();
        });
    });

    /**
     * 예약 생성 명령 1건
     *
     * @param payload 입력
     * @param actor 로그인 이용자(없으면 null)
     * @returns 판정 · 결과
     */
    async function runCreate(payload: Record<string, unknown>, actor: Actor | null = USER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.CREATE, payload, actor});
    }
});
