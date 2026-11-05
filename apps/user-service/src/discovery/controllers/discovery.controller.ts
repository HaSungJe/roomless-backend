import {Controller, Get, HttpCode, Param, Query} from '@nestjs/common';
import {DiscoveryRoomGroupListParamDto, DiscoveryRoomGroupListResultDto} from '@app/contracts/discovery/dto/discovery-room-group-list.dto.js';
import {DiscoveryStoreDetailParamDto, DiscoveryStoreDetailResultDto} from '@app/contracts/discovery/dto/discovery-store-detail.dto.js';
import {DiscoveryStoreListDto, DiscoveryStoreListResultDto} from '@app/contracts/discovery/dto/discovery-store-list.dto.js';
import {DiscoveryService} from '../discovery.service.js';

/**
 * 업체 둘러보기 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로(조회)만 받는다(외부 비공개, Swagger 없음, actor 없음). 내부 토큰 검사는 전역 InternalAuthGuard 가 한다.
 */
@Controller('/internal/v1/user-service/discovery')
export class DiscoveryController {
    /**
     * @param discoveryService discovery service
     */
    constructor(private readonly discoveryService: DiscoveryService) {}

    /**
     * 반경 업체 조회 (인증 없음)
     */
    @Get('/store')
    @HttpCode(200)
    async getStores(@Query() query: DiscoveryStoreListDto): Promise<DiscoveryStoreListResultDto> {
        const dto = new DiscoveryStoreListDto(query);
        return this.discoveryService.getStores(dto);
    }

    /**
     * 업체 상세 (인증 없음)
     */
    @Get('/store/:store_id')
    @HttpCode(200)
    async getStore(@Param() param: DiscoveryStoreDetailParamDto): Promise<DiscoveryStoreDetailResultDto> {
        return this.discoveryService.getStore(param.store_id);
    }

    /**
     * 업체의 객실 그룹 목록 (인증 없음)
     */
    @Get('/store/:store_id/room-group')
    @HttpCode(200)
    async getRoomGroups(@Param() param: DiscoveryRoomGroupListParamDto): Promise<DiscoveryRoomGroupListResultDto> {
        return this.discoveryService.getRoomGroups(param.store_id);
    }
}
