import {Module} from '@nestjs/common';
import {ScheduleModule} from '@nestjs/schedule';
import {DatabaseModule} from '@app/database/database.module.js';
import {DoorStoreModule} from '@app/integration/door/door-store.module.js';
import {PaymentModule} from '@app/integration/payment/payment.module.js';
import {SmsModule} from '@app/integration/sms/sms.module.js';
import {ApiLogModule} from './api-log/api-log.module.js';
import {ReservationModule} from './reservation/reservation.module.js';
import {UserModule} from './user/user.module.js';

/**
 * scheduler 루트 모듈 — crontab 만 돈다. 들어오는 연결이 없어 APP_GUARD · MessagingModule · 컨트롤러가 없다.
 * - DatabaseModule: TypeORM(PostgreSQL) + JobLockService(여러 대여도 회차마다 1대만 실행)
 * - ScheduleModule: 도메인별 crontabs 폴더의 @Cron 을 돌린다 (앱마다 forRoot 1회)
 * - PaymentModule: 결제 포트(PAYMENT_GATEWAY, 토스) — 결제 대기 만료 조회 · 늦은 승인 재확인 · 환불
 * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis) — 이용 시작 · 이용 중 예약의 QR 을 호실의 현재 QR 로 맞춘다
 * - SmsModule: SMS 발송 포트(SMS_SENDER, Amazon SNS) — 이용 시작 5분 전 QR 확인 링크
 * - 기본 데이터 시드 · 마이그레이션은 DB 를 소유한 user-service 가 맡는다
 * 도메인: UserModule(탈퇴 자동처리) · ReservationModule(결제 대기 만료 · 늦은 승인 · 환불 · QR 맞추기 · 이용 시작 · 종료 · QR 링크 SMS) · ApiLogModule(API 로그 월 파티션 미리 만들기 — 이번 달 + 3개월, 지우지 않음)
 */
@Module({imports: [DatabaseModule, ScheduleModule.forRoot(), PaymentModule, DoorStoreModule, SmsModule, UserModule, ReservationModule, ApiLogModule]})
export class SchedulerModule {}
