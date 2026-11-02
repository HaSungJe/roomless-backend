# Plan — reservation-schema

## Feature Summary
- **Feature**: reservation 기반(Phase 16) — 예약 · 예약 구간(기본 · 연장) · 결제 스키마와 룩업 3개(+시드), 결제 포트 `PAYMENT_GATEWAY` + 토스페이먼츠 어댑터(조회 검증 · 환불 — 승인은 프론트), 호실 그룹 고정(Phase 13 호실 수정에서 그룹 변경 제거).
- **Entry point**: 새 API 없음 — 엔티티 · 시드 · 마이그레이션 `ReservationSchema` · 포트 `PAYMENT_GATEWAY`, 변경 API `PATCH /api/v1/admin-service/room/:room_id`(큐 `admin.room.update`)
- **Domain**: reservation (로드맵 Phase 16 — #63 · #64 · #65 · #66) + room(호실 수정)
- **Spec**: [reservation-schema-spec.md](../../spec/reservation/reservation-schema-spec.md)

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/reservation/reservation-state.entity.ts` · `reservation-detail-type.entity.ts` | new — 룩업 |
| `libs/database/src/entities/reservation/reservation.entity.ts` | new — 예약(배타 제약 `EXC_Reservation_RoomIdBlockedRange` · CHECK 2 · 인덱스 2) |
| `libs/database/src/entities/reservation/reservation-detail.entity.ts` | new — 구간(결제 FK · UK · CHECK 2 · 인덱스) |
| `libs/database/src/entities/payment/payment-state.entity.ts` · `payment.entity.ts` | new — 룩업 · 결제(UK · CHECK 4 · 인덱스) |
| `libs/database/src/entities.ts` | modified — ENTITIES 6개 |
| `libs/database/src/seeder/seeder.targets.ts` | modified — `RESERVATION_STATE_SEED_DATA` · `RESERVATION_DETAIL_TYPE_SEED_DATA` · `PAYMENT_STATE_SEED_DATA` · SEED_TARGETS |
| `libs/database/src/migrations/<ts>-ReservationSchema.ts` · `migrations.ts` | new · modified — `npm run db:generate -- ReservationSchema` 생성 + 등록 |
| `libs/database/src/entities/room/room.entity.ts` | modified — 클래스 주석(그룹은 등록 때만 · 사물 → 문) — DB 변경 없음 |
| `libs/integration/src/integration.symbols.ts` · `integration.constants.ts` · `interfaces/integration.interface.ts` · `integration.util.ts` | modified — `PAYMENT_GATEWAY`, 결제 상수, 결제 포트 타입, `classifyTossFailure` |
| `libs/integration/src/payment/toss-payment.gateway.ts` · `payment/payment.module.ts` | new — `TossPaymentGateway` · `PaymentModule`(전역 — 앱 등록은 Phase 17) |
| `libs/contracts/src/room/dto/room-update.dto.ts` | modified — `room_group_id` 삭제 |
| `apps/admin-service/src/room/room.service.ts` | modified — `updateMyRoom` 그룹 조회 · 변경 삭제 |
| `apps/gateway/src/api/v1/admin-service/room/controllers/room.controller.queue.ts` | modified — 호실 수정 주석 |
| `apps/admin-service/src/room/test/room-update.spec.ts` | modified — 그룹 이동 케이스 삭제, 그룹 무시 케이스 |
| `.env.example` | modified — 토스 절(`TOSS_SECRET_KEY`) |
| `compose.admin-service.yml` · `compose.scheduler.yml` · `compose.gateway.yml` | modified — 쓰지 않는 `TOSS_SECRET_KEY` 빈 값 |
| `docs/guides/toss-setup.md` | new — 테스트 키 · 역할(프론트 승인 · 여기 검증 · 환불) · 라이브 전환 · 문제 해결 |
| `README.md` · `AGENTS.md` · `docs/data-layer.md` · `docs/integration.md` · `docs/architecture.md` | modified — 예약 · 결제 엔티티, 결제 포트, 호실 그룹 고정 |
| `.beaver/output/spec/room/room-manage-spec.md` | modified — 호실 수정 줄(그룹 이동 → 그룹 고정, 2026-11-02 변경) |

삭제할 코드: `updateMyRoom` 의 그룹 조회 · `room_group_id` 대입, `RoomUpdateDto.room_group_id`, room-update.spec 의 그룹 이동 · 그룹 없음 404 케이스.

---

## Design

### Data Access — 엔티티 (`libs/database/src/entities/{reservation,payment}/`)

형제: 룩업 `RoomStateEntity`(room-state.entity.ts — 구조 컬럼만), 배타 제약 `RoomGroupPlanPriceEntity`(room-group-plan-price.entity.ts:12 — `daterange` · `WHERE`), FK `RoomEntity`(room.entity.ts:18-28 — `@ManyToOne` + `@JoinColumn`, NOT NULL 은 CASCADE).

```ts
// libs/database/src/entities/reservation/reservation-state.entity.ts — new
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
```

```ts
// libs/database/src/entities/reservation/reservation-detail-type.entity.ts — new
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
```

```ts
// libs/database/src/entities/reservation/reservation.entity.ts — new
import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Exclusion, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {RoomPlanTypeEntity} from '../room/room-plan-type.entity.js';
import {RoomEntity} from '../room/room.entity.js';
import {StoreEntity} from '../store/store.entity.js';
import {UserEntity} from '../user/user.entity.js';
import {ReservationStateEntity} from './reservation-state.entity.js';

/**
 * 예약 1건 — 기본 구간 + 연장 구간들(t_reservation_detail)을 묶는다. 예: 예약 + 연장 2번 = 이 표 1행 + 구간 3행 + 결제 3행.
 * end_at 은 최종 체크아웃(연장이 확정되면 늘어난다), blocked_until 은 end_at + 정비시간(예약 때 업체 값 maintenance_minutes)으로 호실을 점유하는 끝이다.
 * 같은 호실의 [start_at, blocked_until) 이 겹치는 활성 예약(결제 대기 · 확정 · 이용 중)은 DB 배타 제약(EXC_ — btree_gist)이 막는다. 끝과 시작이 맞닿는 것은 된다.
 * 합계(total_price) · 기본 상품(room_plan_type_id)은 목록 · 조회가 구간을 모으지 않게 여기에도 둔다. 객실 그룹은 두지 않는다 — 호실로 찾는다(호실의 그룹은 바뀌지 않는다).
 * 지우지 않는다 — 취소는 상태(CANCELED)이고, 취소 주체(USER · STORE)와 사유를 함께 남긴다(CHECK).
 */
@Entity({name: 't_reservation', comment: '예약'})
@Check('CHK_Reservation_StartEndBlocked', '"start_at" < "end_at" AND "end_at" <= "blocked_until"')
@Check(
    'CHK_Reservation_Cancel',
    `("reservation_state_id" = 'CANCELED' AND "canceled_at" IS NOT NULL AND "cancel_actor" IN ('USER', 'STORE') AND "cancel_reason" IS NOT NULL) OR ("reservation_state_id" <> 'CANCELED' AND "canceled_at" IS NULL AND "cancel_actor" IS NULL AND "cancel_reason" IS NULL)`,
)
@Exclusion(
    'EXC_Reservation_RoomIdBlockedRange',
    `USING gist ("room_id" WITH =, tstzrange("start_at", "blocked_until", '[)') WITH &&) WHERE ("reservation_state_id" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN'))`,
)
@Index('IDX_Reservation_UserIdStartAt', ['user_id', 'start_at'])
@Index('IDX_Reservation_StoreIdStartAt', ['store_id', 'start_at'])
export class ReservationEntity {
    @PrimaryColumn({name: 'reservation_id', length: 32, comment: '예약 ID', primaryKeyConstraintName: 'PK_Reservation'})
    reservation_id: string;

    @ManyToOne(() => UserEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'user_id', referencedColumnName: 'user_id', foreignKeyConstraintName: 'FK_Reservation_User'})
    user_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_Reservation_Store'})
    store_id: string;

    @ManyToOne(() => RoomEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_id', referencedColumnName: 'room_id', foreignKeyConstraintName: 'FK_Reservation_Room'})
    room_id: string;

    @ManyToOne(() => RoomPlanTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_plan_type_id', referencedColumnName: 'room_plan_type_id', foreignKeyConstraintName: 'FK_Reservation_RoomPlanType'})
    room_plan_type_id: string;

    @ManyToOne(() => ReservationStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_state_id', referencedColumnName: 'reservation_state_id', foreignKeyConstraintName: 'FK_Reservation_ReservationState'})
    reservation_state_id: string;

    @Column({name: 'start_at', type: 'timestamptz', nullable: false, comment: '입실 시각(기본 구간의 시작)'})
    start_at: Date;

    @Column({name: 'end_at', type: 'timestamptz', nullable: false, comment: '최종 체크아웃 시각(마지막 확정 구간의 끝 — 연장이 확정되면 늘어난다)'})
    end_at: Date;

    @Column({name: 'maintenance_minutes', type: 'smallint', nullable: false, comment: '정비시간(분) — 예약 때 업체 값, 연장해도 이 값으로 점유 끝을 다시 계산한다'})
    maintenance_minutes: number;

    @Column({name: 'blocked_until', type: 'timestamptz', nullable: false, comment: '점유 끝 — end_at + 정비시간, 이 시각까지 호실을 막는다'})
    blocked_until: Date;

    @Column({name: 'total_price', type: 'integer', nullable: false, comment: '합계 금액(원) — 기본 구간 + 확정된 연장 구간'})
    total_price: number;

    @Column({name: 'refund_deadline_at', type: 'timestamptz', nullable: false, comment: '환불 마감 — 이 시각 전까지 환불 신청 가능(예약 때 업체 환불 기준으로 계산)'})
    refund_deadline_at: Date;

    @Column({name: 'checked_in_at', type: 'timestamptz', nullable: true, comment: '체크인 시각(이용 시간 안의 첫 문 열기)'})
    checked_in_at: Date | null;

    @Column({name: 'completed_at', type: 'timestamptz', nullable: true, comment: '이용 완료 시각(체크아웃 또는 이용 시간 경과)'})
    completed_at: Date | null;

    @Column({name: 'canceled_at', type: 'timestamptz', nullable: true, comment: '취소 시각(취소일 때만)'})
    canceled_at: Date | null;

    @Column({name: 'cancel_actor', type: 'varchar', length: 10, nullable: true, comment: '취소 주체(USER: 이용자, STORE: 업체 — 취소일 때만)'})
    cancel_actor: string | null;

    @Column({name: 'cancel_reason', type: 'varchar', length: 255, nullable: true, comment: '취소 사유 메모(255자 — 취소일 때만)'})
    cancel_reason: string | null;

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
```

```ts
// libs/database/src/entities/reservation/reservation-detail.entity.ts — new
import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {PaymentEntity} from '../payment/payment.entity.js';
import {RoomPlanTypeEntity} from '../room/room-plan-type.entity.js';
import {ReservationDetailTypeEntity} from './reservation-detail-type.entity.js';
import {ReservationStateEntity} from './reservation-state.entity.js';
import {ReservationEntity} from './reservation.entity.js';

/**
 * 예약 구간 — 기본(BASE) 1개 + 연장(EXTENSION) n개. 구간마다 상품 · 시각 · 금액 · 상태 · 결제가 있다.
 * 결제 1건 = 구간 1개(payment_id UK) — 결제가 실패해 다시 하면 이 행이 새 결제 행을 가리키고, 실패한 결제 행은 기록으로 남는다.
 * 상태는 예약 상태 중 PENDING · CONFIRMED · CANCELED · EXPIRED 만 쓴다(CHECK). 점유는 예약 행(t_reservation)이 맡는다.
 * 지우지 않는다(취소 · 만료는 상태).
 */
@Entity({name: 't_reservation_detail', comment: '예약 구간(기본 · 연장)'})
@Check('CHK_ReservationDetail_StartEnd', '"start_at" < "end_at"')
@Check('CHK_ReservationDetail_State', `"reservation_state_id" IN ('PENDING', 'CONFIRMED', 'CANCELED', 'EXPIRED')`)
@Unique('UK_ReservationDetail_PaymentId', ['payment_id'])
@Index('IDX_ReservationDetail_ReservationId', ['reservation_id'])
export class ReservationDetailEntity {
    @PrimaryColumn({name: 'reservation_detail_id', length: 32, comment: '예약 구간 ID', primaryKeyConstraintName: 'PK_ReservationDetail'})
    reservation_detail_id: string;

    @ManyToOne(() => ReservationEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_id', referencedColumnName: 'reservation_id', foreignKeyConstraintName: 'FK_ReservationDetail_Reservation'})
    reservation_id: string;

    @ManyToOne(() => ReservationDetailTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_detail_type_id', referencedColumnName: 'reservation_detail_type_id', foreignKeyConstraintName: 'FK_ReservationDetail_ReservationDetailType'})
    reservation_detail_type_id: string;

    @ManyToOne(() => RoomPlanTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_plan_type_id', referencedColumnName: 'room_plan_type_id', foreignKeyConstraintName: 'FK_ReservationDetail_RoomPlanType'})
    room_plan_type_id: string;

    @ManyToOne(() => ReservationStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'reservation_state_id', referencedColumnName: 'reservation_state_id', foreignKeyConstraintName: 'FK_ReservationDetail_ReservationState'})
    reservation_state_id: string;

    @ManyToOne(() => PaymentEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'payment_id', referencedColumnName: 'payment_id', foreignKeyConstraintName: 'FK_ReservationDetail_Payment'})
    payment_id: string;

    @Column({name: 'start_at', type: 'timestamptz', nullable: false, comment: '구간 시작 시각'})
    start_at: Date;

    @Column({name: 'end_at', type: 'timestamptz', nullable: false, comment: '구간 끝 시각'})
    end_at: Date;

    @Column({name: 'price', type: 'integer', nullable: false, comment: '구간 금액(원) — 예약 때 적용 가격'})
    price: number;

    @Column({name: 'expires_at', type: 'timestamptz', nullable: true, comment: '결제 대기 만료 시각 — 이때까지 결제가 확인되지 않으면 만료'})
    expires_at: Date | null;

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
```

```ts
// libs/database/src/entities/payment/payment-state.entity.ts — new
import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 결제 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts(READY 결제 대기 · DONE 결제 완료 · FAILED 결제 실패 · EXPIRED 결제 만료 ·
 * REFUND_REQUESTED 환불 신청 · REFUNDED 환불 완료 · REFUND_FAILED 환불 실패). 환불은 100% 만이라 부분 환불 상태는 없다.
 */
@Entity({name: 't_payment_state', comment: '결제 상태'})
export class PaymentStateEntity {
    @PrimaryColumn({name: 'payment_state_id', length: 20, comment: '결제 상태 ID', primaryKeyConstraintName: 'PK_PaymentState'})
    payment_state_id: string;

    @Column({name: 'payment_state_name', length: 50, nullable: false, comment: '결제 상태명'})
    payment_state_name: string;
}
```

```ts
// libs/database/src/entities/payment/payment.entity.ts — new
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
```

```ts
// libs/database/src/entities.ts — modified (import 6줄 + ENTITIES — RoomGroupPlanPriceEntity 다음에)
import {PaymentStateEntity} from './entities/payment/payment-state.entity.js';
import {PaymentEntity} from './entities/payment/payment.entity.js';
import {ReservationDetailTypeEntity} from './entities/reservation/reservation-detail-type.entity.js';
import {ReservationDetailEntity} from './entities/reservation/reservation-detail.entity.js';
import {ReservationStateEntity} from './entities/reservation/reservation-state.entity.js';
import {ReservationEntity} from './entities/reservation/reservation.entity.js';
...
    RoomGroupPlanPriceEntity,
    ReservationStateEntity,
    ReservationDetailTypeEntity,
    PaymentStateEntity,
    PaymentEntity,
    ReservationEntity,
    ReservationDetailEntity,
    UserEntity,
```

```ts
// libs/database/src/seeder/seeder.targets.ts — modified (import 3줄 · 시드 3개 — ROOM_PLAN_TYPE_SEED_DATA 다음 · SEED_TARGETS 3줄 — RoomPlanTypeEntity 다음)
import {PaymentStateEntity} from '../entities/payment/payment-state.entity.js';
import {ReservationDetailTypeEntity} from '../entities/reservation/reservation-detail-type.entity.js';
import {ReservationStateEntity} from '../entities/reservation/reservation-state.entity.js';

/**
 * 예약 상태(t_reservation_state) 기본 데이터 — 점유(배타 제약)는 PENDING · CONFIRMED · CHECKED_IN.
 * 이용 완료는 체크아웃 · 이용 시간 경과(Phase 19), 결제 대기 만료는 DB 에만 남고 이용자 이력에서 숨긴다(Phase 17).
 */
export const RESERVATION_STATE_SEED_DATA: ReservationStateEntity[] = [
    {reservation_state_id: 'PENDING', reservation_state_name: '결제 대기'},
    {reservation_state_id: 'CONFIRMED', reservation_state_name: '예약 확정'},
    {reservation_state_id: 'CHECKED_IN', reservation_state_name: '이용 중'},
    {reservation_state_id: 'COMPLETED', reservation_state_name: '이용 완료'},
    {reservation_state_id: 'CANCELED', reservation_state_name: '취소'},
    {reservation_state_id: 'EXPIRED', reservation_state_name: '결제 대기 만료'},
];

/** 예약 구간 종류(t_reservation_detail_type) 기본 데이터 */
export const RESERVATION_DETAIL_TYPE_SEED_DATA: ReservationDetailTypeEntity[] = [
    {reservation_detail_type_id: 'BASE', reservation_detail_type_name: '기본'},
    {reservation_detail_type_id: 'EXTENSION', reservation_detail_type_name: '연장'},
];

/** 결제 상태(t_payment_state) 기본 데이터 — 환불은 100% 만이라 부분 환불 상태는 없다 */
export const PAYMENT_STATE_SEED_DATA: PaymentStateEntity[] = [
    {payment_state_id: 'READY', payment_state_name: '결제 대기'},
    {payment_state_id: 'DONE', payment_state_name: '결제 완료'},
    {payment_state_id: 'FAILED', payment_state_name: '결제 실패'},
    {payment_state_id: 'EXPIRED', payment_state_name: '결제 만료'},
    {payment_state_id: 'REFUND_REQUESTED', payment_state_name: '환불 신청'},
    {payment_state_id: 'REFUNDED', payment_state_name: '환불 완료'},
    {payment_state_id: 'REFUND_FAILED', payment_state_name: '환불 실패'},
];
...
    {entity: RoomPlanTypeEntity, data: ROOM_PLAN_TYPE_SEED_DATA},
    {entity: ReservationStateEntity, data: RESERVATION_STATE_SEED_DATA},
    {entity: ReservationDetailTypeEntity, data: RESERVATION_DETAIL_TYPE_SEED_DATA},
    {entity: PaymentStateEntity, data: PAYMENT_STATE_SEED_DATA},
```

마이그레이션은 `npm run db:generate -- ReservationSchema`(PGlite — `btree_gist` 를 실은 채 기존 마이그레이션을 적용한 뒤 엔티티와의 차이)로 만든다. `btree_gist` 확장은 RoomSchema 가 이미 만든다. 생성 뒤 확인할 것 — 제약명이 `UK_Payment_PaymentKey` · `UK_ReservationDetail_PaymentId`(생성기의 `UQ_<해시>` 가 아님) · `EXC_Reservation_RoomIdBlockedRange` · CHECK 6개 이름 그대로인지, COMMENT 가 모두 있는지, down 이 역순으로 지우는지.

```sql
-- libs/database/src/migrations/<ts>-ReservationSchema.ts — new (생성기가 만드는 핵심 DDL — 예상)
CREATE TABLE "t_reservation_state" (...);  CREATE TABLE "t_reservation_detail_type" (...);  CREATE TABLE "t_payment_state" (...);
CREATE TABLE "t_payment" (..., CONSTRAINT "UK_Payment_PaymentKey" UNIQUE ("payment_key"), CONSTRAINT "CHK_Payment_Environment" CHECK (...), ...);
CREATE TABLE "t_reservation" (..., CONSTRAINT "EXC_Reservation_RoomIdBlockedRange" EXCLUDE USING gist ("room_id" WITH =, tstzrange("start_at", "blocked_until", '[)') WITH &&) WHERE ("reservation_state_id" IN ('PENDING', 'CONFIRMED', 'CHECKED_IN')), ...);
CREATE TABLE "t_reservation_detail" (..., CONSTRAINT "UK_ReservationDetail_PaymentId" UNIQUE ("payment_id"), ...);
CREATE INDEX "IDX_Reservation_UserIdStartAt" ...; CREATE INDEX "IDX_Reservation_StoreIdStartAt" ...; CREATE INDEX "IDX_ReservationDetail_ReservationId" ...; CREATE INDEX "IDX_Payment_UserIdCreatedAt" ...;
ALTER TABLE ... ADD CONSTRAINT "FK_..." FOREIGN KEY ...;  -- 12개
COMMENT ON TABLE / COLUMN ...;
```

```ts
// libs/database/src/entities/room/room.entity.ts — modified (클래스 주석만 — DB 변경 없음)
/**
 * 호실 — 그룹의 상품 · 가격을 쓰고, 상태 · 문(QR · 열림/닫힘 — Redis)은 호실마다다. 업체(store_id)는 그룹의 업체와 같다(service 가 맞춘다).
 * 그룹은 등록 때만 정한다 — 수정으로 바꾸지 않는다(예약이 호실로 그룹을 찾는다). 잘못 등록했으면 지우고 다시 등록한다.
 * 지울 때는 삭제 표시(is_deleted = 1)로 남긴다 — 예약이 호실을 가리킨다. 호실명은 업체 안에서 지워지지 않은 호실끼리 유일하다.
 */
```

### 외부 연동 포트 — 결제 (`libs/integration/src/payment/`)

형제: 포트 Symbol · 인터페이스(integration.symbols.ts · interfaces/integration.interface.ts), 키 없으면 부팅 경고 · 요청만 503(sns-sms.sender.ts:22-29), HTTP 는 `fetch` + `AbortSignal.timeout` · 연결 실패 503(apps/gateway/src/modules/transport/internal-http.client.ts:46-73), 시각 해석은 dayjs(s3-storage.gateway.ts:4). 실패 분류는 순수 함수라 `integration.util.ts`(형제 `toE164KrPhone`).

```ts
// libs/integration/src/integration.symbols.ts — modified (파일 끝에 추가)

/** 결제 포트 — 구현: TossPaymentGateway (토스페이먼츠) */
export const PAYMENT_GATEWAY = Symbol('PaymentGatewayInterface');
```

```ts
// libs/integration/src/integration.constants.ts — modified (파일 끝에 추가)

/** 토스페이먼츠에 닿지 못했거나 잠시 뒤 다시 하면 되는 실패 — 503, 큐 경로에서는 재시도된다 */
export const PAYMENT_UNAVAILABLE_MESSAGE = '결제 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';

/** 토스가 업무 실패를 돌려줬는데 메시지가 없을 때(본문이 JSON 이 아님 등) — 400 */
export const PAYMENT_FAILED_MESSAGE = '결제를 처리하지 못했습니다.';

/** 토스페이먼츠 API 주소 */
export const TOSS_API_BASE_URL = 'https://api.tosspayments.com';

/** 토스 API 요청 제한 시간(ms) — 넘기면 503(재시도) */
export const PAYMENT_REQUEST_TIMEOUT_MS = 30000;
```

```ts
// libs/integration/src/interfaces/integration.interface.ts — modified (파일 끝에 추가)

/** 결제 환경 — TEST: 토스 테스트 키(test_), LIVE: 실결제 */
export type PaymentEnvironment = 'TEST' | 'LIVE';

/** 토스에서 다시 읽은 결제 1건 — 프론트가 넘긴 결과를 이것과 대조해 검증한다 */
export interface PaymentLookupResult {
    /** 토스 결제 키 */
    payment_key: string;
    /** 주문번호 — 우리 payment_id */
    order_id: string;
    /** 토스 결제 상태(READY · IN_PROGRESS · DONE · CANCELED · PARTIAL_CANCELED · ABORTED · EXPIRED …) */
    status: string;
    /** 결제 금액(원 — 취소해도 바뀌지 않는 원래 금액) */
    total_amount: number;
    /** 결제 수단(카드 · 간편결제 등) — 승인 전이면 null */
    method: string | null;
    /** 승인 시각 — 승인 전이면 null */
    approved_at: Date | null;
    /** 영수증 주소 — 없으면 null */
    receipt_url: string | null;
}

/** 환불(전액 취소) 요청 */
export interface PaymentCancelInput {
    /** 우리 결제 ID — 멱등키(cancel-<payment_id>)에 쓴다 */
    payment_id: string;
    /** 토스 결제 키 */
    payment_key: string;
    /** 취소 사유(토스 cancelReason, 200자) */
    reason: string;
}

/** 환불 결과 */
export interface PaymentCancelResult {
    /** 취소된 금액(원) */
    canceled_amount: number;
    /** 취소 시각 */
    canceled_at: Date;
}

/**
 * 결제 포트(토스페이먼츠) — 결제창 · 승인은 프론트(Next.js)가 하고, 서버는 토스에서 다시 읽어 검증(getPayment · findByPaymentId)하고 환불(cancel)한다.
 * 업무 실패는 400 `{message: 토스 메시지, payment_error_code: 토스 code}`(재시도해도 소용없다), 일시 실패는 503 `{message: PAYMENT_UNAVAILABLE_MESSAGE}`(큐 재시도).
 */
export interface PaymentGatewayInterface {
    /**
     * 결제 환경 — 시크릿 키 접두사로 정한다(test_ → TEST, 그 밖 → LIVE). 결제 행을 만들 때 environment 에 넣는다.
     *
     * @throws ServiceUnavailableException `{message: PAYMENT_UNAVAILABLE_MESSAGE}` — 시크릿 키가 없을 때
     */
    environment(): PaymentEnvironment;

    /**
     * 결제 키로 토스에서 결제를 다시 읽는다(GET /v1/payments/{paymentKey}).
     *
     * @returns 결제 — 토스에 없으면 null
     * @throws BadRequestException 업무 실패 · ServiceUnavailableException 일시 실패
     */
    getPayment(payment_key: string): Promise<PaymentLookupResult | null>;

    /**
     * 주문번호(우리 payment_id)로 토스에서 결제를 읽는다(GET /v1/payments/orders/{orderId}) — 프론트가 결과를 못 넘긴 결제의 재확인용.
     *
     * @returns 결제 — 토스에 없으면 null
     * @throws BadRequestException 업무 실패 · ServiceUnavailableException 일시 실패
     */
    findByPaymentId(payment_id: string): Promise<PaymentLookupResult | null>;

    /**
     * 전액 취소(환불) — Idempotency-Key cancel-<payment_id> 를 붙여 재시도가 중복 취소를 만들지 않는다.
     *
     * @throws BadRequestException 업무 실패(이미 취소 · 취소 불가 금액 · 결제 없음 등) · ServiceUnavailableException 일시 실패
     */
    cancel(input: PaymentCancelInput): Promise<PaymentCancelResult>;
}
```

```ts
// libs/integration/src/integration.util.ts — modified (파일 끝에 추가)

/** 토스가 4xx 로 돌려줘도 잠시 뒤 다시 하면 되는 오류 코드 */
const TOSS_RETRYABLE_ERROR_CODES = new Set(['PROVIDER_ERROR', 'IDEMPOTENT_REQUEST_PROCESSING']);

/** 토스 실패 분류 — BUSINESS: 업무 실패(400, 재시도 없음), RETRY: 일시 실패(503, 재시도), NOT_FOUND: 결제 없음 */
export interface TossFailure {
    /** 분류 */
    kind: 'BUSINESS' | 'RETRY' | 'NOT_FOUND';
    /** 토스 오류 코드 — 본문에 없으면 null */
    code: string | null;
    /** 토스 오류 메시지 — 본문에 없으면 null */
    message: string | null;
}

/**
 * 토스 오류 응답을 분류한다 — 404 NOT_FOUND_PAYMENT 는 결제 없음, 5xx · 401(우리 키) · 409(처리 중) · 재시도 코드는 일시 실패, 그 밖 4xx 는 업무 실패.
 * 네트워크 오류 · 시간 초과는 응답이 없어 어댑터가 따로 503 으로 바꾼다.
 *
 * @param status HTTP 상태 코드(2xx 가 아닌 값)
 * @param body 응답 본문(JSON 이 아니면 null)
 * @returns 분류 · 토스 code · message
 */
export function classifyTossFailure(status: number, body: unknown): TossFailure {
    const error = body !== null && typeof body === 'object' ? (body as {code?: unknown; message?: unknown}) : {};
    const code = typeof error.code === 'string' ? error.code : null;
    const message = typeof error.message === 'string' ? error.message : null;
    if (status === 404 && code === 'NOT_FOUND_PAYMENT') {
        return {kind: 'NOT_FOUND', code, message};
    }
    if (status >= 500 || status === 401 || status === 409 || (code !== null && TOSS_RETRYABLE_ERROR_CODES.has(code))) {
        return {kind: 'RETRY', code, message};
    }
    return {kind: 'BUSINESS', code, message};
}
```

```ts
// libs/integration/src/payment/toss-payment.gateway.ts — new
import {BadRequestException, Injectable, Logger, OnApplicationBootstrap, ServiceUnavailableException} from '@nestjs/common';
import {dayjs} from '@app/common/utils/dayjs.js';
import {PAYMENT_FAILED_MESSAGE, PAYMENT_REQUEST_TIMEOUT_MS, PAYMENT_UNAVAILABLE_MESSAGE, TOSS_API_BASE_URL} from '../integration.constants.js';
import {classifyTossFailure} from '../integration.util.js';
import type {PaymentCancelInput, PaymentCancelResult, PaymentEnvironment, PaymentGatewayInterface, PaymentLookupResult} from '../interfaces/integration.interface.js';

/** 토스 결제 객체 — 쓰는 필드만 */
interface TossPayment {
    paymentKey: string;
    orderId: string;
    status: string;
    totalAmount: number;
    method: string | null;
    approvedAt: string | null;
    receipt: {url: string} | null;
    cancels: {cancelAmount: number; canceledAt: string}[] | null;
}

/** 토스 응답 1건 — 상태 코드 · 성공 여부 · 본문(JSON 이 아니면 null) */
interface TossResponse {
    status: number;
    ok: boolean;
    body: unknown;
}

/**
 * 토스 결제 객체를 포트 결과로 바꾼다.
 *
 * @param payment 토스 결제 객체
 * @returns 조회 결과
 */
function toLookupResult(payment: TossPayment): PaymentLookupResult {
    return {
        payment_key: payment.paymentKey,
        order_id: payment.orderId,
        status: payment.status,
        total_amount: payment.totalAmount,
        method: payment.method ?? null,
        approved_at: payment.approvedAt ? dayjs(payment.approvedAt).toDate() : null,
        receipt_url: payment.receipt?.url ?? null,
    };
}

/**
 * 결제 어댑터 — 토스페이먼츠 API(https://api.tosspayments.com). 시크릿 키 TOSS_SECRET_KEY 를 Basic 인증(`키:` 를 base64)으로 쓴다.
 * 결제창 · 승인은 프론트가 하고, 여기서는 조회(검증) · 전액 취소(환불)만 한다. 취소는 Idempotency-Key cancel-<payment_id> 로 재시도해도 한 번만 된다.
 * 실패 분류는 classifyTossFailure — 업무 400(토스 메시지 · code) / 일시 503 / 결제 없음(조회 null · 취소 400).
 * 세팅: docs/guides/toss-setup.md
 */
@Injectable()
export class TossPaymentGateway implements PaymentGatewayInterface, OnApplicationBootstrap {
    private readonly logger = new Logger(TossPaymentGateway.name);

    /**
     * TOSS_SECRET_KEY 가 비어 있으면 부팅 때 한 번 경고한다. 부팅은 막지 않고 결제 요청만 실패한다.
     */
    onApplicationBootstrap(): void {
        if (!process.env.TOSS_SECRET_KEY) {
            this.logger.warn('TOSS_SECRET_KEY 가 비어 있어 결제를 확인 · 환불할 수 없습니다 — docs/guides/toss-setup.md');
        }
    }

    /**
     * 결제 환경 — 시크릿 키가 test_ 로 시작하면 TEST, 아니면 LIVE.
     *
     * @returns TEST | LIVE
     */
    environment(): PaymentEnvironment {
        return this.secretKey().startsWith('test_') ? 'TEST' : 'LIVE';
    }

    /**
     * 결제 키로 결제를 읽는다.
     *
     * @param payment_key 토스 결제 키
     * @returns 결제 — 없으면 null
     */
    async getPayment(payment_key: string): Promise<PaymentLookupResult | null> {
        return this.lookup(`/v1/payments/${encodeURIComponent(payment_key)}`);
    }

    /**
     * 주문번호(우리 payment_id)로 결제를 읽는다.
     *
     * @param payment_id 우리 결제 ID(= 토스 orderId)
     * @returns 결제 — 없으면 null
     */
    async findByPaymentId(payment_id: string): Promise<PaymentLookupResult | null> {
        return this.lookup(`/v1/payments/orders/${encodeURIComponent(payment_id)}`);
    }

    /**
     * 전액 취소(환불).
     *
     * @param input 결제 ID · 결제 키 · 사유
     * @returns 취소 금액 · 시각
     */
    async cancel(input: PaymentCancelInput): Promise<PaymentCancelResult> {
        const response = await this.request('POST', `/v1/payments/${encodeURIComponent(input.payment_key)}/cancel`, {cancelReason: input.reason}, `cancel-${input.payment_id}`);
        if (!response.ok) {
            throw this.toException(response, '환불');
        }
        const cancels = (response.body as TossPayment).cancels ?? [];
        const last = cancels[cancels.length - 1];
        return {canceled_amount: last?.cancelAmount ?? 0, canceled_at: last ? dayjs(last.canceledAt).toDate() : new Date()};
    }

    /**
     * 조회 요청 — 결제 없음(404 NOT_FOUND_PAYMENT)은 null.
     *
     * @param path API 경로
     * @returns 결제 또는 null
     */
    private async lookup(path: string): Promise<PaymentLookupResult | null> {
        const response = await this.request('GET', path);
        if (response.ok) {
            return toLookupResult(response.body as TossPayment);
        }
        if (classifyTossFailure(response.status, response.body).kind === 'NOT_FOUND') {
            return null;
        }
        throw this.toException(response, '조회');
    }

    /**
     * 토스 API 1번 — 닿지 못하거나 시간이 넘으면(본문 읽기 포함) 503.
     *
     * @param method HTTP 메서드
     * @param path API 경로
     * @param body 요청 본문(POST)
     * @param idempotency_key 멱등키(POST)
     * @returns 상태 코드 · 성공 여부 · 본문
     */
    private async request(method: 'GET' | 'POST', path: string, body?: object, idempotency_key?: string): Promise<TossResponse> {
        const headers: Record<string, string> = {authorization: `Basic ${Buffer.from(`${this.secretKey()}:`).toString('base64')}`};
        const init: RequestInit = {method, headers, signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS)};
        if (body !== undefined) {
            headers['content-type'] = 'application/json';
            init.body = JSON.stringify(body);
        }
        if (idempotency_key) {
            headers['idempotency-key'] = idempotency_key;
        }
        let response: Response;
        let text: string;
        try {
            response = await fetch(`${TOSS_API_BASE_URL}${path}`, init);
            text = await response.text();
        } catch (error) {
            this.logger.error(`토스 요청 실패(${method} ${path}): ${(error as Error)?.message ?? error}`);
            throw new ServiceUnavailableException({message: PAYMENT_UNAVAILABLE_MESSAGE});
        }
        let parsed: unknown = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = null;
        }
        return {status: response.status, ok: response.ok, body: parsed};
    }

    /**
     * 실패 응답을 예외로 바꾼다 — 업무 실패 400(토스 메시지 · payment_error_code), 일시 실패 · 결제 없음 외 분류는 503.
     * 취소의 결제 없음(404)은 업무 실패로 본다.
     *
     * @param response 토스 응답
     * @param action 로그에 남길 동작 이름
     * @returns 던질 예외
     */
    private toException(response: TossResponse, action: string): BadRequestException | ServiceUnavailableException {
        const failure = classifyTossFailure(response.status, response.body);
        if (failure.kind === 'RETRY') {
            this.logger.error(`토스 ${action} 일시 실패: ${response.status} ${failure.code ?? ''} ${failure.message ?? ''}`);
            return new ServiceUnavailableException({message: PAYMENT_UNAVAILABLE_MESSAGE});
        }
        return new BadRequestException({message: failure.message ?? PAYMENT_FAILED_MESSAGE, payment_error_code: failure.code});
    }

    /**
     * 시크릿 키 — 없으면 503.
     *
     * @returns TOSS_SECRET_KEY
     */
    private secretKey(): string {
        const key = process.env.TOSS_SECRET_KEY;
        if (!key) {
            throw new ServiceUnavailableException({message: PAYMENT_UNAVAILABLE_MESSAGE});
        }
        return key;
    }
}
```

```ts
// libs/integration/src/payment/payment.module.ts — new
import {Global, Module} from '@nestjs/common';
import {PAYMENT_GATEWAY} from '../integration.symbols.js';
import {TossPaymentGateway} from './toss-payment.gateway.js';

/**
 * 결제 포트(PAYMENT_GATEWAY) — 토스페이먼츠(조회 검증 · 환불, 승인은 프론트).
 * 결제를 다루는 앱의 루트 모듈에서 import 한다(전역 — 도메인 모듈은 import 없이 `@Inject(PAYMENT_GATEWAY)` 로 주입받는다). 첫 사용은 Phase 17(user-service 예약).
 */
@Global()
@Module({providers: [{provide: PAYMENT_GATEWAY, useClass: TossPaymentGateway}], exports: [PAYMENT_GATEWAY]})
export class PaymentModule {}
```

### Input/Validation · Business Logic — 호실 그룹 고정 (Phase 13 변경)

형제: 호실 등록은 그대로 그룹을 받는다(`RoomDto`). 수정만 그룹을 뺀다.

```ts
// libs/contracts/src/room/dto/room-update.dto.ts — modified (파일 전체)
import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 호실 수정 path param — 내 업체의 지워지지 않은 호실만(아니면 404)
 */
export class RoomUpdateParamDto {
    @ApiProperty({description: '호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 호실 수정 — 호실명 · 층을 통째로. 그룹은 등록 때만 정한다(바꾸지 않는다 — 잘못 등록했으면 지우고 다시 등록). 업체 안 지워지지 않은 호실명이 같으면 400
 */
export class RoomUpdateDto {
    @ApiProperty({description: '호실명 (50자 — 예: 101호, 업체 안에서 유일)'})
    @MaxLength(50, {message: '호실명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '호실명을 입력해주세요.'})
    room_name: string;

    @ApiProperty({description: '층 (-10 ~ 200 정수 — 지하는 음수, B1 = -1)'})
    @IsInt({message: '층은 정수로 입력해주세요.'})
    @Min(-10, {message: '층은 -10 ~ 200 사이로 입력해주세요.'})
    @Max(200, {message: '층은 -10 ~ 200 사이로 입력해주세요.'})
    @IsNotEmpty({message: '층을 입력해주세요.'})
    floor: number;
}
```

```ts
// apps/admin-service/src/room/room.service.ts — modified (updateMyRoom — JSDoc 과 본문)
    /**
     * 호실 수정 — 호실명 · 층을 통째로. 그룹은 등록 때만 정한다(바꾸지 않는다 — 예약이 호실로 그룹을 찾는다). (RabbitMQ: admin.room.update)
     * - 업체 안 지워지지 않은 다른 호실명이면 repository 가 400(UK_Room_StoreIdRoomName)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_id 호실 ID
     * @param dto 호실명 · 층
     */
    @Transactional()
    async updateMyRoom(user_id: string, room_id: string, dto: RoomUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 호실
        const room = await this.roomRepository.findRoom({room_id, store_id: store.store_id});
        if (!room) {
            throw new NotFoundException({message: ROOM_NOT_FOUND_MESSAGE});
        }

        // 3. 수정 — 그룹은 그대로
        const entity = new RoomEntity();
        entity.room_name = dto.room_name;
        entity.floor = dto.floor;
        await this.roomRepository.updateRoom({room_id: room.room_id}, entity);
    }
```

```ts
// apps/gateway/src/api/v1/admin-service/room/controllers/room.controller.queue.ts — modified (호실 수정 주석 1줄)
    /**
     * 호실 수정 (업체 관리자) — 호실명 · 층 통째로(그룹은 바꾸지 않는다 — 잘못 등록했으면 지우고 다시 등록). done 의 data 는 null.
     */
```

### Tests — 호실 수정 spec 고침

```ts
// apps/admin-service/src/room/test/room-update.spec.ts — modified (파일 전체)
import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {createValidationError} from '@app/common/utils/validation.js';
import {RoomUpdateDto, RoomUpdateParamDto} from '@app/contracts/room/dto/room-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, ROOM_ID, roomEntity, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const PAYLOAD = {room_id: ROOM_ID, room_name: '201호', floor: 2};
const NAME_TAKEN = '이미 있는 호실명입니다.';

describe('admin.room.update — 호실 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoom.mockResolvedValue(roomEntity());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 호실을 찾아 호실명 · 층을 통째로 바꾼다(그룹 · 상태 · 업체는 그대로, 그룹 조회 없음)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.updateRoom).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoom.mock.calls[0] as [unknown, RoomEntity];
            expect(where).toEqual({room_id: ROOM_ID});
            expect(entity).toBeInstanceOf(RoomEntity);
            expect(entity).toMatchObject({room_name: '201호', floor: 2});
            expect(entity.room_group_id).toBeUndefined();
            expect(entity.room_state_id).toBeUndefined();
            expect(entity.store_id).toBeUndefined();
        });

        it('예전 클라이언트가 room_group_id 를 보내도 그룹은 바꾸지 않는다', async () => {
            await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: {...PAYLOAD, room_group_id: 'a'.repeat(32)}, actor: MANAGER_ACTOR});

            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            const [, entity] = repo.updateRoom.mock.calls[0] as [unknown, RoomEntity];
            expect(entity.room_group_id).toBeUndefined();
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면(다른 업체 · 지운 호실) failed 404, 수정 없음', async () => {
            repo.findRoom.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '호실을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 호실 조회 · 수정 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoom).not.toHaveBeenCalled();
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('다른 호실과 호실명이 겹치면(UK 변환 — repository 400) failed 400 validation_errors.room_name', async () => {
            repo.updateRoom.mockRejectedValueOnce(new BadRequestException({message: NAME_TAKEN, validation_errors: createValidationError('room_name', NAME_TAKEN)}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: NAME_TAKEN, validation_errors: [{property: 'room_name', message: NAME_TAKEN}]}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('층 201 → floor', async () => {
            await expect(validateBody(RoomUpdateDto, {room_name: '201호', floor: 201})).resolves.toEqual({
                message: '층은 -10 ~ 200 사이로 입력해주세요.',
                validation_errors: [{property: 'floor', message: '층은 -10 ~ 200 사이로 입력해주세요.'}],
            });
        });

        it('호실 ID 경로가 32자 hex 가 아니면 → room_id', async () => {
            await expect(validateBody(RoomUpdateParamDto, {room_id: 'xyz'})).resolves.toEqual({
                message: '호실 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_id', message: '호실 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

### 설정 · 문서

```sh
# .env.example — modified (AWS 절 다음에 새 절)

# ── 토스페이먼츠 (결제 확인 · 환불) ─────────
# 세팅 방법: docs/guides/toss-setup.md — 결제창 · 승인은 프론트(Next.js)가 하고, 서버는 토스 조회로 검증 · 환불만 한다
# 시크릿 키 — 개발은 테스트 키(test_sk_…), 운영은 라이브 키(live_sk_…). 비어 있으면 부팅은 되고 결제 확인 · 환불만 실패한다
TOSS_SECRET_KEY=
```

```yaml
# compose.admin-service.yml · compose.scheduler.yml · compose.gateway.yml — modified (각 "쓰지 않는 비밀값" 블록 끝에 한 줄)
            TOSS_SECRET_KEY: ''
```

````md
<!-- docs/guides/toss-setup.md — new -->
# 토스페이먼츠 세팅 가이드

> 결제창 · 승인은 프론트(Next.js), 서버(이 저장소)는 **토스에서 다시 읽어 검증**하고 **환불**한다. 개발은 테스트 키로 — 실제 돈이 나가지 않는다.

## 1. 역할

```
이용자 → (프론트) 결제창(클라이언트 키 test_ck_…) → 토스 인증
       → (프론트 서버) 승인 API POST /v1/payments/confirm(시크릿 키) → 결과 paymentKey · orderId · amount 를 서버로
       → (서버) GET /v1/payments/{paymentKey} 로 다시 읽어 대조(상태 DONE · 금액 · orderId = payment_id) → 기록
환불   → (서버) POST /v1/payments/{paymentKey}/cancel (Idempotency-Key cancel-<payment_id>)
```

- 주문번호(orderId)는 서버가 만든 결제 ID(`payment_id`, 32자)를 그대로 쓴다 — 결제 행을 먼저 만들고 그 ID · 금액 · 주문명을 프론트에 준다(Phase 17).
- 프론트가 넘긴 값만 믿지 않는다 — 금액 · 상태를 토스에서 다시 읽어 맞춰 본다.

## 2. 키 받기

1. 토스페이먼츠 개발자센터에 가입하고 로그인한다.
2. 내 개발 정보(API 키)에서 테스트 키를 확인한다 — 클라이언트 키 `test_ck_…`(프론트), 시크릿 키 `test_sk_…`(서버 · 프론트 서버).
3. 서버 `.env` 에 `TOSS_SECRET_KEY=test_sk_…` 를 넣는다. 프론트에도 같은 상점의 키를 쓴다.

- 시크릿 키는 서버에만 둔다(브라우저 · 저장소에 넣지 않는다). Basic 인증은 `키:` 를 base64 로 바꿔 쓴다(콜론 포함).
- `test_` 로 시작하는 키로 만든 결제는 `t_payment.environment = TEST` 로 남는다 — 통계 · 매출에서 뺀다.

## 3. 라이브로 바꾸기

- 전자결제 계약 · 심사가 끝나면 라이브 키(`live_sk_…` · `live_ck_…`)가 나온다. 서버 `.env` 의 `TOSS_SECRET_KEY` 만 바꾸면 된다 — 코드 · compose 는 그대로.

## 4. 실패와 재시도

| 토스 응답 | 서버가 돌려주는 것 |
|---|---|
| 카드 · 금액 · 이미 취소 · 취소 불가 금액 등 4xx | 400 — 토스 메시지 + `payment_error_code`(토스 code) · 재시도 없음 |
| 5xx · `PROVIDER_ERROR` · 409(처리 중) · 401(키 오류) · 네트워크 · 시간 초과(30초) | 503 `결제 서비스에 연결할 수 없습니다` · 큐가 최대 3번 재시도 |
| 조회 404 `NOT_FOUND_PAYMENT` | 결제 없음(null) |

- 환불은 멱등키 `cancel-<payment_id>` 로 보내 재시도해도 한 번만 취소된다(멱등키는 15일 유효).

## 5. 문제 해결

| 증상 | 확인 |
|---|---|
| 부팅 경고 `TOSS_SECRET_KEY 가 비어 있어` | `.env` 의 `TOSS_SECRET_KEY` |
| 로그 `토스 조회 일시 실패: 401 UNAUTHORIZED_KEY` | 시크릿 키가 틀렸거나 테스트 · 라이브가 섞였다(프론트와 같은 상점 · 같은 환경 키인지) |
| 조회가 결제 없음(null) | 프론트가 승인하지 않았거나 다른 상점 키로 승인했다 |
````

```md
<!-- README.md — modified -->
<!-- "외부 연동" 줄 -->
- **외부 연동** — 발송은 SMS 하나(Amazon SNS), 업체 정보 파일 · 객실 사진은 Amazon S3(…), 결제는 토스페이먼츠(결제창 · 승인은 프론트, 서버는 조회 검증 · 환불 — [docs/guides/toss-setup.md](docs/guides/toss-setup.md), 첫 사용은 예약 기능). mock 없이 실제 서비스에 붙는 코드다 …
<!-- 스택 줄 -->
스택: … Redis 8(node-redis) · AWS SDK v3(SNS · S3) · 토스페이먼츠(fetch) · Vitest · oxlint.
<!-- admin-service 설명 — 호실 -->
… 호실(그룹은 등록 때만 — 바꾸지 않는다) · 호실 상태 …
<!-- 실행 1. 준비 — AWS 줄 다음 -->
- 토스 시크릿 키(`TOSS_SECRET_KEY`)도 비워도 서버는 뜬다 — 결제 확인 · 환불만 실패한다. 테스트 키 받는 법은 [docs/guides/toss-setup.md](docs/guides/toss-setup.md).
<!-- 구조 블록 -->
libs/integration/src/{sms,storage,redis,door,payment}/   # SMS(SNS) · 파일 저장(S3) · Redis 연결 · 문 정보 · 결제(토스) 포트 · 어댑터
docs/  docs/guides/        # 규약 · AWS · Redis · 토스 세팅 가이드
```

```md
<!-- docs/data-layer.md — modified -->
<!-- 위치 트리 -->
│   ├── room/        …
│   ├── reservation/ reservation-state · reservation-detail-type(룩업) · reservation · reservation-detail
│   ├── payment/     payment-state(룩업) · payment
<!-- 엔티티 절 — 배타 제약 줄에 예약 추가 -->
- 배타 제약 `EXC_` — 기간 가격(`daterange`, 지워지지 않은 행) · 예약 점유(`tstzrange("start_at", "blocked_until", '[)')`, 활성 상태 결제 대기 · 확정 · 이용 중 — 끝과 시작이 맞닿는 것은 된다). `btree_gist` 확장(RoomSchema).
<!-- 새 소절 -->
- **예약 · 결제** — 예약 1건 = `t_reservation` 1행(최종 체크아웃 · 점유 끝 · 합계 · 기본 상품), 구간(기본 1 + 연장 n) = `t_reservation_detail`(구간마다 결제 `payment_id` FK · UK), 결제 시도 = `t_payment` 1행(`payment_id` = 토스 orderId). 셋 다 지우지 않는다(취소 · 만료는 상태 — `is_deleted` 없음). 상태 조합 규칙은 CHECK(취소 주체 · 사유, 결제 승인 · 환불 · 실패 불변식), 결제 `environment` 는 기본값 없음.
```

```md
<!-- docs/integration.md — modified -->
<!-- 머리 사용처에 결제 — 첫 사용 Phase 17 -->
<!-- 원칙 — 새 줄 -->
- **결제는 `PAYMENT_GATEWAY`(토스페이먼츠)** — 결제창 · 승인은 프론트(Next.js), 서버는 토스에서 다시 읽어 검증(`getPayment` · `findByPaymentId`)하고 환불(`cancel` — `Idempotency-Key: cancel-<payment_id>`)한다. 프론트가 넘긴 값만 믿지 않는다.
<!-- 구성 표 -->
| `integration.symbols.ts` | … · `PAYMENT_GATEWAY` |
| `interfaces/integration.interface.ts` | … · `PaymentGatewayInterface` · `PaymentEnvironment` · `PaymentLookupResult` · `PaymentCancelInput` · `PaymentCancelResult` |
| `integration.constants.ts` | … · `PAYMENT_UNAVAILABLE_MESSAGE` · `PAYMENT_FAILED_MESSAGE` · `TOSS_API_BASE_URL` · `PAYMENT_REQUEST_TIMEOUT_MS` |
| `integration.util.ts` | `toE164KrPhone` · `classifyTossFailure`(토스 실패 → 업무 · 일시 · 결제 없음) |
| `payment/toss-payment.gateway.ts` · `payment/payment.module.ts` | `TossPaymentGateway`(fetch — Basic 인증 · 30초 제한 · 조회 · 전액 취소) · `PaymentModule`(`@Global`, 앱 등록은 Phase 17) |
<!-- 설정 줄 — TOSS_SECRET_KEY 추가 -->
<!-- 실패 계약 — 새 줄 -->
- 결제는 둘로 나눈다 — 토스 업무 실패(4xx)는 `BadRequestException({message: 토스 메시지, payment_error_code: 토스 code})`(400 — 큐 재시도 없음), 일시 실패(5xx · `PROVIDER_ERROR` · 409 · 401 · 네트워크 · 시간 초과)는 `ServiceUnavailableException({message: PAYMENT_UNAVAILABLE_MESSAGE})`(503 — 재시도, 멱등키로 중복 없음). 조회의 결제 없음은 null.
```

```md
<!-- docs/architecture.md — modified (libs 표의 libs/integration 행) -->
… · `PAYMENT_GATEWAY`(토스페이먼츠 — 조회 검증 · 환불) · … `PaymentModule` … · [guides/toss-setup.md](guides/toss-setup.md) | … / 결제: 예약(Phase 17) |
```

```md
<!-- AGENTS.md — modified -->
<!-- Architecture 트리 libs/integration 줄 -->
├── integration/  # 외부 연동 포트 — SMS 발송(SMS_SENDER · Amazon SNS) · 파일 저장(STORAGE_GATEWAY · S3 + CloudFront) · 문 정보(DOOR_STORE · Redis) · 결제(PAYMENT_GATEWAY · 토스페이먼츠) · SmsModule · StorageModule · RedisModule · DoorStoreModule · PaymentModule(전역)
<!-- Key Patterns 전역 모듈 줄 — PaymentModule 추가 -->
<!-- Key Patterns 외부 연동 — 새 줄 -->
  - 결제는 `PAYMENT_GATEWAY`(토스페이먼츠) — 결제창 · 승인은 프론트(Next.js), 서버는 토스 조회로 검증(상태 · 금액 · orderId = `payment_id`) · 전액 취소(환불, `Idempotency-Key: cancel-<payment_id>`). 업무 실패 400(토스 메시지 + `payment_error_code`) · 일시 실패 503(재시도). 키 `TOSS_SECRET_KEY`(test_ → 결제 환경 TEST).
<!-- Data Layer 엔티티 줄 — 배타 제약 예에 예약 추가 -->
… `@Exclusion('EXC_<Model>_<내용>', 'USING gist (…)')`(범위 겹침 — `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange` · `EXC_Reservation_RoomIdBlockedRange`(`tstzrange` · 활성 상태만), `btree_gist` 확장 · 23P01) …
<!-- 위치 · 예 — 호실 수정 그룹 고정은 규약이 아니라 기능 규칙이라 AGENTS 에 두지 않는다 -->
```

```md
<!-- .beaver/output/spec/room/room-manage-spec.md — modified (호실 줄 2곳) -->
- **호실 (#54)** — 목록(층 · 그룹 필터) · 등록 · 수정(호실명 · 층 — 그룹은 등록 때만, 2026-11-02 Phase 16 에서 변경) · 삭제.
  - 수정: 호실명 · 층 통째로. 그룹은 바꾸지 않는다(잘못 등록하면 지우고 다시 — 사용자 결정 2026-11-02).
```

---

## Test Cases

```
[CASES:classifyTossFailure]   build 때 임시 스크립트(Node 타입 제거 실행 — 커밋 안 함)로 integration.util.ts 의 함수를 표 대조 (라이브러리라 spec 없음 — AGENTS)
  1  400 ALREADY_CANCELED_PAYMENT            → BUSINESS (취소 → 400)
  2  403 NOT_CANCELABLE_AMOUNT               → BUSINESS (400)
  3  404 NOT_FOUND_PAYMENT                    → NOT_FOUND (조회 → null)
  4  400 INVALID_REQUEST                      → BUSINESS (400)
  5  400 PROVIDER_ERROR                       → RETRY (503)
  6  409 IDEMPOTENT_REQUEST_PROCESSING        → RETRY (503)
  7  401 UNAUTHORIZED_KEY                     → RETRY (503 + 로그)
  8  500 FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING → RETRY (503)
  9  네트워크 오류 · 시간 초과                 → 어댑터 request 의 catch 가 503 (분류 함수 밖 — 코드 읽기로 확인)
  10 400 본문 JSON 아님(body null)            → BUSINESS, message null → 어댑터가 '결제를 처리하지 못했습니다.'
  11 404 NOT_FOUND_PAYMENT(취소)              → NOT_FOUND → 어댑터 toException 이 400
[SUCCESS]            room-update.spec — 호실명 · 층만 수정(그룹 조회 없음 · room_group_id 미설정) / 예전 클라이언트의 room_group_id 무시
[FAIL:service]       room-update.spec — 호실 없음 · 소속 업체 없음 404, 수정 없음
[FAIL:duplicate]     room-update.spec — 호실명 UK 400 validation_errors.room_name
[FAIL:validation]    room-update.spec — 층 201 · 호실 ID 형식
[SECURITY]           room-update.spec — actor 없음 401
PGlite(build 확인 · 커밋 안 함): ReservationSchema 적용 → 같은 호실 활성 예약 겹침 23P01 · 끝 = 시작 맞닿음 허용 · 다른 호실 허용 · 취소 · 만료 · 완료 예약과 겹침 허용 · CHK_Reservation_StartEndBlocked · CHK_Reservation_Cancel(취소인데 사유 없음 거부 · 취소 아닌데 취소 시각 거부) · CHK_ReservationDetail_State(CHECKED_IN 거부) · UK_ReservationDetail_PaymentId · CHK_Payment_*(environment 없음 · 잘못된 값 · DONE 인데 결제 키 없음 · REFUNDED 금액 불일치 · FAILED 사유 없음) · UK_Payment_PaymentKey(NULL 여러 개 허용) · down → 다시 up

테스트 생략(위임형): 엔티티 · 시드 · 마이그레이션(db:check + PGlite 로 확인), TossPaymentGateway · PaymentModule(어댑터 spec 없음 — docs/integration.md, 실제 토스 호출 금지 — 분류는 위 표, 요청 모양은 코드 읽기 · 사용자가 가이드로 테스트 키 확인)
[SMOKE:data-access]  해당 없음 — 이번에 데이터 접근 메서드가 없다(repository 는 Phase 17)
```

---

## Response Codes

| Code | Cause |
|------|------|
| done (호실 수정) | 호실명 · 층 수정 — data null(그룹은 그대로) |
| 400 (호실 수정) | DTO 검증 · 호실명 중복(UK) |
| 401 · 404 · 500 (호실 수정) | 그대로 — actor 없음 · 소속 업체 · 호실 없음 · DB 오류 |
| 포트 400 | 토스 업무 실패 — `{message: 토스 메시지 \| '결제를 처리하지 못했습니다.', payment_error_code: 토스 code \| null, validation_errors: null}`, 취소의 결제 없음 |
| 포트 503 | 키 없음 · 토스 5xx · `PROVIDER_ERROR` · 409 · 401 · 네트워크 · 30초 초과 — `결제 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.` |
| 포트 null | 조회(getPayment · findByPaymentId)의 결제 없음 |
| DB 23P01 · 23514 · 23505 (Phase 17 에서 변환) | 예약 점유 겹침(`EXC_Reservation_RoomIdBlockedRange`) · CHECK 위반 · 결제 키 · 구간 결제 중복 |
