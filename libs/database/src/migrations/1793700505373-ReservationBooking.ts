import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 예약·결제(로드맵 Phase 17) — 업체 환불 규정 · 연박 박수 · 예약의 환불 비율 · 부분 환불.
 * - t_store.refund_deadline_hours → refund_deadline_minutes(이름 바꾸고 기존 값 × 60, 기본 60) · late_refund_percent(기본 50) 추가
 * - t_room_plan.min_nights · max_nights 추가 — 기존 연박 행은 1 · 30 으로 채운 뒤 CHK_RoomPlan_LongNights, check_out_time 주석(1박은 항상 다음 날 퇴실)
 * - t_reservation.late_refund_percent 추가(기존 행은 50 — 기본값은 남기지 않는다)
 * - t_payment CHK_Payment_Refunded(refund_amount = amount) → CHK_Payment_RefundedAmount(0 < refund_amount ≤ amount)
 * npm run db:generate 로 만든 뒤 이름 바꾸기 · 값 채우기를 손으로 고쳤다(생성기는 DROP + ADD 를 만든다).
 */
export class ReservationBooking1793700505373 implements MigrationInterface {
    name = 'ReservationBooking1793700505373';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        // t_store — 환불 마감을 분으로(데이터 유지) + 마감 뒤 환불 비율
        await queryRunner.query(`ALTER TABLE "t_store" RENAME COLUMN "refund_deadline_hours" TO "refund_deadline_minutes"`);
        await queryRunner.query(`UPDATE "t_store" SET "refund_deadline_minutes" = "refund_deadline_minutes" * 60`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "refund_deadline_minutes" SET DEFAULT '60'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."refund_deadline_minutes" IS '100% 환불 마감(분) — 이용 시작 n분 전까지 취소하면 100% 환불(0 ~ 10,080). 예약할 때 마감 시각을 예약에 저장한다'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "late_refund_percent" smallint NOT NULL DEFAULT '50'`);
        await queryRunner.query(
            `COMMENT ON COLUMN "t_store"."late_refund_percent" IS '마감 뒤 환불 비율(%) — 환불 마감 뒤 ~ 이용 시작 전 취소의 환불 비율(0 ~ 100, 원 단위 내림 — 0 이면 환불 없이 취소). 예약할 때 값을 예약에 저장한다'`,
        );
        // t_room_plan — 연박 박수(기존 연박 행은 기본값으로 채운 뒤 CHECK) · 퇴실 시각 주석
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD "min_nights" smallint`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."min_nights" IS '최소 박수 — 연박(LONG)만(1 ~ 180, 최대 박수 이하). 시간 이용 · 1박은 NULL'`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD "max_nights" smallint`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."max_nights" IS '최대 박수 — 연박(LONG)만(1 ~ 180). 시간 이용 · 1박은 NULL'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."check_out_time" IS '퇴실 시각(한국 시각, 분 단위) — 1박(항상 다음 날) · 연박(마지막 날)만, check_in_time 과 세트. 시간 이용은 NULL'`);
        await queryRunner.query(`UPDATE "t_room_plan" SET "min_nights" = 1, "max_nights" = 30 WHERE "room_plan_type_id" = 'LONG'`);
        await queryRunner.query(
            `ALTER TABLE "t_room_plan" ADD CONSTRAINT "CHK_RoomPlan_LongNights" CHECK (("room_plan_type_id" = 'LONG' AND "min_nights" IS NOT NULL AND "max_nights" IS NOT NULL AND "min_nights" >= 1 AND "min_nights" <= "max_nights") OR ("room_plan_type_id" <> 'LONG' AND "min_nights" IS NULL AND "max_nights" IS NULL))`,
        );
        // t_reservation — 예약 때 마감 뒤 환불 비율(기존 행은 50, 기본값은 남기지 않는다)
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD "late_refund_percent" smallint NOT NULL DEFAULT '50'`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ALTER COLUMN "late_refund_percent" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_reservation"."late_refund_percent" IS '마감 뒤 환불 비율(%) — 예약 때 업체 값, 환불 마감 뒤 ~ 이용 시작 전 취소에 쓴다(0 ~ 100)'`);
        // t_payment — 부분 환불
        await queryRunner.query(`ALTER TABLE "t_payment" DROP CONSTRAINT "CHK_Payment_Refunded"`);
        await queryRunner.query(
            `ALTER TABLE "t_payment" ADD CONSTRAINT "CHK_Payment_RefundedAmount" CHECK ("payment_state_id" <> 'REFUNDED' OR ("refund_amount" > 0 AND "refund_amount" <= "amount" AND "refunded_at" IS NOT NULL))`,
        );
        await queryRunner.query(`COMMENT ON COLUMN "t_payment"."refund_amount" IS '환불 금액(원 — 전액 또는 일부, 환불이 없으면 null)'`);
    }

    /**
     * 되돌리기 — 역순. 환불 마감은 시간으로(올림, 최대 168), 부분 환불 행이 있으면 예전 CHECK 를 다시 걸 수 없어 실패한다.
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "t_payment"."refund_amount" IS '환불 금액(원 — 환불이 없으면 null)'`);
        await queryRunner.query(`ALTER TABLE "t_payment" DROP CONSTRAINT "CHK_Payment_RefundedAmount"`);
        await queryRunner.query(`ALTER TABLE "t_payment" ADD CONSTRAINT "CHK_Payment_Refunded" CHECK ("payment_state_id" <> 'REFUNDED' OR ("refund_amount" = "amount" AND "refunded_at" IS NOT NULL))`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP COLUMN "late_refund_percent"`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP CONSTRAINT "CHK_RoomPlan_LongNights"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."check_out_time" IS '퇴실 시각(한국 시각, 분 단위) — 1박(입실보다 이르면 다음 날) · 연박(마지막 날)만, check_in_time 과 세트. 시간 이용은 NULL'`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP COLUMN "max_nights"`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP COLUMN "min_nights"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "late_refund_percent"`);
        await queryRunner.query(`UPDATE "t_store" SET "refund_deadline_minutes" = LEAST(CEIL("refund_deadline_minutes" / 60.0), 168)`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "refund_deadline_minutes" SET DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "t_store" RENAME COLUMN "refund_deadline_minutes" TO "refund_deadline_hours"`);
        await queryRunner.query(
            `COMMENT ON COLUMN "t_store"."refund_deadline_hours" IS '100% 환불 기준(시간) — 이용 시작 n시간 전까지 환불 신청을 받아 100% 환불, 이후 환불 신청 불가(0 ~ 168). 예약할 때 값을 예약에 저장한다'`,
        );
    }
}
