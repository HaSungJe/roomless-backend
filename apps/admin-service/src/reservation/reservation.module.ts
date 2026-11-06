import {Module} from '@nestjs/common';
import {ReservationController} from './controllers/reservation.controller.js';
import {ReservationQueueController} from './controllers/reservation.controller.queue.js';
import {ReservationRepository} from './repositories/reservation.repository.js';
import {ReservationService} from './reservation.service.js';
import {RESERVATION_REPOSITORY} from './reservation.symbols.js';

/**
 * reservation 도메인 (매니저 예약) — 내 업체 예약 현황 · 업체 취소 · 호실 이동. SMS 포트(SMS_SENDER) · 문 정보 포트(DOOR_STORE)는 루트 모듈의 SmsModule · DoorStoreModule 이 전역으로 준다.
 * - ReservationController(controllers/reservation.controller.ts): 내부 HTTP — 업체 예약 현황
 * - ReservationQueueController(controllers/reservation.controller.queue.ts): RabbitMQ — 업체 취소 · 호실 이동 (`@OnCommand` provider 라 providers 에 등록)
 * 이용자 예약은 user-service reservation 이다(기능은 행위자로 서버를 고른다 — 사용자 결정 2026-11-07).
 */
@Module({controllers: [ReservationController], providers: [ReservationService, ReservationQueueController, {provide: RESERVATION_REPOSITORY, useClass: ReservationRepository}]})
export class ReservationModule {}
