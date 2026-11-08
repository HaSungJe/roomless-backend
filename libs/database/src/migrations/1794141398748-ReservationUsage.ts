import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 이용(로드맵 Phase 19) — 체크인 · 체크아웃 없이 예약 시간이 곧 이용(사용자 결정 2026-11-07).
 * - t_door_open_log 생성(QR 로 문을 연 기록 — 호실 · 예약 · QR · 시각, FK 호실 · 예약 · QR)
 * - t_reservation_cancel_request_state(룩업 — 시드는 user-service 부팅) · t_reservation_cancel_request(이용 중 예약 업체 취소 요청 — 진행 중 부분 유니크) 생성
 * - t_reservation: checked_in_at · completed_at 삭제(값을 쓰는 코드가 없었다), qr_link_sent_at 추가(QR 확인 링크 SMS 보낸 시각), start_at · end_at 주석
 * 기존 예약 데이터는 바뀌지 않는다. npm run db:generate 로 엔티티에서 생성했고, 생성기가 넣은 예약 인덱스 2개의 같은 정의 재생성(지우고 다시 만들기)은 뺐다.
 */
export class ReservationUsage1794141398748 implements MigrationInterface {
    name = 'ReservationUsage1794141398748';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "t_door_open_log" ("door_open_log_id" character varying(32) NOT NULL, "opened_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "room_id" character varying(32) NOT NULL, "reservation_id" character varying(32) NOT NULL, "room_qr_id" character varying(32) NOT NULL, CONSTRAINT "PK_DoorOpenLog" PRIMARY KEY ("door_open_log_id")); COMMENT ON COLUMN "t_door_open_log"."door_open_log_id" IS '문 열림 기록 ID'; COMMENT ON COLUMN "t_door_open_log"."opened_at" IS '문을 연 시각(QR 확인이 맞은 시각)'; COMMENT ON COLUMN "t_door_open_log"."created_at" IS '등록일'; COMMENT ON COLUMN "t_door_open_log"."room_id" IS '호실 ID'; COMMENT ON COLUMN "t_door_open_log"."reservation_id" IS '예약 ID'; COMMENT ON COLUMN "t_door_open_log"."room_qr_id" IS '호실 QR ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_DoorOpenLog_ReservationId" ON "t_door_open_log"  ("reservation_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_DoorOpenLog_RoomIdOpenedAt" ON "t_door_open_log"  ("room_id", "opened_at") `);
        await queryRunner.query(`COMMENT ON TABLE "t_door_open_log" IS 'QR 로 문을 연 기록'`);
        await queryRunner.query(`CREATE TABLE "t_reservation_cancel_request_state" ("reservation_cancel_request_state_id" character varying(20) NOT NULL, "reservation_cancel_request_state_name" character varying(50) NOT NULL, CONSTRAINT "PK_ReservationCancelRequestState" PRIMARY KEY ("reservation_cancel_request_state_id")); COMMENT ON COLUMN "t_reservation_cancel_request_state"."reservation_cancel_request_state_id" IS '요청 상태 ID'; COMMENT ON COLUMN "t_reservation_cancel_request_state"."reservation_cancel_request_state_name" IS '요청 상태명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_cancel_request_state" IS '이용 중 취소 요청 상태'`);
        await queryRunner.query(`CREATE TABLE "t_reservation_cancel_request" ("reservation_cancel_request_id" character varying(32) NOT NULL, "cancel_reason" character varying(255) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "responded_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "reservation_id" character varying(32) NOT NULL, "user_id" character varying(32) NOT NULL, "reservation_cancel_request_state_id" character varying(20) NOT NULL, CONSTRAINT "PK_ReservationCancelRequest" PRIMARY KEY ("reservation_cancel_request_id")); COMMENT ON COLUMN "t_reservation_cancel_request"."reservation_cancel_request_id" IS '취소 요청 ID'; COMMENT ON COLUMN "t_reservation_cancel_request"."cancel_reason" IS '취소 사유(255자 — 예약자 승인 화면에 보인다, 승인하면 예약의 취소 사유)'; COMMENT ON COLUMN "t_reservation_cancel_request"."expires_at" IS '만료 시각 — 요청 + 10분, 예약 끝이 먼저면 예약 끝(이 시각부터 승인 · 거절할 수 없다)'; COMMENT ON COLUMN "t_reservation_cancel_request"."responded_at" IS '예약자가 승인 · 거절한 시각(그 전 NULL)'; COMMENT ON COLUMN "t_reservation_cancel_request"."created_at" IS '등록일(요청 시각)'; COMMENT ON COLUMN "t_reservation_cancel_request"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_reservation_cancel_request"."reservation_id" IS '예약 ID'; COMMENT ON COLUMN "t_reservation_cancel_request"."user_id" IS '사용자 ID'; COMMENT ON COLUMN "t_reservation_cancel_request"."reservation_cancel_request_state_id" IS '요청 상태 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_ReservationCancelRequest_ReservationIdCreatedAt" ON "t_reservation_cancel_request"  ("reservation_id", "created_at") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_ReservationCancelRequest_ReservationIdRequested" ON "t_reservation_cancel_request"  ("reservation_id") WHERE "reservation_cancel_request_state_id" = 'REQUESTED'`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_cancel_request" IS '이용 중 예약 업체 취소 요청(이용자 동의)'`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP COLUMN "checked_in_at"`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP COLUMN "completed_at"`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD "qr_link_sent_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "t_reservation"."qr_link_sent_at" IS 'QR 확인 링크 SMS 를 보낸 시각(예약당 1번 — 보내기 전 NULL)'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_reservation"."start_at" IS '이용 시작 시각(기본 구간의 시작 — 이 시각에 이용 중)'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_reservation"."end_at" IS '이용 끝 시각(마지막 확정 구간의 끝 — 연장이 확정되면 늘어난다, 이 시각에 이용 완료)'`);
        await queryRunner.query(`ALTER TABLE "t_door_open_log" ADD CONSTRAINT "FK_DoorOpenLog_Room" FOREIGN KEY ("room_id") REFERENCES "t_room"("room_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_door_open_log" ADD CONSTRAINT "FK_DoorOpenLog_Reservation" FOREIGN KEY ("reservation_id") REFERENCES "t_reservation"("reservation_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_door_open_log" ADD CONSTRAINT "FK_DoorOpenLog_RoomQr" FOREIGN KEY ("room_qr_id") REFERENCES "t_room_qr"("room_qr_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation_cancel_request" ADD CONSTRAINT "FK_ReservationCancelRequest_Reservation" FOREIGN KEY ("reservation_id") REFERENCES "t_reservation"("reservation_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation_cancel_request" ADD CONSTRAINT "FK_ReservationCancelRequest_User" FOREIGN KEY ("user_id") REFERENCES "t_user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_reservation_cancel_request" ADD CONSTRAINT "FK_ReservationCancelRequest_ReservationCancelRequestState" FOREIGN KEY ("reservation_cancel_request_state_id") REFERENCES "t_reservation_cancel_request_state"("reservation_cancel_request_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    /**
     * 되돌리기
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_reservation_cancel_request" DROP CONSTRAINT "FK_ReservationCancelRequest_ReservationCancelRequestState"`);
        await queryRunner.query(`ALTER TABLE "t_reservation_cancel_request" DROP CONSTRAINT "FK_ReservationCancelRequest_User"`);
        await queryRunner.query(`ALTER TABLE "t_reservation_cancel_request" DROP CONSTRAINT "FK_ReservationCancelRequest_Reservation"`);
        await queryRunner.query(`ALTER TABLE "t_door_open_log" DROP CONSTRAINT "FK_DoorOpenLog_RoomQr"`);
        await queryRunner.query(`ALTER TABLE "t_door_open_log" DROP CONSTRAINT "FK_DoorOpenLog_Reservation"`);
        await queryRunner.query(`ALTER TABLE "t_door_open_log" DROP CONSTRAINT "FK_DoorOpenLog_Room"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_reservation"."end_at" IS '최종 체크아웃 시각(마지막 확정 구간의 끝 — 연장이 확정되면 늘어난다)'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_reservation"."start_at" IS '입실 시각(기본 구간의 시작)'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_reservation"."qr_link_sent_at" IS 'QR 확인 링크 SMS 를 보낸 시각(예약당 1번 — 보내기 전 NULL)'`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP COLUMN "qr_link_sent_at"`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD "completed_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD "checked_in_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_cancel_request" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."UK_ReservationCancelRequest_ReservationIdRequested"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ReservationCancelRequest_ReservationIdCreatedAt"`);
        await queryRunner.query(`DROP TABLE "t_reservation_cancel_request"`);
        await queryRunner.query(`COMMENT ON TABLE "t_reservation_cancel_request_state" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_reservation_cancel_request_state"`);
        await queryRunner.query(`COMMENT ON TABLE "t_door_open_log" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_DoorOpenLog_RoomIdOpenedAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_DoorOpenLog_ReservationId"`);
        await queryRunner.query(`DROP TABLE "t_door_open_log"`);
    }
}
