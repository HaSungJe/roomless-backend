import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {ReservationRoomChangeDto, ReservationRoomChangeParamDto} from '@app/contracts/reservation/dto/reservation-room-change.dto.js';
import type {ReservationStoreCancelDto, ReservationStoreCancelParamDto} from '@app/contracts/reservation/dto/reservation-store-cancel.dto.js';
import {RESERVATION_MANAGER_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {ReservationService} from '../reservation.service.js';

/**
 * reservation 큐 경로 컨트롤러 (매니저 예약, RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.reservation.*` 명령을 `@OnCommand` 로 받아 service 로 넘긴다(위임만).
 * 입력 검증은 게이트웨이 ValidationPipe 에서 끝났다(다시 검증하지 않는다). 모두 로그인 매니저 명령이라 actor 가 필요하다.
 */
@Injectable()
export class ReservationQueueController {
    /**
     * @param reservationService reservation 비즈니스 로직
     */
    constructor(private readonly reservationService: ReservationService) {}

    /**
     * 업체 취소 — 매니저
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(RESERVATION_MANAGER_COMMAND.STORE_CANCEL)
    async cancelStoreReservation(command: MessageEnvelope<ReservationStoreCancelParamDto & ReservationStoreCancelDto>): Promise<void> {
        return this.reservationService.cancelStoreReservation(requireActor(command).user_id, command.payload.reservation_id, command.payload);
    }

    /**
     * 호실 이동 — 매니저
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(RESERVATION_MANAGER_COMMAND.ROOM_CHANGE)
    async changeReservationRoom(command: MessageEnvelope<ReservationRoomChangeParamDto & ReservationRoomChangeDto>): Promise<void> {
        return this.reservationService.changeReservationRoom(requireActor(command).user_id, command.payload.reservation_id, command.payload);
    }
}
