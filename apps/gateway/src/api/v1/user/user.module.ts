import {Module} from '@nestjs/common';
import {UserController} from './user.controller.js';
import {UserQueueController} from './user.controller.queue.js';

/**
 * 게이트웨이 회원 라우트. 전달 수단(TransportModule)은 전역이라 따로 import 하지 않는다.
 * - UserController(user.controller.ts): 동기 경로 — 내부 HTTP
 * - UserQueueController(user.controller.queue.ts): 큐 경로 — RabbitMQ 명령 + 요청 단위 SSE
 * 두 컨트롤러는 같은 경로 접두(`/api/v1/user`)를 쓴다.
 */
@Module({controllers: [UserController, UserQueueController]})
export class UserModule {}
