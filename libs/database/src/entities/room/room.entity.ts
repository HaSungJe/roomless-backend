import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from '../store/store.entity.js';
import {RoomGroupEntity} from './room-group.entity.js';
import {RoomStateEntity} from './room-state.entity.js';

/**
 * 호실 — 그룹의 상품 · 가격을 쓰고, 상태 · 사물은 호실마다다. 업체(store_id)는 그룹의 업체와 같다(service 가 맞춘다).
 * 지울 때는 삭제 표시(is_deleted = 1)로 남긴다 — 예약이 호실을 가리킨다. 호실명은 업체 안에서 지워지지 않은 호실끼리 유일하다.
 */
@Entity({name: 't_room', comment: '호실'})
@Index('UK_Room_StoreIdRoomName', ['store_id', 'room_name'], {unique: true, where: '"is_deleted" = 0'})
@Index('IDX_Room_StoreIdFloor', ['store_id', 'floor'])
@Index('IDX_Room_RoomGroupId', ['room_group_id'])
export class RoomEntity {
    @PrimaryColumn({name: 'room_id', length: 32, comment: '호실 ID', primaryKeyConstraintName: 'PK_Room'})
    room_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_Room_Store'})
    store_id: string;

    @ManyToOne(() => RoomGroupEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_group_id', referencedColumnName: 'room_group_id', foreignKeyConstraintName: 'FK_Room_RoomGroup'})
    room_group_id: string;

    @ManyToOne(() => RoomStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_state_id', referencedColumnName: 'room_state_id', foreignKeyConstraintName: 'FK_Room_RoomState'})
    room_state_id: string;

    @Column({name: 'room_name', length: 50, nullable: false, comment: '호실명(예: 101호 — 업체 안에서 지워지지 않은 호실끼리 유일)'})
    room_name: string;

    @Column({name: 'floor', type: 'smallint', nullable: false, comment: '층(정수 — 지하는 음수, B1 = -1)'})
    floor: number;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 예약 이력 때문에 행을 남긴다)'})
    is_deleted: number;

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
