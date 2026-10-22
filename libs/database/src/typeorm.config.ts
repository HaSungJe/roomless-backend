import type {DataSourceOptions} from 'typeorm';
import {readPositiveInt} from '@app/common/utils/env.js';
import {ENTITIES} from './entities.js';
import {MIGRATIONS} from './migrations.js';

/** 풀에서 DB 연결을 기다리는 기본 시간(ms) — DATABASE_CONNECTION_TIMEOUT_MS 가 없거나 잘못됐을 때. 넘기면 그 요청은 500(큐 경로는 재시도) */
export const DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS = 30_000;

/**
 * 비즈니스 DB(PostgreSQL) DataSource 설정 — 앱(TypeOrmModule)과 마이그레이션 실행기가 같은 설정을 쓴다.
 * 스키마는 마이그레이션으로만 바꾼다(synchronize 는 항상 끈다). 풀 연결 대기는 DATABASE_CONNECTION_TIMEOUT_MS 로 제한한다(영구 대기 방지).
 *
 * @returns DataSource 옵션
 */
export function buildDataSourceOptions(): DataSourceOptions {
    return {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: ENTITIES,
        migrations: MIGRATIONS,
        migrationsTableName: 't_migration',
        synchronize: false,
        logging: false,
        connectTimeoutMS: readPositiveInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS, DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS),
        extra: {max: parseInt(process.env.DATABASE_POOL_SIZE || '10')},
    };
}
