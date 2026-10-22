import 'dotenv/config';
import {ValidationPipe} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {AdminServiceModule} from './admin-service.module.js';

/**
 * admin-service 부트스트랩 — 게이트웨이만 접근한다(매니저 · 관리자 도메인).
 * ADMIN_SERVICE_HOST 기본값 127.0.0.1 로 같은 머신의 게이트웨이만 닿게 하고, Docker 에서는 0.0.0.0 으로 열되 포트를 공개하지 않는다.
 * 전역 예외 필터 → 전역 ValidationPipe → 종료 훅(DB · RabbitMQ 연결 정리) → listen.
 */
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AdminServiceModule);

    app.useGlobalFilters(new CustomErrorFilter());
    app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
    app.enableShutdownHooks();

    await app.listen(process.env.ADMIN_SERVICE_PORT ?? 4002, process.env.ADMIN_SERVICE_HOST || '127.0.0.1');
}

await bootstrap();
