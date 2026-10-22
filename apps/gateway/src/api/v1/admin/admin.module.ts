import {Module} from '@nestjs/common';
import {AdminController} from './controllers/admin.controller.js';
import {AdminQueueController} from './controllers/admin.controller.queue.js';

/**
 * 게이트웨이 관리자 그룹(총관리자 · 관리자) 라우트 — `/api/v1/admin`. 전달 수단(TransportModule)은 전역이다.
 * - AdminController(controllers/admin.controller.ts): 동기 경로 — 로그인 · 토큰 재발급
 * - AdminQueueController(controllers/admin.controller.queue.ts): 큐 경로 — 비밀번호 변경
 */
@Module({controllers: [AdminController, AdminQueueController]})
export class AdminModule {}
