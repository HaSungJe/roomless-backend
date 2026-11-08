import {Body, Controller, Ip, Param, Patch, Post, Res, UseGuards} from '@nestjs/common';
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
import {ReservationRoomChangeDto, ReservationRoomChangeParamDto} from '@app/contracts/reservation/dto/reservation-room-change.dto.js';
import {ReservationStoreCancelDto, ReservationStoreCancelParamDto} from '@app/contracts/reservation/dto/reservation-store-cancel.dto.js';
import {ReservationUseCancelRequestDto, ReservationUseCancelRequestParamDto, ReservationUseCancelRequestResultDto} from '@app/contracts/reservation/dto/reservation-use-cancel-request.dto.js';
import {RESERVATION_MANAGER_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 업체 예약 공개 API — 큐 경로(RabbitMQ `admin.reservation.*` → admin-service + 요청 단위 SSE). 매니저 가드(내 업체 예약만). path param 은 payload 에 합쳐 보낸다.
 */
@ApiTags('업체 예약')
@Controller('/api/v1/admin-service/reservation')
export class ReservationQueueController {
    /**
     * @param commandStream 명령 발행 + 요청 단위 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 업체 취소 (업체 관리자) — 시작 전 예약만, 100% 환불 + 이용자 SMS(이용 중 예약은 이용 중 취소 요청). done 의 data 는 null
     */
    @Patch('/:reservation_id/store-cancel')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 예약 취소'})
    @ApiBody({type: ReservationStoreCancelDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async cancelStoreReservation(
        @PassportActor() actor: Actor,
        @Param() param: ReservationStoreCancelParamDto,
        @Body() dto: ReservationStoreCancelDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_MANAGER_COMMAND.STORE_CANCEL, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 호실 이동 (업체 관리자) — 같은 객실 그룹의 다른 호실로 + 이용자 SMS. done 의 data 는 null
     */
    @Patch('/:reservation_id/room')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '예약 호실 이동'})
    @ApiBody({type: ReservationRoomChangeDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeReservationRoom(
        @PassportActor() actor: Actor,
        @Param() param: ReservationRoomChangeParamDto,
        @Body() dto: ReservationRoomChangeDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_MANAGER_COMMAND.ROOM_CHANGE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 이용 중 취소 요청 (업체 관리자) — 이용 중 예약을 예약자 동의로 취소한다. 예약자에게 승인 링크 SMS, 10분(예약 끝이 먼저면 예약 끝) 안에 승인하면 전액 환불 취소.
     * 결과(승인 · 거절 · 만료)는 업체 예약 현황의 cancel_request_state_id 로 본다
     */
    @Post('/:reservation_id/use-cancel-request')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용 중 취소 요청'})
    @ApiBody({type: ReservationUseCancelRequestDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ReservationUseCancelRequestResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async requestUseCancel(
        @PassportActor() actor: Actor,
        @Param() param: ReservationUseCancelRequestParamDto,
        @Body() dto: ReservationUseCancelRequestDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_MANAGER_COMMAND.USE_CANCEL_REQUEST, actor, payload: {...param, ...dto}, client_ip: ip});
    }
}
