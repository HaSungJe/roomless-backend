import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 이용 중 취소 요청 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts(REQUESTED 요청 중 · APPROVED 승인 · REJECTED 거절 · EXPIRED 만료).
 * 요청 중인데 만료 시각이 지난 요청은 저장된 값과 상관없이 만료로 본다(읽을 때 계산).
 */
@Entity({name: 't_reservation_cancel_request_state', comment: '이용 중 취소 요청 상태'})
export class ReservationCancelRequestStateEntity {
    @PrimaryColumn({name: 'reservation_cancel_request_state_id', length: 20, comment: '요청 상태 ID', primaryKeyConstraintName: 'PK_ReservationCancelRequestState'})
    reservation_cancel_request_state_id: string;

    @Column({name: 'reservation_cancel_request_state_name', length: 50, nullable: false, comment: '요청 상태명'})
    reservation_cancel_request_state_name: string;
}
