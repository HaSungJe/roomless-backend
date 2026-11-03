import {Module} from '@nestjs/common';
import {ReservationPaymentExpireCrontab} from './crontabs/reservation-payment-expire.crontab.js';
import {ReservationPaymentRecheckCrontab} from './crontabs/reservation-payment-recheck.crontab.js';
import {ReservationRefundCrontab} from './crontabs/reservation-refund.crontab.js';
import {ReservationRepository} from './repositories/reservation.repository.js';
import {RESERVATION_REPOSITORY} from './reservation.symbols.js';

/**
 * scheduler 예약 도메인 — crontab 3개(결제 대기 만료 · 늦은 승인 재확인 · 환불). 결제 포트(PAYMENT_GATEWAY)는 루트 모듈의 PaymentModule 이 전역으로 준다.
 */
@Module({providers: [ReservationPaymentExpireCrontab, ReservationPaymentRecheckCrontab, ReservationRefundCrontab, {provide: RESERVATION_REPOSITORY, useClass: ReservationRepository}]})
export class ReservationModule {}
