import {Module} from '@nestjs/common';
import {MessagingModule} from '@app/messaging/messaging.module.js';
import {PassportJwtAuthModule} from './guards/passport.jwt.auth/passport.jwt.auth.module.js';
import {TransportModule} from './modules/transport/transport.module.js';
import {UserModule} from './api/v1/user/user.module.js';

/**
 * 게이트웨이 루트 모듈 — 유일한 외부 진입점.
 * DB 를 쓰지 않는다. 회원 상태 확인도 user-service 내부 HTTP 로 묻는다.
 * - MessagingModule.forGateway: 명령 발행 + 인스턴스 전용 결과 큐
 * - TransportModule: 동기(내부 HTTP) · 큐(RabbitMQ + SSE) 전달 수단
 * - PassportJwtAuthModule: JWT 전략 (guards/)
 */
@Module({imports: [MessagingModule.forGateway(), TransportModule, PassportJwtAuthModule, UserModule]})
export class GatewayModule {}
