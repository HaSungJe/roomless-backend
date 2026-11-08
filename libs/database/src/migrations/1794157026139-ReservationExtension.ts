import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 연장(로드맵 Phase 26) — 이용 중 예약을 한 단위씩 늘린다(사용자 결정 2026-11-09).
 * - t_room_plan: is_extendable(연장 가능 여부, 기본 1) · max_extensions(최대 연장 횟수, 기본 3) 추가 + CHECK CHK_RoomPlan_MaxExtensions(1 ~ 10) — 기존 업체 상품 행은 기본값(연장 가능 · 3회)
 * - t_reservation_detail: 부분 유니크 UK_ReservationDetail_ReservationIdPending(예약당 결제 대기 구간 1개 — 겹친 연장 신청 23505)
 * 기존 예약 데이터는 바뀌지 않는다. npm run db:generate 로 엔티티에서 생성했다.
 */
export class ReservationExtension1794157026139 implements MigrationInterface {
    name = 'ReservationExtension1794157026139';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD "is_extendable" smallint NOT NULL DEFAULT '1'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."is_extendable" IS '연장 가능 여부(0: 이 상품 예약은 연장할 수 없다, 1: 연장 가능 — 최대 연장 횟수까지)'`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD "max_extensions" smallint NOT NULL DEFAULT '3'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."max_extensions" IS '최대 연장 횟수(1 ~ 10 — 예약 1건의 확정된 연장 구간 수, 연장 불가여도 값은 남는다)'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_ReservationDetail_ReservationIdPending" ON "t_reservation_detail"  ("reservation_id") WHERE "reservation_state_id" = 'PENDING'`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD CONSTRAINT "CHK_RoomPlan_MaxExtensions" CHECK ("max_extensions" BETWEEN 1 AND 10)`);
    }

    /**
     * 되돌리기
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP CONSTRAINT "CHK_RoomPlan_MaxExtensions"`);
        await queryRunner.query(`DROP INDEX "public"."UK_ReservationDetail_ReservationIdPending"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."max_extensions" IS '최대 연장 횟수(1 ~ 10 — 예약 1건의 확정된 연장 구간 수, 연장 불가여도 값은 남는다)'`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP COLUMN "max_extensions"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."is_extendable" IS '연장 가능 여부(0: 이 상품 예약은 연장할 수 없다, 1: 연장 가능 — 최대 연장 횟수까지)'`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP COLUMN "is_extendable"`);
    }
}
