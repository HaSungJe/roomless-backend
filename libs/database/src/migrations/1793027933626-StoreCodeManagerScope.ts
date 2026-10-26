import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 업체코드 · 매니저 계정 업체 단위 유일성 · 입점 신청 업체 총관리자 자격증명(Phase 10).
 * - t_user: 그룹 단위 UK(UK_User_LoginIdLoginScope · UK_User_PhoneLoginScope)를 업체 유무로 나눈 부분 유니크 인덱스 4개로 —
 *   업체 없는 계정(이용자 · 총관리자 · 관리자)은 그룹 안에서(이름 그대로), 업체 소속 계정(매니저 그룹)은 그 업체 안에서(…StoreId).
 * - t_store.store_code: 업체코드(UUID 32자). 기존 행은 새 UUID 로 채운 뒤 NOT NULL · UK_Store_StoreCode(생성기의 UQ_<해시> 이름을 고쳤다).
 * - t_store_application.head_manager_login_id · head_manager_login_pw: 기존 행은 빈 값으로 넣은 뒤 기본값을 없앤다.
 * npm run db:generate 로 엔티티에서 생성한 뒤 위 세 가지를 손으로 고쳤다.
 */
export class StoreCodeManagerScope1793027933626 implements MigrationInterface {
    name = 'StoreCodeManagerScope1793027933626';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        // t_user — 그룹 단위 UK → 업체 유무로 나눈 부분 유니크 인덱스 (제약을 먼저 지워야 같은 이름의 인덱스를 만든다)
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "UK_User_PhoneLoginScope"`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "UK_User_LoginIdLoginScope"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_User_PhoneLoginScopeStoreId" ON "t_user"  ("phone", "login_scope", "store_id") WHERE "store_id" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_User_PhoneLoginScope" ON "t_user"  ("phone", "login_scope") WHERE "store_id" IS NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_User_LoginIdLoginScopeStoreId" ON "t_user"  ("login_id", "login_scope", "store_id") WHERE "store_id" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_User_LoginIdLoginScope" ON "t_user"  ("login_id", "login_scope") WHERE "store_id" IS NULL`);

        // t_store.store_code — 기존 행은 새 UUID(하이픈 없는 32자)로 채운 뒤 NOT NULL · UK
        await queryRunner.query(`ALTER TABLE "t_store" ADD "store_code" character varying(32)`);
        await queryRunner.query(`UPDATE "t_store" SET "store_code" = replace(gen_random_uuid()::text, '-', '')`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "store_code" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD CONSTRAINT "UK_Store_StoreCode" UNIQUE ("store_code")`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_code" IS '업체코드(UUID 32자 — PK 와 별개, 매니저 로그인 · 매니저 화면 주소에 쓴다. 승인 때 만들고 바꾸지 않는다)'`);

        // t_store_application — 업체 총관리자 자격증명 (기존 행은 빈 값 → 기본값 제거)
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD "head_manager_login_id" character varying(30) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ALTER COLUMN "head_manager_login_id" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."head_manager_login_id" IS '업체 총관리자 아이디 — 승인 때 만드는 업체 총관리자(매니저) 계정의 아이디(그 업체 안에서 유일)'`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD "head_manager_login_pw" character varying(100) NOT NULL DEFAULT ''`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ALTER COLUMN "head_manager_login_pw" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."head_manager_login_pw" IS '업체 총관리자 비밀번호(bcrypt 해시) — 승인 때 계정에 그대로 옮긴다'`);
    }

    /**
     * 되돌리기 — 업체가 달라 같은 아이디 · 번호를 쓰는 매니저가 있으면 그룹 단위 UK 를 다시 걸 수 없어 실패한다(되돌리기 전에 정리해야 한다).
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_store_application" DROP COLUMN "head_manager_login_pw"`);
        await queryRunner.query(`ALTER TABLE "t_store_application" DROP COLUMN "head_manager_login_id"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP CONSTRAINT "UK_Store_StoreCode"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "store_code"`);
        await queryRunner.query(`DROP INDEX "public"."UK_User_LoginIdLoginScope"`);
        await queryRunner.query(`DROP INDEX "public"."UK_User_LoginIdLoginScopeStoreId"`);
        await queryRunner.query(`DROP INDEX "public"."UK_User_PhoneLoginScope"`);
        await queryRunner.query(`DROP INDEX "public"."UK_User_PhoneLoginScopeStoreId"`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "UK_User_LoginIdLoginScope" UNIQUE ("login_id", "login_scope")`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "UK_User_PhoneLoginScope" UNIQUE ("phone", "login_scope")`);
    }
}
