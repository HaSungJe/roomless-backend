import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityTarget, In, ObjectLiteral } from 'typeorm';
import { SEED_TARGETS } from './seeder.targets';
import { pickMissingRows } from './seeder.util';

/**
 * 기본 데이터 시더 — 앱 부팅 시 SEED_TARGETS 의 각 엔티티 기본 데이터 중
 * DB에 없는(PK 기준) 행만 입력한다(멱등). 이미 있으면 건너뛰므로 매 부팅 안전하게 실행 가능.
 */
@Injectable()
export class SeederService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SeederService.name);

    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    /** 부팅 직후 전체 시드 대상 순회 (건별 실패는 부팅을 막지 않음) */
    async onApplicationBootstrap(): Promise<void> {
        for (const target of SEED_TARGETS) {
            await this.seedEntity(target.entity, target.data);
        }
    }

    /**
     * 단일 엔티티 시드 — PK 기준 미존재 행만 insert.
     * 테이블 미생성/연결 오류 등은 warn 로그만 남기고 부팅을 계속한다.
     */
    private async seedEntity<T extends ObjectLiteral>(entity: EntityTarget<T>, rows: T[]): Promise<void> {
        if (!rows || rows.length === 0) return;
        const repo = this.dataSource.getRepository(entity);
        const pk = repo.metadata.primaryColumns[0].propertyName;
        try {
            const ids = rows.map((r) => (r as Record<string, unknown>)[pk]);
            const existing = await repo.find({where: {[pk]: In(ids)} as never});
            const missing = pickMissingRows(rows, existing, pk);
            if (missing.length === 0) return;

            await repo.insert(missing);
            const insertedIds = missing.map((m) => (m as Record<string, string>)[pk]).join(', ');
            this.logger.log(`${repo.metadata.tableName}: 기본 데이터 ${missing.length}건 입력 (${insertedIds})`);
        } catch (e) {
            // 시드 실패는 부팅을 중단시키지 않음 (테이블 미생성 등) — 로그만 남김
            const reason = e instanceof Error ? e.message : String(e);
            this.logger.warn(`${repo.metadata.tableName}: 기본 데이터 입력 실패 — ${reason}`);
        }
    }
}
