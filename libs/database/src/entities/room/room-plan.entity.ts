import {BeforeInsert, BeforeUpdate, Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {StoreEntity} from '../store/store.entity.js';
import {RoomPlanTypeEntity} from './room-plan-type.entity.js';

/**
 * 업체 상품 설정 — 업체 × 상품 종류(t_room_plan_type)마다 반드시 1행(입점 승인 때 3행). 업체의 모든 객실 공통이고, 행은 지우지 않는다.
 * 사용 여부(is_used — 판매 여부) · 예약 가능 요일(비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127)은 모든 종류에,
 * 이용 시간은 시간 이용(HOURLY)만, 입실 · 퇴실 시각(한국 시각, 분 단위)은 1박(NIGHT) · 연박(LONG)만 둔다.
 * 1박은 퇴실이 입실보다 이르면 다음 날 퇴실이고, 연박은 첫날 입실 · 마지막 날 퇴실이다. 가격 · 그룹별 사용 여부는 그룹 상품(t_room_group_plan).
 */
@Entity({name: 't_room_plan', comment: '업체 상품 설정'})
@Unique('UK_RoomPlan_StoreIdRoomPlanTypeId', ['store_id', 'room_plan_type_id'])
@Check(
    'CHK_RoomPlan_UsageHoursCheckInOutTime',
    `("room_plan_type_id" = 'HOURLY' AND "usage_hours" IS NOT NULL AND "check_in_time" IS NULL AND "check_out_time" IS NULL) OR ("room_plan_type_id" <> 'HOURLY' AND "usage_hours" IS NULL AND "check_in_time" IS NOT NULL AND "check_out_time" IS NOT NULL)`,
)
export class RoomPlanEntity {
    @PrimaryColumn({name: 'room_plan_id', length: 32, comment: '업체 상품 설정 ID', primaryKeyConstraintName: 'PK_RoomPlan'})
    room_plan_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_RoomPlan_Store'})
    store_id: string;

    @ManyToOne(() => RoomPlanTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_plan_type_id', referencedColumnName: 'room_plan_type_id', foreignKeyConstraintName: 'FK_RoomPlan_RoomPlanType'})
    room_plan_type_id: string;

    @Column({name: 'is_used', type: 'smallint', nullable: false, default: 1, comment: '사용 여부(0: 이 업체는 이 종류를 팔지 않음 — 그룹 상품이 사용 중이어도 팔지 않는다, 1: 판매)'})
    is_used: number;

    @Column({name: 'days_of_week', type: 'smallint', nullable: false, default: 127, comment: '예약 가능 요일(비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127)'})
    days_of_week: number;

    @Column({name: 'usage_hours', type: 'smallint', nullable: true, comment: '이용 시간(시간) — 시간 이용(HOURLY)만, 1회 이용 · 연장이 이 시간만큼. 1박 · 연박은 NULL'})
    usage_hours: number | null;

    @Column({name: 'check_in_time', type: 'time', nullable: true, comment: '입실 시각(한국 시각, 분 단위) — 1박 · 연박(첫날)만, check_out_time 과 세트. 시간 이용은 NULL'})
    check_in_time: string | null;

    @Column({
        name: 'check_out_time',
        type: 'time',
        nullable: true,
        comment: '퇴실 시각(한국 시각, 분 단위) — 1박(입실보다 이르면 다음 날) · 연박(마지막 날)만, check_in_time 과 세트. 시간 이용은 NULL',
    })
    check_out_time: string | null;

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
