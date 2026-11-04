import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource} from 'typeorm';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {ENTITIES} from '@app/database/entities.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {ReservationRepository} from '../repositories/reservation.repository.js';
import {buildConfirmTransition, buildExpireTransition} from '../reservation.util.js';

const ROW = {reservation_id: 'r1', payment_id: 'p1', amount: 30000};

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
    const txHost = {
        withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
        tx: {getRepository: (entity: unknown) => (entity === PaymentEntity ? payments : entity === ReservationDetailEntity ? details : entity === RoomQrEntity ? roomQrs : reservations)},
    } as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new ReservationRepository(txHost), payments, details, reservations, roomQrs};
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
        'SELECT "r"."reservation_id" AS "reservation_id", "r"."room_id" AS "room_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at", "q"."qr" AS "qr", "q"."ends_at" AS "qr_ends_at" FROM "t_reservation" "r" LEFT JOIN "t_room_qr" "q" ON "q"."reservation_id" = "r"."reservation_id" WHERE "r"."reservation_state_id" IN ($1, $2) AND "r"."start_at" <= $3 AND "r"."end_at" > $3 ORDER BY "r"."start_at" ASC';
    const INSERT_ROOM_QR_SQL =
        'INSERT INTO "t_room_qr"("room_qr_id", "qr", "starts_at", "ends_at", "created_at", "updated_at", "room_id", "reservation_id") VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING';

    beforeAll(async () => {
        const dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('이용 중(확정 · 이용 중) · 시작 ≤ now < 끝, QR 왼쪽 조인, 시작 순, 별칭 = QrSyncTargetRow 키', () => {
        const now = new Date('2026-11-10T05:00:00Z');

        const [sql, parameters] = repository.buildQrSyncTargetsQuery(now).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['CONFIRMED', 'CHECKED_IN', now]);
        expect(flat).toContain('LEFT JOIN "t_room_qr" "q" ON "q"."reservation_id" = "r"."reservation_id"');
        expect(flat).toContain('"r"."start_at" <= $3');
        expect(flat).toContain('"r"."end_at" > $3');
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
