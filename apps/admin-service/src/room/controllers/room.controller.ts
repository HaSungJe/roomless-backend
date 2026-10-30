import {Body, Controller, Get, HttpCode, Param, Post, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {RoomGroupDetailParamDto, RoomGroupDetailResultDto} from '@app/contracts/room/dto/room-group-detail.dto.js';
import {RoomGroupImageUploadUrlDto, RoomGroupImageUploadUrlParamDto, RoomGroupImageUploadUrlResultDto} from '@app/contracts/room/dto/room-group-image-upload-url.dto.js';
import {RoomGroupListDto, RoomGroupListResultDto} from '@app/contracts/room/dto/room-group-list.dto.js';
import {RoomGroupPlanPriceListDto, RoomGroupPlanPriceListParamDto, RoomGroupPlanPriceListResultDto} from '@app/contracts/room/dto/room-group-plan-price-list.dto.js';
import {RoomListDto, RoomListResultDto} from '@app/contracts/room/dto/room-list.dto.js';
import {RoomPlanListResultDto} from '@app/contracts/room/dto/room-plan-list.dto.js';
import {RoomService} from '../room.service.js';

/**
 * room 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로(조회 · 업로드 주소)만 받는다(외부 비공개, Swagger 없음). 로그인 매니저는 게이트웨이가 넘긴 actor 헤더에서 꺼낸다.
 * 정적 경로(`/plan` · `/group…`)를 먼저, 호실 목록 `/` 를 마지막에 선언한다.
 */
@Controller('/internal/v1/admin-service/room')
export class RoomController {
    /**
     * @param roomService room service
     */
    constructor(private readonly roomService: RoomService) {}

    /**
     * 업체 상품 설정 목록 (업체 관리자)
     */
    @Get('/plan')
    @HttpCode(200)
    async getMyRoomPlans(@InternalActor('user_id') user_id: string): Promise<RoomPlanListResultDto> {
        return this.roomService.getMyRoomPlans(user_id);
    }

    /**
     * 객실 그룹 목록 (업체 관리자)
     */
    @Get('/group')
    @HttpCode(200)
    async getMyRoomGroups(@InternalActor('user_id') user_id: string, @Query() query: RoomGroupListDto): Promise<RoomGroupListResultDto> {
        const dto = new RoomGroupListDto(query);
        return this.roomService.getMyRoomGroups(user_id, dto);
    }

    /**
     * 객실 그룹 상세 (업체 관리자)
     */
    @Get('/group/:room_group_id')
    @HttpCode(200)
    async getMyRoomGroup(@InternalActor('user_id') user_id: string, @Param() param: RoomGroupDetailParamDto): Promise<RoomGroupDetailResultDto> {
        return this.roomService.getMyRoomGroup(user_id, param.room_group_id);
    }

    /**
     * 객실 그룹 사진 업로드 주소 (업체 관리자)
     */
    @Post('/group/:room_group_id/image/upload-url')
    @HttpCode(200)
    async createMyRoomGroupImageUploadUrl(
        @InternalActor('user_id') user_id: string,
        @Param() param: RoomGroupImageUploadUrlParamDto,
        @Body() dto: RoomGroupImageUploadUrlDto,
    ): Promise<RoomGroupImageUploadUrlResultDto> {
        return this.roomService.createMyRoomGroupImageUploadUrl(user_id, param.room_group_id, dto);
    }

    /**
     * 상품별 기간 가격 목록 (업체 관리자)
     */
    @Get('/group/:room_group_id/plan/:room_plan_type_id/price')
    @HttpCode(200)
    async getMyRoomGroupPlanPrices(
        @InternalActor('user_id') user_id: string,
        @Param() param: RoomGroupPlanPriceListParamDto,
        @Query() query: RoomGroupPlanPriceListDto,
    ): Promise<RoomGroupPlanPriceListResultDto> {
        const dto = new RoomGroupPlanPriceListDto(query);
        return this.roomService.getMyRoomGroupPlanPrices(user_id, param.room_group_id, param.room_plan_type_id, dto);
    }

    /**
     * 호실 목록 (업체 관리자)
     */
    @Get('/')
    @HttpCode(200)
    async getMyRooms(@InternalActor('user_id') user_id: string, @Query() query: RoomListDto): Promise<RoomListResultDto> {
        const dto = new RoomListDto(query);
        return this.roomService.getMyRooms(user_id, dto);
    }
}
