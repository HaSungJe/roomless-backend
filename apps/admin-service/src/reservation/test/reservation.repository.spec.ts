import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, QueryFailedError} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {ReservationCancelRequestEntity} from '@app/database/entities/reservation/reservation-cancel-request.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {StoreReservationRow, StoreRoomRow} from '../interfaces/reservation.repository.interface.js';
import {ReservationRepository} from '../repositories/reservation.repository.js';

/** StoreRoomRow 키 — raw select 별칭과 비교 */
const STORE_ROOM_ROW_KEYS: (keyof StoreRoomRow)[] = ['room_id', 'room_name', 'floor', 'room_group_id', 'room_group_name', 'room_state_id', 'room_state_name'];

/** StoreReservationRow 키 */
const STORE_RESERVATION_ROW_KEYS: (keyof StoreReservationRow)[] = [
    'reservation_id',
    'room_id',
    'reservation_state_id',
    'reservation_state_name',
    'room_plan_type_id',
    'room_plan_type_name',
    'start_at',
    'end_at',
    'blocked_until',
    'total_price',
    'user_name',
    'user_phone',
    'cancel_request_state_id',
    'cancel_request_expires_at',
    'cancel_request_created_at',
];

/**
 * PostgreSQL 제약 위반 오류
 *
 * @param code 23P01(배타 제약) 등
 * @param constraint 제약명
 * @returns QueryFailedError
 */
function constraintError(code: string, constraint: string): QueryFailedError {
    return new QueryFailedError('UPDATE ...', [], Object.assign(new Error('violates constraint'), {code, constraint}));
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
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티)마다 가짜 repository.
 *
 * @returns 저장소와 가짜 repository 들
 */
