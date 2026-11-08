import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, In, MoreThanOrEqual} from 'typeorm';
import type {EntityTarget, FindManyOptions, ObjectLiteral} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {DiscoveryRoomCountRow, DiscoveryStorePlanRow, DiscoveryStoreRow} from '../interfaces/discovery.repository.interface.js';
import {DiscoveryRepository} from '../repositories/discovery.repository.js';

/** DiscoveryStoreRow 키 — raw select 별칭과 비교 */
const STORE_ROW_KEYS: (keyof DiscoveryStoreRow)[] = [
    'store_id',
    'store_name',
    'address',
    'latitude',
    'longitude',
    'distance_m',
    'cover_file_key',
    'is_open',
    'is_always_open',
    'min_hourly_price',
    'min_night_price',
];

/** DiscoveryStorePlanRow 키 */
const STORE_PLAN_ROW_KEYS: (keyof DiscoveryStorePlanRow)[] = [
    'room_plan_type_id',
    'room_plan_type_name',
    'is_used',
    'days_of_week',
    'usage_hours',
    'check_in_time',
    'check_out_time',
    'min_nights',
    'max_nights',
    'is_extendable',
    'max_extensions',
];

/** DiscoveryRoomCountRow 키 */
const ROOM_COUNT_ROW_KEYS: (keyof DiscoveryRoomCountRow)[] = ['room_group_id', 'room_count'];

/** 서울 5km 조건 */
const FILTER = {latitude: 37.5665, longitude: 126.978, radius_m: 5000, min_latitude: 37.521534, max_latitude: 37.611466, min_longitude: 126.921271, max_longitude: 127.034729};

/**
 * repository 가 manager.find · findOne 에 넘긴 옵션을 SQL 로 빌드한다 — EntityManager 와 같은 방식(실행만 뺀다).
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
 * raw select 의 별칭 목록 (` AS "<키>"`) — 서브쿼리 안의 별칭은 없다
 *
 * @param sql 공백을 한 칸으로 줄인 SQL
 * @returns 별칭 목록
 */
function selectAliases(sql: string): string[] {
    return [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]);
}

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티) 가 엔티티별 가짜 repository 를 돌려준다.
 *
 * @returns 저장소와 엔티티별 가짜 repository
 */
function makeRepository() {
    const fake = () => ({find: vi.fn().mockResolvedValue([]), findOne: vi.fn().mockResolvedValue(null)});
    const entities = [
        StoreEntity,
        StoreFileEntity,
        StoreHourEntity,
        StoreBreakEntity,
        RoomPlanEntity,
        RoomGroupEntity,
        RoomEntity,
        RoomGroupImageEntity,
        RoomGroupPlanEntity,
        RoomGroupPlanPriceEntity,
    ];
    const repos = new Map<unknown, ReturnType<typeof fake>>(entities.map((entity) => [entity, fake()]));
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new DiscoveryRepository(txHost), repo: (entity: unknown) => repos.get(entity)!};
}

