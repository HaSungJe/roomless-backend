import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {ReservationEntity} from '../reservation/reservation.entity.js';
import {RoomEntity} from '../room/room.entity.js';

/**
 * 호실 QR — 예약 1건의 이용 시간 동안 그 호실 문을 여는 QR 의 이력. 미래 예약에 미리 주지 않고 이용 시작 때 발급한다(scheduler · 이용자 조회).
 * 유효 = [starts_at, ends_at). 지금 유효한 값은 Redis `door-qr:<room_id>` 에도 둔다(문 소켓이 비교한다). 업체가 이용 중 예약을 취소하면 ends_at 을 그 시각으로 바꾼다(이력은 남는다).
 * 예약 1건에 1행(UK), QR 은 32자 무작위(UK). 지우지 않는다.
 */
@Entity({name: 't_room_qr', comment: '호실 QR(예약별 이용 시간 QR 이력)'})
@Check('CHK_RoomQr_StartsEndsAt', '"starts_at" <= "ends_at"')
@Unique('UK_RoomQr_Qr', ['qr'])
@Unique('UK_RoomQr_ReservationId', ['reservation_id'])
@Index('IDX_RoomQr_RoomId', ['room_id'])
export class RoomQrEntity {
    @PrimaryColumn({name: 'room_qr_id', length: 32, comment: '호실 QR ID', primaryKeyConstraintName: 'PK_RoomQr'})
    room_qr_id: string;

    @ManyToOne(() => RoomEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_id', referencedColumnName: 'room_id', foreignKeyConstraintName: 'FK_RoomQr_Room'})
    room_id: string;

    @ManyToOne(() => ReservationEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_id', referencedColumnName: 'reservation_id', foreignKeyConstraintName: 'FK_RoomQr_Reservation'})
    reservation_id: string;

    @Column({name: 'qr', length: 32, nullable: false, comment: 'QR 정보(32자 무작위 — 예약자 QR 화면의 값, 문 소켓 QR 확인의 열쇠)'})
    qr: string;

    @Column({name: 'starts_at', type: 'timestamptz', nullable: false, comment: '유효 시작 — 예약의 이용 시작'})
    starts_at: Date;

    @Column({name: 'ends_at', type: 'timestamptz', nullable: false, comment: '유효 종료 — 예약의 이용 끝, 업체가 이용 중 예약을 취소하면 그 시각(이 시각부터 쓸 수 없다)'})
    ends_at: Date;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일(발급 시각)'})
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
