import {Module} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {USER_COMMAND_BINDING, USER_COMMAND_QUEUE} from '@app/contracts/user/user.commands.js';
import {DatabaseModule} from '@app/database/database.module.js';
import {SeederService} from '@app/database/seeder/seeder.service.js';
import {BROKER_USER} from '@app/messaging/messaging.constants.js';
import {DoorStoreModule} from '@app/integration/door/door-store.module.js';
import {PaymentModule} from '@app/integration/payment/payment.module.js';
import {SmsModule} from '@app/integration/sms/sms.module.js';
import {StorageModule} from '@app/integration/storage/storage.module.js';
import {MessagingModule} from '@app/messaging/messaging.module.js';
import {DiscoveryModule} from './discovery/discovery.module.js';
import {DoorModule} from './door/door.module.js';
import {ReservationModule} from './reservation/reservation.module.js';
import {StoreModule} from './store/store.module.js';
import {UserModule} from './user/user.module.js';

/**
 * user-service 루트 모듈 — 게이트웨이를 거친 요청만 받는다.
 * - APP_GUARD(InternalAuthGuard): 모든 HTTP 요청에 게이트웨이의 내부 토큰을 요구한다
 * - APP_INTERCEPTOR(ReturnedExceptionInterceptor): 내부 HTTP 컨트롤러가 반환한 HttpException 을 실패 응답으로 바꾼다(커밋 뒤 실패 — 큐 경로는 CommandDispatcher)
 * - DatabaseModule: TypeORM(PostgreSQL) + `@Transactional()` (nestjs-cls)
 * - MessagingModule.forService: q.user.cmd 소비 → `@OnCommand` 핸들러 디스패치 (user_id 가 gateway 인 명령만 처리)
 * - SmsModule: SMS 발송 포트(SMS_SENDER, Amazon SNS) — 휴대폰 인증 · 아이디 찾기 · 비밀번호 초기화
 * - StorageModule: 파일 저장소 포트(STORAGE_GATEWAY, Amazon S3 · CloudFront) — 입점 신청 업체 정보 파일(업로드 주소 · 존재 확인 · 삭제 · 서명 열람 주소) · 업체 둘러보기의 업체 · 객실 그룹 사진 공개 주소
 * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis — RedisModule 연결 포함) — 문 소켓 접속 확인 · QR 확인 · 잠금, 내 예약 QR 발급 · 결제 확인 때 호실의 현재 QR 쓰기
 * - PaymentModule: 결제 포트(PAYMENT_GATEWAY, 토스페이먼츠) — 예약 결제 환경 · 결제 확인
 * - SeederService: DB 를 소유하는 이 서비스가 룩업 기본 데이터 · 첫 총관리자를 보장한다
 * 도메인(이용자 기능 — 사용자 결정 2026-11-07): UserModule(회원) · ReservationModule(예약) · DiscoveryModule(업체 둘러보기) · StoreModule(입점 신청) · DoorModule(문 소켓 처리). crontab 은 scheduler 앱이 돌린다(이 서비스에는 ScheduleModule 이 없다).
 */
@Module({
    imports: [
        DatabaseModule,
        MessagingModule.forService({queue: USER_COMMAND_QUEUE, binding_keys: [USER_COMMAND_BINDING], broker_user: BROKER_USER.USER_SERVICE}),
        SmsModule,
        StorageModule,
        DoorStoreModule,
        PaymentModule,
        UserModule,
        ReservationModule,
        DiscoveryModule,
        StoreModule,
        DoorModule,
    ],
    providers: [{provide: APP_GUARD, useClass: InternalAuthGuard}, {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}, SeederService],
})
export class UserServiceModule {}
