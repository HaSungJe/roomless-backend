import {Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
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
import {StoreApplicationFileUploadUrlDto, StoreApplicationFileUploadUrlParamDto, StoreApplicationFileUploadUrlResultDto} from '@app/contracts/store/dto/store-application-file-upload-url.dto.js';
import {StoreMyApplicationListDto, StoreMyApplicationListResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import {StoreMyApplicationParamDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import {STORE_USER_INTERNAL_PATH} from '@app/contracts/store/store.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 입점 신청 공개 API — 동기 경로(내부 HTTP → user-service store 도메인). 내 신청 목록 · 상세 · 업체 정보 파일 업로드 주소, 모두 이용자 가드.
 * 큐 경로(신청 · 취소 · 파일 등록 · 삭제)는 같은 경로 접두의 store.controller.queue.ts(StoreQueueController)에 둔다.
 */
@ApiTags('입점 신청')
@Controller('/api/v1/user-service/store')
export class StoreController {
    /**
     * @param internalHttp 동기 경로 — user-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 내 입점 신청 목록 — 대기 · 반려 · 승인 모두(승인 신청은 업체코드 포함)
     */
    @Get('/application/mine')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 입점 신청 목록'})
    @ApiOkResponse({type: StoreMyApplicationListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyApplicationList(@PassportActor() actor: Actor, @Query() query: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {
        const dto = new StoreMyApplicationListDto(query);
        return this.internalHttp.request<StoreMyApplicationListResultDto>('user', 'GET', STORE_USER_INTERNAL_PATH.MY_APPLICATION_LIST, {actor, query: dto});
    }

    /**
     * 내 입점 신청 상세 — 업체 정보 파일 열람 주소 · 승인 신청은 업체코드 포함, 남의 신청은 404
     */
    @Get('/application/mine/:store_application_id')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 입점 신청 상세'})
    @ApiOkResponse({type: StoreMyApplicationResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyApplication(@PassportActor() actor: Actor, @Param() param: StoreMyApplicationParamDto): Promise<StoreMyApplicationResultDto> {
        return this.internalHttp.request<StoreMyApplicationResultDto>('user', 'GET', STORE_USER_INTERNAL_PATH.myApplication(param.store_application_id), {actor});
    }

    /**
     * 업체 정보 파일 업로드 주소 — 받은 주소로 같은 Content-Type 헤더로 PUT 한 뒤 file_key 로 파일을 등록한다
     */
    @Post('/application/mine/:store_application_id/file/upload-url')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 파일 업로드 주소'})
    @ApiBody({type: StoreApplicationFileUploadUrlDto})
    @ApiOkResponse({type: StoreApplicationFileUploadUrlResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyApplicationFileUploadUrl(
        @PassportActor() actor: Actor,
        @Param() param: StoreApplicationFileUploadUrlParamDto,
        @Body() dto: StoreApplicationFileUploadUrlDto,
    ): Promise<StoreApplicationFileUploadUrlResultDto> {
        return this.internalHttp.request<StoreApplicationFileUploadUrlResultDto>('user', 'POST', STORE_USER_INTERNAL_PATH.myApplicationFileUploadUrl(param.store_application_id), {actor, body: dto});
    }
}
