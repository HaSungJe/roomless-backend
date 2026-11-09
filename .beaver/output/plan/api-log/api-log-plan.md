# Plan — api-log

## Feature Summary
- **Feature**: API 로그(Phase 22) — 게이트웨이가 모든 HTTP 요청(성공 · 실패와 사유)을 응답이 끝난 뒤 로그 전용 DB 연결로 `t_api_log` 에 바로 넣는다. `t_api_log` 는 한국 달 RANGE 월 파티션으로 바꾸고 scheduler 가 3개월 앞서 파티션을 만든다(지우지 않음)
- **Entry point**: 게이트웨이 전역 미들웨어(`modules/api-log` — `ApiLogMiddleware` → `ApiLogWriter`) · scheduler crontab `api-log.partition`(매일 03:00, 운영 전용). 새 공개 라우트 · 큐 명령 없음
- **Domain**: api-log — gateway 인프라 모듈, scheduler 도메인, libs/database · libs/common. 로드맵 Phase 22 #87
- **Spec**: [api-log-spec.md](../../spec/api-log/api-log-spec.md)

### 구현 단위 (순서)
- A. libs — `libs/database/src/api-log-partition.ts`(달 목록 · DDL) · `typeorm.config.ts` 로그 전용 연결 설정 · 엔티티 주석 · 손으로 쓴 마이그레이션 `ApiLogPartition` · `libs/common` 예외 필터의 stack 남기기
- B. scheduler `api-log` 도메인 — crontab · repository · module · 루트 등록
- C. gateway `modules/api-log` — util · writer(로그 전용 DataSource) · middleware · module, `GatewayModule.configure`, `compose.gateway.yml` 의 `DATABASE_URL`
- D. 문서 — README · AGENTS · docs(architecture · data-layer · testing) · `.env.example` 주석

## Prerequisites
- [x] `t_api_log` 엔티티 · 테이블(`libs/database/src/entities/api-log/api-log.entity.ts:12` · `1791903600000-Init.ts:16` · `1792477492198-RenameColumns.ts:5`) — PK `(api_log_id, created_at)` 라 파티션 키 조건을 이미 만족
- [x] 게이트웨이 → postgres 길 — 게이트웨이는 이미 `roomless-data` 네트워크에 있다(`compose.gateway.yml:78`, postgres `compose.postgres.yml:30`)

---

## File List

| File | Action |
|------|------|
| `libs/database/src/api-log-partition.ts` | new — `API_LOG_AHEAD_MONTHS` · `API_LOG_DEFAULT_PARTITION` · `buildApiLogPartitions` · `toCreateApiLogPartitionSql` |
| `libs/database/src/typeorm.config.ts` | modified — `API_LOG_POOL_SIZE` · `buildApiLogDataSourceOptions`(게이트웨이 로그 전용) |
| `libs/database/src/entities/api-log/api-log.entity.ts` | modified — 클래스 JSDoc · `path` COMMENT |
| `libs/database/src/migrations/1794253561123-ApiLogPartition.ts` · `libs/database/src/migrations.ts` | new · modified — 일반 테이블 → 파티션 테이블(손으로 쓴 마이그레이션) · 등록 |
| `libs/common/src/exception/custom-error.filter.ts` | modified — 예상 못 한 오류 stack 을 `res.locals` 에 |
| `apps/scheduler/src/api-log/` (module · symbols · interfaces · repositories · crontabs/api-log-partition.crontab.ts) · `apps/scheduler/src/scheduler.module.ts` | new · modified — 파티션 미리 만들기 |
| `apps/gateway/src/modules/api-log/` (api-log.util.ts · api-log.writer.ts · api-log.middleware.ts · api-log.module.ts) · `apps/gateway/src/gateway.module.ts` | new · modified — 기록 미들웨어 · 로그 전용 적재 · 전역 적용 |
| `compose.gateway.yml` · `.env.example` | modified — 게이트웨이에 `DATABASE_URL`(필수) 전달 · 주석 |
| `apps/scheduler/src/api-log/test/api-log.repository.spec.ts` | new — 테스트 |
| `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/data-layer.md` · `docs/testing.md` | modified |

---

## Design

### Input/Validation (DTO·Schema)

새 입력 DTO 없음 — 공개 라우트 · 큐 명령이 없고, 로그 한 행은 게이트웨이가 요청 · 응답에서 만든다(`ApiLogEntity` 를 그대로 쓴다). 길이 제한 컬럼(`path` · `user_agent` 500자)은 만들 때 자른다(아래 C 의 util).

```ts
// 로그 한 행의 모양 = 기존 엔티티 컬럼(libs/database/src/entities/api-log/api-log.entity.ts — 컬럼은 바꾸지 않는다)
// created_at · method · path · request_param · request_query · request_body · status_code · response_body · error_stack · user_id · ip · user_agent · duration_ms
```

### Data Access (Repository/DAO) — A. libs/database · libs/common

