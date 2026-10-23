import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * store 스키마 (로드맵 Phase 8 #32 ~ #36)
 * - 룩업 t_store_state · t_store_application_state (기본 데이터는 seeder)
 * - t_store — store_state_id · latitude · longitude · introduction · is_always_open · is_open · maintenance_minutes, 주석 "가맹점" → "업체"
 *   (t_store.store_id 주석이 바뀌어 생성기가 FK_User_Store 를 지웠다가 다시 건다)
 * - t_store_application · t_store_image · t_store_hour(CHK_StoreHour_OpenCloseTime) · t_store_break
 * - 기존 t_store 행은 영업중지 · 좌표 0 으로 채운다(손으로 더한 부분 — 이용자에게 노출되지 않고, 총관리자가 고친 뒤 활성으로 바꾼다).
 */
export class StoreSchema1792780576432 implements MigrationInterface {
    name = 'StoreSchema1792780576432';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON TABLE "t_store" IS '업체 정보'`);
        await queryRunner.query(`CREATE TABLE "t_store_application_state" ("store_application_state_id" character varying(20) NOT NULL, "store_application_state_name" character varying(50) NOT NULL, CONSTRAINT "PK_StoreApplicationState" PRIMARY KEY ("store_application_state_id")); COMMENT ON COLUMN "t_store_application_state"."store_application_state_id" IS '입점 신청 상태 ID'; COMMENT ON COLUMN "t_store_application_state"."store_application_state_name" IS '입점 신청 상태명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_application_state" IS '입점 신청 상태'`);
        await queryRunner.query(`CREATE TABLE "t_store_state" ("store_state_id" character varying(20) NOT NULL, "store_state_name" character varying(50) NOT NULL, CONSTRAINT "PK_StoreState" PRIMARY KEY ("store_state_id")); COMMENT ON COLUMN "t_store_state"."store_state_id" IS '업체 상태 ID'; COMMENT ON COLUMN "t_store_state"."store_state_name" IS '업체 상태명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_state" IS '업체 상태'`);
        await queryRunner.query(`CREATE TABLE "t_store_application" ("store_application_id" character varying(32) NOT NULL, "user_id" character varying(32) NOT NULL, "store_name" character varying(100) NOT NULL, "business_number" character varying(10) NOT NULL, "owner_name" character varying(50) NOT NULL, "phone" character varying(30) NOT NULL, "address" character varying(255) NOT NULL, "address_detail" character varying(255), "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "head_manager_name" character varying(50) NOT NULL, "head_manager_phone" character varying(30) NOT NULL, "business_license_image_key" character varying(255) NOT NULL, "application_comment" character varying(500), "reject_comment" character varying(255), "reviewed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_application_state_id" character varying(20) NOT NULL, "store_id" character varying(32), CONSTRAINT "PK_StoreApplication" PRIMARY KEY ("store_application_id")); COMMENT ON COLUMN "t_store_application"."store_application_id" IS '입점 신청 ID'; COMMENT ON COLUMN "t_store_application"."user_id" IS '신청한 이용자 ID(t_user — 다른 서비스 소유라 FK 없음)'; COMMENT ON COLUMN "t_store_application"."store_name" IS '상호명'; COMMENT ON COLUMN "t_store_application"."business_number" IS '사업자등록번호(숫자 10자리)'; COMMENT ON COLUMN "t_store_application"."owner_name" IS '대표자명'; COMMENT ON COLUMN "t_store_application"."phone" IS '업체 연락처'; COMMENT ON COLUMN "t_store_application"."address" IS '주소'; COMMENT ON COLUMN "t_store_application"."address_detail" IS '상세주소'; COMMENT ON COLUMN "t_store_application"."latitude" IS '위도(WGS84 — 클라이언트가 주소 검색으로 구해 보낸다)'; COMMENT ON COLUMN "t_store_application"."longitude" IS '경도(WGS84 — 클라이언트가 주소 검색으로 구해 보낸다)'; COMMENT ON COLUMN "t_store_application"."head_manager_name" IS '업체 총관리자 이름 — 승인 때 만드는 매니저 계정'; COMMENT ON COLUMN "t_store_application"."head_manager_phone" IS '업체 총관리자 휴대폰 번호(숫자만) — 승인 때 만드는 매니저 계정 · 안내 SMS'; COMMENT ON COLUMN "t_store_application"."business_license_image_key" IS '사업자등록증 사진 저장 키(S3)'; COMMENT ON COLUMN "t_store_application"."application_comment" IS '신청 메모'; COMMENT ON COLUMN "t_store_application"."reject_comment" IS '반려 사유'; COMMENT ON COLUMN "t_store_application"."reviewed_at" IS '처리일(승인 · 반려, 대기 NULL)'; COMMENT ON COLUMN "t_store_application"."created_at" IS '신청일'; COMMENT ON COLUMN "t_store_application"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_store_application"."store_application_state_id" IS '입점 신청 상태 ID'; COMMENT ON COLUMN "t_store_application"."store_id" IS '업체 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreApplication_UserId" ON "t_store_application"  ("user_id") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_application" IS '입점 신청'`);
        await queryRunner.query(`CREATE TABLE "t_store_break" ("store_break_id" character varying(32) NOT NULL, "day_of_week" smallint NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "PK_StoreBreak" PRIMARY KEY ("store_break_id")); COMMENT ON COLUMN "t_store_break"."store_break_id" IS '브레이크타임 ID'; COMMENT ON COLUMN "t_store_break"."day_of_week" IS '요일(0: 일 ~ 6: 토) — 브레이크타임이 시작하는 요일'; COMMENT ON COLUMN "t_store_break"."start_time" IS '브레이크 시작 시각(한국 시각, 분 단위)'; COMMENT ON COLUMN "t_store_break"."end_time" IS '브레이크 마감 시각(한국 시각, 분 단위 — 시작보다 이르면 다음 날)'; COMMENT ON COLUMN "t_store_break"."created_at" IS '등록일'; COMMENT ON COLUMN "t_store_break"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_store_break"."store_id" IS '업체 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreBreak_StoreIdDayOfWeek" ON "t_store_break"  ("store_id", "day_of_week") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_break" IS '업체 요일별 브레이크타임'`);
        await queryRunner.query(`CREATE TABLE "t_store_hour" ("store_hour_id" character varying(32) NOT NULL, "day_of_week" smallint NOT NULL, "is_closed" smallint NOT NULL DEFAULT '0', "open_time" TIME, "close_time" TIME, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "UK_StoreHour_StoreIdDayOfWeek" UNIQUE ("store_id", "day_of_week"), CONSTRAINT "CHK_StoreHour_OpenCloseTime" CHECK (("is_closed" = 1 AND "open_time" IS NULL AND "close_time" IS NULL) OR ("is_closed" = 0 AND "open_time" IS NOT NULL AND "close_time" IS NOT NULL)), CONSTRAINT "PK_StoreHour" PRIMARY KEY ("store_hour_id")); COMMENT ON COLUMN "t_store_hour"."store_hour_id" IS '영업시간 ID'; COMMENT ON COLUMN "t_store_hour"."day_of_week" IS '요일(0: 일 ~ 6: 토)'; COMMENT ON COLUMN "t_store_hour"."is_closed" IS '휴무 여부(0: 영업, 1: 휴무 — 시각 NULL)'; COMMENT ON COLUMN "t_store_hour"."open_time" IS '영업 시작 시각(한국 시각, 분 단위 — 휴무가 아니면 close_time 과 세트로 필수, 휴무 NULL)'; COMMENT ON COLUMN "t_store_hour"."close_time" IS '영업 마감 시각(한국 시각, 분 단위 — 시작보다 이르면 다음 날 마감, 휴무가 아니면 open_time 과 세트로 필수, 휴무 NULL)'; COMMENT ON COLUMN "t_store_hour"."created_at" IS '등록일'; COMMENT ON COLUMN "t_store_hour"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_store_hour"."store_id" IS '업체 ID'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_hour" IS '업체 요일별 영업시간'`);
        await queryRunner.query(`CREATE TABLE "t_store_image" ("store_image_id" character varying(32) NOT NULL, "image_key" character varying(255) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "PK_StoreImage" PRIMARY KEY ("store_image_id")); COMMENT ON COLUMN "t_store_image"."store_image_id" IS '업체 사진 ID'; COMMENT ON COLUMN "t_store_image"."image_key" IS '사진 저장 키(S3 — store/<store_id>/<uuid>.jpg)'; COMMENT ON COLUMN "t_store_image"."sort_order" IS '정렬 순서(작을수록 앞, 0: 대표 사진)'; COMMENT ON COLUMN "t_store_image"."created_at" IS '등록일'; COMMENT ON COLUMN "t_store_image"."store_id" IS '업체 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreImage_StoreIdSortOrder" ON "t_store_image"  ("store_id", "sort_order") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_image" IS '업체 사진'`);
        // 기존 행이 있어도 NOT NULL 로 추가되도록 임시 기본값 → 기본값 제거 (엔티티에는 기본값이 없다 — 손으로 고친 부분)
        await queryRunner.query(`ALTER TABLE "t_store" ADD "latitude" double precision NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "latitude" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."latitude" IS '위도(WGS84)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "longitude" double precision NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "longitude" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."longitude" IS '경도(WGS84)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "introduction" text`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."introduction" IS '업체 소개'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "is_always_open" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."is_always_open" IS '24시간 연중무휴 여부(0: 요일별 영업시간 t_store_hour, 1: 24시간 연중무휴 — 영업시간을 두지 않는다)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "is_open" smallint NOT NULL DEFAULT '1'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."is_open" IS '영업중 여부(0: 영업중 아님 — 연중무휴 · 영업시간과 무관하게 영업중 아님으로 본다, 1: 영업중)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "maintenance_minutes" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."maintenance_minutes" IS '정비시간(분) — 퇴실 후 다음 이용까지 호실을 막는 시간'`);
        // 기존 행은 영업중지로 — FK_Store_StoreState 가 기존 행을 받도록 영업중지 룩업 행을 먼저 넣는다(seeder 는 PK 가 있으면 건너뛴다 — 손으로 고친 부분)
        await queryRunner.query(`INSERT INTO "t_store_state" ("store_state_id", "store_state_name") VALUES ('SUSPEND', '영업중지') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "store_state_id" character varying(20) NOT NULL DEFAULT 'SUSPEND'`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "store_state_id" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_state_id" IS '업체 상태 ID'`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "FK_User_Store"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_id" IS '업체 ID'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."phone" IS '업체 연락처'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."store_id" IS '업체 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_Store_LatitudeLongitude" ON "t_store"  ("latitude", "longitude") `);
        await queryRunner.query(`ALTER TABLE "t_store" ADD CONSTRAINT "FK_Store_StoreState" FOREIGN KEY ("store_state_id") REFERENCES "t_store_state"("store_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD CONSTRAINT "FK_StoreApplication_StoreApplicationState" FOREIGN KEY ("store_application_state_id") REFERENCES "t_store_application_state"("store_application_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD CONSTRAINT "FK_StoreApplication_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_break" ADD CONSTRAINT "FK_StoreBreak_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_hour" ADD CONSTRAINT "FK_StoreHour_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_image" ADD CONSTRAINT "FK_StoreImage_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "FK_User_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE RESTRICT ON UPDATE CASCADE`);
    }

    /**
     * 되돌리기 — 새 테이블 · 컬럼 · 제약을 지우고 t_store 주석을 되돌린다. up 이 넣은 SUSPEND 행은 t_store_state 와 함께 사라진다.
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "FK_User_Store"`);
        await queryRunner.query(`ALTER TABLE "t_store_image" DROP CONSTRAINT "FK_StoreImage_Store"`);
        await queryRunner.query(`ALTER TABLE "t_store_hour" DROP CONSTRAINT "FK_StoreHour_Store"`);
        await queryRunner.query(`ALTER TABLE "t_store_break" DROP CONSTRAINT "FK_StoreBreak_Store"`);
        await queryRunner.query(`ALTER TABLE "t_store_application" DROP CONSTRAINT "FK_StoreApplication_Store"`);
        await queryRunner.query(`ALTER TABLE "t_store_application" DROP CONSTRAINT "FK_StoreApplication_StoreApplicationState"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP CONSTRAINT "FK_Store_StoreState"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_Store_LatitudeLongitude"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."store_id" IS '가맹점 ID (UUID v4)'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."phone" IS '가맹점 연락처'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_id" IS '가맹점 ID (UUID v4)'`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "FK_User_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_state_id" IS '업체 상태 ID'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "store_state_id"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."maintenance_minutes" IS '정비시간(분) — 퇴실 후 다음 이용까지 호실을 막는 시간'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "maintenance_minutes"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."is_open" IS '영업중 여부(0: 영업중 아님 — 연중무휴 · 영업시간과 무관하게 영업중 아님으로 본다, 1: 영업중)'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "is_open"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."is_always_open" IS '24시간 연중무휴 여부(0: 요일별 영업시간 t_store_hour, 1: 24시간 연중무휴 — 영업시간을 두지 않는다)'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "is_always_open"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."introduction" IS '업체 소개'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "introduction"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."longitude" IS '경도(WGS84)'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "longitude"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."latitude" IS '위도(WGS84)'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "latitude"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_image" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreImage_StoreIdSortOrder"`);
        await queryRunner.query(`DROP TABLE "t_store_image"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_hour" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_store_hour"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_break" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreBreak_StoreIdDayOfWeek"`);
        await queryRunner.query(`DROP TABLE "t_store_break"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_application" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreApplication_UserId"`);
        await queryRunner.query(`DROP TABLE "t_store_application"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_state" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_store_state"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_application_state" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_store_application_state"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store" IS '가맹점 정보'`);
    }
}
