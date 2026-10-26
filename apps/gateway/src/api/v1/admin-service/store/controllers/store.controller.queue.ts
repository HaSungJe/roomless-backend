import {Body, Controller, Delete, Ip, Param, Patch, Post, Res, UseGuards} from '@nestjs/common';
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
import {StoreApplicationApproveParamDto, StoreApplicationApproveResultDto} from '@app/contracts/store/dto/store-application-approve.dto.js';
import {StoreApplicationCancelParamDto} from '@app/contracts/store/dto/store-application-cancel.dto.js';
import {StoreApplicationFileDeleteParamDto} from '@app/contracts/store/dto/store-application-file-delete.dto.js';
import {StoreApplicationFileDto, StoreApplicationFileParamDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import {StoreApplicationRejectDto, StoreApplicationRejectParamDto} from '@app/contracts/store/dto/store-application-reject.dto.js';
import {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import {StoreStateDto, StoreStateParamDto} from '@app/contracts/store/dto/store-state.dto.js';
import {StoreUpdateDto, StoreUpdateParamDto} from '@app/contracts/store/dto/store-update.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 업체 공개 API — 큐 경로(RabbitMQ `admin.store.*` → admin-service + 요청 단위 SSE).
 * 신청 · 신청 취소 · 업체 정보 파일 등록 · 삭제(이용자 가드), 승인 · 반려 · 업체 수정 · 상태 변경(관리자 가드). path param 은 payload 에 합쳐 보낸다.
 * 동기 경로(조회 · 업로드 주소)는 같은 경로 접두의 store.controller.ts(StoreController)에 둔다.
 */
@ApiTags('업체')
@Controller('/api/v1/admin-service/store')
export class StoreQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 입점 신청 — 업체 정보. done 의 data 는 입점 신청 ID(업체 정보 파일을 붙일 때 쓴다).
     */
    @Post('/application')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 신청'})
    @ApiBody({type: StoreApplicationDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreApplicationResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async apply(@PassportActor() actor: Actor, @Body() dto: StoreApplicationDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION, actor, payload: dto, client_ip: ip});
    }

    /**
     * 입점 신청 취소 — 대기 중 내 신청. 신청 · 업체 정보 파일이 지워져 목록 · 상세에서 사라진다. done 의 data 는 null.
     */
    @Delete('/application/mine/:store_application_id')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 신청 취소'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async cancelMyApplication(@PassportActor() actor: Actor, @Param() param: StoreApplicationCancelParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_CANCEL, actor, payload: param, client_ip: ip});
    }

    /**
     * 업체 정보 파일 등록 — 업로드 주소로 올린 파일의 키. done 의 data 는 업체 정보 파일 ID.
     */
    @Post('/application/mine/:store_application_id/file')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 파일 등록'})
    @ApiBody({type: StoreApplicationFileDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreApplicationFileResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyApplicationFile(
        @PassportActor() actor: Actor,
        @Param() param: StoreApplicationFileParamDto,
        @Body() dto: StoreApplicationFileDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_FILE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 정보 파일 삭제 — 대기 중 내 신청의 파일. done 의 data 는 null.
     */
    @Delete('/application/mine/:store_application_id/file/:store_file_id')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 파일 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async removeMyApplicationFile(@PassportActor() actor: Actor, @Param() param: StoreApplicationFileDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_FILE_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 입점 승인 (총관리자) — 업체 등록(업체코드) + 업체 총관리자 계정(신청 때 정한 아이디 · 비밀번호) + 승인 알림 SMS. done 의 data 는 업체 ID · 업체코드.
     */
    @Patch('/application/:store_application_id/approve')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 승인'})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreApplicationApproveResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async approveApplication(@PassportActor() actor: Actor, @Param() param: StoreApplicationApproveParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_APPROVE, actor, payload: param, client_ip: ip});
    }

    /**
     * 입점 반려 (총관리자) — 사유 필수. done 의 data 는 null.
     */
    @Patch('/application/:store_application_id/reject')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 반려'})
    @ApiBody({type: StoreApplicationRejectDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async rejectApplication(
        @PassportActor() actor: Actor,
        @Param() param: StoreApplicationRejectParamDto,
        @Body() dto: StoreApplicationRejectDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_REJECT, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 정보 수정 (총관리자) — 사업자등록번호 제외. done 의 data 는 null.
     */
    @Patch('/:store_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 수정'})
    @ApiBody({type: StoreUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateStore(@PassportActor() actor: Actor, @Param() param: StoreUpdateParamDto, @Body() dto: StoreUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 상태 변경 (총관리자) — 활성 · 영업중지 · 탈퇴(되돌릴 수 없음 · 매니저 정지). done 의 data 는 null.
     */
    @Patch('/:store_id/state')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 상태 변경'})
    @ApiBody({type: StoreStateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeStoreState(@PassportActor() actor: Actor, @Param() param: StoreStateParamDto, @Body() dto: StoreStateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.STATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }
}
