import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 상품 종류 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts(HOURLY 시간 이용 · NIGHT 1박 · LONG 연박).
 * 종류마다 다른 설정(사용 여부 · 예약 가능 요일 · 이용 시간 · 입실 · 퇴실 시각)은 업체 상품 설정(t_room_plan)이 업체 × 종류 1행으로 갖고, 코드가 종류 ID 로 가른다.
 */
@Entity({name: 't_room_plan_type', comment: '상품 종류'})
export class RoomPlanTypeEntity {
    @PrimaryColumn({name: 'room_plan_type_id', length: 20, comment: '상품 종류 ID', primaryKeyConstraintName: 'PK_RoomPlanType'})
    room_plan_type_id: string;

    @Column({name: 'room_plan_type_name', length: 50, nullable: false, comment: '상품 종류명'})
    room_plan_type_name: string;
}
