import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {UserController} from './controllers/user.controller.js';
import {UserQueueController} from './controllers/user.controller.queue.js';
import {UserLeaveCleanupCrontab} from './crontabs/user-leave-cleanup.crontab.js';
import {UserRepository} from './repositories/user.repository.js';
import {UserService} from './user.service.js';
import {USER_REPOSITORY} from './user.symbols.js';

/**
 * 회원 도메인 — 인바운드 어댑터 3종이 같은 아웃바운드 포트(USER_REPOSITORY)를 쓴다.
 * - UserController(controllers/user.controller.ts): 내부 HTTP (게이트웨이 동기 경로) — controllers 에 등록
 * - UserQueueController(controllers/user.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로) — `@OnCommand` provider 라 providers 에 등록
 * - crontabs/: 스케줄 작업
 */
@Module({
    imports: [JwtModule.registerAsync({useFactory: () => ({secret: process.env.JWT_SECRET})})],
    controllers: [UserController],
    providers: [UserService, UserQueueController, UserLeaveCleanupCrontab, {provide: USER_REPOSITORY, useClass: UserRepository}],
})
export class UserModule {}