```ts
// libs/database/src/api-log-partition.ts — 새 파일
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';

/**
 * t_api_log 월 파티션 — 마이그레이션(처음 만들기)과 scheduler crontab(미리 만들기)이 같이 쓴다.
 * created_at RANGE, 경계는 한국 달 1일 00:00. 지우지 않는다(사용자 결정 2026-11-10 — 보관 기간 없음).
 */

/** 파티션을 미리 만들어 두는 달 수 — 이번 달 + 앞으로 3개월 */
export const API_LOG_AHEAD_MONTHS = 3;

/** 범위 밖 행을 받는 기본 파티션 — insert 가 실패하지 않게 */
export const API_LOG_DEFAULT_PARTITION = 't_api_log_default';

/** t_api_log 월 파티션 — 이름(`t_api_log_YYYYMM`) · 한국 달 경계 [from, to) (ISO, +09:00) */
export interface ApiLogPartition {
    name: string;
    from: string;
    to: string;
}

/**
 * 파일 전용 — 그 달 1일 00:00 한국 시각(ISO).
 *
 * @param month 그 달(1일)
 * @returns 시각
 */
function toKstMonthStart(month: Dayjs): string {
    return dayjs.tz(`${month.format('YYYY-MM')}-01 00:00`, 'YYYY-MM-DD HH:mm', KST_TIMEZONE).format();
}

/**
 * 만들 파티션 — 지금의 한국 달부터 ahead 개월 뒤까지(이번 달 포함 ahead + 1 개, 오래된 달부터).
 *
 * @param now 지금
 * @param ahead 앞으로 만들 달 수
 * @returns 파티션 목록
 */
export function buildApiLogPartitions(now: Dayjs, ahead: number): ApiLogPartition[] {
    const first = dayjs(`${now.tz(KST_TIMEZONE).format('YYYY-MM')}-01`, 'YYYY-MM-DD', true);
    return Array.from({length: ahead + 1}, (_, index) => {
        const month = first.add(index, 'month');
        return {name: `t_api_log_${month.format('YYYYMM')}`, from: toKstMonthStart(month), to: toKstMonthStart(month.add(1, 'month'))};
    });
}

/**
 * 파티션 만들기 DDL — 이미 있으면 그대로(IF NOT EXISTS). 값은 buildApiLogPartitions 가 만든 것만 받는다(바인딩 파라미터를 쓸 수 없는 DDL).
 *
 * @param partition 파티션
 * @returns SQL
 */
export function toCreateApiLogPartitionSql(partition: ApiLogPartition): string {
    return `CREATE TABLE IF NOT EXISTS "${partition.name}" PARTITION OF "t_api_log" FOR VALUES FROM ('${partition.from}') TO ('${partition.to}')`;
}
```

```ts
// libs/database/src/typeorm.config.ts — 로그 전용 연결 설정 추가(비즈니스 설정 buildDataSourceOptions 는 그대로)
import {ApiLogEntity} from './entities/api-log/api-log.entity.js';

/** API 로그 전용 연결 풀 크기 — 게이트웨이 인스턴스마다(비즈니스 풀과 따로) */
export const API_LOG_POOL_SIZE = 5;

/**
 * API 로그 전용 DataSource 설정 — 게이트웨이가 t_api_log 에 바로 넣을 때만 쓴다(사용자 결정 2026-11-10 — 게이트웨이의 유일한 DB 사용).
 * 엔티티 하나 · 마이그레이션 없음 · 작은 풀이라 비즈니스 쿼리와 섞이지 않는다. 접속 정보 · 연결 대기 시간은 비즈니스 설정과 같다.
 *
 * @returns DataSource 옵션
 */
export function buildApiLogDataSourceOptions(): DataSourceOptions {
    return {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [ApiLogEntity],
        synchronize: false,
        logging: false,
        connectTimeoutMS: readPositiveInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS, DEFAULT_DATABASE_CONNECTION_TIMEOUT_MS),
        extra: {max: API_LOG_POOL_SIZE},
    };
}
```

```ts
// libs/database/src/entities/api-log/api-log.entity.ts — 클래스 JSDoc · path COMMENT 만 바꾼다(컬럼 · 제약 · 인덱스 그대로)
/**
 * API 호출 로그 — 게이트웨이가 모든 HTTP 요청을 응답이 끝난 뒤 로그 전용 연결로 넣는다(사용자 결정 2026-11-10).
 * - created_at RANGE 월 파티션 테이블(한국 달 — `t_api_log_YYYYMM` + `t_api_log_default`, 1794253561123-ApiLogPartition). 파티션은 scheduler 가 3개월 앞서 만들고 지우지 않는다.
 * - PK 가 (api_log_id, created_at) 복합인 이유: PostgreSQL RANGE 파티셔닝은 파티션 키(created_at)가 PK 에 포함되어야 한다.
 */
@Entity({name: 't_api_log', comment: 'API 호출 로그'})
// …
    @Column({name: 'path', length: 500, nullable: false, comment: '요청 경로 (라우트 패턴, 없는 경로는 실제 경로)'})
    path: string;
```

