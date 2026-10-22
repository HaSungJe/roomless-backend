import {Module} from '@nestjs/common';
import {ScheduleModule} from '@nestjs/schedule';
import {DatabaseModule} from '@app/database/database.module.js';
import {UserModule} from './user/user.module.js';

/**
 * scheduler 루트 모듈 — crontab 만 돈다. 들어오는 연결이 없어 APP_GUARD · MessagingModule · 컨트롤러가 없다.
 * - DatabaseModule: TypeORM(PostgreSQL) + JobLockService(여러 대여도 회차마다 1대만 실행)
 * - ScheduleModule: 도메인별 crontabs 폴더의 @Cron 을 돌린다 (앱마다 forRoot 1회)
 * - 기본 데이터 시드 · 마이그레이션은 DB 를 소유한 user-service 가 맡는다
 */
@Module({imports: [DatabaseModule, ScheduleModule.forRoot(), UserModule]})
export class SchedulerModule {}
