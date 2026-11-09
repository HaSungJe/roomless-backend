import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {RESERVATION_DETAIL_TYPE, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import type {StatsAmountRow, StatsFilter, StatsRepositoryInterface, StatsUsageRow} from '../interfaces/stats.repository.interface.js';
import {STATS_PAID_STATES, STATS_REFUND_STATES, STATS_STORE_STATE_LEAVE} from '../stats.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/** 이용 달 — 이용 끝의 한국 달 */
const USAGE_MONTH = `to_char(r.end_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`;

/** 결제 달 — 승인 시각의 한국 달 */
const PAID_MONTH = `to_char(p.approved_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`;

/** 환불 달 — 환불 신청 시각의 한국 달 */
const REFUND_MONTH = `to_char(p.refund_requested_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`;

/**
 * 통계 repository(admin-service) — 이용 완료 예약 · 결제 · 환불을 집계 쿼리로 읽는다. 쓰기 없음.
 */
@Injectable()
export class StatsRepository implements StatsRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_reservation */
    private get reservations(): Repository<ReservationEntity> {
        return this.txHost.tx.getRepository(ReservationEntity);
    }

    /** t_payment */
    private get payments(): Repository<PaymentEntity> {
        return this.txHost.tx.getRepository(PaymentEntity);
    }

    /** t_store */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /**
     * 업체 관리자의 소속 업체
     *
     * @param user_id 로그인 매니저 ID
     * @returns 업체 또는 null
     */
    async findManagerStore(user_id: string): Promise<StoreEntity | null> {
        try {
            return await this.buildManagerStoreQuery(user_id).getOne();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 관리자의 소속 업체 쿼리 — 업체 예약 현황(admin-service reservation)과 같은 조건, 잠금 없음.
     * 매핑 민감(t_user 조인 · 관계 컬럼)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 로그인 매니저 ID
     * @returns 쿼리 빌더
     */
    buildManagerStoreQuery(user_id: string): SelectQueryBuilder<StoreEntity> {
        return this.stores
            .createQueryBuilder('s')
            .innerJoin(UserEntity, 'u', 'u.store_id = s.store_id')
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('s.store_state_id <> :leave', {leave: STATS_STORE_STATE_LEAVE})
            .andWhere('s.is_deleted = 0')
            .loadAllRelationIds();
    }

    /**
     * 이용 집계
     *
     * @param filter 기간 · 환경 · 업체
     * @returns 업체별 · 월별 · 전체 행
     */
    async findUsageRows(filter: StatsFilter): Promise<StatsUsageRow[]> {
        try {
            return await this.buildUsageQuery(filter).getRawMany<StatsUsageRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용 집계 쿼리 — 이용 완료 · 이용 끝이 기간 안 · 기본 구간 결제가 그 환경인 예약을 GROUPING SETS((업체), (달), ())로 센다.
     * 이용자 수는 범위마다 COUNT(DISTINCT) 라 합계를 업체별에서 더하지 않는다. 매핑 민감(조인 · raw select · GROUPING SETS · 동적 조립)이라 Smoke 로 SQL 을 고정한다.
     *
     * @param filter 기간 · 환경 · 업체
     * @returns 쿼리 빌더
     */
    buildUsageQuery(filter: StatsFilter): SelectQueryBuilder<ReservationEntity> {
        const query = this.reservations
            .createQueryBuilder('r')
            .select('r.store_id', 'store_id')
            .addSelect(USAGE_MONTH, 'month')
            .addSelect('GROUPING(r.store_id)', 'grouping_store')
            .addSelect(`GROUPING(${USAGE_MONTH})`, 'grouping_month')
            .addSelect('COUNT(DISTINCT r.user_id)', 'user_count')
            .addSelect('COUNT(*)', 'completed_count')
            .innerJoin(ReservationDetailEntity, 'd', 'd.reservation_id = r.reservation_id AND d.reservation_detail_type_id = :base', {base: RESERVATION_DETAIL_TYPE.BASE})
            .innerJoin(PaymentEntity, 'p', 'p.payment_id = d.payment_id')
            .where('r.reservation_state_id = :completed', {completed: RESERVATION_STATE.COMPLETED})
            .andWhere('r.end_at >= :from', {from: filter.from})
            .andWhere('r.end_at < :to', {to: filter.to})
            .andWhere('p.environment = :environment', {environment: filter.environment});
        if (filter.store_id !== null) {
            query.andWhere('r.store_id = :store_id', {store_id: filter.store_id});
        }
        return query.groupBy(`GROUPING SETS ((r.store_id), (${USAGE_MONTH}), ())`);
    }

    /**
     * 결제 집계
     *
     * @param filter 기간 · 환경 · 업체
     * @returns (업체, 달) 결제액
     */
    async findPaymentRows(filter: StatsFilter): Promise<StatsAmountRow[]> {
        try {
            return await this.buildPaymentQuery(filter).getRawMany<StatsAmountRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 집계 쿼리 — 승인된 결제(완료 · 환불 신청 · 환불 완료 · 환불 실패) 중 승인 시각이 기간 안 · 그 환경인 것을 구간 → 예약의 업체 · 승인 달로 더한다.
     * 매핑 민감(조인 · raw select · 동적 조립 · 시간대 달)이라 Smoke 로 SQL 을 고정한다.
     *
     * @param filter 기간 · 환경 · 업체
     * @returns 쿼리 빌더
     */
    buildPaymentQuery(filter: StatsFilter): SelectQueryBuilder<PaymentEntity> {
        const query = this.payments
            .createQueryBuilder('p')
            .select('r.store_id', 'store_id')
            .addSelect(PAID_MONTH, 'month')
            .addSelect('SUM(p.amount)', 'amount')
            .innerJoin(ReservationDetailEntity, 'd', 'd.payment_id = p.payment_id')
            .innerJoin(ReservationEntity, 'r', 'r.reservation_id = d.reservation_id')
            .where('p.payment_state_id IN (:...states)', {states: STATS_PAID_STATES})
            .andWhere('p.environment = :environment', {environment: filter.environment})
            .andWhere('p.approved_at >= :from', {from: filter.from})
            .andWhere('p.approved_at < :to', {to: filter.to});
        if (filter.store_id !== null) {
            query.andWhere('r.store_id = :store_id', {store_id: filter.store_id});
        }
        return query.groupBy('r.store_id').addGroupBy(PAID_MONTH);
    }

    /**
     * 환불 집계
     *
     * @param filter 기간 · 환경 · 업체
     * @returns (업체, 달) 환불액
     */
    async findRefundRows(filter: StatsFilter): Promise<StatsAmountRow[]> {
        try {
            return await this.buildRefundQuery(filter).getRawMany<StatsAmountRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 환불 집계 쿼리 — 환불 신청 이후(신청 · 완료 · 실패) 결제 중 환불 신청 시각이 기간 안 · 그 환경인 것의 환불 금액을 업체 · 신청 달로 더한다.
     * 매핑 민감(조인 · raw select · 동적 조립 · 시간대 달)이라 Smoke 로 SQL 을 고정한다.
     *
     * @param filter 기간 · 환경 · 업체
     * @returns 쿼리 빌더
     */
    buildRefundQuery(filter: StatsFilter): SelectQueryBuilder<PaymentEntity> {
        const query = this.payments
            .createQueryBuilder('p')
            .select('r.store_id', 'store_id')
            .addSelect(REFUND_MONTH, 'month')
            .addSelect('SUM(p.refund_amount)', 'amount')
            .innerJoin(ReservationDetailEntity, 'd', 'd.payment_id = p.payment_id')
            .innerJoin(ReservationEntity, 'r', 'r.reservation_id = d.reservation_id')
            .where('p.payment_state_id IN (:...states)', {states: STATS_REFUND_STATES})
            .andWhere('p.environment = :environment', {environment: filter.environment})
            .andWhere('p.refund_requested_at >= :from', {from: filter.from})
            .andWhere('p.refund_requested_at < :to', {to: filter.to});
        if (filter.store_id !== null) {
            query.andWhere('r.store_id = :store_id', {store_id: filter.store_id});
        }
        return query.groupBy('r.store_id').addGroupBy(REFUND_MONTH);
    }

    /**
     * 업체별 목록에 넣을 업체 — 지워지지 않은 업체
     *
     * @param where 조회 조건(업체 ID In — 활동 있는 업체, 빈 조건 — 모든 업체)
     * @returns 업체 목록
     */
    async findStatsStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]> {
        try {
            return await this.stores.find({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
