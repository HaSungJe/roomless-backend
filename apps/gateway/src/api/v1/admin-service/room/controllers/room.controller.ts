import {Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {RoomGroupDetailParamDto, RoomGroupDetailResultDto} from '@app/contracts/room/dto/room-group-detail.dto.js';
import {RoomGroupImageUploadUrlDto, RoomGroupImageUploadUrlParamDto, RoomGroupImageUploadUrlResultDto} from '@app/contracts/room/dto/room-group-image-upload-url.dto.js';
import {RoomGroupListDto, RoomGroupListResultDto} from '@app/contracts/room/dto/room-group-list.dto.js';
import {RoomGroupPlanPriceListDto, RoomGroupPlanPriceListParamDto, RoomGroupPlanPriceListResultDto} from '@app/contracts/room/dto/room-group-plan-price-list.dto.js';
import {RoomListDto, RoomListResultDto} from '@app/contracts/room/dto/room-list.dto.js';
import {RoomPlanListResultDto} from '@app/contracts/room/dto/room-plan-list.dto.js';
import {ROOM_INTERNAL_PATH} from '@app/contracts/room/room.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 객실 관리 공개 API — 동기 경로(내부 HTTP → admin-service room 도메인). 조회 · 그룹 사진 업로드 주소.
 * 모두 매니저 가드(업체 총관리자 · 업체 관리자)이고 내 업체만 다룬다. 정적 경로(`/plan` · `/group…`)를 매개변수 경로보다 먼저 선언한다.
 * 큐 경로(업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 기간 가격 · 호실 쓰기 · 호실 상태)는 같은 경로 접두의 room.controller.queue.ts(RoomQueueController)에 둔다.
 */
@ApiTags('객실 관리')
@Controller('/api/v1/admin-service/room')
export class RoomController {
    /**
     * @param internalHttp 동기 경로 — admin-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 업체 상품 설정 목록 (업체 관리자) — 시간 이용 · 1박 · 연박 3개, 사용 여부 · 예약 가능 요일 · 이용 시간 · 입실 · 퇴실 시각
     */
    @Get('/plan')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 상품 설정 목록'})
    @ApiOkResponse({type: RoomPlanListResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRoomPlans(@PassportActor() actor: Actor): Promise<RoomPlanListResultDto> {
        return this.internalHttp.request<RoomPlanListResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.PLAN_LIST, {actor});
    }

    /**
     * 객실 그룹 목록 (업체 관리자) — 그룹명 검색, 호실 수 · 대표 사진, 등록일 최신순
     */
    @Get('/group')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 목록'})
    @ApiOkResponse({type: RoomGroupListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRoomGroups(@PassportActor() actor: Actor, @Query() query: RoomGroupListDto): Promise<RoomGroupListResultDto> {
        const dto = new RoomGroupListDto(query);
        return this.internalHttp.request<RoomGroupListResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.GROUP_LIST, {actor, query: dto});
    }

    /**
     * 객실 그룹 상세 (업체 관리자) — 그룹 정보 · 상세정보 · 사진 열람 주소 · 그룹 상품 3개, 남의 업체 그룹은 404
     */
    @Get('/group/:room_group_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 상세'})
    @ApiOkResponse({type: RoomGroupDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRoomGroup(@PassportActor() actor: Actor, @Param() param: RoomGroupDetailParamDto): Promise<RoomGroupDetailResultDto> {
        return this.internalHttp.request<RoomGroupDetailResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.group(param.room_group_id), {actor});
    }

    /**
     * 객실 그룹 사진 업로드 주소 (업체 관리자) — 그룹마다 5장까지, 받은 주소로 같은 Content-Type 헤더로 PUT 한 뒤 file_key 로 사진을 등록한다
     */
    @Post('/group/:room_group_id/image/upload-url')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 사진 업로드 주소'})
    @ApiBody({type: RoomGroupImageUploadUrlDto})
    @ApiOkResponse({type: RoomGroupImageUploadUrlResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyRoomGroupImageUploadUrl(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupImageUploadUrlParamDto,
        @Body() dto: RoomGroupImageUploadUrlDto,
    ): Promise<RoomGroupImageUploadUrlResultDto> {
        return this.internalHttp.request<RoomGroupImageUploadUrlResultDto>('admin', 'POST', ROOM_INTERNAL_PATH.groupImageUploadUrl(param.room_group_id), {actor, body: dto});
    }

    /**
     * 상품별 기간 가격 목록 (업체 관리자) — 그룹 × 상품 종류의 지워지지 않은 기간, 시작 날짜 순
     */
    @Get('/group/:room_group_id/plan/:room_plan_type_id/price')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '상품별 기간 가격 목록'})
    @ApiOkResponse({type: RoomGroupPlanPriceListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRoomGroupPlanPrices(@PassportActor() actor: Actor, @Param() param: RoomGroupPlanPriceListParamDto, @Query() query: RoomGroupPlanPriceListDto): Promise<RoomGroupPlanPriceListResultDto> {
        const dto = new RoomGroupPlanPriceListDto(query);
        return this.internalHttp.request<RoomGroupPlanPriceListResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.groupPlanPrices(param.room_group_id, param.room_plan_type_id), {actor, query: dto});
    }

    /**
     * 호실 목록 (업체 관리자) — 층 · 객실 그룹 필터, 그룹명 · 상태명 포함, 층 · 호실명 순
     */
    @Get('/')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 목록'})
    @ApiOkResponse({type: RoomListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRooms(@PassportActor() actor: Actor, @Query() query: RoomListDto): Promise<RoomListResultDto> {
        const dto = new RoomListDto(query);
        return this.internalHttp.request<RoomListResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.ROOM_LIST, {actor, query: dto});
    }
}
