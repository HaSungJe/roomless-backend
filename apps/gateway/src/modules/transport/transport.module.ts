import {Global, Module} from '@nestjs/common';
import {CommandStreamService} from './command-stream.service.js';
import {InternalHttpClient} from './internal-http.client.js';

/**
 * 게이트웨이 → 서비스 전달 수단 두 가지를 전역 제공한다.
 * - InternalHttpClient: 동기 경로 (내부 HTTP)
 * - CommandStreamService: 큐 경로 (RabbitMQ 발행 + 요청 단위 SSE)
 * 어느 라우트가 어느 경로를 타는지는 각 도메인 controller 가 정한다.
 */
@Global()
@Module({providers: [InternalHttpClient, CommandStreamService], exports: [InternalHttpClient, CommandStreamService]})
export class TransportModule {}
