import {Injectable, Logger, OnModuleDestroy} from '@nestjs/common';
import {DataSource} from 'typeorm';
import type {QueryDeepPartialEntity} from 'typeorm';
import {ApiLogEntity} from '@app/database/entities/api-log/api-log.entity.js';
import {buildApiLogDataSourceOptions} from '@app/database/typeorm.config.js';

/**
 * API 로그 적재(게이트웨이 인프라) — 로그 전용 DB 연결(t_api_log 만, 풀 5)로 바로 insert 한다(사용자 결정 2026-11-10 — 게이트웨이의 유일한 DB 사용).
 * TypeOrmModule 은 DB 가 없으면 부팅을 막으므로 DataSource 를 직접 두고 처음 쓸 때 연다 — DB 가 없거나 실패하면 그 로그만 빠지고 다음 로그 때 다시 연결한다.
 */
@Injectable()
export class ApiLogWriter implements OnModuleDestroy {
    private readonly logger = new Logger(ApiLogWriter.name);
    private readonly dataSource = new DataSource(buildApiLogDataSourceOptions());
    private connecting: Promise<DataSource> | null = null;

    /**
     * 로그 1행 넣기 — 실패는 경고만 남긴다(요청에는 영향 없음).
     *
     * @param entity 로그
     */
    async write(entity: ApiLogEntity): Promise<void> {
        try {
            const dataSource = await this.connect();
            // jsonb 컬럼이 unknown 이라 insert 의 부분 엔티티 타입으로만 좁힌다 — 엔티티 인스턴스 그대로라 @BeforeInsert 훅은 돈다
            await dataSource.getRepository(ApiLogEntity).insert(entity as QueryDeepPartialEntity<ApiLogEntity>);
        } catch (error) {
            this.logger.warn(`API 로그 적재 실패 — ${entity.method} ${entity.path}: ${(error as Error)?.message ?? error}`);
        }
    }

    /**
     * 종료 — 연결을 닫는다.
     */
    async onModuleDestroy(): Promise<void> {
        if (this.dataSource.isInitialized) {
            await this.dataSource.destroy();
        }
    }

    /**
     * 연결 — 열려 있으면 그대로, 여는 중이면 같은 시도를 기다린다. 실패하면 다음 호출 때 다시 연다.
     *
     * @returns 열린 DataSource
     */
    private connect(): Promise<DataSource> {
        if (this.dataSource.isInitialized) {
            return Promise.resolve(this.dataSource);
        }
        this.connecting ??= this.dataSource.initialize().catch((error: unknown) => {
            this.connecting = null;
            throw error;
        });
        return this.connecting;
    }
}
