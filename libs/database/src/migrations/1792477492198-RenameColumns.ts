import type {MigrationInterface, QueryRunner} from 'typeorm';

/** 바꿀 컬럼 — [테이블, 지금 이름, 바꿀 이름] */
const RENAMES: [string, string, string][] = [
    ['t_api_log', 'id', 'api_log_id'],
    ['t_api_log', 'create_at', 'created_at'],
    ['t_store', 'create_at', 'created_at'],
    ['t_store', 'update_at', 'updated_at'],
    ['t_store', 'is_delete', 'is_deleted'],
    ['t_user', 'create_at', 'created_at'],
    ['t_user', 'update_at', 'updated_at'],
    ['t_user', 'leave_prev_state_id', 'leave_previous_state_id'],
    ['t_user_setting', 'create_at', 'created_at'],
    ['t_user_setting', 'update_at', 'updated_at'],
    ['t_session', 'is_delete', 'is_deleted'],
    ['t_session_refresh', 'create_at', 'created_at'],
    ['t_session_refresh', 'end_at', 'expires_at'],
    ['t_session_refresh', 'before_refresh_hash', 'previous_refresh_hash'],
    ['t_state', 'is_login_able', 'is_login_allowed'],
];

/**
 * 컬럼 이름 정리 — 시각 `<과거분사>_at` · 여부 `is_<형용사>` · 직전 값 `previous_` · PK `<테이블>_id`.
 * 데이터를 남기도록 RENAME 만 쓴다(db:generate 는 이름 변경을 DROP + ADD 로 계산하므로 손으로 쓴 마이그레이션이다).
 */
export class RenameColumns1792477492198 implements MigrationInterface {
    name = 'RenameColumns1792477492198';

    /**
     * 컬럼 · 인덱스 · 시퀀스 이름을 바꾼다 (데이터 · 제약 · 주석은 그대로)
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        for (const [table, from, to] of RENAMES) {
            await queryRunner.query(`ALTER TABLE "${table}" RENAME COLUMN "${from}" TO "${to}"`);
        }
        await queryRunner.query(`ALTER INDEX "IDX_ApiLog_CreateAt" RENAME TO "IDX_ApiLog_CreatedAt"`);
        await queryRunner.query(`ALTER SEQUENCE "t_api_log_id_seq" RENAME TO "t_api_log_api_log_id_seq"`);
    }

    /**
     * 원래 이름으로 되돌린다
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER SEQUENCE "t_api_log_api_log_id_seq" RENAME TO "t_api_log_id_seq"`);
        await queryRunner.query(`ALTER INDEX "IDX_ApiLog_CreatedAt" RENAME TO "IDX_ApiLog_CreateAt"`);
        for (const [table, from, to] of [...RENAMES].reverse()) {
            await queryRunner.query(`ALTER TABLE "${table}" RENAME COLUMN "${to}" TO "${from}"`);
        }
    }
}
