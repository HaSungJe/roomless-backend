import {Injectable, Logger, OnApplicationBootstrap} from '@nestjs/common';
import {InjectDataSource} from '@nestjs/typeorm';
import {DataSource, In} from 'typeorm';
import type {EntityTarget, ObjectLiteral} from 'typeorm';
import {SEED_TARGETS} from './seeder.targets.js';
import {pickMissingRows} from './seeder.util.js';

/**
 * 기본 데이터 시더 — 앱 부팅 시 SEED_TARGETS 의 각 엔티티 기본 데이터 중 DB 에 없는(확인 컬럼 key, 없으면 PK 기준) 행만 입력한다(멱등).
 * 대상별 실패는 경고 로그만 남기고 부팅을 막지 않는다. DB 를 소유하는 서비스 한 곳(user-service)에서만 등록한다.
 */
@Injectable()
export class SeederService implements OnApplicationBootstrap {
    private readonly logger = new Logger(SeederService.name);

    /**
     * @param dataSource 기본 DataSource
     */
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    /**
     * 부팅 직후 전체 시드 대상을 순서대로 처리한다. 만드는 함수가 실패하면 그 대상만 경고하고 다음으로 넘어간다.
     */
    async onApplicationBootstrap(): Promise<void> {
        for (const target of SEED_TARGETS) {
            let rows: ObjectLiteral[];
            try {
                rows = typeof target.data === 'function' ? await target.data(this.dataSource) : target.data;
            } catch (e) {
                const reason = e instanceof Error ? e.message : String(e);
                this.logger.warn(`기본 데이터 준비 실패 — ${reason}`);
                continue;
            }
            await this.seedEntity(target.entity, rows, target.key);
        }
    }

    /**
     * 단일 엔티티 시드 — 확인 컬럼(key, 없으면 PK) 기준 미존재 행만 insert. 테이블 미생성 · 연결 오류 등은 warn 로그만 남긴다.
     *
     * @param entity 엔티티 클래스
     * @param rows 기본 데이터
     * @param key 이미 있는지 확인할 유일 컬럼 (없으면 PK)
     * @returns 입력 건수 (실패 시 null)
     */
    async seedEntity<T extends ObjectLiteral>(entity: EntityTarget<T>, rows: T[], key?: string): Promise<number | null> {
        if (!rows || rows.length === 0) return 0;
        const repo = this.dataSource.getRepository(entity);
        const column = key ?? repo.metadata.primaryColumns[0].propertyName;
        try {
            const values = rows.map((r) => (r as Record<string, unknown>)[column]);
            const existing = await repo.find({where: {[column]: In(values)} as never});
            const missing = pickMissingRows(rows, existing, column);
            if (missing.length === 0) return 0;

            await repo.insert(missing);
            const inserted = missing.map((m) => (m as Record<string, string>)[column]).join(', ');
            this.logger.log(`${repo.metadata.tableName}: 기본 데이터 ${missing.length}건 입력 (${inserted})`);
            return missing.length;
        } catch (e) {
            const reason = e instanceof Error ? e.message : String(e);
            this.logger.warn(`${repo.metadata.tableName}: 기본 데이터 입력 실패 — ${reason}`);
            return null;
        }
    }
}
