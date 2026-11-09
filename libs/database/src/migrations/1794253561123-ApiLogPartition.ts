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
 * db:generate 는 파티션 테이블을 만들지 못해 손으로 쓴 마이그레이션이다.
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
