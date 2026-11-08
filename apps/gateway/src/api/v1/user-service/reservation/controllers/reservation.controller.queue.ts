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
import {ReservationCancelRequestApproveParamDto, ReservationCancelRequestApproveResultDto} from '@app/contracts/reservation/dto/reservation-cancel-request-approve.dto.js';
import {ReservationCancelRequestRejectParamDto} from '@app/contracts/reservation/dto/reservation-cancel-request-reject.dto.js';
import {ReservationCancelDto, ReservationCancelParamDto, ReservationCancelResultDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import {ReservationPaymentConfirmDto, ReservationPaymentConfirmResultDto} from '@app/contracts/reservation/dto/reservation-payment-confirm.dto.js';
import {ReservationDto, ReservationResultDto} from '@app/contracts/reservation/dto/reservation.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 예약 공개 API — 큐 경로(RabbitMQ `user.reservation.*` → user-service + 요청 단위 SSE).
 * 예약 생성 · 결제 확인 · 취소 · 이용 중 취소 요청 승인 · 거절 — 이용자 가드. path param 은 payload 에 합쳐 보낸다. 매니저의 업체 취소 · 호실 이동은 /api/v1/admin-service/reservation 이다.
 */
@ApiTags('예약')
@Controller('/api/v1/user-service/reservation')
export class ReservationQueueController {
    /**
     * @param commandStream 큐 경로 전달(명령 발행 + 요청 단위 SSE)
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 예약 생성 (이용자) — 결제 대기 5분. done 의 data 로 토스 결제창을 연다(orderId = payment_id)
     */
    @Post('/')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '예약 생성'})
    @ApiBody({type: ReservationDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ReservationResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createReservation(@PassportActor() actor: Actor, @Body() dto: ReservationDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.CREATE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 결제 확인 (이용자) — 토스 승인 뒤 결제 키를 보내면 토스에서 다시 읽어 대조하고 확정한다
     */
    @Post('/payment-confirm')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '결제 확인'})
    @ApiBody({type: ReservationPaymentConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ReservationPaymentConfirmResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmPayment(@PassportActor() actor: Actor, @Body() dto: ReservationPaymentConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.PAYMENT_CONFIRM, actor, payload: dto, client_ip: ip});
    }

    /**
     * 이용자 취소 — 사유 필수, 환불 규정대로(백그라운드 환불). 예약한 호실이 사용중지면 이용 중이어도 끝 전까지 전액 환불
     */
    @Patch('/:reservation_id/cancel')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '예약 취소'})
    @ApiBody({type: ReservationCancelDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ReservationCancelResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async cancelReservation(@PassportActor() actor: Actor, @Param() param: ReservationCancelParamDto, @Body() dto: ReservationCancelDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.CANCEL, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 이용 중 취소 요청 승인 (이용자) — 업체 취소 · 결제 전액 환불(백그라운드) · QR 끝. 요청 중이고 만료 전일 때만
     */
    @Patch('/:reservation_id/cancel-request/approve')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용 중 취소 요청 승인'})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ReservationCancelRequestApproveResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async approveCancelRequest(@PassportActor() actor: Actor, @Param() param: ReservationCancelRequestApproveParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.CANCEL_REQUEST_APPROVE, actor, payload: param, client_ip: ip});
    }

    /**
     * 이용 중 취소 요청 거절 (이용자) — 요청만 끝나고 예약은 그대로. done 의 data 는 null
     */
    @Patch('/:reservation_id/cancel-request/reject')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용 중 취소 요청 거절'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async rejectCancelRequest(@PassportActor() actor: Actor, @Param() param: ReservationCancelRequestRejectParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.CANCEL_REQUEST_REJECT, actor, payload: param, client_ip: ip});
    }
}
