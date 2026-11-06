import {Module} from '@nestjs/common';
import {ReservationController} from './controllers/reservation.controller.js';
import {ReservationQueueController} from './controllers/reservation.controller.queue.js';

/**
 * 업체 예약 라우트 모듈(/api/v1/admin-service/reservation — 매니저 가드) — 동기(ReservationController) · 큐(ReservationQueueController) 컨트롤러를 [동기, 큐] 순으로 등록한다.
 * 이용자 예약은 /api/v1/user-service/reservation 이다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
@Module({controllers: [ReservationController, ReservationQueueController]})
export class ReservationModule {}
