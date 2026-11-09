import type {FindOptionsWhere} from 'typeorm';
import type {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 예약 상태별 건수 (QueryBuilder raw — GROUP BY) */
export interface UserReservationCountRow {
    reservation_state_id: string;
    count: string | number;
}

/** 이용자 예약 이력 행 — 예약 + 업체 · 호실 · 그룹 · 상품 종류 · 상태 이름 (QueryBuilder raw) */
export interface UserReservationRow {
    reservation_id: string;
    store_id: string;
    store_name: string;
    room_name: string;
    room_group_name: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    reservation_state_id: string;
    reservation_state_name: string;
    start_at: Date;
    end_at: Date;
    total_price: number;
    canceled_at: Date | null;
    cancel_actor: string | null;
    created_at: Date;
}

/**
 * 이용자 관리 repository 포트(admin-service) — 공유 DB 의 t_user(이용자 그룹)를 읽고 상태를 바꾸며, 그 이용자의 t_reservation 을 이용자 관리 어휘로 읽는다.
 * WHERE 는 service 가 만들고 repository 는 실행 + DB 오류 변환만 한다(t_user · t_reservation 은 is_deleted 가 없다).
 */
export interface UserRepositoryInterface {
    /** 이용자 단건 (t_user) */
    findUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    /** 이용자 수 — 목록 */
    countUsers(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number>;
    /** 이용자 목록 — 가입 최신순 */
    findUserList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]>;
    /** 이용자 상태 수정 — 상태 조건을 건 쓰기, 1행이면 true */
    updateUser(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<boolean>;
    /** 그 이용자 예약의 상태별 건수 */
    findReservationCounts(user_id: string): Promise<UserReservationCountRow[]>;
    /** 그 이용자 예약 수 — 예약 이력 페이지 */
    countUserReservations(where: FindOptionsWhere<ReservationEntity>): Promise<number>;
    /** 그 이용자 예약 이력 — 결제 대기 만료 제외, 이용 시작 최신순 */
    findUserReservationRows(user_id: string, limit: number, offset: number): Promise<UserReservationRow[]>;
}
