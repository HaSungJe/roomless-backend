import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, In, LessThan, MoreThan, Not, QueryFailedError} from 'typeorm';
import type {EntityTarget, FindManyOptions, ObjectLiteral} from 'typeorm';
import {RESERVATION_OCCUPYING_STATES, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {ENTITIES} from '@app/database/entities.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {ReservationRepository} from '../repositories/reservation.repository.js';

/**
 * PostgreSQL 제약 위반 오류
 *
 * @param code 23P01(배타 제약) 등
 * @param constraint 제약명
 * @returns QueryFailedError
 */
function constraintError(code: string, constraint: string): QueryFailedError {
    return new QueryFailedError('INSERT ...', [], Object.assign(new Error('violates constraint'), {code, constraint}));
}

/**
 * select 별칭 목록
 *
 * @param sql SQL
 * @returns 별칭
 */
function selectAliases(sql: string): string[] {
    return [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]);
}

/**
 * repository 가 manager.find · count 에 넘긴 옵션을 SQL 로 빌드한다 — EntityManager.find · count 와 같은 방식(실행만 뺀다).
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
    const fake = () => ({
        findOne: vi.fn().mockResolvedValue(null),
        find: vi.fn().mockResolvedValue([]),
        insert: vi.fn(),
        update: vi.fn().mockResolvedValue({affected: 1}),
        count: vi.fn().mockResolvedValue(0),
    });
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
    const repository = new ReservationRepository(txHost);
    return {repository, of: (entity: unknown) => txHost.tx.getRepository(entity as never) as unknown as ReturnType<typeof fake>};
}

describe('ReservationRepository — 조건 · 오류 변환', () => {
    it('[SUCCESS] is_deleted 가 있는 표(업체 · 기간 가격)는 조건에 is_deleted = 0 을 더하고, 상품 설정은 그대로', async () => {
        const {repository, of} = makeRepository();

        await repository.findReservationStore({store_id: 's1'});
        await repository.findGroupPlanPrices({room_group_plan_id: 'gp1'});
        await repository.findStorePlan({store_id: 's1', room_plan_type_id: 'HOURLY'});

        expect(of(StoreEntity).findOne).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, loadRelationIds: true});
        expect(of(RoomGroupPlanPriceEntity).find).toHaveBeenCalledWith({where: {room_group_plan_id: 'gp1', is_deleted: 0}, loadRelationIds: true});
        expect(of(RoomPlanEntity).findOne).toHaveBeenCalledWith({where: {store_id: 's1', room_plan_type_id: 'HOURLY'}, loadRelationIds: true});
    });

    it('[FAIL:duplicate] insertReservation 은 점유 겹침(EXC_Reservation_RoomIdBlockedRange)을 400 으로, 그 밖은 통일 500', async () => {
        const {repository, of} = makeRepository();
        of(ReservationEntity).insert.mockRejectedValueOnce(constraintError('23P01', 'EXC_Reservation_RoomIdBlockedRange'));
        of(ReservationEntity).insert.mockRejectedValueOnce(new Error('db'));

        const taken = await repository.insertReservation(new ReservationEntity()).catch((e: unknown) => e);
        const failed = await repository.insertReservation(new ReservationEntity()).catch((e: unknown) => e);

        expect(taken).toBeInstanceOf(BadRequestException);
        expect((taken as BadRequestException).getResponse()).toEqual({message: '이미 예약된 시간입니다.'});
        expect(failed).toBeInstanceOf(InternalServerErrorException);
        expect((failed as InternalServerErrorException).getResponse()).toEqual({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
    });

    it('[SUCCESS] updateReservation 은 1행이면 true, 0행이면 false(상태 조건)', async () => {
        const {repository, of} = makeRepository();
        of(ReservationEntity).update.mockResolvedValueOnce({affected: 1}).mockResolvedValueOnce({affected: 0});

        await expect(repository.updateReservation({reservation_id: 'r1', reservation_state_id: 'PENDING'}, new ReservationEntity())).resolves.toBe(true);
        await expect(repository.updateReservation({reservation_id: 'r1', reservation_state_id: 'PENDING'}, new ReservationEntity())).resolves.toBe(false);
    });

    it('[SUCCESS] findRoomQr 은 받은 조건 그대로(삭제 표시 없는 표) loadRelationIds', async () => {
        const {repository, of} = makeRepository();

        await repository.findRoomQr({reservation_id: 'v1'});

        expect(of(RoomQrEntity).findOne).toHaveBeenCalledWith({where: {reservation_id: 'v1'}, loadRelationIds: true});
    });

    it('[FAIL:repository] QR 조회 · 발급 실패는 통일 500', async () => {
        const {repository, of} = makeRepository();
        of(RoomQrEntity).findOne.mockRejectedValueOnce(new Error('db'));
        vi.spyOn(repository, 'buildInsertRoomQrQuery').mockReturnValue({execute: vi.fn().mockRejectedValue(new Error('db'))} as never);

        await expect(repository.findRoomQr({reservation_id: 'v1'})).rejects.toBeInstanceOf(InternalServerErrorException);
        await expect(repository.insertRoomQr(new RoomQrEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findBookableRooms', 'buildBookableRoomsQuery', ['s1']],
        ['countRecentExpired', 'buildRecentExpiredQuery', ['u1', 'r1', new Date('2026-11-03T00:00:00Z')]],
        ['findReservationSegmentRows', 'buildReservationSegmentsQuery', ['v1']],
    ] as const)('%s 는 같은 인자로 %s 를 실행하고, 실패는 통일 500', async (method, builder, args) => {
        const {repository} = makeRepository();
        const failing = {getRawMany: vi.fn().mockRejectedValue(new Error('db')), getCount: vi.fn().mockRejectedValue(new Error('db'))};
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue(failing);

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledWith(...args);
    });
});

describe('[SMOKE:data-access] 예약 가능 호실 · 최근 만료 · 내 예약 · 구간 · QR 발급 — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: ReservationRepository;

    /** 빌드된 SQL(빌드 때 실행 출력으로 고정) */
    const BOOKABLE_ROOMS_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."room_group_id" AS "room_group_id", "g"."room_group_name" AS "room_group_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 ORDER BY "r"."floor" ASC, "r"."room_name" ASC';
    const RECENT_EXPIRED_SQL =
        'SELECT "r"."reservation_id" AS "r_reservation_id", "r"."start_at" AS "r_start_at", "r"."end_at" AS "r_end_at", "r"."maintenance_minutes" AS "r_maintenance_minutes", "r"."blocked_until" AS "r_blocked_until", "r"."total_price" AS "r_total_price", "r"."refund_deadline_at" AS "r_refund_deadline_at", "r"."late_refund_percent" AS "r_late_refund_percent", "r"."checked_in_at" AS "r_checked_in_at", "r"."completed_at" AS "r_completed_at", "r"."canceled_at" AS "r_canceled_at", "r"."cancel_actor" AS "r_cancel_actor", "r"."cancel_reason" AS "r_cancel_reason", "r"."created_at" AS "r_created_at", "r"."updated_at" AS "r_updated_at", "r"."user_id" AS "r_user_id", "r"."store_id" AS "r_store_id", "r"."room_id" AS "r_room_id", "r"."room_plan_type_id" AS "r_room_plan_type_id", "r"."reservation_state_id" AS "r_reservation_state_id" FROM "t_reservation" "r" INNER JOIN "t_reservation_detail" "d" ON "d"."reservation_id" = "r"."reservation_id" AND "d"."reservation_detail_type_id" = $1 WHERE "r"."user_id" = $2 AND "r"."room_id" = $3 AND "r"."reservation_state_id" = $4 AND "d"."expires_at" > $5';
    const MY_RESERVATIONS_SQL =
        'SELECT "r"."reservation_id" AS "reservation_id", "r"."store_id" AS "store_id", "r"."room_id" AS "room_id", "r"."room_plan_type_id" AS "room_plan_type_id", "r"."reservation_state_id" AS "reservation_state_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at", "r"."total_price" AS "total_price", "r"."refund_deadline_at" AS "refund_deadline_at", "r"."late_refund_percent" AS "late_refund_percent", "r"."canceled_at" AS "canceled_at", "r"."cancel_actor" AS "cancel_actor", "r"."cancel_reason" AS "cancel_reason", "r"."created_at" AS "created_at", "s"."store_name" AS "store_name", "rm"."room_name" AS "room_name", "g"."room_group_name" AS "room_group_name", "pt"."room_plan_type_name" AS "room_plan_type_name", "st"."reservation_state_name" AS "reservation_state_name" FROM "t_reservation" "r" INNER JOIN "t_store" "s" ON "s"."store_id" = "r"."store_id" INNER JOIN "t_room" "rm" ON "rm"."room_id" = "r"."room_id" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "rm"."room_group_id" INNER JOIN "t_room_plan_type" "pt" ON "pt"."room_plan_type_id" = "r"."room_plan_type_id" INNER JOIN "t_reservation_state" "st" ON "st"."reservation_state_id" = "r"."reservation_state_id" WHERE "r"."user_id" = $1 AND "r"."reservation_state_id" <> $2';
    const MY_RESERVATION_SQL =
        'SELECT "r"."reservation_id" AS "reservation_id", "r"."store_id" AS "store_id", "r"."room_id" AS "room_id", "r"."room_plan_type_id" AS "room_plan_type_id", "r"."reservation_state_id" AS "reservation_state_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at", "r"."total_price" AS "total_price", "r"."refund_deadline_at" AS "refund_deadline_at", "r"."late_refund_percent" AS "late_refund_percent", "r"."canceled_at" AS "canceled_at", "r"."cancel_actor" AS "cancel_actor", "r"."cancel_reason" AS "cancel_reason", "r"."created_at" AS "created_at", "s"."store_name" AS "store_name", "rm"."room_name" AS "room_name", "g"."room_group_name" AS "room_group_name", "pt"."room_plan_type_name" AS "room_plan_type_name", "st"."reservation_state_name" AS "reservation_state_name" FROM "t_reservation" "r" INNER JOIN "t_store" "s" ON "s"."store_id" = "r"."store_id" INNER JOIN "t_room" "rm" ON "rm"."room_id" = "r"."room_id" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "rm"."room_group_id" INNER JOIN "t_room_plan_type" "pt" ON "pt"."room_plan_type_id" = "r"."room_plan_type_id" INNER JOIN "t_reservation_state" "st" ON "st"."reservation_state_id" = "r"."reservation_state_id" WHERE "r"."user_id" = $1 AND "r"."reservation_state_id" <> $2 AND "r"."reservation_id" = $3';
    const SEGMENTS_SQL =
        'SELECT "d"."reservation_detail_id" AS "reservation_detail_id", "d"."reservation_detail_type_id" AS "reservation_detail_type_id", "d"."reservation_state_id" AS "reservation_state_id", "d"."start_at" AS "start_at", "d"."end_at" AS "end_at", "d"."price" AS "price", "d"."expires_at" AS "expires_at", "d"."payment_id" AS "payment_id", "dt"."reservation_detail_type_name" AS "reservation_detail_type_name", "p"."payment_state_id" AS "payment_state_id", "p"."amount" AS "amount", "p"."method" AS "method", "p"."approved_at" AS "approved_at", "p"."receipt_url" AS "receipt_url", "p"."refund_amount" AS "refund_amount", "p"."refunded_at" AS "refunded_at", "ps"."payment_state_name" AS "payment_state_name" FROM "t_reservation_detail" "d" INNER JOIN "t_reservation_detail_type" "dt" ON "dt"."reservation_detail_type_id" = "d"."reservation_detail_type_id" INNER JOIN "t_payment" "p" ON "p"."payment_id" = "d"."payment_id" INNER JOIN "t_payment_state" "ps" ON "ps"."payment_state_id" = "p"."payment_state_id" WHERE "d"."reservation_id" = $1 ORDER BY "d"."start_at" ASC';
    const INSERT_ROOM_QR_SQL =
        'INSERT INTO "t_room_qr"("room_qr_id", "qr", "starts_at", "ends_at", "created_at", "updated_at", "room_id", "reservation_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING';

    beforeAll(async () => {
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('예약 가능 호실 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순, 별칭 = BookableRoomRow 키', () => {
        const [sql, parameters] = repository.buildBookableRoomsQuery('s1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('INNER JOIN "t_room_group" "g"');
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toContain('"g"."is_deleted" = 0');
        expect([...selectAliases(flat)].sort()).toEqual(['floor', 'room_group_id', 'room_group_name', 'room_id', 'room_name', 'room_state_id']);
        expect(flat).toBe(BOOKABLE_ROOMS_SQL);
    });

    it('최근 결제 대기 만료 — 기본 구간 조인 · 만료 상태 · expires_at > since', () => {
        const since = new Date('2026-11-02T23:50:00Z');
        const [sql, parameters] = repository.buildRecentExpiredQuery('u1', 'r1', since).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['BASE', 'u1', 'r1', 'EXPIRED', since]);
        expect(flat).toContain('INNER JOIN "t_reservation_detail" "d"');
        expect(flat).toContain('"d"."expires_at" > $5');
        expect(flat).toBe(RECENT_EXPIRED_SQL);
    });

    it.each([
        [null, ['u1', 'EXPIRED']],
        ['v1', ['u1', 'EXPIRED', 'v1']],
    ])('내 예약 (예약 %s) — 업체 · 호실 · 그룹 · 상품 종류 · 상태 조인, 결제 대기 만료 제외, 별칭 = ReservationListRow 키', (reservation_id, expectedParameters) => {
        const [sql, parameters] = repository.buildMyReservationsQuery('u1', reservation_id).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expectedParameters);
        expect(flat).toContain('"r"."reservation_state_id" <> $2');
        expect(selectAliases(flat)).toHaveLength(19);
        expect(flat).toBe(reservation_id === null ? MY_RESERVATIONS_SQL : MY_RESERVATION_SQL);
    });

    it('예약 구간 — 종류 · 결제 · 결제 상태 조인, 시작 순, 별칭 = ReservationSegmentRow 키', () => {
        const [sql, parameters] = repository.buildReservationSegmentsQuery('v1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['v1']);
        expect(flat).toContain('INNER JOIN "t_payment" "p"');
        expect(selectAliases(flat)).toHaveLength(17);
        expect(flat).toBe(SEGMENTS_SQL);
    });

    it('QR 발급 — INSERT … ON CONFLICT DO NOTHING(같은 예약 · QR 이 있으면 넣지 않는다), 등록일 · 수정일까지 값으로', () => {
        const entity = new RoomQrEntity();
        entity.room_qr_id = 'q1';
        entity.room_id = 'r1';
        entity.reservation_id = 'v1';
        entity.qr = 'qr1';
        entity.starts_at = new Date('2026-11-10T04:00:00Z');
        entity.ends_at = new Date('2026-11-10T07:00:00Z');
        entity.insertTimestamp();

        const [sql, parameters] = repository.buildInsertRoomQrQuery(entity).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(flat).toContain('INSERT INTO "t_room_qr"');
        expect(flat).toContain('ON CONFLICT DO NOTHING');
        expect(parameters).toEqual(expect.arrayContaining(['q1', 'r1', 'v1', 'qr1', entity.starts_at, entity.ends_at]));
        expect(flat).toBe(INSERT_ROOM_QR_SQL);
    });
});

