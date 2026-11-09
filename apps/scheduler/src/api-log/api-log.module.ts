import {Module} from '@nestjs/common';
import {API_LOG_REPOSITORY} from './api-log.symbols.js';
import {ApiLogPartitionCrontab} from './crontabs/api-log-partition.crontab.js';
import {ApiLogRepository} from './repositories/api-log.repository.js';

/**
 * API 로그 도메인(scheduler) — t_api_log 월 파티션 미리 만들기 crontab.
 */
@Module({providers: [ApiLogPartitionCrontab, {provide: API_LOG_REPOSITORY, useClass: ApiLogRepository}]})
export class ApiLogModule {}
