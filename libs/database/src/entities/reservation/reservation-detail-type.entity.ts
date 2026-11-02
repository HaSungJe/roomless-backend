import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 예약 구간 종류 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts(BASE 기본 · EXTENSION 연장).
 */
@Entity({name: 't_reservation_detail_type', comment: '예약 구간 종류'})
export class ReservationDetailTypeEntity {
    @PrimaryColumn({name: 'reservation_detail_type_id', length: 20, comment: '예약 구간 종류 ID', primaryKeyConstraintName: 'PK_ReservationDetailType'})
    reservation_detail_type_id: string;

    @Column({name: 'reservation_detail_type_name', length: 50, nullable: false, comment: '예약 구간 종류명'})
    reservation_detail_type_name: string;
}
