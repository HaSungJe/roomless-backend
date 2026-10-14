import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 초기 스키마 — 회원(t_auth · t_state · t_sns · t_user · t_user_setting · t_session · t_session_refresh) · 가맹점(t_store) · API 로그(t_api_log).
 * TypeORM 엔티티 메타데이터로 생성한 DDL 이다(PK · UK · FK 제약명과 테이블 · 컬럼 주석 포함).
 */
export class Init1791903600000 implements MigrationInterface {
    name = 'Init1791903600000';

    /**
     * 테이블 · 제약 · 인덱스 · 주석 생성
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "t_api_log" ("id" BIGSERIAL NOT NULL, "create_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL, "method" character varying(10) NOT NULL, "path" character varying(500) NOT NULL, "request_param" jsonb, "request_query" jsonb, "request_body" jsonb, "status_code" integer NOT NULL, "response_body" jsonb, "error_stack" text, "user_id" character varying(36), "ip" character varying(45), "user_agent" character varying(500), "duration_ms" integer NOT NULL, CONSTRAINT "PK_ApiLog" PRIMARY KEY ("id", "create_at")); COMMENT ON COLUMN "t_api_log"."id" IS '로그 ID'; COMMENT ON COLUMN "t_api_log"."create_at" IS '요청 시각'; COMMENT ON COLUMN "t_api_log"."method" IS 'HTTP 메서드'; COMMENT ON COLUMN "t_api_log"."path" IS '요청 경로 (실제 URL)'; COMMENT ON COLUMN "t_api_log"."request_param" IS 'path param'; COMMENT ON COLUMN "t_api_log"."request_query" IS 'query string'; COMMENT ON COLUMN "t_api_log"."request_body" IS '요청 body (multipart 의 경우 파일 메타만)'; COMMENT ON COLUMN "t_api_log"."status_code" IS '응답 상태 코드'; COMMENT ON COLUMN "t_api_log"."response_body" IS '응답 body'; COMMENT ON COLUMN "t_api_log"."error_stack" IS 'unhandled 예외의 stack trace'; COMMENT ON COLUMN "t_api_log"."user_id" IS '인증된 사용자 ID (JWT)'; COMMENT ON COLUMN "t_api_log"."ip" IS '클라이언트 IP'; COMMENT ON COLUMN "t_api_log"."user_agent" IS 'User-Agent'; COMMENT ON COLUMN "t_api_log"."duration_ms" IS '처리 시간 (ms)'`);
        await queryRunner.query(`CREATE INDEX "IDX_ApiLog_UserId" ON "t_api_log"  ("user_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_ApiLog_Path" ON "t_api_log"  ("path") `);
        await queryRunner.query(`CREATE INDEX "IDX_ApiLog_CreateAt" ON "t_api_log"  ("create_at") `);
        await queryRunner.query(`COMMENT ON TABLE "t_api_log" IS 'API 호출 로그'`);
        await queryRunner.query(`CREATE TABLE "t_store" ("store_id" character varying(32) NOT NULL, "store_name" character varying(100) NOT NULL, "business_number" character varying(45) NOT NULL, "owner_name" character varying(50) NOT NULL, "phone" character varying(30) NOT NULL, "address" character varying(255) NOT NULL, "address_detail" character varying(255), "is_delete" smallint NOT NULL DEFAULT '0', "delete_backup" text, "create_at" TIMESTAMP WITH TIME ZONE NOT NULL, "update_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UK_Store_BusinessNumber" UNIQUE ("business_number"), CONSTRAINT "PK_Store" PRIMARY KEY ("store_id")); COMMENT ON COLUMN "t_store"."store_id" IS '가맹점 ID (UUID v4)'; COMMENT ON COLUMN "t_store"."store_name" IS '상호명'; COMMENT ON COLUMN "t_store"."business_number" IS '사업자등록번호(숫자 10자리, 삭제 시 DELETE_<store_id> 로 마스킹)'; COMMENT ON COLUMN "t_store"."owner_name" IS '대표자명'; COMMENT ON COLUMN "t_store"."phone" IS '가맹점 연락처'; COMMENT ON COLUMN "t_store"."address" IS '주소'; COMMENT ON COLUMN "t_store"."address_detail" IS '상세주소'; COMMENT ON COLUMN "t_store"."is_delete" IS '삭제여부(0: 정상, 1: 삭제)'; COMMENT ON COLUMN "t_store"."delete_backup" IS '삭제 시 이전 정보 백업(JSON)'; COMMENT ON COLUMN "t_store"."create_at" IS '등록일'; COMMENT ON COLUMN "t_store"."update_at" IS '수정일'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store" IS '가맹점 정보'`);
        await queryRunner.query(`CREATE TABLE "t_auth" ("auth_id" character varying(20) NOT NULL, "auth_name" character varying(50) NOT NULL, "level" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_Auth" PRIMARY KEY ("auth_id")); COMMENT ON COLUMN "t_auth"."auth_id" IS '권한 ID'; COMMENT ON COLUMN "t_auth"."auth_name" IS '권한명'; COMMENT ON COLUMN "t_auth"."level" IS '등급'`);
        await queryRunner.query(`COMMENT ON TABLE "t_auth" IS '권한 정보'`);
        await queryRunner.query(`CREATE TABLE "t_sns" ("sns_id" character varying(20) NOT NULL, "sns_name" character varying(50) NOT NULL, CONSTRAINT "PK_Sns" PRIMARY KEY ("sns_id")); COMMENT ON COLUMN "t_sns"."sns_id" IS 'SNS ID'; COMMENT ON COLUMN "t_sns"."sns_name" IS 'SNS명'`);
        await queryRunner.query(`COMMENT ON TABLE "t_sns" IS 'SNS 정보'`);
        await queryRunner.query(`CREATE TABLE "t_state" ("state_id" character varying(20) NOT NULL, "state_name" character varying(50) NOT NULL, "is_login_able" smallint NOT NULL DEFAULT '1', CONSTRAINT "PK_State" PRIMARY KEY ("state_id")); COMMENT ON COLUMN "t_state"."state_id" IS '상태 ID'; COMMENT ON COLUMN "t_state"."state_name" IS '상태명'; COMMENT ON COLUMN "t_state"."is_login_able" IS '로그인 가능여부(0: 불가, 1: 가능)'`);
        await queryRunner.query(`COMMENT ON TABLE "t_state" IS '상태 정보'`);
        await queryRunner.query(`CREATE TABLE "t_user" ("user_id" character varying(32) NOT NULL, "user_search_code" character varying(32) NOT NULL, "sns_user_id" character varying(255), "login_id" character varying(100) NOT NULL, "login_pw" character varying(100) NOT NULL, "name" character varying(50) NOT NULL, "gender" character varying(10) NOT NULL, "birth" character varying(30) NOT NULL, "phone" character varying(30), "nickname" character varying(50) NOT NULL, "device_os" character varying(20), "device_token" character varying(255), "is_password_change_required" smallint NOT NULL DEFAULT '0', "block_comment" character varying(255), "leave_comment" character varying(255), "leave_reserved_at" character varying(40), "leave_prev_state_id" character varying(20), "leave_backup" text, "create_at" TIMESTAMP WITH TIME ZONE NOT NULL, "update_at" TIMESTAMP WITH TIME ZONE NOT NULL, "auth_id" character varying(20) NOT NULL, "state_id" character varying(20) NOT NULL, "sns_id" character varying(20), "store_id" character varying(32), CONSTRAINT "UK_User_SnsSnsUserId" UNIQUE ("sns_id", "sns_user_id"), CONSTRAINT "UK_User_UserSearchCode" UNIQUE ("user_search_code"), CONSTRAINT "UK_User_LoginId" UNIQUE ("login_id"), CONSTRAINT "PK_User" PRIMARY KEY ("user_id")); COMMENT ON COLUMN "t_user"."user_id" IS '사용자 ID'; COMMENT ON COLUMN "t_user"."user_search_code" IS '회원 식별 코드'; COMMENT ON COLUMN "t_user"."sns_user_id" IS 'SNS 사용자 ID'; COMMENT ON COLUMN "t_user"."login_id" IS '로그인 ID'; COMMENT ON COLUMN "t_user"."login_pw" IS '비밀번호'; COMMENT ON COLUMN "t_user"."name" IS '이름'; COMMENT ON COLUMN "t_user"."gender" IS '성별'; COMMENT ON COLUMN "t_user"."birth" IS '생년월일'; COMMENT ON COLUMN "t_user"."phone" IS '전화번호'; COMMENT ON COLUMN "t_user"."nickname" IS '닉네임'; COMMENT ON COLUMN "t_user"."device_os" IS '디바이스 OS'; COMMENT ON COLUMN "t_user"."device_token" IS '디바이스 토큰'; COMMENT ON COLUMN "t_user"."is_password_change_required" IS '비밀번호 변경 필요 여부(0: 불필요, 1: 필요)'; COMMENT ON COLUMN "t_user"."block_comment" IS '정지 사유'; COMMENT ON COLUMN "t_user"."leave_comment" IS '탈퇴 사유'; COMMENT ON COLUMN "t_user"."leave_reserved_at" IS '탈퇴 예약시각(dayjs YYYY-MM-DD HH:mm:ss 문자열)'; COMMENT ON COLUMN "t_user"."leave_prev_state_id" IS '탈퇴 직전 상태(철회 복원용 스냅샷, FK 아님)'; COMMENT ON COLUMN "t_user"."leave_backup" IS '삭제 완료 시 이전 정보 백업(JSON)'; COMMENT ON COLUMN "t_user"."create_at" IS '등록일'; COMMENT ON COLUMN "t_user"."update_at" IS '수정일'; COMMENT ON COLUMN "t_user"."auth_id" IS '권한 ID'; COMMENT ON COLUMN "t_user"."state_id" IS '상태 ID'; COMMENT ON COLUMN "t_user"."sns_id" IS 'SNS ID'; COMMENT ON COLUMN "t_user"."store_id" IS '가맹점 ID (UUID v4)'`);
        await queryRunner.query(`COMMENT ON TABLE "t_user" IS '사용자 정보'`);
        await queryRunner.query(`CREATE TABLE "t_session" ("session_id" character varying(32) NOT NULL, "ip" character varying(100), "device_os" character varying(20), "device_token" character varying(255), "is_delete" smallint NOT NULL DEFAULT '0', "login_at" TIMESTAMP WITH TIME ZONE NOT NULL, "logout_at" TIMESTAMP WITH TIME ZONE, "user_id" character varying(32) NOT NULL, CONSTRAINT "PK_Session" PRIMARY KEY ("session_id")); COMMENT ON COLUMN "t_session"."session_id" IS '세션 ID (UUID v4)'; COMMENT ON COLUMN "t_session"."ip" IS '접속 IP'; COMMENT ON COLUMN "t_session"."device_os" IS '디바이스 OS'; COMMENT ON COLUMN "t_session"."device_token" IS '디바이스 토큰'; COMMENT ON COLUMN "t_session"."is_delete" IS '삭제여부(0: 정상, 1: 삭제)'; COMMENT ON COLUMN "t_session"."login_at" IS '로그인일'; COMMENT ON COLUMN "t_session"."logout_at" IS '로그아웃일'; COMMENT ON COLUMN "t_session"."user_id" IS '사용자 ID'`);
        await queryRunner.query(`COMMENT ON TABLE "t_session" IS '로그인 세션 정보'`);
        await queryRunner.query(`CREATE TABLE "t_session_refresh" ("session_refresh_id" BIGSERIAL NOT NULL, "refresh_hash" character varying(64) NOT NULL, "refresh_encrypted" character varying(1024) NOT NULL, "before_refresh_hash" character varying(64), "create_at" TIMESTAMP WITH TIME ZONE NOT NULL, "end_at" TIMESTAMP WITH TIME ZONE NOT NULL, "session_id" character varying(32) NOT NULL, CONSTRAINT "UK_SessionRefresh_RefreshHash" UNIQUE ("refresh_hash"), CONSTRAINT "PK_SessionRefresh" PRIMARY KEY ("session_refresh_id")); COMMENT ON COLUMN "t_session_refresh"."session_refresh_id" IS '로그인 refresh ID'; COMMENT ON COLUMN "t_session_refresh"."refresh_hash" IS 'refresh-token SHA-256 해시 (조회용)'; COMMENT ON COLUMN "t_session_refresh"."refresh_encrypted" IS 'refresh-token AES-256-GCM 암호문 (복원용)'; COMMENT ON COLUMN "t_session_refresh"."before_refresh_hash" IS '직전 refresh-token 해시 (체인 링크, 최초 발급 시 NULL)'; COMMENT ON COLUMN "t_session_refresh"."create_at" IS '등록일'; COMMENT ON COLUMN "t_session_refresh"."end_at" IS '만료일'; COMMENT ON COLUMN "t_session_refresh"."session_id" IS '세션 ID (UUID v4)'`);
        await queryRunner.query(`COMMENT ON TABLE "t_session_refresh" IS '로그인 세션 refresh'`);
        await queryRunner.query(`CREATE TABLE "t_user_setting" ("user_setting_id" character varying(32) NOT NULL, "bio" text, "create_at" TIMESTAMP WITH TIME ZONE NOT NULL, "update_at" TIMESTAMP WITH TIME ZONE NOT NULL, "user_id" character varying(32) NOT NULL, CONSTRAINT "UK_UserSetting_UserId" UNIQUE ("user_id"), CONSTRAINT "PK_UserSetting" PRIMARY KEY ("user_setting_id")); COMMENT ON COLUMN "t_user_setting"."user_setting_id" IS '회원 설정 ID'; COMMENT ON COLUMN "t_user_setting"."bio" IS '자기소개'; COMMENT ON COLUMN "t_user_setting"."create_at" IS '등록일'; COMMENT ON COLUMN "t_user_setting"."update_at" IS '수정일'; COMMENT ON COLUMN "t_user_setting"."user_id" IS '사용자 ID'`);
        await queryRunner.query(`COMMENT ON TABLE "t_user_setting" IS '회원 설정'`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "FK_User_Auth" FOREIGN KEY ("auth_id") REFERENCES "t_auth"("auth_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "FK_User_State" FOREIGN KEY ("state_id") REFERENCES "t_state"("state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "FK_User_Sns" FOREIGN KEY ("sns_id") REFERENCES "t_sns"("sns_id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "FK_User_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_session" ADD CONSTRAINT "FK_Session_User" FOREIGN KEY ("user_id") REFERENCES "t_user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_session_refresh" ADD CONSTRAINT "FK_SessionRefresh_Session" FOREIGN KEY ("session_id") REFERENCES "t_session"("session_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_user_setting" ADD CONSTRAINT "FK_UserSetting_User" FOREIGN KEY ("user_id") REFERENCES "t_user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    /**
     * 전부 되돌린다 (FK → 테이블 순)
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_user_setting" DROP CONSTRAINT "FK_UserSetting_User"`);
        await queryRunner.query(`ALTER TABLE "t_session_refresh" DROP CONSTRAINT "FK_SessionRefresh_Session"`);
        await queryRunner.query(`ALTER TABLE "t_session" DROP CONSTRAINT "FK_Session_User"`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "FK_User_Store"`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "FK_User_Sns"`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "FK_User_State"`);
        await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "FK_User_Auth"`);
        await queryRunner.query(`COMMENT ON TABLE "t_user_setting" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_user_setting"`);
        await queryRunner.query(`COMMENT ON TABLE "t_session_refresh" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_session_refresh"`);
        await queryRunner.query(`COMMENT ON TABLE "t_session" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_session"`);
        await queryRunner.query(`COMMENT ON TABLE "t_user" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_user"`);
        await queryRunner.query(`COMMENT ON TABLE "t_state" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_state"`);
        await queryRunner.query(`COMMENT ON TABLE "t_sns" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_sns"`);
        await queryRunner.query(`COMMENT ON TABLE "t_auth" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_auth"`);
        await queryRunner.query(`COMMENT ON TABLE "t_store" IS NULL`);
        await queryRunner.query(`DROP TABLE "t_store"`);
        await queryRunner.query(`COMMENT ON TABLE "t_api_log" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ApiLog_CreateAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ApiLog_Path"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ApiLog_UserId"`);
        await queryRunner.query(`DROP TABLE "t_api_log"`);
    }
}
