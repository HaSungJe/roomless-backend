import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {UserEntity} from '../user/user.entity.js';
import {ReservationCancelRequestStateEntity} from './reservation-cancel-request-state.entity.js';
import {ReservationEntity} from './reservation.entity.js';

/**
 * 이용 중 예약의 업체 취소 요청 — 업체 관리자가 요청하고 예약자가 SMS 링크에서 로그인해 승인 · 거절한다(사용자 결정 2026-11-07).
 * 진행 중(REQUESTED)은 예약당 1건(부분 유니크). 만료는 저장하지 않고 읽을 때 계산한다(요청 중 + expires_at ≤ 지금 = 만료) — 새 요청이 이전 요청 중을 만료로 바꾼다.
 * 지우지 않는다.
 */
@Entity({name: 't_reservation_cancel_request', comment: '이용 중 예약 업체 취소 요청(이용자 동의)'})
@Index('UK_ReservationCancelRequest_ReservationIdRequested', ['reservation_id'], {unique: true, where: `"reservation_cancel_request_state_id" = 'REQUESTED'`})
@Index('IDX_ReservationCancelRequest_ReservationIdCreatedAt', ['reservation_id', 'created_at'])
export class ReservationCancelRequestEntity {
    @PrimaryColumn({name: 'reservation_cancel_request_id', length: 32, comment: '취소 요청 ID', primaryKeyConstraintName: 'PK_ReservationCancelRequest'})
    reservation_cancel_request_id: string;

    @ManyToOne(() => ReservationEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_id', referencedColumnName: 'reservation_id', foreignKeyConstraintName: 'FK_ReservationCancelRequest_Reservation'})
    reservation_id: string;

    @ManyToOne(() => UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_ReservationCancelRequest_User'})
    user_id: string;

    @ManyToOne(() => ReservationCancelRequestStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({
        name: 'reservation_cancel_request_state_id',
        referencedColumnName: 'reservation_cancel_request_state_id',
        foreignKeyConstraintName: 'FK_ReservationCancelRequest_ReservationCancelRequestState',
    })
    reservation_cancel_request_state_id: string;

    @Column({name: 'cancel_reason', type: 'varchar', length: 255, nullable: false, comment: '취소 사유(255자 — 예약자 승인 화면에 보인다, 승인하면 예약의 취소 사유)'})
    cancel_reason: string;

    @Column({name: 'expires_at', type: 'timestamptz', nullable: false, comment: '만료 시각 — 요청 + 10분, 예약 끝이 먼저면 예약 끝(이 시각부터 승인 · 거절할 수 없다)'})
    expires_at: Date;

    @Column({name: 'responded_at', type: 'timestamptz', nullable: true, comment: '예약자가 승인 · 거절한 시각(그 전 NULL)'})
    responded_at: Date | null;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일(요청 시각)'})
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
