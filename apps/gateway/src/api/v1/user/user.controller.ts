import {Body, Controller, Delete, HttpCode, Ip, Patch, Post, Res, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiForbiddenResponse,
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
import {UserGeneralLoginDto, UserGeneralLoginResultDto} from '@app/contracts/user/dto/user-general-login.dto.js';
import {UserGeneralSignDto, UserGeneralSignResultDto} from '@app/contracts/user/dto/user-general-sign.dto.js';
import {UserLeaveDto} from '@app/contracts/user/dto/user-leave.dto.js';
import {UserLoginDto, UserLoginResultDto} from '@app/contracts/user/dto/user-login.dto.js';
import {UserPasswordDto} from '@app/contracts/user/dto/user-password.dto.js';
import {UserSignDto, UserSignResultDto} from '@app/contracts/user/dto/user-sign.dto.js';
import {UserTokenRefreshDto, UserTokenRefreshResultDto} from '@app/contracts/user/dto/user-token-refresh.dto.js';
import {USER_COMMAND, USER_INTERNAL_PATH} from '@app/contracts/user/user.commands.js';
import {PassportActor} from '../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {CommandStreamService} from '../../../modules/transport/command-stream.service.js';
import {InternalHttpClient} from '../../../modules/transport/internal-http.client.js';

/**
 * 회원 공개 API (게이트웨이 인바운드 어댑터).
 * 입력 검증 · 인증을 여기서 끝내고, 경로를 골라 user-service 로 넘긴다. 로직 0.
 *
 * - 큐 경로(`@Res()` + CommandStreamService): 가입 · 탈퇴 · 철회 · 비밀번호 변경. 응답은 요청 단위 SSE
 *   (event: accepted → done | failed | pending). done 의 data 가 ApiOkResponse 의 DTO 다.
 * - 동기 경로(InternalHttpClient): 로그인 · 토큰 재발급. 일반 JSON 응답.
 */
@ApiTags('회원')
@Controller('/api/v1/user')
export class UserController {
    /**
     * @param internalHttp 동기 경로
     * @param commandStream 큐 경로
     */
    constructor(
        private readonly internalHttp: InternalHttpClient,
        private readonly commandStream: CommandStreamService,
    ) {}

    /**
     * SNS 회원가입 (큐 경로)
     */
    @Post('/sign')
    @ApiOperation({summary: 'SNS 회원가입'})
    @ApiBody({type: UserSignDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserSignResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sign(@Body() dto: UserSignDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.SIGN, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 일반 회원가입 (큐 경로)
     */
    @Post('/general-sign')
    @ApiOperation({summary: '일반 회원가입'})
    @ApiBody({type: UserGeneralSignDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserGeneralSignResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async generalSign(@Body() dto: UserGeneralSignDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.GENERAL_SIGN, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * SNS 로그인 (동기 경로)
     */
    @Post('/login')
    @HttpCode(200)
    @ApiOperation({summary: 'SNS 로그인'})
    @ApiBody({type: UserLoginDto})
    @ApiOkResponse({type: UserLoginResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async login(@Body() dto: UserLoginDto, @Ip() ip: string): Promise<UserLoginResultDto> {
        return this.internalHttp.request<UserLoginResultDto>('user', 'POST', USER_INTERNAL_PATH.LOGIN, {body: dto, client_ip: ip});
    }

    /**
     * 일반 로그인 (동기 경로)
     */
    @Post('/general-login')
    @HttpCode(200)
    @ApiOperation({summary: '일반 로그인'})
    @ApiBody({type: UserGeneralLoginDto})
    @ApiOkResponse({type: UserGeneralLoginResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async generalLogin(@Body() dto: UserGeneralLoginDto, @Ip() ip: string): Promise<UserGeneralLoginResultDto> {
        return this.internalHttp.request<UserGeneralLoginResultDto>('user', 'POST', USER_INTERNAL_PATH.GENERAL_LOGIN, {body: dto, client_ip: ip});
    }

    /**
     * 로그인 토큰 재발급 (동기 경로)
     */
    @Post('/token-refresh')
    @HttpCode(200)
    @ApiOperation({summary: '로그인 토큰 재발급'})
    @ApiBody({type: UserTokenRefreshDto})
    @ApiOkResponse({type: UserTokenRefreshResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async tokenRefresh(@Body() dto: UserTokenRefreshDto, @Ip() ip: string): Promise<UserTokenRefreshResultDto> {
        return this.internalHttp.request<UserTokenRefreshResultDto>('user', 'POST', USER_INTERNAL_PATH.TOKEN_REFRESH, {body: dto, client_ip: ip});
    }

    /**
     * 회원 탈퇴 신청 (큐 경로) — LEAVE_WAIT 전환, 14일 후 자동 처리. done 의 data 는 null.
     */
    @Delete('/leave')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '회원 탈퇴 신청'})
    @ApiBody({type: UserLeaveDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async leave(@PassportActor() actor: Actor, @Body() dto: UserLeaveDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.LEAVE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 회원 탈퇴 철회 (큐 경로) — LEAVE_WAIT → 직전 상태 복원. done 의 data 는 null.
     */
    @Patch('/leave')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '회원 탈퇴 철회'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async cancelLeave(@PassportActor() actor: Actor, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.LEAVE_CANCEL, actor, payload: {}, client_ip: ip});
    }

    /**
     * 비밀번호 변경 (큐 경로) — done 의 data 는 null.
     */
    @Patch('/password')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '비밀번호 변경'})
    @ApiBody({type: UserPasswordDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changePassword(@PassportActor() actor: Actor, @Body() dto: UserPasswordDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PASSWORD, actor, payload: dto, client_ip: ip});
    }
}
