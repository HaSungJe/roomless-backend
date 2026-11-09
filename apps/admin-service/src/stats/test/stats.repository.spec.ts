import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, In} from 'typeorm';
import type {EntityTarget, FindManyOptions, ObjectLiteral} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {StatsFilter} from '../interfaces/stats.repository.interface.js';
import {StatsRepository} from '../repositories/stats.repository.js';

/** 기간 2026-09 ~ 2026-11(한국) · LIVE · 전체 */
const ALL_FILTER: StatsFilter = {from: new Date('2026-08-31T15:00:00.000Z'), to: new Date('2026-11-30T15:00:00.000Z'), environment: 'LIVE', store_id: null};

/** 같은 기간 · 업체 하나(내 업체 통계) */
const STORE_FILTER: StatsFilter = {...ALL_FILTER, store_id: 's1'};

/**
 * repository 가 manager.find 에 넘긴 옵션을 SQL 로 빌드한다 — EntityManager.find 와 같은 방식(실행만 뺀다).
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
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티)마다 가짜 repository.
 *
 * @returns 저장소와 가짜 repository 들
 */
function makeRepository() {
    const fake = () => ({find: vi.fn().mockResolvedValue([])});
    const repositories = new Map<unknown, ReturnType<typeof fake>>();
    const txHost = {
        tx: {
            getRepository: (entity: unknown) => {
                if (!repositories.has(entity)) {
                    repositories.set(entity, fake());
                }
                return repositories.get(entity);
            },
        },
    } as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    const repository = new StatsRepository(txHost);
    return {repository, of: (entity: unknown) => txHost.tx.getRepository(entity as never) as unknown as ReturnType<typeof fake>};
}

describe('StatsRepository — 조건 · 오류 변환', () => {
    it('[SUCCESS] findStatsStores 는 받은 조건에 지워지지 않은 업체(is_deleted 0)를 붙여 loadRelationIds', async () => {
        const {repository, of} = makeRepository();

        await repository.findStatsStores({store_id: In(['s1', 's2'])});
        await repository.findStatsStores({});

        expect(of(StoreEntity).find).toHaveBeenNthCalledWith(1, {where: {store_id: In(['s1', 's2']), is_deleted: 0}, loadRelationIds: true});
        expect(of(StoreEntity).find).toHaveBeenNthCalledWith(2, {where: {is_deleted: 0}, loadRelationIds: true});
    });

    it('[FAIL:repository] findStatsStores 실패는 통일 500', async () => {
        const {repository, of} = makeRepository();
        of(StoreEntity).find.mockRejectedValueOnce(new Error('db'));

        await expect(repository.findStatsStores({})).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findManagerStore', 'buildManagerStoreQuery', ['m1'], 'getOne'],
        ['findUsageRows', 'buildUsageQuery', [ALL_FILTER], 'getRawMany'],
        ['findPaymentRows', 'buildPaymentQuery', [ALL_FILTER], 'getRawMany'],
        ['findRefundRows', 'buildRefundQuery', [ALL_FILTER], 'getRawMany'],
    ] as const)('[FAIL:repository] %s 는 %s 를 실행하고, 실패는 통일 500', async (method, builder, args, run) => {
        const {repository} = makeRepository();
        const failing = {[run]: vi.fn().mockRejectedValue(new Error('db'))};
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue(failing);

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(...args);
    });
});