```ts
// libs/database/src/migrations/1794253561123-ApiLogPartition.ts — 새 파일(손으로 쓴 마이그레이션 — db:generate 는 파티션 테이블을 만들지 못한다)
import type {MigrationInterface, QueryRunner} from 'typeorm';
import {dayjs} from '@app/common/utils/dayjs.js';
import {API_LOG_AHEAD_MONTHS, API_LOG_DEFAULT_PARTITION, buildApiLogPartitions, toCreateApiLogPartitionSql} from '../api-log-partition.js';

/** t_api_log 컬럼 — 옮겨 담을 때 같은 순서 */
const COLUMNS = '"api_log_id", "created_at", "method", "path", "request_param", "request_query", "request_body", "status_code", "response_body", "error_stack", "user_id", "ip", "user_agent", "duration_ms"';

/** 컬럼 정의 — 일반 · 파티션 테이블 공통(엔티티와 같다) */
const COLUMN_DEFINITIONS =
    '"api_log_id" BIGSERIAL NOT NULL, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL, "method" character varying(10) NOT NULL, "path" character varying(500) NOT NULL, "request_param" jsonb, "request_query" jsonb, "request_body" jsonb, "status_code" integer NOT NULL, "response_body" jsonb, "error_stack" text, "user_id" character varying(36), "ip" character varying(45), "user_agent" character varying(500), "duration_ms" integer NOT NULL, CONSTRAINT "PK_ApiLog" PRIMARY KEY ("api_log_id", "created_at")';

/** 인덱스 — [이름, 컬럼] */
const INDEXES: [string, string][] = [
    ['IDX_ApiLog_UserId', 'user_id'],
    ['IDX_ApiLog_Path', 'path'],
    ['IDX_ApiLog_CreatedAt', 'created_at'],
];

/**
 * 컬럼 주석 — path 만 버전마다 다르다
 *
 * @param path path 주석
 * @returns [컬럼, 주석]
 */
function columnComments(path: string): [string, string][] {
    return [
        ['api_log_id', '로그 ID'],
        ['created_at', '요청 시각'],
        ['method', 'HTTP 메서드'],
        ['path', path],
        ['request_param', 'path param'],
        ['request_query', 'query string'],
        ['request_body', '요청 body (multipart 의 경우 파일 메타만)'],
        ['status_code', '응답 상태 코드'],
        ['response_body', '응답 body'],
        ['error_stack', 'unhandled 예외의 stack trace'],
        ['user_id', '인증된 사용자 ID (JWT)'],
        ['ip', '클라이언트 IP'],
        ['user_agent', 'User-Agent'],
        ['duration_ms', '처리 시간 (ms)'],
    ];
}

/**
 * t_api_log 를 일반 테이블에서 created_at RANGE 월 파티션 테이블(한국 달)로 바꾼다 — 기존 행은 옮겨 담는다(지우지 않는다).
 * 1) 기존 테이블 · PK · 인덱스 · 시퀀스 이름을 옆으로 2) 같은 정의의 파티션 테이블 + 주석 + 인덱스 3) 이번 달 + 3개월 파티션 · 기본 파티션
 * 4) 기존 행 옮겨 담기 · 시퀀스 잇기 5) 비운 옛 테이블 지우기. down 은 반대로(일반 테이블로).
 */
export class ApiLogPartition1794253561123 implements MigrationInterface {
    name = 'ApiLogPartition1794253561123';

    /**
     * 파티션 테이블로 바꾼다
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        // 1) 기존 테이블을 옆으로 — 새 테이블과 이름이 겹치지 않게 PK · 인덱스 · 시퀀스도 바꾼다
        await queryRunner.query(`ALTER TABLE "t_api_log" RENAME TO "t_api_log_legacy"`);
        await queryRunner.query(`ALTER TABLE "t_api_log_legacy" RENAME CONSTRAINT "PK_ApiLog" TO "PK_ApiLogLegacy"`);
        for (const [index] of INDEXES) {
            await queryRunner.query(`ALTER INDEX "${index}" RENAME TO "${index}Legacy"`);
        }
        await queryRunner.query(`ALTER SEQUENCE "t_api_log_api_log_id_seq" RENAME TO "t_api_log_legacy_api_log_id_seq"`);

        // 2) 파티션 테이블 — 컬럼 · PK · 주석 · 인덱스는 엔티티와 같다
        await queryRunner.query(`CREATE TABLE "t_api_log" (${COLUMN_DEFINITIONS}) PARTITION BY RANGE ("created_at")`);
        await queryRunner.query(`COMMENT ON TABLE "t_api_log" IS 'API 호출 로그'`);
        for (const [column, comment] of columnComments('요청 경로 (라우트 패턴, 없는 경로는 실제 경로)')) {
            await queryRunner.query(`COMMENT ON COLUMN "t_api_log"."${column}" IS '${comment}'`);
        }
        for (const [index, column] of INDEXES) {
            await queryRunner.query(`CREATE INDEX "${index}" ON "t_api_log" ("${column}")`);
        }

        // 3) 이번 달 + 3개월(한국 달) · 범위 밖 행을 받는 기본 파티션
        for (const partition of buildApiLogPartitions(dayjs(), API_LOG_AHEAD_MONTHS)) {
            await queryRunner.query(toCreateApiLogPartitionSql(partition));
        }
        await queryRunner.query(`CREATE TABLE "${API_LOG_DEFAULT_PARTITION}" PARTITION OF "t_api_log" DEFAULT`);

        // 4) 기존 행 옮겨 담기 → 시퀀스를 가장 큰 ID 다음으로
        await queryRunner.query(`INSERT INTO "t_api_log" (${COLUMNS}) SELECT ${COLUMNS} FROM "t_api_log_legacy"`);
        await queryRunner.query(`SELECT setval('"t_api_log_api_log_id_seq"', COALESCE((SELECT MAX("api_log_id") FROM "t_api_log"), 0) + 1, false)`);

        // 5) 비운 옛 테이블(행은 모두 새 테이블에 있다) — 시퀀스도 함께 지워진다
        await queryRunner.query(`DROP TABLE "t_api_log_legacy"`);
    }

    /**
     * 일반 테이블로 되돌린다 — 파티션의 행을 모두 옮겨 담는다
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_api_log" RENAME TO "t_api_log_partitioned"`);
        await queryRunner.query(`ALTER TABLE "t_api_log_partitioned" RENAME CONSTRAINT "PK_ApiLog" TO "PK_ApiLogPartitioned"`);
        for (const [index] of INDEXES) {
            await queryRunner.query(`ALTER INDEX "${index}" RENAME TO "${index}Partitioned"`);
        }
        await queryRunner.query(`ALTER SEQUENCE "t_api_log_api_log_id_seq" RENAME TO "t_api_log_partitioned_api_log_id_seq"`);

        await queryRunner.query(`CREATE TABLE "t_api_log" (${COLUMN_DEFINITIONS})`);
        await queryRunner.query(`COMMENT ON TABLE "t_api_log" IS 'API 호출 로그'`);
        for (const [column, comment] of columnComments('요청 경로 (실제 URL)')) {
            await queryRunner.query(`COMMENT ON COLUMN "t_api_log"."${column}" IS '${comment}'`);
        }
        for (const [index, column] of INDEXES) {
            await queryRunner.query(`CREATE INDEX "${index}" ON "t_api_log" ("${column}")`);
        }

        await queryRunner.query(`INSERT INTO "t_api_log" (${COLUMNS}) SELECT ${COLUMNS} FROM "t_api_log_partitioned"`);
        await queryRunner.query(`SELECT setval('"t_api_log_api_log_id_seq"', COALESCE((SELECT MAX("api_log_id") FROM "t_api_log"), 0) + 1, false)`);
        await queryRunner.query(`DROP TABLE "t_api_log_partitioned"`);
    }
}
```

```ts
// libs/database/src/migrations.ts — import · 배열 끝에 등록
import {ApiLogPartition1794253561123} from './migrations/1794253561123-ApiLogPartition.js';
// …
    ReservationExtension1794157026139,
    ApiLogPartition1794253561123,
];
```

```ts
// libs/common/src/exception/custom-error.filter.ts — 예상 못 한 오류의 stack 을 res.locals 에(게이트웨이 API 로그가 읽는다, 서비스는 읽는 곳이 없다)
import {ArgumentsHost, Catch, ExceptionFilter, HttpException} from '@nestjs/common';
import type {Response} from 'express';
import {toFailResult} from '@app/common/utils/fail-result.js';

