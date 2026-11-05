import {Controller, Get, HttpCode, Param, Query, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
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
import {ReservationAvailabilityDto, ReservationAvailabilityResultDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import {ReservationDetailParamDto, ReservationDetailResultDto} from '@app/contracts/reservation/dto/reservation-detail.dto.js';
import {ReservationListDto, ReservationListResultDto} from '@app/contracts/reservation/dto/reservation-list.dto.js';
import {ReservationQrParamDto, ReservationQrResultDto} from '@app/contracts/reservation/dto/reservation-qr.dto.js';
import {ReservationStoreDto, ReservationStoreResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {RESERVATION_INTERNAL_PATH} from '@app/contracts/reservation/reservation.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 예약 공개 API — 동기 경로(내부 HTTP → user-service). 예약 가능 시간은 로그인 없이, 내 예약은 이용자 가드, 업체 현황은 매니저 가드.
 * 정적 경로(`/availability` · `/store`)를 `/:reservation_id` 보다 먼저 선언한다. 쓰기(큐)는 같은 경로 접두의 reservation.controller.queue.ts.
 */
@ApiTags('예약')
@Controller('/api/v1/user-service/reservation')
export class ReservationController {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 객실 그룹별 예약 가능 시간 (로그인 없음) — 업체 · 날짜 · 상품(연박은 박수), 그룹 필터(선택). 그룹 → 시간대 → 예약 가능한 호수, 시간 이용 · 오늘이면 '지금 바로' 시간대가 맨 앞
     */
    @Get('/availability')
    @HttpCode(200)
    @ApiOperation({summary: '객실 그룹별 예약 가능 시간'})
    @ApiOkResponse({type: ReservationAvailabilityResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getAvailability(@Query() query: ReservationAvailabilityDto): Promise<ReservationAvailabilityResultDto> {
        const dto = new ReservationAvailabilityDto(query);
        return this.internalHttp.request<ReservationAvailabilityResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.AVAILABILITY, {query: dto});
    }

    /**
     * 내 업체 예약 현황 (업체 관리자) — 날짜 하루와 겹치는 예약을 호실별로
     */
    @Get('/store')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 예약 현황'})
    @ApiOkResponse({type: ReservationStoreResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStoreReservations(@PassportActor() actor: Actor, @Query() query: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        const dto = new ReservationStoreDto(query);
        return this.internalHttp.request<ReservationStoreResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.STORE, {actor, query: dto});
    }

    /**
     * 내 예약 목록 (이용자) — 결제 대기 만료 건 제외, 입실 최근순
     */
    @Get('/')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 예약 목록'})
    @ApiOkResponse({type: ReservationListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyReservations(@PassportActor() actor: Actor, @Query() query: ReservationListDto): Promise<ReservationListResultDto> {
        const dto = new ReservationListDto(query);
        return this.internalHttp.request<ReservationListResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.LIST, {actor, query: dto});
    }

    /**
     * 내 예약 상세 (이용자) — 구간 · 결제 포함
     */
    @Get('/:reservation_id')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 예약 상세'})
    @ApiOkResponse({type: ReservationDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyReservation(@PassportActor() actor: Actor, @Param() param: ReservationDetailParamDto): Promise<ReservationDetailResultDto> {
        return this.internalHttp.request<ReservationDetailResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.detail(param.reservation_id), {actor});
    }

    /**
     * 내 예약 QR — 확정 · 이용 중 예약의 이용 시간에만. 아직 발급 전이면 그 자리에서 발급한다. 이용 끝이 지나거나 업체가 취소하면 그 QR 로는 열리지 않는다
     */
    @Get('/:reservation_id/qr')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 예약 QR'})
    @ApiOkResponse({type: ReservationQrResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyReservationQr(@PassportActor() actor: Actor, @Param() param: ReservationQrParamDto): Promise<ReservationQrResultDto> {
        return this.internalHttp.request<ReservationQrResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.qr(param.reservation_id), {actor});
    }
}
