import {Module} from '@nestjs/common';
import {StatsController} from './controllers/stats.controller.js';
import {StatsRepository} from './repositories/stats.repository.js';
import {STATS_REPOSITORY} from './stats.symbols.js';
import {StatsService} from './stats.service.js';

/**
 * 통계 도메인(admin-service — 총관리자 · 관리자 전체, 업체 관리자 내 업체) — 조회만이라 내부 HTTP 컨트롤러 하나.
 */
@Module({controllers: [StatsController], providers: [StatsService, {provide: STATS_REPOSITORY, useClass: StatsRepository}]})
export class StatsModule {}
