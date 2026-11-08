import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, In, IsNull} from 'typeorm';
import type {EntityTarget, ObjectLiteral} from 'typeorm';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {ENTITIES} from '@app/database/entities.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {ReservationRepository} from '../repositories/reservation.repository.js';
import {buildConfirmTransition, buildExpireTransition, buildQrLinkSent, buildRoomQr, buildUsageEndTransition, buildUsageStartTransition} from '../reservation.util.js';

const ROW = {reservation_id: 'r1', payment_id: 'p1', amount: 30000};

/** 이용 전환 대상 — 2026-11-10 13:00 ~ 16:00(한국 시각) */
const USAGE_ROW = {reservation_id: 'r1', room_id: 'm1', start_at: new Date('2026-11-10T04:00:00Z'), end_at: new Date('2026-11-10T07:00:00Z')};

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
 * txHost(withTransaction 은 콜백을 바로 실행) · tx.getRepository 를 흉내 낸다.
 *
 * @returns 저장소와 가짜 repository 들
 */
function makeRepository() {
    const payments = {update: vi.fn().mockResolvedValue({affected: 1}), find: vi.fn().mockResolvedValue([])};
    const details = {update: vi.fn().mockResolvedValue({affected: 1})};
    const reservations = {update: vi.fn().mockResolvedValue({affected: 1})};
    const roomQrs = {findOne: vi.fn().mockResolvedValue(null)};
    const rooms = {update: vi.fn().mockResolvedValue({affected: 1})};
    const repositories = new Map<unknown, unknown>([
        [PaymentEntity, payments],
        [ReservationDetailEntity, details],
        [RoomQrEntity, roomQrs],
        [RoomEntity, rooms],
        [ReservationEntity, reservations],
    ]);
    const txHost = {
        withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
        tx: {getRepository: (entity: unknown) => repositories.get(entity)},
    } as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new ReservationRepository(txHost), txHost, payments, details, reservations, roomQrs, rooms};
}

