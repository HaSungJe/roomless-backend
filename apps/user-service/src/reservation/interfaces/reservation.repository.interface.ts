import type {FindOptionsWhere} from 'typeorm';
import type {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import type {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import type {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import type {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import type {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 예약 가능 호실 행 — 지워지지 않은 호실 · 그룹(QueryBuilder raw — 그룹 조인) */
export interface BookableRoomRow {
    room_id: string;
    room_name: string;
    floor: number;
    room_state_id: string;
    room_group_id: string;
    room_group_name: string;
}

/** 예약 목록 · 상세 행 — 예약 + 업체 · 호실 · 그룹 · 상품 종류명 · 상태명(QueryBuilder raw) */
export interface ReservationListRow {
    reservation_id: string;
    store_id: string;
    store_name: string;
    room_id: string;
    room_name: string;
    room_group_name: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    reservation_state_id: string;
    reservation_state_name: string;
    start_at: Date;
    end_at: Date;
    total_price: number;
    refund_deadline_at: Date;
    late_refund_percent: number;
    canceled_at: Date | null;
    cancel_actor: string | null;
    cancel_reason: string | null;
    created_at: Date;
}

/** 예약 구간 행 — 구간 + 종류명 · 상태명 + 결제 · 결제 상태명(QueryBuilder raw) */
export interface ReservationSegmentRow {
    reservation_detail_id: string;
    reservation_detail_type_id: string;
    reservation_detail_type_name: string;
    reservation_state_id: string;
    start_at: Date;
    end_at: Date;
    price: number;
    expires_at: Date | null;
    payment_id: string;
    payment_state_id: string;
    payment_state_name: string;
    amount: number;
    method: string | null;
    approved_at: Date | null;
    receipt_url: string | null;
    refund_amount: number | null;
    refunded_at: Date | null;
}

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
 * 예약 repository 포트 — 예약 · 구간 · 결제를 쓰고, 공유 DB 의 업체 · 객실 · 상품 · 영업시간(admin-service 가 쓰는 표)과 회원을 예약 어휘로 읽는다.
 * is_deleted 가 있는 표의 조회에는 repository 가 is_deleted = 0 을 붙인다(service 는 넣지 않는다).
 */
export interface ReservationRepositoryInterface {
    /** 예약 업체 — 지워지지 않은 업체 */
    findReservationStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 예약 호실 — 지워지지 않은 호실 */
    findReservationRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
    /** 예약 호실의 객실 그룹 — 지워지지 않은 그룹 */
    findReservationRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity | null>;
    /** 업체의 예약 가능 호실 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순 */
    findBookableRooms(store_id: string): Promise<BookableRoomRow[]>;
    /** 업체 상품 설정 단건 */
    findStorePlan(where: FindOptionsWhere<RoomPlanEntity>): Promise<RoomPlanEntity | null>;
    /** 그룹 상품 목록 */
    findGroupPlans(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity[]>;
    /** 기간 가격 목록 — 지워지지 않은 행 */
    findGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity[]>;
    /** 업체 요일별 영업시간 — 지워지지 않은 행 */
    findStoreHours(store_id: string): Promise<StoreHourEntity[]>;
    /** 업체 브레이크타임 — 지워지지 않은 행 */
    findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]>;
    /** 일시 예약불가 — 지워지지 않은 행 */
    findUnavailablePeriods(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<StoreUnavailablePeriodEntity[]>;
    /** 예약 목록(점유 판정 · 내부 확인용) */
    findReservations(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity[]>;
    /** 같은 이용자 · 같은 호실에서 since 뒤에 결제 대기가 만료된 예약 수(기본 구간 expires_at 기준) */
    countRecentExpired(user_id: string, room_id: string, since: Date): Promise<number>;
    /** 예약 단건 */
    findReservation(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity | null>;
    /** 예약 구간 목록 */
    findReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>): Promise<ReservationDetailEntity[]>;
    /** 결제 단건 */
    findPayment(where: FindOptionsWhere<PaymentEntity>): Promise<PaymentEntity | null>;
    /** 회원 단건(이용자 연락처 · 매니저 소속 업체) */
    findReservationUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    /** 결제 등록 */
    insertPayment(entity: PaymentEntity): Promise<void>;
    /** 예약 등록 — 같은 호실 점유 겹침(EXC_Reservation_RoomIdBlockedRange) → 400 */
    insertReservation(entity: ReservationEntity): Promise<void>;
    /** 예약 구간 등록 */
    insertReservationDetail(entity: ReservationDetailEntity): Promise<void>;
    /** 예약 수정 — 상태 조건을 건 쓰기, 1행이면 true */
    updateReservation(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean>;
    /** 호실 이동 — 상태 조건, 옮길 호실 점유 겹침(EXC_…) → 400, 1행이면 true */
    changeReservationRoom(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean>;
    /** 예약 구간 수정(여러 행) */
    updateReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>, entity: ReservationDetailEntity): Promise<void>;
    /** 결제 수정 — 상태 조건을 건 쓰기, 1행이면 true */
    updatePayment(where: FindOptionsWhere<PaymentEntity>, entity: PaymentEntity): Promise<boolean>;
    /** 예약 개수 */
    countReservations(where: FindOptionsWhere<ReservationEntity>): Promise<number>;
    /** 내 예약 목록 행 — 결제 대기 만료 제외, 입실 최근순 · 페이지 */
    findMyReservationRows(user_id: string, limit: number, offset: number): Promise<ReservationListRow[]>;
    /** 내 예약 상세 행 — 결제 대기 만료 제외 */
    findMyReservationRow(user_id: string, reservation_id: string): Promise<ReservationListRow | null>;
    /** 예약 구간 행 — 시작 순 */
    findReservationSegmentRows(reservation_id: string): Promise<ReservationSegmentRow[]>;
    /** 업체 현황 호실 행 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순 */
    findStoreRoomRows(store_id: string): Promise<StoreRoomRow[]>;
    /** 업체 현황 예약 행 — [from, to) 와 겹치는 결제 대기 · 확정 · 이용 중 · 이용 완료, 입실 순 */
    findStoreReservationRows(store_id: string, from: Date, to: Date): Promise<StoreReservationRow[]>;
    /** 예약의 QR — 예약 1건에 1행 */
    findRoomQr(where: FindOptionsWhere<RoomQrEntity>): Promise<RoomQrEntity | null>;
    /** QR 발급 — 같은 예약 · 같은 QR 이 이미 있으면 넣지 않는다(ON CONFLICT DO NOTHING — 트랜잭션을 깨지 않는다, 호출자가 다시 읽는다) */
    insertRoomQr(entity: RoomQrEntity): Promise<void>;
    /** QR 수정 — 업체 취소 때 유효 종료 */
    updateRoomQr(where: FindOptionsWhere<RoomQrEntity>, entity: RoomQrEntity): Promise<void>;
}
