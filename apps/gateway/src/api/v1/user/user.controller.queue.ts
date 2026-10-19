import {Body, Controller, Delete, Ip, Patch, Post, Res, UseGuards} from '@nestjs/common';
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
import {UserGeneralSignDto, UserGeneralSignResultDto} from '@app/contracts/user/dto/user-general-sign.dto.js';
import {UserLeaveDto} from '@app/contracts/user/dto/user-leave.dto.js';
import {UserPasswordDto} from '@app/contracts/user/dto/user-password.dto.js';
import {UserSignDto, UserSignResultDto} from '@app/contracts/user/dto/user-sign.dto.js';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import {PassportActor} from '../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {CommandStreamService} from '../../../modules/transport/command-stream.service.js';

/**
 * 회원 공개 API — 큐 경로(RabbitMQ 명령 + 요청 단위 SSE). 게이트웨이 인바운드 어댑터.
 * 입력 검증 · 인증을 여기서 끝내고 CommandStreamService 로 명령을 발행한다. 로직 0.
 * 응답은 event: accepted → done | failed | pending 후 종료. done 의 data 가 ApiOkResponse 의 DTO 다(void 면 생략).
 *
 * 동기 경로(내부 HTTP) 라우트는 같은 경로 접두의 user.controller.ts(UserController)에 둔다.
 */
@ApiTags('회원')
@Controller('/api/v1/user')
export class UserQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과를 SSE 로 전달
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * SNS 회원가입
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
     * 일반 회원가입
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
     * 회원 탈퇴 신청 — LEAVE_WAIT 전환, 14일 후 자동 처리. done 의 data 는 null.
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
     * 회원 탈퇴 철회 — LEAVE_WAIT → 직전 상태 복원. done 의 data 는 null.
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
     * 비밀번호 변경 — done 의 data 는 null.
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
