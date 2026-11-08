import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationCancelRequestEntity} from '@app/database/entities/reservation/reservation-cancel-request.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationStateEntity} from '@app/database/entities/reservation/reservation-state.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from '@app/database/entities/room/room-plan-type.entity.js';
import {RoomStateEntity} from '@app/database/entities/room/room-state.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import {isExclusionViolation, isUniqueViolation} from '@app/database/typeorm-error.js';
import type {ReservationRepositoryInterface, StoreReservationRow, StoreRoomRow} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_CANCEL_REQUEST_DUPLICATE_MESSAGE, RESERVATION_ROOM_TAKEN_MESSAGE, RESERVATION_STORE_STATE_LEAVE, RESERVATION_STORE_VISIBLE_STATES} from '../reservation.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/** 점유 겹침 배타 제약 */
const RESERVATION_EXCLUSION = 'EXC_Reservation_RoomIdBlockedRange';

/** 진행 중 이용 중 취소 요청 부분 유니크 */
const CANCEL_REQUEST_REQUESTED_UNIQUE = 'UK_ReservationCancelRequest_ReservationIdRequested';

/**
 * reservation repository (매니저 예약) — 공유 DB 의 t_reservation · t_reservation_detail · t_payment · t_reservation_cancel_request 를 쓰고,
 * 업체 · 호실 · 회원(room · store · user 표)을 예약 어휘로 읽는다(user-service 이용자 예약과 같은 표 — 매니저 기능이라 admin-service 에 둔다, 사용자 결정 2026-11-07).
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

    /** t_user */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /** t_reservation_cancel_request */
    private get cancelRequests(): Repository<ReservationCancelRequestEntity> {
        return this.txHost.tx.getRepository(ReservationCancelRequestEntity);
    }

    /**
     * 매니저의 소속 업체 — 매니저 그룹 회원의 store_id 로 찾는다. 탈퇴 업체 · 지운 업체는 없는 것과 같다.
     *
     * @param user_id 로그인 매니저 ID
     * @param lock true 면 업체 행을 잠근다(FOR UPDATE — 같은 업체의 쓰기를 한 번에 하나로). 트랜잭션 안에서만
     * @returns 업체 또는 null
     */
    async findManagerStore(user_id: string, lock: boolean): Promise<StoreEntity | null> {
        try {
            return await this.buildManagerStoreQuery(user_id, lock).getOne();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 매니저의 소속 업체 쿼리 — 매핑 민감(t_user 조인 · 관계 컬럼 · 잠금)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 로그인 매니저 ID
     * @param lock true 면 업체 행만 잠근다(FOR UPDATE OF s — 매니저 행은 잠그지 않는다)
     * @returns 쿼리 빌더
     */
    buildManagerStoreQuery(user_id: string, lock: boolean): SelectQueryBuilder<StoreEntity> {
        const query = this.stores
            .createQueryBuilder('s')
            .innerJoin(UserEntity, 'u', 'u.store_id = s.store_id')
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('s.store_state_id <> :leave', {leave: RESERVATION_STORE_STATE_LEAVE})
            .andWhere('s.is_deleted = 0')
            .loadAllRelationIds();
        return lock ? query.setLock('pessimistic_write', undefined, ['s']) : query;
    }

    /**
     * 회원 단건 — 이용자 연락처(업체 취소 · 호실 이동 SMS)
     *
     * @param where 조회 조건
     * @returns 회원 또는 null
     */
    async findReservationUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.users.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
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
     * 호실 이동 — 옮길 호실의 점유 예약과 겹치면 400
     *
     * @param where 수정 조건(상태 포함)
     * @param entity room_id 만 할당한 엔티티
     * @returns 1행이면 true
     */
    async changeReservationRoom(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean> {
        try {
            const result = await this.reservations.update(where, entity);
            return result.affected === 1;
        } catch (error) {
            if (isExclusionViolation(error, RESERVATION_EXCLUSION)) {
                throw new BadRequestException({message: RESERVATION_ROOM_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
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
     * 업체 현황 호실 행
     *
     * @param store_id 업체 ID
     * @returns 호실 행(층 · 호실명 순)
     */
    async findStoreRoomRows(store_id: string): Promise<StoreRoomRow[]> {
        try {
            return await this.buildStoreRoomsQuery(store_id).getRawMany<StoreRoomRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 현황 호실 쿼리 — 지워지지 않은 호실 · 그룹 + 호실 상태명. 매핑 민감(조인 · raw select — 별칭이 StoreRoomRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreRoomsQuery(store_id: string): SelectQueryBuilder<RoomEntity> {
        return this.rooms
            .createQueryBuilder('r')
            .select('r.room_id', 'room_id')
            .addSelect('r.room_name', 'room_name')
            .addSelect('r.floor', 'floor')
            .addSelect('r.room_group_id', 'room_group_id')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('r.room_state_id', 'room_state_id')
            .addSelect('rs.room_state_name', 'room_state_name')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = r.room_group_id')
            .innerJoin(RoomStateEntity, 'rs', 'rs.room_state_id = r.room_state_id')
            .where('r.store_id = :store_id', {store_id})
            .andWhere('r.is_deleted = 0')
            .andWhere('g.is_deleted = 0')
            .orderBy('r.floor', 'ASC')
            .addOrderBy('r.room_name', 'ASC');
    }

    /**
     * 업체 현황 예약 행
     *
     * @param store_id 업체 ID
     * @param from 날짜 0시
     * @param to 다음 날 0시
     * @returns 예약 행(입실 순)
     */
    async findStoreReservationRows(store_id: string, from: Date, to: Date): Promise<StoreReservationRow[]> {
        try {
            return await this.buildStoreReservationsQuery(store_id, from, to).getRawMany<StoreReservationRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 현황 예약 쿼리 — [from, to) 와 겹치는 결제 대기 · 확정 · 이용 중 · 이용 완료, 상태 · 상품 종류 · 이용자 조인 + 마지막 이용 중 취소 요청(상관 서브쿼리 3개 — 등록 최근 1건의 상태 · 만료 · 등록, 없으면 NULL).
     * 매핑 민감(조인 · raw select — 별칭이 StoreReservationRow 키와 같다 · IN · 시각 조건 · 서브쿼리)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @param from 날짜 0시
     * @param to 다음 날 0시
     * @returns 쿼리 빌더
     */
    buildStoreReservationsQuery(store_id: string, from: Date, to: Date): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.room_id', 'room_id')
            .addSelect('r.reservation_state_id', 'reservation_state_id')
            .addSelect('st.reservation_state_name', 'reservation_state_name')
            .addSelect('r.room_plan_type_id', 'room_plan_type_id')
            .addSelect('pt.room_plan_type_name', 'room_plan_type_name')
            .addSelect('r.start_at', 'start_at')
            .addSelect('r.end_at', 'end_at')
            .addSelect('r.blocked_until', 'blocked_until')
            .addSelect('r.total_price', 'total_price')
            .addSelect('u.name', 'user_name')
            .addSelect('u.phone', 'user_phone')
            .addSelect((sub) => this.buildLatestCancelRequestColumn(sub, 'c1', 'reservation_cancel_request_state_id'), 'cancel_request_state_id')
            .addSelect((sub) => this.buildLatestCancelRequestColumn(sub, 'c2', 'expires_at'), 'cancel_request_expires_at')
            .addSelect((sub) => this.buildLatestCancelRequestColumn(sub, 'c3', 'created_at'), 'cancel_request_created_at')
            .innerJoin(ReservationStateEntity, 'st', 'st.reservation_state_id = r.reservation_state_id')
            .innerJoin(RoomPlanTypeEntity, 'pt', 'pt.room_plan_type_id = r.room_plan_type_id')
            .innerJoin(UserEntity, 'u', 'u.user_id = r.user_id')
            .where('r.store_id = :store_id', {store_id})
            .andWhere('r.reservation_state_id IN (:...states)', {states: RESERVATION_STORE_VISIBLE_STATES})
            .andWhere('r.start_at < :to', {to})
            .andWhere('r.end_at > :from', {from})
            .orderBy('r.start_at', 'ASC');
    }

    /**
     * 업체 현황 예약의 마지막 이용 중 취소 요청 한 컬럼 — 그 예약의 등록 최근 1건(상관 서브쿼리, 별칭은 서브쿼리마다 따로).
     *
     * @param sub 서브쿼리 빌더
     * @param alias 이 서브쿼리의 요청 표 별칭
     * @param column 고를 컬럼
     * @returns 서브쿼리 빌더
     */
    buildLatestCancelRequestColumn(sub: SelectQueryBuilder<ReservationEntity>, alias: string, column: string): SelectQueryBuilder<ReservationCancelRequestEntity> {
        return sub.select(`${alias}.${column}`).from(ReservationCancelRequestEntity, alias).where(`${alias}.reservation_id = r.reservation_id`).orderBy(`${alias}.created_at`, 'DESC').limit(1);
    }

    /**
     * 진행 중인 이용 중 취소 요청을 만료로 — 새 요청 전에(상태 조건 · 여러 행, 지우지 않는 표)
     *
     * @param where 수정 조건(예약 · 요청 중)
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async expireCancelRequests(where: FindOptionsWhere<ReservationCancelRequestEntity>, entity: ReservationCancelRequestEntity): Promise<void> {
        try {
            await this.cancelRequests.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용 중 취소 요청 등록 — 같은 예약에 요청 중이 이미 있으면(겹친 요청) 400
     *
     * @param entity new ReservationCancelRequestEntity() + 할당 (@BeforeInsert 가 돈다)
     */
    async insertCancelRequest(entity: ReservationCancelRequestEntity): Promise<void> {
        try {
            await this.cancelRequests.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, CANCEL_REQUEST_REQUESTED_UNIQUE)) {
                throw new BadRequestException({message: RESERVATION_CANCEL_REQUEST_DUPLICATE_MESSAGE});
            }
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
