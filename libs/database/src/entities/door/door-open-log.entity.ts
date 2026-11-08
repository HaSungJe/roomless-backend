import {BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {ReservationEntity} from '../reservation/reservation.entity.js';
import {RoomEntity} from '../room/room.entity.js';
import {RoomQrEntity} from './room-qr.entity.js';

/**
 * QR 로 문을 연 기록 — 문 소켓 QR 확인이 맞을 때 한 줄(업체 관리자 바로 열기 · 틀린 QR 은 남기지 않는다 — 사용자 결정 2026-11-07).
 * 체크인 · 체크아웃 시각 대신 이 기록만 쌓는다. 조회 API 는 아직 없다. 지우지 않는다.
 */
@Entity({name: 't_door_open_log', comment: 'QR 로 문을 연 기록'})
@Index('IDX_DoorOpenLog_RoomIdOpenedAt', ['room_id', 'opened_at'])
@Index('IDX_DoorOpenLog_ReservationId', ['reservation_id'])
export class DoorOpenLogEntity {
    @PrimaryColumn({name: 'door_open_log_id', length: 32, comment: '문 열림 기록 ID', primaryKeyConstraintName: 'PK_DoorOpenLog'})
    door_open_log_id: string;

    @ManyToOne(() => RoomEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_id', referencedColumnName: 'room_id', foreignKeyConstraintName: 'FK_DoorOpenLog_Room'})
    room_id: string;

    @ManyToOne(() => ReservationEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_id', referencedColumnName: 'reservation_id', foreignKeyConstraintName: 'FK_DoorOpenLog_Reservation'})
    reservation_id: string;

    @ManyToOne(() => RoomQrEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_qr_id', referencedColumnName: 'room_qr_id', foreignKeyConstraintName: 'FK_DoorOpenLog_RoomQr'})
    room_qr_id: string;

    @Column({name: 'opened_at', type: 'timestamptz', nullable: false, comment: '문을 연 시각(QR 확인이 맞은 시각)'})
    opened_at: Date;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    created_at: Date;

    /**
     * insert 직전 등록일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        this.created_at = new Date();
    }
}
