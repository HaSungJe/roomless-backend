import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 업체 운영 설정(Phase 11).
 * - t_store_break: 요일(day_of_week) 삭제 — 브레이크타임은 요일과 상관없이 매일 같다. 인덱스 IDX_StoreBreak_StoreIdDayOfWeek → IDX_StoreBreak_StoreId. 기존 행은 매일로 남는다.
 * - t_store_unavailable_period: 일시 예약불가(CHK_StoreUnavailablePeriod_StartsAtEndsAt — 시작 < 종료).
 * - t_store_file.file_key COMMENT(업체 사진 키 접두).
 * npm run db:generate 로 엔티티에서 생성한 뒤 down 의 day_of_week 복구(기존 행 — 기본값 0 후 제거 · COMMENT)와 예전 인덱스의 컬럼 순서(store_id, day_of_week)를 손으로 고쳤다.
 */
export class StoreOperation1793037973399 implements MigrationInterface {
    name = 'StoreOperation1793037973399';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreBreak_StoreIdDayOfWeek"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_break" IS '업체 브레이크타임(매일)'`);
        await queryRunner.query(`CREATE TABLE "t_store_unavailable_period" ("store_unavailable_period_id" character varying(32) NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "memo" character varying(30), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "CHK_StoreUnavailablePeriod_StartsAtEndsAt" CHECK ("starts_at" < "ends_at"), CONSTRAINT "PK_StoreUnavailablePeriod" PRIMARY KEY ("store_unavailable_period_id")); COMMENT ON COLUMN "t_store_unavailable_period"."store_unavailable_period_id" IS '일시 예약불가 ID'; COMMENT ON COLUMN "t_store_unavailable_period"."starts_at" IS '시작 일시(분 단위 — 이 시각부터 예약을 받지 않는다)'; COMMENT ON COLUMN "t_store_unavailable_period"."ends_at" IS '종료 일시(분 단위 — 이 시각부터 다시 예약을 받는다, 시작보다 늦다)'; COMMENT ON COLUMN "t_store_unavailable_period"."memo" IS '메모(간단한 사유, 30자)'; COMMENT ON COLUMN "t_store_unavailable_period"."created_at" IS '등록일'; COMMENT ON COLUMN "t_store_unavailable_period"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_store_unavailable_period"."store_id" IS '업체 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreUnavailablePeriod_StoreIdStartsAt" ON "t_store_unavailable_period"  ("store_id", "starts_at") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_unavailable_period" IS '업체 일시 예약불가'`);
        await queryRunner.query(`ALTER TABLE "t_store_break" DROP COLUMN "day_of_week"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_file"."file_key" IS '저장 키(S3 — 비공개 private/store-application/… · private/store/…, 공개 store/application/… · store/<store_id>/…) — 같은 키를 덮어쓰지 않는다'`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreBreak_StoreId" ON "t_store_break"  ("store_id") `);
        await queryRunner.query(`ALTER TABLE "t_store_unavailable_period" ADD CONSTRAINT "FK_StoreUnavailablePeriod_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    /**
     * 되돌리기 — 브레이크 행이 있으면 요일은 0(일요일)으로 채운다
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_store_unavailable_period" DROP CONSTRAINT "FK_StoreUnavailablePeriod_Store"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreBreak_StoreId"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_file"."file_key" IS '저장 키(S3 — 비공개 private/store-application/…, 공개 store/application/…) — 같은 키를 덮어쓰지 않는다'`);
        await queryRunner.query(`ALTER TABLE "t_store_break" ADD "day_of_week" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "t_store_break" ALTER COLUMN "day_of_week" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_break"."day_of_week" IS '요일(0: 일 ~ 6: 토) — 브레이크타임이 시작하는 요일'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_unavailable_period" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreUnavailablePeriod_StoreIdStartsAt"`);
        await queryRunner.query(`DROP TABLE "t_store_unavailable_period"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_break" IS '업체 요일별 브레이크타임'`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreBreak_StoreIdDayOfWeek" ON "t_store_break"  ("store_id", "day_of_week") `);
    }
}
