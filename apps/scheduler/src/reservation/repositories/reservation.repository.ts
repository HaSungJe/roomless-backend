import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {MoreThanOrEqual} from 'typeorm';
import type {Repository, SelectQueryBuilder} from 'typeorm';
import {PAYMENT_STATE, RESERVATION_DETAIL_TYPE, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {ExpiredPendingRow, ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import type {PendingTransition} from '../reservation.util.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * 예약 repository(scheduler) — crontab 이 쓰는 예약 · 구간 · 결제 접근. 한 건의 상태 전환(결제 · 구간 · 예약)은 withTransaction 으로 묶고,
 * 상태 조건(READY · PENDING · EXPIRED · REFUND_REQUESTED)을 걸어 다른 요청(결제 확인 · 취소)과 겹쳐도 한쪽만 바꾼다.
 */
@Injectable()
export class ReservationRepository implements ReservationRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_reservation */
    private get reservations(): Repository<ReservationEntity> {
        return this.txHost.tx.getRepository(ReservationEntity);
    }

    /** t_reservation_detail */
    private get reservationDetails(): Repository<ReservationDetailEntity> {
        return this.txHost.tx.getRepository(ReservationDetailEntity);
    }

    /** t_payment */
    private get payments(): Repository<PaymentEntity> {
        return this.txHost.tx.getRepository(PaymentEntity);
    }

    /**
     * 결제 대기 만료 시각이 지난 기본 구간
     *
     * @param now 지금
     * @returns 구간 행
     */
    async findExpiredPendingRows(now: Date): Promise<ExpiredPendingRow[]> {
        try {
            return await this.buildExpiredPendingQuery(now).getRawMany<ExpiredPendingRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 대기 만료 쿼리 — 기본 구간 PENDING · expires_at ≤ now · 결제 READY. 매핑 민감(결제 조인 · raw select — 별칭이 ExpiredPendingRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param now 지금
     * @returns 쿼리 빌더
     */
    buildExpiredPendingQuery(now: Date): SelectQueryBuilder<ReservationDetailEntity> {
        return this.reservationDetails
            .createQueryBuilder('d')
            .select('d.reservation_id', 'reservation_id')
            .addSelect('d.payment_id', 'payment_id')
            .addSelect('p.amount', 'amount')
            .innerJoin(PaymentEntity, 'p', 'p.payment_id = d.payment_id')
            .where('d.reservation_detail_type_id = :base', {base: RESERVATION_DETAIL_TYPE.BASE})
            .andWhere('d.reservation_state_id = :pending', {pending: RESERVATION_STATE.PENDING})
            .andWhere('d.expires_at <= :now', {now})
            .andWhere('p.payment_state_id = :ready', {ready: PAYMENT_STATE.READY})
            .orderBy('d.expires_at', 'ASC');
    }

    /**
     * 결제 대기 전환 — 결제(READY) → 구간(PENDING) → 예약(PENDING). 결제가 이미 바뀌었으면(결제 확인 · 취소가 먼저) 아무것도 바꾸지 않고 false, 그 뒤가 어긋나면 롤백(500).
     *
     * @param row 구간 행
     * @param transition 결제 · 구간 · 예약 엔티티
     * @returns 바꿨으면 true
     */
    async transitionPending(row: ExpiredPendingRow, transition: PendingTransition): Promise<boolean> {
        try {
            return await this.txHost.withTransaction(async () => {
                const payment = await this.payments.update({payment_id: row.payment_id, payment_state_id: PAYMENT_STATE.READY}, transition.payment);
                if (payment.affected !== 1) {
                    return false;
                }
                await this.reservationDetails.update({payment_id: row.payment_id, reservation_state_id: RESERVATION_STATE.PENDING}, transition.detail);
                const reservation = await this.reservations.update({reservation_id: row.reservation_id, reservation_state_id: RESERVATION_STATE.PENDING}, transition.reservation);
                if (reservation.affected !== 1) {
                    throw new Error('reservation state changed');
                }
                return true;
            });
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 다시 확인할 만료 결제
     *
     * @param since 기준 시각(지금 − 30분)
     * @returns 결제 목록
     */
    async findRecheckPayments(since: Date): Promise<PaymentEntity[]> {
        try {
            return await this.payments.find({where: {payment_state_id: PAYMENT_STATE.EXPIRED, updated_at: MoreThanOrEqual(since)}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 환불 신청 결제
     *
     * @returns 결제 목록
     */
    async findRefundRequestedPayments(): Promise<PaymentEntity[]> {
        try {
            return await this.payments.find({where: {payment_state_id: PAYMENT_STATE.REFUND_REQUESTED}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 수정 — 상태 조건을 건 쓰기
     *
     * @param payment_id 결제 ID
     * @param from_state 지금 상태(조건)
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 1행이면 true
     */
    async updatePayment(payment_id: string, from_state: string, entity: PaymentEntity): Promise<boolean> {
        try {
            const result = await this.payments.update({payment_id, payment_state_id: from_state}, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
