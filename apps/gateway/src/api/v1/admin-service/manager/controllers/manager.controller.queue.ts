import {Body, Controller, Delete, Ip, Param, Patch, Post, Res, UseGuards} from '@nestjs/common';
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
import {ManagerStaffDeleteParamDto} from '@app/contracts/manager/dto/manager-staff-delete.dto.js';
import {ManagerStaffPasswordResetParamDto} from '@app/contracts/manager/dto/manager-staff-password-reset.dto.js';
import {ManagerStaffStateDto, ManagerStaffStateParamDto} from '@app/contracts/manager/dto/manager-staff-state.dto.js';
import {ManagerStaffUpdateDto, ManagerStaffUpdateParamDto} from '@app/contracts/manager/dto/manager-staff-update.dto.js';
import {ManagerStaffDto, ManagerStaffResultDto} from '@app/contracts/manager/dto/manager-staff.dto.js';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import {AUTH_ID} from '@app/contracts/roles.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {Roles} from '../../../../../guards/roles/roles.decorator.js';
import {RolesGuard} from '../../../../../guards/roles/roles.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 매니저 그룹(총매니저 · 매니저) 공개 API — 큐 경로(RabbitMQ `admin.manager.*` → admin-service + 요청 단위 SSE).
 * 비밀번호 변경(로그인) · 아이디 찾기 · 비밀번호 초기화(비로그인 — 업체코드 + 등록된 휴대폰 번호로, 이용자 라우트의 미러),
 * 업체 관리자 등록 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제(매니저 가드 + RolesGuard · @Roles(HEAD_MANAGER) — 업체 총관리자만).
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

    /**
     * 업체 관리자 등록 — 업체 총관리자만. 임시 비밀번호는 업체 관리자 휴대폰으로 SMS. done 의 data 는 회원 ID.
     */
    @Post('/staff')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 등록'})
    @ApiBody({type: ManagerStaffDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ManagerStaffResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async registerStaff(@PassportActor() actor: Actor, @Body() dto: ManagerStaffDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF, actor, payload: dto, client_ip: ip});
    }

    /**
     * 업체 관리자 수정 — 업체 총관리자만. done 의 data 는 null.
     */
    @Patch('/staff/:user_id')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 수정'})
    @ApiBody({type: ManagerStaffUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateStaff(@PassportActor() actor: Actor, @Param() param: ManagerStaffUpdateParamDto, @Body() dto: ManagerStaffUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 관리자 비밀번호 초기화 — 업체 총관리자만. 임시 비밀번호는 업체 관리자 휴대폰으로 SMS. done 의 data 는 null.
     */
    @Patch('/staff/:user_id/password-reset')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 비밀번호 초기화'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async resetStaffPassword(@PassportActor() actor: Actor, @Param() param: ManagerStaffPasswordResetParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF_PASSWORD_RESET, actor, payload: param, client_ip: ip});
    }

    /**
     * 업체 관리자 정지 · 해제 — 업체 총관리자만. 정지하면 다음 요청부터 로그인 · 재발급이 막힌다. done 의 data 는 null.
     */
    @Patch('/staff/:user_id/state')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 정지 · 해제'})
    @ApiBody({type: ManagerStaffStateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeStaffState(@PassportActor() actor: Actor, @Param() param: ManagerStaffStateParamDto, @Body() dto: ManagerStaffStateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF_STATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 관리자 삭제 — 업체 총관리자만. 같은 아이디 · 번호로 다시 등록할 수 있다. done 의 data 는 null.
     */
    @Delete('/staff/:user_id')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteStaff(@PassportActor() actor: Actor, @Param() param: ManagerStaffDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF_DELETE, actor, payload: param, client_ip: ip});
    }
}
