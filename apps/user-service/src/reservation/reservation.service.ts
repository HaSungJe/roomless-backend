import {BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {In, LessThan, MoreThan, Not} from 'typeorm';
import {Pagination} from '@app/common/utils/pagination.js';
import {generateId} from '@app/common/utils/id.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {ReservationAvailabilityDto, ReservationAvailabilityResultDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import type {ReservationCancelRequestApproveResultDto} from '@app/contracts/reservation/dto/reservation-cancel-request-approve.dto.js';
import type {ReservationCancelRequestResultDto} from '@app/contracts/reservation/dto/reservation-cancel-request.dto.js';
import type {ReservationCancelDto, ReservationCancelResultDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import type {ReservationDetailResultDto} from '@app/contracts/reservation/dto/reservation-detail.dto.js';
import type {ReservationListDto, ReservationListResultDto} from '@app/contracts/reservation/dto/reservation-list.dto.js';
import type {ReservationPaymentConfirmDto, ReservationPaymentConfirmResultDto} from '@app/contracts/reservation/dto/reservation-payment-confirm.dto.js';
import type {ReservationQrResultDto} from '@app/contracts/reservation/dto/reservation-qr.dto.js';
import type {ReservationDto, ReservationResultDto} from '@app/contracts/reservation/dto/reservation.dto.js';
import {
    PAYMENT_STATE,
    RESERVATION_CANCEL_ACTOR,
    RESERVATION_CANCEL_REQUEST_STATE,
    RESERVATION_DETAIL_TYPE,
    RESERVATION_OCCUPYING_STATES,
    RESERVATION_PAYMENT_PENDING_MINUTES,
    RESERVATION_REBOOK_BLOCK_MINUTES,
    RESERVATION_REFUND_REASON,
    RESERVATION_STATE,
    USAGE_ROOM_STATE,
} from '@app/contracts/reservation/reservation.constants.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationCancelRequestEntity} from '@app/database/entities/reservation/reservation-cancel-request.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {DOOR_STORE, PAYMENT_GATEWAY} from '@app/integration/integration.symbols.js';
import {verifyPaymentLookup} from '@app/integration/integration.util.js';
import type {DoorStoreInterface, PaymentGatewayInterface, PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from './interfaces/reservation.repository.interface.js';
import {
    RESERVATION_CANCEL_REQUEST_NOT_FOUND_MESSAGE,
    RESERVATION_CANCEL_REQUEST_NOT_RESPONDABLE_MESSAGE,
    RESERVATION_DATE_FORMAT,
    RESERVATION_DATE_INVALID_MESSAGE,
    RESERVATION_NOT_CANCELABLE_MESSAGE,
    RESERVATION_NOT_FOUND_MESSAGE,
    RESERVATION_PAYMENT_NOT_FOUND_MESSAGE,
    RESERVATION_PLAN_TYPE,
    RESERVATION_QR_ISSUE_FAILED_MESSAGE,
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
    buildRoomQr,
    calculateCancelRefund,
    calculateStayPrice,
    cancelRequestState,
    isGroupPlanOnSale,
    isNightsAllowed,
    isRoomQrActive,
    isStayBookable,
    isValidDate,
    judgeReservationQr,
    judgeUsageTransition,
    listStays,
    nowKst,
    toAvailabilityGroups,
    toCancelRequest,
    toEndedUsageRoomState,
    toKstDay,
    toNowStay,
    toReservationDetail,
    toReservationListItem,
    toReservationQr,
    toStay,
    toStaysRange,
} from './reservation.util.js';

/**
 * 예약 service (이용자) — 재고 판정 · 예약 · 결제 확인 · 취소 · 조회 · 내 예약 QR · 이용 중 취소 요청 조회 · 승인 · 거절. 체크인 · 체크아웃은 없다 — 시작 시각에 이용 중(사용자 결정 2026-11-07). 매니저의 업체 예약 현황 · 업체 취소 · 호실 이동은 admin-service reservation 이다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 * 업체 · 객실 · 상품 · 영업시간은 공유 DB 에서 같은 엔티티로 읽는다(사용자 결정 2026-11-03). 결제는 토스(프론트 승인 · 여기 조회 대조), 환불은 scheduler crontab 이 백그라운드로 한다.
 */
@Injectable()
export class ReservationService {
    /**
     * @param reservationRepository 예약 repository 포트
     * @param paymentGateway 결제 포트(토스)
     * @param doorStore 문 정보 포트(Redis — 호실의 현재 QR)
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * 객실 그룹별 예약 가능 시간 — 업체 · 날짜 · 상품(연박은 박수) · 그룹 필터(선택). 그룹 → 시간대 → 예약 가능한 호수(사용자 결정 2026-11-06), 이 상품을 파는 그룹만,
     * 시간대는 재고 판정을 지난 호수가 있는 것만. 시간 이용 · 오늘이면 '지금 바로' 시간대를 맨 앞에 둔다. (내부 HTTP: GET /internal/v1/user-service/reservation/availability)
     *
     * @param dto 업체 · 날짜 · 상품 · 박수 · 그룹
     * @returns 그룹별 금액 · 시간대 · 예약 가능한 호수
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

        // 4. 호실(그룹 필터) · 판매 중인 그룹 상품 · 기간 가격
        const rooms = (await this.reservationRepository.findBookableRooms(store.store_id)).filter((room) => !dto.room_group_id || room.room_group_id === dto.room_group_id);
        const group_ids = [...new Set(rooms.map((room) => room.room_group_id))];
        if (group_ids.length === 0) {
            return empty;
        }
        const group_plans = (await this.reservationRepository.findGroupPlans({room_group_id: In(group_ids), room_plan_type_id: plan.room_plan_type_id})).filter(isGroupPlanOnSale);
        if (group_plans.length === 0) {
            return empty;
        }
        const periods = await this.reservationRepository.findGroupPlanPrices({room_group_plan_id: In(group_plans.map((item) => item.room_group_plan_id))});

        // 5. 후보 구간 — 시간 이용 · 오늘이면 지금 바로를 맨 앞에(사용자 결정 2026-11-06), 재고 판정 재료(조회 범위 안의 일시 예약불가 · 점유 예약)
        const now = nowKst();
        const day_stays = listStays(plan, toKstDay(dto.date), nights);
        const stays = plan.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY && dto.date === now.format(RESERVATION_DATE_FORMAT) ? [toNowStay(plan, now), ...day_stays] : day_stays;
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
        const context = buildBookingContext(now, store, plan, hours, breaks, unavailable);

        // 6. 그룹 → 시간대 → 호수
        return {...empty, list: toAvailabilityGroups(rooms, group_plans, periods, stays, context, occupied, nights)};
    }

    /**
     * 예약 생성 — 재고 판정을 다시 하고 결제(READY) → 예약(PENDING) → 기본 구간(PENDING · 결제 대기 5분)을 만든다. (RabbitMQ: user.reservation.create)
     * - 환불 마감 시각 · 마감 뒤 환불 비율 · 정비시간은 예약 때 업체 값을 저장한다
     * - 같은 호실 점유 겹침의 최종 판정은 배타 제약(repository 가 400)
     * - 시간 이용은 is_now 1 이면 지금(분 단위 내림)부터 이용 시간만큼(오늘 날짜만 — 사용자 결정 2026-11-06)
     *
     * @param user_id 이용자 ID
     * @param dto 호실 · 상품 · 날짜 · 시작 시각(또는 지금 바로) · 박수
     * @returns 예약 ID · 결제 정보(토스 orderId · 금액 · 주문명) · 결제 대기 만료 · 이용 구간
     */
    @Transactional()
    async createReservation(user_id: string, dto: ReservationDto): Promise<ReservationResultDto> {
        // 1. 날짜 · 지금 바로(시간 이용 · 오늘만)
        if (!isValidDate(dto.date)) {
            throw new BadRequestException({message: RESERVATION_DATE_INVALID_MESSAGE, validation_errors: createValidationError('date', RESERVATION_DATE_INVALID_MESSAGE)});
        }
        const now = nowKst();
        const is_now = dto.is_now === 1;
        if (is_now && dto.room_plan_type_id !== RESERVATION_PLAN_TYPE.HOURLY) {
            throw new BadRequestException({
                message: '지금 바로 이용은 시간 이용만 예약할 수 있습니다.',
                validation_errors: createValidationError('is_now', '지금 바로 이용은 시간 이용만 예약할 수 있습니다.'),
            });
        }
        if (is_now && dto.date !== now.format(RESERVATION_DATE_FORMAT)) {
            throw new BadRequestException({
                message: '지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.',
                validation_errors: createValidationError('date', '지금 바로 이용은 오늘 날짜로만 예약할 수 있습니다.'),
            });
        }
        const nights = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? (dto.nights as number) : null;
        const start_time = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY && !is_now ? (dto.start_time as string) : null;

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
        const recent = await this.reservationRepository.countRecentExpired(user_id, room.room_id, now.subtract(RESERVATION_REBOOK_BLOCK_MINUTES, 'minute').toDate());
        if (recent > 0) {
            throw new BadRequestException({message: '결제하지 않아 만료된 호실은 10분 뒤에 다시 예약할 수 있습니다.'});
        }

        // 5. 이용 구간 · 재고 판정 — 지금 바로는 지금(분)부터
        const stay = is_now ? toNowStay(plan, now) : toStay(plan, toKstDay(dto.date), start_time, nights);
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
        reservation.qr_link_sent_at = null;
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
     * - 확정한 예약이 이미 시작했으면(지금 바로 · 시작 뒤 결제) 바로 이용 중 — 호실 사용중 · QR 발급, Redis 현재 QR 은 마지막 단계(사용자 결정 2026-11-07)
     *
     * @param user_id 이용자 ID
     * @param dto 결제 ID · 결제 키
     * @returns 예약 ID · 상태(확정 또는 이용 중) — 환불 신청한 실패는 BadRequestException 을 돌려준다
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

        // 6. 이미 시작한 예약(지금 바로 · 시작 뒤 결제)은 확정 직후 이용 중 — 예약 · 호실(상태 조건) · QR 발급, Redis 현재 QR 은 외부 단계라 마지막(사용자 결정 2026-11-07)
        const started = judgeUsageTransition({...reservation, reservation_state_id: RESERVATION_STATE.CONFIRMED}, now) === 'START';
        if (started) {
            const inUse = new ReservationEntity();
            inUse.reservation_state_id = RESERVATION_STATE.CHECKED_IN;
            if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED}, inUse))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
            const inUseRoom = new RoomEntity();
            inUseRoom.room_state_id = USAGE_ROOM_STATE.IN_USE;
            await this.reservationRepository.updateReservationRoom({room_id: reservation.room_id, room_state_id: In([...USAGE_ROOM_STATE.START_FROM])}, inUseRoom);
            await this.reservationRepository.insertRoomQr(buildRoomQr(reservation));
            const roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
            if (!roomQr) {
                throw new InternalServerErrorException({message: RESERVATION_QR_ISSUE_FAILED_MESSAGE});
            }
            await this.doorStore.setQr(roomQr.room_id, roomQr.qr, roomQr.ends_at);
        }
        return {reservation_id: reservation.reservation_id, reservation_state_id: started ? RESERVATION_STATE.CHECKED_IN : RESERVATION_STATE.CONFIRMED};
    }

    /**
     * 이용자 취소 — 사유 필수. 확정 예약은 환불 마감 전 100% · 마감 뒤 ~ 이용 시작 전 예약 때 비율(원 단위 내림) 환불 신청, 시작 뒤에는 400.
     * 예약한 호실이 사용중지면 확정 · 이용 중 예약을 끝 전까지 언제든 100% 환불(사유 '사용중지 호실 취소' — 사용자 결정 2026-11-07), 이용 중이었으면 QR 을 끝낸다(Redis 는 마지막). 호실 상태는 그대로.
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
        const pending = reservation.reservation_state_id === RESERVATION_STATE.PENDING;
        if (!pending && reservation.reservation_state_id !== RESERVATION_STATE.CONFIRMED && reservation.reservation_state_id !== RESERVATION_STATE.CHECKED_IN) {
            throw new BadRequestException({message: RESERVATION_NOT_CANCELABLE_MESSAGE});
        }
        const now = nowKst();
        // 구간은 결제 대기 · 확정만 쓴다(이용 중 예약의 구간은 확정 그대로)
        const detail_state = pending ? RESERVATION_STATE.PENDING : RESERVATION_STATE.CONFIRMED;
        const details = await this.reservationRepository.findReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: detail_state});

        // 2. 확정 · 이용 중 — 결제마다 환불액(사용중지 호실이면 끝 전까지 100%, 아니면 시작 뒤 400)
        const refunds: {payment_id: string; amount: number}[] = [];
        let is_room_disabled = false;
        if (!pending) {
            const room = await this.reservationRepository.findReservationRoom({room_id: reservation.room_id});
            is_room_disabled = room?.room_state_id === RESERVATION_ROOM_STATE.DISABLED;
            for (const detail of details) {
                const payment = await this.reservationRepository.findPayment({payment_id: detail.payment_id});
                const amount = payment ? calculateCancelRefund(reservation, is_room_disabled, payment.amount, now) : null;
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
        await this.reservationRepository.updateReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: detail_state}, canceledDetail);

        // 4. 결제 대기 — 결제 만료(환불 없음)
        if (pending) {
            for (const detail of details) {
                const expired = new PaymentEntity();
                expired.payment_state_id = PAYMENT_STATE.EXPIRED;
                await this.reservationRepository.updatePayment({payment_id: detail.payment_id, payment_state_id: PAYMENT_STATE.READY}, expired);
            }
            return {refund_amount: null};
        }

        // 5. 확정 · 이용 중 — 환불액 > 0 이면 환불 신청(백그라운드 crontab 이 토스로), 0 이면 결제는 그대로(환불 없이 취소)
        for (const refund of refunds.filter((item) => item.amount > 0)) {
            const requested = new PaymentEntity();
            requested.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
            requested.refund_amount = refund.amount;
            requested.refund_reason = is_room_disabled ? RESERVATION_REFUND_REASON.DISABLED_ROOM : RESERVATION_REFUND_REASON.USER;
            requested.refund_requested_at = now.toDate();
            if (!(await this.reservationRepository.updatePayment({payment_id: refund.payment_id, payment_state_id: PAYMENT_STATE.DONE}, requested))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
        }

        // 6. QR 이 지금 유효하면(이용 중이던 사용중지 호실) 끝낸다 — DB 유효 종료 = 지금(이력은 남는다), Redis 현재 QR 지우기는 외부 단계라 마지막
        const roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
        if (roomQr && isRoomQrActive(roomQr, now.toDate())) {
            const endedQr = new RoomQrEntity();
            endedQr.ends_at = now.toDate();
            await this.reservationRepository.updateRoomQr({room_qr_id: roomQr.room_qr_id}, endedQr);
            await this.doorStore.revokeQr(roomQr.room_id, roomQr.qr);
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
     * 내 예약 QR (이용자) — 이용 중 예약에만, 정확히 시작 시각부터(사용자 결정 2026-11-07). 시작했는데 아직 확정이면(scheduler 가 돌기 전) 그 자리에서 이용 중 · 호실 사용중으로 바꾼다.
     * QR 이 아직 없으면 그 자리에서 발급한다(유효 = 이용 시작 ~ 이용 끝). scheduler 와 겹치면 먼저 들어간 행을 쓴다(ON CONFLICT DO NOTHING 뒤 다시 읽기).
     * 내주는 QR 은 Redis 현재 QR 로도 쓴다(문 소켓 QR 확인이 그 QR 로 맞는다).
     * (내부 HTTP: GET /internal/v1/user-service/reservation/:reservation_id/qr)
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @returns QR · 유효 시작 · 끝
     * @throws NotFoundException 내 예약이 아닐 때
     * @throws BadRequestException QR 을 볼 수 없는 상태 · 업체가 끝낸 QR · 이용 시간 밖
     */
    @Transactional()
    async getMyReservationQr(user_id: string, reservation_id: string): Promise<ReservationQrResultDto> {
        // 1. 내 예약 · 그 예약의 QR
        const reservation = await this.reservationRepository.findReservation({reservation_id, user_id});
        if (!reservation) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        let roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});

        // 2. 판정 — 이용 중에만 · 시작 시각부터 · QR 유효
        const verdict = judgeReservationQr(reservation, roomQr, nowKst().toDate());
        if (verdict === 'NO_QR') {
            throw new BadRequestException({message: 'QR 을 볼 수 없는 예약입니다.'});
        }
        if (verdict === 'OUT_OF_TIME') {
            throw new BadRequestException({message: 'QR 은 이용 시간에만 볼 수 있습니다.'});
        }

        // 3. 시작했는데 아직 확정 — 그 자리에서 이용 시작: 예약(상태 조건 — 겹치면 400) · 호실(예약가능 · 예약완료 · 정비중만 사용중)
        if (verdict === 'START') {
            const inUse = new ReservationEntity();
            inUse.reservation_state_id = RESERVATION_STATE.CHECKED_IN;
            if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED}, inUse))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
            const inUseRoom = new RoomEntity();
            inUseRoom.room_state_id = USAGE_ROOM_STATE.IN_USE;
            await this.reservationRepository.updateReservationRoom({room_id: reservation.room_id, room_state_id: In([...USAGE_ROOM_STATE.START_FROM])}, inUseRoom);
        }

        // 4. 없으면 발급 — 유효 = 이용 시작 ~ 이용 끝, QR 은 32자 무작위. 같은 예약에 이미 들어갔으면 DB 가 무시하고, 다시 읽은 행을 쓴다
        if (verdict === 'ISSUE' || verdict === 'START') {
            await this.reservationRepository.insertRoomQr(buildRoomQr(reservation));
            roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
        }
        if (!roomQr) {
            throw new InternalServerErrorException({message: RESERVATION_QR_ISSUE_FAILED_MESSAGE});
        }

        // 5. Redis 현재 QR 로 — 문 소켓 QR 확인이 이 QR 로 맞는다(유효 종료에 저절로 사라진다)
        await this.doorStore.setQr(roomQr.room_id, roomQr.qr, roomQr.ends_at);
        return toReservationQr(roomQr);
    }

    /**
     * 내 예약의 이용 중 취소 요청 (이용자) — 그 예약의 마지막 요청 1건(SMS 링크 화면), 보이는 상태는 만료를 계산한다. 승인하면 받는 금액은 결제가 끝난 금액 전액.
     * (내부 HTTP: GET /internal/v1/user-service/reservation/:reservation_id/cancel-request)
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @returns 요청
     * @throws NotFoundException 내 예약이 아니거나 요청이 없을 때
     */
    async getMyCancelRequest(user_id: string, reservation_id: string): Promise<ReservationCancelRequestResultDto> {
        const row = await this.reservationRepository.findMyReservationRow(user_id, reservation_id);
        if (!row) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        const request = await this.reservationRepository.findLatestCancelRequest({reservation_id: row.reservation_id});
        if (!request) {
            throw new NotFoundException({message: RESERVATION_CANCEL_REQUEST_NOT_FOUND_MESSAGE});
        }
        const segments = await this.reservationRepository.findReservationSegmentRows(row.reservation_id);
        return toCancelRequest(request, row, segments, nowKst().toDate());
    }

    /**
     * 이용 중 취소 요청 승인 (이용자) — 업체 취소와 같은 결과(사용자 결정 2026-11-07): 예약 · 구간 취소(주체 업체 · 사유 = 요청 사유) · 결제마다 전액 환불 신청 · QR 끝 · 호실 사용중 → 정비중 · 요청 승인.
     * 마지막 요청이 요청 중이고 만료 전일 때만, 예약이 아직 확정 · 이용 중이고 끝 전일 때만. Redis 현재 QR 지우기는 외부 단계라 마지막. (RabbitMQ: user.reservation.cancel-request-approve)
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @returns 환불 금액(전액)
     */
    @Transactional()
    async approveCancelRequest(user_id: string, reservation_id: string): Promise<ReservationCancelRequestApproveResultDto> {
        // 1. 내 예약 · 마지막 요청 — 요청 중 · 만료 전만
        const reservation = await this.reservationRepository.findReservation({reservation_id, user_id});
        if (!reservation || reservation.reservation_state_id === RESERVATION_STATE.EXPIRED) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        const request = await this.reservationRepository.findLatestCancelRequest({reservation_id: reservation.reservation_id});
        if (!request) {
            throw new NotFoundException({message: RESERVATION_CANCEL_REQUEST_NOT_FOUND_MESSAGE});
        }
        const now = nowKst().toDate();
        if (!cancelRequestState(request, now).respondable) {
            throw new BadRequestException({message: RESERVATION_CANCEL_REQUEST_NOT_RESPONDABLE_MESSAGE});
        }

        // 2. 예약이 아직 이용 중인지 — 확정 · 이용 중 + 끝 전(끝났거나 취소됐으면 400)
        const state = reservation.reservation_state_id;
        if ((state !== RESERVATION_STATE.CONFIRMED && state !== RESERVATION_STATE.CHECKED_IN) || judgeUsageTransition(reservation, now) === 'END') {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }

        // 3. 예약 · 구간 취소(상태 조건) — 주체 업체 · 사유 = 요청 사유
        const details = await this.reservationRepository.findReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED});
        const canceled = new ReservationEntity();
        canceled.reservation_state_id = RESERVATION_STATE.CANCELED;
        canceled.canceled_at = now;
        canceled.cancel_actor = RESERVATION_CANCEL_ACTOR.STORE;
        canceled.cancel_reason = request.cancel_reason;
        if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: state}, canceled))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        const canceledDetail = new ReservationDetailEntity();
        canceledDetail.reservation_state_id = RESERVATION_STATE.CANCELED;
        await this.reservationRepository.updateReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED}, canceledDetail);

        // 4. 결제마다 전액 환불 신청(업체 취소 사유) — 백그라운드 crontab 이 토스로
        for (const detail of details) {
            const requested = new PaymentEntity();
            requested.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
            requested.refund_amount = detail.price;
            requested.refund_reason = RESERVATION_REFUND_REASON.STORE;
            requested.refund_requested_at = now;
            if (!(await this.reservationRepository.updatePayment({payment_id: detail.payment_id, payment_state_id: PAYMENT_STATE.DONE}, requested))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
        }

        // 5. QR 끝 — DB 유효 종료 = 지금(이력은 남는다)
        const roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
        const activeQr = roomQr && isRoomQrActive(roomQr, now) ? roomQr : null;
        if (activeQr) {
            const endedQr = new RoomQrEntity();
            endedQr.ends_at = now;
            await this.reservationRepository.updateRoomQr({room_qr_id: activeQr.room_qr_id}, endedQr);
        }

        // 6. 호실 — 사용중이면 정비중(이용 종료와 같다), 그 밖은 그대로
        const room = await this.reservationRepository.findReservationRoom({room_id: reservation.room_id});
        const next_room_state_id = room ? toEndedUsageRoomState(room.room_state_id) : null;
        if (room && next_room_state_id) {
            const nextRoom = new RoomEntity();
            nextRoom.room_state_id = next_room_state_id;
            await this.reservationRepository.updateReservationRoom({room_id: room.room_id, room_state_id: room.room_state_id}, nextRoom);
        }

        // 7. 요청 → 승인(상태 조건 — 그 사이 새 요청 · 다른 응답이면 400 롤백)
        const approved = new ReservationCancelRequestEntity();
        approved.reservation_cancel_request_state_id = RESERVATION_CANCEL_REQUEST_STATE.APPROVED;
        approved.responded_at = now;
        if (
            !(await this.reservationRepository.updateCancelRequest(
                {reservation_cancel_request_id: request.reservation_cancel_request_id, reservation_cancel_request_state_id: RESERVATION_CANCEL_REQUEST_STATE.REQUESTED},
                approved,
            ))
        ) {
            throw new BadRequestException({message: RESERVATION_CANCEL_REQUEST_NOT_RESPONDABLE_MESSAGE});
        }

        // 8. Redis 현재 QR 지우기 — 외부 단계라 마지막
        if (activeQr) {
            await this.doorStore.revokeQr(activeQr.room_id, activeQr.qr);
        }
        return {refund_amount: details.reduce((sum, detail) => sum + detail.price, 0)};
    }

    /**
     * 이용 중 취소 요청 거절 (이용자) — 요청만 끝나고 예약은 그대로. 마지막 요청이 요청 중이고 만료 전일 때만. (RabbitMQ: user.reservation.cancel-request-reject)
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     */
    @Transactional()
    async rejectCancelRequest(user_id: string, reservation_id: string): Promise<void> {
        // 1. 내 예약 · 마지막 요청 — 요청 중 · 만료 전만
        const reservation = await this.reservationRepository.findReservation({reservation_id, user_id});
        if (!reservation || reservation.reservation_state_id === RESERVATION_STATE.EXPIRED) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        const request = await this.reservationRepository.findLatestCancelRequest({reservation_id: reservation.reservation_id});
        if (!request) {
            throw new NotFoundException({message: RESERVATION_CANCEL_REQUEST_NOT_FOUND_MESSAGE});
        }
        const now = nowKst().toDate();
        if (!cancelRequestState(request, now).respondable) {
            throw new BadRequestException({message: RESERVATION_CANCEL_REQUEST_NOT_RESPONDABLE_MESSAGE});
        }

        // 2. 요청 → 거절(상태 조건)
        const rejected = new ReservationCancelRequestEntity();
        rejected.reservation_cancel_request_state_id = RESERVATION_CANCEL_REQUEST_STATE.REJECTED;
        rejected.responded_at = now;
        if (
            !(await this.reservationRepository.updateCancelRequest(
                {reservation_cancel_request_id: request.reservation_cancel_request_id, reservation_cancel_request_state_id: RESERVATION_CANCEL_REQUEST_STATE.REQUESTED},
                rejected,
            ))
        ) {
            throw new BadRequestException({message: RESERVATION_CANCEL_REQUEST_NOT_RESPONDABLE_MESSAGE});
        }
    }
}
