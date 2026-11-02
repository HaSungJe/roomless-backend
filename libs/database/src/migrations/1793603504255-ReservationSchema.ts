import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * reservation 스키마 (로드맵 Phase 16 #63 ~ #65) — npm run db:generate 로 엔티티에서 생성
 * - 룩업 t_reservation_state · t_reservation_detail_type · t_payment_state (기본 데이터는 seeder)
 * - t_payment(결제 시도마다 1행 — payment_id = 토스 orderId, 결제 키 UK · 승인 · 환불 · 실패 CHECK, environment 기본값 없음)
 * - t_reservation(예약 1건 — 같은 호실 활성 예약의 [입실, 점유 끝) 겹침 배타 제약, 취소 주체 · 사유 CHECK)
 * - t_reservation_detail(구간 기본 1 + 연장 n — 결제 FK · UK)
 * - btree_gist 확장은 RoomSchema 가 이미 만든다. 기존 데이터는 바꾸지 않는다(새 테이블만)
 */
export class ReservationSchema1793603504255 implements MigrationInterface {
    name = 'ReservationSchema1793603504255';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "t_payment_state" ("payment_state_id" character varying(20) NOT NULL, "payment_state_name" character varying(50) NOT NULL, CONSTRAINT "PK_PaymentState" PRIMARY KEY ("payment_state_id")); COMMENT ON COLUMN "t_payment_state"."payment_state_id" IS '결제 상태 ID'; COMMENT ON COLUMN "t_payment_state"."payment_state_name" IS '결제 상태명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_payment_state" IS '결제 상태'`);
        await queryRunner.query(`CREATE TABLE "t_payment" ("payment_id" character varying(32) NOT NULL, "environment" character varying(10) NOT NULL, "order_name" character varying(100) NOT NULL, "amount" integer NOT NULL, "payment_key" character varying(200), "method" character varying(50), "approved_at" TIMESTAMP WITH TIME ZONE, "receipt_url" character varying(500), "refund_amount" integer, "refund_reason" character varying(200), "refund_requested_at" TIMESTAMP WITH TIME ZONE, "refunded_at" TIMESTAMP WITH TIME ZONE, "failure_code" character varying(100), "failure_message" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "user_id" character varying(32) NOT NULL, "payment_state_id" character varying(20) NOT NULL, CONSTRAINT "UK_Payment_PaymentKey" UNIQUE ("payment_key"), CONSTRAINT "CHK_Payment_Failure" CHECK ("payment_state_id" NOT IN ('FAILED', 'REFUND_FAILED') OR "failure_message" IS NOT NULL), CONSTRAINT "CHK_Payment_Refunded" CHECK ("payment_state_id" <> 'REFUNDED' OR ("refund_amount" = "amount" AND "refunded_at" IS NOT NULL)), CONSTRAINT "CHK_Payment_Approved" CHECK ("payment_state_id" NOT IN ('DONE', 'REFUND_REQUESTED', 'REFUNDED', 'REFUND_FAILED') OR ("payment_key" IS NOT NULL AND "approved_at" IS NOT NULL)), CONSTRAINT "CHK_Payment_Environment" CHECK ("environment" IN ('TEST', 'LIVE')), CONSTRAINT "PK_Payment" PRIMARY KEY ("payment_id")); COMMENT ON COLUMN "t_payment"."payment_id" IS '결제 ID — 토스 orderId 로 그대로 쓴다'; COMMENT ON COLUMN "t_payment"."environment" IS '결제 환경(TEST: 토스 테스트 키 결제, LIVE: 실결제 — 기본값 없음)'; COMMENT ON COLUMN "t_payment"."order_name" IS '주문명(결제 행을 만들 때 스냅샷 — 토스 결제창 orderName 과 같은 값, 100자)'; COMMENT ON COLUMN "t_payment"."amount" IS '결제 금액(원, 스냅샷 — 토스 결제 금액과 같아야 한다)'; COMMENT ON COLUMN "t_payment"."payment_key" IS '토스 결제 키(승인 확인 후 — 조회 · 환불에 쓴다)'; COMMENT ON COLUMN "t_payment"."method" IS '결제 수단(토스 method — 카드 · 간편결제 등)'; COMMENT ON COLUMN "t_payment"."approved_at" IS '승인 시각(토스 approvedAt)'; COMMENT ON COLUMN "t_payment"."receipt_url" IS '토스 영수증 주소'; COMMENT ON COLUMN "t_payment"."refund_amount" IS '환불 금액(원 — 환불이 없으면 null)'; COMMENT ON COLUMN "t_payment"."refund_reason" IS '환불 사유(토스 cancelReason, 200자)'; COMMENT ON COLUMN "t_payment"."refund_requested_at" IS '환불 신청 시각'; COMMENT ON COLUMN "t_payment"."refunded_at" IS '환불 완료 시각(토스 canceledAt)'; COMMENT ON COLUMN "t_payment"."failure_code" IS '마지막 실패 코드(토스 code — 승인 확인 · 환불 실패)'; COMMENT ON COLUMN "t_payment"."failure_message" IS '마지막 실패 사유(토스 message)'; COMMENT ON COLUMN "t_payment"."created_at" IS '등록일'; COMMENT ON COLUMN "t_payment"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_payment"."user_id" IS '사용자 ID'; COMMENT ON COLUMN "t_payment"."payment_state_id" IS '결제 상태 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_Payment_UserIdCreatedAt" ON "t_payment"  ("user_id", "created_at") `);
        await queryRunner.query(`COMMENT ON TABLE "t_payment" IS '결제(토스페이먼츠)'`);
        await queryRunner.query(`CREATE TABLE "t_reservation_detail_type" ("reservation_detail_type_id" character varying(20) NOT NULL, "reservation_detail_type_name" character varying(50) NOT NULL, CONSTRAINT "PK_ReservationDetailType" PRIMARY KEY ("reservation_detail_type_id")); COMMENT ON COLUMN "t_reservation_detail_type"."reservation_detail_type_id" IS '예약 구간 종류 ID'; COMMENT ON COLUMN "t_reservation_detail_type"."reservation_detail_type_name" IS '예약 구간 종류명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_detail_type" IS '예약 구간 종류'`);
        await queryRunner.query(`CREATE TABLE "t_reservation_state" ("reservation_state_id" character varying(20) NOT NULL, "reservation_state_name" character varying(50) NOT NULL, CONSTRAINT "PK_ReservationState" PRIMARY KEY ("reservation_state_id")); COMMENT ON COLUMN "t_reservation_state"."reservation_state_id" IS '예약 상태 ID'; COMMENT ON COLUMN "t_reservation_state"."reservation_state_name" IS '예약 상태명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_state" IS '예약 상태'`);
        await queryRunner.query(`CREATE TABLE "t_reservation" ("reservation_id" character varying(32) NOT NULL, "start_at" TIMESTAMP WITH TIME ZONE NOT NULL, "end_at" TIMESTAMP WITH TIME ZONE NOT NULL, "maintenance_minutes" smallint NOT NULL, "blocked_until" TIMESTAMP WITH TIME ZONE NOT NULL, "total_price" integer NOT NULL, "refund_deadline_at" TIMESTAMP WITH TIME ZONE NOT NULL, "checked_in_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "canceled_at" TIMESTAMP WITH TIME ZONE, "cancel_actor" character varying(10), "cancel_reason" character varying(255), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "user_id" character varying(32) NOT NULL, "store_id" character varying(32) NOT NULL, "room_id" character varying(32) NOT NULL, "room_plan_type_id" character varying(20) NOT NULL, "reservation_state_id" character varying(20) NOT NULL, CONSTRAINT "CHK_Reservation_Cancel" CHECK (("reservation_state_id" = 'CANCELED' AND "canceled_at" IS NOT NULL AND "cancel_actor" IN ('USER', 'STORE') AND "cancel_reason" IS NOT NULL) OR ("reservation_state_id" <> 'CANCELED' AND "canceled_at" IS NULL AND "cancel_actor" IS NULL AND "cancel_reason" IS NULL)), CONSTRAINT "CHK_Reservation_StartEndBlocked" CHECK ("start_at" < "end_at" AND "end_at" <= "blocked_until"), CONSTRAINT "EXC_Reservation_RoomIdBlockedRange" EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_at", "blocked_until", '[)') WITH &&) WHERE ("reservation_state_id" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')), CONSTRAINT "PK_Reservation" PRIMARY KEY ("reservation_id")); COMMENT ON COLUMN "t_reservation"."reservation_id" IS '예약 ID'; COMMENT ON COLUMN "t_reservation"."start_at" IS '입실 시각(기본 구간의 시작)'; COMMENT ON COLUMN "t_reservation"."end_at" IS '최종 체크아웃 시각(마지막 확정 구간의 끝 — 연장이 확정되면 늘어난다)'; COMMENT ON COLUMN "t_reservation"."maintenance_minutes" IS '정비시간(분) — 예약 때 업체 값, 연장해도 이 값으로 점유 끝을 다시 계산한다'; COMMENT ON COLUMN "t_reservation"."blocked_until" IS '점유 끝 — end_at + 정비시간, 이 시각까지 호실을 막는다'; COMMENT ON COLUMN "t_reservation"."total_price" IS '합계 금액(원) — 기본 구간 + 확정된 연장 구간'; COMMENT ON COLUMN "t_reservation"."refund_deadline_at" IS '환불 마감 — 이 시각 전까지 환불 신청 가능(예약 때 업체 환불 기준으로 계산)'; COMMENT ON COLUMN "t_reservation"."checked_in_at" IS '체크인 시각(이용 시간 안의 첫 문 열기)'; COMMENT ON COLUMN "t_reservation"."completed_at" IS '이용 완료 시각(체크아웃 또는 이용 시간 경과)'; COMMENT ON COLUMN "t_reservation"."canceled_at" IS '취소 시각(취소일 때만)'; COMMENT ON COLUMN "t_reservation"."cancel_actor" IS '취소 주체(USER: 이용자, STORE: 업체 — 취소일 때만)'; COMMENT ON COLUMN "t_reservation"."cancel_reason" IS '취소 사유 메모(255자 — 취소일 때만)'; COMMENT ON COLUMN "t_reservation"."created_at" IS '등록일'; COMMENT ON COLUMN "t_reservation"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_reservation"."user_id" IS '사용자 ID'; COMMENT ON COLUMN "t_reservation"."store_id" IS '업체 ID'; COMMENT ON COLUMN "t_reservation"."room_id" IS '호실 ID'; COMMENT ON COLUMN "t_reservation"."room_plan_type_id" IS '상품 종류 ID'; COMMENT ON COLUMN "t_reservation"."reservation_state_id" IS '예약 상태 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_Reservation_StoreIdStartAt" ON "t_reservation"  ("store_id", "start_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_Reservation_UserIdStartAt" ON "t_reservation"  ("user_id", "start_at") `);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation" IS '예약'`);
        await queryRunner.query(`CREATE TABLE "t_reservation_detail" ("reservation_detail_id" character varying(32) NOT NULL, "start_at" TIMESTAMP WITH TIME ZONE NOT NULL, "end_at" TIMESTAMP WITH TIME ZONE NOT NULL, "price" integer NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "reservation_id" character varying(32) NOT NULL, "reservation_detail_type_id" character varying(20) NOT NULL, "room_plan_type_id" character varying(20) NOT NULL, "reservation_state_id" character varying(20) NOT NULL, "payment_id" character varying(32) NOT NULL, CONSTRAINT "UK_ReservationDetail_PaymentId" UNIQUE ("payment_id"), CONSTRAINT "CHK_ReservationDetail_State" CHECK ("reservation_state_id" IN ('PENDING', 'CONFIRMED', 'CANCELED', 'EXPIRED')), CONSTRAINT "CHK_ReservationDetail_StartEnd" CHECK ("start_at" < "end_at"), CONSTRAINT "PK_ReservationDetail" PRIMARY KEY ("reservation_detail_id")); COMMENT ON COLUMN "t_reservation_detail"."reservation_detail_id" IS '예약 구간 ID'; COMMENT ON COLUMN "t_reservation_detail"."start_at" IS '구간 시작 시각'; COMMENT ON COLUMN "t_reservation_detail"."end_at" IS '구간 끝 시각'; COMMENT ON COLUMN "t_reservation_detail"."price" IS '구간 금액(원) — 예약 때 적용 가격'; COMMENT ON COLUMN "t_reservation_detail"."expires_at" IS '결제 대기 만료 시각 — 이때까지 결제가 확인되지 않으면 만료'; COMMENT ON COLUMN "t_reservation_detail"."created_at" IS '등록일'; COMMENT ON COLUMN "t_reservation_detail"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_reservation_detail"."reservation_id" IS '예약 ID'; COMMENT ON COLUMN "t_reservation_detail"."reservation_detail_type_id" IS '예약 구간 종류 ID'; COMMENT ON COLUMN "t_reservation_detail"."room_plan_type_id" IS '상품 종류 ID'; COMMENT ON COLUMN "t_reservation_detail"."reservation_state_id" IS '예약 상태 ID'; COMMENT ON COLUMN "t_reservation_detail"."payment_id" IS '결제 ID — 토스 orderId 로 그대로 쓴다'`);
        await queryRunner.query(`CREATE INDEX "IDX_ReservationDetail_ReservationId" ON "t_reservation_detail"  ("reservation_id") `);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_detail" IS '예약 구간(기본 · 연장)'`);
        await queryRunner.query(`ALTER TABLE "t_payment" ADD CONSTRAINT "FK_Payment_User" FOREIGN KEY ("user_id") REFERENCES "t_user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_payment" ADD CONSTRAINT "FK_Payment_PaymentState" FOREIGN KEY ("payment_state_id") REFERENCES "t_payment_state"("payment_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD CONSTRAINT "FK_Reservation_User" FOREIGN KEY ("user_id") REFERENCES "t_user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD CONSTRAINT "FK_Reservation_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD CONSTRAINT "FK_Reservation_Room" FOREIGN KEY ("room_id") REFERENCES "t_room"("room_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD CONSTRAINT "FK_Reservation_RoomPlanType" FOREIGN KEY ("room_plan_type_id") REFERENCES "t_room_plan_type"("room_plan_type_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD CONSTRAINT "FK_Reservation_ReservationState" FOREIGN KEY ("reservation_state_id") REFERENCES "t_reservation_state"("reservation_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" ADD CONSTRAINT "FK_ReservationDetail_Reservation" FOREIGN KEY ("reservation_id") REFERENCES "t_reservation"("reservation_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" ADD CONSTRAINT "FK_ReservationDetail_ReservationDetailType" FOREIGN KEY ("reservation_detail_type_id") REFERENCES "t_reservation_detail_type"("reservation_detail_type_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" ADD CONSTRAINT "FK_ReservationDetail_RoomPlanType" FOREIGN KEY ("room_plan_type_id") REFERENCES "t_room_plan_type"("room_plan_type_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" ADD CONSTRAINT "FK_ReservationDetail_ReservationState" FOREIGN KEY ("reservation_state_id") REFERENCES "t_reservation_state"("reservation_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" ADD CONSTRAINT "FK_ReservationDetail_Payment" FOREIGN KEY ("payment_id") REFERENCES "t_payment"("payment_id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    /**
     * 되돌리기
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" DROP CONSTRAINT "FK_ReservationDetail_Payment"`);
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" DROP CONSTRAINT "FK_ReservationDetail_ReservationState"`);
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" DROP CONSTRAINT "FK_ReservationDetail_RoomPlanType"`);
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" DROP CONSTRAINT "FK_ReservationDetail_ReservationDetailType"`);
        await queryRunner.query(`ALTER TABLE "t_reservation_detail" DROP CONSTRAINT "FK_ReservationDetail_Reservation"`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP CONSTRAINT "FK_Reservation_ReservationState"`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP CONSTRAINT "FK_Reservation_RoomPlanType"`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP CONSTRAINT "FK_Reservation_Room"`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP CONSTRAINT "FK_Reservation_Store"`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP CONSTRAINT "FK_Reservation_User"`);
        await queryRunner.query(`ALTER TABLE "t_payment" DROP CONSTRAINT "FK_Payment_PaymentState"`);
        await queryRunner.query(`ALTER TABLE "t_payment" DROP CONSTRAINT "FK_Payment_User"`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_detail" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ReservationDetail_ReservationId"`);
        await queryRunner.query(`DROP TABLE "t_reservation_detail"`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_Reservation_UserIdStartAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_Reservation_StoreIdStartAt"`);
        await queryRunner.query(`DROP TABLE "t_reservation"`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_state" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_reservation_state"`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_detail_type" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_reservation_detail_type"`);
        await queryRunner.query(`COMMENT ON TABLE "t_payment" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_Payment_UserIdCreatedAt"`);
        await queryRunner.query(`DROP TABLE "t_payment"`);
        await queryRunner.query(`COMMENT ON TABLE "t_payment_state" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_payment_state"`);
    }
}
