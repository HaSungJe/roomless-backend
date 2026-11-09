import {Module} from '@nestjs/common';
import {UserController} from './controllers/user.controller.js';
import {UserQueueController} from './controllers/user.controller.queue.js';

/**
 * 게이트웨이 이용자 관리 라우트(총관리자 · 관리자) — `/api/v1/admin-service/user`. 전달 수단(TransportModule)은 전역이다.
 * - UserController(controllers/user.controller.ts): 동기 경로 — 목록 · 상세 · 예약 이력
 * - UserQueueController(controllers/user.controller.queue.ts): 큐 경로 — 이용 제한 · 해제
 * 이용자 본인 라우트(/api/v1/user-service/user)는 user-service/user/user.module.ts — 루트 모듈은 이 모듈을 AdminUserModule 로 들인다.
 */
@Module({controllers: [UserController, UserQueueController]})
export class UserModule {}
