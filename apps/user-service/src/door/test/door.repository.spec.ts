import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, Not} from 'typeorm';
import type {EntityTarget, FindManyOptions, ObjectLiteral} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {DoorOpenLogEntity} from '@app/database/entities/door/door-open-log.entity.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {DoorRoomRow} from '../interfaces/door.repository.interface.js';
import {DoorRepository} from '../repositories/door.repository.js';

/** DoorRoomRow 키 — raw select 별칭과 비교 */
const DOOR_ROOM_ROW_KEYS: (keyof DoorRoomRow)[] = ['room_id', 'room_name', 'floor'];

/**
 * repository 가 manager.findOne 에 넘긴 옵션을 SQL 로 빌드한다 — EntityManager.findOne 과 같은 방식(실행만 뺀다).
 *
 * @param dataSource 메타데이터만 만든 DataSource
 * @param call 가로챈 호출 인자(대상 엔티티, 옵션)
 * @returns 공백을 하나로 줄인 SQL 과 파라미터
 */
function buildFindQuery(dataSource: DataSource, call: unknown[]): [string, unknown[]] {
    const [target, options] = call as [EntityTarget<ObjectLiteral>, FindManyOptions<ObjectLiteral>];
    const [sql, parameters] = dataSource.manager.createQueryBuilder(target, dataSource.getMetadata(target).name).setFindOptions(options).getQueryAndParameters();
    return [sql.replace(/\s+/g, ' '), parameters];
}

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티) 가 엔티티별 가짜 repository 를 돌려준다.
 *
 * @returns 저장소와 엔티티별 가짜 repository
 */
