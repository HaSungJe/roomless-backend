import {Module} from '@nestjs/common';
import {RoomController} from './controllers/room.controller.js';
import {RoomQueueController} from './controllers/room.controller.queue.js';

/**
 * 게이트웨이 객실 관리 라우트 — `/api/v1/admin-service/room`(매니저 가드 — 업체 총관리자 · 업체 관리자, 내 업체만). 전달 수단(TransportModule)은 전역이다.
 * - RoomController(controllers/room.controller.ts): 동기 경로 — 업체 상품 설정 · 객실 그룹 · 기간 가격 · 호실 조회, 그룹 사진 업로드 주소
 * - RoomQueueController(controllers/room.controller.queue.ts): 큐 경로 — 업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 기간 가격 · 호실 쓰기 · 호실 상태
 */
@Module({controllers: [RoomController, RoomQueueController]})
export class RoomModule {}
