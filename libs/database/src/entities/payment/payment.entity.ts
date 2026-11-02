import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {UserEntity} from '../user/user.entity.js';
import {PaymentStateEntity} from './payment-state.entity.js';

/**
 * 결제 1번(토스페이먼츠) — 시도마다 1행. 예약 구간(t_reservation_detail.payment_id)이 이 행을 가리킨다.
 * payment_id 를 토스 orderId 로 그대로 쓴다(32자 영숫자 — 토스 규칙 6~64자). 결제창 · 승인은 프론트(Next.js)가 하고,
 * 서버는 토스 조회로 진짜인지(DONE · 금액 · orderId) 확인한 뒤 payment_key · method · approved_at · receipt_url 을 채운다. 환불은 서버가 토스 취소 API 로.
 * order_name · amount 는 결제 행을 만들 때의 스냅샷이다 — 상품 · 가격이 나중에 바뀌어도 그때 무엇을 얼마에 결제했는지가 남는다.
 * environment 는 기본값이 없다 — 결제 행을 만드는 service 가 빠뜨리면 insert 가 실패해 드러난다(TEST 결제가 매출 · 통계에 섞이지 않게).
 * refund_amount 는 환불이 없으면 null 이다(0 원 환불과 구분).
 * 불변식(CHECK): DONE · 환불 3종 ⟹ payment_key · approved_at 있음 / REFUNDED ⟹ refund_amount = amount · refunded_at 있음 / FAILED · REFUND_FAILED ⟹ failure_message 있음.
 * 지우지 않는다(기록).
 */
@Entity({name: 't_payment', comment: '결제(토스페이먼츠)'})
@Unique('UK_Payment_PaymentKey', ['payment_key'])
@Index('IDX_Payment_UserIdCreatedAt', ['user_id', 'created_at'])
@Check('CHK_Payment_Environment', `"environment" IN ('TEST', 'LIVE')`)
@Check('CHK_Payment_Approved', `"payment_state_id" NOT IN ('DONE', 'REFUND_REQUESTED', 'REFUNDED', 'REFUND_FAILED') OR ("payment_key" IS NOT NULL AND "approved_at" IS NOT NULL)`)
@Check('CHK_Payment_Refunded', `"payment_state_id" <> 'REFUNDED' OR ("refund_amount" = "amount" AND "refunded_at" IS NOT NULL)`)
@Check('CHK_Payment_Failure', `"payment_state_id" NOT IN ('FAILED', 'REFUND_FAILED') OR "failure_message" IS NOT NULL`)
export class PaymentEntity {
    @PrimaryColumn({name: 'payment_id', length: 32, comment: '결제 ID — 토스 orderId 로 그대로 쓴다', primaryKeyConstraintName: 'PK_Payment'})
    payment_id: string;

    @ManyToOne(() => UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_Payment_User'})
    user_id: string;

    @ManyToOne(() => PaymentStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'payment_state_id', referencedColumnName: 'payment_state_id', foreignKeyConstraintName: 'FK_Payment_PaymentState'})
    payment_state_id: string;

    @Column({name: 'environment', type: 'varchar', length: 10, nullable: false, comment: '결제 환경(TEST: 토스 테스트 키 결제, LIVE: 실결제 — 기본값 없음)'})
    environment: string;

    @Column({name: 'order_name', type: 'varchar', length: 100, nullable: false, comment: '주문명(결제 행을 만들 때 스냅샷 — 토스 결제창 orderName 과 같은 값, 100자)'})
    order_name: string;

    @Column({name: 'amount', type: 'integer', nullable: false, comment: '결제 금액(원, 스냅샷 — 토스 결제 금액과 같아야 한다)'})
    amount: number;

    @Column({name: 'payment_key', type: 'varchar', length: 200, nullable: true, comment: '토스 결제 키(승인 확인 후 — 조회 · 환불에 쓴다)'})
    payment_key: string | null;

    @Column({name: 'method', type: 'varchar', length: 50, nullable: true, comment: '결제 수단(토스 method — 카드 · 간편결제 등)'})
    method: string | null;

    @Column({name: 'approved_at', type: 'timestamptz', nullable: true, comment: '승인 시각(토스 approvedAt)'})
    approved_at: Date | null;

    @Column({name: 'receipt_url', type: 'varchar', length: 500, nullable: true, comment: '토스 영수증 주소'})
    receipt_url: string | null;

    @Column({name: 'refund_amount', type: 'integer', nullable: true, comment: '환불 금액(원 — 환불이 없으면 null)'})
    refund_amount: number | null;

    @Column({name: 'refund_reason', type: 'varchar', length: 200, nullable: true, comment: '환불 사유(토스 cancelReason, 200자)'})
    refund_reason: string | null;

    @Column({name: 'refund_requested_at', type: 'timestamptz', nullable: true, comment: '환불 신청 시각'})
    refund_requested_at: Date | null;

    @Column({name: 'refunded_at', type: 'timestamptz', nullable: true, comment: '환불 완료 시각(토스 canceledAt)'})
    refunded_at: Date | null;

    @Column({name: 'failure_code', type: 'varchar', length: 100, nullable: true, comment: '마지막 실패 코드(토스 code — 승인 확인 · 환불 실패)'})
    failure_code: string | null;

    @Column({name: 'failure_message', type: 'varchar', length: 255, nullable: true, comment: '마지막 실패 사유(토스 message)'})
    failure_message: string | null;

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
