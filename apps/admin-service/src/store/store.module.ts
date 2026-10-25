import {Module} from '@nestjs/common';
import {StoreController} from './controllers/store.controller.js';
import {StoreQueueController} from './controllers/store.controller.queue.js';
import {StoreRepository} from './repositories/store.repository.js';
import {STORE_REPOSITORY} from './store.symbols.js';
import {StoreService} from './store.service.js';

/**
 * store 도메인(업체 · 입점 신청 · 업체 정보 파일) — 인바운드 어댑터 2종이 같은 service 를 부른다.
 * - StoreController(controllers/store.controller.ts): 내부 HTTP (게이트웨이 동기 경로) — controllers 에 등록
 * - StoreQueueController(controllers/store.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로) — `@OnCommand` provider 라 providers 에 등록
 * 파일 저장소(STORAGE_GATEWAY) · SMS(SMS_SENDER) 포트는 루트 모듈의 전역 모듈이 준다.
 */
@Module({controllers: [StoreController], providers: [StoreService, StoreQueueController, {provide: STORE_REPOSITORY, useClass: StoreRepository}]})
export class StoreModule {}
