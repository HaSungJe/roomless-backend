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
    ApiTooManyRequestsResponse,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {Response} from 'express';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {UserFindLoginIdConfirmDto, UserFindLoginIdConfirmResultDto} from '@app/contracts/user/dto/user-find-login-id-confirm.dto.js';
import {UserFindLoginIdDto, UserFindLoginIdResultDto} from '@app/contracts/user/dto/user-find-login-id.dto.js';
import {UserGeneralSignDto, UserGeneralSignResultDto} from '@app/contracts/user/dto/user-general-sign.dto.js';
import {UserLeaveDto} from '@app/contracts/user/dto/user-leave.dto.js';
import {UserPasswordResetConfirmDto} from '@app/contracts/user/dto/user-password-reset-confirm.dto.js';
import {UserPasswordResetDto, UserPasswordResetResultDto} from '@app/contracts/user/dto/user-password-reset.dto.js';
import {UserPasswordDto} from '@app/contracts/user/dto/user-password.dto.js';
import {UserPhoneVerificationConfirmDto} from '@app/contracts/user/dto/user-phone-verification-confirm.dto.js';
import {UserPhoneVerificationDto, UserPhoneVerificationResultDto} from '@app/contracts/user/dto/user-phone-verification.dto.js';
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

    /**
     * 휴대폰 인증번호 발송 — 가입 후 본인 휴대폰 인증. done 의 data 는 인증 ID · 만료 시각.
     */
    @Post('/phone-verification')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '휴대폰 인증번호 발송'})
    @ApiBody({type: UserPhoneVerificationDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserPhoneVerificationResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendPhoneVerification(@PassportActor() actor: Actor, @Body() dto: UserPhoneVerificationDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PHONE_VERIFICATION, actor, payload: dto, client_ip: ip});
    }

    /**
     * 휴대폰 인증번호 확인 — 확인되면 그 번호를 회원정보에 저장. done 의 data 는 null.
     */
    @Post('/phone-verification/confirm')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '휴대폰 인증번호 확인'})
    @ApiBody({type: UserPhoneVerificationConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmPhoneVerification(@PassportActor() actor: Actor, @Body() dto: UserPhoneVerificationConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PHONE_VERIFICATION_CONFIRM, actor, payload: dto, client_ip: ip});
    }

    /**
     * 아이디 찾기 — 인증번호 발송. done 의 data 는 인증 ID · 만료 시각.
     */
    @Post('/find-login-id')
    @ApiOperation({summary: '아이디 찾기 — 인증번호 발송'})
    @ApiBody({type: UserFindLoginIdDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserFindLoginIdResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendFindLoginId(@Body() dto: UserFindLoginIdDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.FIND_LOGIN_ID, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 아이디 찾기 — 인증번호 확인. done 의 data 는 아이디(일반) 또는 가입한 SNS · 가입일시.
     */
    @Post('/find-login-id/confirm')
    @ApiOperation({summary: '아이디 찾기 — 인증번호 확인'})
    @ApiBody({type: UserFindLoginIdConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserFindLoginIdConfirmResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmFindLoginId(@Body() dto: UserFindLoginIdConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.FIND_LOGIN_ID_CONFIRM, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 비밀번호 초기화 — 인증번호 발송(아이디 + 휴대폰 번호). done 의 data 는 인증 ID · 만료 시각.
     */
    @Post('/password-reset')
    @ApiOperation({summary: '비밀번호 초기화 — 인증번호 발송'})
    @ApiBody({type: UserPasswordResetDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserPasswordResetResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendPasswordReset(@Body() dto: UserPasswordResetDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PASSWORD_RESET, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호를 SMS 로 보낸다. done 의 data 는 null.
     */
    @Post('/password-reset/confirm')
    @ApiOperation({summary: '비밀번호 초기화 — 인증번호 확인'})
    @ApiBody({type: UserPasswordResetConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmPasswordReset(@Body() dto: UserPasswordResetConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PASSWORD_RESET_CONFIRM, actor: null, payload: dto, client_ip: ip});
    }
}
