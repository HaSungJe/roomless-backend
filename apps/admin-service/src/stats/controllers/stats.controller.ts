import {Controller, Get, HttpCode, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {StatsMineDto, StatsMineResultDto} from '@app/contracts/stats/dto/stats-mine.dto.js';
import {StatsDto, StatsResultDto} from '@app/contracts/stats/dto/stats.dto.js';
import {StatsService} from '../stats.service.js';

/**
 * 통계 내부 HTTP 컨트롤러(동기 경로 인바운드 어댑터) — 조회만이라 큐 컨트롤러가 없다. 가드는 게이트웨이(전체 = 관리자, 내 업체 = 매니저).
 */
@Controller('/internal/v1/admin-service/stats')
export class StatsController {
    /**
     * @param statsService 통계 service
     */
    constructor(private readonly statsService: StatsService) {}

    /**
     * 전체 통계 (총관리자 · 관리자)
     */
    @Get('/')
    @HttpCode(200)
    async getStats(@Query() query: StatsDto): Promise<StatsResultDto> {
        const dto = new StatsDto(query);
        return this.statsService.getStats(dto);
    }

    /**
     * 내 업체 통계 (업체 총관리자 · 업체 관리자)
     */
    @Get('/mine')
    @HttpCode(200)
    async getMyStats(@InternalActor('user_id') user_id: string, @Query() query: StatsMineDto): Promise<StatsMineResultDto> {
        const dto = new StatsMineDto(query);
        return this.statsService.getMyStats(user_id, dto);
    }
}