describe('ReservationRepository(scheduler) — 결제 대기 전환 · 상태 조건', () => {
    it('[SUCCESS] transitionPending — 결제(READY) → 구간(PENDING) → 예약(PENDING) 을 한 트랜잭션으로', async () => {
        const {repository, payments, details, reservations} = makeRepository();
        const transition = buildConfirmTransition(
            {payment_key: 'k', order_id: 'p1', status: 'DONE', total_amount: 30000, method: '카드', approved_at: new Date('2026-11-03T00:01:00Z'), receipt_url: null},
            new Date(),
        );

        await expect(repository.transitionPending(ROW, transition)).resolves.toBe(true);

        expect(payments.update).toHaveBeenCalledWith({payment_id: 'p1', payment_state_id: 'READY'}, transition.payment);
        expect(details.update).toHaveBeenCalledWith({payment_id: 'p1', reservation_state_id: 'PENDING'}, transition.detail);
        expect(reservations.update).toHaveBeenCalledWith({reservation_id: 'r1', reservation_state_id: 'PENDING'}, transition.reservation);
        expect(transition.payment).toMatchObject({payment_state_id: 'DONE', payment_key: 'k'});
        expect((transition.reservation as ReservationEntity).reservation_state_id).toBe('CONFIRMED');
    });

    it('[SKIP] 결제가 이미 바뀌었으면(결제 확인 · 취소가 먼저) 구간 · 예약은 건드리지 않고 false', async () => {
        const {repository, payments, details} = makeRepository();
        payments.update.mockResolvedValueOnce({affected: 0});

        await expect(repository.transitionPending(ROW, buildExpireTransition())).resolves.toBe(false);
        expect(details.update).not.toHaveBeenCalled();
    });

    it('[FAIL:repository] 예약이 어긋나면(0행) 롤백 — 통일 500', async () => {
        const {repository, reservations} = makeRepository();
        reservations.update.mockResolvedValueOnce({affected: 0});

        await expect(repository.transitionPending(ROW, buildExpireTransition())).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('[SUCCESS] updatePayment 는 상태 조건(from_state)을 건다 — 1행이면 true', async () => {
        const {repository, payments} = makeRepository();
        const entity = new PaymentEntity();

        await expect(repository.updatePayment('p1', 'REFUND_REQUESTED', entity)).resolves.toBe(true);
        expect(payments.update).toHaveBeenCalledWith({payment_id: 'p1', payment_state_id: 'REFUND_REQUESTED'}, entity);
    });

    it('[SUCCESS] findRoomQr 는 받은 조건 그대로 loadRelationIds 로 조회한다', async () => {
        const {repository, roomQrs} = makeRepository();

        await repository.findRoomQr({reservation_id: 'r1'});

        expect(roomQrs.findOne).toHaveBeenCalledWith({where: {reservation_id: 'r1'}, loadRelationIds: true});
    });

    it('[FAIL:repository] QR 맞추기 대상 · QR 조회 · QR 발급 실패는 통일 500', async () => {
        const {repository, roomQrs} = makeRepository();
        roomQrs.findOne.mockRejectedValueOnce(new Error('db'));
        vi.spyOn(repository, 'buildQrSyncTargetsQuery').mockReturnValue({getRawMany: vi.fn().mockRejectedValue(new Error('db'))} as never);
        vi.spyOn(repository, 'buildInsertRoomQrQuery').mockReturnValue({execute: vi.fn().mockRejectedValue(new Error('db'))} as never);

        await expect(repository.findQrSyncTargets(new Date('2026-11-10T05:00:00Z'))).rejects.toBeInstanceOf(InternalServerErrorException);
        await expect(repository.findRoomQr({reservation_id: 'r1'})).rejects.toBeInstanceOf(InternalServerErrorException);
        await expect(repository.insertRoomQr(new RoomQrEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });
});

describe('ReservationRepository(scheduler) — 이용 전환 · QR 링크 표시 · 상태 조건', () => {
    it('[SUCCESS] startUsage — 한 트랜잭션: 예약(확정 조건) → 이용 중 · 호실(예약가능 · 예약완료 · 정비중 · 지워지지 않음) → 사용중 · QR INSERT … ON CONFLICT', async () => {
        const {repository, txHost, reservations, rooms} = makeRepository();
        const transition = buildUsageStartTransition();
        const roomQr = buildRoomQr(USAGE_ROW);
        const execute = vi.fn();
        const insertSpy = vi.spyOn(repository, 'buildInsertRoomQrQuery').mockReturnValue({execute} as never);

        await expect(repository.startUsage(USAGE_ROW, transition, roomQr)).resolves.toBe(true);

        expect(txHost.withTransaction).toHaveBeenCalledTimes(1);
        expect(reservations.update).toHaveBeenCalledWith({reservation_id: 'r1', reservation_state_id: 'CONFIRMED'}, transition.reservation);
        expect((transition.reservation as ReservationEntity).reservation_state_id).toBe('CHECKED_IN');
        expect(rooms.update).toHaveBeenCalledWith({room_id: 'm1', room_state_id: In(['AVAILABLE', 'RESERVED', 'MAINTENANCE']), is_deleted: 0}, transition.room);
        expect((transition.room as RoomEntity).room_state_id).toBe('IN_USE');
        expect(insertSpy).toHaveBeenCalledWith(roomQr);
        expect(execute).toHaveBeenCalledTimes(1);
        expect(roomQr).toMatchObject({room_id: 'm1', reservation_id: 'r1', starts_at: USAGE_ROW.start_at, ends_at: USAGE_ROW.end_at});
    });

    it('[SKIP] startUsage — 예약이 이미 바뀌었으면(내 예약 QR · 결제 확인이 먼저) 호실 · QR 은 건드리지 않고 false', async () => {
        const {repository, reservations, rooms} = makeRepository();
        reservations.update.mockResolvedValueOnce({affected: 0});
        const insertSpy = vi.spyOn(repository, 'buildInsertRoomQrQuery');

        await expect(repository.startUsage(USAGE_ROW, buildUsageStartTransition(), buildRoomQr(USAGE_ROW))).resolves.toBe(false);
        expect(rooms.update).not.toHaveBeenCalled();
        expect(insertSpy).not.toHaveBeenCalled();
    });

    it('[SUCCESS] endUsage — 한 트랜잭션: 예약(확정 · 이용 중 조건) → 이용 완료 · 호실(사용중 · 지워지지 않음) → 정비중', async () => {
        const {repository, txHost, reservations, rooms} = makeRepository();
        const transition = buildUsageEndTransition();

        await expect(repository.endUsage(USAGE_ROW, transition)).resolves.toBe(true);

        expect(txHost.withTransaction).toHaveBeenCalledTimes(1);
        expect(reservations.update).toHaveBeenCalledWith({reservation_id: 'r1', reservation_state_id: In(['CONFIRMED', 'CHECKED_IN'])}, transition.reservation);
        expect((transition.reservation as ReservationEntity).reservation_state_id).toBe('COMPLETED');
        expect(rooms.update).toHaveBeenCalledWith({room_id: 'm1', room_state_id: 'IN_USE', is_deleted: 0}, transition.room);
        expect((transition.room as RoomEntity).room_state_id).toBe('MAINTENANCE');
    });

    it('[SKIP] endUsage — 예약이 이미 바뀌었으면(취소가 먼저) 호실은 건드리지 않고 false', async () => {
        const {repository, reservations, rooms} = makeRepository();
        reservations.update.mockResolvedValueOnce({affected: 0});

        await expect(repository.endUsage(USAGE_ROW, buildUsageEndTransition())).resolves.toBe(false);
        expect(rooms.update).not.toHaveBeenCalled();
    });

    it('[FAIL:repository] 이용 전환 중 쓰기가 실패하면 롤백 — 통일 500', async () => {
        const {repository, rooms} = makeRepository();
        rooms.update.mockRejectedValueOnce(new Error('db')).mockRejectedValueOnce(new Error('db'));

        await expect(repository.startUsage(USAGE_ROW, buildUsageStartTransition(), buildRoomQr(USAGE_ROW))).rejects.toBeInstanceOf(InternalServerErrorException);
        await expect(repository.endUsage(USAGE_ROW, buildUsageEndTransition())).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('[SUCCESS] claimQrLink — 보낸 시각이 비어 있을 때만(IsNull) 표시, 1행이면 true · 0행이면 false(겹쳐 돌아도 1번)', async () => {
        const {repository, reservations} = makeRepository();
        reservations.update.mockResolvedValueOnce({affected: 1}).mockResolvedValueOnce({affected: 0});
        const sent = buildQrLinkSent(new Date('2026-11-10T03:55:00Z'));

        await expect(repository.claimQrLink('r1', sent)).resolves.toBe(true);
        await expect(repository.claimQrLink('r1', sent)).resolves.toBe(false);
        expect(reservations.update).toHaveBeenCalledWith({reservation_id: 'r1', qr_link_sent_at: IsNull()}, sent);
        expect(sent.qr_link_sent_at).toEqual(new Date('2026-11-10T03:55:00Z'));
    });

    it('[SUCCESS] releaseQrLink — 이번 회차가 표시한 시각일 때만 NULL 로 되돌린다', async () => {
        const {repository, reservations} = makeRepository();
        const at = new Date('2026-11-10T03:55:00Z');
        const cleared = buildQrLinkSent(null);

        await repository.releaseQrLink('r1', at, cleared);

        expect(reservations.update).toHaveBeenCalledWith({reservation_id: 'r1', qr_link_sent_at: at}, cleared);
        expect(cleared.qr_link_sent_at).toBeNull();
    });

    it.each([
        ['findUsageStartRows', 'buildUsageStartRowsQuery', [new Date('2026-11-10T04:00:00Z')]],
        ['findUsageEndRows', 'buildUsageEndRowsQuery', [new Date('2026-11-10T07:00:00Z')]],
        ['findQrLinkRows', 'buildQrLinkRowsQuery', [new Date('2026-11-10T03:55:00Z'), new Date('2026-11-10T04:00:00Z')]],
    ] as const)('[FAIL:repository] %s 는 같은 인자로 %s 를 실행하고, 실패는 통일 500', async (method, builder, args) => {
        const {repository} = makeRepository();
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue({getRawMany: vi.fn().mockRejectedValue(new Error('db'))});

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledWith(...args);
    });

    it('[FAIL:repository] 링크 표시 · 되돌리기 실패는 통일 500', async () => {
        const {repository, reservations} = makeRepository();
        reservations.update.mockRejectedValueOnce(new Error('db')).mockRejectedValueOnce(new Error('db'));

        await expect(repository.claimQrLink('r1', buildQrLinkSent(new Date()))).rejects.toBeInstanceOf(InternalServerErrorException);
        await expect(repository.releaseQrLink('r1', new Date(), buildQrLinkSent(null))).rejects.toBeInstanceOf(InternalServerErrorException);
    });
});

describe('[SMOKE:data-access] 이용 전환 · QR 링크 SMS 대상 — DB 연결 없이 SQL 빌드(user-service judgeUsageTransition 과 같은 경계)', () => {
    let repository: ReservationRepository;

    beforeAll(async () => {
        const dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('이용 시작 대상 — 확정 · start_at ≤ 지금(시작 정각 포함) < end_at(끝 정각은 종료), 시작 순, 별칭 = UsageRow 키', () => {
        const now = new Date('2026-11-10T04:00:00Z');

        const [sql, parameters] = repository.buildUsageStartRowsQuery(now).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['CONFIRMED', now]);
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]).sort()).toEqual(['end_at', 'reservation_id', 'room_id', 'start_at']);
        expect(flat).toBe(
            'SELECT "r"."reservation_id" AS "reservation_id", "r"."room_id" AS "room_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at" FROM "t_reservation" "r" WHERE "r"."reservation_state_id" = $1 AND "r"."start_at" <= $2 AND "r"."end_at" > $2 ORDER BY "r"."start_at" ASC',
        );
    });

    it('이용 종료 대상 — 확정 · 이용 중 · end_at ≤ 지금(끝 정각 포함 — 시작을 놓친 확정도), 끝 순, 별칭 = UsageRow 키', () => {
        const now = new Date('2026-11-10T07:00:00Z');

        const [sql, parameters] = repository.buildUsageEndRowsQuery(now).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['CONFIRMED', 'CHECKED_IN', now]);
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]).sort()).toEqual(['end_at', 'reservation_id', 'room_id', 'start_at']);
        expect(flat).toBe(
            'SELECT "r"."reservation_id" AS "reservation_id", "r"."room_id" AS "room_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at" FROM "t_reservation" "r" WHERE "r"."reservation_state_id" IN ($1, $2) AND "r"."end_at" <= $3 ORDER BY "r"."end_at" ASC',
        );
    });

    it('QR 링크 SMS 대상 — 업체 · 회원 조인, 확정 · 이용 중 · start_at ≤ 지금 + 5분 · end_at > 지금 · 링크 안 보냄 · 번호 있음, 별칭 = QrLinkRow 키', () => {
        const now = new Date('2026-11-10T03:55:00Z');
        const until = new Date('2026-11-10T04:00:00Z');

        const [sql, parameters] = repository.buildQrLinkRowsQuery(now, until).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['CONFIRMED', 'CHECKED_IN', until, now]);
        expect(flat).toContain('INNER JOIN "t_store" "s" ON "s"."store_id" = "r"."store_id"');
        expect(flat).toContain('INNER JOIN "t_user" "u" ON "u"."user_id" = "r"."user_id"');
        expect(flat).toContain('"r"."qr_link_sent_at" IS NULL AND "u"."phone" IS NOT NULL');
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]).sort()).toEqual(['reservation_id', 'start_at', 'store_name', 'user_phone']);
        expect(flat).toBe(
            'SELECT "r"."reservation_id" AS "reservation_id", "r"."start_at" AS "start_at", "s"."store_name" AS "store_name", "u"."phone" AS "user_phone" FROM "t_reservation" "r" INNER JOIN "t_store" "s" ON "s"."store_id" = "r"."store_id" INNER JOIN "t_user" "u" ON "u"."user_id" = "r"."user_id" WHERE "r"."reservation_state_id" IN ($1, $2) AND "r"."start_at" <= $3 AND "r"."end_at" > $4 AND "r"."qr_link_sent_at" IS NULL AND "u"."phone" IS NOT NULL ORDER BY "r"."start_at" ASC',
        );
    });
});

