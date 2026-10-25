import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 업체 정보 파일 (로드맵 Phase 9)
 * - t_store_file_purpose(용도 룩업 + is_private, 기본 데이터는 seeder) · t_store_file(UK_StoreFile_FileKey — 신청 · 업체 FK)
 * - t_store_image 삭제 — 업체 사진도 t_store_file 로 (Phase 8 에서 만들었고 사용처 · 데이터 없음. 엔티티가 없는 테이블은 생성기가 지우지 않아 손으로 더한 부분)
 * - t_store_application.business_license_image_key 삭제 — 사업자등록증은 t_store_file 로
 * - t_store_application 대표자 = 업체 총관리자: head_manager_name 삭제(대표자명 owner_name 을 쓴다), head_manager_phone → owner_phone (RENAME — 생성기의 DROP + ADD 를 손으로 고친 부분)
 */
export class StoreFile1792953783038 implements MigrationInterface {
    name = 'StoreFile1792953783038';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "t_store_file_purpose" ("store_file_purpose_id" character varying(20) NOT NULL, "store_file_purpose_name" character varying(50) NOT NULL, "is_private" smallint NOT NULL DEFAULT '0', CONSTRAINT "PK_StoreFilePurpose" PRIMARY KEY ("store_file_purpose_id")); COMMENT ON COLUMN "t_store_file_purpose"."store_file_purpose_id" IS '업체 정보 파일 용도 ID'; COMMENT ON COLUMN "t_store_file_purpose"."store_file_purpose_name" IS '업체 정보 파일 용도명'; COMMENT ON COLUMN "t_store_file_purpose"."is_private" IS '비공개 여부(0: 공개 — CDN 공개 주소, 1: 비공개 — private/ 키 · 서명된 열람 주소)'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_file_purpose" IS '업체 정보 파일 용도'`);
        await queryRunner.query(`CREATE TABLE "t_store_file" ("store_file_id" character varying(32) NOT NULL, "file_key" character varying(255) NOT NULL, "file_name" character varying(255) NOT NULL, "content_type" character varying(100) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_file_purpose_id" character varying(20) NOT NULL, "store_application_id" character varying(32), "store_id" character varying(32), CONSTRAINT "UK_StoreFile_FileKey" UNIQUE ("file_key"), CONSTRAINT "PK_StoreFile" PRIMARY KEY ("store_file_id")); COMMENT ON COLUMN "t_store_file"."store_file_id" IS '업체 정보 파일 ID'; COMMENT ON COLUMN "t_store_file"."file_key" IS '저장 키(S3 — 비공개 private/store-application/…, 공개 store/application/…) — 같은 키를 덮어쓰지 않는다'; COMMENT ON COLUMN "t_store_file"."file_name" IS '원본 파일명'; COMMENT ON COLUMN "t_store_file"."content_type" IS 'MIME 타입(image/jpeg · image/png)'; COMMENT ON COLUMN "t_store_file"."sort_order" IS '정렬 순서(용도 안에서 0부터 — 업체 사진은 0 이 대표)'; COMMENT ON COLUMN "t_store_file"."created_at" IS '등록일'; COMMENT ON COLUMN "t_store_file"."store_file_purpose_id" IS '업체 정보 파일 용도 ID'; COMMENT ON COLUMN "t_store_file"."store_application_id" IS '입점 신청 ID'; COMMENT ON COLUMN "t_store_file"."store_id" IS '업체 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreFile_StoreIdSortOrder" ON "t_store_file"  ("store_id", "sort_order") `);
        await queryRunner.query(`CREATE INDEX "IDX_StoreFile_StoreApplicationIdSortOrder" ON "t_store_file"  ("store_application_id", "sort_order") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_file" IS '업체 정보 파일'`);
        await queryRunner.query(`ALTER TABLE "t_store_application" DROP COLUMN "head_manager_name"`);
        // 손으로 고친 부분 — 생성기의 DROP "head_manager_phone" + ADD "owner_phone" 대신 RENAME (값을 지키는 이름 변경)
        await queryRunner.query(`ALTER TABLE "t_store_application" RENAME COLUMN "head_manager_phone" TO "owner_phone"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."owner_phone" IS '대표자 휴대폰 번호(숫자만) — 승인 때 만드는 업체 총관리자(매니저) 계정 · 안내 SMS'`);
        await queryRunner.query(`ALTER TABLE "t_store_application" DROP COLUMN "business_license_image_key"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."owner_name" IS '대표자명 — 승인 때 만드는 업체 총관리자(매니저) 계정의 이름'`);
        // 손으로 더한 부분 — t_store_image 삭제 (엔티티가 없는 테이블은 생성기가 지우지 않는다)
        await queryRunner.query(`ALTER TABLE "t_store_image" DROP CONSTRAINT "FK_StoreImage_Store"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreImage_StoreIdSortOrder"`);
        await queryRunner.query(`DROP TABLE "t_store_image"`);
        await queryRunner.query(`ALTER TABLE "t_store_file" ADD CONSTRAINT "FK_StoreFile_StoreFilePurpose" FOREIGN KEY ("store_file_purpose_id") REFERENCES "t_store_file_purpose"("store_file_purpose_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_file" ADD CONSTRAINT "FK_StoreFile_StoreApplication" FOREIGN KEY ("store_application_id") REFERENCES "t_store_application"("store_application_id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_file" ADD CONSTRAINT "FK_StoreFile_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE RESTRICT ON UPDATE CASCADE`);
    }

    /**
     * 되돌리기 — 기존 행이 있어도 되돌릴 수 있게 NOT NULL 컬럼은 임시 기본값으로 다시 더하고, 이름은 RENAME 으로 되돌린다.
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_store_file" DROP CONSTRAINT "FK_StoreFile_Store"`);
        await queryRunner.query(`ALTER TABLE "t_store_file" DROP CONSTRAINT "FK_StoreFile_StoreApplication"`);
        await queryRunner.query(`ALTER TABLE "t_store_file" DROP CONSTRAINT "FK_StoreFile_StoreFilePurpose"`);
        // t_store_image 다시 만들기 (1792780576432-StoreSchema.ts 와 같은 DDL)
        await queryRunner.query(`CREATE TABLE "t_store_image" ("store_image_id" character varying(32) NOT NULL, "image_key" character varying(255) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "PK_StoreImage" PRIMARY KEY ("store_image_id")); COMMENT ON COLUMN "t_store_image"."store_image_id" IS '업체 사진 ID'; COMMENT ON COLUMN "t_store_image"."image_key" IS '사진 저장 키(S3 — store/<store_id>/<uuid>.jpg)'; COMMENT ON COLUMN "t_store_image"."sort_order" IS '정렬 순서(작을수록 앞, 0: 대표 사진)'; COMMENT ON COLUMN "t_store_image"."created_at" IS '등록일'; COMMENT ON COLUMN "t_store_image"."store_id" IS '업체 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreImage_StoreIdSortOrder" ON "t_store_image"  ("store_id", "sort_order") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_image" IS '업체 사진'`);
        await queryRunner.query(`ALTER TABLE "t_store_image" ADD CONSTRAINT "FK_StoreImage_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."owner_name" IS '대표자명'`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD "business_license_image_key" character varying(255) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ALTER COLUMN "business_license_image_key" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."business_license_image_key" IS '사업자등록증 사진 저장 키(S3)'`);
        await queryRunner.query(`ALTER TABLE "t_store_application" RENAME COLUMN "owner_phone" TO "head_manager_phone"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."head_manager_phone" IS '업체 총관리자 휴대폰 번호(숫자만) — 승인 때 만드는 매니저 계정 · 안내 SMS'`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD "head_manager_name" character varying(50) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ALTER COLUMN "head_manager_name" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."head_manager_name" IS '업체 총관리자 이름 — 승인 때 만드는 매니저 계정'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_file" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreFile_StoreApplicationIdSortOrder"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreFile_StoreIdSortOrder"`);
        await queryRunner.query(`DROP TABLE "t_store_file"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_file_purpose" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_store_file_purpose"`);
    }
}
