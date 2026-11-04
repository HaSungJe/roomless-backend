import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 문 관리 · QR 확인(로드맵 Phase 15) — 호실 QR 이력 테이블 · 업체 문 소켓 시크릿.
 * - t_room_qr 생성(예약별 이용 시간 QR — 유효 시작 · 종료, UK 예약 · QR, FK 호실 · 예약)
 * - t_store.door_secret 추가(bcrypt 해시, NULL 이면 문 소켓 접속 불가) — 기존 행은 NULL
 * 기존 데이터는 바뀌지 않는다. Redis 의 Phase 14 문 값(QR:상태:시각)은 앱이 뒤의 두 칸만 읽는다(정리 불필요).
 * npm run db:generate 로 엔티티에서 생성했다.
 */
export class RoomQrDoorSecret1793801220826 implements MigrationInterface {
    name = 'RoomQrDoorSecret1793801220826';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "t_room_qr" ("room_qr_id" character varying(32) NOT NULL, "qr" character varying(32) NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "room_id" character varying(32) NOT NULL, "reservation_id" character varying(32) NOT NULL, CONSTRAINT "UK_RoomQr_ReservationId" UNIQUE ("reservation_id"), CONSTRAINT "UK_RoomQr_Qr" UNIQUE ("qr"), CONSTRAINT "CHK_RoomQr_StartsEndsAt" CHECK ("starts_at" <= "ends_at"), CONSTRAINT "PK_RoomQr" PRIMARY KEY ("room_qr_id")); COMMENT ON COLUMN "t_room_qr"."room_qr_id" IS '호실 QR ID'; COMMENT ON COLUMN "t_room_qr"."qr" IS 'QR 정보(32자 무작위 — 예약자 QR 화면의 값, 문 소켓 QR 확인의 열쇠)'; COMMENT ON COLUMN "t_room_qr"."starts_at" IS '유효 시작 — 예약의 이용 시작'; COMMENT ON COLUMN "t_room_qr"."ends_at" IS '유효 종료 — 예약의 이용 끝, 업체가 이용 중 예약을 취소하면 그 시각(이 시각부터 쓸 수 없다)'; COMMENT ON COLUMN "t_room_qr"."created_at" IS '등록일(발급 시각)'; COMMENT ON COLUMN "t_room_qr"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_room_qr"."room_id" IS '호실 ID'; COMMENT ON COLUMN "t_room_qr"."reservation_id" IS '예약 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_RoomQr_RoomId" ON "t_room_qr"  ("room_id") `);
        await queryRunner.query(`COMMENT ON TABLE "t_room_qr" IS '호실 QR(예약별 이용 시간 QR 이력)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "door_secret" character varying(100)`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."door_secret" IS '문 소켓 시크릿 코드(bcrypt 해시) — 업체 총관리자가 정한다. 문 쪽 프로그램이 문 소켓에 붙을 때 확인, NULL 이면 소켓에 붙을 수 없다'`);
        await queryRunner.query(`ALTER TABLE "t_room_qr" ADD CONSTRAINT "FK_RoomQr_Room" FOREIGN KEY ("room_id") REFERENCES "t_room"("room_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_qr" ADD CONSTRAINT "FK_RoomQr_Reservation" FOREIGN KEY ("reservation_id") REFERENCES "t_reservation"("reservation_id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    /**
     * 되돌리기
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_room_qr" DROP CONSTRAINT "FK_RoomQr_Reservation"`);
        await queryRunner.query(`ALTER TABLE "t_room_qr" DROP CONSTRAINT "FK_RoomQr_Room"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."door_secret" IS '문 소켓 시크릿 코드(bcrypt 해시) — 업체 총관리자가 정한다. 문 쪽 프로그램이 문 소켓에 붙을 때 확인, NULL 이면 소켓에 붙을 수 없다'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "door_secret"`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_qr" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_RoomQr_RoomId"`);
        await queryRunner.query(`DROP TABLE "t_room_qr"`);
    }
}
