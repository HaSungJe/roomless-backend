import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 결제 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts(READY 결제 대기 · DONE 결제 완료 · FAILED 결제 실패 · EXPIRED 결제 만료 ·
 * REFUND_REQUESTED 환불 신청 · REFUNDED 환불 완료 · REFUND_FAILED 환불 실패). 환불 금액은 전액 또는 일부(t_payment.refund_amount)라 부분 환불 상태를 따로 두지 않는다.
 */
@Entity({name: 't_payment_state', comment: '결제 상태'})
export class PaymentStateEntity {
    @PrimaryColumn({name: 'payment_state_id', length: 20, comment: '결제 상태 ID', primaryKeyConstraintName: 'PK_PaymentState'})
    payment_state_id: string;

    @Column({name: 'payment_state_name', length: 50, nullable: false, comment: '결제 상태명'})
    payment_state_name: string;
}