/** 예상 못 한 오류(HttpException 이 아닌 Error)의 stack 을 담는 응답 locals 키 — 게이트웨이 API 로그 미들웨어가 읽는다 */
export const ERROR_STACK_LOCAL = 'error_stack';

// … catch() 안
    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();
        const {status_code, body} = toFailResult(exception);
        if (exception instanceof Error && !(exception instanceof HttpException)) {
            response.locals[ERROR_STACK_LOCAL] = exception.stack ?? null;
        }
        response.status(status_code).send(body);
    }
```

### Business Logic (Service) — B. scheduler 파티션 (crontab → repository, service 없음)

```ts
// apps/scheduler/src/api-log/api-log.symbols.ts — 새 파일
/** API 로그 파티션 repository 포트 토큰 — 구현: ApiLogRepository */
export const API_LOG_REPOSITORY = Symbol('ApiLogRepositoryInterface');
```

```ts
// apps/scheduler/src/api-log/interfaces/api-log.repository.interface.ts — 새 파일
import type {ApiLogPartition} from '@app/database/api-log-partition.js';

/**
 * API 로그 파티션 repository 포트(scheduler) — t_api_log 월 파티션을 만든다(지우지 않는다).
 */
export interface ApiLogRepositoryInterface {
    /** 월 파티션 만들기 — 이미 있으면 그대로(IF NOT EXISTS) */
    createPartition(partition: ApiLogPartition): Promise<void>;
}
```

```ts
// apps/scheduler/src/api-log/repositories/api-log.repository.ts — 새 파일
import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {toCreateApiLogPartitionSql} from '@app/database/api-log-partition.js';
import type {ApiLogPartition} from '@app/database/api-log-partition.js';
import type {ApiLogRepositoryInterface} from '../interfaces/api-log.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * API 로그 파티션 repository(scheduler) — DDL 을 실행한다(엔티티 repository 가 아니라 EntityManager.query).
 */
