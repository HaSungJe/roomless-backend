import 'dotenv/config';
import {ValidationPipe} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import type {NestExpressApplication} from '@nestjs/platform-express';
import {DocumentBuilder, SwaggerModule} from '@nestjs/swagger';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {buildCorsOptions} from './config/cors.config.js';
import {parseTrustProxy} from './config/trust-proxy.config.js';
import {GatewayModule} from './gateway.module.js';

/**
 * 게이트웨이 부트스트랩 — 클라이언트(Next.js)가 붙는 유일한 서버(Docker 에서는 nginx 로드밸런서 뒤에 여러 대).
 * trust proxy(TRUST_PROXY — 실제 클라이언트 IP) → 전역 예외 필터 → 전역 ValidationPipe → CORS(CORS_ORIGINS 의 프론트 주소만) → Swagger → 종료 훅 → listen.
 */
async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(GatewayModule);

    const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
    if (trustProxy !== null) app.set('trust proxy', trustProxy);
    app.useGlobalFilters(new CustomErrorFilter());
    app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
    app.enableCors(buildCorsOptions());

    const swaggerConfig = new DocumentBuilder()
        .setTitle(process.env.SWAGGER_TITLE || 'Roomless API')
        .setDescription('큐 경로 API 는 text/event-stream 으로 응답한다 — event: accepted → done | failed | pending')
        .addBearerAuth()
        .build();
    SwaggerModule.setup(process.env.SWAGGER_PATH || 'swagger', app, SwaggerModule.createDocument(app, swaggerConfig));

    app.enableShutdownHooks();
    await app.listen(process.env.GATEWAY_PORT ?? 3000);
}

await bootstrap();
