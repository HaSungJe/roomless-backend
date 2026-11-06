import {Module} from '@nestjs/common';
import {StoreController} from './controllers/store.controller.js';
import {StoreQueueController} from './controllers/store.controller.queue.js';
import {StoreRepository} from './repositories/store.repository.js';
import {StoreService} from './store.service.js';
import {STORE_REPOSITORY} from './store.symbols.js';

/**
 * store 도메인 (이용자 입점 신청) — 인바운드 어댑터 2종이 같은 service 를 부른다. 파일 저장소 포트(STORAGE_GATEWAY)는 루트 모듈의 StorageModule 이 전역으로 준다.
 * - StoreController(controllers/store.controller.ts): 내부 HTTP — 내 신청 목록 · 상세 · 업체 정보 파일 업로드 주소
 * - StoreQueueController(controllers/store.controller.queue.ts): RabbitMQ — 신청 · 취소 · 파일 등록 · 삭제 (`@OnCommand` provider 라 providers 에 등록)
 * 총관리자의 신청 관리 · 승인 · 반려는 admin-service store 다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
@Module({controllers: [StoreController], providers: [StoreService, StoreQueueController, {provide: STORE_REPOSITORY, useClass: StoreRepository}]})
export class StoreModule {}
