import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, ILike, Not} from 'typeorm';
import type {EntityTarget, FindManyOptions, ObjectLiteral} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {UserRepository} from '../repositories/user.repository.js';

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
 * repository 가 manager.update 에 넘긴 조건 · 값을 SQL 로 빌드한다 — Repository.update 와 같은 방식(실행만 뺀다).
 *
 * @param dataSource 메타데이터만 만든 DataSource
 * @param call 가로챈 호출 인자(대상 엔티티, 조건, 바꿀 값)
 * @returns 공백을 하나로 줄인 SQL 과 파라미터
 */
function buildUpdateQuery(dataSource: DataSource, call: unknown[]): [string, unknown[]] {
    const [target, criteria, partial] = call as [EntityTarget<ObjectLiteral>, ObjectLiteral, ObjectLiteral];
    const [sql, parameters] = dataSource.manager.createQueryBuilder().update(target).set(partial).where(criteria).getQueryAndParameters();
    return [sql.replace(/\s+/g, ' '), parameters];
}

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티)마다 가짜 repository.
 *
 * @returns 저장소와 가짜 repository 들
 */
function makeRepository() {
    const fake = () => ({findOne: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0), update: vi.fn().mockResolvedValue({affected: 1})});
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
    const repository = new UserRepository(txHost);
    return {repository, of: (entity: unknown) => txHost.tx.getRepository(entity as never) as unknown as ReturnType<typeof fake>};
}