@Injectable()
export class ApiLogRepository implements ApiLogRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /**
     * 월 파티션 만들기 — 그 달의 행이 이미 기본 파티션에 있으면 PostgreSQL 이 거부한다(→ 500, crontab 이 그 달만 건너뛴다)
     *
     * @param partition 파티션
     */
    async createPartition(partition: ApiLogPartition): Promise<void> {
        try {
            await this.txHost.tx.query(toCreateApiLogPartitionSql(partition));
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
```

```ts
// apps/scheduler/src/api-log/crontabs/api-log-partition.crontab.ts — 새 파일
import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {dayjs} from '@app/common/utils/dayjs.js';
import {API_LOG_AHEAD_MONTHS, buildApiLogPartitions} from '@app/database/api-log-partition.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {API_LOG_REPOSITORY} from '../api-log.symbols.js';
import type {ApiLogRepositoryInterface} from '../interfaces/api-log.repository.interface.js';

/** 파티션 만들기 잠금 키 — scheduler 가 여러 대여도 한 회차는 1대만 */
export const API_LOG_PARTITION_LOCK = 'api-log.partition';

/**
 * t_api_log 월 파티션 미리 만들기 — 이번 달 + 앞으로 3개월(한국 달)을 매일 확인해 없으면 만든다. 지우지 않는다(사용자 결정 2026-11-10).
 * 범위 밖 행은 기본 파티션이 받으므로 늦어도 insert 는 실패하지 않는다. 대상은 IF NOT EXISTS 라 두 번 돌아도 같다.
 */
@Injectable()
export class ApiLogPartitionCrontab {
    /**
     * @param apiLogRepository API 로그 파티션 repository 포트
     * @param jobLock 인스턴스 1대 실행 잠금
     */
    constructor(
        @Inject(API_LOG_REPOSITORY)
        private readonly apiLogRepository: ApiLogRepositoryInterface,
        private readonly jobLock: JobLockService,
    ) {}

    /**
     * 매일 03:00(운영 전용) — 파티션 미리 만들기. 그 달의 행이 이미 기본 파티션에 있어 못 만들면 그 달만 건너뛴다.
     */
    @Cron(CronExpression.EVERY_DAY_AT_3AM)
    async ensurePartitions(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(API_LOG_PARTITION_LOCK, async () => {
            for (const partition of buildApiLogPartitions(dayjs(), API_LOG_AHEAD_MONTHS)) {
                try {
                    await this.apiLogRepository.createPartition(partition);
                } catch {
                    // 건별 실패는 건너뛰고 다음 회차에 다시
                }
            }
        });
    }
}
```

```ts
// apps/scheduler/src/api-log/api-log.module.ts — 새 파일
import {Module} from '@nestjs/common';
import {API_LOG_REPOSITORY} from './api-log.symbols.js';
import {ApiLogPartitionCrontab} from './crontabs/api-log-partition.crontab.js';
import {ApiLogRepository} from './repositories/api-log.repository.js';

/**
 * API 로그 도메인(scheduler) — t_api_log 월 파티션 미리 만들기 crontab.
 */
@Module({providers: [ApiLogPartitionCrontab, {provide: API_LOG_REPOSITORY, useClass: ApiLogRepository}]})
export class ApiLogModule {}

// apps/scheduler/src/scheduler.module.ts — import · imports 끝에 ApiLogModule, 주석 도메인 목록에 "ApiLogModule(API 로그 월 파티션 미리 만들기)"
import {ApiLogModule} from './api-log/api-log.module.js';
@Module({imports: [DatabaseModule, ScheduleModule.forRoot(), PaymentModule, DoorStoreModule, SmsModule, UserModule, ReservationModule, ApiLogModule]})
```

### Entry Point (Controller/Handler) — C. gateway 기록 미들웨어 · 로그 전용 적재

```ts
// apps/gateway/src/modules/api-log/api-log.util.ts — 새 파일
import {COMMAND_STREAM_EVENT} from '@app/contracts/message-envelope.js';
import {ApiLogEntity} from '@app/database/entities/api-log/api-log.entity.js';

/** t_api_log.path · user_agent 길이 — 넘치면 insert 가 실패해 로그가 빠지므로 자른다 */
const API_LOG_PATH_MAX = 500;
const API_LOG_USER_AGENT_MAX = 500;

/** 실제 경로를 꺼낼 때 쓰는 origin (URL 파싱용) */
const URL_BASE = 'http://gateway';

/** 로그 한 행을 만들 재료 — 미들웨어가 응답이 끝난 뒤 모은다 */
export interface ApiLogSource {
    created_at: Date;
    method: string;
    route_path: unknown;
    original_url: string;
    params: unknown;
    query: unknown;
    body: unknown;
    status_code: number;
    content_type: string;
    response_text: string;
    error_stack: unknown;
    user_id: string | null;
    ip: string | null;
    user_agent: string | null;
    duration_ms: number;
}

/**
 * 요청의 실제 경로(쿼리 제외).
 *
 * @param originalUrl req.originalUrl
 * @returns 경로
 */
export function toRequestPath(originalUrl: string): string {
    return new URL(originalUrl, URL_BASE).pathname;
}

/**
 * 남기지 않는 경로 — Swagger 문서(`/<path>` · `/<path>/…` · `/<path>-json` …).
 *
 * @param path 실제 경로
 * @param swaggerPath Swagger 경로(SWAGGER_PATH)
 * @returns 남기지 않으면 true
 */
export function isApiLogExcluded(path: string, swaggerPath: string): boolean {
    const swagger = `/${swaggerPath.replace(/^\/+|\/+$/g, '')}`;
    return path === swagger || path.startsWith(`${swagger}/`) || path.startsWith(`${swagger}-`);
}

/**
 * 응답 조각을 모은다 — res.write · res.end 로 들어온 문자열 · Buffer(콜백 등 그 밖은 버린다).
 *
 * @param chunks 모을 곳
 * @param chunk 조각
 */
export function collectApiLogChunk(chunks: Buffer[], chunk: unknown): void {
    if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
    } else if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
    }
}

