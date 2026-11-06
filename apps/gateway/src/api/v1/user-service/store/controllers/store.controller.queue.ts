import {Body, Controller, Delete, Ip, Param, Post, Res, UseGuards} from '@nestjs/common';
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
import {StoreApplicationCancelParamDto} from '@app/contracts/store/dto/store-application-cancel.dto.js';
import {StoreApplicationFileDeleteParamDto} from '@app/contracts/store/dto/store-application-file-delete.dto.js';
import {StoreApplicationFileDto, StoreApplicationFileParamDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import {STORE_USER_COMMAND} from '@app/contracts/store/store.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 입점 신청 공개 API — 큐 경로(RabbitMQ `user.store.application*` → user-service + 요청 단위 SSE). 모두 이용자 가드(대기 중 내 신청만).
 * path param 은 payload 에 합쳐 보낸다. 조회 · 업로드 주소(동기)는 같은 경로 접두의 store.controller.ts.
 */
@ApiTags('입점 신청')
@Controller('/api/v1/user-service/store')
export class StoreQueueController {
    /**
     * @param commandStream 명령 발행 + 요청 단위 SSE
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
        await this.commandStream.dispatch(res, {type: STORE_USER_COMMAND.APPLICATION, actor, payload: dto, client_ip: ip});
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
        await this.commandStream.dispatch(res, {type: STORE_USER_COMMAND.APPLICATION_CANCEL, actor, payload: param, client_ip: ip});
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
        await this.commandStream.dispatch(res, {type: STORE_USER_COMMAND.APPLICATION_FILE, actor, payload: {...param, ...dto}, client_ip: ip});
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
        await this.commandStream.dispatch(res, {type: STORE_USER_COMMAND.APPLICATION_FILE_DELETE, actor, payload: param, client_ip: ip});
    }
}
