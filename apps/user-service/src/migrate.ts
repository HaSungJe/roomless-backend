import {Logger} from '@nestjs/common';
import {AppDataSource} from '@app/database/data-source.js';

const logger = new Logger('Migration');

/**
 * 마이그레이션 실행기 — docker compose 의 migrate 서비스와 `npm run db:migrate` 가 실행한다.
 * - 인자 없음: 미적용 마이그레이션을 순서대로 적용 (각각 별도 트랜잭션)
 * - `revert`: 마지막 마이그레이션 1건을 되돌림
 */
async function migrate(): Promise<void> {
    const revert = process.argv.includes('revert');
    await AppDataSource.initialize();
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