describe('[SMOKE:data-access] 이용 전환 쓰기 조건(관계 컬럼 상태 IN · 지워지지 않은 호실) — DB 연결 없이 SQL 빌드, repository 가 넘긴 조건 그대로', () => {
    let dataSource: DataSource;
    let repository: ReservationRepository;

    beforeAll(async () => {
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        const txHost = {withTransaction: async (fn: () => Promise<unknown>) => fn(), tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
        repository = new ReservationRepository(txHost);
    });

    it('이용 시작 — 예약(확정 조건) → 이용 중, 호실(예약가능 · 예약완료 · 정비중 · 지워지지 않음) → 사용중', async () => {
        const update = vi.spyOn(dataSource.manager, 'update').mockResolvedValue({affected: 1, raw: [], generatedMaps: []});
        vi.spyOn(repository, 'buildInsertRoomQrQuery').mockReturnValue({execute: vi.fn()} as never);

        await repository.startUsage(USAGE_ROW, buildUsageStartTransition(), buildRoomQr(USAGE_ROW));
        const [reservationSql, reservationParameters] = buildUpdateQuery(dataSource, update.mock.calls[0]);
        const [roomSql, roomParameters] = buildUpdateQuery(dataSource, update.mock.calls[1]);
        update.mockRestore();

        expect(reservationParameters).toEqual(['CHECKED_IN', 'r1', 'CONFIRMED']);
        expect(reservationSql).toBe('UPDATE "t_reservation" SET "reservation_state_id" = $1 WHERE ("reservation_id" = $2 AND "reservation_state_id" = $3)');
        expect(roomParameters).toEqual(['IN_USE', 'm1', 'AVAILABLE', 'RESERVED', 'MAINTENANCE', 0]);
        expect(roomSql).toBe('UPDATE "t_room" SET "room_state_id" = $1 WHERE ("room_id" = $2 AND "room_state_id" IN ($3, $4, $5) AND "is_deleted" = $6)');
    });

    it('이용 종료 — 예약(확정 · 이용 중 조건 IN) → 이용 완료, 호실(사용중 · 지워지지 않음) → 정비중', async () => {
        const update = vi.spyOn(dataSource.manager, 'update').mockResolvedValue({affected: 1, raw: [], generatedMaps: []});

        await repository.endUsage(USAGE_ROW, buildUsageEndTransition());
        const [reservationSql, reservationParameters] = buildUpdateQuery(dataSource, update.mock.calls[0]);
        const [roomSql, roomParameters] = buildUpdateQuery(dataSource, update.mock.calls[1]);
        update.mockRestore();

        expect(reservationParameters).toEqual(['COMPLETED', 'r1', 'CONFIRMED', 'CHECKED_IN']);
        expect(reservationSql).toBe('UPDATE "t_reservation" SET "reservation_state_id" = $1 WHERE ("reservation_id" = $2 AND "reservation_state_id" IN ($3, $4))');
        expect(roomParameters).toEqual(['MAINTENANCE', 'm1', 'IN_USE', 0]);
        expect(roomSql).toBe('UPDATE "t_room" SET "room_state_id" = $1 WHERE ("room_id" = $2 AND "room_state_id" = $3 AND "is_deleted" = $4)');
    });

    it('QR 링크 보냄 표시 — 비어 있을 때만(IS NULL)', async () => {
        const update = vi.spyOn(dataSource.manager, 'update').mockResolvedValue({affected: 1, raw: [], generatedMaps: []});
        const sent_at = new Date('2026-11-10T03:55:00Z');

        await repository.claimQrLink('r1', buildQrLinkSent(sent_at));
        const [sql, parameters] = buildUpdateQuery(dataSource, update.mock.calls[0]);
        update.mockRestore();

        expect(parameters).toEqual([sent_at, 'r1']);
        expect(sql).toBe('UPDATE "t_reservation" SET "qr_link_sent_at" = $1 WHERE ("reservation_id" = $2 AND "qr_link_sent_at" IS NULL)');
    });
});

describe('[SMOKE:data-access] 결제 대기 만료 — DB 연결 없이 SQL 빌드', () => {
    it('기본 구간 PENDING · expires_at ≤ now · 결제 READY, 별칭 = ExpiredPendingRow 키', async () => {
        const dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        const repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
        const now = new Date('2026-11-03T00:05:00Z');

        const [sql, parameters] = repository.buildExpiredPendingQuery(now).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['BASE', 'PENDING', now, 'READY']);
        expect(flat).toContain('INNER JOIN "t_payment" "p"');
        expect(flat).toContain('"d"."expires_at" <= $3');
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]).sort()).toEqual(['amount', 'payment_id', 'reservation_id']);
    });
});

