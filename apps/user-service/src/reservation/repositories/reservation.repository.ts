import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, InsertQueryBuilder, Repository, SelectQueryBuilder} from 'typeorm';
import {RESERVATION_DETAIL_TYPE, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {PaymentStateEntity} from '@app/database/entities/payment/payment-state.entity.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailTypeEntity} from '@app/database/entities/reservation/reservation-detail-type.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationStateEntity} from '@app/database/entities/reservation/reservation-state.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from '@app/database/entities/room/room-plan-type.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import {isExclusionViolation} from '@app/database/typeorm-error.js';
import type {BookableRoomRow, ReservationListRow, ReservationRepositoryInterface, ReservationSegmentRow} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_TIME_TAKEN_MESSAGE} from '../reservation.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/** 점유 겹침 배타 제약 */
const RESERVATION_EXCLUSION = 'EXC_Reservation_RoomIdBlockedRange';

/**
 * reservation repository (아웃바운드 어댑터) — t_reservation · t_reservation_detail · t_payment 를 쓰고,
 * 공유 DB 의 업체 · 객실 · 상품 · 영업시간(room · store 도메인 표)를 예약 어휘로 읽는다(사용자 결정 2026-11-03 — 공유 DB 직접 읽기).
 * is_deleted 가 있는 표의 조회에는 항상 is_deleted = 0 을 붙인다(notDeleted · QueryBuilder 는 조인 표까지).
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

    /** t_store */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_room */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /** t_room_group */
    private get roomGroups(): Repository<RoomGroupEntity> {
        return this.txHost.tx.getRepository(RoomGroupEntity);
    }

    /** t_room_plan */
    private get roomPlans(): Repository<RoomPlanEntity> {
        return this.txHost.tx.getRepository(RoomPlanEntity);
    }

    /** t_room_group_plan */
    private get roomGroupPlans(): Repository<RoomGroupPlanEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanEntity);
    }

    /** t_room_group_plan_price */
    private get roomGroupPlanPrices(): Repository<RoomGroupPlanPriceEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanPriceEntity);
    }

    /** t_store_hour */
    private get storeHours(): Repository<StoreHourEntity> {
        return this.txHost.tx.getRepository(StoreHourEntity);
    }

    /** t_store_break */
    private get storeBreaks(): Repository<StoreBreakEntity> {
        return this.txHost.tx.getRepository(StoreBreakEntity);
    }

    /** t_store_unavailable_period */
    private get unavailablePeriods(): Repository<StoreUnavailablePeriodEntity> {
        return this.txHost.tx.getRepository(StoreUnavailablePeriodEntity);
    }

    /** t_room_qr */
    private get roomQrs(): Repository<RoomQrEntity> {
        return this.txHost.tx.getRepository(RoomQrEntity);
    }

    /**
     * 예약 업체 — 지워지지 않은 업체
     *
     * @param where 조회 조건
     * @returns 업체 또는 null
     */
    async findReservationStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 호실 — 지워지지 않은 호실
     *
     * @param where 조회 조건
     * @returns 호실 또는 null
     */
    async findReservationRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null> {
        try {
            return await this.rooms.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 호실의 객실 그룹 — 지워지지 않은 그룹
     *
     * @param where 조회 조건
     * @returns 그룹 또는 null
     */
    async findReservationRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity | null> {
        try {
            return await this.roomGroups.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체의 예약 가능 호실 — 지워지지 않은 호실 · 그룹
     *
     * @param store_id 업체 ID
     * @returns 호실 행(층 · 호실명 순)
     */
    async findBookableRooms(store_id: string): Promise<BookableRoomRow[]> {
        try {
            return await this.buildBookableRoomsQuery(store_id).getRawMany<BookableRoomRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 가능 호실 쿼리 — 매핑 민감(그룹 조인 · raw select — 별칭이 BookableRoomRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildBookableRoomsQuery(store_id: string): SelectQueryBuilder<RoomEntity> {
        return this.rooms
            .createQueryBuilder('r')
            .select('r.room_id', 'room_id')
            .addSelect('r.room_name', 'room_name')
            .addSelect('r.floor', 'floor')
            .addSelect('r.room_state_id', 'room_state_id')
            .addSelect('r.room_group_id', 'room_group_id')
            .addSelect('g.room_group_name', 'room_group_name')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = r.room_group_id')
            .where('r.store_id = :store_id', {store_id})
            .andWhere('r.is_deleted = 0')
            .andWhere('g.is_deleted = 0')
            .orderBy('r.floor', 'ASC')
            .addOrderBy('r.room_name', 'ASC');
    }

    /**
     * 업체 상품 설정 단건
     *
     * @param where 조회 조건
     * @returns 상품 설정 또는 null
     */
    async findStorePlan(where: FindOptionsWhere<RoomPlanEntity>): Promise<RoomPlanEntity | null> {
        try {
            return await this.roomPlans.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 목록
     *
     * @param where 조회 조건
     * @returns 그룹 상품 목록
     */
    async findGroupPlans(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity[]> {
        try {
            return await this.roomGroupPlans.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 목록 — 지워지지 않은 행
     *
     * @param where 조회 조건
     * @returns 기간 가격 목록
     */
    async findGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity[]> {
        try {
            return await this.roomGroupPlanPrices.find({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 요일별 영업시간 — 지워지지 않은 행
     *
     * @param store_id 업체 ID
     * @returns 영업시간 목록
     */
    async findStoreHours(store_id: string): Promise<StoreHourEntity[]> {
        try {
            return await this.storeHours.find({where: notDeleted<StoreHourEntity>({store_id}), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 브레이크타임 — 지워지지 않은 행
     *
     * @param store_id 업체 ID
     * @returns 브레이크타임 목록
     */
    async findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]> {
        try {
            return await this.storeBreaks.find({where: notDeleted<StoreBreakEntity>({store_id}), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 — 지워지지 않은 행
     *
     * @param where 조회 조건(service 가 겹침 조건을 만든다)
     * @returns 일시 예약불가 목록
     */
    async findUnavailablePeriods(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<StoreUnavailablePeriodEntity[]> {
        try {
            return await this.unavailablePeriods.find({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 목록
     *
     * @param where 조회 조건
     * @returns 예약 목록
     */
    async findReservations(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity[]> {
        try {
            return await this.reservations.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 같은 이용자 · 같은 호실에서 since 뒤에 결제 대기가 만료된 예약 수
     *
     * @param user_id 이용자 ID
     * @param room_id 호실 ID
     * @param since 기준 시각(지금 − 재예약 제한)
     * @returns 개수
     */
    async countRecentExpired(user_id: string, room_id: string, since: Date): Promise<number> {
        try {
            return await this.buildRecentExpiredQuery(user_id, room_id, since).getCount();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 최근 결제 대기 만료 쿼리 — 매핑 민감(기본 구간 조인 · 시각 조건)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 이용자 ID
     * @param room_id 호실 ID
     * @param since 기준 시각
     * @returns 쿼리 빌더
     */
    buildRecentExpiredQuery(user_id: string, room_id: string, since: Date): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .innerJoin(ReservationDetailEntity, 'd', 'd.reservation_id = r.reservation_id AND d.reservation_detail_type_id = :base', {base: RESERVATION_DETAIL_TYPE.BASE})
            .where('r.user_id = :user_id', {user_id})
            .andWhere('r.room_id = :room_id', {room_id})
            .andWhere('r.reservation_state_id = :expired', {expired: RESERVATION_STATE.EXPIRED})
            .andWhere('d.expires_at > :since', {since});
    }

    /**
     * 예약 단건
     *
     * @param where 조회 조건
     * @returns 예약 또는 null
     */
    async findReservation(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity | null> {
        try {
            return await this.reservations.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 구간 목록
     *
     * @param where 조회 조건
     * @returns 구간 목록
     */
    async findReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>): Promise<ReservationDetailEntity[]> {
        try {
            return await this.reservationDetails.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 단건
     *
     * @param where 조회 조건
     * @returns 결제 또는 null
     */
    async findPayment(where: FindOptionsWhere<PaymentEntity>): Promise<PaymentEntity | null> {
        try {
            return await this.payments.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 등록
     *
     * @param entity 결제
     */
    async insertPayment(entity: PaymentEntity): Promise<void> {
        try {
            await this.payments.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 등록 — 같은 호실의 점유 예약과 [start_at, blocked_until) 이 겹치면 400
     *
     * @param entity 예약
     */
    async insertReservation(entity: ReservationEntity): Promise<void> {
        try {
            await this.reservations.insert(entity);
        } catch (error) {
            if (isExclusionViolation(error, RESERVATION_EXCLUSION)) {
                throw new BadRequestException({message: RESERVATION_TIME_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 예약 구간 등록
     *
     * @param entity 구간
     */
    async insertReservationDetail(entity: ReservationDetailEntity): Promise<void> {
        try {
            await this.reservationDetails.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 수정 — 상태 조건을 건 쓰기(그 사이 바뀌었는지 판별)
     *
     * @param where 수정 조건(상태 포함)
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 1행이면 true
     */
    async updateReservation(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean> {
        try {
            const result = await this.reservations.update(where, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 구간 수정(여러 행)
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>, entity: ReservationDetailEntity): Promise<void> {
        try {
            await this.reservationDetails.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 수정 — 상태 조건을 건 쓰기
     *
     * @param where 수정 조건(상태 포함)
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 1행이면 true
     */
    async updatePayment(where: FindOptionsWhere<PaymentEntity>, entity: PaymentEntity): Promise<boolean> {
        try {
            const result = await this.payments.update(where, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 개수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countReservations(where: FindOptionsWhere<ReservationEntity>): Promise<number> {
        try {
            return await this.reservations.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 내 예약 목록 행
     *
     * @param user_id 이용자 ID
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 목록 행
     */
    async findMyReservationRows(user_id: string, limit: number, offset: number): Promise<ReservationListRow[]> {
        try {
            return await this.buildMyReservationsQuery(user_id, null).orderBy('r.start_at', 'DESC').limit(limit).offset(offset).getRawMany<ReservationListRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 내 예약 상세 행
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @returns 행 또는 null
     */
    async findMyReservationRow(user_id: string, reservation_id: string): Promise<ReservationListRow | null> {
        try {
            return (await this.buildMyReservationsQuery(user_id, reservation_id).getRawOne<ReservationListRow>()) ?? null;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 내 예약 쿼리 — 업체 · 호실 · 그룹 · 상품 종류 · 상태 조인(지운 업체 · 호실 · 그룹도 기록이라 그대로 보인다), 결제 대기 만료 제외, 예약 하나면 그 예약만.
     * 매핑 민감(조인 · raw select — 별칭이 ReservationListRow 키와 같다 · 동적 조립)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID — 목록은 null
     * @returns 쿼리 빌더
     */
    buildMyReservationsQuery(user_id: string, reservation_id: string | null): SelectQueryBuilder<ReservationEntity> {
        const query = this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.store_id', 'store_id')
            .addSelect('s.store_name', 'store_name')
            .addSelect('r.room_id', 'room_id')
            .addSelect('rm.room_name', 'room_name')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('r.room_plan_type_id', 'room_plan_type_id')
            .addSelect('pt.room_plan_type_name', 'room_plan_type_name')
            .addSelect('r.reservation_state_id', 'reservation_state_id')
            .addSelect('st.reservation_state_name', 'reservation_state_name')
            .addSelect('r.start_at', 'start_at')
            .addSelect('r.end_at', 'end_at')
            .addSelect('r.total_price', 'total_price')
            .addSelect('r.refund_deadline_at', 'refund_deadline_at')
            .addSelect('r.late_refund_percent', 'late_refund_percent')
            .addSelect('r.canceled_at', 'canceled_at')
            .addSelect('r.cancel_actor', 'cancel_actor')
            .addSelect('r.cancel_reason', 'cancel_reason')
            .addSelect('r.created_at', 'created_at')
            .innerJoin(StoreEntity, 's', 's.store_id = r.store_id')
            .innerJoin(RoomEntity, 'rm', 'rm.room_id = r.room_id')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = rm.room_group_id')
            .innerJoin(RoomPlanTypeEntity, 'pt', 'pt.room_plan_type_id = r.room_plan_type_id')
            .innerJoin(ReservationStateEntity, 'st', 'st.reservation_state_id = r.reservation_state_id')
            .where('r.user_id = :user_id', {user_id})
            .andWhere('r.reservation_state_id <> :expired', {expired: RESERVATION_STATE.EXPIRED});
        if (reservation_id !== null) {
            query.andWhere('r.reservation_id = :reservation_id', {reservation_id});
        }
        return query;
    }

    /**
     * 예약 구간 행
     *
     * @param reservation_id 예약 ID
     * @returns 구간 행(시작 순)
     */
    async findReservationSegmentRows(reservation_id: string): Promise<ReservationSegmentRow[]> {
        try {
            return await this.buildReservationSegmentsQuery(reservation_id).getRawMany<ReservationSegmentRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 구간 쿼리 — 구간 종류 · 상태 · 결제 · 결제 상태 조인. 매핑 민감(조인 · raw select — 별칭이 ReservationSegmentRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param reservation_id 예약 ID
     * @returns 쿼리 빌더
     */
    buildReservationSegmentsQuery(reservation_id: string): SelectQueryBuilder<ReservationDetailEntity> {
        return this.reservationDetails
            .createQueryBuilder('d')
            .select('d.reservation_detail_id', 'reservation_detail_id')
            .addSelect('d.reservation_detail_type_id', 'reservation_detail_type_id')
            .addSelect('dt.reservation_detail_type_name', 'reservation_detail_type_name')
            .addSelect('d.reservation_state_id', 'reservation_state_id')
            .addSelect('d.start_at', 'start_at')
            .addSelect('d.end_at', 'end_at')
            .addSelect('d.price', 'price')
            .addSelect('d.expires_at', 'expires_at')
            .addSelect('d.payment_id', 'payment_id')
            .addSelect('p.payment_state_id', 'payment_state_id')
            .addSelect('ps.payment_state_name', 'payment_state_name')
            .addSelect('p.amount', 'amount')
            .addSelect('p.method', 'method')
            .addSelect('p.approved_at', 'approved_at')
            .addSelect('p.receipt_url', 'receipt_url')
            .addSelect('p.refund_amount', 'refund_amount')
            .addSelect('p.refunded_at', 'refunded_at')
            .innerJoin(ReservationDetailTypeEntity, 'dt', 'dt.reservation_detail_type_id = d.reservation_detail_type_id')
            .innerJoin(PaymentEntity, 'p', 'p.payment_id = d.payment_id')
            .innerJoin(PaymentStateEntity, 'ps', 'ps.payment_state_id = p.payment_state_id')
            .where('d.reservation_id = :reservation_id', {reservation_id})
            .orderBy('d.start_at', 'ASC');
    }

    /**
     * 예약의 QR
     *
     * @param where 조회 조건
     * @returns QR 행 또는 null
     */
    async findRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null> {
        try {
            return await this.roomQrs.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 발급 — 같은 예약(UK_RoomQr_ReservationId) · 같은 QR(UK_RoomQr_Qr)이 이미 있으면 넣지 않는다. 호출자가 다시 읽어 실제 행을 쓴다.
     *
     * @param entity new RoomQrEntity() + 할당 (@BeforeInsert 가 돈다)
     */
    async insertRoomQr(entity: RoomQrEntity): Promise<void> {
        try {
            await this.buildInsertRoomQrQuery(entity).execute();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * QR 발급 쿼리 — INSERT … ON CONFLICT DO NOTHING(scheduler 발급과 겹쳐도 UK 위반을 내지 않는다 — 트랜잭션 안에서 위반이 나면 그 뒤 쿼리가 모두 실패한다).
     * 엔티티 인스턴스를 넘겨 @BeforeInsert 가 돈다. 매핑 민감(충돌 처리 절)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param entity QR 엔티티
     * @returns 쿼리 빌더
     */
    buildInsertRoomQrQuery(entity: RoomQrEntity): InsertQueryBuilder<RoomQrEntity> {
        return this.roomQrs.createQueryBuilder().insert().into(RoomQrEntity).values(entity).orIgnore();
    }
}
