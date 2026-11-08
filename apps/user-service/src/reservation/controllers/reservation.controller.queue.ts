import type {BadRequestException} from '@nestjs/common';
import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {ReservationCancelRequestApproveParamDto, ReservationCancelRequestApproveResultDto} from '@app/contracts/reservation/dto/reservation-cancel-request-approve.dto.js';
import type {ReservationCancelRequestRejectParamDto} from '@app/contracts/reservation/dto/reservation-cancel-request-reject.dto.js';
import type {ReservationCancelDto, ReservationCancelParamDto, ReservationCancelResultDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import type {ReservationExtendParamDto, ReservationExtendResultDto} from '@app/contracts/reservation/dto/reservation-extend.dto.js';
import type {ReservationPaymentConfirmDto, ReservationPaymentConfirmResultDto} from '@app/contracts/reservation/dto/reservation-payment-confirm.dto.js';
import type {ReservationDto, ReservationResultDto} from '@app/contracts/reservation/dto/reservation.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {ReservationService} from '../reservation.service.js';

/**
 * 예약 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `user.reservation.*` 명령을 `@OnCommand` 로 받아 service 로 위임만 한다.
 * HTTP 컨트롤러가 아니라 provider 다(도메인 모듈 providers). 입력 검증은 게이트웨이 ValidationPipe 에서 끝났다.
 */
@Injectable()
export class ReservationQueueController {
    /**
     * @param reservationService 예약 service
     */
    constructor(private readonly reservationService: ReservationService) {}

    /**
     * 예약 생성 — 이용자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(RESERVATION_COMMAND.CREATE)
    async createReservation(command: MessageEnvelope<ReservationDto>): Promise<ReservationResultDto> {
        return this.reservationService.createReservation(requireActor(command).user_id, command.payload);
    }

    /**
     * 결제 확인 — 이용자 (환불 신청한 실패는 반환된 예외 → failed, 재시도 없음)
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(RESERVATION_COMMAND.PAYMENT_CONFIRM)
    async confirmPayment(command: MessageEnvelope<ReservationPaymentConfirmDto>): Promise<ReservationPaymentConfirmResultDto | BadRequestException> {
        return this.reservationService.confirmPayment(requireActor(command).user_id, command.payload);
    }

    /**
     * 이용자 취소
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(RESERVATION_COMMAND.CANCEL)
    async cancelReservation(command: MessageEnvelope<ReservationCancelParamDto & ReservationCancelDto>): Promise<ReservationCancelResultDto> {
        return this.reservationService.cancelReservation(requireActor(command).user_id, command.payload.reservation_id, command.payload);
    }

    /**
     * 이용 중 취소 요청 승인 — 이용자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(RESERVATION_COMMAND.CANCEL_REQUEST_APPROVE)
    async approveCancelRequest(command: MessageEnvelope<ReservationCancelRequestApproveParamDto>): Promise<ReservationCancelRequestApproveResultDto> {
        return this.reservationService.approveCancelRequest(requireActor(command).user_id, command.payload.reservation_id);
    }

    /**
     * 이용 중 취소 요청 거절 — 이용자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(RESERVATION_COMMAND.CANCEL_REQUEST_REJECT)
    async rejectCancelRequest(command: MessageEnvelope<ReservationCancelRequestRejectParamDto>): Promise<void> {
        return this.reservationService.rejectCancelRequest(requireActor(command).user_id, command.payload.reservation_id);
    }

    /**
     * 연장 신청 — 이용자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(RESERVATION_COMMAND.EXTEND)
    async requestExtension(command: MessageEnvelope<ReservationExtendParamDto>): Promise<ReservationExtendResultDto> {
        return this.reservationService.requestExtension(requireActor(command).user_id, command.payload.reservation_id);
    }
}
