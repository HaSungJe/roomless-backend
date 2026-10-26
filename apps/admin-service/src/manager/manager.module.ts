import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {ManagerController} from './controllers/manager.controller.js';
import {ManagerQueueController} from './controllers/manager.controller.queue.js';
import {MANAGER_REPOSITORY} from './manager.symbols.js';
import {ManagerService} from './manager.service.js';
import {ManagerRepository} from './repositories/manager.repository.js';

/**
 * 매니저 도메인(총매니저 · 매니저 — 인증 · 계정 찾기 · 업체 관리자 계정 관리) — 인바운드 어댑터 2종이 같은 service 를 부른다.
 * - ManagerController(controllers/manager.controller.ts): 내부 HTTP (게이트웨이 동기 경로) — controllers 에 등록
 * - ManagerQueueController(controllers/manager.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로) — `@OnCommand` provider 라 providers 에 등록
 */
@Module({
    imports: [JwtModule.registerAsync({useFactory: () => ({secret: process.env.JWT_SECRET})})],
    controllers: [ManagerController],
    providers: [ManagerService, ManagerQueueController, {provide: MANAGER_REPOSITORY, useClass: ManagerRepository}],
})
export class ManagerModule {}
