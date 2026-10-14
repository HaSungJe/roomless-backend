import type {DataSourceOptions} from 'typeorm';
import {ENTITIES} from './entities.js';
import {MIGRATIONS} from './migrations.js';

/**
 * 비즈니스 DB(PostgreSQL) DataSource 설정 — 앱(TypeOrmModule)과 마이그레이션 실행기가 같은 설정을 쓴다.
 * 스키마는 마이그레이션으로만 바꾼다(synchronize 는 항상 끈다).
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
        extra: {max: parseInt(process.env.DATABASE_POOL_SIZE || '10')},
    };
}
