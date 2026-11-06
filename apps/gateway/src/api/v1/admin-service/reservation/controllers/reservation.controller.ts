import {Controller, Get, HttpCode, Query, UseGuards} from '@nestjs/common';
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
import {ReservationStoreDto, ReservationStoreResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {RESERVATION_MANAGER_INTERNAL_PATH} from '@app/contracts/reservation/reservation.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 업체 예약 공개 API — 동기 경로(내부 HTTP → admin-service reservation 도메인). 매니저 가드(업체 총관리자 · 업체 관리자 — 내 업체 예약만).
 * 쓰기(업체 취소 · 호실 이동 — 큐)는 같은 경로 접두의 reservation.controller.queue.ts. 이용자 예약은 /api/v1/user-service/reservation 이다.
 */
@ApiTags('업체 예약')
@Controller('/api/v1/admin-service/reservation')
export class ReservationController {
    /**
     * @param internalHttp 동기 경로 — admin-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

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
        return this.internalHttp.request<ReservationStoreResultDto>('admin', 'GET', RESERVATION_MANAGER_INTERNAL_PATH.STORE, {actor, query: dto});
    }
}
