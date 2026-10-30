import {Module} from '@nestjs/common';
import {RoomController} from './controllers/room.controller.js';
import {RoomQueueController} from './controllers/room.controller.queue.js';
import {RoomRepository} from './repositories/room.repository.js';
import {ROOM_REPOSITORY} from './room.symbols.js';
import {RoomService} from './room.service.js';

/**
 * room 도메인(업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 기간 가격 · 호실) — 인바운드 어댑터 2종이 같은 service 를 부른다.
 * - RoomController(controllers/room.controller.ts): 내부 HTTP (게이트웨이 동기 경로 — 조회 · 업로드 주소) — controllers 에 등록
 * - RoomQueueController(controllers/room.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로 — 쓰기) — `@OnCommand` provider 라 providers 에 등록
 * 파일 저장소(STORAGE_GATEWAY) 포트는 루트 모듈의 전역 StorageModule 이 준다.
 */
@Module({controllers: [RoomController], providers: [RoomService, RoomQueueController, {provide: ROOM_REPOSITORY, useClass: RoomRepository}]})
export class RoomModule {}
