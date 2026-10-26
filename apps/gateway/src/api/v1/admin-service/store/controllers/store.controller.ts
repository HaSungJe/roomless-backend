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
import {StoreApplicationDetailParamDto, StoreApplicationDetailResultDto} from '@app/contracts/store/dto/store-application-detail.dto.js';
import {StoreApplicationFileUploadUrlDto, StoreApplicationFileUploadUrlParamDto, StoreApplicationFileUploadUrlResultDto} from '@app/contracts/store/dto/store-application-file-upload-url.dto.js';
import {StoreApplicationListDto, StoreApplicationListResultDto} from '@app/contracts/store/dto/store-application-list.dto.js';
import {StoreDetailParamDto, StoreDetailResultDto} from '@app/contracts/store/dto/store-detail.dto.js';
import {StoreListDto, StoreListResultDto} from '@app/contracts/store/dto/store-list.dto.js';
import {StoreMineFileUploadUrlDto, StoreMineFileUploadUrlResultDto} from '@app/contracts/store/dto/store-mine-file-upload-url.dto.js';
import {StoreMineUnavailablePeriodListDto, StoreMineUnavailablePeriodListResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period-list.dto.js';
import {StoreMineResultDto} from '@app/contracts/store/dto/store-mine.dto.js';
import {StoreMyApplicationListDto, StoreMyApplicationListResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import {StoreMyApplicationParamDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import {STORE_INTERNAL_PATH} from '@app/contracts/store/store.commands.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 업체 공개 API — 동기 경로(내부 HTTP → admin-service store 도메인). 조회 · 업로드 주소.
 * 내 업체 라우트(/mine…)는 매니저 가드, 신청자 라우트(/application/mine…)는 이용자 가드, 나머지는 관리자 가드. `/mine…` · `/application…` 를 `/:store_id` 보다 먼저 선언한다.
 * 큐 경로(신청 · 파일 · 승인 · 반려 · 수정 · 상태 · 내 업체 설정)는 같은 경로 접두의 store.controller.queue.ts(StoreQueueController)에 둔다.
 */
@ApiTags('업체')
@Controller('/api/v1/admin-service/store')
export class StoreController {
    /**
     * @param internalHttp 동기 경로 — admin-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 내 업체 상세 (업체 관리자) — 업체 정보 · 업체코드 · 영업 설정 · 요일별 영업시간 · 브레이크타임 · 업체 정보 파일 열람 주소
     */
    @Get('/mine')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 상세'})
    @ApiOkResponse({type: StoreMineResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyStore(@PassportActor() actor: Actor): Promise<StoreMineResultDto> {
        return this.internalHttp.request<StoreMineResultDto>('admin', 'GET', STORE_INTERNAL_PATH.MINE, {actor});
    }

    /**
     * 내 업체 사진 업로드 주소 (업체 관리자) — 받은 주소로 같은 Content-Type 헤더로 PUT 한 뒤 file_key 로 사진을 등록한다
     */
    @Post('/mine/file/upload-url')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 사진 업로드 주소'})
    @ApiBody({type: StoreMineFileUploadUrlDto})
    @ApiOkResponse({type: StoreMineFileUploadUrlResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyStoreFileUploadUrl(@PassportActor() actor: Actor, @Body() dto: StoreMineFileUploadUrlDto): Promise<StoreMineFileUploadUrlResultDto> {
        return this.internalHttp.request<StoreMineFileUploadUrlResultDto>('admin', 'POST', STORE_INTERNAL_PATH.MINE_FILE_UPLOAD_URL, {actor, body: dto});
    }

    /**
     * 내 업체 일시 예약불가 목록 (업체 관리자) — 끝나지 않은 것만, 시작 순
     */
    @Get('/mine/unavailable-period')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 일시 예약불가 목록'})
    @ApiOkResponse({type: StoreMineUnavailablePeriodListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyStoreUnavailablePeriodList(@PassportActor() actor: Actor, @Query() query: StoreMineUnavailablePeriodListDto): Promise<StoreMineUnavailablePeriodListResultDto> {
        const dto = new StoreMineUnavailablePeriodListDto(query);
        return this.internalHttp.request<StoreMineUnavailablePeriodListResultDto>('admin', 'GET', STORE_INTERNAL_PATH.MINE_UNAVAILABLE_PERIOD_LIST, {actor, query: dto});
    }

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
        return this.internalHttp.request<StoreMyApplicationListResultDto>('admin', 'GET', STORE_INTERNAL_PATH.MY_APPLICATION_LIST, {actor, query: dto});
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
        return this.internalHttp.request<StoreMyApplicationResultDto>('admin', 'GET', STORE_INTERNAL_PATH.myApplication(param.store_application_id), {actor});
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
        return this.internalHttp.request<StoreApplicationFileUploadUrlResultDto>('admin', 'POST', STORE_INTERNAL_PATH.myApplicationFileUploadUrl(param.store_application_id), {actor, body: dto});
    }

    /**
     * 입점 신청 목록 (총관리자)
     */
    @Get('/application')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 신청 목록'})
    @ApiOkResponse({type: StoreApplicationListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getApplicationList(@PassportActor() actor: Actor, @Query() query: StoreApplicationListDto): Promise<StoreApplicationListResultDto> {
        const dto = new StoreApplicationListDto(query);
        return this.internalHttp.request<StoreApplicationListResultDto>('admin', 'GET', STORE_INTERNAL_PATH.APPLICATION_LIST, {actor, query: dto});
    }

    /**
     * 입점 신청 상세 (총관리자) — 신청자 · 업체 정보 파일 열람 주소 포함
     */
    @Get('/application/:store_application_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 신청 상세'})
    @ApiOkResponse({type: StoreApplicationDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getApplication(@PassportActor() actor: Actor, @Param() param: StoreApplicationDetailParamDto): Promise<StoreApplicationDetailResultDto> {
        return this.internalHttp.request<StoreApplicationDetailResultDto>('admin', 'GET', STORE_INTERNAL_PATH.application(param.store_application_id), {actor});
    }

    /**
     * 업체 목록 (총관리자)
     */
    @Get('/')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 목록'})
    @ApiOkResponse({type: StoreListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStoreList(@PassportActor() actor: Actor, @Query() query: StoreListDto): Promise<StoreListResultDto> {
        const dto = new StoreListDto(query);
        return this.internalHttp.request<StoreListResultDto>('admin', 'GET', STORE_INTERNAL_PATH.STORE_LIST, {actor, query: dto});
    }

    /**
     * 업체 상세 (총관리자) — 업체 정보 파일 열람 주소 포함
     */
    @Get('/:store_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 상세'})
    @ApiOkResponse({type: StoreDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStore(@PassportActor() actor: Actor, @Param() param: StoreDetailParamDto): Promise<StoreDetailResultDto> {
        return this.internalHttp.request<StoreDetailResultDto>('admin', 'GET', STORE_INTERNAL_PATH.store(param.store_id), {actor});
    }
}
