import {Module} from '@nestjs/common';
import {StoreController} from './controllers/store.controller.js';
import {StoreQueueController} from './controllers/store.controller.queue.js';

/**
 * 게이트웨이 업체 라우트 — `/api/v1/admin-service/store`(이용자 가드: 입점 신청 · 내 신청, 관리자 가드: 신청 관리 · 업체 관리). 전달 수단(TransportModule)은 전역이다.
 * - StoreController(controllers/store.controller.ts): 동기 경로 — 조회 · 업로드 주소
 * - StoreQueueController(controllers/store.controller.queue.ts): 큐 경로 — 신청 · 파일 · 승인 · 반려 · 수정 · 상태
 */
@Module({controllers: [StoreController, StoreQueueController]})
export class StoreModule {}