describe('[SMOKE:data-access] find 조건(관계 필드 In · LessThan · MoreThan · Not) — DB 연결 없이 SQL 빌드, repository 가 넘긴 옵션 그대로', () => {
    let dataSource: DataSource;
    let repository: ReservationRepository;
    let find: ReturnType<typeof vi.spyOn>;
    let count: ReturnType<typeof vi.spyOn>;
    const from = new Date('2026-11-04T00:00:00Z');
    const to = new Date('2026-11-05T00:00:00Z');

    /** 빌드된 SQL(빌드 때 실행 출력으로 고정) */
    const OCCUPIED_SQL =
        'SELECT "ReservationEntity"."reservation_id" AS "ReservationEntity_reservation_id", "ReservationEntity"."start_at" AS "ReservationEntity_start_at", "ReservationEntity"."end_at" AS "ReservationEntity_end_at", "ReservationEntity"."maintenance_minutes" AS "ReservationEntity_maintenance_minutes", "ReservationEntity"."blocked_until" AS "ReservationEntity_blocked_until", "ReservationEntity"."total_price" AS "ReservationEntity_total_price", "ReservationEntity"."refund_deadline_at" AS "ReservationEntity_refund_deadline_at", "ReservationEntity"."late_refund_percent" AS "ReservationEntity_late_refund_percent", "ReservationEntity"."checked_in_at" AS "ReservationEntity_checked_in_at", "ReservationEntity"."completed_at" AS "ReservationEntity_completed_at", "ReservationEntity"."canceled_at" AS "ReservationEntity_canceled_at", "ReservationEntity"."cancel_actor" AS "ReservationEntity_cancel_actor", "ReservationEntity"."cancel_reason" AS "ReservationEntity_cancel_reason", "ReservationEntity"."created_at" AS "ReservationEntity_created_at", "ReservationEntity"."updated_at" AS "ReservationEntity_updated_at", "ReservationEntity"."user_id" AS "ReservationEntity_user_id", "ReservationEntity"."store_id" AS "ReservationEntity_store_id", "ReservationEntity"."room_id" AS "ReservationEntity_room_id", "ReservationEntity"."room_plan_type_id" AS "ReservationEntity_room_plan_type_id", "ReservationEntity"."reservation_state_id" AS "ReservationEntity_reservation_state_id" FROM "t_reservation" "ReservationEntity" WHERE (("ReservationEntity"."room_id" IN ($1, $2)) AND ("ReservationEntity"."reservation_state_id" IN ($3, $4, $5)) AND ("ReservationEntity"."start_at" < $6) AND ("ReservationEntity"."blocked_until" > $7))';
    const UNAVAILABLE_SQL =
        'SELECT "StoreUnavailablePeriodEntity"."store_unavailable_period_id" AS "StoreUnavailablePeriodEntity_store_unavailable_period_id", "StoreUnavailablePeriodEntity"."starts_at" AS "StoreUnavailablePeriodEntity_starts_at", "StoreUnavailablePeriodEntity"."ends_at" AS "StoreUnavailablePeriodEntity_ends_at", "StoreUnavailablePeriodEntity"."memo" AS "StoreUnavailablePeriodEntity_memo", "StoreUnavailablePeriodEntity"."is_deleted" AS "StoreUnavailablePeriodEntity_is_deleted", "StoreUnavailablePeriodEntity"."created_at" AS "StoreUnavailablePeriodEntity_created_at", "StoreUnavailablePeriodEntity"."updated_at" AS "StoreUnavailablePeriodEntity_updated_at", "StoreUnavailablePeriodEntity"."store_id" AS "StoreUnavailablePeriodEntity_store_id" FROM "t_store_unavailable_period" "StoreUnavailablePeriodEntity" WHERE (("StoreUnavailablePeriodEntity"."store_id" = $1) AND ("StoreUnavailablePeriodEntity"."starts_at" < $2) AND ("StoreUnavailablePeriodEntity"."ends_at" > $3) AND ("StoreUnavailablePeriodEntity"."is_deleted" = $4))';
    const GROUP_PLANS_SQL =
        'SELECT "RoomGroupPlanEntity"."room_group_plan_id" AS "RoomGroupPlanEntity_room_group_plan_id", "RoomGroupPlanEntity"."is_used" AS "RoomGroupPlanEntity_is_used", "RoomGroupPlanEntity"."price" AS "RoomGroupPlanEntity_price", "RoomGroupPlanEntity"."created_at" AS "RoomGroupPlanEntity_created_at", "RoomGroupPlanEntity"."updated_at" AS "RoomGroupPlanEntity_updated_at", "RoomGroupPlanEntity"."room_group_id" AS "RoomGroupPlanEntity_room_group_id", "RoomGroupPlanEntity"."room_plan_type_id" AS "RoomGroupPlanEntity_room_plan_type_id" FROM "t_room_group_plan" "RoomGroupPlanEntity" WHERE (("RoomGroupPlanEntity"."room_group_id" IN ($1, $2)) AND ("RoomGroupPlanEntity"."room_plan_type_id" = $3))';
    const GROUP_PLAN_PRICES_SQL =
        'SELECT "RoomGroupPlanPriceEntity"."room_group_plan_price_id" AS "RoomGroupPlanPriceEntity_room_group_plan_price_id", "RoomGroupPlanPriceEntity"."start_date" AS "RoomGroupPlanPriceEntity_start_date", "RoomGroupPlanPriceEntity"."end_date" AS "RoomGroupPlanPriceEntity_end_date", "RoomGroupPlanPriceEntity"."price" AS "RoomGroupPlanPriceEntity_price", "RoomGroupPlanPriceEntity"."memo" AS "RoomGroupPlanPriceEntity_memo", "RoomGroupPlanPriceEntity"."is_deleted" AS "RoomGroupPlanPriceEntity_is_deleted", "RoomGroupPlanPriceEntity"."created_at" AS "RoomGroupPlanPriceEntity_created_at", "RoomGroupPlanPriceEntity"."updated_at" AS "RoomGroupPlanPriceEntity_updated_at", "RoomGroupPlanPriceEntity"."room_group_plan_id" AS "RoomGroupPlanPriceEntity_room_group_plan_id" FROM "t_room_group_plan_price" "RoomGroupPlanPriceEntity" WHERE (("RoomGroupPlanPriceEntity"."room_group_plan_id" IN ($1, $2)) AND ("RoomGroupPlanPriceEntity"."is_deleted" = $3))';
    const STORE_HOURS_SQL =
        'SELECT "StoreHourEntity"."store_hour_id" AS "StoreHourEntity_store_hour_id", "StoreHourEntity"."day_of_week" AS "StoreHourEntity_day_of_week", "StoreHourEntity"."is_closed" AS "StoreHourEntity_is_closed", "StoreHourEntity"."open_time" AS "StoreHourEntity_open_time", "StoreHourEntity"."close_time" AS "StoreHourEntity_close_time", "StoreHourEntity"."is_deleted" AS "StoreHourEntity_is_deleted", "StoreHourEntity"."created_at" AS "StoreHourEntity_created_at", "StoreHourEntity"."updated_at" AS "StoreHourEntity_updated_at", "StoreHourEntity"."store_id" AS "StoreHourEntity_store_id" FROM "t_store_hour" "StoreHourEntity" WHERE (("StoreHourEntity"."store_id" = $1) AND ("StoreHourEntity"."is_deleted" = $2))';
    const STORE_BREAKS_SQL =
        'SELECT "StoreBreakEntity"."store_break_id" AS "StoreBreakEntity_store_break_id", "StoreBreakEntity"."start_time" AS "StoreBreakEntity_start_time", "StoreBreakEntity"."end_time" AS "StoreBreakEntity_end_time", "StoreBreakEntity"."is_deleted" AS "StoreBreakEntity_is_deleted", "StoreBreakEntity"."created_at" AS "StoreBreakEntity_created_at", "StoreBreakEntity"."updated_at" AS "StoreBreakEntity_updated_at", "StoreBreakEntity"."store_id" AS "StoreBreakEntity_store_id" FROM "t_store_break" "StoreBreakEntity" WHERE (("StoreBreakEntity"."store_id" = $1) AND ("StoreBreakEntity"."is_deleted" = $2))';
    const COUNT_RESERVATIONS_SQL =
        'SELECT "ReservationEntity"."reservation_id" AS "ReservationEntity_reservation_id", "ReservationEntity"."start_at" AS "ReservationEntity_start_at", "ReservationEntity"."end_at" AS "ReservationEntity_end_at", "ReservationEntity"."maintenance_minutes" AS "ReservationEntity_maintenance_minutes", "ReservationEntity"."blocked_until" AS "ReservationEntity_blocked_until", "ReservationEntity"."total_price" AS "ReservationEntity_total_price", "ReservationEntity"."refund_deadline_at" AS "ReservationEntity_refund_deadline_at", "ReservationEntity"."late_refund_percent" AS "ReservationEntity_late_refund_percent", "ReservationEntity"."checked_in_at" AS "ReservationEntity_checked_in_at", "ReservationEntity"."completed_at" AS "ReservationEntity_completed_at", "ReservationEntity"."canceled_at" AS "ReservationEntity_canceled_at", "ReservationEntity"."cancel_actor" AS "ReservationEntity_cancel_actor", "ReservationEntity"."cancel_reason" AS "ReservationEntity_cancel_reason", "ReservationEntity"."created_at" AS "ReservationEntity_created_at", "ReservationEntity"."updated_at" AS "ReservationEntity_updated_at", "ReservationEntity"."user_id" AS "ReservationEntity_user_id", "ReservationEntity"."store_id" AS "ReservationEntity_store_id", "ReservationEntity"."room_id" AS "ReservationEntity_room_id", "ReservationEntity"."room_plan_type_id" AS "ReservationEntity_room_plan_type_id", "ReservationEntity"."reservation_state_id" AS "ReservationEntity_reservation_state_id" FROM "t_reservation" "ReservationEntity" WHERE (("ReservationEntity"."user_id" = $1) AND ("ReservationEntity"."reservation_state_id" != $2))';

    beforeAll(async () => {
        // 접속하지 않는다 — find · count 는 옵션만 가로채고, SQL 은 같은 옵션으로 QueryBuilder 가 조립한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
        find = vi.spyOn(dataSource.manager, 'find').mockResolvedValue([]);
        count = vi.spyOn(dataSource.manager, 'count').mockResolvedValue(0);
    });

    beforeEach(() => {
        find.mockClear();
        count.mockClear();
    });

    it('점유 예약 — 호실 IN · 점유 상태 IN · 시작 < 범위 끝 · 막힌 끝 > 범위 시작', async () => {
        await repository.findReservations({room_id: In(['r1', 'r2']), reservation_state_id: In(RESERVATION_OCCUPYING_STATES), start_at: LessThan(to), blocked_until: MoreThan(from)});
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(find).toHaveBeenCalledTimes(1);
        expect(parameters).toEqual(['r1', 'r2', 'PENDING', 'CONFIRMED', 'CHECKED_IN', to, from]);
        expect(sql).toContain(
            'WHERE (("ReservationEntity"."room_id" IN ($1, $2)) AND ("ReservationEntity"."reservation_state_id" IN ($3, $4, $5)) AND ("ReservationEntity"."start_at" < $6) AND ("ReservationEntity"."blocked_until" > $7))',
        );
        expect(sql).toBe(OCCUPIED_SQL);
    });

    it('일시 예약불가 — 업체 · 시작 < 범위 끝 · 끝 > 범위 시작 · 지워지지 않은 것', async () => {
        await repository.findUnavailablePeriods({store_id: 's1', starts_at: LessThan(to), ends_at: MoreThan(from)});
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(parameters).toEqual(['s1', to, from, 0]);
        expect(sql).toContain('("StoreUnavailablePeriodEntity"."starts_at" < $2) AND ("StoreUnavailablePeriodEntity"."ends_at" > $3) AND ("StoreUnavailablePeriodEntity"."is_deleted" = $4)');
        expect(sql).toBe(UNAVAILABLE_SQL);
    });

    it('그룹 상품 — 그룹 IN · 상품 종류(삭제 표시 없는 테이블)', async () => {
        await repository.findGroupPlans({room_group_id: In(['g1', 'g2']), room_plan_type_id: 'HOURLY'});
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(parameters).toEqual(['g1', 'g2', 'HOURLY']);
        expect(sql).toContain('WHERE (("RoomGroupPlanEntity"."room_group_id" IN ($1, $2)) AND ("RoomGroupPlanEntity"."room_plan_type_id" = $3))');
        expect(sql).toBe(GROUP_PLANS_SQL);
    });

    it('기간 가격 — 그룹 상품 IN · 지워지지 않은 것', async () => {
        await repository.findGroupPlanPrices({room_group_plan_id: In(['gp1', 'gp2'])});
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(parameters).toEqual(['gp1', 'gp2', 0]);
        expect(sql).toContain('WHERE (("RoomGroupPlanPriceEntity"."room_group_plan_id" IN ($1, $2)) AND ("RoomGroupPlanPriceEntity"."is_deleted" = $3))');
        expect(sql).toBe(GROUP_PLAN_PRICES_SQL);
    });

    it.each([
        ['영업시간', 'findStoreHours', 'StoreHourEntity', STORE_HOURS_SQL],
        ['브레이크타임', 'findStoreBreaks', 'StoreBreakEntity', STORE_BREAKS_SQL],
    ] as const)('%s — 업체 · 지워지지 않은 것', async (_label, method, alias, expectedSql) => {
        await repository[method]('s1');
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(parameters).toEqual(['s1', 0]);
        expect(sql).toContain(`WHERE (("${alias}"."store_id" = $1) AND ("${alias}"."is_deleted" = $2))`);
        expect(sql).toBe(expectedSql);
    });

    it('내 예약 수 — 이용자 · 결제 대기 만료 제외(Not)', async () => {
        await repository.countReservations({user_id: 'u1', reservation_state_id: Not(RESERVATION_STATE.EXPIRED)});
        const [sql, parameters] = buildFindQuery(dataSource, count.mock.calls[0]);

        expect(count).toHaveBeenCalledTimes(1);
        expect(parameters).toEqual(['u1', 'EXPIRED']);
        expect(sql).toContain('WHERE (("ReservationEntity"."user_id" = $1) AND ("ReservationEntity"."reservation_state_id" != $2))');
        expect(sql).toBe(COUNT_RESERVATIONS_SQL);
    });
});
