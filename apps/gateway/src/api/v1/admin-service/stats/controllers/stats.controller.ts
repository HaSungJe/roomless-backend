import {Controller, Get, HttpCode, Query, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
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
import {StatsMineDto, StatsMineResultDto} from '@app/contracts/stats/dto/stats-mine.dto.js';
import {StatsDto, StatsResultDto} from '@app/contracts/stats/dto/stats.dto.js';
import {STATS_INTERNAL_PATH} from '@app/contracts/stats/stats.commands.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 통계 공개 API — 동기 경로(내부 HTTP → admin-service stats). 전체는 관리자 가드, 내 업체는 매니저 가드. 조회만이라 큐 컨트롤러가 없다.
 */
@ApiTags('통계')
@Controller('/api/v1/admin-service/stats')
export class StatsController {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 전체 통계 (총관리자 · 관리자) — 월 기간(기본 최근 3개월) · 결제 환경 · 업체 범위, 합계 · 월별 · 업체별
     */
    @Get('/')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '전체 통계'})
    @ApiOkResponse({type: StatsResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStats(@PassportActor() actor: Actor, @Query() query: StatsDto): Promise<StatsResultDto> {
        const dto = new StatsDto(query);
        return this.internalHttp.request<StatsResultDto>('admin', 'GET', STATS_INTERNAL_PATH.ALL, {actor, query: dto});
    }

    /**
     * 내 업체 통계 (업체 총관리자 · 업체 관리자) — 월 기간 · 결제 환경, 합계 · 월별
     */
    @Get('/mine')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 통계'})
    @ApiOkResponse({type: StatsMineResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyStats(@PassportActor() actor: Actor, @Query() query: StatsMineDto): Promise<StatsMineResultDto> {
        const dto = new StatsMineDto(query);
        return this.internalHttp.request<StatsMineResultDto>('admin', 'GET', STATS_INTERNAL_PATH.MINE, {actor, query: dto});
    }
}