function makeRepository() {
    const fake = () => ({findOne: vi.fn().mockResolvedValue(null), find: vi.fn().mockResolvedValue([]), insert: vi.fn(), update: vi.fn().mockResolvedValue({affected: 1})});
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

describe('ReservationRepository (매니저 예약) — 조건 · 오류 변환', () => {
    it('[SUCCESS] 업체 · 예약자 조회 — 업체는 is_deleted = 0 을 더하고, 회원은 받은 조건 그대로 loadRelationIds', async () => {
        const {repository, of} = makeRepository();

        await repository.findReservationStore({store_id: 's1'});
        await repository.findReservationUser({user_id: 'u1'});

        expect(of(StoreEntity).findOne).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, loadRelationIds: true});
        expect(of(UserEntity).findOne).toHaveBeenCalledWith({where: {user_id: 'u1'}, loadRelationIds: true});
    });

    it('[FAIL:duplicate] changeReservationRoom 은 옮길 호실 겹침(EXC_Reservation_RoomIdBlockedRange)을 400 으로, 그 밖은 통일 500', async () => {
        const {repository, of} = makeRepository();
        of(ReservationEntity).update.mockRejectedValueOnce(constraintError('23P01', 'EXC_Reservation_RoomIdBlockedRange'));
        of(ReservationEntity).update.mockRejectedValueOnce(new Error('db'));

        const taken = await repository.changeReservationRoom({reservation_id: 'r1'}, new ReservationEntity()).catch((e: unknown) => e);
        const failed = await repository.changeReservationRoom({reservation_id: 'r1'}, new ReservationEntity()).catch((e: unknown) => e);

        expect(taken).toBeInstanceOf(BadRequestException);
        expect((taken as BadRequestException).getResponse()).toEqual({message: '옮길 호실에 겹치는 예약이 있습니다.'});
        expect(failed).toBeInstanceOf(InternalServerErrorException);
    });

    it('[SUCCESS] updateReservation 은 1행이면 true, 0행이면 false(상태 조건)', async () => {
        const {repository, of} = makeRepository();
        of(ReservationEntity).update.mockResolvedValueOnce({affected: 1}).mockResolvedValueOnce({affected: 0});

        await expect(repository.updateReservation({reservation_id: 'r1', reservation_state_id: 'CONFIRMED'}, new ReservationEntity())).resolves.toBe(true);
        await expect(repository.updateReservation({reservation_id: 'r1', reservation_state_id: 'CONFIRMED'}, new ReservationEntity())).resolves.toBe(false);
    });

    it('[SUCCESS] expireCancelRequests 는 받은 조건(예약 · 요청 중) · 엔티티 그대로(지우지 않는 표 — @BeforeUpdate)', async () => {
        const {repository, of} = makeRepository();
        const expired = new ReservationCancelRequestEntity();
        expired.reservation_cancel_request_state_id = 'EXPIRED';

        await repository.expireCancelRequests({reservation_id: 'v1', reservation_cancel_request_state_id: 'REQUESTED'}, expired);

        expect(of(ReservationCancelRequestEntity).update).toHaveBeenCalledTimes(1);
        expect(of(ReservationCancelRequestEntity).update).toHaveBeenCalledWith({reservation_id: 'v1', reservation_cancel_request_state_id: 'REQUESTED'}, expired);
    });

    it('[SUCCESS] insertCancelRequest 는 받은 엔티티 그대로 insert(@BeforeInsert)', async () => {
        const {repository, of} = makeRepository();
        const request = new ReservationCancelRequestEntity();
        request.reservation_cancel_request_id = 'c1';

        await repository.insertCancelRequest(request);

        expect(of(ReservationCancelRequestEntity).insert).toHaveBeenCalledWith(request);
    });

    it('[FAIL:duplicate] insertCancelRequest 는 진행 중 요청 겹침(UK_ReservationCancelRequest_ReservationIdRequested)을 400 으로, 다른 제약 · 그 밖은 통일 500', async () => {
        const {repository, of} = makeRepository();
        of(ReservationCancelRequestEntity).insert.mockRejectedValueOnce(constraintError('23505', 'UK_ReservationCancelRequest_ReservationIdRequested'));
        of(ReservationCancelRequestEntity).insert.mockRejectedValueOnce(constraintError('23505', 'PK_ReservationCancelRequest'));
        of(ReservationCancelRequestEntity).insert.mockRejectedValueOnce(new Error('db'));

        const duplicate = await repository.insertCancelRequest(new ReservationCancelRequestEntity()).catch((e: unknown) => e);
        const otherConstraint = await repository.insertCancelRequest(new ReservationCancelRequestEntity()).catch((e: unknown) => e);
        const failed = await repository.insertCancelRequest(new ReservationCancelRequestEntity()).catch((e: unknown) => e);

        expect(duplicate).toBeInstanceOf(BadRequestException);
        expect((duplicate as BadRequestException).getResponse()).toEqual({message: '이미 진행 중인 취소 요청이 있습니다.'});
        expect(otherConstraint).toBeInstanceOf(InternalServerErrorException);
        expect(failed).toBeInstanceOf(InternalServerErrorException);
        expect((failed as InternalServerErrorException).getResponse()).toEqual({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
    });

    it('[FAIL:repository] 취소 요청 만료 쓰기 실패는 통일 500', async () => {
        const {repository, of} = makeRepository();
        of(ReservationCancelRequestEntity).update.mockRejectedValueOnce(new Error('db'));

        await expect(repository.expireCancelRequests({reservation_id: 'v1'}, new ReservationCancelRequestEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findManagerStore', 'buildManagerStoreQuery', ['u1', false]],
        ['findStoreRoomRows', 'buildStoreRoomsQuery', ['s1']],
        ['findStoreReservationRows', 'buildStoreReservationsQuery', ['s1', new Date('2026-11-09T15:00:00Z'), new Date('2026-11-10T15:00:00Z')]],
    ] as const)('%s 는 같은 인자로 %s 를 실행하고, 실패는 통일 500', async (method, builder, args) => {
        const {repository} = makeRepository();
        const failing = {getOne: vi.fn().mockRejectedValue(new Error('db')), getRawMany: vi.fn().mockRejectedValue(new Error('db'))};
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue(failing);

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(...args);
    });
});

describe('[SMOKE:data-access] 매니저의 소속 업체 · 업체 현황(호실 · 예약) — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: ReservationRepository;

    /** 매니저의 소속 업체(잠금 절 제외) — 형제 room buildManagerStoreQuery 와 같은 문자열이어야 한다 */
    const MANAGER_STORE_SQL =
        'SELECT "s"."store_id" AS "s_store_id", "s"."store_code" AS "s_store_code", "s"."store_name" AS "s_store_name", "s"."business_number" AS "s_business_number", "s"."owner_name" AS "s_owner_name", "s"."phone" AS "s_phone", "s"."address" AS "s_address", "s"."address_detail" AS "s_address_detail", "s"."latitude" AS "s_latitude", "s"."longitude" AS "s_longitude", "s"."introduction" AS "s_introduction", "s"."is_always_open" AS "s_is_always_open", "s"."is_open" AS "s_is_open", "s"."maintenance_minutes" AS "s_maintenance_minutes", "s"."booking_open_hours" AS "s_booking_open_hours", "s"."refund_deadline_minutes" AS "s_refund_deadline_minutes", "s"."late_refund_percent" AS "s_late_refund_percent", "s"."door_secret" AS "s_door_secret", "s"."suspend_comment" AS "s_suspend_comment", "s"."is_deleted" AS "s_is_deleted", "s"."delete_backup" AS "s_delete_backup", "s"."created_at" AS "s_created_at", "s"."updated_at" AS "s_updated_at", "s"."store_state_id" AS "s_store_state_id" FROM "t_store" "s" INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id" WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3 AND "s"."is_deleted" = 0';
    /** 업체 현황 호실 */
    const STORE_ROOMS_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_group_id" AS "room_group_id", "r"."room_state_id" AS "room_state_id", "g"."room_group_name" AS "room_group_name", "rs"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "rs" ON "rs"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 ORDER BY "r"."floor" ASC, "r"."room_name" ASC';
    /** 업체 현황 예약 */
    const STORE_RESERVATIONS_SQL =
        'SELECT "r"."reservation_id" AS "reservation_id", "r"."room_id" AS "room_id", "r"."reservation_state_id" AS "reservation_state_id", "r"."room_plan_type_id" AS "room_plan_type_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at", "r"."blocked_until" AS "blocked_until", "r"."total_price" AS "total_price", "st"."reservation_state_name" AS "reservation_state_name", "pt"."room_plan_type_name" AS "room_plan_type_name", "u"."name" AS "user_name", "u"."phone" AS "user_phone", (SELECT "c1"."reservation_cancel_request_state_id" AS "c1_reservation_cancel_request_state_id" FROM "t_reservation_cancel_request" "c1" WHERE "c1"."reservation_id" = "r"."reservation_id" ORDER BY "c1"."created_at" DESC LIMIT 1) AS "cancel_request_state_id", (SELECT "c2"."expires_at" AS "c2_expires_at" FROM "t_reservation_cancel_request" "c2" WHERE "c2"."reservation_id" = "r"."reservation_id" ORDER BY "c2"."created_at" DESC LIMIT 1) AS "cancel_request_expires_at", (SELECT "c3"."created_at" AS "c3_created_at" FROM "t_reservation_cancel_request" "c3" WHERE "c3"."reservation_id" = "r"."reservation_id" ORDER BY "c3_created_at" DESC LIMIT 1) AS "cancel_request_created_at" FROM "t_reservation" "r" INNER JOIN "t_reservation_state" "st" ON "st"."reservation_state_id" = "r"."reservation_state_id" INNER JOIN "t_room_plan_type" "pt" ON "pt"."room_plan_type_id" = "r"."room_plan_type_id" INNER JOIN "t_user" "u" ON "u"."user_id" = "r"."user_id" WHERE "r"."store_id" = $1 AND "r"."reservation_state_id" IN ($2, $3, $4, $5) AND "r"."start_at" < $6 AND "r"."end_at" > $7 ORDER BY "r"."start_at" ASC';

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it.each([
        [false, ''],
        [true, ' FOR UPDATE OF s'],
    ])('매니저의 소속 업체 (잠금 %s) — t_user 매니저 그룹 조인 · 탈퇴 · 지운 업체 제외, 잠금이면 업체 행만', (lock, lockClause) => {
        const [sql, parameters] = repository.buildManagerStoreQuery('u1', lock).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['u1', 'MANAGER', 'LEAVE']);
        expect(flat).toContain('FROM "t_store" "s" INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id"');
        expect(flat).toContain('"u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3 AND "s"."is_deleted" = 0');
        expect(flat.endsWith(' FOR UPDATE OF s')).toBe(lock);
        expect(flat).toBe(`${MANAGER_STORE_SQL}${lockClause}`);
    });

    it('업체 현황 호실 — 지워지지 않은 호실 · 그룹 + 상태명, 별칭 = StoreRoomRow 키', () => {
        const [sql, parameters] = repository.buildStoreRoomsQuery('s1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('INNER JOIN "t_room_state" "rs"');
        expect([...selectAliases(flat)].sort()).toEqual([...STORE_ROOM_ROW_KEYS].sort());
        expect(flat).toBe(STORE_ROOMS_SQL);
    });

    it('업체 현황 예약 — 보이는 상태 IN · [from, to) 겹침 · 이용자 조인 · 마지막 취소 요청 상관 서브쿼리 3개(등록 최근 1건), 별칭 = StoreReservationRow 키', () => {
        const from = new Date('2026-11-09T15:00:00Z');
        const to = new Date('2026-11-10T15:00:00Z');
        const [sql, parameters] = repository.buildStoreReservationsQuery('s1', from, to).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', to, from]);
        expect(flat).toContain('INNER JOIN "t_user" "u"');
        expect(flat).toContain(
            '(SELECT "c1"."reservation_cancel_request_state_id" AS "c1_reservation_cancel_request_state_id" FROM "t_reservation_cancel_request" "c1" WHERE "c1"."reservation_id" = "r"."reservation_id" ORDER BY "c1"."created_at" DESC LIMIT 1) AS "cancel_request_state_id"',
        );
        expect(flat).toContain('ORDER BY "c2"."created_at" DESC LIMIT 1) AS "cancel_request_expires_at"');
        // 고르는 컬럼이 정렬 컬럼과 같으면 TypeORM 이 정렬을 그 출력 별칭으로 쓴다(PostgreSQL 은 ORDER BY 에 출력 별칭을 받는다)
        expect(flat).toContain(
            '(SELECT "c3"."created_at" AS "c3_created_at" FROM "t_reservation_cancel_request" "c3" WHERE "c3"."reservation_id" = "r"."reservation_id" ORDER BY "c3_created_at" DESC LIMIT 1) AS "cancel_request_created_at"',
        );
        expect([...selectAliases(flat)].sort()).toEqual([...STORE_RESERVATION_ROW_KEYS].sort());
        expect(flat).toBe(STORE_RESERVATIONS_SQL);
    });
});
