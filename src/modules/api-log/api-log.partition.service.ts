import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { API_LOG_AHEAD_PARTITIONS, API_LOG_DATASOURCE_NAME, API_LOG_PARTITION_LOCK, API_LOG_RETENTION_MONTHS } from './api-log.constants';
import { ApiLogEntity } from './api-log.entity';

/**
 * t_api_log 테이블의 RANGE 파티션을 자동 적용 + 관리.
 *
 * - onModuleInit: 부팅 시 파티션 미적용이면 적용. 적용되어 있으면 향후 N개월 파티션 누락분 보강.
 * - 매월 1일 00:00 (`@Cron`): 다음 달 파티션 추가 + 보존기간(API_LOG_RETENTION_MONTHS) 초과 파티션 DROP.
 * - 멀티 인스턴스 환경: MySQL `GET_LOCK()` advisory lock 으로 한 인스턴스만 작업.
 * - 스케줄링은 `@nestjs/schedule` 의 `@Cron` 사용 (자체 setTimeout 미사용 — 32-bit overflow / 재귀 예약 / cleanup 부담 회피)
 */
@Injectable()
export class ApiLogPartitionService implements OnModuleInit {
    private readonly logger = new Logger(ApiLogPartitionService.name);

    constructor(
        @InjectDataSource(API_LOG_DATASOURCE_NAME)
        private readonly dataSource: DataSource,
    ) {}

    /**
     * 부팅 시 1회: 파티션 미적용 시 초기 적용 + 향후 N개월 누락분 보강 + 만료분 DROP
     */
    async onModuleInit(): Promise<void> {
        try {
            await this.runMaintenance();
        } catch (e: any) {
            this.logger.error(`초기 파티션 보강 실패: ${e?.message ?? e}`);
        }
    }

    /**
     * 매월 1일 00:00 — 다음 달 파티션 추가 + 만료 파티션 DROP
     * (`ScheduleModule.forRoot()` 가 app.module.ts 에 등록돼 있어야 동작)
     */
    @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
    async monthlyMaintenance(): Promise<void> {
        try {
            await this.runMaintenance();
        } catch (e: any) {
            this.logger.error(`정기 파티션 작업 실패: ${e?.message ?? e}`);
        }
    }

    /**
     * 한 사이클의 작업 흐름:
     * 1. advisory lock 획득 (실패 시 즉시 종료 — 다른 인스턴스가 작업 중)
     * 2. 테이블에 파티션 정의가 있는지 확인. 없으면 초기 파티션 정의 ALTER.
     * 3. 향후 N개월 파티션 누락분 ADD (REORGANIZE pmax)
     * 4. 보존기간 초과 파티션 DROP
     */
    private async runMaintenance(): Promise<void> {
        const lockAcquired = await this.acquireLock();
        if (!lockAcquired) {
            this.logger.log('다른 인스턴스가 파티션 작업 중 — 스킵');
            return;
        }

        try {
            const tableName = this.getTableName();
            const existing = await this.getExistingPartitions(tableName);

            if (existing.size === 0) {
                await this.initialPartitioning(tableName);
            } else {
                await this.ensureFuturePartitions(tableName, existing);
            }

            await this.dropExpiredPartitions(tableName);
        } finally {
            await this.releaseLock();
        }
    }

    /**
     * 엔티티 메타데이터에서 실제 테이블명을 가져옴 (typeorm naming strategy 영향 흡수)
     */
    private getTableName(): string {
        return this.dataSource.getMetadata(ApiLogEntity).tableName;
    }

    private async acquireLock(): Promise<boolean> {
        const rows = await this.dataSource.query(
            `SELECT GET_LOCK(?, 0) AS acquired`,
            [API_LOG_PARTITION_LOCK],
        );
        return rows?.[0]?.acquired === 1 || rows?.[0]?.acquired === '1';
    }

    private async releaseLock(): Promise<void> {
        try {
            await this.dataSource.query(`SELECT RELEASE_LOCK(?)`, [API_LOG_PARTITION_LOCK]);
        } catch {
            // ignore
        }
    }

