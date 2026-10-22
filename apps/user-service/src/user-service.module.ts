import {Module} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {USER_COMMAND_BINDING, USER_COMMAND_QUEUE} from '@app/contracts/user/user.commands.js';
import {DatabaseModule} from '@app/database/database.module.js';
import {SeederService} from '@app/database/seeder/seeder.service.js';
import {BROKER_USER} from '@app/messaging/messaging.constants.js';
import {SmsModule} from '@app/integration/sms/sms.module.js';
import {MessagingModule} from '@app/messaging/messaging.module.js';
import {UserModule} from './user/user.module.js';

/**
 * user-service 루트 모듈 — 게이트웨이를 거친 요청만 받는다.
 * - APP_GUARD(InternalAuthGuard): 모든 HTTP 요청에 게이트웨이의 내부 토큰을 요구한다
 * - APP_INTERCEPTOR(ReturnedExceptionInterceptor): 내부 HTTP 컨트롤러가 반환한 HttpException 을 실패 응답으로 바꾼다(커밋 뒤 실패 — 큐 경로는 CommandDispatcher)
 * - DatabaseModule: TypeORM(PostgreSQL) + `@Transactional()` (nestjs-cls)
 * - MessagingModule.forService: q.user.cmd 소비 → `@OnCommand` 핸들러 디스패치 (user_id 가 gateway 인 명령만 처리)
 * - SmsModule: SMS 발송 포트(SMS_SENDER, Amazon SNS) — 휴대폰 인증 · 아이디 찾기 · 비밀번호 초기화
 * - SeederService: DB 를 소유하는 이 서비스가 룩업 기본 데이터 · 첫 총관리자를 보장한다
 * crontab 은 scheduler 앱이 돌린다(이 서비스에는 ScheduleModule 이 없다).
 */
@Module({
    imports: [DatabaseModule, MessagingModule.forService({queue: USER_COMMAND_QUEUE, binding_keys: [USER_COMMAND_BINDING], broker_user: BROKER_USER.USER_SERVICE}), SmsModule, UserModule],
    providers: [{provide: APP_GUARD, useClass: InternalAuthGuard}, {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}, SeederService],
})
export class UserServiceModule {}
