import type {FindOptionsWhere} from 'typeorm';
import type {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import type {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import type {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import type {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 업체 현황 호실 행 — 지워지지 않은 호실 · 그룹 + 상태명(QueryBuilder raw) */
export interface StoreRoomRow {
    room_id: string;
    room_name: string;
    floor: number;
    room_group_id: string;
    room_group_name: string;
    room_state_id: string;
    room_state_name: string;
}

/** 업체 현황 예약 행 — 예약 + 상태명 · 상품 종류명 + 이용자 이름 · 휴대폰(QueryBuilder raw) */
export interface StoreReservationRow {
    reservation_id: string;
    room_id: string;
    reservation_state_id: string;
    reservation_state_name: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    start_at: Date;
    end_at: Date;
    blocked_until: Date;
    total_price: number;
    user_name: string;
    user_phone: string | null;
}

/**
 * reservation repository 포트 (매니저 예약) — 공유 DB 의 예약 · 구간 · 결제 · QR 이력을 쓰고, 업체 · 호실 · 회원을 예약 어휘로 읽는다.
 * WHERE 는 service 가 만들고 repository 는 is_deleted = 0 을 붙여 실행 + DB 오류 변환만 한다. 상태 조건을 건 쓰기는 1행이면 true.
 */
export interface ReservationRepositoryInterface {
    /** 매니저의 소속 업체 (탈퇴 업체 · 지운 업체 제외) — lock 이면 업체 행을 잠근다(쓰기 트랜잭션 안에서만) */
    findManagerStore(user_id: string, lock: boolean): Promise<StoreEntity | null>;
    /** 회원 단건 — 이용자 연락처(업체 취소 · 호실 이동 SMS) */
    findReservationUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    /** 예약 업체 — 지워지지 않은 업체 */
    findReservationStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 예약 호실 — 지워지지 않은 호실 */
    findReservationRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
    /** 예약 단건 */
    findReservation(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity | null>;
    /** 예약 구간 목록 */
    findReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>): Promise<ReservationDetailEntity[]>;
    /** 예약 수정 — 상태 조건을 건 쓰기, 1행이면 true */
    updateReservation(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean>;
    /** 호실 이동 — 상태 조건, 옮길 호실 점유 겹침(EXC_…) → 400, 1행이면 true */
    changeReservationRoom(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean>;
    /** 예약 구간 수정(여러 행) */
    updateReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>, entity: ReservationDetailEntity): Promise<void>;
    /** 결제 수정 — 상태 조건을 건 쓰기, 1행이면 true */
    updatePayment(where: FindOptionsWhere<PaymentEntity>, entity: PaymentEntity): Promise<boolean>;
    /** 업체 현황 호실 행 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순 */
    findStoreRoomRows(store_id: string): Promise<StoreRoomRow[]>;
    /** 업체 현황 예약 행 — [from, to) 와 겹치는 결제 대기 · 확정 · 이용 중 · 이용 완료, 입실 순 */
    findStoreReservationRows(store_id: string, from: Date, to: Date): Promise<StoreReservationRow[]>;
    /** 예약의 QR — 예약 1건에 1행 */
    findRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null>;
    /** QR 수정 — 업체 취소 때 유효 종료 */
    updateRoomQr(where: FindOptionsWhere<RoomQrEntity>, entity: RoomQrEntity): Promise<void>;
}
