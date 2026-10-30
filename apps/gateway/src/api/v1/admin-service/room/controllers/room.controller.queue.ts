import {Body, Controller, Delete, Ip, Param, Patch, Post, Put, Res, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {Response} from 'express';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {RoomDeleteParamDto} from '@app/contracts/room/dto/room-delete.dto.js';
import {RoomGroupDeleteParamDto} from '@app/contracts/room/dto/room-group-delete.dto.js';
import {RoomGroupImageDeleteParamDto} from '@app/contracts/room/dto/room-group-image-delete.dto.js';
import {RoomGroupImageOrderDto, RoomGroupImageOrderParamDto} from '@app/contracts/room/dto/room-group-image-order.dto.js';
import {RoomGroupImageDto, RoomGroupImageParamDto, RoomGroupImageResultDto} from '@app/contracts/room/dto/room-group-image.dto.js';
import {RoomGroupPlanPriceDeleteParamDto} from '@app/contracts/room/dto/room-group-plan-price-delete.dto.js';
import {RoomGroupPlanPriceUpdateDto, RoomGroupPlanPriceUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-price-update.dto.js';
import {RoomGroupPlanPriceDto, RoomGroupPlanPriceParamDto, RoomGroupPlanPriceResultDto} from '@app/contracts/room/dto/room-group-plan-price.dto.js';
import {RoomGroupPlanUpdateDto, RoomGroupPlanUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-update.dto.js';
import {RoomGroupUpdateDto, RoomGroupUpdateParamDto} from '@app/contracts/room/dto/room-group-update.dto.js';
import {RoomGroupDto, RoomGroupResultDto} from '@app/contracts/room/dto/room-group.dto.js';
import {RoomPlanUpdateDto, RoomPlanUpdateParamDto} from '@app/contracts/room/dto/room-plan-update.dto.js';
import {RoomStateDto, RoomStateParamDto} from '@app/contracts/room/dto/room-state.dto.js';
import {RoomUpdateDto, RoomUpdateParamDto} from '@app/contracts/room/dto/room-update.dto.js';
import {RoomDto, RoomResultDto} from '@app/contracts/room/dto/room.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 객실 관리 공개 API — 큐 경로(RabbitMQ `admin.room.*` → admin-service + 요청 단위 SSE).
 * 모두 매니저 가드(업체 총관리자 · 업체 관리자)이고 내 업체만 다룬다. path param 은 payload 에 합쳐 보낸다.
 * 정적 경로(`/plan…` · `/group…`)를 `/:room_id` 보다 먼저 선언한다. 동기 경로(조회 · 그룹 사진 업로드 주소)는 같은 경로 접두의 room.controller.ts(RoomController)에 둔다.
 */
@ApiTags('객실 관리')
@Controller('/api/v1/admin-service/room')
export class RoomQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 업체 상품 설정 수정 (업체 관리자) — 종류별, 시간 이용은 이용 시간 · 1박 · 연박은 입실 · 퇴실 시각. done 의 data 는 null.
     */
    @Patch('/plan/:room_plan_type_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 상품 설정 수정'})
    @ApiBody({type: RoomPlanUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoomPlan(@PassportActor() actor: Actor, @Param() param: RoomPlanUpdateParamDto, @Body() dto: RoomPlanUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.PLAN_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 객실 그룹 등록 (업체 관리자) — 그룹명 · 설명 · 상세정보, 그룹 상품 3개(사용 안 함 · 요금 0)를 함께 만든다. done 의 data 는 객실 그룹 ID.
     */
    @Post('/group')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 등록'})
    @ApiBody({type: RoomGroupDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: RoomGroupResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyRoomGroup(@PassportActor() actor: Actor, @Body() dto: RoomGroupDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_CREATE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 객실 그룹 수정 (업체 관리자) — 그룹명 · 설명 · 상세정보(보내면 통째로, 안 보내면 그대로). done 의 data 는 null.
     */
    @Patch('/group/:room_group_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 수정'})
    @ApiBody({type: RoomGroupUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoomGroup(@PassportActor() actor: Actor, @Param() param: RoomGroupUpdateParamDto, @Body() dto: RoomGroupUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 객실 그룹 삭제 (업체 관리자) — 그 그룹의 호실 · 사진도 함께 지운다(사진 파일은 저장소에서도 삭제). done 의 data 는 null.
     */
    @Delete('/group/:room_group_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteMyRoomGroup(@PassportActor() actor: Actor, @Param() param: RoomGroupDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 객실 그룹 사진 등록 (업체 관리자) — 업로드 주소로 올린 사진의 키, 마지막 순서. done 의 data 는 객실 그룹 사진 ID.
     */
    @Post('/group/:room_group_id/image')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 사진 등록'})
    @ApiBody({type: RoomGroupImageDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: RoomGroupImageResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyRoomGroupImage(@PassportActor() actor: Actor, @Param() param: RoomGroupImageParamDto, @Body() dto: RoomGroupImageDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_IMAGE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 객실 그룹 사진 순서 변경 (업체 관리자) — 그룹 사진 ID 전부를 원하는 순서로(가장 앞이 대표). done 의 data 는 null.
     */
    @Put('/group/:room_group_id/image/order')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 사진 순서 변경'})
    @ApiBody({type: RoomGroupImageOrderDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async reorderMyRoomGroupImages(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupImageOrderParamDto,
        @Body() dto: RoomGroupImageOrderDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_IMAGE_ORDER, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 객실 그룹 사진 삭제 (업체 관리자) — 그 그룹의 사진, 사진 파일은 저장소에서도 삭제. done 의 data 는 null.
     */
    @Delete('/group/:room_group_id/image/:room_group_image_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 사진 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteMyRoomGroupImage(@PassportActor() actor: Actor, @Param() param: RoomGroupImageDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 그룹 상품 수정 (업체 관리자) — 그룹 × 상품 종류의 사용 여부 · 기본 요금, 판매인데 요금 0 이면 400. done 의 data 는 null.
     */
    @Patch('/group/:room_group_id/plan/:room_plan_type_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '그룹 상품 수정'})
    @ApiBody({type: RoomGroupPlanUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoomGroupPlan(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupPlanUpdateParamDto,
        @Body() dto: RoomGroupPlanUpdateDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 상품별 기간 가격 등록 (업체 관리자) — 시작 ~ 종료 날짜(둘 다 포함) · 요금 · 메모, 같은 상품의 다른 기간과 겹치면 400. done 의 data 는 기간 가격 ID.
     */
    @Post('/group/:room_group_id/plan/:room_plan_type_id/price')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '상품별 기간 가격 등록'})
    @ApiBody({type: RoomGroupPlanPriceDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: RoomGroupPlanPriceResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyRoomGroupPlanPrice(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupPlanPriceParamDto,
        @Body() dto: RoomGroupPlanPriceDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 상품별 기간 가격 수정 (업체 관리자) — 등록과 같은 필드를 통째로, 같은 상품의 다른 기간(자기 자신 제외)과 겹치면 400. done 의 data 는 null.
     */
    @Patch('/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '상품별 기간 가격 수정'})
    @ApiBody({type: RoomGroupPlanPriceUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoomGroupPlanPrice(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupPlanPriceUpdateParamDto,
        @Body() dto: RoomGroupPlanPriceUpdateDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 상품별 기간 가격 삭제 (업체 관리자) — 그 그룹 상품의 기간 가격만. done 의 data 는 null.
     */
    @Delete('/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '상품별 기간 가격 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteMyRoomGroupPlanPrice(@PassportActor() actor: Actor, @Param() param: RoomGroupPlanPriceDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 호실 등록 (업체 관리자) — 그룹 · 호실명 · 층, 상태는 예약가능. done 의 data 는 호실 ID.
     */
    @Post('/')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 등록'})
    @ApiBody({type: RoomDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: RoomResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyRoom(@PassportActor() actor: Actor, @Body() dto: RoomDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.CREATE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 호실 수정 (업체 관리자) — 그룹(이동 포함) · 호실명 · 층 통째로. done 의 data 는 null.
     */
    @Patch('/:room_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 수정'})
    @ApiBody({type: RoomUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoom(@PassportActor() actor: Actor, @Param() param: RoomUpdateParamDto, @Body() dto: RoomUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 호실 삭제 (업체 관리자). done 의 data 는 null.
     */
    @Delete('/:room_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteMyRoom(@PassportActor() actor: Actor, @Param() param: RoomDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 호실 상태 변경 (업체 관리자) — 정비 완료(정비중 → 예약가능) · 사용중지 · 사용 재개만, 그 밖의 전환은 400. done 의 data 는 null.
     */
    @Patch('/:room_id/state')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 상태 변경'})
    @ApiBody({type: RoomStateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeMyRoomState(@PassportActor() actor: Actor, @Param() param: RoomStateParamDto, @Body() dto: RoomStateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.STATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }
}
