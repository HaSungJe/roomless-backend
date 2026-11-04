import {Module} from '@nestjs/common';
import {ScheduleModule} from '@nestjs/schedule';
import {DatabaseModule} from '@app/database/database.module.js';
import {DoorStoreModule} from '@app/integration/door/door-store.module.js';
import {PaymentModule} from '@app/integration/payment/payment.module.js';
import {ReservationModule} from './reservation/reservation.module.js';
import {UserModule} from './user/user.module.js';

/**
 * scheduler 루트 모듈 — crontab 만 돈다. 들어오는 연결이 없어 APP_GUARD · MessagingModule · 컨트롤러가 없다.
 * - DatabaseModule: TypeORM(PostgreSQL) + JobLockService(여러 대여도 회차마다 1대만 실행)
 * - ScheduleModule: 도메인별 crontabs 폴더의 @Cron 을 돌린다 (앱마다 forRoot 1회)
 * - PaymentModule: 결제 포트(PAYMENT_GATEWAY, 토스) — 결제 대기 만료 조회 · 늦은 승인 재확인 · 환불
 * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis) — 이용 중 예약의 QR 을 호실의 현재 QR 로 맞춘다
 * - 기본 데이터 시드 · 마이그레이션은 DB 를 소유한 user-service 가 맡는다
 * 도메인: UserModule(탈퇴 자동처리) · ReservationModule(결제 대기 만료 · 늦은 승인 · 환불 · QR 맞추기)
 */
@Module({imports: [DatabaseModule, ScheduleModule.forRoot(), PaymentModule, DoorStoreModule, UserModule, ReservationModule]})
export class SchedulerModule {}
