import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 로그인 그룹 · 업체 상세정보 (로드맵 #92 · #93)
 * - t_user.login_scope — 로그인 그룹(USER · MANAGER · ADMIN). 기존 행은 권한(auth_id)으로 채운 뒤 NOT NULL 로 둔다(손으로 더한 부분).
 * - 아이디 · 휴대폰 번호 UK 를 그룹 단위로: UK_User_LoginId · UK_User_Phone → UK_User_LoginIdLoginScope · UK_User_PhoneLoginScope
 * - t_store.store_detail — 업체 상세정보 jsonb(기본 '{}')
 */
export class LoginScopeStoreDetail1792682222497 implements MigrationInterface {
    name = 'LoginScopeStoreDetail1792682222497';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_store" ADD "store_detail" jsonb NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_detail" IS '업체 상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다)'`);
        // 기존 행이 있어도 NOT NULL 로 추가되도록 임시 기본값 → 권한으로 그룹 채우기 → 기본값 제거 (엔티티에는 기본값이 없다)
        await queryRunner.query(`ALTER TABLE "t_user" ADD "login_scope" character varying(20) NOT NULL DEFAULT 'USER'`);
        await queryRunner.query(
            `UPDATE "t_user" SET "login_scope" = CASE WHEN "auth_id" IN ('HEAD_MANAGER', 'MANAGER') THEN 'MANAGER' WHEN "auth_id" IN ('SUPER_ADMIN', 'ADMIN') THEN 'ADMIN' ELSE 'USER' END`,
        );
        await queryRunner.query(`ALTER TABLE "t_user" ALTER COLUMN "login_scope" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."login_scope" IS '로그인 그룹(USER: 이용자, MANAGER: 총매니저 · 매니저, ADMIN: 총관리자 · 관리자) — 로그인 API · 아이디 · 휴대폰 번호 UK 단위'`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "UK_User_LoginId"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."phone" IS '휴대폰 번호(숫자만, SMS 인증을 마친 번호 — 로그인 그룹 안에서 번호 1개 = 계정 1개, 미인증 NULL)'`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "UK_User_Phone"`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "UK_User_PhoneLoginScope" UNIQUE ("phone", "login_scope")`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "UK_User_LoginIdLoginScope" UNIQUE ("login_id", "login_scope")`);
    }

    /**
     * 되돌리기 — 그룹이 다른 계정끼리 아이디 · 번호가 겹치면 옛 UK 를 다시 걸 수 없어 실패한다(그 행을 먼저 정리해야 한다).
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "UK_User_LoginIdLoginScope"`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "UK_User_PhoneLoginScope"`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "UK_User_Phone" UNIQUE ("phone")`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."phone" IS '휴대폰 번호(숫자만, SMS 인증을 마친 번호 — 번호 1개 = 계정 1개, 미인증 NULL)'`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "UK_User_LoginId" UNIQUE ("login_id")`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP COLUMN "login_scope"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "store_detail"`);
    }
}
