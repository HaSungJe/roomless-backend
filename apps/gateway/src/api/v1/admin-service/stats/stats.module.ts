import {Module} from '@nestjs/common';
import {StatsController} from './controllers/stats.controller.js';

/**
 * 게이트웨이 통계 라우트 — `/api/v1/admin-service/stats`(전체 — 관리자 가드, /mine — 매니저 가드). 조회만이라 동기 컨트롤러 하나. 전달 수단(TransportModule)은 전역이다.
 */
@Module({controllers: [StatsController]})
export class StatsModule {}
