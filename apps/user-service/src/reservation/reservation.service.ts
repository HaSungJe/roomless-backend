import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {In, LessThan, MoreThan, Not} from 'typeorm';
import {Pagination} from '@app/common/utils/pagination.js';
import {generateId} from '@app/common/utils/id.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {ReservationAvailabilityDto, ReservationAvailabilityResultDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import type {ReservationCancelDto, ReservationCancelResultDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import type {ReservationDetailResultDto} from '@app/contracts/reservation/dto/reservation-detail.dto.js';
import type {ReservationListDto, ReservationListResultDto} from '@app/contracts/reservation/dto/reservation-list.dto.js';
import type {ReservationPaymentConfirmDto, ReservationPaymentConfirmResultDto} from '@app/contracts/reservation/dto/reservation-payment-confirm.dto.js';
import type {ReservationRoomChangeDto} from '@app/contracts/reservation/dto/reservation-room-change.dto.js';
import type {ReservationStoreCancelDto} from '@app/contracts/reservation/dto/reservation-store-cancel.dto.js';
import type {ReservationStoreDto, ReservationStoreResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import type {ReservationDto, ReservationResultDto} from '@app/contracts/reservation/dto/reservation.dto.js';
import {
    PAYMENT_STATE,
    RESERVATION_CANCEL_ACTOR,
    RESERVATION_DETAIL_TYPE,
    RESERVATION_OCCUPYING_STATES,
    RESERVATION_PAYMENT_PENDING_MINUTES,
    RESERVATION_REBOOK_BLOCK_MINUTES,
    RESERVATION_REFUND_REASON,
    RESERVATION_STATE,
} from '@app/contracts/reservation/reservation.constants.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {PAYMENT_GATEWAY, SMS_SENDER} from '@app/integration/integration.symbols.js';
import {verifyPaymentLookup} from '@app/integration/integration.util.js';
import type {PaymentGatewayInterface, PaymentLookupResult, SmsSenderInterface} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from './interfaces/reservation.repository.interface.js';
import {
    RESERVATION_DATE_INVALID_MESSAGE,
    RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE,
    RESERVATION_NOT_CANCELABLE_MESSAGE,
    RESERVATION_NOT_FOUND_MESSAGE,
    RESERVATION_PAYMENT_NOT_FOUND_MESSAGE,
    RESERVATION_PLAN_TYPE,
    RESERVATION_ROOM_NOT_FOUND_MESSAGE,
    RESERVATION_ROOM_STATE,
    RESERVATION_STATE_CHANGED_MESSAGE,
    RESERVATION_STORE_NOT_FOUND_MESSAGE,
    RESERVATION_STORE_STATE_ACTIVE,
} from './reservation.constants.js';
import {RESERVATION_REPOSITORY} from './reservation.symbols.js';
import {
    buildBookingContext,
    buildOrderName,
    buildRoomChangeSms,
    buildStoreCancelSms,
    calculateRefundAmount,
    calculateStayPrice,
    isGroupPlanOnSale,
    isNightsAllowed,
    isStayBookable,
    isValidDate,
    listStays,
    nowKst,
    toAvailabilityRooms,
    toKstDay,
    toReservationDetail,
    toReservationListItem,
    toStay,
    toStaysRange,
    toStoreReservationRooms,
} from './reservation.util.js';

/**
 * 예약 service — 재고 판정 · 예약 · 결제 확인 · 취소 · 조회 · 업체 취소 · 호실 이동.
 * 업체 · 객실 · 상품 · 영업시간은 공유 DB 에서 같은 엔티티로 읽는다(사용자 결정 2026-11-03). 결제는 토스(프론트 승인 · 여기 조회 대조), 환불은 scheduler crontab 이 백그라운드로 한다.
 */
@Injectable()
export class ReservationService {
    /**
     * @param reservationRepository 예약 repository 포트
     * @param paymentGateway 결제 포트(토스)
     * @param smsSender SMS 발송 포트(업체 취소 · 호실 이동 안내)
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayInterface,
        @Inject(SMS_SENDER) private readonly smsSender: SmsSenderInterface,
    ) {}

    /**
     * 호실별 예약 가능 시간 — 업체 · 날짜 · 상품(연박은 박수). 이 상품을 파는 호실만, 구간은 재고 판정을 지난 것만. (내부 HTTP: GET /internal/v1/user-service/reservation/availability)
     *
     * @param dto 업체 · 날짜 · 상품 · 박수
     * @returns 호실별 금액 · 예약 가능 구간
     * @throws BadRequestException 없는 날짜 · 박수가 업체 설정 밖
     * @throws NotFoundException 업체가 없거나 활성이 아닐 때
     */
    async getAvailability(dto: ReservationAvailabilityDto): Promise<ReservationAvailabilityResultDto> {
        // 1. 날짜 · 박수
        if (!isValidDate(dto.date)) {
            throw new BadRequestException({message: RESERVATION_DATE_INVALID_MESSAGE, validation_errors: createValidationError('date', RESERVATION_DATE_INVALID_MESSAGE)});
        }
        const nights = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? Number(dto.nights) : null;
        const empty: ReservationAvailabilityResultDto = {room_plan_type_id: dto.room_plan_type_id, date: dto.date, nights, list: []};

        // 2. 업체 — 활성 · 지워지지 않음
        const store = await this.reservationRepository.findReservationStore({store_id: dto.store_id, store_state_id: RESERVATION_STORE_STATE_ACTIVE});
        if (!store) {
            throw new NotFoundException({message: RESERVATION_STORE_NOT_FOUND_MESSAGE});
        }

        // 3. 업체 상품 설정 — 팔지 않으면 빈 목록, 연박은 박수
        const plan = await this.reservationRepository.findStorePlan({store_id: store.store_id, room_plan_type_id: dto.room_plan_type_id});
        if (!plan || plan.is_used !== 1) {
            return empty;
        }
        if (nights !== null && !isNightsAllowed(plan, nights)) {
            const message = `연박은 ${plan.min_nights} ~ ${plan.max_nights}박으로 예약할 수 있습니다.`;
            throw new BadRequestException({message, validation_errors: createValidationError('nights', message)});
        }

        // 4. 호실 · 판매 중인 그룹 상품 · 기간 가격
        const rooms = await this.reservationRepository.findBookableRooms(store.store_id);
        const group_ids = [...new Set(rooms.map((room) => room.room_group_id))];
        if (group_ids.length === 0) {
            return empty;
        }
        const group_plans = (await this.reservationRepository.findGroupPlans({room_group_id: In(group_ids), room_plan_type_id: plan.room_plan_type_id})).filter(isGroupPlanOnSale);
        if (group_plans.length === 0) {
            return empty;
        }
        const periods = await this.reservationRepository.findGroupPlanPrices({room_group_plan_id: In(group_plans.map((item) => item.room_group_plan_id))});

        // 5. 후보 구간 · 재고 판정 재료(조회 범위 안의 일시 예약불가 · 점유 예약)
        const stays = listStays(plan, toKstDay(dto.date), nights);
        const range = toStaysRange(stays, store.maintenance_minutes);
        const hours = await this.reservationRepository.findStoreHours(store.store_id);
        const breaks = await this.reservationRepository.findStoreBreaks(store.store_id);
        const unavailable = await this.reservationRepository.findUnavailablePeriods({store_id: store.store_id, starts_at: LessThan(range.to), ends_at: MoreThan(range.from)});
        const occupied = await this.reservationRepository.findReservations({
            room_id: In(rooms.map((room) => room.room_id)),
            reservation_state_id: In(RESERVATION_OCCUPYING_STATES),
            start_at: LessThan(range.to),
            blocked_until: MoreThan(range.from),
        });
        const context = buildBookingContext(nowKst(), store, plan, hours, breaks, unavailable);

        // 6. 호실별 금액 · 구간
        return {...empty, list: toAvailabilityRooms(rooms, group_plans, periods, stays, context, occupied, nights)};
    }

    /**
     * 예약 생성 — 재고 판정을 다시 하고 결제(READY) → 예약(PENDING) → 기본 구간(PENDING · 결제 대기 5분)을 만든다. (RabbitMQ: user.reservation.create)
     * - 환불 마감 시각 · 마감 뒤 환불 비율 · 정비시간은 예약 때 업체 값을 저장한다
     * - 같은 호실 점유 겹침의 최종 판정은 배타 제약(repository 가 400)
     *
     * @param user_id 이용자 ID
     * @param dto 호실 · 상품 · 날짜 · 시작 시각 · 박수
     * @returns 예약 ID · 결제 정보(토스 orderId · 금액 · 주문명) · 결제 대기 만료 · 이용 구간
     */
    @Transactional()
    async createReservation(user_id: string, dto: ReservationDto): Promise<ReservationResultDto> {
        // 1. 날짜
        if (!isValidDate(dto.date)) {
            throw new BadRequestException({message: RESERVATION_DATE_INVALID_MESSAGE, validation_errors: createValidationError('date', RESERVATION_DATE_INVALID_MESSAGE)});
        }
        const nights = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? (dto.nights as number) : null;
        const start_time = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY ? (dto.start_time as string) : null;

        // 2. 호실 · 그룹 · 업체
        const room = await this.reservationRepository.findReservationRoom({room_id: dto.room_id});
        const group = room ? await this.reservationRepository.findReservationRoomGroup({room_group_id: room.room_group_id}) : null;
        if (!room || !group) {
            throw new NotFoundException({message: RESERVATION_ROOM_NOT_FOUND_MESSAGE});
        }
        const store = await this.reservationRepository.findReservationStore({store_id: room.store_id, store_state_id: RESERVATION_STORE_STATE_ACTIVE});
        if (!store) {
            throw new NotFoundException({message: RESERVATION_STORE_NOT_FOUND_MESSAGE});
        }

        // 3. 상품 — 업체 상품 설정 · 그룹 상품 판매, 연박 박수
        const plan = await this.reservationRepository.findStorePlan({store_id: store.store_id, room_plan_type_id: dto.room_plan_type_id});
        const [group_plan] = await this.reservationRepository.findGroupPlans({room_group_id: group.room_group_id, room_plan_type_id: dto.room_plan_type_id});
        if (!plan || plan.is_used !== 1 || !group_plan || !isGroupPlanOnSale(group_plan)) {
            throw new BadRequestException({message: '판매하지 않는 상품입니다.'});
        }
        if (nights !== null && !isNightsAllowed(plan, nights)) {
            const message = `연박은 ${plan.min_nights} ~ ${plan.max_nights}박으로 예약할 수 있습니다.`;
            throw new BadRequestException({message, validation_errors: createValidationError('nights', message)});
        }

        // 4. 같은 호실 재예약 제한 — 결제 대기 만료 시각부터 10분
        const now = nowKst();
        const recent = await this.reservationRepository.countRecentExpired(user_id, room.room_id, now.subtract(RESERVATION_REBOOK_BLOCK_MINUTES, 'minute').toDate());
        if (recent > 0) {
            throw new BadRequestException({message: '결제하지 않아 만료된 호실은 10분 뒤에 다시 예약할 수 있습니다.'});
        }

        // 5. 이용 구간 · 재고 판정
        const stay = toStay(plan, toKstDay(dto.date), start_time, nights);
        const range = toStaysRange([stay], store.maintenance_minutes);
        const hours = await this.reservationRepository.findStoreHours(store.store_id);
        const breaks = await this.reservationRepository.findStoreBreaks(store.store_id);
        const unavailable = await this.reservationRepository.findUnavailablePeriods({store_id: store.store_id, starts_at: LessThan(range.to), ends_at: MoreThan(range.from)});
        const occupied = await this.reservationRepository.findReservations({
            room_id: room.room_id,
            reservation_state_id: In(RESERVATION_OCCUPYING_STATES),
            start_at: LessThan(range.to),
            blocked_until: MoreThan(range.from),
        });
        if (!isStayBookable(stay, buildBookingContext(now, store, plan, hours, breaks, unavailable), room.room_state_id, occupied)) {
            throw new BadRequestException({message: '예약할 수 없는 시간입니다.'});
        }

        // 6. 금액 · 주문명
        const periods = await this.reservationRepository.findGroupPlanPrices({room_group_plan_id: group_plan.room_group_plan_id});
        const amount = calculateStayPrice(plan.room_plan_type_id, stay.day, nights, group_plan.price, periods);
        const order_name = buildOrderName(store.store_name, room.room_name, plan.room_plan_type_id, nights);
        const expires_at = now.add(RESERVATION_PAYMENT_PENDING_MINUTES, 'minute').toDate();

        // 7. 결제(READY) — 결제 환경은 키 접두사로(키가 없으면 503)
        const payment = new PaymentEntity();
        payment.payment_id = generateId();
        payment.user_id = user_id;
        payment.payment_state_id = PAYMENT_STATE.READY;
        payment.environment = this.paymentGateway.environment();
        payment.order_name = order_name;
        payment.amount = amount;
        payment.payment_key = null;
        payment.method = null;
        payment.approved_at = null;
        payment.receipt_url = null;
        payment.refund_amount = null;
        payment.refund_reason = null;
        payment.refund_requested_at = null;
        payment.refunded_at = null;
        payment.failure_code = null;
        payment.failure_message = null;
        await this.reservationRepository.insertPayment(payment);

        // 8. 예약(PENDING) — 점유 겹침은 배타 제약이 400
        const reservation = new ReservationEntity();
        reservation.reservation_id = generateId();
        reservation.user_id = user_id;
        reservation.store_id = store.store_id;
        reservation.room_id = room.room_id;
        reservation.room_plan_type_id = plan.room_plan_type_id;
        reservation.reservation_state_id = RESERVATION_STATE.PENDING;
        reservation.start_at = stay.start.toDate();
        reservation.end_at = stay.end.toDate();
        reservation.maintenance_minutes = store.maintenance_minutes;
        reservation.blocked_until = stay.end.add(store.maintenance_minutes, 'minute').toDate();
        reservation.total_price = amount;
        reservation.refund_deadline_at = stay.start.subtract(store.refund_deadline_minutes, 'minute').toDate();
        reservation.late_refund_percent = store.late_refund_percent;
        reservation.checked_in_at = null;
        reservation.completed_at = null;
        reservation.canceled_at = null;
        reservation.cancel_actor = null;
        reservation.cancel_reason = null;
        await this.reservationRepository.insertReservation(reservation);

        // 9. 기본 구간(PENDING · 결제 대기 만료)
        const detail = new ReservationDetailEntity();
        detail.reservation_detail_id = generateId();
        detail.reservation_id = reservation.reservation_id;
        detail.reservation_detail_type_id = RESERVATION_DETAIL_TYPE.BASE;
        detail.room_plan_type_id = plan.room_plan_type_id;
        detail.reservation_state_id = RESERVATION_STATE.PENDING;
        detail.payment_id = payment.payment_id;
        detail.start_at = reservation.start_at;
        detail.end_at = reservation.end_at;
        detail.price = amount;
        detail.expires_at = expires_at;
        await this.reservationRepository.insertReservationDetail(detail);

        return {
            reservation_id: reservation.reservation_id,
            payment_id: payment.payment_id,
            order_name,
            amount,
            expires_at: expires_at.toISOString(),
            start_at: reservation.start_at.toISOString(),
            end_at: reservation.end_at.toISOString(),
        };
    }

    /**
     * 결제 확인 — 프론트가 토스 승인 뒤 넘긴 결제 키로 토스에서 다시 읽어 대조한다(verifyPaymentLookup). (RabbitMQ: user.reservation.payment-confirm)
     * - 결제됨 → 결제 DONE · 구간 · 예약 CONFIRMED / 미결제 · 다른 주문 → 400(쓰기 없음)
     * - 금액 불일치 · 이미 결제 대기가 끝난 예약 → 결제 환불 신청(+ 예약 만료)을 커밋하고 실패를 **반환**한다(재시도 없음)
     * - 같은 결제 키로 이미 확정 → 그대로 결과(중복 요청)
     *
     * @param user_id 이용자 ID
     * @param dto 결제 ID · 결제 키
     * @returns 예약 ID · 상태 — 환불 신청한 실패는 BadRequestException 을 돌려준다
     */
    @Transactional()
    async confirmPayment(user_id: string, dto: ReservationPaymentConfirmDto): Promise<ReservationPaymentConfirmResultDto | BadRequestException> {
        // 1. 내 결제 · 구간 · 예약
        const payment = await this.reservationRepository.findPayment({payment_id: dto.payment_id, user_id});
        const [detail] = payment ? await this.reservationRepository.findReservationDetails({payment_id: payment.payment_id}) : [];
        const reservation = detail ? await this.reservationRepository.findReservation({reservation_id: detail.reservation_id}) : null;
        if (!payment || !detail || !reservation) {
            throw new NotFoundException({message: RESERVATION_PAYMENT_NOT_FOUND_MESSAGE});
        }

        // 2. 이미 확정 — 같은 결제 키면 지금 상태, 다른 키면 400
        if (payment.payment_state_id === PAYMENT_STATE.DONE) {
            if (payment.payment_key === dto.payment_key) {
                return {reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id};
            }
            throw new BadRequestException({message: '이미 다른 결제로 확정된 예약입니다.'});
        }
        if (payment.payment_state_id !== PAYMENT_STATE.READY && payment.payment_state_id !== PAYMENT_STATE.EXPIRED) {
            throw new BadRequestException({message: '확인할 수 없는 결제입니다.'});
        }

        // 3. 토스에서 다시 읽어 대조
        const lookup = await this.paymentGateway.getPayment(dto.payment_key);
        const verdict = verifyPaymentLookup(lookup, payment.payment_id, payment.amount);
        if (verdict === 'NOT_PAID') {
            throw new BadRequestException({message: '결제가 완료되지 않았습니다.'});
        }
        if (verdict === 'FOREIGN') {
            throw new BadRequestException({message: '결제 정보가 맞지 않습니다.'});
        }
        const paid = lookup as PaymentLookupResult;
        const now = nowKst().toDate();

        // 4. 금액 불일치 · 결제 대기가 끝난 예약 — 토스가 받은 금액 전액 환불 신청(+ 아직 결제 대기면 만료), 커밋 뒤 실패를 반환
        const pending = reservation.reservation_state_id === RESERVATION_STATE.PENDING && detail.reservation_state_id === RESERVATION_STATE.PENDING;
        if (verdict === 'MISMATCH' || !pending) {
            const refund = new PaymentEntity();
            refund.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
            refund.payment_key = paid.payment_key;
            refund.method = paid.method;
            refund.approved_at = paid.approved_at ?? now;
            refund.receipt_url = paid.receipt_url;
            refund.refund_amount = paid.total_amount;
            refund.refund_reason = verdict === 'MISMATCH' ? RESERVATION_REFUND_REASON.AMOUNT_MISMATCH : RESERVATION_REFUND_REASON.LATE_PAYMENT;
            refund.refund_requested_at = now;
            if (!(await this.reservationRepository.updatePayment({payment_id: payment.payment_id, payment_state_id: payment.payment_state_id}, refund))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
            if (pending) {
                const expiredDetail = new ReservationDetailEntity();
                expiredDetail.reservation_state_id = RESERVATION_STATE.EXPIRED;
                await this.reservationRepository.updateReservationDetails({payment_id: payment.payment_id, reservation_state_id: RESERVATION_STATE.PENDING}, expiredDetail);
                const expired = new ReservationEntity();
                expired.reservation_state_id = RESERVATION_STATE.EXPIRED;
                await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.PENDING}, expired);
            }
            return new BadRequestException({message: verdict === 'MISMATCH' ? '결제 금액이 맞지 않아 결제를 취소했습니다.' : '결제 대기 시간이 지나 결제를 취소했습니다. 다시 예약해주세요.'});
        }

        // 5. 확정 — 결제 DONE → 구간 → 예약 (상태 조건 — crontab 과 겹치면 400 롤백)
        const done = new PaymentEntity();
        done.payment_state_id = PAYMENT_STATE.DONE;
        done.payment_key = paid.payment_key;
        done.method = paid.method;
        done.approved_at = paid.approved_at ?? now;
        done.receipt_url = paid.receipt_url;
        if (!(await this.reservationRepository.updatePayment({payment_id: payment.payment_id, payment_state_id: PAYMENT_STATE.READY}, done))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        const confirmedDetail = new ReservationDetailEntity();
        confirmedDetail.reservation_state_id = RESERVATION_STATE.CONFIRMED;
        await this.reservationRepository.updateReservationDetails({payment_id: payment.payment_id, reservation_state_id: RESERVATION_STATE.PENDING}, confirmedDetail);
        const confirmed = new ReservationEntity();
        confirmed.reservation_state_id = RESERVATION_STATE.CONFIRMED;
        if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.PENDING}, confirmed))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        return {reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED};
    }

    /**
     * 이용자 취소 — 사유 필수. 확정 예약은 환불 마감 전 100% · 마감 뒤 ~ 이용 시작 전 예약 때 비율(원 단위 내림) 환불 신청, 시작 뒤에는 400.
     * 결제 대기 예약은 결제를 만료한다(환불 없음 — 늦은 승인은 recheck crontab 이 환불한다). 호실은 바로 풀린다. (RabbitMQ: user.reservation.cancel)
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @param dto 취소 사유
     * @returns 환불 금액(결제 대기 취소는 null)
     */
    @Transactional()
    async cancelReservation(user_id: string, reservation_id: string, dto: ReservationCancelDto): Promise<ReservationCancelResultDto> {
        // 1. 내 예약
        const reservation = await this.reservationRepository.findReservation({reservation_id, user_id});
        if (!reservation || reservation.reservation_state_id === RESERVATION_STATE.EXPIRED) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        if (reservation.reservation_state_id !== RESERVATION_STATE.PENDING && reservation.reservation_state_id !== RESERVATION_STATE.CONFIRMED) {
            throw new BadRequestException({message: RESERVATION_NOT_CANCELABLE_MESSAGE});
        }
        const now = nowKst();
        const details = await this.reservationRepository.findReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id});

        // 2. 확정 예약 — 결제마다 환불액(시작 뒤면 400)
        const refunds: {payment_id: string; amount: number}[] = [];
        if (reservation.reservation_state_id === RESERVATION_STATE.CONFIRMED) {
            for (const detail of details) {
                const payment = await this.reservationRepository.findPayment({payment_id: detail.payment_id});
                const amount = payment ? calculateRefundAmount(payment.amount, now, reservation.refund_deadline_at, reservation.start_at, reservation.late_refund_percent) : null;
                if (amount === null) {
                    throw new BadRequestException({message: '이용 시작 후에는 취소할 수 없습니다.'});
                }
                refunds.push({payment_id: detail.payment_id, amount});
            }
        }

        // 3. 예약 · 구간 취소(상태 조건)
        const canceled = new ReservationEntity();
        canceled.reservation_state_id = RESERVATION_STATE.CANCELED;
        canceled.canceled_at = now.toDate();
        canceled.cancel_actor = RESERVATION_CANCEL_ACTOR.USER;
        canceled.cancel_reason = dto.cancel_reason;
        if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id}, canceled))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        const canceledDetail = new ReservationDetailEntity();
        canceledDetail.reservation_state_id = RESERVATION_STATE.CANCELED;
        await this.reservationRepository.updateReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id}, canceledDetail);

        // 4. 결제 대기 — 결제 만료(환불 없음)
        if (reservation.reservation_state_id === RESERVATION_STATE.PENDING) {
            for (const detail of details) {
                const expired = new PaymentEntity();
                expired.payment_state_id = PAYMENT_STATE.EXPIRED;
                await this.reservationRepository.updatePayment({payment_id: detail.payment_id, payment_state_id: PAYMENT_STATE.READY}, expired);
            }
            return {refund_amount: null};
        }

        // 5. 확정 — 환불액 > 0 이면 환불 신청(백그라운드 crontab 이 토스로), 0 이면 결제는 그대로(환불 없이 취소)
        for (const refund of refunds.filter((item) => item.amount > 0)) {
            const requested = new PaymentEntity();
            requested.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
            requested.refund_amount = refund.amount;
            requested.refund_reason = RESERVATION_REFUND_REASON.USER;
            requested.refund_requested_at = now.toDate();
            if (!(await this.reservationRepository.updatePayment({payment_id: refund.payment_id, payment_state_id: PAYMENT_STATE.DONE}, requested))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
        }
        return {refund_amount: refunds.reduce((sum, item) => sum + item.amount, 0)};
    }

    /**
     * 내 예약 목록 — 결제 대기 만료 건 제외, 입실 최근순. (내부 HTTP: GET /internal/v1/user-service/reservation)
     *
     * @param user_id 이용자 ID
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getMyReservations(user_id: string, dto: ReservationListDto): Promise<ReservationListResultDto> {
        const total_count = await this.reservationRepository.countReservations({user_id, reservation_state_id: Not(RESERVATION_STATE.EXPIRED)});
        const pagination = new Pagination({...dto, total_count});
        const rows = await this.reservationRepository.findMyReservationRows(user_id, pagination.limit, pagination.offset);
        return {list: rows.map(toReservationListItem), pagination: pagination.getPagination()};
    }

    /**
     * 내 예약 상세 — 구간 · 결제 포함, 남의 예약 · 결제 대기 만료 건은 404. (내부 HTTP: GET /internal/v1/user-service/reservation/:reservation_id)
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @returns 상세
     */
    async getMyReservation(user_id: string, reservation_id: string): Promise<ReservationDetailResultDto> {
        const row = await this.reservationRepository.findMyReservationRow(user_id, reservation_id);
        if (!row) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        const segments = await this.reservationRepository.findReservationSegmentRows(row.reservation_id);
        return toReservationDetail(row, segments);
    }

    /**
     * 내 업체 예약 현황 (매니저) — 날짜(한국 날짜) 하루와 겹치는 결제 대기 · 확정 · 이용 중 · 이용 완료 예약을 호실별로(이용자 이름 · 휴대폰 포함). (내부 HTTP: GET /internal/v1/user-service/reservation/store)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 날짜
     * @returns 호실별 예약
     */
    async getStoreReservations(user_id: string, dto: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        // 1. 날짜
        if (!isValidDate(dto.date)) {
            throw new BadRequestException({message: RESERVATION_DATE_INVALID_MESSAGE, validation_errors: createValidationError('date', RESERVATION_DATE_INVALID_MESSAGE)});
        }

        // 2. 매니저의 소속 업체
        const manager = await this.reservationRepository.findReservationUser({user_id, login_scope: LOGIN_SCOPE.MANAGER});
        if (!manager?.store_id) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 3. 호실 · 그날 예약
        const day = toKstDay(dto.date);
        const rooms = await this.reservationRepository.findStoreRoomRows(manager.store_id);
        const rows = await this.reservationRepository.findStoreReservationRows(manager.store_id, day.toDate(), day.add(1, 'day').toDate());
        return {date: dto.date, list: toStoreReservationRooms(rooms, rows)};
    }

    /**
     * 업체 취소 (매니저) — 내 업체의 결제 대기 · 확정 예약. 확정은 100% 환불 신청, 결제 대기는 결제 만료. 이용자에게 SMS(번호가 있을 때 — 마지막 단계). (RabbitMQ: user.reservation.store-cancel)
     *
     * @param user_id 로그인 매니저 ID
     * @param reservation_id 예약 ID
     * @param dto 취소 사유
     */
    @Transactional()
    async cancelStoreReservation(user_id: string, reservation_id: string, dto: ReservationStoreCancelDto): Promise<void> {
        // 1. 매니저의 소속 업체 · 그 업체 예약
        const manager = await this.reservationRepository.findReservationUser({user_id, login_scope: LOGIN_SCOPE.MANAGER});
        if (!manager?.store_id) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const reservation = await this.reservationRepository.findReservation({reservation_id, store_id: manager.store_id});
        if (!reservation) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        if (reservation.reservation_state_id !== RESERVATION_STATE.PENDING && reservation.reservation_state_id !== RESERVATION_STATE.CONFIRMED) {
            throw new BadRequestException({message: RESERVATION_NOT_CANCELABLE_MESSAGE});
        }
        const now = nowKst().toDate();
        const details = await this.reservationRepository.findReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id});

        // 2. 예약 · 구간 취소(상태 조건)
        const canceled = new ReservationEntity();
        canceled.reservation_state_id = RESERVATION_STATE.CANCELED;
        canceled.canceled_at = now;
        canceled.cancel_actor = RESERVATION_CANCEL_ACTOR.STORE;
        canceled.cancel_reason = dto.cancel_reason;
        if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id}, canceled))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        const canceledDetail = new ReservationDetailEntity();
        canceledDetail.reservation_state_id = RESERVATION_STATE.CANCELED;
        await this.reservationRepository.updateReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id}, canceledDetail);

        // 3. 결제 — 확정은 전액 환불 신청, 결제 대기는 만료
        for (const detail of details) {
            const payment = new PaymentEntity();
            if (reservation.reservation_state_id === RESERVATION_STATE.CONFIRMED) {
                payment.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
                payment.refund_amount = detail.price;
                payment.refund_reason = RESERVATION_REFUND_REASON.STORE;
                payment.refund_requested_at = now;
                await this.reservationRepository.updatePayment({payment_id: detail.payment_id, payment_state_id: PAYMENT_STATE.DONE}, payment);
            } else {
                payment.payment_state_id = PAYMENT_STATE.EXPIRED;
                await this.reservationRepository.updatePayment({payment_id: detail.payment_id, payment_state_id: PAYMENT_STATE.READY}, payment);
            }
        }

        // 4. 이용자 SMS — 번호가 있을 때만(마지막 단계)
        const user = await this.reservationRepository.findReservationUser({user_id: reservation.user_id});
        const store = await this.reservationRepository.findReservationStore({store_id: reservation.store_id});
        if (user?.phone && store) {
            await this.smsSender.send({to: user.phone, text: buildStoreCancelSms(store.store_name, reservation.start_at, dto.cancel_reason)});
        }
    }

    /**
     * 호실 이동 (매니저) — 내 업체의 이용 시작 전 확정 예약을 같은 객실 그룹 · 사용중지 아닌 다른 호실로. 겹침은 배타 제약이 400, 금액 · 시간은 그대로. 이용자에게 SMS. (RabbitMQ: user.reservation.room-change)
     *
     * @param user_id 로그인 매니저 ID
     * @param reservation_id 예약 ID
     * @param dto 옮길 호실 ID
     */
    @Transactional()
    async changeReservationRoom(user_id: string, reservation_id: string, dto: ReservationRoomChangeDto): Promise<void> {
        // 1. 매니저의 소속 업체 · 그 업체 예약
        const manager = await this.reservationRepository.findReservationUser({user_id, login_scope: LOGIN_SCOPE.MANAGER});
        if (!manager?.store_id) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const reservation = await this.reservationRepository.findReservation({reservation_id, store_id: manager.store_id});
        if (!reservation) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        if (reservation.reservation_state_id !== RESERVATION_STATE.CONFIRMED || !nowKst().isBefore(reservation.start_at)) {
            throw new BadRequestException({message: '이용 시작 전의 확정 예약만 옮길 수 있습니다.'});
        }
        if (reservation.room_id === dto.room_id) {
            throw new BadRequestException({message: '지금과 같은 호실입니다.', validation_errors: createValidationError('room_id', '지금과 같은 호실입니다.')});
        }

        // 2. 지금 호실 · 옮길 호실 — 같은 그룹 · 사용중지 아님
        const from = await this.reservationRepository.findReservationRoom({room_id: reservation.room_id});
        const to = await this.reservationRepository.findReservationRoom({room_id: dto.room_id, store_id: manager.store_id});
        if (!from || !to) {
            throw new NotFoundException({message: RESERVATION_ROOM_NOT_FOUND_MESSAGE});
        }
        if (to.room_group_id !== from.room_group_id) {
            throw new BadRequestException({message: '같은 객실 그룹의 호실로만 옮길 수 있습니다.', validation_errors: createValidationError('room_id', '같은 객실 그룹의 호실로만 옮길 수 있습니다.')});
        }
        if (to.room_state_id === RESERVATION_ROOM_STATE.DISABLED) {
            throw new BadRequestException({message: '사용중지된 호실로는 옮길 수 없습니다.', validation_errors: createValidationError('room_id', '사용중지된 호실로는 옮길 수 없습니다.')});
        }

        // 3. 옮기기 — 상태 조건 · 겹침은 repository 가 400
        const entity = new ReservationEntity();
        entity.room_id = to.room_id;
        if (!(await this.reservationRepository.changeReservationRoom({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED}, entity))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }

        // 4. 이용자 SMS — 번호가 있을 때만(마지막 단계)
        const user = await this.reservationRepository.findReservationUser({user_id: reservation.user_id});
        const store = await this.reservationRepository.findReservationStore({store_id: reservation.store_id});
        if (user?.phone && store) {
            await this.smsSender.send({to: user.phone, text: buildRoomChangeSms(store.store_name, reservation.start_at, from.room_name, to.room_name)});
        }
    }
}
