import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {PaymentEntity} from '../payment/payment.entity.js';
import {RoomPlanTypeEntity} from '../room/room-plan-type.entity.js';
import {ReservationDetailTypeEntity} from './reservation-detail-type.entity.js';
import {ReservationStateEntity} from './reservation-state.entity.js';
import {ReservationEntity} from './reservation.entity.js';

/**
 * 예약 구간 — 기본(BASE) 1개 + 연장(EXTENSION) n개. 구간마다 상품 · 시각 · 금액 · 상태 · 결제가 있다.
 * 결제 1건 = 구간 1개(payment_id UK) — 결제가 실패해 다시 하면 이 행이 새 결제 행을 가리키고, 실패한 결제 행은 기록으로 남는다.
 * 상태는 예약 상태 중 PENDING · CONFIRMED · CANCELED · EXPIRED 만 쓴다(CHECK). 점유는 예약 행(t_reservation)이 맡는다 — 연장은 신청 때 예약의 blocked_until 을 늘려 잡아 둔다.
 * 결제 대기(PENDING) 구간은 예약당 1개(부분 유니크 — 결제 대기 중인 연장이 있으면 더 신청할 수 없다, 사용자 결정 2026-11-09).
 * 지우지 않는다(취소 · 만료는 상태).
 */
@Entity({name: 't_reservation_detail', comment: '예약 구간(기본 · 연장)'})
@Check('CHK_ReservationDetail_StartEnd', '"start_at" < "end_at"')
@Check('CHK_ReservationDetail_State', `"reservation_state_id" IN ('PENDING', 'CONFIRMED', 'CANCELED', 'EXPIRED')`)
@Unique('UK_ReservationDetail_PaymentId', ['payment_id'])
@Index('IDX_ReservationDetail_ReservationId', ['reservation_id'])
@Index('UK_ReservationDetail_ReservationIdPending', ['reservation_id'], {unique: true, where: `"reservation_state_id" = 'PENDING'`})
export class ReservationDetailEntity {
    @PrimaryColumn({name: 'reservation_detail_id', length: 32, comment: '예약 구간 ID', primaryKeyConstraintName: 'PK_ReservationDetail'})
    reservation_detail_id: string;

    @ManyToOne(() => ReservationEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_id', referencedColumnName: 'reservation_id', foreignKeyConstraintName: 'FK_ReservationDetail_Reservation'})
    reservation_id: string;

    @ManyToOne(() => ReservationDetailTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_detail_type_id', referencedColumnName: 'reservation_detail_type_id', foreignKeyConstraintName: 'FK_ReservationDetail_ReservationDetailType'})
    reservation_detail_type_id: string;

    @ManyToOne(() => RoomPlanTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_plan_type_id', referencedColumnName: 'room_plan_type_id', foreignKeyConstraintName: 'FK_ReservationDetail_RoomPlanType'})
    room_plan_type_id: string;

    @ManyToOne(() => ReservationStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_state_id', referencedColumnName: 'reservation_state_id', foreignKeyConstraintName: 'FK_ReservationDetail_ReservationState'})
    reservation_state_id: string;

    @ManyToOne(() => PaymentEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'payment_id', referencedColumnName: 'payment_id', foreignKeyConstraintName: 'FK_ReservationDetail_Payment'})
    payment_id: string;

    @Column({name: 'start_at', type: 'timestamptz', nullable: false, comment: '구간 시작 시각'})
    start_at: Date;

    @Column({name: 'end_at', type: 'timestamptz', nullable: false, comment: '구간 끝 시각'})
    end_at: Date;

    @Column({name: 'price', type: 'integer', nullable: false, comment: '구간 금액(원) — 예약 때 적용 가격'})
    price: number;

    @Column({name: 'expires_at', type: 'timestamptz', nullable: true, comment: '결제 대기 만료 시각 — 이때까지 결제가 확인되지 않으면 만료'})
    expires_at: Date | null;

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
