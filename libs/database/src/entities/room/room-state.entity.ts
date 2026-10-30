import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 호실 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_room_state', comment: '호실 상태'})
export class RoomStateEntity {
    @PrimaryColumn({name: 'room_state_id', length: 20, comment: '호실 상태 ID', primaryKeyConstraintName: 'PK_RoomState'})
    room_state_id: string;

    @Column({name: 'room_state_name', length: 50, nullable: false, comment: '호실 상태명'})
    room_state_name: string;
}
