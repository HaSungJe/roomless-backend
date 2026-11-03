import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource} from 'typeorm';
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
    const txHost = {
        withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
        tx: {getRepository: (entity: unknown) => (entity === PaymentEntity ? payments : entity === ReservationDetailEntity ? details : reservations)},
    } as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new ReservationRepository(txHost), payments, details, reservations};
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
