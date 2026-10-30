import type {MigrationInterface, QueryRunner} from 'typeorm';

/** 이름을 바꾸는 호실 상태 — [상태 ID, 지금 이름, 바꿀 이름] (MAINTENANCE · DISABLED 는 이름이 같지만 5개 상태의 이름을 한 곳에서 맞춘다) */
const NAMES: [string, string, string][] = [
    ['IN_USE', '이용중', '사용중'],
    ['MAINTENANCE', '정비중', '정비중'],
    ['DISABLED', '사용중지', '사용중지'],
];

/**
 * 호실 상태 5개로 개편 (로드맵 Phase 13 #55) — 데이터만 바꾼다(엔티티 · 스키마 변경 없음 — db:check 그대로, 그래서 손으로 쓴 마이그레이션이다).
 * - 예약가능(AVAILABLE) · 예약완료(RESERVED) 추가, 스탠바이(STANDBY) 호실은 예약가능으로 옮긴 뒤 STANDBY 행 삭제
 * - 이름 정리 — IN_USE 이용중 → 사용중 · MAINTENANCE 정비중 · DISABLED 사용중지
 * FK_Room_RoomState 가 ON DELETE CASCADE 라 상태 행을 지우기 전에 호실을 먼저 옮긴다(옮기지 않으면 호실이 지워진다).
 * 시드(ROOM_STATE_SEED_DATA)는 PK 가 없는 행만 넣고 이름을 고치지 않으므로, 기존 DB 의 이름 · STANDBY 정리는 여기서 한다. 호실의 수정일은 바꾸지 않는다(상태 코드 이름 변경이다).
 */
export class RoomState1793400000000 implements MigrationInterface {
    name = 'RoomState1793400000000';

    /**
     * 적용 — 새 상태 추가 → 호실 STANDBY → AVAILABLE → STANDBY 행 삭제 → 이름 정리
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`INSERT INTO "t_room_state" ("room_state_id", "room_state_name") VALUES ('AVAILABLE', '예약가능'), ('RESERVED', '예약완료') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`UPDATE "t_room" SET "room_state_id" = 'AVAILABLE' WHERE "room_state_id" = 'STANDBY'`);
        await queryRunner.query(`DELETE FROM "t_room_state" WHERE "room_state_id" = 'STANDBY'`);
        for (const [room_state_id, , to] of NAMES) {
            await queryRunner.query(`UPDATE "t_room_state" SET "room_state_name" = $1 WHERE "room_state_id" = $2`, [to, room_state_id]);
        }
    }

    /**
     * 되돌리기 — 이름 되돌림 → STANDBY 추가 → 예약가능 · 예약완료 호실을 STANDBY 로 → AVAILABLE · RESERVED 행 삭제.
     * 예약완료 호실도 스탠바이로 옮긴다(예전 상태에는 예약완료가 없다 — 되돌리면 그 구분은 사라진다).
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        for (const [room_state_id, from] of [...NAMES].reverse()) {
            await queryRunner.query(`UPDATE "t_room_state" SET "room_state_name" = $1 WHERE "room_state_id" = $2`, [from, room_state_id]);
        }
        await queryRunner.query(`INSERT INTO "t_room_state" ("room_state_id", "room_state_name") VALUES ('STANDBY', '스탠바이') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`UPDATE "t_room" SET "room_state_id" = 'STANDBY' WHERE "room_state_id" IN ('AVAILABLE', 'RESERVED')`);
        await queryRunner.query(`DELETE FROM "t_room_state" WHERE "room_state_id" IN ('AVAILABLE', 'RESERVED')`);
    }
}
