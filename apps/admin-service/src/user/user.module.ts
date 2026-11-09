import {Module} from '@nestjs/common';
import {UserController} from './controllers/user.controller.js';
import {UserQueueController} from './controllers/user.controller.queue.js';
import {UserRepository} from './repositories/user.repository.js';
import {USER_REPOSITORY} from './user.symbols.js';
import {UserService} from './user.service.js';

/**
 * 이용자 관리 도메인(admin-service — 총관리자 · 관리자) — 인바운드 어댑터 2종이 같은 service 를 부른다.
 * - UserController(controllers/user.controller.ts): 내부 HTTP (게이트웨이 동기 경로) — controllers 에 등록
 * - UserQueueController(controllers/user.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로) — `@OnCommand` provider 라 providers 에 등록
 */
@Module({controllers: [UserController], providers: [UserService, UserQueueController, {provide: USER_REPOSITORY, useClass: UserRepository}]})
export class UserModule {}
