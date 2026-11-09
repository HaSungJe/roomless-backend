import {Module} from '@nestjs/common';
import {ApiLogMiddleware} from './api-log.middleware.js';
import {ApiLogWriter} from './api-log.writer.js';

/**
 * API 로그(게이트웨이 인프라) — 기록 미들웨어 + 로그 전용 DB 적재. 미들웨어는 GatewayModule.configure 가 모든 경로에 건다.
 */
@Module({providers: [ApiLogWriter, ApiLogMiddleware], exports: [ApiLogMiddleware]})
export class ApiLogModule {}
