import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Exclusion, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {RoomPlanTypeEntity} from '../room/room-plan-type.entity.js';
import {RoomEntity} from '../room/room.entity.js';
import {StoreEntity} from '../store/store.entity.js';
import {UserEntity} from '../user/user.entity.js';
import {ReservationStateEntity} from './reservation-state.entity.js';

/**
 * 예약 1건 — 기본 구간 + 연장 구간들(t_reservation_detail)을 묶는다. 예: 예약 + 연장 2번 = 이 표 1행 + 구간 3행 + 결제 3행.
 * end_at 은 이용 끝(연장이 확정되면 늘어난다 — 이 시각에 이용 완료), blocked_until 은 end_at + 정비시간(예약 때 업체 값 maintenance_minutes)으로 호실을 점유하는 끝이다.
 * 같은 호실의 [start_at, blocked_until) 이 겹치는 활성 예약(결제 대기 · 확정 · 이용 중)은 DB 배타 제약(EXC_ — btree_gist)이 막는다. 끝과 시작이 맞닿는 것은 된다.
 * 합계(total_price) · 기본 상품(room_plan_type_id)은 목록 · 조회가 구간을 모으지 않게 여기에도 둔다. 객실 그룹은 두지 않는다 — 호실로 찾는다(호실의 그룹은 바뀌지 않는다).
 * 환불 마감(refund_deadline_at) · 마감 뒤 환불 비율(late_refund_percent)은 예약 때 업체 값 — 업체가 규정을 바꿔도 이 예약은 그대로다.
 * 체크인 · 체크아웃은 없다 — 시작 시각에 이용 중(CHECKED_IN), 끝 시각에 이용 완료(COMPLETED)로 scheduler 가 바꾼다(사용자 결정 2026-11-07).
 * 지우지 않는다 — 취소는 상태(CANCELED)이고, 취소 주체(USER · STORE)와 사유를 함께 남긴다(CHECK).
 */
@Entity({name: 't_reservation', comment: '예약'})
@Check('CHK_Reservation_StartEndBlocked', '"start_at" < "end_at" AND "end_at" <= "blocked_until"')
@Check(
    'CHK_Reservation_Cancel',
    `("reservation_state_id" = 'CANCELED' AND "canceled_at" IS NOT NULL AND "cancel_actor" IN ('USER', 'STORE') AND "cancel_reason" IS NOT NULL) OR ("reservation_state_id" <> 'CANCELED' AND "canceled_at" IS NULL AND "cancel_actor" IS NULL AND "cancel_reason" IS NULL)`,
)
@Exclusion(
    'EXC_Reservation_RoomIdBlockedRange',
    `USING gist ("room_id" WITH =, tstzrange("start_at", "blocked_until", '[)') WITH &&) WHERE ("reservation_state_id" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN'))`,
)
@Index('IDX_Reservation_UserIdStartAt', ['user_id', 'start_at'])
@Index('IDX_Reservation_StoreIdStartAt', ['store_id', 'start_at'])
export class ReservationEntity {
    @PrimaryColumn({name: 'reservation_id', length: 32, comment: '예약 ID', primaryKeyConstraintName: 'PK_Reservation'})
    reservation_id: string;

    @ManyToOne(() => UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_Reservation_User'})
    user_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_Reservation_Store'})
    store_id: string;

    @ManyToOne(() => RoomEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_id', referencedColumnName: 'room_id', foreignKeyConstraintName: 'FK_Reservation_Room'})
    room_id: string;

    @ManyToOne(() => RoomPlanTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_plan_type_id', referencedColumnName: 'room_plan_type_id', foreignKeyConstraintName: 'FK_Reservation_RoomPlanType'})
    room_plan_type_id: string;

    @ManyToOne(() => ReservationStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_state_id', referencedColumnName: 'reservation_state_id', foreignKeyConstraintName: 'FK_Reservation_ReservationState'})
    reservation_state_id: string;

    @Column({name: 'start_at', type: 'timestamptz', nullable: false, comment: '이용 시작 시각(기본 구간의 시작 — 이 시각에 이용 중)'})
    start_at: Date;

    @Column({name: 'end_at', type: 'timestamptz', nullable: false, comment: '이용 끝 시각(마지막 확정 구간의 끝 — 연장이 확정되면 늘어난다, 이 시각에 이용 완료)'})
    end_at: Date;

    @Column({name: 'maintenance_minutes', type: 'smallint', nullable: false, comment: '정비시간(분) — 예약 때 업체 값, 연장해도 이 값으로 점유 끝을 다시 계산한다'})
    maintenance_minutes: number;

    @Column({name: 'blocked_until', type: 'timestamptz', nullable: false, comment: '점유 끝 — end_at + 정비시간, 이 시각까지 호실을 막는다'})
    blocked_until: Date;

    @Column({name: 'total_price', type: 'integer', nullable: false, comment: '합계 금액(원) — 기본 구간 + 확정된 연장 구간'})
    total_price: number;

    @Column({name: 'refund_deadline_at', type: 'timestamptz', nullable: false, comment: '환불 마감 — 이 시각 전까지 환불 신청 가능(예약 때 업체 환불 기준으로 계산)'})
    refund_deadline_at: Date;

    @Column({name: 'late_refund_percent', type: 'smallint', nullable: false, comment: '마감 뒤 환불 비율(%) — 예약 때 업체 값, 환불 마감 뒤 ~ 이용 시작 전 취소에 쓴다(0 ~ 100)'})
    late_refund_percent: number;

    @Column({name: 'qr_link_sent_at', type: 'timestamptz', nullable: true, comment: 'QR 확인 링크 SMS 를 보낸 시각(예약당 1번 — 보내기 전 NULL)'})
    qr_link_sent_at: Date | null;

    @Column({name: 'canceled_at', type: 'timestamptz', nullable: true, comment: '취소 시각(취소일 때만)'})
    canceled_at: Date | null;

    @Column({name: 'cancel_actor', type: 'varchar', length: 10, nullable: true, comment: '취소 주체(USER: 이용자, STORE: 업체 — 취소일 때만)'})
    cancel_actor: string | null;

    @Column({name: 'cancel_reason', type: 'varchar', length: 255, nullable: true, comment: '취소 사유 메모(255자 — 취소일 때만)'})
    cancel_reason: string | null;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    created_at: Date;

    @Column({name: 'updated_at', type: 'timestamptz', nullable: false, comment: '수정일'})
    updated_at: Date;

    /**
     * insert 직전 등록일 · 수정일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        const now = new Date();
        this.created_at = now;
        this.updated_at = now;
    }

    /**
     * update 직전 수정일을 갱신한다.
     */
    @BeforeUpdate()
    updateTimestamp(): void {
        this.updated_at = new Date();
    }
}
