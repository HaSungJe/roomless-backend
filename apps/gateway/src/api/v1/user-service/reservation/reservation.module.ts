import {Module} from '@nestjs/common';
import {ReservationController} from './controllers/reservation.controller.js';
import {ReservationQueueController} from './controllers/reservation.controller.queue.js';

/**
 * 게이트웨이 예약 라우트 — `/api/v1/user-service/reservation`. 전달 수단(TransportModule)은 전역이다.
 * - ReservationController: 동기 경로 — 예약 가능 시간(로그인 없음) · 내 예약 · 내 예약 QR(이용자)
 * - ReservationQueueController: 큐 경로 — 예약 생성 · 결제 확인 · 취소(이용자)
 */
@Module({controllers: [ReservationController, ReservationQueueController]})
export class ReservationModule {}
