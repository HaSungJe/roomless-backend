import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeORMModule } from '@root/modules/typeorm/typeorm.module';
import { AuthEntity } from '@root/api/v1/user/entities/auth.entity';
import { StateEntity } from '@root/api/v1/user/entities/state.entity';
import { SnsEntity } from '@root/api/v1/user/entities/sns.entity';
import { SeederService } from './seeder.service';

/**
 * 기본 데이터 시드 모듈 — 부팅 시 SeederService 가 SEED_TARGETS 의 기본 데이터를 보장.
 * forFeature 로 시드 대상 엔티티를 명시 등록(autoLoad 의존 제거).
 */
@Module({
    imports: [
        TypeORMModule,
        TypeOrmModule.forFeature([AuthEntity, StateEntity, SnsEntity]),
    ],
    providers: [SeederService],
})
export class SeederModule {}
