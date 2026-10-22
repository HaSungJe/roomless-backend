import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {ADMIN_REPOSITORY} from './admin.symbols.js';
import {AdminService} from './admin.service.js';
import {AdminController} from './controllers/admin.controller.js';
import {AdminQueueController} from './controllers/admin.controller.queue.js';
import {AdminRepository} from './repositories/admin.repository.js';

/**
 * 관리자 도메인(총관리자 · 관리자) — 인바운드 어댑터 2종이 같은 service 를 부른다.
 * - AdminController(controllers/admin.controller.ts): 내부 HTTP (게이트웨이 동기 경로) — controllers 에 등록
 * - AdminQueueController(controllers/admin.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로) — `@OnCommand` provider 라 providers 에 등록
 */
@Module({
    imports: [JwtModule.registerAsync({useFactory: () => ({secret: process.env.JWT_SECRET})})],
    controllers: [AdminController],
    providers: [AdminService, AdminQueueController, {provide: ADMIN_REPOSITORY, useClass: AdminRepository}],
})
export class AdminModule {}
