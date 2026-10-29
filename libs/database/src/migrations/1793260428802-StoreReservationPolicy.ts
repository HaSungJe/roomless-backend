import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 업체 예약 · 환불 규정 · 정지 사유(Phase 11 리비전 261029-1).
 * - t_store.booking_open_hours(기본 72) · refund_deadline_hours(기본 1) — 기존 업체 행은 DB 기본값으로 채워진다
 * - t_store.suspend_comment(정지 사유, NULL)
 * npm run db:generate 로 엔티티에서 생성한 뒤 down 에서 지울 컬럼의 COMMENT 문만 뺐다.
 */
export class StoreReservationPolicy1793260428802 implements MigrationInterface {
    name = 'StoreReservationPolicy1793260428802';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_store" ADD "booking_open_hours" smallint NOT NULL DEFAULT '72'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."booking_open_hours" IS '예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약을 받는다(1 ~ 4,320)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "refund_deadline_hours" smallint NOT NULL DEFAULT '1'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."refund_deadline_hours" IS '100% 환불 기준(시간) — 이용 시작 n시간 전까지 환불 신청을 받아 100% 환불, 이후 환불 신청 불가(0 ~ 168). 예약할 때 값을 예약에 저장한다'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "suspend_comment" character varying(255)`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."suspend_comment" IS '정지 사유 — 영업중지(SUSPEND)일 때만, 업체 관리자에게 보인다'`);
    }

    /**
     * 되돌리기
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "suspend_comment"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "refund_deadline_hours"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "booking_open_hours"`);
    }
}