describe('[SMOKE:data-access] QR 맞추기 — DB 연결 없이 SQL 빌드', () => {
    let repository: ReservationRepository;

    /** 빌드된 SQL(빌드 때 실행 출력으로 고정) */
    const QR_SYNC_TARGETS_SQL =
        'SELECT "r"."reservation_id" AS "reservation_id", "r"."room_id" AS "room_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at", "q"."qr" AS "qr", "q"."ends_at" AS "qr_ends_at" FROM "t_reservation" "r" LEFT JOIN "t_room_qr" "q" ON "q"."reservation_id" = "r"."reservation_id" WHERE "r"."reservation_state_id" = $1 AND "r"."start_at" <= $2 AND "r"."end_at" > $2 ORDER BY "r"."start_at" ASC';
    const INSERT_ROOM_QR_SQL =
        'INSERT INTO "t_room_qr"("room_qr_id", "qr", "starts_at", "ends_at", "created_at", "updated_at", "room_id", "reservation_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING';

    beforeAll(async () => {
        const dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('이용 중만(확정은 이용 전환이 시작 때 발급) · 시작 ≤ now < 끝, QR 왼쪽 조인, 시작 순, 별칭 = QrSyncTargetRow 키', () => {
        const now = new Date('2026-11-10T05:00:00Z');

        const [sql, parameters] = repository.buildQrSyncTargetsQuery(now).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['CHECKED_IN', now]);
        expect(flat).toContain('LEFT JOIN "t_room_qr" "q" ON "q"."reservation_id" = "r"."reservation_id"');
        expect(flat).toContain('"r"."reservation_state_id" = $1');
        expect(flat).toContain('"r"."start_at" <= $2');
        expect(flat).toContain('"r"."end_at" > $2');
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]).sort()).toEqual(['end_at', 'qr', 'qr_ends_at', 'reservation_id', 'room_id', 'start_at']);
        expect(flat).toBe(QR_SYNC_TARGETS_SQL);
    });

    it('QR 발급 — INSERT … ON CONFLICT DO NOTHING', () => {
        const entity = new RoomQrEntity();
        entity.room_qr_id = 'q1';
        entity.room_id = 'r1';
        entity.reservation_id = 'v1';
        entity.qr = 'qr1';
        entity.starts_at = new Date('2026-11-10T04:00:00Z');
        entity.ends_at = new Date('2026-11-10T07:00:00Z');
        entity.insertTimestamp();

        const [sql] = repository.buildInsertRoomQrQuery(entity).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(flat).toContain('ON CONFLICT DO NOTHING');
        expect(flat).toBe(INSERT_ROOM_QR_SQL);
    });
});