function makeRepository() {
    const fake = () => ({findOne: vi.fn().mockResolvedValue(null), insert: vi.fn().mockResolvedValue(undefined)});
    const repos = new Map<unknown, ReturnType<typeof fake>>([
        [StoreEntity, fake()],
        [RoomEntity, fake()],
        [RoomQrEntity, fake()],
        [DoorOpenLogEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new DoorRepository(txHost), store: repos.get(StoreEntity)!, room: repos.get(RoomEntity)!, roomQr: repos.get(RoomQrEntity)!, openLog: repos.get(DoorOpenLogEntity)!};
}

/**
 * raw select 의 별칭 목록 (` AS "<키>"`)
 *
 * @param sql 공백을 한 칸으로 줄인 SQL
 * @returns 별칭 목록 (나온 순서)
 */
function selectAliases(sql: string): string[] {
    return [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]);
}

describe('DoorRepository — 조건 · 오류 변환', () => {
    it('[SUCCESS] findDoorStore — 받은 조건에 is_deleted: 0 을 더하고 loadRelationIds', async () => {
        const {repository, store} = makeRepository();

        await repository.findDoorStore({store_id: 's1', store_state_id: Not('LEAVE')});

        expect(store.findOne).toHaveBeenCalledTimes(1);
        expect(store.findOne).toHaveBeenCalledWith({where: {store_id: 's1', store_state_id: Not('LEAVE'), is_deleted: 0}, loadRelationIds: true});
    });

    it('[SUCCESS] findDoorRoom — 받은 조건(호실 · 업체)에 is_deleted: 0 을 더하고 loadRelationIds', async () => {
        const {repository, room} = makeRepository();

        await repository.findDoorRoom({room_id: 'r1', store_id: 's1'});

        expect(room.findOne).toHaveBeenCalledTimes(1);
        expect(room.findOne).toHaveBeenCalledWith({where: {room_id: 'r1', store_id: 's1', is_deleted: 0}, loadRelationIds: true});
    });

    it('[SUCCESS] findDoorRoomQr — 받은 조건(호실 · QR) 그대로(지우지 않는 표라 is_deleted 없음) · loadRelationIds', async () => {
        const {repository, roomQr} = makeRepository();

        await repository.findDoorRoomQr({room_id: 'r1', qr: 'q1'});

        expect(roomQr.findOne).toHaveBeenCalledTimes(1);
        expect(roomQr.findOne).toHaveBeenCalledWith({where: {room_id: 'r1', qr: 'q1'}, loadRelationIds: true});
    });

    it('[SUCCESS] insertDoorOpenLog — 받은 엔티티 그대로 insert(@BeforeInsert 가 돈다)', async () => {
        const {repository, openLog} = makeRepository();
        const log = new DoorOpenLogEntity();
        log.door_open_log_id = 'l1';

        await repository.insertDoorOpenLog(log);

        expect(openLog.insert).toHaveBeenCalledTimes(1);
        expect(openLog.insert).toHaveBeenCalledWith(log);
    });

    it('[FAIL:repository] insertDoorOpenLog — 쓰기 실패는 통일 500', async () => {
        const {repository, openLog} = makeRepository();
        openLog.insert.mockRejectedValueOnce(new Error('db'));

        await expect(repository.insertDoorOpenLog(new DoorOpenLogEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findDoorStore', 'store'],
        ['findDoorRoom', 'room'],
        ['findDoorRoomQr', 'roomQr'],
    ] as const)('[FAIL:repository] %s — 조회 실패는 통일 500', async (method, repo) => {
        const fakes = makeRepository();
        fakes[repo].findOne.mockRejectedValueOnce(new Error('db'));

        await expect((fakes.repository[method] as (where: unknown) => Promise<unknown>)({})).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('[FAIL:repository] findStoreDoorRoomRows 는 같은 인자로 buildStoreDoorRoomRowsQuery 를 실행하고, 실패는 통일 500', async () => {
        const {repository} = makeRepository();
        const failing = {getRawMany: vi.fn().mockRejectedValue(new Error('db'))};
        const spy = vi.spyOn(repository, 'buildStoreDoorRoomRowsQuery').mockReturnValue(failing as never);

        await expect(repository.findStoreDoorRoomRows('s1')).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith('s1');
    });
});

describe('[SMOKE:data-access] 업체 호실 문 목록 · 문 소켓 업체 · 문 QR 이력 — DB 연결 없이 SQL 빌드, 지워지지 않은 행만', () => {
    let dataSource: DataSource;
    let repository: DoorRepository;

    /** 업체 호실 문 목록 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순 */
    const STORE_DOOR_ROOM_ROWS_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 ORDER BY "r"."floor" ASC, "r"."room_name" ASC';
    /** 문 소켓 접속 확인의 업체 — findOne 에 넘긴 조건(탈퇴 제외 · 지운 업체 제외) */
    const DOOR_STORE_SQL =
        'SELECT "StoreEntity"."store_id" AS "StoreEntity_store_id", "StoreEntity"."store_code" AS "StoreEntity_store_code", "StoreEntity"."store_name" AS "StoreEntity_store_name", "StoreEntity"."business_number" AS "StoreEntity_business_number", "StoreEntity"."owner_name" AS "StoreEntity_owner_name", "StoreEntity"."phone" AS "StoreEntity_phone", "StoreEntity"."address" AS "StoreEntity_address", "StoreEntity"."address_detail" AS "StoreEntity_address_detail", "StoreEntity"."latitude" AS "StoreEntity_latitude", "StoreEntity"."longitude" AS "StoreEntity_longitude", "StoreEntity"."introduction" AS "StoreEntity_introduction", "StoreEntity"."is_always_open" AS "StoreEntity_is_always_open", "StoreEntity"."is_open" AS "StoreEntity_is_open", "StoreEntity"."maintenance_minutes" AS "StoreEntity_maintenance_minutes", "StoreEntity"."booking_open_hours" AS "StoreEntity_booking_open_hours", "StoreEntity"."refund_deadline_minutes" AS "StoreEntity_refund_deadline_minutes", "StoreEntity"."late_refund_percent" AS "StoreEntity_late_refund_percent", "StoreEntity"."door_secret" AS "StoreEntity_door_secret", "StoreEntity"."suspend_comment" AS "StoreEntity_suspend_comment", "StoreEntity"."is_deleted" AS "StoreEntity_is_deleted", "StoreEntity"."delete_backup" AS "StoreEntity_delete_backup", "StoreEntity"."created_at" AS "StoreEntity_created_at", "StoreEntity"."updated_at" AS "StoreEntity_updated_at", "StoreEntity"."store_state_id" AS "StoreEntity_store_state_id" FROM "t_store" "StoreEntity" WHERE (("StoreEntity"."store_id" = $1) AND ("StoreEntity"."store_state_id" != $2) AND ("StoreEntity"."is_deleted" = $3))';

    /** 문이 읽은 QR 의 이력 — findOne 에 넘긴 조건(호실 · QR) */
    const DOOR_ROOM_QR_SQL =
        'SELECT "RoomQrEntity"."room_qr_id" AS "RoomQrEntity_room_qr_id", "RoomQrEntity"."qr" AS "RoomQrEntity_qr", "RoomQrEntity"."starts_at" AS "RoomQrEntity_starts_at", "RoomQrEntity"."ends_at" AS "RoomQrEntity_ends_at", "RoomQrEntity"."created_at" AS "RoomQrEntity_created_at", "RoomQrEntity"."updated_at" AS "RoomQrEntity_updated_at", "RoomQrEntity"."room_id" AS "RoomQrEntity_room_id", "RoomQrEntity"."reservation_id" AS "RoomQrEntity_reservation_id" FROM "t_room_qr" "RoomQrEntity" WHERE (("RoomQrEntity"."room_id" = $1) AND ("RoomQrEntity"."qr" = $2))';

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new DoorRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('업체 호실 문 목록 — 그룹 조인 · 지워지지 않은 호실 · 그룹만 · 층 · 호실명 순(페이지 없음), select 별칭 = DoorRoomRow 키', () => {
        const [sql, parameters] = repository.buildStoreDoorRoomRowsQuery('s1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id"');
        expect(flat).toContain('"r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0');
        expect(flat).toContain('ORDER BY "r"."floor" ASC, "r"."room_name" ASC');
        expect(flat).not.toContain('LIMIT');
        expect([...selectAliases(flat)].sort()).toEqual([...DOOR_ROOM_ROW_KEYS].sort());
        expect(flat).toBe(STORE_DOOR_ROOM_ROWS_SQL);
    });

    it('문 소켓 접속 확인의 업체 — findOne 에 넘긴 조건(업체 · 탈퇴 아님 · 지워지지 않음) 그대로', async () => {
        const findOne = vi.spyOn(dataSource.manager, 'findOne').mockResolvedValue(null);

        await repository.findDoorStore({store_id: 's1', store_state_id: Not('LEAVE')});
        const [sql, parameters] = buildFindQuery(dataSource, findOne.mock.calls[0]);
        findOne.mockRestore();

        expect(parameters).toEqual(['s1', 'LEAVE', 0]);
        expect(sql).toContain('"StoreEntity"."store_state_id" != $2');
        expect(sql).toContain('"StoreEntity"."is_deleted" = $3');
        expect(sql).toBe(DOOR_STORE_SQL);
    });

    it('문이 읽은 QR 의 이력 — findOne 에 넘긴 조건(관계 컬럼 호실 · QR) 그대로, 지우지 않는 표라 is_deleted 없음', async () => {
        const findOne = vi.spyOn(dataSource.manager, 'findOne').mockResolvedValue(null);

        await repository.findDoorRoomQr({room_id: 'r1', qr: 'q1'});
        const [sql, parameters] = buildFindQuery(dataSource, findOne.mock.calls[0]);
        findOne.mockRestore();

        expect(parameters).toEqual(['r1', 'q1']);
        expect(sql).toContain('WHERE (("RoomQrEntity"."room_id" = $1) AND ("RoomQrEntity"."qr" = $2))');
        expect(sql).not.toContain('is_deleted');
        expect(sql).toBe(DOOR_ROOM_QR_SQL);
    });
});