describe('[SMOKE:data-access] 이용 · 결제 · 환불 집계 · 매니저 소속 업체 · 업체 — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: StatsRepository;

    /** 빌드된 SQL(빌드 때 실행 출력으로 고정) */
    const USAGE_SELECT = `SELECT "r"."store_id" AS "store_id", to_char("r"."end_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS "month", GROUPING("r"."store_id") AS "grouping_store", GROUPING(to_char("r"."end_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')) AS "grouping_month", COUNT(DISTINCT "r"."user_id") AS "user_count", COUNT(*) AS "completed_count" FROM "t_reservation" "r" INNER JOIN "t_reservation_detail" "d" ON "d"."reservation_id" = "r"."reservation_id" AND "d"."reservation_detail_type_id" = $1 INNER JOIN "t_payment" "p" ON "p"."payment_id" = "d"."payment_id" WHERE "r"."reservation_state_id" = $2 AND "r"."end_at" >= $3 AND "r"."end_at" < $4 AND "p"."environment" = $5`;
    const USAGE_GROUP_BY = ` GROUP BY GROUPING SETS (("r"."store_id"), (to_char("r"."end_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')), ())`;
    const USAGE_SQL = `${USAGE_SELECT}${USAGE_GROUP_BY}`;
    const USAGE_STORE_SQL = `${USAGE_SELECT} AND "r"."store_id" = $6${USAGE_GROUP_BY}`;
    const PAYMENT_WHERE = `SELECT "r"."store_id" AS "store_id", to_char("p"."approved_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS "month", SUM("p"."amount") AS "amount" FROM "t_payment" "p" INNER JOIN "t_reservation_detail" "d" ON "d"."payment_id" = "p"."payment_id" INNER JOIN "t_reservation" "r" ON "r"."reservation_id" = "d"."reservation_id" WHERE "p"."payment_state_id" IN ($1, $2, $3, $4) AND "p"."environment" = $5 AND "p"."approved_at" >= $6 AND "p"."approved_at" < $7`;
    const PAYMENT_GROUP_BY = ` GROUP BY "r"."store_id", to_char("p"."approved_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`;
    const PAYMENT_SQL = `${PAYMENT_WHERE}${PAYMENT_GROUP_BY}`;
    const PAYMENT_STORE_SQL = `${PAYMENT_WHERE} AND "r"."store_id" = $8${PAYMENT_GROUP_BY}`;
    const REFUND_SQL = `SELECT "r"."store_id" AS "store_id", to_char("p"."refund_requested_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS "month", SUM("p"."refund_amount") AS "amount" FROM "t_payment" "p" INNER JOIN "t_reservation_detail" "d" ON "d"."payment_id" = "p"."payment_id" INNER JOIN "t_reservation" "r" ON "r"."reservation_id" = "d"."reservation_id" WHERE "p"."payment_state_id" IN ($1, $2, $3) AND "p"."environment" = $4 AND "p"."refund_requested_at" >= $5 AND "p"."refund_requested_at" < $6 GROUP BY "r"."store_id", to_char("p"."refund_requested_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`;
    const MANAGER_STORE_SQL =
        'SELECT "s"."store_id" AS "s_store_id", "s"."store_code" AS "s_store_code", "s"."store_name" AS "s_store_name", "s"."business_number" AS "s_business_number", "s"."owner_name" AS "s_owner_name", "s"."phone" AS "s_phone", "s"."address" AS "s_address", "s"."address_detail" AS "s_address_detail", "s"."latitude" AS "s_latitude", "s"."longitude" AS "s_longitude", "s"."introduction" AS "s_introduction", "s"."is_always_open" AS "s_is_always_open", "s"."is_open" AS "s_is_open", "s"."maintenance_minutes" AS "s_maintenance_minutes", "s"."booking_open_hours" AS "s_booking_open_hours", "s"."refund_deadline_minutes" AS "s_refund_deadline_minutes", "s"."late_refund_percent" AS "s_late_refund_percent", "s"."door_secret" AS "s_door_secret", "s"."suspend_comment" AS "s_suspend_comment", "s"."is_deleted" AS "s_is_deleted", "s"."delete_backup" AS "s_delete_backup", "s"."created_at" AS "s_created_at", "s"."updated_at" AS "s_updated_at", "s"."store_state_id" AS "s_store_state_id" FROM "t_store" "s" INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id" WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3 AND "s"."is_deleted" = 0';
    const STATS_STORES_SQL =
        'SELECT "StoreEntity"."store_id" AS "StoreEntity_store_id", "StoreEntity"."store_code" AS "StoreEntity_store_code", "StoreEntity"."store_name" AS "StoreEntity_store_name", "StoreEntity"."business_number" AS "StoreEntity_business_number", "StoreEntity"."owner_name" AS "StoreEntity_owner_name", "StoreEntity"."phone" AS "StoreEntity_phone", "StoreEntity"."address" AS "StoreEntity_address", "StoreEntity"."address_detail" AS "StoreEntity_address_detail", "StoreEntity"."latitude" AS "StoreEntity_latitude", "StoreEntity"."longitude" AS "StoreEntity_longitude", "StoreEntity"."introduction" AS "StoreEntity_introduction", "StoreEntity"."is_always_open" AS "StoreEntity_is_always_open", "StoreEntity"."is_open" AS "StoreEntity_is_open", "StoreEntity"."maintenance_minutes" AS "StoreEntity_maintenance_minutes", "StoreEntity"."booking_open_hours" AS "StoreEntity_booking_open_hours", "StoreEntity"."refund_deadline_minutes" AS "StoreEntity_refund_deadline_minutes", "StoreEntity"."late_refund_percent" AS "StoreEntity_late_refund_percent", "StoreEntity"."door_secret" AS "StoreEntity_door_secret", "StoreEntity"."suspend_comment" AS "StoreEntity_suspend_comment", "StoreEntity"."is_deleted" AS "StoreEntity_is_deleted", "StoreEntity"."delete_backup" AS "StoreEntity_delete_backup", "StoreEntity"."created_at" AS "StoreEntity_created_at", "StoreEntity"."updated_at" AS "StoreEntity_updated_at", "StoreEntity"."store_state_id" AS "StoreEntity_store_state_id" FROM "t_store" "StoreEntity" WHERE (("StoreEntity"."store_id" IN ($1, $2)) AND ("StoreEntity"."is_deleted" = $3))';

    beforeAll(async () => {
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new StatsRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('이용 집계(전체) — 이용 완료 · 이용 끝 기간 · 기본 구간 결제 환경, GROUPING SETS((업체), (달), ()), 별칭 = StatsUsageRow 키', () => {
        const [sql, parameters] = repository.buildUsageQuery(ALL_FILTER).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['BASE', 'COMPLETED', ALL_FILTER.from, ALL_FILTER.to, 'LIVE']);
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1])).toEqual(['store_id', 'month', 'grouping_store', 'grouping_month', 'user_count', 'completed_count']);
        expect(flat).toContain('COUNT(DISTINCT "r"."user_id")');
        expect(flat).toContain(`GROUPING SETS (("r"."store_id"), (to_char("r"."end_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')), ())`);
        expect(flat).not.toContain('"r"."store_id" = $');
        expect(flat).toBe(USAGE_SQL);
    });

    it('이용 집계(내 업체) — 업체 조건이 붙는다', () => {
        const [sql, parameters] = repository.buildUsageQuery(STORE_FILTER).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['BASE', 'COMPLETED', ALL_FILTER.from, ALL_FILTER.to, 'LIVE', 's1']);
        expect(flat).toContain('"r"."store_id" = $6');
        expect(flat).toBe(USAGE_STORE_SQL);
    });

    it('결제 집계(전체) — 승인 상태 4종 · 환경 · 승인 시각 기간, 업체 · 승인 한국 달로 합, 별칭 = StatsAmountRow 키', () => {
        const [sql, parameters] = repository.buildPaymentQuery(ALL_FILTER).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['DONE', 'REFUND_REQUESTED', 'REFUNDED', 'REFUND_FAILED', 'LIVE', ALL_FILTER.from, ALL_FILTER.to]);
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1])).toEqual(['store_id', 'month', 'amount']);
        expect(flat).toContain(`GROUP BY "r"."store_id", to_char("p"."approved_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`);
        expect(flat).toBe(PAYMENT_SQL);
    });

    it('결제 집계(내 업체) — 업체 조건이 붙는다', () => {
        const [sql, parameters] = repository.buildPaymentQuery(STORE_FILTER).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['DONE', 'REFUND_REQUESTED', 'REFUNDED', 'REFUND_FAILED', 'LIVE', ALL_FILTER.from, ALL_FILTER.to, 's1']);
        expect(flat).toContain('"r"."store_id" = $8');
        expect(flat).toBe(PAYMENT_STORE_SQL);
    });

    it('환불 집계 — 환불 신청 이후 상태 3종 · 환경 · 환불 신청 시각 기간, 환불 금액을 업체 · 신청 한국 달로 합', () => {
        const [sql, parameters] = repository.buildRefundQuery(ALL_FILTER).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['REFUND_REQUESTED', 'REFUNDED', 'REFUND_FAILED', 'LIVE', ALL_FILTER.from, ALL_FILTER.to]);
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1])).toEqual(['store_id', 'month', 'amount']);
        expect(flat).toContain('SUM("p"."refund_amount")');
        expect(flat).toContain(`GROUP BY "r"."store_id", to_char("p"."refund_requested_at" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`);
        expect(flat).toBe(REFUND_SQL);
    });

    it('매니저 소속 업체 — t_user 조인 · 매니저 그룹 · 탈퇴 업체 제외 · 지워지지 않은 업체, 잠금 없음', () => {
        const [sql, parameters] = repository.buildManagerStoreQuery('m1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['m1', 'MANAGER', 'LEAVE']);
        expect(flat).toContain('INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id"');
        expect(flat).toContain('"s"."is_deleted" = 0');
        expect(flat).not.toContain('FOR UPDATE');
        expect(flat).toBe(MANAGER_STORE_SQL);
    });

    it('업체 — find 에 넘긴 조건(업체 ID In · 지워지지 않은 업체)', async () => {
        const find = vi.spyOn(dataSource.manager, 'find').mockResolvedValue([]);

        await repository.findStatsStores({store_id: In(['s1', 's2'])});
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);
        find.mockRestore();

        expect(parameters).toEqual(['s1', 's2', 0]);
        expect(sql).toBe(STATS_STORES_SQL);
    });
});
