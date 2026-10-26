import {Body, Controller, Get, HttpCode, Param, Post, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
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
import {StoreService} from '../store.service.js';

/**
 * store 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로만 받는다(외부 비공개, Swagger 없음).
 * `/mine…` · `/application…` 라우트를 `/:store_id` 보다 먼저 선언한다(같은 단 수의 정적 경로가 먼저 맞아야 한다).
 */
@Controller('/internal/v1/admin-service/store')
export class StoreController {
    /**
     * @param storeService store service
     */
    constructor(private readonly storeService: StoreService) {}

    /**
     * 내 업체 상세 (업체 관리자)
     */
    @Get('/mine')
    @HttpCode(200)
    async getMyStore(@InternalActor('user_id') user_id: string): Promise<StoreMineResultDto> {
        return this.storeService.getMyStore(user_id);
    }

    /**
     * 내 업체 사진 업로드 주소 (업체 관리자)
     */
    @Post('/mine/file/upload-url')
    @HttpCode(200)
    async createMyStoreFileUploadUrl(@InternalActor('user_id') user_id: string, @Body() dto: StoreMineFileUploadUrlDto): Promise<StoreMineFileUploadUrlResultDto> {
        return this.storeService.createMyStoreFileUploadUrl(user_id, dto);
    }

    /**
     * 내 업체 일시 예약불가 목록 (업체 관리자)
     */
    @Get('/mine/unavailable-period')
    @HttpCode(200)
    async getMyStoreUnavailablePeriodList(@InternalActor('user_id') user_id: string, @Query() query: StoreMineUnavailablePeriodListDto): Promise<StoreMineUnavailablePeriodListResultDto> {
        const dto = new StoreMineUnavailablePeriodListDto(query);
        return this.storeService.getMyStoreUnavailablePeriodList(user_id, dto);
    }

    /**
     * 내 입점 신청 목록
     */
    @Get('/application/mine')
    @HttpCode(200)
    async getMyApplicationList(@InternalActor('user_id') user_id: string, @Query() query: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {
        const dto = new StoreMyApplicationListDto(query);
        return this.storeService.getMyApplicationList(user_id, dto);
    }

    /**
     * 내 입점 신청 상세
     */
    @Get('/application/mine/:store_application_id')
    @HttpCode(200)
    async getMyApplication(@InternalActor('user_id') user_id: string, @Param() param: StoreMyApplicationParamDto): Promise<StoreMyApplicationResultDto> {
        return this.storeService.getMyApplication(user_id, param.store_application_id);
    }

    /**
     * 업체 정보 파일 업로드 주소
     */
    @Post('/application/mine/:store_application_id/file/upload-url')
    @HttpCode(200)
    async createMyApplicationFileUploadUrl(
        @InternalActor('user_id') user_id: string,
        @Param() param: StoreApplicationFileUploadUrlParamDto,
        @Body() dto: StoreApplicationFileUploadUrlDto,
    ): Promise<StoreApplicationFileUploadUrlResultDto> {
        return this.storeService.createMyApplicationFileUploadUrl(user_id, param.store_application_id, dto);
    }

    /**
     * 입점 신청 목록 (총관리자)
     */
    @Get('/application')
    @HttpCode(200)
    async getApplicationList(@Query() query: StoreApplicationListDto): Promise<StoreApplicationListResultDto> {
        const dto = new StoreApplicationListDto(query);
        return this.storeService.getApplicationList(dto);
    }

    /**
     * 입점 신청 상세 (총관리자)
     */
    @Get('/application/:store_application_id')
    @HttpCode(200)
    async getApplication(@Param() param: StoreApplicationDetailParamDto): Promise<StoreApplicationDetailResultDto> {
        return this.storeService.getApplication(param.store_application_id);
    }

    /**
     * 업체 목록 (총관리자)
     */
    @Get('/')
    @HttpCode(200)
    async getStoreList(@Query() query: StoreListDto): Promise<StoreListResultDto> {
        const dto = new StoreListDto(query);
        return this.storeService.getStoreList(dto);
    }

    /**
     * 업체 상세 (총관리자)
     */
    @Get('/:store_id')
    @HttpCode(200)
    async getStore(@Param() param: StoreDetailParamDto): Promise<StoreDetailResultDto> {
        return this.storeService.getStore(param.store_id);
    }
}
