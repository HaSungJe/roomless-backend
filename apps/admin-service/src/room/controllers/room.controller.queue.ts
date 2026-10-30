import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {RoomDeleteParamDto} from '@app/contracts/room/dto/room-delete.dto.js';
import type {RoomGroupDeleteParamDto} from '@app/contracts/room/dto/room-group-delete.dto.js';
import type {RoomGroupImageDeleteParamDto} from '@app/contracts/room/dto/room-group-image-delete.dto.js';
import type {RoomGroupImageOrderDto, RoomGroupImageOrderParamDto} from '@app/contracts/room/dto/room-group-image-order.dto.js';
import type {RoomGroupImageDto, RoomGroupImageParamDto, RoomGroupImageResultDto} from '@app/contracts/room/dto/room-group-image.dto.js';
import type {RoomGroupPlanPriceDeleteParamDto} from '@app/contracts/room/dto/room-group-plan-price-delete.dto.js';
import type {RoomGroupPlanPriceUpdateDto, RoomGroupPlanPriceUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-price-update.dto.js';
import type {RoomGroupPlanPriceDto, RoomGroupPlanPriceParamDto, RoomGroupPlanPriceResultDto} from '@app/contracts/room/dto/room-group-plan-price.dto.js';
import type {RoomGroupPlanUpdateDto, RoomGroupPlanUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-update.dto.js';
import type {RoomGroupUpdateDto, RoomGroupUpdateParamDto} from '@app/contracts/room/dto/room-group-update.dto.js';
import type {RoomGroupDto, RoomGroupResultDto} from '@app/contracts/room/dto/room-group.dto.js';
import type {RoomPlanUpdateDto, RoomPlanUpdateParamDto} from '@app/contracts/room/dto/room-plan-update.dto.js';
import type {RoomStateDto, RoomStateParamDto} from '@app/contracts/room/dto/room-state.dto.js';
import type {RoomUpdateDto, RoomUpdateParamDto} from '@app/contracts/room/dto/room-update.dto.js';
import type {RoomDto, RoomResultDto} from '@app/contracts/room/dto/room.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {RoomService} from '../room.service.js';

/**
 * room 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.room.*` 명령을 `@OnCommand` 로 받는다.
 * 봉투에서 입력을 꺼내 service 로 위임만 한다(로직 0). path param 은 게이트웨이가 payload 에 합쳐 보낸다(`{...param, ...dto}`).
 * 모두 업체 관리자 명령이라 actor 의 user_id 가 필요해 requireActor 로 꺼낸다.
 */
@Injectable()
export class RoomQueueController {
    /**
     * @param roomService room service
     */
    constructor(private readonly roomService: RoomService) {}

    /**
     * 업체 상품 설정 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.PLAN_UPDATE)
    async updateMyRoomPlan(command: MessageEnvelope<RoomPlanUpdateParamDto & RoomPlanUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoomPlan(requireActor(command).user_id, command.payload.room_plan_type_id, command.payload);
    }

    /**
     * 객실 그룹 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 객실 그룹 ID
     */
    @OnCommand(ROOM_COMMAND.GROUP_CREATE)
    async createMyRoomGroup(command: MessageEnvelope<RoomGroupDto>): Promise<RoomGroupResultDto> {
        return this.roomService.createMyRoomGroup(requireActor(command).user_id, command.payload);
    }

    /**
     * 객실 그룹 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.GROUP_UPDATE)
    async updateMyRoomGroup(command: MessageEnvelope<RoomGroupUpdateParamDto & RoomGroupUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoomGroup(requireActor(command).user_id, command.payload.room_group_id, command.payload);
    }

    /**
     * 객실 그룹 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(ROOM_COMMAND.GROUP_DELETE)
    async deleteMyRoomGroup(command: MessageEnvelope<RoomGroupDeleteParamDto>): Promise<void> {
        return this.roomService.deleteMyRoomGroup(requireActor(command).user_id, command.payload.room_group_id);
    }

    /**
     * 객실 그룹 사진 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     * @returns 객실 그룹 사진 ID
     */
    @OnCommand(ROOM_COMMAND.GROUP_IMAGE)
    async addMyRoomGroupImage(command: MessageEnvelope<RoomGroupImageParamDto & RoomGroupImageDto>): Promise<RoomGroupImageResultDto> {
        return this.roomService.addMyRoomGroupImage(requireActor(command).user_id, command.payload.room_group_id, command.payload);
    }

    /**
     * 객실 그룹 사진 순서 변경 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.GROUP_IMAGE_ORDER)
    async reorderMyRoomGroupImages(command: MessageEnvelope<RoomGroupImageOrderParamDto & RoomGroupImageOrderDto>): Promise<void> {
        return this.roomService.reorderMyRoomGroupImages(requireActor(command).user_id, command.payload.room_group_id, command.payload);
    }

    /**
     * 객실 그룹 사진 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(ROOM_COMMAND.GROUP_IMAGE_DELETE)
    async deleteMyRoomGroupImage(command: MessageEnvelope<RoomGroupImageDeleteParamDto>): Promise<void> {
        return this.roomService.deleteMyRoomGroupImage(requireActor(command).user_id, command.payload.room_group_id, command.payload.room_group_image_id);
    }

    /**
     * 그룹 상품 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.GROUP_PLAN_UPDATE)
    async updateMyRoomGroupPlan(command: MessageEnvelope<RoomGroupPlanUpdateParamDto & RoomGroupPlanUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoomGroupPlan(requireActor(command).user_id, command.payload.room_group_id, command.payload.room_plan_type_id, command.payload);
    }

    /**
     * 상품별 기간 가격 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     * @returns 기간 가격 ID
     */
    @OnCommand(ROOM_COMMAND.GROUP_PLAN_PRICE)
    async addMyRoomGroupPlanPrice(command: MessageEnvelope<RoomGroupPlanPriceParamDto & RoomGroupPlanPriceDto>): Promise<RoomGroupPlanPriceResultDto> {
        return this.roomService.addMyRoomGroupPlanPrice(requireActor(command).user_id, command.payload.room_group_id, command.payload.room_plan_type_id, command.payload);
    }

    /**
     * 상품별 기간 가격 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE)
    async updateMyRoomGroupPlanPrice(command: MessageEnvelope<RoomGroupPlanPriceUpdateParamDto & RoomGroupPlanPriceUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoomGroupPlanPrice(
            requireActor(command).user_id,
            command.payload.room_group_id,
            command.payload.room_plan_type_id,
            command.payload.room_group_plan_price_id,
            command.payload,
        );
    }

    /**
     * 상품별 기간 가격 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE)
    async deleteMyRoomGroupPlanPrice(command: MessageEnvelope<RoomGroupPlanPriceDeleteParamDto>): Promise<void> {
        return this.roomService.deleteMyRoomGroupPlanPrice(requireActor(command).user_id, command.payload.room_group_id, command.payload.room_plan_type_id, command.payload.room_group_plan_price_id);
    }

    /**
     * 호실 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 호실 ID
     */
    @OnCommand(ROOM_COMMAND.CREATE)
    async createMyRoom(command: MessageEnvelope<RoomDto>): Promise<RoomResultDto> {
        return this.roomService.createMyRoom(requireActor(command).user_id, command.payload);
    }

    /**
     * 호실 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.UPDATE)
    async updateMyRoom(command: MessageEnvelope<RoomUpdateParamDto & RoomUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoom(requireActor(command).user_id, command.payload.room_id, command.payload);
    }

    /**
     * 호실 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(ROOM_COMMAND.DELETE)
    async deleteMyRoom(command: MessageEnvelope<RoomDeleteParamDto>): Promise<void> {
        return this.roomService.deleteMyRoom(requireActor(command).user_id, command.payload.room_id);
    }

    /**
     * 호실 상태 변경 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.STATE)
    async changeMyRoomState(command: MessageEnvelope<RoomStateParamDto & RoomStateDto>): Promise<void> {
        return this.roomService.changeMyRoomState(requireActor(command).user_id, command.payload.room_id, command.payload);
    }
}
