import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {UserController} from './controllers/user.controller.js';
import {UserQueueController} from './controllers/user.controller.queue.js';
import {UserRepository} from './repositories/user.repository.js';
import {UserService} from './user.service.js';
import {USER_REPOSITORY} from './user.symbols.js';

/**
 * 회원 도메인 — 인바운드 어댑터 2종이 같은 service 를 부른다(crontab 은 scheduler 앱).
 * - UserController(controllers/user.controller.ts): 내부 HTTP (게이트웨이 동기 경로) — controllers 에 등록
 * - UserQueueController(controllers/user.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로) — `@OnCommand` provider 라 providers 에 등록
 */
@Module({
    imports: [JwtModule.registerAsync({useFactory: () => ({secret: process.env.JWT_SECRET})})],
    controllers: [UserController],
    providers: [UserService, UserQueueController, {provide: USER_REPOSITORY, useClass: UserRepository}],
})
export class UserModule {}