describe('DiscoveryRepository — 조건 · 통일 500', () => {
    it('업체 · 업체 사진 · 영업시간 · 브레이크 · 그룹 · 그룹 사진 · 기간 가격은 is_deleted: 0 을 더하고, 그룹 상품은 받은 조건 그대로 — 정렬 · loadRelationIds', async () => {
        const {repository, repo} = makeRepository();

        await repository.findDiscoveryStore({store_id: 's1', store_state_id: 'ACTIVE'});
        await repository.findStoreImages({store_id: 's1', store_file_purpose_id: 'STORE_IMAGE'});
        await repository.findStoreHours('s1');
        await repository.findStoreBreaks('s1');
        await repository.findRoomGroups({store_id: 's1'});
        await repository.findRoomGroupImages({room_group_id: In(['g1'])});
        await repository.findRoomGroupPlans({room_group_id: In(['g1'])});
        await repository.findRoomGroupPlanPrices({room_group_plan_id: In(['gp1']), end_date: MoreThanOrEqual('2026-11-06')});

        expect(repo(StoreEntity).findOne).toHaveBeenCalledWith({where: {store_id: 's1', store_state_id: 'ACTIVE', is_deleted: 0}, loadRelationIds: true});
        expect(repo(StoreFileEntity).find).toHaveBeenCalledWith({
            where: {store_id: 's1', store_file_purpose_id: 'STORE_IMAGE', is_deleted: 0},
            order: {sort_order: 'ASC', created_at: 'ASC'},
            loadRelationIds: true,
        });
        expect(repo(StoreHourEntity).find).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, order: {day_of_week: 'ASC'}, loadRelationIds: true});
        expect(repo(StoreBreakEntity).find).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, order: {start_time: 'ASC'}, loadRelationIds: true});
        expect(repo(RoomGroupEntity).find).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, order: {room_group_name: 'ASC'}, loadRelationIds: true});
        expect(repo(RoomGroupImageEntity).find).toHaveBeenCalledWith({where: {room_group_id: In(['g1']), is_deleted: 0}, order: {sort_order: 'ASC', created_at: 'ASC'}, loadRelationIds: true});
        expect(repo(RoomGroupPlanEntity).find).toHaveBeenCalledWith({where: {room_group_id: In(['g1'])}, loadRelationIds: true});
        expect(repo(RoomGroupPlanPriceEntity).find).toHaveBeenCalledWith({
            where: {room_group_plan_id: In(['gp1']), end_date: MoreThanOrEqual('2026-11-06'), is_deleted: 0},
            order: {start_date: 'ASC'},
            loadRelationIds: true,
        });
    });

    it.each([
        ['findDiscoveryStore', StoreEntity, 'findOne', [{store_id: 's1'}]],
        ['findStoreImages', StoreFileEntity, 'find', [{store_id: 's1'}]],
        ['findStoreHours', StoreHourEntity, 'find', ['s1']],
        ['findStoreBreaks', StoreBreakEntity, 'find', ['s1']],
        ['findRoomGroups', RoomGroupEntity, 'find', [{store_id: 's1'}]],
        ['findRoomGroupImages', RoomGroupImageEntity, 'find', [{room_group_id: 'g1'}]],
        ['findRoomGroupPlans', RoomGroupPlanEntity, 'find', [{room_group_id: 'g1'}]],
        ['findRoomGroupPlanPrices', RoomGroupPlanPriceEntity, 'find', [{room_group_plan_id: 'gp1'}]],
    ] as const)('[FAIL:repository] %s — DB 실패는 통일 500', async (method, entity, fn, args) => {
        const {repository, repo} = makeRepository();
        repo(entity)[fn].mockRejectedValueOnce(new Error('db'));

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findStoreRows', 'buildStoreRowsQuery', [FILTER, 301]],
        ['findStorePlanRows', 'buildStorePlanRowsQuery', ['s1']],
        ['countBookableRooms', 'buildBookableRoomCountsQuery', [['g1']]],
    ] as const)('[FAIL:repository] %s 는 같은 인자로 %s 를 실행하고, 실패는 통일 500', async (method, builder, args) => {
        const {repository} = makeRepository();
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue({getRawMany: vi.fn().mockRejectedValue(new Error('db'))});

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledWith(...args);
    });
});

