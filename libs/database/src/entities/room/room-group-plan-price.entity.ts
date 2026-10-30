import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Exclusion, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {RoomGroupPlanEntity} from './room-group-plan.entity.js';

/**
 * 상품별 기간 가격(성수기 등) — 한국 날짜 범위(시작 · 종료 둘 다 포함) 동안 기본 요금 대신 쓴다. 이용 날짜가 범위에 포함되면 적용한다(계산은 예약 — Phase 17).
 * 같은 상품의 지워지지 않은 기간끼리는 겹치지 않는다 — DB 배타 제약(EXC_ — btree_gist 확장, WHERE is_deleted = 0)과 service 검사 둘 다.
 * 지울 때는 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제 — 예약은 적용 가격을 따로 저장한다).
 */
@Entity({name: 't_room_group_plan_price', comment: '상품별 기간 가격'})
@Check('CHK_RoomGroupPlanPrice_StartDateEndDate', '"start_date" <= "end_date"')
@Exclusion('EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange', `USING gist ("room_group_plan_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&) WHERE ("is_deleted" = 0)`)
export class RoomGroupPlanPriceEntity {
    @PrimaryColumn({name: 'room_group_plan_price_id', length: 32, comment: '기간 가격 ID', primaryKeyConstraintName: 'PK_RoomGroupPlanPrice'})
    room_group_plan_price_id: string;

    @ManyToOne(() => RoomGroupPlanEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_group_plan_id', referencedColumnName: 'room_group_plan_id', foreignKeyConstraintName: 'FK_RoomGroupPlanPrice_RoomGroupPlan'})
    room_group_plan_id: string;

    @Column({name: 'start_date', type: 'date', nullable: false, comment: '시작 날짜(한국 날짜, 포함)'})
    start_date: string;

    @Column({name: 'end_date', type: 'date', nullable: false, comment: '종료 날짜(한국 날짜, 포함 — 시작 날짜와 같거나 늦다)'})
    end_date: string;

    @Column({name: 'price', type: 'integer', nullable: false, comment: '이 기간의 요금(원) — 기본 요금 대신'})
    price: number;

    @Column({name: 'memo', type: 'varchar', length: 30, nullable: true, comment: '메모(예: 여름 성수기, 30자)'})
    memo: string | null;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 겹침 검사는 정상 행끼리)'})
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
