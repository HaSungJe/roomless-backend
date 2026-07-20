import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { I18nModule } from 'nestjs-i18n';
import { buildI18nOptions } from './common/i18n/i18n.config';
import { UserModule } from './api/v1/user/user.module';
import { QueueModule } from './modules/queue/queue.module';
import { ApiLogModule } from './modules/api-log/api-log.module';
import { SeederModule } from './modules/seeder/seeder.module';

@Module({
    imports: [
        ScheduleModule.forRoot(), // CLAUDE.md "Key Patterns" — 중복 등록 금지, 본 파일에서만 1회 등록
        I18nModule.forRoot(buildI18nOptions()), // 다국어 — Accept-Language 해석 + 언어팩 로드 (KO fallback)
        QueueModule.register(),
        ApiLogModule,
        UserModule,
        SeederModule, // 부팅 시 기본 데이터(SEED_TARGETS) 멱등 시드
    ],
})
export class AppModule {}