describe('[SMOKE:data-access] 반경 업체 · 상품 설정 · 그룹별 호실 수 · find 조건 — DB 연결 없이 SQL 빌드, 지워지지 않은 행만', () => {
    let dataSource: DataSource;
    let repository: DiscoveryRepository;

    /** 반경 업체 — 서울 5km · 301개 */
    const STORE_ROWS_SQL =
        'SELECT "s"."store_id" AS "store_id", "s"."store_name" AS "store_name", "s"."address" AS "address", "s"."latitude" AS "latitude", "s"."longitude" AS "longitude", "s"."is_open" AS "is_open", "s"."is_always_open" AS "is_always_open", CAST(ROUND((12742000 * ASIN(LEAST(1, SQRT(POWER(SIN(RADIANS("s"."latitude" - $1) / 2), 2) + COS(RADIANS($1)) * COS(RADIANS("s"."latitude")) * POWER(SIN(RADIANS("s"."longitude" - $2) / 2), 2)))))) AS integer) AS "distance_m", (SELECT "f"."file_key" FROM "t_store_file" "f" WHERE "f"."store_id" = "s"."store_id" AND "f"."store_file_purpose_id" = $3 AND "f"."is_deleted" = 0 ORDER BY "f"."sort_order" ASC, "f"."created_at" ASC LIMIT 1) AS "cover_file_key", (SELECT MIN("gp"."price") FROM "t_room_group_plan" "gp" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "gp"."room_group_id" INNER JOIN "t_room_plan" "p" ON "p"."store_id" = "g"."store_id" AND "p"."room_plan_type_id" = "gp"."room_plan_type_id" WHERE "g"."store_id" = "s"."store_id" AND "g"."is_deleted" = 0 AND "gp"."room_plan_type_id" = $4 AND "gp"."is_used" = 1 AND "gp"."price" > 0 AND "p"."is_used" = 1 AND EXISTS (SELECT 1 FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0 AND "r"."room_state_id" <> $5)) AS "min_hourly_price", (SELECT MIN("gp"."price") FROM "t_room_group_plan" "gp" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "gp"."room_group_id" INNER JOIN "t_room_plan" "p" ON "p"."store_id" = "g"."store_id" AND "p"."room_plan_type_id" = "gp"."room_plan_type_id" WHERE "g"."store_id" = "s"."store_id" AND "g"."is_deleted" = 0 AND "gp"."room_plan_type_id" = $6 AND "gp"."is_used" = 1 AND "gp"."price" > 0 AND "p"."is_used" = 1 AND EXISTS (SELECT 1 FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0 AND "r"."room_state_id" <> $5)) AS "min_night_price" FROM "t_store" "s" WHERE "s"."store_state_id" = $7 AND "s"."is_deleted" = 0 AND "s"."latitude" BETWEEN $8 AND $9 AND "s"."longitude" BETWEEN $10 AND $11 AND (12742000 * ASIN(LEAST(1, SQRT(POWER(SIN(RADIANS("s"."latitude" - $1) / 2), 2) + COS(RADIANS($1)) * COS(RADIANS("s"."latitude")) * POWER(SIN(RADIANS("s"."longitude" - $2) / 2), 2))))) <= $12 ORDER BY "distance_m" ASC, "s"."store_id" ASC LIMIT 301';
    /** 그룹별 예약 받을 호실 수 */
    const ROOM_COUNTS_SQL =
        'SELECT "r"."room_group_id" AS "room_group_id", CAST(COUNT(*) AS integer) AS "room_count" FROM "t_room" "r" WHERE "r"."room_group_id" IN ($1, $2) AND "r"."is_deleted" = 0 AND "r"."room_state_id" <> $3 GROUP BY "r"."room_group_id"';
    /** 업체 상품 설정 + 종류명 */
    const STORE_PLAN_ROWS_SQL =
        'SELECT "p"."room_plan_type_id" AS "room_plan_type_id", "p"."is_used" AS "is_used", "p"."days_of_week" AS "days_of_week", "p"."usage_hours" AS "usage_hours", "p"."check_in_time" AS "check_in_time", "p"."check_out_time" AS "check_out_time", "p"."min_nights" AS "min_nights", "p"."max_nights" AS "max_nights", "p"."is_extendable" AS "is_extendable", "p"."max_extensions" AS "max_extensions", "t"."room_plan_type_name" AS "room_plan_type_name" FROM "t_room_plan" "p" INNER JOIN "t_room_plan_type" "t" ON "t"."room_plan_type_id" = "p"."room_plan_type_id" WHERE "p"."store_id" = $1';

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new DiscoveryRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('반경 업체 — 활성 · 지워지지 않음 · 사각형 BETWEEN · 대원 거리 ≤ 반경(select · where 두 곳) · 가까운 순 · LIMIT, 사진 · 최저가 서브쿼리, 별칭 = DiscoveryStoreRow 키', () => {
        const [sql, parameters] = repository.buildStoreRowsQuery(FILTER, 301).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expect.arrayContaining([37.5665, 126.978, 5000, 37.521534, 37.611466, 126.921271, 127.034729, 'ACTIVE', 'STORE_IMAGE', 'HOURLY', 'NIGHT', 'DISABLED']));
        expect(flat.match(/12742000 \* ASIN\(LEAST\(1, SQRT/g)).toHaveLength(2);
        expect(flat).toContain('"s"."latitude" BETWEEN');
        expect(flat).toContain('"s"."longitude" BETWEEN');
        expect(flat).toContain('"s"."is_deleted" = 0');
        expect(flat).toContain('"f"."is_deleted" = 0');
        expect(flat).toContain('"g"."is_deleted" = 0');
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toContain('ORDER BY "distance_m" ASC, "s"."store_id" ASC LIMIT 301');
        expect([...new Set(selectAliases(flat))].sort()).toEqual([...STORE_ROW_KEYS].sort());
        expect(flat).toBe(STORE_ROWS_SQL);
    });

    it('그룹별 예약 받을 호실 수 — IN 펼침 · 지워지지 않음 · 사용중지 제외 · GROUP BY, 별칭 = DiscoveryRoomCountRow 키', () => {
        const [sql, parameters] = repository.buildBookableRoomCountsQuery(['g1', 'g2']).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['g1', 'g2', 'DISABLED']);
        expect(flat).toContain('"r"."room_group_id" IN ($1, $2)');
        expect(flat).toContain('GROUP BY "r"."room_group_id"');
        expect(selectAliases(flat).sort()).toEqual([...ROOM_COUNT_ROW_KEYS].sort());
        expect(flat).toBe(ROOM_COUNTS_SQL);
    });

    it('업체 상품 설정 — 종류명 조인 · 그 업체만, 별칭 = DiscoveryStorePlanRow 키', () => {
        const [sql, parameters] = repository.buildStorePlanRowsQuery('s1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('INNER JOIN "t_room_plan_type" "t"');
        expect(selectAliases(flat).sort()).toEqual([...STORE_PLAN_ROW_KEYS].sort());
        expect(flat).toBe(STORE_PLAN_ROWS_SQL);
    });

    it.each([
        [
            '업체(활성 · 지워지지 않음)',
            'findOne',
            () => repository.findDiscoveryStore({store_id: 's1', store_state_id: 'ACTIVE'}),
            ['s1', 'ACTIVE', 0],
            ['"StoreEntity"."store_state_id" = $2', '"StoreEntity"."is_deleted" = $3'],
        ],
        [
            '업체 사진(용도 · 정렬)',
            'find',
            () => repository.findStoreImages({store_id: 's1', store_file_purpose_id: 'STORE_IMAGE'}),
            ['s1', 'STORE_IMAGE', 0],
            ['"StoreFileEntity"."store_id" = $1', '"StoreFileEntity"."store_file_purpose_id" = $2', 'ORDER BY "StoreFileEntity"."sort_order" ASC, "StoreFileEntity"."created_at" ASC'],
        ],
        ['영업시간(요일 순)', 'find', () => repository.findStoreHours('s1'), ['s1', 0], ['"StoreHourEntity"."store_id" = $1', 'ORDER BY "StoreHourEntity"."day_of_week" ASC']],
        ['브레이크(시작 순)', 'find', () => repository.findStoreBreaks('s1'), ['s1', 0], ['"StoreBreakEntity"."store_id" = $1', 'ORDER BY "StoreBreakEntity"."start_time" ASC']],
        ['그룹(그룹명 순)', 'find', () => repository.findRoomGroups({store_id: 's1'}), ['s1', 0], ['"RoomGroupEntity"."store_id" = $1', 'ORDER BY "RoomGroupEntity"."room_group_name" ASC']],
        ['그룹 사진(In)', 'find', () => repository.findRoomGroupImages({room_group_id: In(['g1', 'g2'])}), ['g1', 'g2', 0], ['"RoomGroupImageEntity"."room_group_id" IN ($1, $2)']],
        ['그룹 상품(In)', 'find', () => repository.findRoomGroupPlans({room_group_id: In(['g1'])}), ['g1'], ['"RoomGroupPlanEntity"."room_group_id" IN ($1)']],
        [
            '기간 가격(In · 끝 날짜 ≥ 오늘)',
            'find',
            () => repository.findRoomGroupPlanPrices({room_group_plan_id: In(['gp1']), end_date: MoreThanOrEqual('2026-11-06')}),
            ['gp1', '2026-11-06', 0],
            ['"RoomGroupPlanPriceEntity"."room_group_plan_id" IN ($1)', '"RoomGroupPlanPriceEntity"."end_date" >= $2', '"RoomGroupPlanPriceEntity"."is_deleted" = $3'],
        ],
    ] as const)('find 조건 — %s 넘긴 옵션 그대로', async (_label, fn, run, expectedParameters, fragments) => {
        const spy = vi.spyOn(dataSource.manager, fn).mockResolvedValue(fn === 'find' ? [] : null);

        await run();
        const [sql, parameters] = buildFindQuery(dataSource, spy.mock.calls[0]);
        spy.mockRestore();

        expect(parameters).toEqual(expectedParameters);
        for (const fragment of fragments) {
            expect(sql).toContain(fragment);
        }
    });
});
