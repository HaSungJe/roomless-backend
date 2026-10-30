import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * room 스키마 (로드맵 Phase 12 #48 ~ #52) + 편의시설 이동 + 기존 store 테이블 소프트 삭제
 * - btree_gist 확장(기간 겹침 배타 제약 — 적용 계정에 확장 생성 권한이 필요하다)
 * - 룩업 t_room_state · t_room_plan_type (기본 데이터는 seeder — 상품 종류 3행은 기존 업체의 업체 상품 설정 FK 때문에 여기서도 넣는다)
 * - t_room_group · t_room_group_image · t_room · t_room_plan(업체 상품 설정) · t_room_group_plan · t_room_group_plan_price(기간 겹침 배타 제약)
 * - 기존 업체마다 업체 상품 설정 3행(입점 승인과 같은 기본값 — 판매 · 매일 · 시간 이용 3시간 · 1박 22:00 ~ 09:00 · 연박 15:00 ~ 11:00)
 * - t_store.store_detail 삭제 — 편의시설은 객실 그룹 상세정보(t_room_group.room_group_detail)로 옮긴다. 기존 값은 옮기지 않는다(받을 그룹이 아직 없다)
 * - t_store_application · t_store_file · t_store_hour · t_store_break · t_store_unavailable_period 에 is_deleted(소프트 삭제), t_store_file 에 updated_at(기존 행은 등록일),
 *   UK_StoreHour_StoreIdDayOfWeek 는 지워지지 않은 행끼리의 부분 유니크 인덱스로
 */
export class RoomSchema1793386485207 implements MigrationInterface {
    name = 'RoomSchema1793386485207';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        // ── 손으로 더한 부분: 배타 제약(EXC_RoomGroupPlanPrice_…)의 varchar 같음(WITH =)을 gist 로 쓰는 확장
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);
        // ── 여기부터 생성 그대로(손으로 고친 곳은 표시)
        await queryRunner.query(`ALTER TABLE "t_store_hour" DROP CONSTRAINT "UK_StoreHour_StoreIdDayOfWeek"`);
        await queryRunner.query(`CREATE TABLE "t_room_group" ("room_group_id" character varying(32) NOT NULL, "room_group_name" character varying(100) NOT NULL, "description" text, "room_group_detail" jsonb NOT NULL DEFAULT '{}', "is_deleted" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "PK_RoomGroup" PRIMARY KEY ("room_group_id")); COMMENT ON COLUMN "t_room_group"."room_group_id" IS '객실 그룹 ID'; COMMENT ON COLUMN "t_room_group"."room_group_name" IS '그룹명(업체 안에서 지워지지 않은 그룹끼리 유일)'; COMMENT ON COLUMN "t_room_group"."description" IS '설명'; COMMENT ON COLUMN "t_room_group"."room_group_detail" IS '상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다. 없는 항목은 조회 뒤 기본값 — 방 1 · 나머지 1)'; COMMENT ON COLUMN "t_room_group"."is_deleted" IS '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 예약 이력 때문에 행을 남긴다)'; COMMENT ON COLUMN "t_room_group"."created_at" IS '등록일'; COMMENT ON COLUMN "t_room_group"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_room_group"."store_id" IS '업체 ID'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_RoomGroup_StoreIdRoomGroupName" ON "t_room_group"  ("store_id", "room_group_name") WHERE "is_deleted" = 0`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group" IS '객실 그룹'`);
        await queryRunner.query(`CREATE TABLE "t_room_group_image" ("room_group_image_id" character varying(32) NOT NULL, "file_key" character varying(255) NOT NULL, "file_name" character varying(255) NOT NULL, "content_type" character varying(100) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "is_deleted" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "room_group_id" character varying(32) NOT NULL, CONSTRAINT "UK_RoomGroupImage_FileKey" UNIQUE ("file_key"), CONSTRAINT "PK_RoomGroupImage" PRIMARY KEY ("room_group_image_id")); COMMENT ON COLUMN "t_room_group_image"."room_group_image_id" IS '객실 그룹 사진 ID'; COMMENT ON COLUMN "t_room_group_image"."file_key" IS '저장 키(S3 공개 store/<store_id>/room-group/<room_group_id>/…) — 같은 키를 덮어쓰지 않는다'; COMMENT ON COLUMN "t_room_group_image"."file_name" IS '원본 파일명'; COMMENT ON COLUMN "t_room_group_image"."content_type" IS 'MIME 타입(image/jpeg · image/png)'; COMMENT ON COLUMN "t_room_group_image"."sort_order" IS '정렬 순서(0부터 — 0 이 대표, 지워지지 않은 사진끼리)'; COMMENT ON COLUMN "t_room_group_image"."is_deleted" IS '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, S3 객체는 실제로 지운다)'; COMMENT ON COLUMN "t_room_group_image"."created_at" IS '등록일'; COMMENT ON COLUMN "t_room_group_image"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_room_group_image"."room_group_id" IS '객실 그룹 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_RoomGroupImage_RoomGroupIdSortOrder" ON "t_room_group_image"  ("room_group_id", "sort_order") `);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group_image" IS '객실 그룹 사진'`);
        await queryRunner.query(`CREATE TABLE "t_room_plan_type" ("room_plan_type_id" character varying(20) NOT NULL, "room_plan_type_name" character varying(50) NOT NULL, CONSTRAINT "PK_RoomPlanType" PRIMARY KEY ("room_plan_type_id")); COMMENT ON COLUMN "t_room_plan_type"."room_plan_type_id" IS '상품 종류 ID'; COMMENT ON COLUMN "t_room_plan_type"."room_plan_type_name" IS '상품 종류명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_plan_type" IS '상품 종류'`);
        await queryRunner.query(`CREATE TABLE "t_room_group_plan" ("room_group_plan_id" character varying(32) NOT NULL, "is_used" smallint NOT NULL DEFAULT '0', "price" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "room_group_id" character varying(32) NOT NULL, "room_plan_type_id" character varying(20) NOT NULL, CONSTRAINT "UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId" UNIQUE ("room_group_id", "room_plan_type_id"), CONSTRAINT "PK_RoomGroupPlan" PRIMARY KEY ("room_group_plan_id")); COMMENT ON COLUMN "t_room_group_plan"."room_group_plan_id" IS '그룹 상품 ID'; COMMENT ON COLUMN "t_room_group_plan"."is_used" IS '사용 여부(0: 이 그룹은 이 종류를 팔지 않음, 1: 판매 — 업체 상품 설정도 사용 중이어야 판다)'; COMMENT ON COLUMN "t_room_group_plan"."price" IS '기본 요금(원) — 시간 이용 1회 · 1박 · 연박 1박당'; COMMENT ON COLUMN "t_room_group_plan"."created_at" IS '등록일'; COMMENT ON COLUMN "t_room_group_plan"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_room_group_plan"."room_group_id" IS '객실 그룹 ID'; COMMENT ON COLUMN "t_room_group_plan"."room_plan_type_id" IS '상품 종류 ID'`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group_plan" IS '그룹 상품'`);
        await queryRunner.query(`CREATE TABLE "t_room_group_plan_price" ("room_group_plan_price_id" character varying(32) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "price" integer NOT NULL, "memo" character varying(30), "is_deleted" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "room_group_plan_id" character varying(32) NOT NULL, CONSTRAINT "CHK_RoomGroupPlanPrice_StartDateEndDate" CHECK ("start_date" <= "end_date"), CONSTRAINT "EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange" EXCLUDE USING gist ("room_group_plan_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&) WHERE ("is_deleted" = 0), CONSTRAINT "PK_RoomGroupPlanPrice" PRIMARY KEY ("room_group_plan_price_id")); COMMENT ON COLUMN "t_room_group_plan_price"."room_group_plan_price_id" IS '기간 가격 ID'; COMMENT ON COLUMN "t_room_group_plan_price"."start_date" IS '시작 날짜(한국 날짜, 포함)'; COMMENT ON COLUMN "t_room_group_plan_price"."end_date" IS '종료 날짜(한국 날짜, 포함 — 시작 날짜와 같거나 늦다)'; COMMENT ON COLUMN "t_room_group_plan_price"."price" IS '이 기간의 요금(원) — 기본 요금 대신'; COMMENT ON COLUMN "t_room_group_plan_price"."memo" IS '메모(예: 여름 성수기, 30자)'; COMMENT ON COLUMN "t_room_group_plan_price"."is_deleted" IS '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 겹침 검사는 정상 행끼리)'; COMMENT ON COLUMN "t_room_group_plan_price"."created_at" IS '등록일'; COMMENT ON COLUMN "t_room_group_plan_price"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_room_group_plan_price"."room_group_plan_id" IS '그룹 상품 ID'`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group_plan_price" IS '상품별 기간 가격'`);
        await queryRunner.query(`CREATE TABLE "t_room_plan" ("room_plan_id" character varying(32) NOT NULL, "is_used" smallint NOT NULL DEFAULT '1', "days_of_week" smallint NOT NULL DEFAULT '127', "usage_hours" smallint, "check_in_time" TIME, "check_out_time" TIME, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, "room_plan_type_id" character varying(20) NOT NULL, CONSTRAINT "UK_RoomPlan_StoreIdRoomPlanTypeId" UNIQUE ("store_id", "room_plan_type_id"), CONSTRAINT "CHK_RoomPlan_UsageHoursCheckInOutTime" CHECK (("room_plan_type_id" = 'HOURLY' AND "usage_hours" IS NOT NULL AND "check_in_time" IS NULL AND "check_out_time" IS NULL) OR ("room_plan_type_id" <> 'HOURLY' AND "usage_hours" IS NULL AND "check_in_time" IS NOT NULL AND "check_out_time" IS NOT NULL)), CONSTRAINT "PK_RoomPlan" PRIMARY KEY ("room_plan_id")); COMMENT ON COLUMN "t_room_plan"."room_plan_id" IS '업체 상품 설정 ID'; COMMENT ON COLUMN "t_room_plan"."is_used" IS '사용 여부(0: 이 업체는 이 종류를 팔지 않음 — 그룹 상품이 사용 중이어도 팔지 않는다, 1: 판매)'; COMMENT ON COLUMN "t_room_plan"."days_of_week" IS '예약 가능 요일(비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127)'; COMMENT ON COLUMN "t_room_plan"."usage_hours" IS '이용 시간(시간) — 시간 이용(HOURLY)만, 1회 이용 · 연장이 이 시간만큼. 1박 · 연박은 NULL'; COMMENT ON COLUMN "t_room_plan"."check_in_time" IS '입실 시각(한국 시각, 분 단위) — 1박 · 연박(첫날)만, check_out_time 과 세트. 시간 이용은 NULL'; COMMENT ON COLUMN "t_room_plan"."check_out_time" IS '퇴실 시각(한국 시각, 분 단위) — 1박(입실보다 이르면 다음 날) · 연박(마지막 날)만, check_in_time 과 세트. 시간 이용은 NULL'; COMMENT ON COLUMN "t_room_plan"."created_at" IS '등록일'; COMMENT ON COLUMN "t_room_plan"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_room_plan"."store_id" IS '업체 ID'; COMMENT ON COLUMN "t_room_plan"."room_plan_type_id" IS '상품 종류 ID'`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_plan" IS '업체 상품 설정'`);
        await queryRunner.query(`CREATE TABLE "t_room_state" ("room_state_id" character varying(20) NOT NULL, "room_state_name" character varying(50) NOT NULL, CONSTRAINT "PK_RoomState" PRIMARY KEY ("room_state_id")); COMMENT ON COLUMN "t_room_state"."room_state_id" IS '호실 상태 ID'; COMMENT ON COLUMN "t_room_state"."room_state_name" IS '호실 상태명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_state" IS '호실 상태'`);
        await queryRunner.query(`CREATE TABLE "t_room" ("room_id" character varying(32) NOT NULL, "room_name" character varying(50) NOT NULL, "floor" smallint NOT NULL, "is_deleted" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, "room_group_id" character varying(32) NOT NULL, "room_state_id" character varying(20) NOT NULL, CONSTRAINT "PK_Room" PRIMARY KEY ("room_id")); COMMENT ON COLUMN "t_room"."room_id" IS '호실 ID'; COMMENT ON COLUMN "t_room"."room_name" IS '호실명(예: 101호 — 업체 안에서 지워지지 않은 호실끼리 유일)'; COMMENT ON COLUMN "t_room"."floor" IS '층(정수 — 지하는 음수, B1 = -1)'; COMMENT ON COLUMN "t_room"."is_deleted" IS '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 예약 이력 때문에 행을 남긴다)'; COMMENT ON COLUMN "t_room"."created_at" IS '등록일'; COMMENT ON COLUMN "t_room"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_room"."store_id" IS '업체 ID'; COMMENT ON COLUMN "t_room"."room_group_id" IS '객실 그룹 ID'; COMMENT ON COLUMN "t_room"."room_state_id" IS '호실 상태 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_Room_RoomGroupId" ON "t_room"  ("room_group_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_Room_StoreIdFloor" ON "t_room"  ("store_id", "floor") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_Room_StoreIdRoomName" ON "t_room"  ("store_id", "room_name") WHERE "is_deleted" = 0`);
        await queryRunner.query(`COMMENT ON TABLE "t_room" IS '호실'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "store_detail"`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."is_deleted" IS '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 신청 취소)'`);
        await queryRunner.query(`ALTER TABLE "t_store_break" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_break"."is_deleted" IS '삭제여부(0: 정상, 1: 삭제 — 교체 때 기존 행을 삭제 표시)'`);
        await queryRunner.query(`ALTER TABLE "t_store_file" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_file"."is_deleted" IS '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, S3 객체는 실제로 지운다)'`);
        // ── 손으로 고친 부분: 기존 행이 있어도 NOT NULL 로 추가되도록 임시 기본값 → 등록일로 채움 → 기본값 제거(엔티티에는 기본값이 없다 — 형제 1792682222497-LoginScopeStoreDetail.ts)
        await queryRunner.query(`ALTER TABLE "t_store_file" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`UPDATE "t_store_file" SET "updated_at" = "created_at"`);
        await queryRunner.query(`ALTER TABLE "t_store_file" ALTER COLUMN "updated_at" DROP DEFAULT`);
        // ── 여기까지 손으로 고친 부분
        await queryRunner.query(`COMMENT ON COLUMN "t_store_file"."updated_at" IS '수정일'`);
        await queryRunner.query(`ALTER TABLE "t_store_hour" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_hour"."is_deleted" IS '삭제여부(0: 정상, 1: 삭제 — 교체 때 기존 행을 삭제 표시)'`);
        await queryRunner.query(`ALTER TABLE "t_store_unavailable_period" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_unavailable_period"."is_deleted" IS '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 겹침 검사는 정상 행끼리)'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_StoreHour_StoreIdDayOfWeek" ON "t_store_hour"  ("store_id", "day_of_week") WHERE "is_deleted" = 0`);
        await queryRunner.query(`ALTER TABLE "t_room_group" ADD CONSTRAINT "FK_RoomGroup_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_group_image" ADD CONSTRAINT "FK_RoomGroupImage_RoomGroup" FOREIGN KEY ("room_group_id") REFERENCES "t_room_group"("room_group_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_group_plan" ADD CONSTRAINT "FK_RoomGroupPlan_RoomGroup" FOREIGN KEY ("room_group_id") REFERENCES "t_room_group"("room_group_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_group_plan" ADD CONSTRAINT "FK_RoomGroupPlan_RoomPlanType" FOREIGN KEY ("room_plan_type_id") REFERENCES "t_room_plan_type"("room_plan_type_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_group_plan_price" ADD CONSTRAINT "FK_RoomGroupPlanPrice_RoomGroupPlan" FOREIGN KEY ("room_group_plan_id") REFERENCES "t_room_group_plan"("room_group_plan_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD CONSTRAINT "FK_RoomPlan_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD CONSTRAINT "FK_RoomPlan_RoomPlanType" FOREIGN KEY ("room_plan_type_id") REFERENCES "t_room_plan_type"("room_plan_type_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room" ADD CONSTRAINT "FK_Room_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room" ADD CONSTRAINT "FK_Room_RoomGroup" FOREIGN KEY ("room_group_id") REFERENCES "t_room_group"("room_group_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room" ADD CONSTRAINT "FK_Room_RoomState" FOREIGN KEY ("room_state_id") REFERENCES "t_room_state"("room_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        // ── 손으로 더한 부분: 기존 업체에도 업체 상품 설정 3행(입점 승인과 같은 기본값 — store.constants.ts STORE_PLAN_DEFAULTS).
        // 상품 종류 행이 먼저 있어야 FK 를 만족한다(seeder 는 PK 가 있으면 건너뛴다). PK 는 앱의 generateId() 와 같은 32자
        await queryRunner.query(`INSERT INTO "t_room_plan_type" ("room_plan_type_id", "room_plan_type_name") VALUES ('HOURLY', '시간 이용'), ('NIGHT', '1박'), ('LONG', '연박') ON CONFLICT DO NOTHING`);
        await queryRunner.query(
            `INSERT INTO "t_room_plan" ("room_plan_id", "store_id", "room_plan_type_id", "is_used", "days_of_week", "usage_hours", "check_in_time", "check_out_time", "created_at", "updated_at") ` +
                `SELECT replace(gen_random_uuid()::text, '-', ''), "s"."store_id", "p"."room_plan_type_id", 1, 127, "p"."usage_hours", "p"."check_in_time", "p"."check_out_time", now(), now() FROM "t_store" "s" ` +
                `CROSS JOIN (VALUES ('HOURLY', 3::smallint, NULL::time, NULL::time), ('NIGHT', NULL, TIME '22:00', TIME '09:00'), ('LONG', NULL, TIME '15:00', TIME '11:00')) AS "p" ("room_plan_type_id", "usage_hours", "check_in_time", "check_out_time")`,
        );
    }

    /**
     * 되돌리기 — 생성 그대로(FK → 소프트 삭제 컬럼 → store_detail 되살림 → 새 테이블 DROP) + 손으로 고친 곳.
     * 소프트 삭제로 남은 행(is_deleted = 1)은 지운다 — 예전 코드는 실제로 지웠고, 남기면 요일 UK 를 다시 걸 수 없다.
     * btree_gist 확장은 지우지 않는다(남겨도 해가 없고, 예약 — Phase 16 — 도 쓴다).
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_room" DROP CONSTRAINT "FK_Room_RoomState"`);
        await queryRunner.query(`ALTER TABLE "t_room" DROP CONSTRAINT "FK_Room_RoomGroup"`);
        await queryRunner.query(`ALTER TABLE "t_room" DROP CONSTRAINT "FK_Room_Store"`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP CONSTRAINT "FK_RoomPlan_RoomPlanType"`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP CONSTRAINT "FK_RoomPlan_Store"`);
        await queryRunner.query(`ALTER TABLE "t_room_group_plan_price" DROP CONSTRAINT "FK_RoomGroupPlanPrice_RoomGroupPlan"`);
        await queryRunner.query(`ALTER TABLE "t_room_group_plan" DROP CONSTRAINT "FK_RoomGroupPlan_RoomPlanType"`);
        await queryRunner.query(`ALTER TABLE "t_room_group_plan" DROP CONSTRAINT "FK_RoomGroupPlan_RoomGroup"`);
        await queryRunner.query(`ALTER TABLE "t_room_group_image" DROP CONSTRAINT "FK_RoomGroupImage_RoomGroup"`);
        await queryRunner.query(`ALTER TABLE "t_room_group" DROP CONSTRAINT "FK_RoomGroup_Store"`);
        await queryRunner.query(`DROP INDEX "public"."UK_StoreHour_StoreIdDayOfWeek"`);
        // ── 손으로 더한 부분: 소프트 삭제로 남은 행을 지운다(파일 → 신청 순 — 신청 파일 FK RESTRICT)
        await queryRunner.query(`DELETE FROM "t_store_unavailable_period" WHERE "is_deleted" = 1`);
        await queryRunner.query(`DELETE FROM "t_store_hour" WHERE "is_deleted" = 1`);
        await queryRunner.query(`DELETE FROM "t_store_break" WHERE "is_deleted" = 1`);
        await queryRunner.query(`DELETE FROM "t_store_file" WHERE "is_deleted" = 1`);
        await queryRunner.query(`DELETE FROM "t_store_application" WHERE "is_deleted" = 1`);
        // ── 여기까지 손으로 더한 부분
        await queryRunner.query(`ALTER TABLE "t_store_unavailable_period" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "t_store_hour" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "t_store_file" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "t_store_file" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "t_store_break" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "t_store_application" DROP COLUMN "is_deleted"`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "store_detail" jsonb NOT NULL DEFAULT '{}'`);
        // ── 손으로 더한 부분: 생성기가 빠뜨린 원래 COMMENT
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_detail" IS '업체 상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다)'`);
        await queryRunner.query(`COMMENT ON TABLE "t_room" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."UK_Room_StoreIdRoomName"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_Room_StoreIdFloor"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_Room_RoomGroupId"`);
        await queryRunner.query(`DROP TABLE "t_room"`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_state" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_room_state"`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_plan" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_room_plan"`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group_plan_price" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_room_group_plan_price"`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group_plan" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_room_group_plan"`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_plan_type" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_room_plan_type"`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group_image" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_RoomGroupImage_RoomGroupIdSortOrder"`);
        await queryRunner.query(`DROP TABLE "t_room_group_image"`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."UK_RoomGroup_StoreIdRoomGroupName"`);
        await queryRunner.query(`DROP TABLE "t_room_group"`);
        // ── 손으로 고친 부분: 생성기가 뒤집은 컬럼 순서를 원래대로(1792780576432-StoreSchema.ts)
        await queryRunner.query(`ALTER TABLE "t_store_hour" ADD CONSTRAINT "UK_StoreHour_StoreIdDayOfWeek" UNIQUE ("store_id", "day_of_week")`);
    }
}
