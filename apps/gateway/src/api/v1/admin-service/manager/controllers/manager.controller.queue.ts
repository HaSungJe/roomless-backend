import {Body, Controller, Ip, Patch, Post, Res, UseGuards} from '@nestjs/common';
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
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {Response} from 'express';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {ManagerFindLoginIdConfirmDto, ManagerFindLoginIdConfirmResultDto} from '@app/contracts/manager/dto/manager-find-login-id-confirm.dto.js';
import {ManagerFindLoginIdDto, ManagerFindLoginIdResultDto} from '@app/contracts/manager/dto/manager-find-login-id.dto.js';
import {ManagerPasswordResetConfirmDto} from '@app/contracts/manager/dto/manager-password-reset-confirm.dto.js';
import {ManagerPasswordResetDto, ManagerPasswordResetResultDto} from '@app/contracts/manager/dto/manager-password-reset.dto.js';
import {ManagerPasswordDto} from '@app/contracts/manager/dto/manager-password.dto.js';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 매니저 그룹(총매니저 · 매니저) 공개 API — 큐 경로(RabbitMQ `admin.manager.*` → admin-service + 요청 단위 SSE).
 * 비밀번호 변경(로그인) · 아이디 찾기 · 비밀번호 초기화(비로그인 — 등록된 휴대폰 번호로, 이용자 라우트의 미러).
 * 동기 경로(로그인 · 재발급)는 같은 경로 접두의 manager.controller.ts(ManagerController)에 둔다.
 */
@ApiTags('매니저')
@Controller('/api/v1/admin-service/manager')
export class ManagerQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 매니저 비밀번호 변경 — 매니저 가드(jwt-manager)라 총매니저 · 매니저 토큰만 통과한다. done 의 data 는 null.
     */
    @Patch('/password')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '매니저 비밀번호 변경'})
    @ApiBody({type: ManagerPasswordDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changePassword(@PassportActor() actor: Actor, @Body() dto: ManagerPasswordDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.PASSWORD, actor, payload: dto, client_ip: ip});
    }

    /**
     * 매니저 아이디 찾기 — 인증번호 발송. done 의 data 는 인증 ID · 만료 시각.
     */
    @Post('/find-login-id')
    @ApiOperation({summary: '매니저 아이디 찾기 — 인증번호 발송'})
    @ApiBody({type: ManagerFindLoginIdDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ManagerFindLoginIdResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendFindLoginId(@Body() dto: ManagerFindLoginIdDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.FIND_LOGIN_ID, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 매니저 아이디 찾기 — 인증번호 확인. done 의 data 는 아이디 · 가입일시.
     */
    @Post('/find-login-id/confirm')
    @ApiOperation({summary: '매니저 아이디 찾기 — 인증번호 확인'})
    @ApiBody({type: ManagerFindLoginIdConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ManagerFindLoginIdConfirmResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmFindLoginId(@Body() dto: ManagerFindLoginIdConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.FIND_LOGIN_ID_CONFIRM, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 매니저 비밀번호 초기화 — 인증번호 발송(아이디 + 휴대폰 번호). done 의 data 는 인증 ID · 만료 시각.
     */
    @Post('/password-reset')
    @ApiOperation({summary: '매니저 비밀번호 초기화 — 인증번호 발송'})
    @ApiBody({type: ManagerPasswordResetDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ManagerPasswordResetResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendPasswordReset(@Body() dto: ManagerPasswordResetDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.PASSWORD_RESET, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 매니저 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호를 SMS 로 보낸다. done 의 data 는 null.
     */
    @Post('/password-reset/confirm')
    @ApiOperation({summary: '매니저 비밀번호 초기화 — 인증번호 확인'})
    @ApiBody({type: ManagerPasswordResetConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmPasswordReset(@Body() dto: ManagerPasswordResetConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.PASSWORD_RESET_CONFIRM, actor: null, payload: dto, client_ip: ip});
    }
}
