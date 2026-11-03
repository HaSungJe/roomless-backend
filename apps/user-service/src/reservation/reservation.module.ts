import {Module} from '@nestjs/common';
import {ReservationController} from './controllers/reservation.controller.js';
import {ReservationQueueController} from './controllers/reservation.controller.queue.js';
import {ReservationRepository} from './repositories/reservation.repository.js';
import {ReservationService} from './reservation.service.js';
import {RESERVATION_REPOSITORY} from './reservation.symbols.js';

/**
 * 예약 도메인 — 결제 포트(PAYMENT_GATEWAY) · SMS 포트(SMS_SENDER)는 루트 모듈의 PaymentModule · SmsModule 이 전역으로 준다.
 * - ReservationController(controllers/reservation.controller.ts): 내부 HTTP — 예약 가능 시간 · 내 예약 · 업체 현황
 * - ReservationQueueController(controllers/reservation.controller.queue.ts): RabbitMQ `user.reservation.*` — HTTP 컨트롤러가 아니라 provider
 */
@Module({controllers: [ReservationController], providers: [ReservationService, ReservationQueueController, {provide: RESERVATION_REPOSITORY, useClass: ReservationRepository}]})
export class ReservationModule {}
