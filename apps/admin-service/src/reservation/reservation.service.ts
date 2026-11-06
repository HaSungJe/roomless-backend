import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {createValidationError} from '@app/common/utils/validation.js';
import type {ReservationRoomChangeDto} from '@app/contracts/reservation/dto/reservation-room-change.dto.js';
import type {ReservationStoreCancelDto} from '@app/contracts/reservation/dto/reservation-store-cancel.dto.js';
import type {ReservationStoreDto, ReservationStoreResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {PAYMENT_STATE, RESERVATION_CANCEL_ACTOR, RESERVATION_REFUND_REASON, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {DOOR_STORE, SMS_SENDER} from '@app/integration/integration.symbols.js';
import type {DoorStoreInterface, SmsSenderInterface} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from './interfaces/reservation.repository.interface.js';
import {
    RESERVATION_DATE_INVALID_MESSAGE,
    RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE,
    RESERVATION_NOT_CANCELABLE_MESSAGE,
    RESERVATION_NOT_FOUND_MESSAGE,
    RESERVATION_ROOM_NOT_FOUND_MESSAGE,
    RESERVATION_ROOM_STATE_DISABLED,
    RESERVATION_STATE_CHANGED_MESSAGE,
} from './reservation.constants.js';
import {RESERVATION_REPOSITORY} from './reservation.symbols.js';
import {buildRoomChangeSms, buildStoreCancelSms, isRoomQrActive, isValidDate, nowKst, toKstDay, toStoreReservationRooms} from './reservation.util.js';

/**
 * reservation 비즈니스 로직 (매니저 예약) — 내 업체 예약 현황 · 업체 취소 · 호실 이동. 매니저는 소속 업체(탈퇴 · 지운 업체 제외)의 예약만 다룬다.
 * 이용자 예약(예약 가능 시간 · 예약 · 결제 · 취소 · 내 예약 · QR)은 user-service reservation 이다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
@Injectable()
export class ReservationService {
    /**
     * @param reservationRepository reservation repository 포트
     * @param smsSender SMS 발송 포트(업체 취소 · 호실 이동 안내)
     * @param doorStore 문 정보 포트(Redis — 이용 중 업체 취소 때 현재 QR 지우기)
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(SMS_SENDER) private readonly smsSender: SmsSenderInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * 내 업체 예약 현황 (매니저) — 날짜(한국 날짜) 하루와 겹치는 결제 대기 · 확정 · 이용 중 · 이용 완료 예약을 호실별로(이용자 이름 · 휴대폰 포함). (내부 HTTP: GET /internal/v1/admin-service/reservation/store)
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

        // 2. 매니저의 소속 업체 (탈퇴 · 지운 업체 제외 — 옆 도메인과 같은 방식)
        const managerStore = await this.reservationRepository.findManagerStore(user_id, false);
        if (!managerStore) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 3. 호실 · 그날 예약
        const day = toKstDay(dto.date);
        const rooms = await this.reservationRepository.findStoreRoomRows(managerStore.store_id);
        const rows = await this.reservationRepository.findStoreReservationRows(managerStore.store_id, day.toDate(), day.add(1, 'day').toDate());
        return {date: dto.date, list: toStoreReservationRooms(rooms, rows)};
    }

    /**
     * 업체 취소 (매니저) — 내 업체의 결제 대기 · 확정 예약. 확정은 100% 환불 신청, 결제 대기는 결제 만료. 이용 중이면 그 QR 도 끝낸다(DB 유효 종료 = 지금 · Redis 현재 QR 지우기).
     * 이용자에게 SMS(번호가 있을 때 — 마지막 단계). (RabbitMQ: admin.reservation.store-cancel)
     *
     * @param user_id 로그인 매니저 ID
     * @param reservation_id 예약 ID
     * @param dto 취소 사유
     */
    @Transactional()
    async cancelStoreReservation(user_id: string, reservation_id: string, dto: ReservationStoreCancelDto): Promise<void> {
        // 1. 매니저의 소속 업체(탈퇴 · 지운 업체 제외) · 그 업체 예약
        const managerStore = await this.reservationRepository.findManagerStore(user_id, false);
        if (!managerStore) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const reservation = await this.reservationRepository.findReservation({reservation_id, store_id: managerStore.store_id});
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

        // 3. 이용 중이면 QR 을 끝낸다 — DB 유효 종료 = 지금(이력은 남는다) · Redis 현재 QR 에서 지운다. 시작 전 예약은 QR 이 없다
        const roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
        if (roomQr && isRoomQrActive(roomQr, now)) {
            const endedQr = new RoomQrEntity();
            endedQr.ends_at = now;
            await this.reservationRepository.updateRoomQr({room_qr_id: roomQr.room_qr_id}, endedQr);
            await this.doorStore.revokeQr(roomQr.room_id, roomQr.qr);
        }

        // 4. 결제 — 확정은 전액 환불 신청, 결제 대기는 만료
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

        // 5. 이용자 SMS — 번호가 있을 때만(마지막 단계)
        const user = await this.reservationRepository.findReservationUser({user_id: reservation.user_id});
        const store = await this.reservationRepository.findReservationStore({store_id: reservation.store_id});
        if (user?.phone && store) {
            await this.smsSender.send({to: user.phone, text: buildStoreCancelSms(store.store_name, reservation.start_at, dto.cancel_reason)});
        }
    }

    /**
     * 호실 이동 (매니저) — 내 업체의 이용 시작 전 확정 예약을 같은 객실 그룹 · 사용중지 아닌 다른 호실로. 겹침은 배타 제약이 400, 금액 · 시간은 그대로. 이용자에게 SMS. (RabbitMQ: admin.reservation.room-change)
     *
     * @param user_id 로그인 매니저 ID
     * @param reservation_id 예약 ID
     * @param dto 옮길 호실 ID
     */
    @Transactional()
    async changeReservationRoom(user_id: string, reservation_id: string, dto: ReservationRoomChangeDto): Promise<void> {
        // 1. 매니저의 소속 업체(탈퇴 · 지운 업체 제외) · 그 업체 예약
        const managerStore = await this.reservationRepository.findManagerStore(user_id, false);
        if (!managerStore) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const reservation = await this.reservationRepository.findReservation({reservation_id, store_id: managerStore.store_id});
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
        const to = await this.reservationRepository.findReservationRoom({room_id: dto.room_id, store_id: managerStore.store_id});
        if (!from || !to) {
            throw new NotFoundException({message: RESERVATION_ROOM_NOT_FOUND_MESSAGE});
        }
        if (to.room_group_id !== from.room_group_id) {
            throw new BadRequestException({message: '같은 객실 그룹의 호실로만 옮길 수 있습니다.', validation_errors: createValidationError('room_id', '같은 객실 그룹의 호실로만 옮길 수 있습니다.')});
        }
        if (to.room_state_id === RESERVATION_ROOM_STATE_DISABLED) {
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
