import {Logger} from '@nestjs/common';
import {retry} from '@app/common/utils/retry.js';
import {AppDataSource} from '@app/database/data-source.js';

const logger = new Logger('Migration');

/** DB 연결 대기 — PostgreSQL 은 따로 띄우는 컨테이너라 아직 준비 중일 수 있다 (2초 × 30회 = 최대 1분) */
const DB_CONNECT_ATTEMPTS = 30;
const DB_CONNECT_DELAY_MS = 2000;

/**
 * 마이그레이션 실행기 — compose.user-service.yml 의 migrate 서비스와 `npm run db:migrate` 가 실행한다.
 * - 인자 없음: 미적용 마이그레이션을 순서대로 적용 (각각 별도 트랜잭션)
 * - `revert`: 마지막 마이그레이션 1건을 되돌림
 * - DB 에 연결될 때까지 최대 1분 기다린다.
 */
async function migrate(): Promise<void> {
    const revert = process.argv.includes('revert');
    await retry(() => AppDataSource.initialize(), {
        attempts: DB_CONNECT_ATTEMPTS,
        delay_ms: DB_CONNECT_DELAY_MS,
        on_retry: (error, attempt) => logger.warn(`DB 연결 대기 (${attempt}/${DB_CONNECT_ATTEMPTS}): ${error instanceof Error ? error.message : String(error)}`),
    });
    try {
        if (revert) {
            await AppDataSource.undoLastMigration({transaction: 'each'});
            logger.log('마지막 마이그레이션을 되돌렸습니다.');
            return;
        }
        const applied = await AppDataSource.runMigrations({transaction: 'each'});
        logger.log(applied.length > 0 ? `마이그레이션 ${applied.length}건 적용: ${applied.map((m) => m.name).join(', ')}` : '적용할 마이그레이션이 없습니다.');
    } finally {
        await AppDataSource.destroy();
    }
}

await migrate();
