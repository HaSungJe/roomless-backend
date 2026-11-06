import {Body, Controller, Get, HttpCode, Param, Post, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {StoreApplicationFileUploadUrlDto, StoreApplicationFileUploadUrlParamDto, StoreApplicationFileUploadUrlResultDto} from '@app/contracts/store/dto/store-application-file-upload-url.dto.js';
import {StoreMyApplicationListDto, StoreMyApplicationListResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import {StoreMyApplicationParamDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import {StoreService} from '../store.service.js';

/**
 * store 내부 HTTP 인바운드 어댑터 (이용자 입점 신청) — 게이트웨이의 동기 경로(내 신청 목록 · 상세 · 업체 정보 파일 업로드 주소)만 받는다(외부 비공개, Swagger 없음).
 * 로그인 이용자는 게이트웨이가 넘긴 actor 헤더에서 꺼낸다. 내부 토큰 검사는 전역 InternalAuthGuard 가 한다.
 */
@Controller('/internal/v1/user-service/store')
export class StoreController {
    /**
     * @param storeService store 비즈니스 로직
     */
    constructor(private readonly storeService: StoreService) {}

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
}