/**
 * 파일 전용 — JSON 이면 값, 아니면 문자열 그대로.
 *
 * @param text 문자열
 * @returns 값
 */
function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * 파일 전용 — 빈 값(undefined · null · 키 없는 객체)은 null.
 *
 * @param value 값
 * @returns 값 또는 null
 */
function toNullable(value: unknown): unknown {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
        return null;
    }
    return value;
}

/**
 * 파일 전용 — SSE 응답의 마지막 이벤트(`event: x\ndata: {...}\n\n` — transport.util formatSseEvent 형식).
 *
 * @param text SSE 본문
 * @returns 이벤트 또는 null
 */
function parseLastSseEvent(text: string): {event: string; data: unknown} | null {
    const blocks = text.split('\n\n').filter((block) => block.trim() !== '');
    const last = blocks[blocks.length - 1];
    if (!last) {
        return null;
    }
    let event = 'message';
    let data = '';
    for (const line of last.split('\n')) {
        if (line.startsWith('event: ')) {
            event = line.slice('event: '.length);
        } else if (line.startsWith('data: ')) {
            data += line.slice('data: '.length);
        }
    }
    return {event, data: parseJson(data)};
}

/**
 * 파일 전용 — 응답 본문 · 상태. JSON 은 객체, SSE 는 마지막 이벤트(failed 면 그 status_code 를 상태로), 그 밖은 문자열, 없으면 null.
 *
 * @param contentType Content-Type
 * @param text 모은 응답
 * @param statusCode HTTP 상태
 * @returns 상태 · 본문
 */
function toApiLogResponse(contentType: string, text: string, statusCode: number): {status_code: number; response_body: unknown} {
    if (text === '') {
        return {status_code: statusCode, response_body: null};
    }
    if (contentType.includes('text/event-stream')) {
        const event = parseLastSseEvent(text);
        const failed = event?.event === COMMAND_STREAM_EVENT.FAILED ? (event.data as {status_code?: unknown} | null) : null;
        return {status_code: typeof failed?.status_code === 'number' ? failed.status_code : statusCode, response_body: event ?? text};
    }
    if (contentType.includes('application/json')) {
        return {status_code: statusCode, response_body: parseJson(text)};
    }
    return {status_code: statusCode, response_body: text};
}

/**
 * 로그 한 행 — 경로는 맞은 라우트 패턴(없으면 실제 경로), 길이 제한 컬럼은 자른다. 마스킹 없음(beaver memory api-log).
 *
 * @param source 모은 재료
 * @returns 엔티티
 */
export function buildApiLogEntity(source: ApiLogSource): ApiLogEntity {
    const path = typeof source.route_path === 'string' && source.route_path !== '' ? source.route_path : toRequestPath(source.original_url);
    const response = toApiLogResponse(source.content_type, source.response_text, source.status_code);
    const entity = new ApiLogEntity();
    entity.created_at = source.created_at;
    entity.method = source.method;
    entity.path = path.slice(0, API_LOG_PATH_MAX);
    entity.request_param = toNullable(source.params);
    entity.request_query = toNullable(source.query);
    entity.request_body = toNullable(source.body);
    entity.status_code = response.status_code;
    entity.response_body = response.response_body;
    entity.error_stack = typeof source.error_stack === 'string' ? source.error_stack : null;
    entity.user_id = source.user_id;
    entity.ip = source.ip;
    entity.user_agent = source.user_agent === null ? null : source.user_agent.slice(0, API_LOG_USER_AGENT_MAX);
    entity.duration_ms = source.duration_ms;
    return entity;
}
```

```ts
// apps/gateway/src/modules/api-log/api-log.writer.ts — 새 파일
import {Injectable, Logger, OnModuleDestroy} from '@nestjs/common';
import {DataSource} from 'typeorm';
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
            await dataSource.getRepository(ApiLogEntity).insert(entity);
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
```

```ts
// apps/gateway/src/modules/api-log/api-log.middleware.ts — 새 파일
import {Injectable, NestMiddleware} from '@nestjs/common';
import type {NextFunction, Request, Response} from 'express';
import {ERROR_STACK_LOCAL} from '@app/common/exception/custom-error.filter.js';
import {dayjs} from '@app/common/utils/dayjs.js';
import {buildApiLogEntity, collectApiLogChunk, isApiLogExcluded, toRequestPath} from './api-log.util.js';
import {ApiLogWriter} from './api-log.writer.js';

