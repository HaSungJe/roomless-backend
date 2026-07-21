import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UserModule } from './api/v1/user/user.module';
import { StoreModule } from './api/v1/store/store.module';
import { QueueModule } from './modules/queue/queue.module';
import { ApiLogModule } from './modules/api-log/api-log.module';
import { SeederModule } from './modules/seeder/seeder.module';

@Module({
    imports: [
        ScheduleModule.forRoot(), // CLAUDE.md "Key Patterns" — 중복 등록 금지, 본 파일에서만 1회 등록
        QueueModule.register(),
        ApiLogModule,
        UserModule,
        StoreModule,
        SeederModule, // 부팅 시 기본 데이터(SEED_TARGETS) 멱등 시드
    ],
})
export class AppModule {}
