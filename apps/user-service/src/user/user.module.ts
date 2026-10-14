import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {UserLeaveCleanupCrontab} from './crontabs/user-leave-cleanup.crontab.js';
import {UserRepository} from './repositories/user.repository.js';
import {UserController} from './user.controller.js';
import {UserCommandHandler} from './user.handler.js';
import {UserService} from './user.service.js';
import {USER_REPOSITORY} from './user.symbols.js';

/**
 * 회원 도메인 — 인바운드 어댑터 3종이 같은 아웃바운드 포트(USER_REPOSITORY)를 쓴다.
 * - UserController: 내부 HTTP (게이트웨이 동기 경로)
 * - UserCommandHandler: RabbitMQ (게이트웨이 큐 경로)
 * - crontabs/: 스케줄 작업
 */
@Module({
    imports: [JwtModule.registerAsync({useFactory: () => ({secret: process.env.JWT_SECRET})})],
    controllers: [UserController],
    providers: [UserService, UserCommandHandler, UserLeaveCleanupCrontab, {provide: USER_REPOSITORY, useClass: UserRepository}],
})
export class UserModule {}
