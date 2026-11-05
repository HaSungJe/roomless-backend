import {Controller, Get, HttpCode, Param, Query} from '@nestjs/common';
import {ApiBadRequestResponse, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import {DISCOVERY_INTERNAL_PATH} from '@app/contracts/discovery/discovery.commands.js';
import {DiscoveryRoomGroupListParamDto, DiscoveryRoomGroupListResultDto} from '@app/contracts/discovery/dto/discovery-room-group-list.dto.js';
import {DiscoveryStoreDetailParamDto, DiscoveryStoreDetailResultDto} from '@app/contracts/discovery/dto/discovery-store-detail.dto.js';
import {DiscoveryStoreListDto, DiscoveryStoreListResultDto} from '@app/contracts/discovery/dto/discovery-store-list.dto.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 업체 둘러보기 공개 API — 동기 경로(내부 HTTP → user-service), 로그인 없음(이용자 진입 동선). 쓰기(큐)는 없다.
 * 시간대별 예약 가능한 호수는 예약 가능 시간 API(`/api/v1/user-service/reservation/availability` — room_group_id 필터)로 본다.
 */
@ApiTags('업체 둘러보기')
@Controller('/api/v1/user-service/discovery')
export class DiscoveryController {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 반경 업체 조회 (로그인 없음) — 지도 중심(처음엔 내 위치) + 반경 5 · 10 · 20 · 50km, 가까운 순 최대 300개. 지도 마커 · 목록 카드 공용
     */
    @Get('/store')
    @HttpCode(200)
    @ApiOperation({summary: '반경 업체 조회'})
    @ApiOkResponse({type: DiscoveryStoreListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStores(@Query() query: DiscoveryStoreListDto): Promise<DiscoveryStoreListResultDto> {
        const dto = new DiscoveryStoreListDto(query);
        return this.internalHttp.request<DiscoveryStoreListResultDto>('user', 'GET', DISCOVERY_INTERNAL_PATH.STORE_LIST, {query: dto});
    }

    /**
     * 업체 상세 (로그인 없음) — 소개 · 사진 · 연락처 · 영업시간 · 브레이크타임 · 판매 중인 상품 설정 · 환불 규정
     */
    @Get('/store/:store_id')
    @HttpCode(200)
    @ApiOperation({summary: '업체 상세'})
    @ApiOkResponse({type: DiscoveryStoreDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStore(@Param() param: DiscoveryStoreDetailParamDto): Promise<DiscoveryStoreDetailResultDto> {
        return this.internalHttp.request<DiscoveryStoreDetailResultDto>('user', 'GET', DISCOVERY_INTERNAL_PATH.storeDetail(param.store_id));
    }

    /**
     * 업체의 객실 그룹 목록 (로그인 없음) — 그룹명 순, 사진 · 상세정보 · 호실 수 · 판매 중인 상품(기본 요금 · 남은 기간 가격)
     */
    @Get('/store/:store_id/room-group')
    @HttpCode(200)
    @ApiOperation({summary: '업체의 객실 그룹 목록'})
    @ApiOkResponse({type: DiscoveryRoomGroupListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getRoomGroups(@Param() param: DiscoveryRoomGroupListParamDto): Promise<DiscoveryRoomGroupListResultDto> {
        return this.internalHttp.request<DiscoveryRoomGroupListResultDto>('user', 'GET', DISCOVERY_INTERNAL_PATH.roomGroupList(param.store_id));
    }
}
