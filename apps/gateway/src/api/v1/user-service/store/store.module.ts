import {Module} from '@nestjs/common';
import {StoreController} from './controllers/store.controller.js';
import {StoreQueueController} from './controllers/store.controller.queue.js';

/**
 * 입점 신청 라우트 모듈(/api/v1/user-service/store — 이용자 가드) — 동기(StoreController) · 큐(StoreQueueController) 컨트롤러를 [동기, 큐] 순으로 등록한다.
 * 총관리자의 신청 관리는 /api/v1/admin-service/store 다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
@Module({controllers: [StoreController, StoreQueueController]})
export class StoreModule {}
