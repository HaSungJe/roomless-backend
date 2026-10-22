import {Module} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {ADMIN_COMMAND_BINDING, ADMIN_COMMAND_QUEUE} from '@app/contracts/admin/admin.commands.js';
import {DatabaseModule} from '@app/database/database.module.js';
import {SmsModule} from '@app/integration/sms/sms.module.js';
import {BROKER_USER} from '@app/messaging/messaging.constants.js';
import {MessagingModule} from '@app/messaging/messaging.module.js';
import {AdminModule} from './admin/admin.module.js';
import {ManagerModule} from './manager/manager.module.js';

/**
 * admin-service 루트 모듈 — 매니저(총매니저 · 매니저) · 관리자(총관리자 · 관리자) 도메인. 게이트웨이를 거친 요청만 받는다.
 * - APP_GUARD(InternalAuthGuard): 모든 HTTP 요청에 게이트웨이의 내부 토큰을 요구한다
 * - APP_INTERCEPTOR(ReturnedExceptionInterceptor): 내부 HTTP 컨트롤러가 반환한 HttpException 을 실패 응답으로 바꾼다(커밋 뒤 실패 — 큐 경로는 CommandDispatcher)
 * - DatabaseModule: TypeORM(PostgreSQL, user-service 와 같은 DB · 엔티티) + `@Transactional()` (nestjs-cls)
 * - MessagingModule.forService: q.admin.cmd(`admin.#`) 소비 → `@OnCommand` 핸들러 디스패치 (user_id 가 gateway 인 명령만 처리)
 * - SmsModule: SMS 발송 포트(SMS_SENDER, Amazon SNS) — 매니저 아이디 찾기 · 비밀번호 초기화
 * 마이그레이션 · 기본 데이터 시드는 DB 를 소유한 user-service 묶음이 맡는다(이 서비스에는 migrate · SeederService 가 없다).
 */
@Module({
    imports: [
        DatabaseModule,
        MessagingModule.forService({queue: ADMIN_COMMAND_QUEUE, binding_keys: [ADMIN_COMMAND_BINDING], broker_user: BROKER_USER.ADMIN_SERVICE}),
        SmsModule,
        ManagerModule,
        AdminModule,
    ],
    providers: [
        {provide: APP_GUARD, useClass: InternalAuthGuard},
        {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor},
    ],
})
export class AdminServiceModule {}
