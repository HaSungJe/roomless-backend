// 오프라인 마이그레이션 도구 — 실제 DB 없이 TypeORM 엔티티와 마이그레이션의 차이를 계산한다.
// PGlite(WASM 으로 돌아가는 PostgreSQL)를 이 프로세스 안에 띄워 기존 마이그레이션을 모두 적용한 뒤,
// 엔티티 메타데이터 기준으로 남은 DDL 을 TypeORM 스키마 빌더에게서 받는다(= typeorm migration:generate 와 같은 계산).
//
// 사용 (먼저 user-service 를 빌드한다 — npm 스크립트가 해 준다)
//   npm run db:check                 엔티티 ↔ 마이그레이션 차이가 있으면 DDL 을 출력하고 exit 1
//   npm run db:generate -- AddStoreHour   차이를 libs/database/src/migrations/<ts>-AddStoreHour.ts 로 쓰고 migrations.ts 에 등록
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import {readFileSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {DataSource} from 'typeorm';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('dist/apps/user-service/libs/database/src/', ROOT);
const MIGRATIONS_DIR = new URL('libs/database/src/migrations/', ROOT);
const MIGRATIONS_REGISTRY = new URL('libs/database/src/migrations.ts', ROOT);

/**
 * 비어 있는 로컬 포트를 하나 받는다.
 *
 * @returns 포트 번호
 */
function freePort() {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const {port} = server.address();
            server.close(() => resolve(port));
        });
    });
}

/**
 * PGlite 에 기존 마이그레이션을 적용하고, 엔티티 기준으로 남은 DDL 을 구한다.
 *
 * @returns {Promise<{up: string[], down: string[]}>} 적용할 up 쿼리 · 되돌릴 down 쿼리(실행 순서대로)
 */
async function pendingSchemaDiff() {
    const {ENTITIES} = await import(new URL('entities.js', DIST));
    const {MIGRATIONS} = await import(new URL('migrations.js', DIST));
    // 배타 제약(EXC_ — 기간 겹침)이 쓰는 확장을 실어 둔다 — 운영 PostgreSQL 처럼 CREATE EXTENSION 으로 켠다
    const db = await PGlite.create({extensions: {btree_gist}});
    const port = await freePort();
    const server = new PGLiteSocketServer({db, port, host: '127.0.0.1', maxConnections: 4});
    await server.start();
    const dataSource = new DataSource({
        type: 'postgres',
        host: '127.0.0.1',
        port,
        username: 'postgres',
        password: 'postgres',
        database: 'postgres',
        entities: ENTITIES,
        migrations: MIGRATIONS,
        migrationsTableName: 't_migration',
        extra: {max: 1},
    });
    try {
        await dataSource.initialize();
        await dataSource.runMigrations({transaction: 'each'});
        const sql = await dataSource.driver.createSchemaBuilder().log();
        return {up: sql.upQueries.map((q) => q.query), down: sql.downQueries.map((q) => q.query).reverse()};
    } finally {
        await dataSource.destroy().catch(() => undefined);
        await server.stop();
        await db.close();
    }
}

/**
 * 마이그레이션 클래스 소스를 만든다.
 *
 * @param className 클래스명 (<Name><timestamp>)
 * @param up up 쿼리
 * @param down down 쿼리
 * @returns TypeScript 소스
 */
function migrationSource(className, up, down) {
    const esc = (q) => q.split('\\').join('\\\\').split('`').join('\\`').split('${').join('\\${');
    const lines = (qs) => qs.map((q) => `        await queryRunner.query(\`${esc(q)}\`);`).join('\n');
    return `import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * TODO: 이 마이그레이션이 바꾸는 내용을 적는다. (npm run db:generate 로 엔티티에서 생성)
 */
export class ${className} implements MigrationInterface {
    name = '${className}';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
${lines(up)}
    }

    /**
     * 되돌리기
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
${lines(down)}
    }
}
`;
}

/**
 * migrations.ts 에 새 마이그레이션을 등록한다(import 1줄 + 배열 끝에 추가).
 *
 * @param className 클래스명
 * @param fileName 파일명(확장자 제외)
 */
function registerMigration(className, fileName) {
    const lines = readFileSync(MIGRATIONS_REGISTRY, 'utf8').split('\n');
    const importLine = `import {${className}} from './migrations/${fileName}.js';`;
    const lastImportIndex = lines.reduce((last, line, index) => (line.startsWith('import ') ? index : last), -1);
    lines.splice(lastImportIndex + 1, 0, importLine);
    let source = lines.join('\n');
    source = source.replace(/export const MIGRATIONS = \[([^\]]*)\];/, (_m, items) => `export const MIGRATIONS = [${items.trim() ? `${items.trim()}, ` : ''}${className}];`);
    writeFileSync(MIGRATIONS_REGISTRY, source);
}

const [command, name] = process.argv.slice(2);
const diff = await pendingSchemaDiff();

if (command === 'check') {
    if (diff.up.length === 0) {
        console.log('엔티티와 마이그레이션이 일치합니다.');
    } else {
        console.error(`마이그레이션에 반영되지 않은 변경 ${diff.up.length}건:\n` + diff.up.map((q) => `  ${q}`).join('\n'));
        console.error('npm run db:generate -- <이름> 으로 마이그레이션을 만드세요.');
        process.exitCode = 1;
    }
} else if (command === 'generate') {
    if (!name || !/^[A-Z][A-Za-z0-9]*$/.test(name)) {
        console.error('이름을 PascalCase 로 주세요. 예: npm run db:generate -- AddStoreHour');
        process.exit(1);
    }
    if (diff.up.length === 0) {
        console.log('엔티티와 마이그레이션이 일치합니다 — 만들 마이그레이션이 없습니다.');
    } else {
        const timestamp = Date.now();
        const className = `${name}${timestamp}`;
        const fileName = `${timestamp}-${name}`;
        writeFileSync(new URL(`${fileName}.ts`, MIGRATIONS_DIR), migrationSource(className, diff.up, diff.down));
        registerMigration(className, fileName);
        console.log(`생성: libs/database/src/migrations/${fileName}.ts (up ${diff.up.length} · down ${diff.down.length}) — migrations.ts 에 등록함`);
    }
} else {
    console.error('사용: node scripts/db-schema.mjs check | generate <Name>');
    process.exit(1);
}