/**
 * API 로그 기록 미들웨어(게이트웨이 인프라) — 모든 HTTP 요청의 응답이 끝나면 한 번 기록해 로그 전용 연결로 넣는다(사용자 결정 2026-11-10).
 * 미들웨어라 가드(401) · 없는 경로(404) · 검증(400)에서 끝난 요청도 지난다. 응답 본문은 res.write · res.end 를 가로채 모은다(JSON · SSE 공통).
 * 넣기는 기다리지 않는다 — 실패하면 그 로그만 빠진다(요청에는 영향 없음).
 */
@Injectable()
export class ApiLogMiddleware implements NestMiddleware {
    /**
     * @param apiLogWriter 로그 전용 적재
     */
    constructor(private readonly apiLogWriter: ApiLogWriter) {}

    /**
     * 요청 시작 — 응답 조각을 모으고, 응답이 끝나면(finish · close 중 먼저 — 한 번) 기록해 넣는다.
     *
     * @param req 요청
     * @param res 응답
     * @param next 다음
     */
    use(req: Request, res: Response, next: NextFunction): void {
        if (isApiLogExcluded(toRequestPath(req.originalUrl), process.env.SWAGGER_PATH || 'swagger')) {
            next();
            return;
        }
        const startedAt = dayjs();
        const chunks: Buffer[] = [];
        const write = res.write.bind(res) as (...args: unknown[]) => boolean;
        const end = res.end.bind(res) as (...args: unknown[]) => Response;
        res.write = ((chunk: unknown, ...rest: unknown[]) => {
            collectApiLogChunk(chunks, chunk);
            return write(chunk, ...rest);
        }) as Response['write'];
        res.end = ((chunk?: unknown, ...rest: unknown[]) => {
            collectApiLogChunk(chunks, chunk);
            return end(chunk, ...rest);
        }) as Response['end'];

        let recorded = false;
        const record = (): void => {
            if (recorded) {
                return;
            }
            recorded = true;
            const entity = buildApiLogEntity({
                created_at: startedAt.toDate(),
                method: req.method,
                route_path: (req.route as {path?: unknown} | undefined)?.path,
                original_url: req.originalUrl,
                params: req.params,
                query: req.query,
                body: req.body,
                status_code: res.statusCode,
                content_type: String(res.getHeader('content-type') ?? ''),
                response_text: Buffer.concat(chunks).toString('utf8'),
                error_stack: res.locals[ERROR_STACK_LOCAL],
                user_id: (req as Request & {user?: {user_id?: string}}).user?.user_id ?? null,
                ip: req.ip ?? null,
                user_agent: req.headers['user-agent'] ?? null,
                duration_ms: dayjs().diff(startedAt),
            });
            void this.apiLogWriter.write(entity);
        };
        res.on('finish', record);
        res.on('close', record);
        next();
    }
}
```

```ts
// apps/gateway/src/modules/api-log/api-log.module.ts — 새 파일
import {Module} from '@nestjs/common';
import {ApiLogMiddleware} from './api-log.middleware.js';
import {ApiLogWriter} from './api-log.writer.js';

/**
 * API 로그(게이트웨이 인프라) — 기록 미들웨어 + 로그 전용 DB 적재. 미들웨어는 GatewayModule.configure 가 모든 경로에 건다.
 */
@Module({providers: [ApiLogWriter, ApiLogMiddleware], exports: [ApiLogMiddleware]})
export class ApiLogModule {}
```

```ts
// apps/gateway/src/gateway.module.ts — ApiLogModule import + NestModule.configure. 주석 "DB 를 쓰지 않는다" → "DB 는 API 로그 적재에만 쓴다(로그 전용 연결)", 목록에 "ApiLogModule: API 로그 기록(모든 HTTP 요청 → t_api_log)"
import {MiddlewareConsumer, Module, NestModule} from '@nestjs/common';
import {ApiLogMiddleware} from './modules/api-log/api-log.middleware.js';
import {ApiLogModule} from './modules/api-log/api-log.module.js';
// …
    imports: [
        MessagingModule.forGateway(),
        TransportModule,
        DoorStoreModule,
        PassportJwtAuthModule,
        ApiLogModule,
        // … 도메인 라우트 모듈 그대로
    ],
})
export class GatewayModule implements NestModule {
    /**
     * 모든 HTTP 요청에 API 로그 기록 미들웨어를 건다(가드보다 먼저 — 401 · 404 도 남는다).
     *
     * @param consumer 미들웨어 등록기
     */
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(ApiLogMiddleware).forRoutes('*');
    }
}
```

```yaml
# compose.gateway.yml — 게이트웨이에 DATABASE_URL 전달(필수), 네트워크 주석 · 빈 값 덮기 정리
#   roomless-data    : Redis(문 소켓의 서버 명령 구독) · PostgreSQL(API 로그 적재 — 로그 전용 연결) 로 나가는 길
        environment:
            # …
            # API 로그 적재(로그 전용 연결, t_api_log 만) — user-service · admin-service 와 같은 DB
            DATABASE_URL: '${DATABASE_URL:?.env 에 DATABASE_URL 이 필요합니다}'
            # …
            # ── 쓰지 않는 비밀값은 전달하지 않는다 (게이트웨이는 비밀번호 해시 · 토큰 암호화 · AWS · 토스를 쓰지 않는다 — DB 는 API 로그만) ──
            # (DATABASE_URL: '' 줄을 지운다)
