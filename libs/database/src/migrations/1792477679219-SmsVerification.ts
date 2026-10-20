import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * SMS 인증 — t_sms_purpose(용도 룩업) · t_sms_verification(발송 · 확인 기록) 생성, t_user.phone_verified_at 추가 · phone 번호 1개 = 계정 1개(UK_User_Phone).
 * npm run db:generate 로 엔티티에서 생성했다. 단일 컬럼 UNIQUE 는 TypeORM 이 UQ_<해시> 이름을 만들어 UK_User_Phone 으로 고쳤다.
 */
export class SmsVerification1792477679219 implements MigrationInterface {
    name = 'SmsVerification1792477679219';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "t_sms_purpose" ("sms_purpose_id" character varying(20) NOT NULL, "sms_purpose_name" character varying(50) NOT NULL, CONSTRAINT "PK_SmsPurpose" PRIMARY KEY ("sms_purpose_id")); COMMENT ON COLUMN "t_sms_purpose"."sms_purpose_id" IS 'SMS 인증 용도 ID'; COMMENT ON COLUMN "t_sms_purpose"."sms_purpose_name" IS 'SMS 인증 용도명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_sms_purpose" IS 'SMS 인증 용도'`);
        await queryRunner.query(`CREATE TABLE "t_sms_verification" ("sms_verification_id" character varying(32) NOT NULL, "phone" character varying(30) NOT NULL, "code_hash" character varying(64) NOT NULL, "attempt_count" smallint NOT NULL DEFAULT '0', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "verified_at" TIMESTAMP WITH TIME ZONE, "ip" character varying(100), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "sms_purpose_id" character varying(20) NOT NULL, "user_id" character varying(32) NOT NULL, CONSTRAINT "PK_SmsVerification" PRIMARY KEY ("sms_verification_id")); COMMENT ON COLUMN "t_sms_verification"."sms_verification_id" IS 'SMS 인증 ID'; COMMENT ON COLUMN "t_sms_verification"."phone" IS '받는 번호(숫자만)'; COMMENT ON COLUMN "t_sms_verification"."code_hash" IS '인증번호 SHA-256 해시'; COMMENT ON COLUMN "t_sms_verification"."attempt_count" IS '확인 시도 횟수'; COMMENT ON COLUMN "t_sms_verification"."expires_at" IS '인증번호 만료일'; COMMENT ON COLUMN "t_sms_verification"."verified_at" IS '인증 완료일(미완료 NULL)'; COMMENT ON COLUMN "t_sms_verification"."ip" IS '요청 IP'; COMMENT ON COLUMN "t_sms_verification"."created_at" IS '발송일'; COMMENT ON COLUMN "t_sms_verification"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_sms_verification"."sms_purpose_id" IS 'SMS 인증 용도 ID'; COMMENT ON COLUMN "t_sms_verification"."user_id" IS '사용자 ID'`);
        await queryRunner.query(`CREATE INDEX "IDX_SmsVerification_PhoneCreatedAt" ON "t_sms_verification"  ("phone", "created_at") `);
        await queryRunner.query(`COMMENT ON TABLE "t_sms_verification" IS 'SMS 인증 발송 · 확인 기록'`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD "phone_verified_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."phone_verified_at" IS '휴대폰 SMS 인증일(미인증 NULL)'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."phone" IS '휴대폰 번호(숫자만, SMS 인증을 마친 번호 — 번호 1개 = 계정 1개, 미인증 NULL)'`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "UK_User_Phone" UNIQUE ("phone")`);
        await queryRunner.query(`ALTER TABLE "t_sms_verification" ADD CONSTRAINT "FK_SmsVerification_SmsPurpose" FOREIGN KEY ("sms_purpose_id") REFERENCES "t_sms_purpose"("sms_purpose_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_sms_verification" ADD CONSTRAINT "FK_SmsVerification_User" FOREIGN KEY ("user_id") REFERENCES "t_user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    /**
     * 되돌리기
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_sms_verification" DROP CONSTRAINT "FK_SmsVerification_User"`);
        await queryRunner.query(`ALTER TABLE "t_sms_verification" DROP CONSTRAINT "FK_SmsVerification_SmsPurpose"`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "UK_User_Phone"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."phone" IS '전화번호'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."phone_verified_at" IS '휴대폰 SMS 인증일(미인증 NULL)'`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP COLUMN "phone_verified_at"`);
        await queryRunner.query(`COMMENT ON TABLE "t_sms_verification" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_SmsVerification_PhoneCreatedAt"`);
        await queryRunner.query(`DROP TABLE "t_sms_verification"`);
        await queryRunner.query(`COMMENT ON TABLE "t_sms_purpose" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_sms_purpose"`);
    }
}
