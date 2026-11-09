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
import {UserDetailParamDto, UserDetailResultDto} from '@app/contracts/user/dto/user-detail.dto.js';
import {UserListDto, UserListResultDto} from '@app/contracts/user/dto/user-list.dto.js';
import {UserReservationListDto, UserReservationListParamDto, UserReservationListResultDto} from '@app/contracts/user/dto/user-reservation-list.dto.js';
import {USER_ADMIN_INTERNAL_PATH} from '@app/contracts/user/user.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 이용자 관리 공개 API (총관리자 · 관리자) — 동기 경로(내부 HTTP → admin-service user). 쓰기(이용 제한 · 해제)는 user.controller.queue.ts.
 * 이용자 본인 API 는 /api/v1/user-service/user 다.
 */
@ApiTags('이용자 관리')
@Controller('/api/v1/admin-service/user')
export class UserController {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 이용자 목록 — 검색어(이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드) · 상태 · SNS, 가입 최신순
     */
    @Get('/')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용자 목록'})
    @ApiOkResponse({type: UserListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getUserList(@PassportActor() actor: Actor, @Query() query: UserListDto): Promise<UserListResultDto> {
        const dto = new UserListDto(query);
        return this.internalHttp.request<UserListResultDto>('admin', 'GET', USER_ADMIN_INTERNAL_PATH.LIST, {actor, query: dto});
    }

    /**
     * 이용자 상세 — 회원 정보 · 이용 제한 사유 · 예약 건수 요약
     */
    @Get('/:user_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용자 상세'})
    @ApiOkResponse({type: UserDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getUser(@PassportActor() actor: Actor, @Param() param: UserDetailParamDto): Promise<UserDetailResultDto> {
        return this.internalHttp.request<UserDetailResultDto>('admin', 'GET', USER_ADMIN_INTERNAL_PATH.detail(param.user_id), {actor});
    }

    /**
     * 이용자 예약 이력 — 결제 대기 만료 제외, 이용 시작 최신순
     */
    @Get('/:user_id/reservation')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용자 예약 이력'})
    @ApiOkResponse({type: UserReservationListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getUserReservations(@PassportActor() actor: Actor, @Param() param: UserReservationListParamDto, @Query() query: UserReservationListDto): Promise<UserReservationListResultDto> {
        const dto = new UserReservationListDto(query);
        return this.internalHttp.request<UserReservationListResultDto>('admin', 'GET', USER_ADMIN_INTERNAL_PATH.reservations(param.user_id), {actor, query: dto});
    }
}