describe('UserRepository(admin-service) — 조건 · 오류 변환', () => {
    it('[SUCCESS] findUser 는 받은 조건 그대로 loadRelationIds, countUsers · countUserReservations 는 조건 그대로', async () => {
        const {repository, of} = makeRepository();

        await repository.findUser({user_id: 'c1', login_scope: 'USER'});
        await repository.countUsers([{login_scope: 'USER'}]);
        await repository.countUserReservations({user_id: 'c1', reservation_state_id: Not('EXPIRED')});

        expect(of(UserEntity).findOne).toHaveBeenCalledWith({where: {user_id: 'c1', login_scope: 'USER'}, loadRelationIds: true});
        expect(of(UserEntity).count).toHaveBeenCalledWith({where: [{login_scope: 'USER'}]});
        expect(of(ReservationEntity).count).toHaveBeenCalledWith({where: {user_id: 'c1', reservation_state_id: Not('EXPIRED')}});
    });

    it('[SUCCESS] updateUser 는 상태 조건 쓰기 — 1행이면 true, 0행이면 false', async () => {
        const {repository, of} = makeRepository();
        of(UserEntity).update.mockResolvedValueOnce({affected: 1}).mockResolvedValueOnce({affected: 0});
        const entity = new UserEntity();
        entity.state_id = 'BLOCK';
        const where = {user_id: 'c1', login_scope: 'USER', state_id: 'ACTIVE'};

        await expect(repository.updateUser(where, entity)).resolves.toBe(true);
        await expect(repository.updateUser(where, entity)).resolves.toBe(false);
        expect(of(UserEntity).update).toHaveBeenCalledWith(where, entity);
    });

    it('[FAIL:repository] 단건 · 개수 · 상태 쓰기 실패는 통일 500', async () => {
        const {repository, of} = makeRepository();
        of(UserEntity).findOne.mockRejectedValueOnce(new Error('db'));
        of(UserEntity).count.mockRejectedValueOnce(new Error('db'));
        of(UserEntity).update.mockRejectedValueOnce(new Error('db'));
        of(ReservationEntity).count.mockRejectedValueOnce(new Error('db'));

        await expect(repository.findUser({user_id: 'c1'})).rejects.toBeInstanceOf(InternalServerErrorException);
        await expect(repository.countUsers([{login_scope: 'USER'}])).rejects.toBeInstanceOf(InternalServerErrorException);
        await expect(repository.updateUser({user_id: 'c1'}, new UserEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
        await expect(repository.countUserReservations({user_id: 'c1'})).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findUserList', 'buildUserListQuery', [[{login_scope: 'USER'}], 20, 0], 'getMany'],
        ['findReservationCounts', 'buildReservationCountsQuery', ['c1'], 'getRawMany'],
        ['findUserReservationRows', 'buildUserReservationsQuery', ['c1', 20, 0], 'getRawMany'],
    ] as const)('[FAIL:repository] %s 는 %s 를 실행하고, 실패는 통일 500', async (method, builder, args, run) => {
        const {repository} = makeRepository();
        const failing = {[run]: vi.fn().mockRejectedValue(new Error('db')), orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), offset: vi.fn().mockReturnThis()};
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue(failing);

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe('[SMOKE:data-access] 이용자 목록 · 예약 건수 · 예약 이력 · 상태 쓰기 — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: UserRepository;

    /** 빌드된 SQL(빌드 때 실행 출력으로 고정) */
    const USER_LIST_SQL =
        'SELECT "u"."user_id" AS "u_user_id", "u"."user_search_code" AS "u_user_search_code", "u"."sns_user_id" AS "u_sns_user_id", "u"."login_id" AS "u_login_id", "u"."login_scope" AS "u_login_scope", "u"."login_pw" AS "u_login_pw", "u"."name" AS "u_name", "u"."gender" AS "u_gender", "u"."birth" AS "u_birth", "u"."phone" AS "u_phone", "u"."phone_verified_at" AS "u_phone_verified_at", "u"."nickname" AS "u_nickname", "u"."device_os" AS "u_device_os", "u"."device_token" AS "u_device_token", "u"."is_password_change_required" AS "u_is_password_change_required", "u"."block_comment" AS "u_block_comment", "u"."leave_comment" AS "u_leave_comment", "u"."leave_reserved_at" AS "u_leave_reserved_at", "u"."leave_previous_state_id" AS "u_leave_previous_state_id", "u"."leave_backup" AS "u_leave_backup", "u"."created_at" AS "u_created_at", "u"."updated_at" AS "u_updated_at", "u"."auth_id" AS "u_auth_id", "u"."state_id" AS "u_state_id", "u"."sns_id" AS "u_sns_id", "u"."store_id" AS "u_store_id" FROM "t_user" "u" WHERE (((("u"."login_scope" = $1) AND ("u"."state_id" = $2) AND ("u"."sns_id" = $3) AND ("u"."name" ILIKE $4))) OR ((("u"."login_scope" = $5) AND ("u"."state_id" = $6) AND ("u"."sns_id" = $7) AND ("u"."nickname" ILIKE $8))) OR ((("u"."login_scope" = $9) AND ("u"."state_id" = $10) AND ("u"."sns_id" = $11) AND ("u"."phone" ILIKE $12))) OR ((("u"."login_scope" = $13) AND ("u"."state_id" = $14) AND ("u"."sns_id" = $15) AND ("u"."user_search_code" ILIKE $16)))) ORDER BY "u"."created_at" DESC LIMIT 20 OFFSET 40';
    const RESERVATION_COUNTS_SQL =
        'SELECT "r"."reservation_state_id" AS "reservation_state_id", COUNT(*) AS "count" FROM "t_reservation" "r" WHERE "r"."user_id" = $1 GROUP BY "r"."reservation_state_id"';
    const USER_RESERVATIONS_SQL =
        'SELECT "r"."reservation_id" AS "reservation_id", "r"."store_id" AS "store_id", "r"."room_plan_type_id" AS "room_plan_type_id", "r"."reservation_state_id" AS "reservation_state_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at", "r"."total_price" AS "total_price", "r"."canceled_at" AS "canceled_at", "r"."cancel_actor" AS "cancel_actor", "r"."created_at" AS "created_at", "s"."store_name" AS "store_name", "rm"."room_name" AS "room_name", "g"."room_group_name" AS "room_group_name", "pt"."room_plan_type_name" AS "room_plan_type_name", "st"."reservation_state_name" AS "reservation_state_name" FROM "t_reservation" "r" INNER JOIN "t_store" "s" ON "s"."store_id" = "r"."store_id" INNER JOIN "t_room" "rm" ON "rm"."room_id" = "r"."room_id" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "rm"."room_group_id" INNER JOIN "t_room_plan_type" "pt" ON "pt"."room_plan_type_id" = "r"."room_plan_type_id" INNER JOIN "t_reservation_state" "st" ON "st"."reservation_state_id" = "r"."reservation_state_id" WHERE "r"."user_id" = $1 AND "r"."reservation_state_id" <> $2';
    const COUNT_USER_RESERVATIONS_SQL =
        'SELECT "ReservationEntity"."reservation_id" AS "ReservationEntity_reservation_id", "ReservationEntity"."start_at" AS "ReservationEntity_start_at", "ReservationEntity"."end_at" AS "ReservationEntity_end_at", "ReservationEntity"."maintenance_minutes" AS "ReservationEntity_maintenance_minutes", "ReservationEntity"."blocked_until" AS "ReservationEntity_blocked_until", "ReservationEntity"."total_price" AS "ReservationEntity_total_price", "ReservationEntity"."refund_deadline_at" AS "ReservationEntity_refund_deadline_at", "ReservationEntity"."late_refund_percent" AS "ReservationEntity_late_refund_percent", "ReservationEntity"."qr_link_sent_at" AS "ReservationEntity_qr_link_sent_at", "ReservationEntity"."canceled_at" AS "ReservationEntity_canceled_at", "ReservationEntity"."cancel_actor" AS "ReservationEntity_cancel_actor", "ReservationEntity"."cancel_reason" AS "ReservationEntity_cancel_reason", "ReservationEntity"."created_at" AS "ReservationEntity_created_at", "ReservationEntity"."updated_at" AS "ReservationEntity_updated_at", "ReservationEntity"."user_id" AS "ReservationEntity_user_id", "ReservationEntity"."store_id" AS "ReservationEntity_store_id", "ReservationEntity"."room_id" AS "ReservationEntity_room_id", "ReservationEntity"."room_plan_type_id" AS "ReservationEntity_room_plan_type_id", "ReservationEntity"."reservation_state_id" AS "ReservationEntity_reservation_state_id" FROM "t_reservation" "ReservationEntity" WHERE (("ReservationEntity"."user_id" = $1) AND ("ReservationEntity"."reservation_state_id" != $2))';

    beforeAll(async () => {
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new UserRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('이용자 목록 — 검색 OR 4(이름 · 닉네임 · 휴대폰 · 회원 식별 코드) × 그룹 · 상태 · SNS, 가입 최신순 · 페이지', () => {
        const base = {login_scope: 'USER', state_id: 'BLOCK', sns_id: 'NAVER'};
        const where = [
            {...base, name: ILike('%a\\_b%')},
            {...base, nickname: ILike('%a\\_b%')},
            {...base, phone: ILike('%a\\_b%')},
            {...base, user_search_code: ILike('%a\\_b%')},
        ];

        const [sql, parameters] = repository.buildUserListQuery(where, 20, 40).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expect.arrayContaining(['USER', 'BLOCK', 'NAVER', '%a\\_b%']));
        expect(flat).toContain('ORDER BY "u"."created_at" DESC');
        expect(flat).toContain('LIMIT 20 OFFSET 40');
        expect(flat).toBe(USER_LIST_SQL);
    });

    it('예약 상태별 건수 — 이용자 · GROUP BY 상태, 별칭 = UserReservationCountRow 키', () => {
        const [sql, parameters] = repository.buildReservationCountsQuery('c1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['c1']);
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1])).toEqual(['reservation_state_id', 'count']);
        expect(flat).toBe(RESERVATION_COUNTS_SQL);
    });

    it('예약 이력 — 업체 · 호실 · 그룹 · 상품 종류 · 상태 조인, 결제 대기 만료 제외, 별칭 = UserReservationRow 키', () => {
        const [sql, parameters] = repository.buildUserReservationsQuery('c1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['c1', 'EXPIRED']);
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]).sort()).toEqual([
            'cancel_actor',
            'canceled_at',
            'created_at',
            'end_at',
            'reservation_id',
            'reservation_state_id',
            'reservation_state_name',
            'room_group_name',
            'room_name',
            'room_plan_type_id',
            'room_plan_type_name',
            'start_at',
            'store_id',
            'store_name',
            'total_price',
        ]);
        expect(flat).toBe(USER_RESERVATIONS_SQL);
    });

    it('예약 이력 수 — count 에 넘긴 조건(관계 컬럼 이용자 · 상태 Not)', async () => {
        const count = vi.spyOn(dataSource.manager, 'count').mockResolvedValue(0);

        await repository.countUserReservations({user_id: 'c1', reservation_state_id: Not('EXPIRED')});
        const [sql, parameters] = buildFindQuery(dataSource, count.mock.calls[0]);
        count.mockRestore();

        expect(parameters).toEqual(['c1', 'EXPIRED']);
        expect(sql).toContain('WHERE (("ReservationEntity"."user_id" = $1) AND ("ReservationEntity"."reservation_state_id" != $2))');
        expect(sql).toBe(COUNT_USER_RESERVATIONS_SQL);
    });

    it('이용 제한 · 해제 — update 에 넘긴 조건(회원 · 그룹 · 관계 컬럼 지금 상태) 그대로, 상태 · 사유를 쓴다', async () => {
        const update = vi.spyOn(dataSource.manager, 'update').mockResolvedValue({affected: 1, raw: [], generatedMaps: []});
        const entity = new UserEntity();
        entity.state_id = 'BLOCK';
        entity.block_comment = '부정 이용';

        await repository.updateUser({user_id: 'c1', login_scope: 'USER', state_id: 'ACTIVE'}, entity);
        const [sql, parameters] = buildUpdateQuery(dataSource, update.mock.calls[0]);
        update.mockRestore();

        expect(parameters).toEqual(['BLOCK', '부정 이용', 'c1', 'USER', 'ACTIVE']);
        expect(sql).toBe('UPDATE "t_user" SET "state_id" = $1, "block_comment" = $2 WHERE ("user_id" = $3 AND "login_scope" = $4 AND "state_id" = $5)');
    });
});