    /**
     * INFORMATION_SCHEMA 에서 현재 파티션 이름 셋 조회
     */
    private async getExistingPartitions(tableName: string): Promise<Set<string>> {
        const rows = await this.dataSource.query(
            `SELECT PARTITION_NAME FROM INFORMATION_SCHEMA.PARTITIONS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND PARTITION_NAME IS NOT NULL`,
            [tableName],
        );
        const set = new Set<string>();
        for (const r of rows) set.add(r.PARTITION_NAME);
        return set;
    }

    /**
     * 파티션이 한 번도 적용된 적 없을 때, 초기 파티션 정의를 한 번에 적용.
     * 현재 달 ~ +N개월 + pmax.
     */
    private async initialPartitioning(tableName: string): Promise<void> {
        const partitions: string[] = [];
        const now = new Date();
        for (let i = 0; i <= API_LOG_AHEAD_PARTITIONS; i++) {
            const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const upper = new Date(target.getFullYear(), target.getMonth() + 1, 1);
            partitions.push(
                `PARTITION ${this.partitionName(target)} VALUES LESS THAN (TO_DAYS('${this.toDateStr(upper)}'))`,
            );
        }
        partitions.push(`PARTITION pmax VALUES LESS THAN MAXVALUE`);

        const sql = `ALTER TABLE \`${tableName}\` PARTITION BY RANGE (TO_DAYS(create_at)) (\n  ${partitions.join(',\n  ')}\n)`;
        await this.dataSource.query(sql);
        this.logger.log(`초기 파티션 적용 완료: ${partitions.length - 1}개 + pmax`);
    }

    /**
     * 이미 파티션이 있는 상태에서 향후 N개월 누락분만 ADD.
     * REORGANIZE pmax INTO (...) 로 새 파티션을 pmax 앞에 끼워넣음.
     */
    private async ensureFuturePartitions(tableName: string, existing: Set<string>): Promise<void> {
        const now = new Date();
        const toAdd: Array<{name: string; upperDate: string}> = [];
        for (let i = 0; i <= API_LOG_AHEAD_PARTITIONS; i++) {
            const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const name = this.partitionName(target);
            if (existing.has(name)) continue;
            const upper = new Date(target.getFullYear(), target.getMonth() + 1, 1);
            toAdd.push({name, upperDate: this.toDateStr(upper)});
        }

        if (toAdd.length === 0) return;

        const reorganized = toAdd
            .map((p) => `PARTITION ${p.name} VALUES LESS THAN (TO_DAYS('${p.upperDate}'))`)
            .join(',\n  ');
        const sql =
            `ALTER TABLE \`${tableName}\` REORGANIZE PARTITION pmax INTO (\n  ${reorganized},\n  PARTITION pmax VALUES LESS THAN MAXVALUE\n)`;

        try {
            await this.dataSource.query(sql);
            this.logger.log(`파티션 추가: ${toAdd.map((p) => p.name).join(', ')}`);
        } catch (e: any) {
            // 1517: duplicate partition name (다른 인스턴스가 동시 추가) — idempotent 처리
            if (e?.errno === 1517) {
                this.logger.log('중복 파티션 추가 시도 — 무시');
                return;
            }
            throw e;
        }
    }

    /**
     * 보존기간 (API_LOG_RETENTION_MONTHS) 이전 파티션을 DROP.
     */
    private async dropExpiredPartitions(tableName: string): Promise<void> {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - API_LOG_RETENTION_MONTHS);
        cutoff.setDate(1);
        cutoff.setHours(0, 0, 0, 0);

        const existing = await this.getExistingPartitions(tableName);
        const toDrop: string[] = [];

        for (const name of existing) {
            if (name === 'pmax') continue;
            const date = this.parsePartitionName(name);
            if (date && date < cutoff) toDrop.push(name);
        }

        if (toDrop.length === 0) return;

        const sql = `ALTER TABLE \`${tableName}\` DROP PARTITION ${toDrop.join(', ')}`;
        try {
            await this.dataSource.query(sql);
            this.logger.log(`만료 파티션 DROP: ${toDrop.join(', ')}`);
        } catch (e: any) {
            this.logger.error(`파티션 DROP 실패: ${e?.message ?? e}`);
        }
    }

    private partitionName(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        return `p${y}${m}`;
    }

    private parsePartitionName(name: string): Date | null {
        const m = /^p(\d{4})(\d{2})$/.exec(name);
        if (!m) return null;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1);
    }

    private toDateStr(date: Date): string {
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${mo}-${d}`;
    }
}
