import {BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {RoomGroupEntity} from './room-group.entity.js';
import {RoomPlanTypeEntity} from './room-plan-type.entity.js';

/**
 * 그룹 상품 — 그룹 × 상품 종류(t_room_plan_type)마다 반드시 1행(그룹을 만들 때 3행). 판매 / 판매 안 함은 사용 여부(is_used) 0/1 로 바꾸고, 행은 지우지 않는다.
 * 판매 = 업체 상품 설정(t_room_plan) is_used = 1 AND 그룹 상품 is_used = 1. 예약 가능 요일 · 이용 시간 · 입실 · 퇴실 시각은 업체 상품 설정 공통이다.
 * 예약이 이 행을 가리키고, 적용 가격은 예약에 따로 저장한다.
 */
@Entity({name: 't_room_group_plan', comment: '그룹 상품'})
@Unique('UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId', ['room_group_id', 'room_plan_type_id'])
export class RoomGroupPlanEntity {
    @PrimaryColumn({name: 'room_group_plan_id', length: 32, comment: '그룹 상품 ID', primaryKeyConstraintName: 'PK_RoomGroupPlan'})
    room_group_plan_id: string;

    @ManyToOne(() => RoomGroupEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_group_id', referencedColumnName: 'room_group_id', foreignKeyConstraintName: 'FK_RoomGroupPlan_RoomGroup'})
    room_group_id: string;

    @ManyToOne(() => RoomPlanTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_plan_type_id', referencedColumnName: 'room_plan_type_id', foreignKeyConstraintName: 'FK_RoomGroupPlan_RoomPlanType'})
    room_plan_type_id: string;

    @Column({name: 'is_used', type: 'smallint', nullable: false, default: 0, comment: '사용 여부(0: 이 그룹은 이 종류를 팔지 않음, 1: 판매 — 업체 상품 설정도 사용 중이어야 판다)'})
    is_used: number;

    @Column({name: 'price', type: 'integer', nullable: false, default: 0, comment: '기본 요금(원) — 시간 이용 1회 · 1박 · 연박 1박당'})
    price: number;

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
