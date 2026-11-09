import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {ReservationStateEntity} from '@app/database/entities/reservation/reservation-state.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from '@app/database/entities/room/room-plan-type.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {UserRepositoryInterface, UserReservationCountRow, UserReservationRow} from '../interfaces/user.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * 이용자 관리 repository(admin-service) — 이용자(t_user)와 그 예약(t_reservation)을 읽고, 이용자 상태를 상태 조건으로 바꾼다.
 */
@Injectable()
export class UserRepository implements UserRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_user */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /** t_reservation */
    private get reservations(): Repository<ReservationEntity> {
        return this.txHost.tx.getRepository(ReservationEntity);
    }

    /**
     * 이용자 단건
     *
     * @param where 조회 조건
     * @returns 이용자 또는 null
     */
    async findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.users.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용자 수
     *
     * @param where 조회 조건 (배열 = OR)
     * @returns 개수
     */
    async countUsers(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number> {
        try {
            return await this.users.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용자 목록
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 이용자 목록 (가입 최신순)
     */
    async findUserList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]> {
        try {
            return await this.buildUserListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용자 목록 쿼리 — 매핑 민감(관계 필드 where · ILike · 배열 OR · 정렬)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildUserListQuery(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): SelectQueryBuilder<UserEntity> {
        return this.users.createQueryBuilder('u').setFindOptions({where, order: {created_at: 'DESC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 이용자 상태 수정 — 상태 조건을 건 쓰기(그 사이 탈퇴 신청 등으로 바뀌었는지 판별), new UserEntity() + 할당으로 호출.
     *
     * @param where 수정 조건(회원 · 그룹 · 지금 상태)
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 1행이면 true
     */
    async updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<boolean> {
        try {
            const result = await this.users.update(where, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그 이용자 예약의 상태별 건수
     *
     * @param user_id 이용자 ID
     * @returns 상태별 건수
     */
    async findReservationCounts(user_id: string): Promise<UserReservationCountRow[]> {
        try {
            return await this.buildReservationCountsQuery(user_id).getRawMany<UserReservationCountRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 상태별 건수 쿼리 — 매핑 민감(raw select · GROUP BY — 별칭이 UserReservationCountRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 이용자 ID
     * @returns 쿼리 빌더
     */
    buildReservationCountsQuery(user_id: string): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_state_id', 'reservation_state_id')
            .addSelect('COUNT(*)', 'count')
            .where('r.user_id = :user_id', {user_id})
            .groupBy('r.reservation_state_id');
    }

    /**
     * 그 이용자 예약 수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countUserReservations(where: FindOptionsWhere<ReservationEntity>): Promise<number> {
        try {
            return await this.reservations.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그 이용자 예약 이력
     *
     * @param user_id 이용자 ID
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 예약 행 (이용 시작 최신순)
     */
    async findUserReservationRows(user_id: string, limit: number, offset: number): Promise<UserReservationRow[]> {
        try {
            return await this.buildUserReservationsQuery(user_id).orderBy('r.start_at', 'DESC').limit(limit).offset(offset).getRawMany<UserReservationRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 이용자 예약 이력 쿼리 — 업체 · 호실 · 그룹 · 상품 종류 · 상태 조인(지운 업체 · 호실 · 그룹도 기록이라 그대로 보인다), 결제 대기 만료 제외.
     * 매핑 민감(조인 · raw select — 별칭이 UserReservationRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 이용자 ID
     * @returns 쿼리 빌더
     */
    buildUserReservationsQuery(user_id: string): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.store_id', 'store_id')
            .addSelect('s.store_name', 'store_name')
            .addSelect('rm.room_name', 'room_name')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('r.room_plan_type_id', 'room_plan_type_id')
            .addSelect('pt.room_plan_type_name', 'room_plan_type_name')
            .addSelect('r.reservation_state_id', 'reservation_state_id')
            .addSelect('st.reservation_state_name', 'reservation_state_name')
            .addSelect('r.start_at', 'start_at')
            .addSelect('r.end_at', 'end_at')
            .addSelect('r.total_price', 'total_price')
            .addSelect('r.canceled_at', 'canceled_at')
            .addSelect('r.cancel_actor', 'cancel_actor')
            .addSelect('r.created_at', 'created_at')
            .innerJoin(StoreEntity, 's', 's.store_id = r.store_id')
            .innerJoin(RoomEntity, 'rm', 'rm.room_id = r.room_id')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = rm.room_group_id')
            .innerJoin(RoomPlanTypeEntity, 'pt', 'pt.room_plan_type_id = r.room_plan_type_id')
            .innerJoin(ReservationStateEntity, 'st', 'st.reservation_state_id = r.reservation_state_id')
            .where('r.user_id = :user_id', {user_id})
            .andWhere('r.reservation_state_id <> :expired', {expired: RESERVATION_STATE.EXPIRED});
    }
}