```

```dotenv
# .env.example — DATABASE_URL 주석
# (필수) 앱이 접속할 DB — 가상 운영은 @postgres, 실제 운영은 RDS 등의 주소. 게이트웨이도 쓴다(API 로그 적재 — 로그 전용 연결 풀 5)
```

### D. 문서

- README: gateway 설명에 API 로그(모든 HTTP 요청 → 응답이 끝난 뒤 로그 전용 연결로 `t_api_log`, 게이트웨이의 유일한 DB 사용 — `DATABASE_URL` 필요), scheduler crontab 목록에 API 로그 월 파티션 미리 만들기(매일 03:00 — 이번 달 + 3개월, 지우지 않음).
- AGENTS.md: Architecture 트리(gateway `modules/api-log/` · scheduler `api-log/` · libs/database `api-log-partition`), "게이트웨이는 DB 를 쓰지 않는다" 류 문장에 API 로그 예외, Docker(`.env`) 절의 게이트웨이 `DATABASE_URL`, Data Layer(월 파티션 테이블 규칙 — 손으로 쓴 마이그레이션 · 이름 `t_<table>_YYYYMM` + default · scheduler 가 미리 만들기 · `is_deleted` 없음 · 지우지 않음), Testing Smoke 목록(scheduler api-log 파티션 DDL).
- docs/architecture.md: 앱 표 · `docs/architecture.md:31`("게이트웨이는 DB 를 쓰지 않는다" → API 로그 예외) · 게이트웨이 트리 · 모듈 문단(gateway · scheduler).
- docs/data-layer.md: 파티션 테이블 절.
- docs/testing.md: Smoke 목록.

---

## Test Cases

```
테스트 생략(규칙): 게이트웨이 미들웨어 · 로그 전용 DB 적재 · util(응답 본문 · SSE 마지막 이벤트 · 경로), libs/database 파티션 util(달 목록), scheduler crontab — AGENTS Testing 이 util · 게이트웨이 인프라 · crontab spec 을 두지 않는다(사용자 결정 2026-11-10 — 규칙대로)
[SMOKE:data-access] scheduler 파티션 만들기 — 받은 달의 DDL(`CREATE TABLE IF NOT EXISTS "t_api_log_202611" PARTITION OF "t_api_log" FOR VALUES FROM ('2026-11-01T00:00:00+09:00') TO ('2026-12-01T00:00:00+09:00')`)을 그대로 실행
[FAIL:repository] scheduler 파티션 DDL 실패는 통일 500
```

프로젝트 형태(spec 위치 · 단언):
- `apps/scheduler/src/api-log/test/api-log.repository.spec.ts`(새)
  - `[SMOKE:data-access]` `createPartition` 이 `txHost.tx.query` 에 넘긴 DDL 전체 고정 — 2026-11(한 번) · 연도 넘김 2026-12 → 2027-01 경계, 호출 1번.
  - `[FAIL:repository]` `query` 실패 → `InternalServerErrorException`(통일 500).
- 스키마: `npm run db:check` — 파티션 테이블(부모)을 TypeORM 이 엔티티와 같게 읽는지(차이 없음) 확인. 설정: `docker compose -f compose.gateway.yml config`(가짜 env)로 `DATABASE_URL` 필수값 확인.

---

## Response Codes

새 HTTP 응답은 없다 — 기록은 기존 응답에 영향을 주지 않는다. 진입점별 결과 계약:

| Entry | 결과 | 실패 |
|---|---|---|
| 게이트웨이 미들웨어 → `ApiLogWriter` | 응답이 끝나면 t_api_log 1행 insert(Swagger 문서 제외) | DB 없음 · 연결 · insert 실패 → 경고 로그, 그 로그만 빠짐(요청 응답 · 부팅 그대로, 다음 로그 때 다시 연결) |
| scheduler `api-log.partition` | 이번 달 + 3개월 파티션 있음(IF NOT EXISTS) | 그 달 행이 기본 파티션에 있으면 그 달만 건너뜀 · 다른 인스턴스 실행 중이면 회차 건너뜀 |
| 마이그레이션 `ApiLogPartition` | 파티션 테이블 + 파티션 4개 + default, 기존 행 옮김 | 적용은 사용자(`db:migrate`) |
