import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 예약 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts(PENDING 결제 대기 · CONFIRMED 예약 확정 · CHECKED_IN 이용 중 · COMPLETED 이용 완료 · CANCELED 취소 · EXPIRED 결제 대기 만료).
 * 호실을 점유하는 상태는 PENDING · CONFIRMED · CHECKED_IN 이다(t_reservation 배타 제약). 구간(t_reservation_detail)은 PENDING · CONFIRMED · CANCELED · EXPIRED 만 쓴다.
 */
@Entity({name: 't_reservation_state', comment: '예약 상태'})
export class ReservationStateEntity {
    @PrimaryColumn({name: 'reservation_state_id', length: 20, comment: '예약 상태 ID', primaryKeyConstraintName: 'PK_ReservationState'})
    reservation_state_id: string;

    @Column({name: 'reservation_state_name', length: 50, nullable: false, comment: '예약 상태명'})
    reservation_state_name: string;
}
