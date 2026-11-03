# Plan — reservation-booking

## Feature Summary
- **Feature**: 예약·결제(Phase 17) — 호실별 예약 가능 시간 조회 · 예약 생성(결제 대기 5분) · 결제 확인 · 이용자 취소(업체별 환불 마감 · 마감 뒤 환불 비율) · 내 예약 목록 · 상세 · 업체 예약 현황 · 업체 취소 · 호실 이동, scheduler crontab 3개(결제 대기 만료 · 늦은 승인 재확인 · 환불), 업체 환불 규정(분 단위 · 비율) · 연박 최소 · 최대 박수, 점유 예약이 있는 호실 · 그룹 삭제 금지.
- **Entry point**: `GET /api/v1/user-service/reservation/availability` · `POST /api/v1/user-service/reservation` · `POST …/payment-confirm` · `PATCH …/:reservation_id/cancel` · `GET /api/v1/user-service/reservation` · `GET …/:reservation_id` · `GET …/store` · `PATCH …/:reservation_id/store-cancel` · `PATCH …/:reservation_id/room` + crontab `reservation-payment-expire` · `reservation-payment-recheck` · `reservation-refund`
- **Domain**: reservation (user-service 새 도메인 · scheduler 새 도메인) + store · room(admin-service 변경) (로드맵 Phase 17 — #67 ~ #73 · #113)
- **Spec**: [reservation-booking-spec.md](../../spec/reservation/reservation-booking-spec.md)

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/store/store.entity.ts` | modified — `refund_deadline_hours` → `refund_deadline_minutes`, `late_refund_percent` |
| `libs/database/src/entities/room/room-plan.entity.ts` | modified — `min_nights` · `max_nights` + `CHK_RoomPlan_LongNights`, 퇴실 시각 주석(1박은 항상 다음 날) |
| `libs/database/src/entities/reservation/reservation.entity.ts` | modified — `late_refund_percent` |
| `libs/database/src/entities/payment/payment.entity.ts` | modified — `CHK_Payment_Refunded` → `CHK_Payment_RefundedAmount`(부분 환불), 주석 |
| `libs/database/src/migrations/<ts>-ReservationBooking.ts` · `migrations.ts` | new · modified — `db:generate -- ReservationBooking` 후 손으로 고침(RENAME · 값 이관 · 기본값) |
| `libs/contracts/src/reservation/reservation.constants.ts` | new — 예약 · 결제 상태 · 구간 종류 · 취소 주체 · 결제 대기 · 재예약 제한 · 환불 사유 |
| `libs/contracts/src/reservation/reservation.commands.ts` | new — 명령 5개 · 내부 경로 |
| `libs/contracts/src/reservation/dto/reservation-availability.dto.ts` · `reservation.dto.ts` · `reservation-payment-confirm.dto.ts` · `reservation-cancel.dto.ts` · `reservation-list.dto.ts` · `reservation-detail.dto.ts` · `reservation-store.dto.ts` · `reservation-store-cancel.dto.ts` · `reservation-room-change.dto.ts` | new — DTO 9개 |
| `libs/contracts/src/store/dto/store-mine-reservation-policy.dto.ts` · `store-detail.dto.ts` · `store-mine.dto.ts` | modified — 환불 규정 필드 |
| `libs/contracts/src/room/dto/room-plan-update.dto.ts` · `room-plan-list.dto.ts` | modified — 연박 박수, 퇴실 시각 설명(1박은 항상 다음 날) |
| `libs/integration/src/interfaces/integration.interface.ts` · `integration.util.ts` · `integration.constants.ts` | modified — `PaymentCancelInput.amount`, `verifyPaymentLookup` · `PaymentLookupVerdict` |
| `libs/integration/src/payment/toss-payment.gateway.ts` · `payment.module.ts` | modified — 취소 금액(`cancelAmount`), 모듈 주석(사용처) |
| `apps/user-service/src/reservation/reservation.symbols.ts` · `reservation.constants.ts` · `reservation.util.ts` | new — 토큰 · 도메인 상수 · 메시지 · 재고 판정 · 요금 · 환불액 · 결과 변환 |
| `apps/user-service/src/reservation/interfaces/reservation.repository.interface.ts` · `repositories/reservation.repository.ts` | new — repository 포트 · 어댑터 |
| `apps/user-service/src/reservation/reservation.service.ts` | new — public 9개 |
| `apps/user-service/src/reservation/controllers/reservation.controller.ts` · `reservation.controller.queue.ts` · `reservation.module.ts` | new — 내부 HTTP 4 · 큐 5 |
| `apps/user-service/src/user-service.module.ts` | modified — `PaymentModule` · `ReservationModule` |
| `apps/gateway/src/api/v1/user-service/reservation/reservation.module.ts` · `controllers/reservation.controller.ts` · `controllers/reservation.controller.queue.ts` | new — 공개 라우트 9개 |
| `apps/gateway/src/gateway.module.ts` | modified — `ReservationModule` |
| `apps/scheduler/src/reservation/reservation.symbols.ts` · `reservation.util.ts` · `interfaces/reservation.repository.interface.ts` · `repositories/reservation.repository.ts` · `reservation.module.ts` | new — scheduler 예약 도메인 |
| `apps/scheduler/src/reservation/crontabs/reservation-payment-expire.crontab.ts` · `reservation-payment-recheck.crontab.ts` · `reservation-refund.crontab.ts` | new — crontab 3개 |
| `apps/scheduler/src/scheduler.module.ts` | modified — `PaymentModule` · `ReservationModule` |
| `apps/admin-service/src/store/store.constants.ts` · `store.service.ts` · `store.util.ts` | modified — 환불 규정 기본값 · 승인 · 설정 · 응답, 연박 박수 기본값 |
| `apps/admin-service/src/room/room.constants.ts` · `room.service.ts` · `room.util.ts` · `interfaces/room.repository.interface.ts` · `repositories/room.repository.ts` | modified — 연박 박수, 점유 예약 확인 |
| `apps/user-service/src/reservation/test/reservation.test-helper.ts` + spec 10개(`reservation-availability` · `reservation-create` · `reservation-payment-confirm` · `reservation-cancel` · `reservation-list` · `reservation-detail` · `reservation-store` · `reservation-store-cancel` · `reservation-room-change` · `reservation.repository`) | new |
| `apps/scheduler/src/reservation/test/reservation.repository.spec.ts` | new |
| `apps/admin-service/src/store/test/*` (`store-mine-reservation-policy` · `store-application-approve` · `store-detail` · `store-mine` · `store.test-helper`) · `apps/admin-service/src/room/test/*` (`room-plan-update` · `room-plan-list` · `room-delete` · `room-group-delete` · `room.repository` · `room.test-helper`) | modified |
| `compose.scheduler.yml` | modified — `TOSS_SECRET_KEY` 를 덮지 않고 전달 |
| `.env.example` | modified — 토스 절 주석(user-service · scheduler) |
| `docs/guides/toss-setup.md` · `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/data-layer.md` · `docs/integration.md` · `docs/messaging.md` | modified |
| `.beaver/output/spec/room/room-manage-spec.md` · `.beaver/output/spec/store/*`(예약 · 환불 규정 줄) | modified — 변경 줄(2026-11-03) |

삭제할 코드: `STORE_REFUND_DEADLINE_HOURS_DEFAULT`(→ `_MINUTES_`), `refund_deadline_hours` 필드 전부(엔티티 · DTO 3개 · util 2곳 · service 2곳 · spec 픽스처), room.service 의 "미래 예약 확인은 Phase 17" 주석 2곳, payment.entity 의 "환불은 100% 만" 주석, compose.scheduler 의 `TOSS_SECRET_KEY: ''`.

---

## Design
### Data — 스키마 변경 (`libs/database`)

형제: 이름 바꾸기는 손으로 쓴 RENAME 마이그레이션(libs/database/src/migrations/1792477492198-RenameColumns.ts), 종류별 컬럼 조합 CHECK 는 `CHK_RoomPlan_UsageHoursCheckInOutTime`(room-plan.entity.ts:13-16), 식을 바꾼 CHECK 는 이름도 바꾼다(AGENTS Data Layer).

```ts
// libs/database/src/entities/store/store.entity.ts — modified (refund_deadline_hours 컬럼 블록을 바꾸고 late_refund_percent 를 더한다)
    @Column({
        name: 'refund_deadline_minutes',
        type: 'smallint',
        nullable: false,
        default: 60,
        comment: '100% 환불 마감(분) — 이용 시작 n분 전까지 취소하면 100% 환불(0 ~ 10,080). 예약할 때 마감 시각을 예약에 저장한다',
    })
    refund_deadline_minutes: number;

    @Column({
        name: 'late_refund_percent',
        type: 'smallint',
        nullable: false,
        default: 50,
        comment: '마감 뒤 환불 비율(%) — 환불 마감 뒤 ~ 이용 시작 전 취소의 환불 비율(0 ~ 100, 원 단위 내림 — 0 이면 환불 없이 취소). 예약할 때 값을 예약에 저장한다',
    })
    late_refund_percent: number;
```

```ts
// libs/database/src/entities/room/room-plan.entity.ts — modified (클래스 주석 · CHECK 추가 · 컬럼 2개 — check_out_time 다음)
/**
 * 업체 상품 설정 — 업체 × 상품 종류(t_room_plan_type)마다 반드시 1행(입점 승인 때 3행). 업체의 모든 객실 공통이고, 행은 지우지 않는다.
 * 사용 여부(is_used — 판매 여부) · 예약 가능 요일(입실일 기준 비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127)은 모든 종류에,
 * 이용 시간은 시간 이용(HOURLY)만, 입실 · 퇴실 시각(한국 시각, 분 단위)은 1박(NIGHT) · 연박(LONG)만, 최소 · 최대 박수는 연박만 둔다.
 * 1박은 항상 다음 날 퇴실이고(퇴실 시각이 입실보다 늦어도 — 사용자 결정 2026-11-03), 연박은 첫날 입실 · 마지막 날 퇴실이다. 가격 · 그룹별 사용 여부는 그룹 상품(t_room_group_plan).
 */
@Entity({name: 't_room_plan', comment: '업체 상품 설정'})
@Unique('UK_RoomPlan_StoreIdRoomPlanTypeId', ['store_id', 'room_plan_type_id'])
@Check(
    'CHK_RoomPlan_UsageHoursCheckInOutTime',
    `("room_plan_type_id" = 'HOURLY' AND "usage_hours" IS NOT NULL AND "check_in_time" IS NULL AND "check_out_time" IS NULL) OR ("room_plan_type_id" <> 'HOURLY' AND "usage_hours" IS NULL AND "check_in_time" IS NOT NULL AND "check_out_time" IS NOT NULL)`,
)
@Check(
    'CHK_RoomPlan_LongNights',
    `("room_plan_type_id" = 'LONG' AND "min_nights" IS NOT NULL AND "max_nights" IS NOT NULL AND "min_nights" >= 1 AND "min_nights" <= "max_nights") OR ("room_plan_type_id" <> 'LONG' AND "min_nights" IS NULL AND "max_nights" IS NULL)`,
)
export class RoomPlanEntity {
    // … 기존 컬럼 그대로(check_out_time 은 주석만 바꾼다) …

    @Column({
        name: 'check_out_time',
        type: 'time',
        nullable: true,
        comment: '퇴실 시각(한국 시각, 분 단위) — 1박(항상 다음 날) · 연박(마지막 날)만, check_in_time 과 세트. 시간 이용은 NULL',
    })
    check_out_time: string | null;

    @Column({name: 'min_nights', type: 'smallint', nullable: true, comment: '최소 박수 — 연박(LONG)만(1 ~ 180, 최대 박수 이하). 시간 이용 · 1박은 NULL'})
    min_nights: number | null;

    @Column({name: 'max_nights', type: 'smallint', nullable: true, comment: '최대 박수 — 연박(LONG)만(1 ~ 180). 시간 이용 · 1박은 NULL'})
    max_nights: number | null;
```

```ts
// libs/database/src/entities/reservation/reservation.entity.ts — modified (refund_deadline_at 다음에 컬럼 1개, 클래스 주석 한 줄)
 * 환불 마감(refund_deadline_at) · 마감 뒤 환불 비율(late_refund_percent)은 예약 때 업체 값 — 업체가 규정을 바꿔도 이 예약은 그대로다.

    @Column({name: 'late_refund_percent', type: 'smallint', nullable: false, comment: '마감 뒤 환불 비율(%) — 예약 때 업체 값, 환불 마감 뒤 ~ 이용 시작 전 취소에 쓴다(0 ~ 100)'})
    late_refund_percent: number;
```

```ts
// libs/database/src/entities/payment/payment.entity.ts — modified (클래스 주석 2줄 · CHECK 이름과 식 · refund_amount 주석)
 * refund_amount 는 환불이 없으면 null 이다(0 원 환불과 구분). 환불은 전액 또는 일부(마감 뒤 비율 환불)다.
 * 불변식(CHECK): DONE · 환불 3종 ⟹ payment_key · approved_at 있음 / REFUNDED ⟹ 0 < refund_amount ≤ amount · refunded_at 있음 / FAILED · REFUND_FAILED ⟹ failure_message 있음.

@Check('CHK_Payment_RefundedAmount', `"payment_state_id" <> 'REFUNDED' OR ("refund_amount" > 0 AND "refund_amount" <= "amount" AND "refunded_at" IS NOT NULL)`)

    @Column({name: 'refund_amount', type: 'integer', nullable: true, comment: '환불 금액(원 — 전액 또는 일부, 환불이 없으면 null)'})
    refund_amount: number | null;
```

```ts
// libs/database/src/entities/payment/payment-state.entity.ts · seeder.targets.ts PAYMENT_STATE_SEED_DATA 주석 — modified (한 줄)
 * REFUND_REQUESTED 환불 신청 · REFUNDED 환불 완료 · REFUND_FAILED 환불 실패). 환불 금액은 전액 또는 일부(t_payment.refund_amount)라 부분 환불 상태를 따로 두지 않는다.
```

마이그레이션 — `npm run db:generate -- ReservationBooking` 으로 만든 뒤 아래처럼 손으로 고친다(생성기는 이름 바꾸기를 DROP + ADD 로 만들어 업체 환불 기준이 사라지고, 기존 연박 행 · 예약 행이 새 NOT NULL · CHECK 에 걸린다). 고친 뒤 `npm run db:check` 가 일치해야 한다.

```ts
// libs/database/src/migrations/<ts>-ReservationBooking.ts — new (생성 후 손으로 고친 최종 모양)
import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 예약·결제(로드맵 Phase 17) — 업체 환불 규정 · 연박 박수 · 예약의 환불 비율 · 부분 환불.
 * - t_store.refund_deadline_hours → refund_deadline_minutes(이름 바꾸고 기존 값 × 60, 기본 60) · late_refund_percent(기본 50) 추가
 * - t_room_plan.min_nights · max_nights 추가 — 기존 연박 행은 1 · 30 으로 채운 뒤 CHK_RoomPlan_LongNights, check_out_time 주석(1박은 항상 다음 날 퇴실)
 * - t_reservation.late_refund_percent 추가(기존 행은 50 — 기본값은 남기지 않는다)
 * - t_payment CHK_Payment_Refunded(refund_amount = amount) → CHK_Payment_RefundedAmount(0 < refund_amount ≤ amount)
 * npm run db:generate 로 만든 뒤 이름 바꾸기 · 값 채우기를 손으로 고쳤다(생성기는 DROP + ADD 를 만든다).
 */
export class ReservationBooking<ts> implements MigrationInterface {
    name = 'ReservationBooking<ts>';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        // t_store — 환불 마감을 분으로(데이터 유지) + 마감 뒤 환불 비율
        await queryRunner.query(`ALTER TABLE "t_store" RENAME COLUMN "refund_deadline_hours" TO "refund_deadline_minutes"`);
        await queryRunner.query(`UPDATE "t_store" SET "refund_deadline_minutes" = "refund_deadline_minutes" * 60`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "refund_deadline_minutes" SET DEFAULT '60'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."refund_deadline_minutes" IS '100% 환불 마감(분) — 이용 시작 n분 전까지 취소하면 100% 환불(0 ~ 10,080). 예약할 때 마감 시각을 예약에 저장한다'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "late_refund_percent" smallint NOT NULL DEFAULT '50'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."late_refund_percent" IS '마감 뒤 환불 비율(%) — 환불 마감 뒤 ~ 이용 시작 전 취소의 환불 비율(0 ~ 100, 원 단위 내림 — 0 이면 환불 없이 취소). 예약할 때 값을 예약에 저장한다'`);
        // t_room_plan — 연박 박수(기존 연박 행은 기본값으로 채운 뒤 CHECK)
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD "min_nights" smallint`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."min_nights" IS '최소 박수 — 연박(LONG)만(1 ~ 180, 최대 박수 이하). 시간 이용 · 1박은 NULL'`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD "max_nights" smallint`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."max_nights" IS '최대 박수 — 연박(LONG)만(1 ~ 180). 시간 이용 · 1박은 NULL'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."check_out_time" IS '퇴실 시각(한국 시각, 분 단위) — 1박(항상 다음 날) · 연박(마지막 날)만, check_in_time 과 세트. 시간 이용은 NULL'`);
        await queryRunner.query(`UPDATE "t_room_plan" SET "min_nights" = 1, "max_nights" = 30 WHERE "room_plan_type_id" = 'LONG'`);
        await queryRunner.query(
            `ALTER TABLE "t_room_plan" ADD CONSTRAINT "CHK_RoomPlan_LongNights" CHECK (("room_plan_type_id" = 'LONG' AND "min_nights" IS NOT NULL AND "max_nights" IS NOT NULL AND "min_nights" >= 1 AND "min_nights" <= "max_nights") OR ("room_plan_type_id" <> 'LONG' AND "min_nights" IS NULL AND "max_nights" IS NULL))`,
        );
        // t_reservation — 예약 때 마감 뒤 환불 비율(기존 행은 50, 기본값은 남기지 않는다)
        await queryRunner.query(`ALTER TABLE "t_reservation" ADD "late_refund_percent" smallint NOT NULL DEFAULT '50'`);
        await queryRunner.query(`ALTER TABLE "t_reservation" ALTER COLUMN "late_refund_percent" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_reservation"."late_refund_percent" IS '마감 뒤 환불 비율(%) — 예약 때 업체 값, 환불 마감 뒤 ~ 이용 시작 전 취소에 쓴다(0 ~ 100)'`);
        // t_payment — 부분 환불
        await queryRunner.query(`ALTER TABLE "t_payment" DROP CONSTRAINT "CHK_Payment_Refunded"`);
        await queryRunner.query(`ALTER TABLE "t_payment" ADD CONSTRAINT "CHK_Payment_RefundedAmount" CHECK ("payment_state_id" <> 'REFUNDED' OR ("refund_amount" > 0 AND "refund_amount" <= "amount" AND "refunded_at" IS NOT NULL))`);
        await queryRunner.query(`COMMENT ON COLUMN "t_payment"."refund_amount" IS '환불 금액(원 — 전액 또는 일부, 환불이 없으면 null)'`);
    }

    /**
     * 되돌리기 — 역순. 환불 마감은 시간으로(올림, 최대 168), 부분 환불 행이 있으면 예전 CHECK 를 다시 걸 수 없어 실패한다.
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`COMMENT ON COLUMN "t_payment"."refund_amount" IS '환불 금액(원 — 환불이 없으면 null)'`);
        await queryRunner.query(`ALTER TABLE "t_payment" DROP CONSTRAINT "CHK_Payment_RefundedAmount"`);
        await queryRunner.query(`ALTER TABLE "t_payment" ADD CONSTRAINT "CHK_Payment_Refunded" CHECK ("payment_state_id" <> 'REFUNDED' OR ("refund_amount" = "amount" AND "refunded_at" IS NOT NULL))`);
        await queryRunner.query(`ALTER TABLE "t_reservation" DROP COLUMN "late_refund_percent"`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP CONSTRAINT "CHK_RoomPlan_LongNights"`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP COLUMN "max_nights"`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" DROP COLUMN "min_nights"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_room_plan"."check_out_time" IS '퇴실 시각(한국 시각, 분 단위) — 1박(입실보다 이르면 다음 날) · 연박(마지막 날)만, check_in_time 과 세트. 시간 이용은 NULL'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "late_refund_percent"`);
        await queryRunner.query(`UPDATE "t_store" SET "refund_deadline_minutes" = LEAST(CEIL("refund_deadline_minutes" / 60.0), 168)`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "refund_deadline_minutes" SET DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "t_store" RENAME COLUMN "refund_deadline_minutes" TO "refund_deadline_hours"`);
        await queryRunner.query(
            `COMMENT ON COLUMN "t_store"."refund_deadline_hours" IS '100% 환불 기준(시간) — 이용 시작 n시간 전까지 환불 신청을 받아 100% 환불, 이후 환불 신청 불가(0 ~ 168). 예약할 때 값을 예약에 저장한다'`,
        );
    }
}
```

- 생성된 SQL 의 정확한 따옴표 · 기본값 표기(`DEFAULT '60'` 등)와 COMMENT 문구는 생성기 출력에 맞춘다(엔티티 주석과 한 글자라도 다르면 `db:check` 가 실패한다). 생성기가 컬럼 순서를 다르게 내도 결과 스키마만 같으면 된다.
- `<ts>` 는 생성된 타임스탬프. `migrations.ts` 등록은 생성기가 한다(한 줄에 하나씩).
### Contracts — 상수 · 명령 · DTO (`libs/contracts/src/reservation/`)

형제: 명령 · 경로 상수 room.commands.ts(경로 함수 — `encodeURIComponent`), 도메인 공통 값 roles.ts(`AUTH_ID` · `LOGIN_SCOPE`), Query DTO 생성자 room-list.dto.ts(`data?: Partial<T>`), path param DTO room-update.dto.ts(`RoomUpdateParamDto`).

```ts
// libs/contracts/src/reservation/reservation.constants.ts — new
/**
 * 예약 · 결제 공통 값 — user-service(예약) · scheduler(만료 · 환불 crontab) · admin-service(호실 삭제 확인)가 함께 쓰고 API 응답 값이기도 하다.
 * 값은 룩업 시드(libs/database/src/seeder/seeder.targets.ts)와 같다.
 */

/** 예약 상태(t_reservation_state) — 예약 · 구간 */
export const RESERVATION_STATE = {PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', CHECKED_IN: 'CHECKED_IN', COMPLETED: 'COMPLETED', CANCELED: 'CANCELED', EXPIRED: 'EXPIRED'} as const;

/** 호실을 점유하는 예약 상태 — 배타 제약 EXC_Reservation_RoomIdBlockedRange 의 WHERE 와 같다 */
export const RESERVATION_OCCUPYING_STATES: string[] = [RESERVATION_STATE.PENDING, RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN];

/** 예약 구간 종류(t_reservation_detail_type) */
export const RESERVATION_DETAIL_TYPE = {BASE: 'BASE', EXTENSION: 'EXTENSION'} as const;

/** 결제 상태(t_payment_state) */
export const PAYMENT_STATE = {READY: 'READY', DONE: 'DONE', FAILED: 'FAILED', EXPIRED: 'EXPIRED', REFUND_REQUESTED: 'REFUND_REQUESTED', REFUNDED: 'REFUNDED', REFUND_FAILED: 'REFUND_FAILED'} as const;

/** 취소 주체 — USER: 이용자, STORE: 업체 (CHK_Reservation_Cancel) */
export const RESERVATION_CANCEL_ACTOR = {USER: 'USER', STORE: 'STORE'} as const;

/** 결제 대기 유지 시간(분) — 예약 생성 뒤 이 시간 안에 결제가 확인되지 않으면 만료(사용자 결정 2026-11-03) */
export const RESERVATION_PAYMENT_PENDING_MINUTES = 5;

/** 결제 대기 만료 뒤 같은 이용자가 같은 호실을 다시 예약할 수 없는 시간(분) — 만료 시각(expires_at)부터 */
export const RESERVATION_REBOOK_BLOCK_MINUTES = 10;

/** 토스 환불 사유(cancelReason — 200자) — t_payment.refund_reason */
export const RESERVATION_REFUND_REASON = {USER: '이용자 예약 취소', STORE: '업체 예약 취소', AMOUNT_MISMATCH: '결제 금액 불일치', LATE_PAYMENT: '결제 대기 시간 경과'} as const;
```

```ts
// libs/contracts/src/reservation/reservation.commands.ts — new
/** reservation 내부 HTTP 경로 접두 */
const RESERVATION_INTERNAL_BASE = '/internal/v1/user-service/reservation';

/**
 * reservation 도메인 RabbitMQ 명령 종류 (= 라우팅 키, user-service 의 q.user.cmd 가 `user.#` 로 받는다).
 * 예약 생성 · 결제 확인 · 취소는 이용자, 업체 취소 · 호실 이동은 매니저(업체 총관리자 · 업체 관리자 — 내 업체 예약만)다. 조회는 내부 HTTP 동기 경로다.
 */
export const RESERVATION_COMMAND = {
    /** 예약 생성 — 결제 대기 5분 (이용자) */
    CREATE: 'user.reservation.create',
    /** 결제 확인 — 토스 승인 결과를 토스 조회로 대조해 확정 (이용자) */
    PAYMENT_CONFIRM: 'user.reservation.payment-confirm',
    /** 이용자 취소 — 환불 규정대로 (이용자) */
    CANCEL: 'user.reservation.cancel',
    /** 업체 취소 — 100% 환불 + 이용자 SMS (매니저) */
    STORE_CANCEL: 'user.reservation.store-cancel',
    /** 호실 이동 — 같은 그룹 + 이용자 SMS (매니저) */
    ROOM_CHANGE: 'user.reservation.room-change',
} as const;

/**
 * reservation 도메인 내부 HTTP 경로 (게이트웨이 → user-service). 파라미터가 있는 경로는 함수로 만든다.
 */
export const RESERVATION_INTERNAL_PATH = {
    /** 호실별 예약 가능 시간 (GET, 인증 없음) */
    AVAILABILITY: `${RESERVATION_INTERNAL_BASE}/availability`,
    /** 내 예약 목록 (GET, 이용자) */
    LIST: RESERVATION_INTERNAL_BASE,
    /** 내 업체 예약 현황 (GET, 매니저) */
    STORE: `${RESERVATION_INTERNAL_BASE}/store`,
    /** 내 예약 상세 (GET, 이용자) */
    detail: (reservation_id: string) => `${RESERVATION_INTERNAL_BASE}/${encodeURIComponent(reservation_id)}`,
} as const;
```

```ts
// libs/contracts/src/reservation/dto/reservation-availability.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches, ValidateIf} from 'class-validator';

/**
 * 호실별 예약 가능 시간 query — 업체 · 날짜(한국 날짜) · 상품. 연박은 박수가 필수다. 쿼리 값은 문자열이다.
 */
export class ReservationAvailabilityDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;

    @ApiProperty({description: '날짜 (YYYY-MM-DD, 한국 날짜 — 시간 이용은 시작일, 1박 · 연박은 입실일)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    @ApiProperty({description: '상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    @ApiProperty({description: '박수 — 연박(LONG)이면 필수(업체 설정 최소 ~ 최대 박수), 그 밖은 무시', required: false})
    @ValidateIf((dto: ReservationAvailabilityDto) => dto.room_plan_type_id === 'LONG')
    @Matches(/^\d{1,3}$/, {message: '박수를 숫자로 입력해주세요.'})
    @IsNotEmpty({message: '연박은 박수를 입력해주세요.'})
    nights: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 값은 빈 문자열(검증에서 걸린다), 박수는 null
     */
    constructor(data?: Partial<ReservationAvailabilityDto>) {
        this.store_id = data?.store_id ?? '';
        this.date = data?.date ?? '';
        this.room_plan_type_id = data?.room_plan_type_id ?? '';
        this.nights = data?.nights ?? null;
    }
}

/**
 * 예약 가능 구간 1개
 */
export class ReservationAvailabilitySlotResultDto {
    @ApiProperty({description: '시작(입실) 일시 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '끝(퇴실) 일시 (ISO 8601)'})
    end_at: string;
}

/**
 * 호실 1개 — 이 상품을 파는 호실(그룹 상품 판매 · 요금 > 0)만 나온다. 예약할 수 있는 구간이 없으면 slots 가 빈 배열이다
 */
export class ReservationAvailabilityRoomResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '층 (지하는 음수)'})
    floor: number;

    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '금액(원) — 시간 이용 1회 · 1박 · 연박 박수 합계(기간 가격 반영)'})
    price: number;

    @ApiProperty({description: '예약 가능 구간 (시작 순 — 시간 이용은 30분 단위)', type: () => [ReservationAvailabilitySlotResultDto]})
    slots: ReservationAvailabilitySlotResultDto[];
}

/**
 * 호실별 예약 가능 시간
 */
export class ReservationAvailabilityResultDto {
    @ApiProperty({description: '상품 종류'})
    room_plan_type_id: string;

    @ApiProperty({description: '날짜 (YYYY-MM-DD)'})
    date: string;

    @ApiProperty({description: '박수 — 연박만, 그 밖은 null', nullable: true, type: Number})
    nights: number | null;

    @ApiProperty({description: '호실 목록 (층 · 호실명 순)', type: () => [ReservationAvailabilityRoomResultDto]})
    list: ReservationAvailabilityRoomResultDto[];
}
```

```ts
// libs/contracts/src/reservation/dto/reservation.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, Matches, Max, Min, ValidateIf} from 'class-validator';

/**
 * 예약 생성 — 호실 · 상품 · 날짜(한국 날짜). 시간 이용은 시작 시각(30분 단위), 연박은 박수가 필수다. 금액은 서버가 계산한다
 */
export class ReservationDto {
    @ApiProperty({description: '호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;

    @ApiProperty({description: '상품 종류 (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    @ApiProperty({description: '날짜 (YYYY-MM-DD, 한국 날짜 — 시간 이용은 시작일, 1박 · 연박은 입실일)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    @ApiProperty({description: '시작 시각 (HH:mm — 00분 · 30분, 한국 시각) — 시간 이용이면 필수, 그 밖은 무시', required: false})
    @ValidateIf((dto: ReservationDto) => dto.room_plan_type_id === 'HOURLY')
    @Matches(/^([01]\d|2[0-3]):(00|30)$/, {message: '시작 시각을 30분 단위 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '시간 이용은 시작 시각을 입력해주세요.'})
    start_time?: string;

    @ApiProperty({description: '박수 (1 ~ 180 — 업체 설정 최소 ~ 최대 박수) — 연박이면 필수, 그 밖은 무시', required: false})
    @ValidateIf((dto: ReservationDto) => dto.room_plan_type_id === 'LONG')
    @IsInt({message: '박수는 정수로 입력해주세요.'})
    @Min(1, {message: '박수는 1 ~ 180박 사이로 입력해주세요.'})
    @Max(180, {message: '박수는 1 ~ 180박 사이로 입력해주세요.'})
    @IsNotEmpty({message: '연박은 박수를 입력해주세요.'})
    nights?: number;
}

/**
 * 예약 생성 결과 — 프론트는 payment_id 를 토스 orderId, amount · order_name 으로 결제창을 연다(결제 대기 만료 전까지)
 */
export class ReservationResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '결제 ID — 토스 orderId'})
    payment_id: string;

    @ApiProperty({description: '주문명 — 토스 orderName'})
    order_name: string;

    @ApiProperty({description: '결제 금액(원) — 토스 amount'})
    amount: number;

    @ApiProperty({description: '결제 대기 만료 일시 (ISO 8601 — 이때까지 결제가 확인되지 않으면 만료)'})
    expires_at: string;

    @ApiProperty({description: '입실 일시 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '퇴실 일시 (ISO 8601)'})
    end_at: string;
}
```

```ts
// libs/contracts/src/reservation/dto/reservation-payment-confirm.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 결제 확인 — 프론트가 토스 승인 뒤 받은 결제 키와 우리 결제 ID(토스 orderId). 금액은 서버가 토스에서 다시 읽어 대조한다(프론트 값은 믿지 않는다)
 */
export class ReservationPaymentConfirmDto {
    @ApiProperty({description: '결제 ID (토스 orderId)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '결제 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '결제 ID를 입력해주세요.'})
    payment_id: string;

    @ApiProperty({description: '토스 결제 키 (paymentKey, 200자)'})
    @MaxLength(200, {message: '결제 키는 200자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '결제 키를 입력해주세요.'})
    payment_key: string;
}

/**
 * 결제 확인 결과
 */
export class ReservationPaymentConfirmResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '예약 상태 (CONFIRMED: 예약 확정 — 같은 결제를 다시 확인하면 지금 상태)'})
    reservation_state_id: string;
}
```

```ts
// libs/contracts/src/reservation/dto/reservation-cancel.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 이용자 취소 path param
 */
export class ReservationCancelParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 이용자 취소 — 사유 메모 필수. 환불 마감 전 100%, 마감 뒤 ~ 이용 시작 전은 예약 때 업체 비율, 시작 뒤에는 취소할 수 없다
 */
export class ReservationCancelDto {
    @ApiProperty({description: '취소 사유 (255자)'})
    @MaxLength(255, {message: '취소 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '취소 사유를 입력해주세요.'})
    cancel_reason: string;
}

/**
 * 이용자 취소 결과
 */
export class ReservationCancelResultDto {
    @ApiProperty({description: '환불 금액(원) — 백그라운드에서 토스로 환불한다. 0 은 환불 없이 취소, 결제 대기 예약 취소는 null', nullable: true, type: Number})
    refund_amount: number | null;
}
```

```ts
// libs/contracts/src/reservation/dto/reservation-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 내 예약 목록 query — 페이지만. 결제 대기 만료 건은 나오지 않는다, 입실 일시 최근순
 */
export class ReservationListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<ReservationListDto>) {
        super(data);
    }
}

/**
 * 내 예약 목록 항목
 */
export class ReservationListItemResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '상품 종류 (HOURLY · NIGHT · LONG)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '예약 상태 (PENDING: 결제 대기, CONFIRMED: 예약 확정, CHECKED_IN: 이용 중, COMPLETED: 이용 완료, CANCELED: 취소)'})
    reservation_state_id: string;

    @ApiProperty({description: '예약 상태명'})
    reservation_state_name: string;

    @ApiProperty({description: '입실 일시 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '퇴실 일시 (ISO 8601)'})
    end_at: string;

    @ApiProperty({description: '합계 금액(원)'})
    total_price: number;

    @ApiProperty({description: '100% 환불 마감 일시 (ISO 8601)'})
    refund_deadline_at: string;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 내 예약 목록
 */
export class ReservationListResultDto {
    @ApiProperty({description: '목록 (입실 일시 최근순)', type: () => [ReservationListItemResultDto]})
    list: ReservationListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```ts
// libs/contracts/src/reservation/dto/reservation-detail.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 예약 상세 path param
 */
export class ReservationDetailParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 구간의 결제
 */
export class ReservationPaymentResultDto {
    @ApiProperty({description: '결제 ID (토스 orderId)'})
    payment_id: string;

    @ApiProperty({description: '결제 상태 (READY · DONE · FAILED · EXPIRED · REFUND_REQUESTED · REFUNDED · REFUND_FAILED)'})
    payment_state_id: string;

    @ApiProperty({description: '결제 상태명'})
    payment_state_name: string;

    @ApiProperty({description: '결제 금액(원)'})
    amount: number;

    @ApiProperty({description: '결제 수단 — 승인 전이면 null', nullable: true, type: String})
    method: string | null;

    @ApiProperty({description: '승인 일시 (ISO 8601) — 승인 전이면 null', nullable: true, type: String})
    approved_at: string | null;

    @ApiProperty({description: '영수증 주소 — 없으면 null', nullable: true, type: String})
    receipt_url: string | null;

    @ApiProperty({description: '환불 금액(원) — 환불이 없으면 null', nullable: true, type: Number})
    refund_amount: number | null;

    @ApiProperty({description: '환불 완료 일시 (ISO 8601) — 없으면 null', nullable: true, type: String})
    refunded_at: string | null;
}

/**
 * 예약 구간 1개 — 기본 1 + 연장 n
 */
export class ReservationSegmentResultDto {
    @ApiProperty({description: '구간 ID'})
    reservation_detail_id: string;

    @ApiProperty({description: '구간 종류 (BASE: 기본, EXTENSION: 연장)'})
    reservation_detail_type_id: string;

    @ApiProperty({description: '구간 종류명'})
    reservation_detail_type_name: string;

    @ApiProperty({description: '구간 상태 (PENDING · CONFIRMED · CANCELED · EXPIRED)'})
    reservation_state_id: string;

    @ApiProperty({description: '구간 시작 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '구간 끝 (ISO 8601)'})
    end_at: string;

    @ApiProperty({description: '구간 금액(원)'})
    price: number;

    @ApiProperty({description: '결제 대기 만료 일시 (ISO 8601) — 없으면 null', nullable: true, type: String})
    expires_at: string | null;

    @ApiProperty({description: '결제', type: () => ReservationPaymentResultDto})
    payment: ReservationPaymentResultDto;
}

/**
 * 내 예약 상세 — 결제 대기 만료 건은 404
 */
export class ReservationDetailResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '상품 종류 (HOURLY · NIGHT · LONG)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '예약 상태'})
    reservation_state_id: string;

    @ApiProperty({description: '예약 상태명'})
    reservation_state_name: string;

    @ApiProperty({description: '입실 일시 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '퇴실 일시 (ISO 8601)'})
    end_at: string;

    @ApiProperty({description: '합계 금액(원)'})
    total_price: number;

    @ApiProperty({description: '100% 환불 마감 일시 (ISO 8601)'})
    refund_deadline_at: string;

    @ApiProperty({description: '마감 뒤 환불 비율(%)'})
    late_refund_percent: number;

    @ApiProperty({description: '취소 일시 (ISO 8601) — 취소가 아니면 null', nullable: true, type: String})
    canceled_at: string | null;

    @ApiProperty({description: '취소 주체 (USER: 이용자, STORE: 업체) — 취소가 아니면 null', nullable: true, type: String})
    cancel_actor: string | null;

    @ApiProperty({description: '취소 사유 — 취소가 아니면 null', nullable: true, type: String})
    cancel_reason: string | null;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '구간 (시작 순)', type: () => [ReservationSegmentResultDto]})
    segments: ReservationSegmentResultDto[];
}
```

```ts
// libs/contracts/src/reservation/dto/reservation-store.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 예약 현황 query — 날짜(한국 날짜) 하루와 겹치는 예약을 호실별로
 */
export class ReservationStoreDto {
    @ApiProperty({description: '날짜 (YYYY-MM-DD, 한국 날짜)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '날짜를 입력해주세요.'})
    date: string;

    /**
     * @param data 요청 쿼리 — 빠진 날짜는 빈 문자열(검증에서 걸린다)
     */
    constructor(data?: Partial<ReservationStoreDto>) {
        this.date = data?.date ?? '';
    }
}

/**
 * 호실의 예약 1건
 */
export class ReservationStoreItemResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '예약 상태 (PENDING · CONFIRMED · CHECKED_IN · COMPLETED)'})
    reservation_state_id: string;

    @ApiProperty({description: '예약 상태명'})
    reservation_state_name: string;

    @ApiProperty({description: '상품 종류 (HOURLY · NIGHT · LONG)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '입실 일시 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '퇴실 일시 (ISO 8601)'})
    end_at: string;

    @ApiProperty({description: '점유 끝 (ISO 8601 — 퇴실 + 정비시간)'})
    blocked_until: string;

    @ApiProperty({description: '합계 금액(원)'})
    total_price: number;

    @ApiProperty({description: '이용자 이름'})
    user_name: string;

    @ApiProperty({description: '이용자 휴대폰 번호 — 인증 전이면 null', nullable: true, type: String})
    user_phone: string | null;
}

/**
 * 호실 1개와 그날 예약
 */
export class ReservationStoreRoomResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '층'})
    floor: number;

    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '호실 상태 (AVAILABLE · RESERVED · IN_USE · MAINTENANCE · DISABLED)'})
    room_state_id: string;

    @ApiProperty({description: '호실 상태명'})
    room_state_name: string;

    @ApiProperty({description: '그날 예약 (입실 순)', type: () => [ReservationStoreItemResultDto]})
    reservations: ReservationStoreItemResultDto[];
}

/**
 * 내 업체 예약 현황
 */
export class ReservationStoreResultDto {
    @ApiProperty({description: '날짜 (YYYY-MM-DD)'})
    date: string;

    @ApiProperty({description: '호실 목록 (층 · 호실명 순 — 지워지지 않은 호실)', type: () => [ReservationStoreRoomResultDto]})
    list: ReservationStoreRoomResultDto[];
}
```

```ts
// libs/contracts/src/reservation/dto/reservation-store-cancel.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 취소 path param — 내 업체 예약만(아니면 404)
 */
export class ReservationStoreCancelParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 업체 취소 — 사유 메모 필수(이용자 SMS 에 함께 나간다). 확정 예약은 100% 환불
 */
export class ReservationStoreCancelDto {
    @ApiProperty({description: '취소 사유 (255자)'})
    @MaxLength(255, {message: '취소 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '취소 사유를 입력해주세요.'})
    cancel_reason: string;
}
```

```ts
// libs/contracts/src/reservation/dto/reservation-room-change.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 이동 path param — 내 업체 예약만(아니면 404)
 */
export class ReservationRoomChangeParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 호실 이동 — 같은 객실 그룹의 다른 호실로(이용 시작 전 확정 예약만). 금액 · 시간은 그대로
 */
export class ReservationRoomChangeDto {
    @ApiProperty({description: '옮길 호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '옮길 호실 ID를 입력해주세요.'})
    room_id: string;
}
```

```ts
// libs/contracts/src/store/dto/store-mine-reservation-policy.dto.ts — modified (클래스 주석 · refund_deadline_hours 를 바꾸고 late_refund_percent 추가)
/**
 * 내 업체 예약 · 환불 규정 — 이용 시작 n시간 전부터 예약, n분 전까지 취소는 100% 환불, 그 뒤 ~ 이용 시작 전 취소는 비율 환불(원 단위 내림).
 * 예약할 때 마감 시각 · 비율을 예약에 저장한다 — 바꿔도 기존 예약은 그대로다
 */
export class StoreMineReservationPolicyDto {
    // booking_open_hours 그대로

    @ApiProperty({description: '100% 환불 마감 — 이용 시작 n분 전까지 취소하면 100% 환불 (0 ~ 10,080분)'})
    @IsInt({message: '환불 마감은 분 단위 정수로 입력해주세요.'})
    @Min(0, {message: '환불 마감은 0 ~ 10,080분 사이로 입력해주세요.'})
    @Max(10080, {message: '환불 마감은 0 ~ 10,080분 사이로 입력해주세요.'})
    @IsNotEmpty({message: '환불 마감을 입력해주세요.'})
    refund_deadline_minutes: number;

    @ApiProperty({description: '마감 뒤 환불 비율 — 환불 마감 뒤 ~ 이용 시작 전 취소의 환불 비율 (0 ~ 100%, 0 이면 환불 없이 취소)'})
    @IsInt({message: '마감 뒤 환불 비율은 정수로 입력해주세요.'})
    @Min(0, {message: '마감 뒤 환불 비율은 0 ~ 100% 사이로 입력해주세요.'})
    @Max(100, {message: '마감 뒤 환불 비율은 0 ~ 100% 사이로 입력해주세요.'})
    @IsNotEmpty({message: '마감 뒤 환불 비율을 입력해주세요.'})
    late_refund_percent: number;
}
```

```ts
// libs/contracts/src/store/dto/store-detail.dto.ts · store-mine.dto.ts — modified (refund_deadline_hours 블록을 바꾼다 — 두 파일 같은 모양)
    @ApiProperty({description: '100% 환불 마감(분) — 이용 시작 n분 전까지 취소하면 100% 환불'})
    refund_deadline_minutes: number;

    @ApiProperty({description: '마감 뒤 환불 비율(%) — 환불 마감 뒤 ~ 이용 시작 전 취소'})
    late_refund_percent: number;
```

```ts
// libs/contracts/src/room/dto/room-plan-update.dto.ts — modified (클래스 주석 한 줄 · check_out_time 다음 필드 2개)
 * 연박(LONG)은 최소 · 최대 박수도 필수(1 ~ 180, 최소 ≤ 최대) · 시간 이용 · 1박은 받지 않는다.

    @ApiProperty({description: '최소 박수 (1 ~ 180) — 연박이면 최대 박수와 세트로 필수(최대 이하), 시간 이용 · 1박은 받지 않는다', required: false})
    @IsOptional()
    @IsInt({message: '최소 박수는 정수로 입력해주세요.'})
    @Min(1, {message: '최소 박수는 1 ~ 180박 사이로 입력해주세요.'})
    @Max(180, {message: '최소 박수는 1 ~ 180박 사이로 입력해주세요.'})
    min_nights?: number;

    @ApiProperty({description: '최대 박수 (1 ~ 180) — 연박이면 최소 박수와 세트로 필수, 시간 이용 · 1박은 받지 않는다', required: false})
    @IsOptional()
    @IsInt({message: '최대 박수는 정수로 입력해주세요.'})
    @Min(1, {message: '최대 박수는 1 ~ 180박 사이로 입력해주세요.'})
    @Max(180, {message: '최대 박수는 1 ~ 180박 사이로 입력해주세요.'})
    max_nights?: number;
```

```ts
// libs/contracts/src/room/dto/room-plan-update.dto.ts — modified (check_out_time 설명 — 1박은 항상 다음 날)
    @ApiProperty({description: '퇴실 시각 (HH:mm, 한국 시각 — 1박은 항상 다음 날, 연박은 마지막 날) — 1박 · 연박이면 입실 시각과 세트로 필수(입실과 달라야 한다), 시간 이용은 받지 않는다', required: false})
```

```ts
// libs/contracts/src/room/dto/room-plan-list.dto.ts — modified (RoomPlanItemResultDto — check_out_time 설명 · 다음에 박수 2개)
    @ApiProperty({description: '퇴실 시각 (HH:mm, 한국 시각 — 1박은 항상 다음 날, 연박은 마지막 날) — 시간 이용은 null', nullable: true, type: String})
    check_out_time: string | null;

    @ApiProperty({description: '최소 박수 — 연박만, 시간 이용 · 1박은 null', nullable: true, type: Number})
    min_nights: number | null;

    @ApiProperty({description: '최대 박수 — 연박만, 시간 이용 · 1박은 null', nullable: true, type: Number})
    max_nights: number | null;
```
### 외부 연동 — 결제 포트 확장 (`libs/integration`)

형제: 실패 분류 순수 함수 `classifyTossFailure`(integration.util.ts — Phase 16), 포트 인터페이스(interfaces/integration.interface.ts). 토스 부분 취소는 같은 취소 API 에 `cancelAmount` 를 넣는다(없으면 전액).

```ts
// libs/integration/src/integration.constants.ts — modified (파일 끝에 추가)

/** 토스 결제 상태 — 승인 완료 */
export const TOSS_PAYMENT_STATUS_DONE = 'DONE';
```

```ts
// libs/integration/src/interfaces/integration.interface.ts — modified (PaymentCancelInput 에 금액, 포트 cancel 주석)
/** 환불(취소) 요청 — 금액만큼(전액 또는 일부) */
export interface PaymentCancelInput {
    /** 우리 결제 ID — 멱등키(cancel-<payment_id>)에 쓴다 */
    payment_id: string;
    /** 토스 결제 키 */
    payment_key: string;
    /** 취소 사유(토스 cancelReason, 200자) */
    reason: string;
    /** 취소 금액(원 — 토스 cancelAmount, 결제 금액 이하) */
    amount: number;
}

    /**
     * 취소(환불) — 금액만큼(전액 또는 일부). Idempotency-Key cancel-<payment_id> 를 붙여 재시도가 중복 취소를 만들지 않는다(결제 1건에 환불 1번).
     *
     * @throws BadRequestException 업무 실패(이미 취소 · 취소 불가 금액 · 결제 없음 등) · ServiceUnavailableException 일시 실패
     */
    cancel(input: PaymentCancelInput): Promise<PaymentCancelResult>;
```

```ts
// libs/integration/src/integration.util.ts — modified (import 1줄 · 파일 끝에 추가)
import {TOSS_PAYMENT_STATUS_DONE} from './integration.constants.js';
import type {PaymentLookupResult} from './interfaces/integration.interface.js';

/** 토스 조회 대조 결과 — PAID: 결제됨, NOT_PAID: 미결제(없음 · 승인 전 · 취소 · 중단), MISMATCH: 금액 다름(환불), FOREIGN: 다른 주문의 결제(환불하지 않는다) */
export type PaymentLookupVerdict = 'PAID' | 'NOT_PAID' | 'MISMATCH' | 'FOREIGN';

/**
 * 토스에서 다시 읽은 결제를 우리 결제 행과 대조한다 — 결제 확인(user-service) · 결제 대기 만료(scheduler)가 같은 판정을 쓴다.
 * 승인 완료(DONE)가 아니면 미결제, 주문번호가 다르면 다른 주문(다른 이용자일 수 있어 환불하지 않는다), 금액이 다르면 불일치(환불).
 *
 * @param lookup 토스 조회 결과(없으면 null)
 * @param payment_id 우리 결제 ID(= 토스 orderId)
 * @param amount 우리 결제 금액(원)
 * @returns 대조 결과
 */
export function verifyPaymentLookup(lookup: PaymentLookupResult | null, payment_id: string, amount: number): PaymentLookupVerdict {
    if (!lookup || lookup.status !== TOSS_PAYMENT_STATUS_DONE) {
        return 'NOT_PAID';
    }
    if (lookup.order_id !== payment_id) {
        return 'FOREIGN';
    }
    if (lookup.total_amount !== amount) {
        return 'MISMATCH';
    }
    return 'PAID';
}
```

```ts
// libs/integration/src/payment/toss-payment.gateway.ts — modified (클래스 주석 한 줄 · cancel 본문의 요청 본문)
 * 결제창 · 승인은 프론트가 하고, 여기서는 조회(검증) · 취소(환불 — 전액 또는 일부)만 한다. 취소는 Idempotency-Key cancel-<payment_id> 로 재시도해도 한 번만 된다.

    /**
     * 취소(환불) — 금액만큼(토스 cancelAmount).
     *
     * @param input 결제 ID · 결제 키 · 사유 · 금액
     * @returns 취소 금액 · 시각
     */
    async cancel(input: PaymentCancelInput): Promise<PaymentCancelResult> {
        const response = await this.request('POST', `/v1/payments/${encodeURIComponent(input.payment_key)}/cancel`, {cancelReason: input.reason, cancelAmount: input.amount}, `cancel-${input.payment_id}`);
        // … 이하 그대로
```

```ts
// libs/integration/src/payment/payment.module.ts — modified (주석)
/**
 * 결제 포트(PAYMENT_GATEWAY) — 토스페이먼츠(조회 검증 · 환불, 승인은 프론트).
 * 결제를 다루는 앱의 루트 모듈에서 import 한다(전역 — 도메인 모듈은 import 없이 `@Inject(PAYMENT_GATEWAY)` 로 주입받는다). 사용: user-service(예약 · 결제 확인 · 취소) · scheduler(결제 대기 만료 · 환불 crontab).
 */
```
### user-service — 예약 도메인 상수 · util (`apps/user-service/src/reservation/`)

형제: door.symbols.ts · user.constants.ts(메시지 상수), 하루 안 시각을 기준일에 올려 반열린 구간으로 비교하는 store.util.ts `toDailyRange` · `hasOverlappingBreaks`(:228 · :242 — 자정 넘김은 끝 +1일), 날짜 검사 room.util.ts `isValidDate`(:126). 같은 값의 상수를 도메인마다 두는 형제 `ROOM_STORE_STATE_LEAVE`(room.constants.ts:36).

```ts
// apps/user-service/src/reservation/reservation.symbols.ts — new
/** 예약 repository 포트 토큰 — 구현: ReservationRepository */
export const RESERVATION_REPOSITORY = Symbol('ReservationRepositoryInterface');
```

```ts
// apps/user-service/src/reservation/reservation.constants.ts — new
import {RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';

/** 상품 종류 — 룩업 t_room_plan_type 과 같은 값(room 도메인 상수와 같지만 도메인끼리 import 하지 않는다) */
export const RESERVATION_PLAN_TYPE = {HOURLY: 'HOURLY', NIGHT: 'NIGHT', LONG: 'LONG'} as const;

/** 상품 종류명 — 주문명 · SMS 에 쓴다(룩업 이름과 같다) */
export const RESERVATION_PLAN_TYPE_NAME: Record<string, string> = {HOURLY: '시간 이용', NIGHT: '1박', LONG: '연박'};

/** 호실 상태 — 예약가능(즉시 입실 조건) · 사용중지(예약 불가) */
export const RESERVATION_ROOM_STATE = {AVAILABLE: 'AVAILABLE', DISABLED: 'DISABLED'} as const;

/** 예약을 받는 업체 상태 — 활성 */
export const RESERVATION_STORE_STATE_ACTIVE = 'ACTIVE';

/** 업체 예약 현황에 나오는 예약 상태 — 결제 대기 · 확정 · 이용 중 · 이용 완료 */
export const RESERVATION_STORE_VISIBLE_STATES: string[] = [RESERVATION_STATE.PENDING, RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN, RESERVATION_STATE.COMPLETED];

/** 시간 이용 시작 시각 단위(분) — :00 · :30 (사용자 결정 2026-11-03) */
export const RESERVATION_HOURLY_STEP_MINUTES = 30;

/** 즉시 입실(분) — 시작이 지금부터 이 시간 안이면 호실이 예약가능일 때만 받는다 */
export const RESERVATION_IMMEDIATE_MINUTES = 30;

/** 날짜 형식 — 한국 날짜 */
export const RESERVATION_DATE_FORMAT = 'YYYY-MM-DD';

/** 토스 주문명 최대 길이 */
export const RESERVATION_ORDER_NAME_MAX_LENGTH = 100;

/** 예약을 찾을 수 없음 — 남의 예약 · 결제 대기 만료 건 포함 */
export const RESERVATION_NOT_FOUND_MESSAGE = '예약을 찾을 수 없습니다.';

/** 예약 업체를 찾을 수 없음 — 지워졌거나 활성이 아님 */
export const RESERVATION_STORE_NOT_FOUND_MESSAGE = '업체를 찾을 수 없습니다.';

/** 호실을 찾을 수 없음 */
export const RESERVATION_ROOM_NOT_FOUND_MESSAGE = '호실을 찾을 수 없습니다.';

/** 매니저의 소속 업체를 찾을 수 없음 */
export const RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';

/** 없는 날짜 */
export const RESERVATION_DATE_INVALID_MESSAGE = '없는 날짜입니다.';

/** 같은 호실의 점유 예약과 겹침 — 배타 제약 23P01 */
export const RESERVATION_TIME_TAKEN_MESSAGE = '이미 예약된 시간입니다.';

/** 옮길 호실의 점유 예약과 겹침 — 배타 제약 23P01 */
export const RESERVATION_ROOM_TAKEN_MESSAGE = '옮길 호실에 겹치는 예약이 있습니다.';

/** 상태 조건을 건 쓰기가 0행 — 그 사이 바뀌었다(crontab · 다른 요청) */
export const RESERVATION_STATE_CHANGED_MESSAGE = '예약 상태가 바뀌었습니다. 다시 확인해주세요.';

/** 취소할 수 없는 상태 */
export const RESERVATION_NOT_CANCELABLE_MESSAGE = '취소할 수 없는 예약입니다.';

/** 결제를 찾을 수 없음 */
export const RESERVATION_PAYMENT_NOT_FOUND_MESSAGE = '결제를 찾을 수 없습니다.';
```

```ts
// apps/user-service/src/reservation/reservation.util.ts — new
import type {ReservationAvailabilityRoomResultDto, ReservationAvailabilitySlotResultDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import type {ReservationDetailResultDto} from '@app/contracts/reservation/dto/reservation-detail.dto.js';
import type {ReservationListItemResultDto} from '@app/contracts/reservation/dto/reservation-list.dto.js';
import type {ReservationStoreRoomResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {BookableRoomRow, ReservationListRow, ReservationSegmentRow, StoreReservationRow, StoreRoomRow} from './interfaces/reservation.repository.interface.js';
import {
    RESERVATION_DATE_FORMAT,
    RESERVATION_HOURLY_STEP_MINUTES,
    RESERVATION_IMMEDIATE_MINUTES,
    RESERVATION_ORDER_NAME_MAX_LENGTH,
    RESERVATION_PLAN_TYPE,
    RESERVATION_PLAN_TYPE_NAME,
    RESERVATION_ROOM_STATE,
} from './reservation.constants.js';

/** 이용 구간 — 입실일(요일 · 요금 기준일, 한국 날짜 0시) · 시작 · 끝(한국 시각) */
export interface Stay {
    day: Dayjs;
    start: Dayjs;
    end: Dayjs;
}

/** 점유 구간 — 같은 호실의 점유 예약 [start_at, blocked_until) */
export interface OccupiedRange {
    room_id: string;
    start_at: Date;
    blocked_until: Date;
}

/** 재고 판정 재료 — 업체 · 상품 설정 · 영업시간 · 브레이크 · 일시 예약불가(지워지지 않은 행) */
export interface BookingContext {
    now: Dayjs;
    is_open: number;
    is_always_open: number;
    booking_open_hours: number;
    maintenance_minutes: number;
    room_plan_type_id: string;
    days_of_week: number;
    hours: StoreHourEntity[];
    breaks: StoreBreakEntity[];
    unavailable: StoreUnavailablePeriodEntity[];
}

/** 시각 창 — [start, end) */
interface TimeWindow {
    start: Dayjs;
    end: Dayjs;
}

/**
 * 'YYYY-MM-DD' 가 있는 날짜인지(2026-02-30 ✗).
 *
 * @param value 날짜 문자열
 * @returns 있는 날짜면 true
 */
export function isValidDate(value: string): boolean {
    return dayjs(value, RESERVATION_DATE_FORMAT, true).isValid();
}

/**
 * 한국 날짜 0시.
 *
 * @param date 'YYYY-MM-DD'
 * @returns 그 날 0시(한국 시각)
 */
export function toKstDay(date: string): Dayjs {
    return dayjs.tz(date, RESERVATION_DATE_FORMAT, KST_TIMEZONE);
}

/**
 * 지금(한국 시각).
 *
 * @returns 지금
 */
export function nowKst(): Dayjs {
    return dayjs().tz(KST_TIMEZONE);
}

/**
 * 날짜 위의 하루 안 시각 — 'HH:mm' · 'HH:mm:ss'(time 컬럼) 모두 받는다.
 *
 * @param day 그 날 0시(한국 시각)
 * @param time 하루 안 시각
 * @returns 그 날 그 시각
 */
function atTimeOfDay(day: Dayjs, time: string): Dayjs {
    const parsed = dayjs(time, ['HH:mm:ss', 'HH:mm'], true);
    return day.add(parsed.hour() * 60 + parsed.minute(), 'minute');
}

/**
 * 하루 창 — 끝이 시작보다 이르거나 같으면 다음 날 끝(자정 넘김, 형제 store.util.ts toDailyRange).
 *
 * @param day 그 날 0시
 * @param start_time 시작 시각
 * @param end_time 끝 시각
 * @returns [시작, 끝)
 */
function toDailyWindow(day: Dayjs, start_time: string, end_time: string): TimeWindow {
    const start = atTimeOfDay(day, start_time);
    const end = atTimeOfDay(day, end_time);
    return {start, end: end.isAfter(start) ? end : end.add(1, 'day')};
}

/**
 * 맞닿거나 겹치는 창을 합친다(Mon 10:00~24:00 + Tue 00:00~ 처럼 이어지는 영업은 한 창).
 *
 * @param windows 창 목록
 * @returns 시작 순으로 합친 창
 */
function mergeWindows(windows: TimeWindow[]): TimeWindow[] {
    const sorted = [...windows].sort((a, b) => a.start.diff(b.start));
    const merged: TimeWindow[] = [];
    for (const window of sorted) {
        const last = merged[merged.length - 1];
        if (last && !window.start.isAfter(last.end)) {
            last.end = window.end.isAfter(last.end) ? window.end : last.end;
        } else {
            merged.push({...window});
        }
    }
    return merged;
}

/**
 * 영업시간 창 — firstDay ~ lastDay 의 요일 행(휴무 제외)으로 만들고 합친다. 자정을 넘는 전날 영업은 firstDay 를 하루 앞당겨 넘기면 잡힌다.
 *
 * @param hours 요일별 영업시간
 * @param firstDay 첫 날 0시
 * @param lastDay 마지막 날 0시
 * @returns 영업 창
 */
function listBusinessWindows(hours: StoreHourEntity[], firstDay: Dayjs, lastDay: Dayjs): TimeWindow[] {
    const windows: TimeWindow[] = [];
    for (let day = firstDay; !day.isAfter(lastDay); day = day.add(1, 'day')) {
        const row = hours.find((hour) => hour.day_of_week === day.day());
        if (row && row.is_closed !== 1 && row.open_time !== null && row.close_time !== null) {
            windows.push(toDailyWindow(day, row.open_time, row.close_time));
        }
    }
    return mergeWindows(windows);
}

/**
 * 브레이크타임 창 — 매일 같은 시각(firstDay ~ lastDay).
 *
 * @param breaks 브레이크타임
 * @param firstDay 첫 날 0시
 * @param lastDay 마지막 날 0시
 * @returns 브레이크 창
 */
function listBreakWindows(breaks: StoreBreakEntity[], firstDay: Dayjs, lastDay: Dayjs): TimeWindow[] {
    const windows: TimeWindow[] = [];
    for (let day = firstDay; !day.isAfter(lastDay); day = day.add(1, 'day')) {
        for (const item of breaks) {
            windows.push(toDailyWindow(day, item.start_time, item.end_time));
        }
    }
    return windows;
}

/**
 * 영업시간 · 브레이크 — 시간 이용은 구간 전체가 영업시간 안 · 브레이크와 안 겹침, 1박 · 연박은 체크인 [여는, 닫는) · 체크아웃 (여는, 닫는] 이 각각 영업시간 안 · 브레이크 안이 아님.
 * 24시간 업체는 영업시간을 보지 않는다(브레이크는 본다). 사용자 결정 2026-11-03
 *
 * @param stay 이용 구간
 * @param context 재고 판정 재료
 * @returns 맞으면 true
 */
function isWithinStoreHours(stay: Stay, context: BookingContext): boolean {
    const firstDay = stay.day.subtract(1, 'day');
    const lastDay = toKstDay(stay.end.format(RESERVATION_DATE_FORMAT));
    const breaks = listBreakWindows(context.breaks, firstDay, lastDay);
    const hours = context.is_always_open === 1 ? null : listBusinessWindows(context.hours, firstDay, lastDay);
    if (context.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY) {
        const overlapsBreak = breaks.some((window) => window.start.isBefore(stay.end) && window.end.isAfter(stay.start));
        const inHours = hours === null || hours.some((window) => !window.start.isAfter(stay.start) && !window.end.isBefore(stay.end));
        return !overlapsBreak && inHours;
    }
    const checkInBreak = breaks.some((window) => !window.start.isAfter(stay.start) && window.end.isAfter(stay.start));
    const checkOutBreak = breaks.some((window) => window.start.isBefore(stay.end) && !window.end.isBefore(stay.end));
    const checkInHours = hours === null || hours.some((window) => !window.start.isAfter(stay.start) && window.end.isAfter(stay.start));
    const checkOutHours = hours === null || hours.some((window) => window.start.isBefore(stay.end) && !window.end.isBefore(stay.end));
    return !checkInBreak && !checkOutBreak && checkInHours && checkOutHours;
}

/**
 * 이용 구간 1개 — 시간 이용은 시작 시각 + 이용 시간, 1박은 체크인 ~ 다음 날 체크아웃(항상 날짜를 넘긴다 — 사용자 결정 2026-11-03), 연박은 체크인 ~ 박수 뒤 날의 체크아웃.
 * 상품 설정의 nullable 컬럼은 종류별 CHECK(CHK_RoomPlan_*)가 채워 둔다.
 *
 * @param plan 업체 상품 설정
 * @param day 입실일 0시
 * @param start_time 시간 이용 시작 시각(HH:mm) — 그 밖은 null
 * @param nights 연박 박수 — 그 밖은 null
 * @returns 이용 구간
 */
export function toStay(plan: RoomPlanEntity, day: Dayjs, start_time: string | null, nights: number | null): Stay {
    if (plan.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY) {
        const start = atTimeOfDay(day, start_time as string);
        return {day, start, end: start.add(plan.usage_hours as number, 'hour')};
    }
    const start = atTimeOfDay(day, plan.check_in_time as string);
    const stay_nights = plan.room_plan_type_id === RESERVATION_PLAN_TYPE.NIGHT ? 1 : (nights as number);
    return {day, start, end: atTimeOfDay(day.add(stay_nights, 'day'), plan.check_out_time as string)};
}

/**
 * 그 날의 이용 구간 후보 — 시간 이용은 30분마다(00:00 ~ 23:30), 1박 · 연박은 1개.
 *
 * @param plan 업체 상품 설정
 * @param day 입실일 0시
 * @param nights 연박 박수 — 그 밖은 null
 * @returns 후보 구간(시작 순)
 */
export function listStays(plan: RoomPlanEntity, day: Dayjs, nights: number | null): Stay[] {
    if (plan.room_plan_type_id !== RESERVATION_PLAN_TYPE.HOURLY) {
        return [toStay(plan, day, null, nights)];
    }
    const stays: Stay[] = [];
    for (let minute = 0; minute < 24 * 60; minute += RESERVATION_HOURLY_STEP_MINUTES) {
        const start = day.add(minute, 'minute');
        stays.push({day, start, end: start.add(plan.usage_hours as number, 'hour')});
    }
    return stays;
}

/**
 * 후보 구간들이 걸치는 전체 범위 — 일시 예약불가 · 점유 예약을 한 번에 읽는 조회 범위(끝은 정비시간까지).
 *
 * @param stays 후보 구간
 * @param maintenance_minutes 정비시간(분)
 * @returns [처음 시작, 마지막 끝 + 정비시간)
 */
export function toStaysRange(stays: Stay[], maintenance_minutes: number): {from: Date; to: Date} {
    const from = stays.reduce((min, stay) => (stay.start.isBefore(min) ? stay.start : min), stays[0].start);
    const to = stays.reduce((max, stay) => (stay.end.isAfter(max) ? stay.end : max), stays[0].end).add(maintenance_minutes, 'minute');
    return {from: from.toDate(), to: to.toDate()};
}

/**
 * 연박 박수가 업체 설정 안인지.
 *
 * @param plan 업체 상품 설정(연박)
 * @param nights 박수
 * @returns 최소 ~ 최대면 true
 */
export function isNightsAllowed(plan: RoomPlanEntity, nights: number): boolean {
    return nights >= (plan.min_nights as number) && nights <= (plan.max_nights as number);
}

/**
 * 그룹 상품을 파는지 — 사용 중 · 요금 > 0.
 *
 * @param plan 그룹 상품
 * @returns 팔면 true
 */
export function isGroupPlanOnSale(plan: RoomGroupPlanEntity): boolean {
    return plan.is_used === 1 && plan.price > 0;
}

/**
 * 재고 판정 재료를 묶는다.
 *
 * @param now 지금(한국 시각)
 * @param store 업체
 * @param plan 업체 상품 설정
 * @param hours 요일별 영업시간
 * @param breaks 브레이크타임
 * @param unavailable 일시 예약불가(조회 범위와 겹치는 것)
 * @returns 재료
 */
export function buildBookingContext(
    now: Dayjs,
    store: StoreEntity,
    plan: RoomPlanEntity,
    hours: StoreHourEntity[],
    breaks: StoreBreakEntity[],
    unavailable: StoreUnavailablePeriodEntity[],
): BookingContext {
    return {
        now,
        is_open: store.is_open,
        is_always_open: store.is_always_open,
        booking_open_hours: store.booking_open_hours,
        maintenance_minutes: store.maintenance_minutes,
        room_plan_type_id: plan.room_plan_type_id,
        days_of_week: plan.days_of_week,
        hours,
        breaks,
        unavailable,
    };
}

/**
 * 재고 판정 — 업체 영업중 · 호실 사용중지 아님 · 시작(지금 이후 · 예약 가능 기간 안, 즉시 입실은 예약가능 호실만) · 입실일 요일 ·
 * 영업시간 · 브레이크 · 일시 예약불가 · 점유([시작, 끝 + 정비시간)이 점유 예약과 겹치지 않음). 반열린 구간이라 맞닿음은 된다.
 *
 * @param stay 이용 구간
 * @param context 재고 판정 재료
 * @param room_state_id 호실 상태
 * @param occupied 그 호실의 점유 예약
 * @returns 예약할 수 있으면 true
 */
export function isStayBookable(stay: Stay, context: BookingContext, room_state_id: string, occupied: OccupiedRange[]): boolean {
    if (context.is_open !== 1 || room_state_id === RESERVATION_ROOM_STATE.DISABLED) {
        return false;
    }
    if (stay.start.isBefore(context.now) || stay.start.isAfter(context.now.add(context.booking_open_hours, 'hour'))) {
        return false;
    }
    if (stay.start.isBefore(context.now.add(RESERVATION_IMMEDIATE_MINUTES, 'minute')) && room_state_id !== RESERVATION_ROOM_STATE.AVAILABLE) {
        return false;
    }
    if ((context.days_of_week & (1 << stay.day.day())) === 0) {
        return false;
    }
    if (!isWithinStoreHours(stay, context)) {
        return false;
    }
    if (context.unavailable.some((period) => dayjs(period.starts_at).isBefore(stay.end) && dayjs(period.ends_at).isAfter(stay.start))) {
        return false;
    }
    const blocked_until = stay.end.add(context.maintenance_minutes, 'minute');
    return !occupied.some((range) => dayjs(range.start_at).isBefore(blocked_until) && dayjs(range.blocked_until).isAfter(stay.start));
}

/**
 * 하루 요금 — 그 날짜가 기간 가격(시작 · 끝 날짜 포함) 안이면 기간 요금, 아니면 기본 요금.
 *
 * @param day 날짜 0시
 * @param base_price 그룹 상품 기본 요금
 * @param periods 그룹 상품의 기간 가격(지워지지 않은 행)
 * @returns 요금(원)
 */
function priceOn(day: Dayjs, base_price: number, periods: RoomGroupPlanPriceEntity[]): number {
    const period = periods.find((item) => !day.isBefore(toKstDay(item.start_date)) && !day.isAfter(toKstDay(item.end_date)));
    return period ? period.price : base_price;
}

/**
 * 금액 — 시간 이용 · 1박은 입실일 요금, 연박은 박마다(입실일, +1일, …) 요금 합계. 사용자 결정 2026-11-03
 *
 * @param room_plan_type_id 상품 종류
 * @param day 입실일 0시
 * @param nights 연박 박수 — 그 밖은 null
 * @param base_price 그룹 상품 기본 요금
 * @param periods 그룹 상품의 기간 가격
 * @returns 금액(원)
 */
export function calculateStayPrice(room_plan_type_id: string, day: Dayjs, nights: number | null, base_price: number, periods: RoomGroupPlanPriceEntity[]): number {
    const count = room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? (nights as number) : 1;
    let total = 0;
    for (let index = 0; index < count; index += 1) {
        total += priceOn(day.add(index, 'day'), base_price, periods);
    }
    return total;
}

/**
 * 호실별 예약 가능 시간 — 이 상품을 파는 그룹(그룹 상품 판매 · 요금 > 0)의 호실만, 구간은 재고 판정을 지난 것만.
 *
 * @param rooms 지워지지 않은 호실(층 · 호실명 순)
 * @param group_plans 판매 중인 그룹 상품
 * @param periods 그 그룹 상품들의 기간 가격
 * @param stays 후보 구간
 * @param context 재고 판정 재료
 * @param occupied 호실들의 점유 예약
 * @param nights 연박 박수 — 그 밖은 null
 * @returns 호실 목록
 */
export function toAvailabilityRooms(
    rooms: BookableRoomRow[],
    group_plans: RoomGroupPlanEntity[],
    periods: RoomGroupPlanPriceEntity[],
    stays: Stay[],
    context: BookingContext,
    occupied: OccupiedRange[],
    nights: number | null,
): ReservationAvailabilityRoomResultDto[] {
    const result: ReservationAvailabilityRoomResultDto[] = [];
    for (const room of rooms) {
        const plan = group_plans.find((item) => item.room_group_id === room.room_group_id);
        if (!plan) {
            continue;
        }
        const roomOccupied = occupied.filter((range) => range.room_id === room.room_id);
        const price = calculateStayPrice(
            context.room_plan_type_id,
            stays[0].day,
            nights,
            plan.price,
            periods.filter((item) => item.room_group_plan_id === plan.room_group_plan_id),
        );
        result.push({
            room_id: room.room_id,
            room_name: room.room_name,
            floor: Number(room.floor),
            room_group_id: room.room_group_id,
            room_group_name: room.room_group_name,
            price,
            slots: stays.filter((stay) => isStayBookable(stay, context, room.room_state_id, roomOccupied)).map(toSlot),
        });
    }
    return result;
}

/**
 * 구간 → 응답(ISO 8601).
 *
 * @param stay 이용 구간
 * @returns 구간 응답
 */
export function toSlot(stay: Stay): ReservationAvailabilitySlotResultDto {
    return {start_at: stay.start.toISOString(), end_at: stay.end.toISOString()};
}

/**
 * 토스 주문명 — `<상호명> <호실명> <상품명>`(연박은 박수), 100자로 자른다.
 *
 * @param store_name 상호명
 * @param room_name 호실명
 * @param room_plan_type_id 상품 종류
 * @param nights 연박 박수 — 그 밖은 null
 * @returns 주문명
 */
export function buildOrderName(store_name: string, room_name: string, room_plan_type_id: string, nights: number | null): string {
    const plan = room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? `${RESERVATION_PLAN_TYPE_NAME[room_plan_type_id]} ${nights}박` : RESERVATION_PLAN_TYPE_NAME[room_plan_type_id];
    return `${store_name} ${room_name} ${plan}`.slice(0, RESERVATION_ORDER_NAME_MAX_LENGTH);
}

/**
 * 이용자 취소 환불액 — 환불 마감 전 100%, 마감 ~ 이용 시작 전 결제 금액 × 비율(원 단위 내림), 시작 뒤(시작 정각 포함)는 취소 불가(null). 사용자 결정 2026-11-03
 *
 * @param amount 결제 금액(원)
 * @param now 지금
 * @param refund_deadline_at 환불 마감(예약 때 저장)
 * @param start_at 이용 시작
 * @param late_refund_percent 마감 뒤 환불 비율(예약 때 저장)
 * @returns 환불액 — 취소할 수 없으면 null
 */
export function calculateRefundAmount(amount: number, now: Dayjs, refund_deadline_at: Date, start_at: Date, late_refund_percent: number): number | null {
    if (!now.isBefore(dayjs(start_at))) {
        return null;
    }
    if (now.isBefore(dayjs(refund_deadline_at))) {
        return amount;
    }
    return Math.floor((amount * late_refund_percent) / 100);
}

/**
 * 업체 취소 SMS.
 *
 * @param store_name 상호명
 * @param start_at 입실 일시
 * @param reason 취소 사유
 * @returns 문구
 */
export function buildStoreCancelSms(store_name: string, start_at: Date, reason: string): string {
    return `[roomless] ${store_name} ${dayjs(start_at).tz(KST_TIMEZONE).format('M/D HH:mm')} 예약이 업체 사정으로 취소되었습니다. 결제 금액은 전액 환불됩니다. 사유: ${reason}`;
}

/**
 * 호실 이동 SMS.
 *
 * @param store_name 상호명
 * @param start_at 입실 일시
 * @param from_room 원래 호실명
 * @param to_room 옮긴 호실명
 * @returns 문구
 */
export function buildRoomChangeSms(store_name: string, start_at: Date, from_room: string, to_room: string): string {
    return `[roomless] ${store_name} ${dayjs(start_at).tz(KST_TIMEZONE).format('M/D HH:mm')} 예약 호실이 ${from_room}에서 ${to_room}로 변경되었습니다.`;
}

/**
 * 시각 → ISO 8601(없으면 null) — raw select 는 Date 로 온다.
 *
 * @param value 시각
 * @returns ISO 문자열 또는 null
 */
function toIso(value: Date | string | null): string | null {
    return value === null ? null : dayjs(value).toISOString();
}

/**
 * 내 예약 목록 항목.
 *
 * @param row 목록 행
 * @returns 항목
 */
export function toReservationListItem(row: ReservationListRow): ReservationListItemResultDto {
    return {
        reservation_id: row.reservation_id,
        store_id: row.store_id,
        store_name: row.store_name,
        room_id: row.room_id,
        room_name: row.room_name,
        room_group_name: row.room_group_name,
        room_plan_type_id: row.room_plan_type_id,
        room_plan_type_name: row.room_plan_type_name,
        reservation_state_id: row.reservation_state_id,
        reservation_state_name: row.reservation_state_name,
        start_at: toIso(row.start_at) as string,
        end_at: toIso(row.end_at) as string,
        total_price: Number(row.total_price),
        refund_deadline_at: toIso(row.refund_deadline_at) as string,
        created_at: toIso(row.created_at) as string,
    };
}

/**
 * 내 예약 상세 — 목록 항목 + 취소 정보 + 구간 · 결제.
 *
 * @param row 목록 행
 * @param segments 구간 행(시작 순)
 * @returns 상세
 */
export function toReservationDetail(row: ReservationListRow, segments: ReservationSegmentRow[]): ReservationDetailResultDto {
    return {
        ...toReservationListItem(row),
        late_refund_percent: Number(row.late_refund_percent),
        canceled_at: toIso(row.canceled_at),
        cancel_actor: row.cancel_actor ?? null,
        cancel_reason: row.cancel_reason ?? null,
        segments: segments.map((segment) => ({
            reservation_detail_id: segment.reservation_detail_id,
            reservation_detail_type_id: segment.reservation_detail_type_id,
            reservation_detail_type_name: segment.reservation_detail_type_name,
            reservation_state_id: segment.reservation_state_id,
            start_at: toIso(segment.start_at) as string,
            end_at: toIso(segment.end_at) as string,
            price: Number(segment.price),
            expires_at: toIso(segment.expires_at),
            payment: {
                payment_id: segment.payment_id,
                payment_state_id: segment.payment_state_id,
                payment_state_name: segment.payment_state_name,
                amount: Number(segment.amount),
                method: segment.method ?? null,
                approved_at: toIso(segment.approved_at),
                receipt_url: segment.receipt_url ?? null,
                refund_amount: segment.refund_amount === null ? null : Number(segment.refund_amount),
                refunded_at: toIso(segment.refunded_at),
            },
        })),
    };
}

/**
 * 업체 예약 현황 — 호실마다 그날 예약(입실 순)을 붙인다.
 *
 * @param rooms 지워지지 않은 호실(층 · 호실명 순)
 * @param rows 그날과 겹치는 예약(입실 순)
 * @returns 호실 목록
 */
export function toStoreReservationRooms(rooms: StoreRoomRow[], rows: StoreReservationRow[]): ReservationStoreRoomResultDto[] {
    return rooms.map((room) => ({
        room_id: room.room_id,
        room_name: room.room_name,
        floor: Number(room.floor),
        room_group_id: room.room_group_id,
        room_group_name: room.room_group_name,
        room_state_id: room.room_state_id,
        room_state_name: room.room_state_name,
        reservations: rows
            .filter((row) => row.room_id === room.room_id)
            .map((row) => ({
                reservation_id: row.reservation_id,
                reservation_state_id: row.reservation_state_id,
                reservation_state_name: row.reservation_state_name,
                room_plan_type_id: row.room_plan_type_id,
                room_plan_type_name: row.room_plan_type_name,
                start_at: toIso(row.start_at) as string,
                end_at: toIso(row.end_at) as string,
                blocked_until: toIso(row.blocked_until) as string,
                total_price: Number(row.total_price),
                user_name: row.user_name,
                user_phone: row.user_phone ?? null,
            })),
    }));
}
```

```ts
// apps/user-service/src/reservation/interfaces/reservation.repository.interface.ts — new
import type {FindOptionsWhere} from 'typeorm';
import type {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import type {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import type {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import type {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 예약 가능 호실 행 — 지워지지 않은 호실 · 그룹(QueryBuilder raw — 그룹 조인) */
export interface BookableRoomRow {
    room_id: string;
    room_name: string;
    floor: number;
    room_state_id: string;
    room_group_id: string;
    room_group_name: string;
}

/** 예약 목록 · 상세 행 — 예약 + 업체 · 호실 · 그룹 · 상품 종류명 · 상태명(QueryBuilder raw) */
export interface ReservationListRow {
    reservation_id: string;
    store_id: string;
    store_name: string;
    room_id: string;
    room_name: string;
    room_group_name: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    reservation_state_id: string;
    reservation_state_name: string;
    start_at: Date;
    end_at: Date;
    total_price: number;
    refund_deadline_at: Date;
    late_refund_percent: number;
    canceled_at: Date | null;
    cancel_actor: string | null;
    cancel_reason: string | null;
    created_at: Date;
}

/** 예약 구간 행 — 구간 + 종류명 · 상태명 + 결제 · 결제 상태명(QueryBuilder raw) */
export interface ReservationSegmentRow {
    reservation_detail_id: string;
    reservation_detail_type_id: string;
    reservation_detail_type_name: string;
    reservation_state_id: string;
    start_at: Date;
    end_at: Date;
    price: number;
    expires_at: Date | null;
    payment_id: string;
    payment_state_id: string;
    payment_state_name: string;
    amount: number;
    method: string | null;
    approved_at: Date | null;
    receipt_url: string | null;
    refund_amount: number | null;
    refunded_at: Date | null;
}

/** 업체 현황 호실 행 — 지워지지 않은 호실 · 그룹 + 상태명(QueryBuilder raw) */
export interface StoreRoomRow {
    room_id: string;
    room_name: string;
    floor: number;
    room_group_id: string;
    room_group_name: string;
    room_state_id: string;
    room_state_name: string;
}

/** 업체 현황 예약 행 — 예약 + 상태명 · 상품 종류명 + 이용자 이름 · 휴대폰(QueryBuilder raw) */
export interface StoreReservationRow {
    reservation_id: string;
    room_id: string;
    reservation_state_id: string;
    reservation_state_name: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    start_at: Date;
    end_at: Date;
    blocked_until: Date;
    total_price: number;
    user_name: string;
    user_phone: string | null;
}

/**
 * 예약 repository 포트 — 예약 · 구간 · 결제를 쓰고, 공유 DB 의 업체 · 객실 · 상품 · 영업시간(admin-service 가 쓰는 표)과 회원을 예약 어휘로 읽는다.
 * is_deleted 가 있는 표의 조회에는 repository 가 is_deleted = 0 을 붙인다(service 는 넣지 않는다).
 */
export interface ReservationRepositoryInterface {
    /** 예약 업체 — 지워지지 않은 업체 */
    findReservationStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 예약 호실 — 지워지지 않은 호실 */
    findReservationRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
    /** 예약 호실의 객실 그룹 — 지워지지 않은 그룹 */
    findReservationRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity | null>;
    /** 업체의 예약 가능 호실 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순 */
    findBookableRooms(store_id: string): Promise<BookableRoomRow[]>;
    /** 업체 상품 설정 단건 */
    findStorePlan(where: FindOptionsWhere<RoomPlanEntity>): Promise<RoomPlanEntity | null>;
    /** 그룹 상품 목록 */
    findGroupPlans(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity[]>;
    /** 기간 가격 목록 — 지워지지 않은 행 */
    findGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity[]>;
    /** 업체 요일별 영업시간 — 지워지지 않은 행 */
    findStoreHours(store_id: string): Promise<StoreHourEntity[]>;
    /** 업체 브레이크타임 — 지워지지 않은 행 */
    findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]>;
    /** 일시 예약불가 — 지워지지 않은 행 */
    findUnavailablePeriods(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<StoreUnavailablePeriodEntity[]>;
    /** 예약 목록(점유 판정 · 내부 확인용) */
    findReservations(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity[]>;
    /** 같은 이용자 · 같은 호실에서 since 뒤에 결제 대기가 만료된 예약 수(기본 구간 expires_at 기준) */
    countRecentExpired(user_id: string, room_id: string, since: Date): Promise<number>;
    /** 예약 단건 */
    findReservation(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity | null>;
    /** 예약 구간 목록 */
    findReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>): Promise<ReservationDetailEntity[]>;
    /** 결제 단건 */
    findPayment(where: FindOptionsWhere<PaymentEntity>): Promise<PaymentEntity | null>;
    /** 회원 단건(이용자 연락처 · 매니저 소속 업체) */
    findReservationUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null>;
    /** 결제 등록 */
    insertPayment(entity: PaymentEntity): Promise<void>;
    /** 예약 등록 — 같은 호실 점유 겹침(EXC_Reservation_RoomIdBlockedRange) → 400 */
    insertReservation(entity: ReservationEntity): Promise<void>;
    /** 예약 구간 등록 */
    insertReservationDetail(entity: ReservationDetailEntity): Promise<void>;
    /** 예약 수정 — 상태 조건을 건 쓰기, 1행이면 true */
    updateReservation(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean>;
    /** 호실 이동 — 상태 조건, 옮길 호실 점유 겹침(EXC_…) → 400, 1행이면 true */
    changeReservationRoom(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean>;
    /** 예약 구간 수정(여러 행) */
    updateReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>, entity: ReservationDetailEntity): Promise<void>;
    /** 결제 수정 — 상태 조건을 건 쓰기, 1행이면 true */
    updatePayment(where: FindOptionsWhere<PaymentEntity>, entity: PaymentEntity): Promise<boolean>;
    /** 예약 개수 */
    countReservations(where: FindOptionsWhere<ReservationEntity>): Promise<number>;
    /** 내 예약 목록 행 — 결제 대기 만료 제외, 입실 최근순 · 페이지 */
    findMyReservationRows(user_id: string, limit: number, offset: number): Promise<ReservationListRow[]>;
    /** 내 예약 상세 행 — 결제 대기 만료 제외 */
    findMyReservationRow(user_id: string, reservation_id: string): Promise<ReservationListRow | null>;
    /** 예약 구간 행 — 시작 순 */
    findReservationSegmentRows(reservation_id: string): Promise<ReservationSegmentRow[]>;
    /** 업체 현황 호실 행 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순 */
    findStoreRoomRows(store_id: string): Promise<StoreRoomRow[]>;
    /** 업체 현황 예약 행 — [from, to) 와 겹치는 결제 대기 · 확정 · 이용 중 · 이용 완료, 입실 순 */
    findStoreReservationRows(store_id: string, from: Date, to: Date): Promise<StoreReservationRow[]>;
}
```
### user-service — 예약 repository (`apps/user-service/src/reservation/repositories/reservation.repository.ts`)

형제: door.repository.ts(private getter · `notDeleted` · 통일 500), room.repository.ts `buildRoomRowsQuery`(QueryBuilder 빌더 메서드 public · raw select 별칭 = Row 키 · 조인 테이블 `is_deleted = 0`), 제약명별 분기 `isExclusionViolation`(libs/database/src/typeorm-error.ts:50), 상태 조건 쓰기 `affected === 1`(store `updateApplication`).

```ts
// apps/user-service/src/reservation/repositories/reservation.repository.ts — new
import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {RESERVATION_DETAIL_TYPE, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {PaymentStateEntity} from '@app/database/entities/payment/payment-state.entity.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailTypeEntity} from '@app/database/entities/reservation/reservation-detail-type.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationStateEntity} from '@app/database/entities/reservation/reservation-state.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from '@app/database/entities/room/room-plan-type.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomStateEntity} from '@app/database/entities/room/room-state.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import {isExclusionViolation} from '@app/database/typeorm-error.js';
import type {BookableRoomRow, ReservationListRow, ReservationRepositoryInterface, ReservationSegmentRow, StoreReservationRow, StoreRoomRow} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_ROOM_TAKEN_MESSAGE, RESERVATION_STORE_VISIBLE_STATES, RESERVATION_TIME_TAKEN_MESSAGE} from '../reservation.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/** 점유 겹침 배타 제약 */
const RESERVATION_EXCLUSION = 'EXC_Reservation_RoomIdBlockedRange';

/**
 * reservation repository (아웃바운드 어댑터) — t_reservation · t_reservation_detail · t_payment 를 쓰고,
 * 공유 DB 의 업체 · 객실 · 상품 · 영업시간(room · store 도메인 표)과 t_user 를 예약 어휘로 읽는다(사용자 결정 2026-11-03 — 공유 DB 직접 읽기).
 * is_deleted 가 있는 표의 조회에는 항상 is_deleted = 0 을 붙인다(notDeleted · QueryBuilder 는 조인 표까지).
 */
@Injectable()
export class ReservationRepository implements ReservationRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_reservation */
    private get reservations(): Repository<ReservationEntity> {
        return this.txHost.tx.getRepository(ReservationEntity);
    }

    /** t_reservation_detail */
    private get reservationDetails(): Repository<ReservationDetailEntity> {
        return this.txHost.tx.getRepository(ReservationDetailEntity);
    }

    /** t_payment */
    private get payments(): Repository<PaymentEntity> {
        return this.txHost.tx.getRepository(PaymentEntity);
    }

    /** t_store */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_room */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /** t_room_group */
    private get roomGroups(): Repository<RoomGroupEntity> {
        return this.txHost.tx.getRepository(RoomGroupEntity);
    }

    /** t_room_plan */
    private get roomPlans(): Repository<RoomPlanEntity> {
        return this.txHost.tx.getRepository(RoomPlanEntity);
    }

    /** t_room_group_plan */
    private get roomGroupPlans(): Repository<RoomGroupPlanEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanEntity);
    }

    /** t_room_group_plan_price */
    private get roomGroupPlanPrices(): Repository<RoomGroupPlanPriceEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanPriceEntity);
    }

    /** t_store_hour */
    private get storeHours(): Repository<StoreHourEntity> {
        return this.txHost.tx.getRepository(StoreHourEntity);
    }

    /** t_store_break */
    private get storeBreaks(): Repository<StoreBreakEntity> {
        return this.txHost.tx.getRepository(StoreBreakEntity);
    }

    /** t_store_unavailable_period */
    private get unavailablePeriods(): Repository<StoreUnavailablePeriodEntity> {
        return this.txHost.tx.getRepository(StoreUnavailablePeriodEntity);
    }

    /** t_user */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /**
     * 예약 업체 — 지워지지 않은 업체
     *
     * @param where 조회 조건
     * @returns 업체 또는 null
     */
    async findReservationStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 호실 — 지워지지 않은 호실
     *
     * @param where 조회 조건
     * @returns 호실 또는 null
     */
    async findReservationRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null> {
        try {
            return await this.rooms.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 호실의 객실 그룹 — 지워지지 않은 그룹
     *
     * @param where 조회 조건
     * @returns 그룹 또는 null
     */
    async findReservationRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity | null> {
        try {
            return await this.roomGroups.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체의 예약 가능 호실 — 지워지지 않은 호실 · 그룹
     *
     * @param store_id 업체 ID
     * @returns 호실 행(층 · 호실명 순)
     */
    async findBookableRooms(store_id: string): Promise<BookableRoomRow[]> {
        try {
            return await this.buildBookableRoomsQuery(store_id).getRawMany<BookableRoomRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 가능 호실 쿼리 — 매핑 민감(그룹 조인 · raw select — 별칭이 BookableRoomRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildBookableRoomsQuery(store_id: string): SelectQueryBuilder<RoomEntity> {
        return this.rooms
            .createQueryBuilder('r')
            .select('r.room_id', 'room_id')
            .addSelect('r.room_name', 'room_name')
            .addSelect('r.floor', 'floor')
            .addSelect('r.room_state_id', 'room_state_id')
            .addSelect('r.room_group_id', 'room_group_id')
            .addSelect('g.room_group_name', 'room_group_name')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = r.room_group_id')
            .where('r.store_id = :store_id', {store_id})
            .andWhere('r.is_deleted = 0')
            .andWhere('g.is_deleted = 0')
            .orderBy('r.floor', 'ASC')
            .addOrderBy('r.room_name', 'ASC');
    }

    /**
     * 업체 상품 설정 단건
     *
     * @param where 조회 조건
     * @returns 상품 설정 또는 null
     */
    async findStorePlan(where: FindOptionsWhere<RoomPlanEntity>): Promise<RoomPlanEntity | null> {
        try {
            return await this.roomPlans.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 목록
     *
     * @param where 조회 조건
     * @returns 그룹 상품 목록
     */
    async findGroupPlans(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity[]> {
        try {
            return await this.roomGroupPlans.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 목록 — 지워지지 않은 행
     *
     * @param where 조회 조건
     * @returns 기간 가격 목록
     */
    async findGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity[]> {
        try {
            return await this.roomGroupPlanPrices.find({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 요일별 영업시간 — 지워지지 않은 행
     *
     * @param store_id 업체 ID
     * @returns 영업시간 목록
     */
    async findStoreHours(store_id: string): Promise<StoreHourEntity[]> {
        try {
            return await this.storeHours.find({where: notDeleted<StoreHourEntity>({store_id}), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 브레이크타임 — 지워지지 않은 행
     *
     * @param store_id 업체 ID
     * @returns 브레이크타임 목록
     */
    async findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]> {
        try {
            return await this.storeBreaks.find({where: notDeleted<StoreBreakEntity>({store_id}), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 — 지워지지 않은 행
     *
     * @param where 조회 조건(service 가 겹침 조건을 만든다)
     * @returns 일시 예약불가 목록
     */
    async findUnavailablePeriods(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<StoreUnavailablePeriodEntity[]> {
        try {
            return await this.unavailablePeriods.find({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 목록
     *
     * @param where 조회 조건
     * @returns 예약 목록
     */
    async findReservations(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity[]> {
        try {
            return await this.reservations.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 같은 이용자 · 같은 호실에서 since 뒤에 결제 대기가 만료된 예약 수
     *
     * @param user_id 이용자 ID
     * @param room_id 호실 ID
     * @param since 기준 시각(지금 − 재예약 제한)
     * @returns 개수
     */
    async countRecentExpired(user_id: string, room_id: string, since: Date): Promise<number> {
        try {
            return await this.buildRecentExpiredQuery(user_id, room_id, since).getCount();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 최근 결제 대기 만료 쿼리 — 매핑 민감(기본 구간 조인 · 시각 조건)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 이용자 ID
     * @param room_id 호실 ID
     * @param since 기준 시각
     * @returns 쿼리 빌더
     */
    buildRecentExpiredQuery(user_id: string, room_id: string, since: Date): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .innerJoin(ReservationDetailEntity, 'd', 'd.reservation_id = r.reservation_id AND d.reservation_detail_type_id = :base', {base: RESERVATION_DETAIL_TYPE.BASE})
            .where('r.user_id = :user_id', {user_id})
            .andWhere('r.room_id = :room_id', {room_id})
            .andWhere('r.reservation_state_id = :expired', {expired: RESERVATION_STATE.EXPIRED})
            .andWhere('d.expires_at > :since', {since});
    }

    /**
     * 예약 단건
     *
     * @param where 조회 조건
     * @returns 예약 또는 null
     */
    async findReservation(where: FindOptionsWhere<ReservationEntity>): Promise<ReservationEntity | null> {
        try {
            return await this.reservations.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 구간 목록
     *
     * @param where 조회 조건
     * @returns 구간 목록
     */
    async findReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>): Promise<ReservationDetailEntity[]> {
        try {
            return await this.reservationDetails.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 단건
     *
     * @param where 조회 조건
     * @returns 결제 또는 null
     */
    async findPayment(where: FindOptionsWhere<PaymentEntity>): Promise<PaymentEntity | null> {
        try {
            return await this.payments.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 회원 단건 — 이용자 연락처 · 매니저 소속 업체
     *
     * @param where 조회 조건
     * @returns 회원 또는 null
     */
    async findReservationUser(where: FindOptionsWhere<UserEntity>): Promise<UserEntity | null> {
        try {
            return await this.users.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 등록
     *
     * @param entity 결제
     */
    async insertPayment(entity: PaymentEntity): Promise<void> {
        try {
            await this.payments.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 등록 — 같은 호실의 점유 예약과 [start_at, blocked_until) 이 겹치면 400
     *
     * @param entity 예약
     */
    async insertReservation(entity: ReservationEntity): Promise<void> {
        try {
            await this.reservations.insert(entity);
        } catch (error) {
            if (isExclusionViolation(error, RESERVATION_EXCLUSION)) {
                throw new BadRequestException({message: RESERVATION_TIME_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 예약 구간 등록
     *
     * @param entity 구간
     */
    async insertReservationDetail(entity: ReservationDetailEntity): Promise<void> {
        try {
            await this.reservationDetails.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 수정 — 상태 조건을 건 쓰기(그 사이 바뀌었는지 판별)
     *
     * @param where 수정 조건(상태 포함)
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 1행이면 true
     */
    async updateReservation(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean> {
        try {
            const result = await this.reservations.update(where, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 이동 — 옮길 호실의 점유 예약과 겹치면 400
     *
     * @param where 수정 조건(상태 포함)
     * @param entity room_id 만 할당한 엔티티
     * @returns 1행이면 true
     */
    async changeReservationRoom(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean> {
        try {
            const result = await this.reservations.update(where, entity);
            return result.affected === 1;
        } catch (error) {
            if (isExclusionViolation(error, RESERVATION_EXCLUSION)) {
                throw new BadRequestException({message: RESERVATION_ROOM_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 예약 구간 수정(여러 행)
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateReservationDetails(where: FindOptionsWhere<ReservationDetailEntity>, entity: ReservationDetailEntity): Promise<void> {
        try {
            await this.reservationDetails.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 수정 — 상태 조건을 건 쓰기
     *
     * @param where 수정 조건(상태 포함)
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 1행이면 true
     */
    async updatePayment(where: FindOptionsWhere<PaymentEntity>, entity: PaymentEntity): Promise<boolean> {
        try {
            const result = await this.payments.update(where, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 개수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countReservations(where: FindOptionsWhere<ReservationEntity>): Promise<number> {
        try {
            return await this.reservations.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 내 예약 목록 행
     *
     * @param user_id 이용자 ID
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 목록 행
     */
    async findMyReservationRows(user_id: string, limit: number, offset: number): Promise<ReservationListRow[]> {
        try {
            return await this.buildMyReservationsQuery(user_id, null).orderBy('r.start_at', 'DESC').limit(limit).offset(offset).getRawMany<ReservationListRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 내 예약 상세 행
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @returns 행 또는 null
     */
    async findMyReservationRow(user_id: string, reservation_id: string): Promise<ReservationListRow | null> {
        try {
            return (await this.buildMyReservationsQuery(user_id, reservation_id).getRawOne<ReservationListRow>()) ?? null;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 내 예약 쿼리 — 업체 · 호실 · 그룹 · 상품 종류 · 상태 조인(지운 업체 · 호실 · 그룹도 기록이라 그대로 보인다), 결제 대기 만료 제외, 예약 하나면 그 예약만.
     * 매핑 민감(조인 · raw select — 별칭이 ReservationListRow 키와 같다 · 동적 조립)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID — 목록은 null
     * @returns 쿼리 빌더
     */
    buildMyReservationsQuery(user_id: string, reservation_id: string | null): SelectQueryBuilder<ReservationEntity> {
        const query = this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.store_id', 'store_id')
            .addSelect('s.store_name', 'store_name')
            .addSelect('r.room_id', 'room_id')
            .addSelect('rm.room_name', 'room_name')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('r.room_plan_type_id', 'room_plan_type_id')
            .addSelect('pt.room_plan_type_name', 'room_plan_type_name')
            .addSelect('r.reservation_state_id', 'reservation_state_id')
            .addSelect('st.reservation_state_name', 'reservation_state_name')
            .addSelect('r.start_at', 'start_at')
            .addSelect('r.end_at', 'end_at')
            .addSelect('r.total_price', 'total_price')
            .addSelect('r.refund_deadline_at', 'refund_deadline_at')
            .addSelect('r.late_refund_percent', 'late_refund_percent')
            .addSelect('r.canceled_at', 'canceled_at')
            .addSelect('r.cancel_actor', 'cancel_actor')
            .addSelect('r.cancel_reason', 'cancel_reason')
            .addSelect('r.created_at', 'created_at')
            .innerJoin(StoreEntity, 's', 's.store_id = r.store_id')
            .innerJoin(RoomEntity, 'rm', 'rm.room_id = r.room_id')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = rm.room_group_id')
            .innerJoin(RoomPlanTypeEntity, 'pt', 'pt.room_plan_type_id = r.room_plan_type_id')
            .innerJoin(ReservationStateEntity, 'st', 'st.reservation_state_id = r.reservation_state_id')
            .where('r.user_id = :user_id', {user_id})
            .andWhere('r.reservation_state_id <> :expired', {expired: RESERVATION_STATE.EXPIRED});
        if (reservation_id !== null) {
            query.andWhere('r.reservation_id = :reservation_id', {reservation_id});
        }
        return query;
    }

    /**
     * 예약 구간 행
     *
     * @param reservation_id 예약 ID
     * @returns 구간 행(시작 순)
     */
    async findReservationSegmentRows(reservation_id: string): Promise<ReservationSegmentRow[]> {
        try {
            return await this.buildReservationSegmentsQuery(reservation_id).getRawMany<ReservationSegmentRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 예약 구간 쿼리 — 구간 종류 · 상태 · 결제 · 결제 상태 조인. 매핑 민감(조인 · raw select — 별칭이 ReservationSegmentRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param reservation_id 예약 ID
     * @returns 쿼리 빌더
     */
    buildReservationSegmentsQuery(reservation_id: string): SelectQueryBuilder<ReservationDetailEntity> {
        return this.reservationDetails
            .createQueryBuilder('d')
            .select('d.reservation_detail_id', 'reservation_detail_id')
            .addSelect('d.reservation_detail_type_id', 'reservation_detail_type_id')
            .addSelect('dt.reservation_detail_type_name', 'reservation_detail_type_name')
            .addSelect('d.reservation_state_id', 'reservation_state_id')
            .addSelect('d.start_at', 'start_at')
            .addSelect('d.end_at', 'end_at')
            .addSelect('d.price', 'price')
            .addSelect('d.expires_at', 'expires_at')
            .addSelect('d.payment_id', 'payment_id')
            .addSelect('p.payment_state_id', 'payment_state_id')
            .addSelect('ps.payment_state_name', 'payment_state_name')
            .addSelect('p.amount', 'amount')
            .addSelect('p.method', 'method')
            .addSelect('p.approved_at', 'approved_at')
            .addSelect('p.receipt_url', 'receipt_url')
            .addSelect('p.refund_amount', 'refund_amount')
            .addSelect('p.refunded_at', 'refunded_at')
            .innerJoin(ReservationDetailTypeEntity, 'dt', 'dt.reservation_detail_type_id = d.reservation_detail_type_id')
            .innerJoin(PaymentEntity, 'p', 'p.payment_id = d.payment_id')
            .innerJoin(PaymentStateEntity, 'ps', 'ps.payment_state_id = p.payment_state_id')
            .where('d.reservation_id = :reservation_id', {reservation_id})
            .orderBy('d.start_at', 'ASC');
    }

    /**
     * 업체 현황 호실 행
     *
     * @param store_id 업체 ID
     * @returns 호실 행(층 · 호실명 순)
     */
    async findStoreRoomRows(store_id: string): Promise<StoreRoomRow[]> {
        try {
            return await this.buildStoreRoomsQuery(store_id).getRawMany<StoreRoomRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 현황 호실 쿼리 — 지워지지 않은 호실 · 그룹 + 호실 상태명. 매핑 민감(조인 · raw select — 별칭이 StoreRoomRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreRoomsQuery(store_id: string): SelectQueryBuilder<RoomEntity> {
        return this.rooms
            .createQueryBuilder('r')
            .select('r.room_id', 'room_id')
            .addSelect('r.room_name', 'room_name')
            .addSelect('r.floor', 'floor')
            .addSelect('r.room_group_id', 'room_group_id')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('r.room_state_id', 'room_state_id')
            .addSelect('rs.room_state_name', 'room_state_name')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = r.room_group_id')
            .innerJoin(RoomStateEntity, 'rs', 'rs.room_state_id = r.room_state_id')
            .where('r.store_id = :store_id', {store_id})
            .andWhere('r.is_deleted = 0')
            .andWhere('g.is_deleted = 0')
            .orderBy('r.floor', 'ASC')
            .addOrderBy('r.room_name', 'ASC');
    }

    /**
     * 업체 현황 예약 행
     *
     * @param store_id 업체 ID
     * @param from 날짜 0시
     * @param to 다음 날 0시
     * @returns 예약 행(입실 순)
     */
    async findStoreReservationRows(store_id: string, from: Date, to: Date): Promise<StoreReservationRow[]> {
        try {
            return await this.buildStoreReservationsQuery(store_id, from, to).getRawMany<StoreReservationRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 현황 예약 쿼리 — [from, to) 와 겹치는 결제 대기 · 확정 · 이용 중 · 이용 완료, 상태 · 상품 종류 · 이용자 조인.
     * 매핑 민감(조인 · raw select — 별칭이 StoreReservationRow 키와 같다 · IN · 시각 조건)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @param from 날짜 0시
     * @param to 다음 날 0시
     * @returns 쿼리 빌더
     */
    buildStoreReservationsQuery(store_id: string, from: Date, to: Date): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('r')
            .select('r.reservation_id', 'reservation_id')
            .addSelect('r.room_id', 'room_id')
            .addSelect('r.reservation_state_id', 'reservation_state_id')
            .addSelect('st.reservation_state_name', 'reservation_state_name')
            .addSelect('r.room_plan_type_id', 'room_plan_type_id')
            .addSelect('pt.room_plan_type_name', 'room_plan_type_name')
            .addSelect('r.start_at', 'start_at')
            .addSelect('r.end_at', 'end_at')
            .addSelect('r.blocked_until', 'blocked_until')
            .addSelect('r.total_price', 'total_price')
            .addSelect('u.name', 'user_name')
            .addSelect('u.phone', 'user_phone')
            .innerJoin(ReservationStateEntity, 'st', 'st.reservation_state_id = r.reservation_state_id')
            .innerJoin(RoomPlanTypeEntity, 'pt', 'pt.room_plan_type_id = r.room_plan_type_id')
            .innerJoin(UserEntity, 'u', 'u.user_id = r.user_id')
            .where('r.store_id = :store_id', {store_id})
            .andWhere('r.reservation_state_id IN (:...states)', {states: RESERVATION_STORE_VISIBLE_STATES})
            .andWhere('r.start_at < :to', {to})
            .andWhere('r.end_at > :from', {from})
            .orderBy('r.start_at', 'ASC');
    }
}
```
### user-service — 예약 service (`apps/user-service/src/reservation/reservation.service.ts`)

형제: public 1개 = API 1개 · JSDoc 전송 경로 · 엔티티 `new` + 할당(room.service.ts), 커밋해야 하는 실패의 반환 `confirmPhoneVerification`(user.service.ts:404 — `Promise<T | BadRequestException>`), 상태 조건 쓰기 false → 400 롤백(store `updateApplication`), 외부 발송은 마지막 단계(store 입점 승인 SMS). private 헬퍼 없이 순수 계산은 reservation.util.ts.

```ts
// apps/user-service/src/reservation/reservation.service.ts — new
import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {In, LessThan, MoreThan, Not} from 'typeorm';
import {Pagination} from '@app/common/utils/pagination.js';
import {generateId} from '@app/common/utils/id.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {ReservationAvailabilityDto, ReservationAvailabilityResultDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import type {ReservationCancelDto, ReservationCancelResultDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import type {ReservationDetailResultDto} from '@app/contracts/reservation/dto/reservation-detail.dto.js';
import type {ReservationListDto, ReservationListResultDto} from '@app/contracts/reservation/dto/reservation-list.dto.js';
import type {ReservationPaymentConfirmDto, ReservationPaymentConfirmResultDto} from '@app/contracts/reservation/dto/reservation-payment-confirm.dto.js';
import type {ReservationRoomChangeDto} from '@app/contracts/reservation/dto/reservation-room-change.dto.js';
import type {ReservationStoreCancelDto} from '@app/contracts/reservation/dto/reservation-store-cancel.dto.js';
import type {ReservationStoreDto, ReservationStoreResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import type {ReservationDto, ReservationResultDto} from '@app/contracts/reservation/dto/reservation.dto.js';
import {
    PAYMENT_STATE,
    RESERVATION_CANCEL_ACTOR,
    RESERVATION_DETAIL_TYPE,
    RESERVATION_OCCUPYING_STATES,
    RESERVATION_PAYMENT_PENDING_MINUTES,
    RESERVATION_REBOOK_BLOCK_MINUTES,
    RESERVATION_REFUND_REASON,
    RESERVATION_STATE,
} from '@app/contracts/reservation/reservation.constants.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {PAYMENT_GATEWAY, SMS_SENDER} from '@app/integration/integration.symbols.js';
import {verifyPaymentLookup} from '@app/integration/integration.util.js';
import type {PaymentGatewayInterface, PaymentLookupResult, SmsSenderInterface} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from './interfaces/reservation.repository.interface.js';
import {
    RESERVATION_DATE_INVALID_MESSAGE,
    RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE,
    RESERVATION_NOT_CANCELABLE_MESSAGE,
    RESERVATION_NOT_FOUND_MESSAGE,
    RESERVATION_PAYMENT_NOT_FOUND_MESSAGE,
    RESERVATION_PLAN_TYPE,
    RESERVATION_ROOM_NOT_FOUND_MESSAGE,
    RESERVATION_ROOM_STATE,
    RESERVATION_STATE_CHANGED_MESSAGE,
    RESERVATION_STORE_NOT_FOUND_MESSAGE,
    RESERVATION_STORE_STATE_ACTIVE,
} from './reservation.constants.js';
import {RESERVATION_REPOSITORY} from './reservation.symbols.js';
import {
    buildBookingContext,
    buildOrderName,
    buildRoomChangeSms,
    buildStoreCancelSms,
    calculateRefundAmount,
    calculateStayPrice,
    isGroupPlanOnSale,
    isNightsAllowed,
    isStayBookable,
    isValidDate,
    listStays,
    nowKst,
    toAvailabilityRooms,
    toKstDay,
    toReservationDetail,
    toReservationListItem,
    toStay,
    toStaysRange,
    toStoreReservationRooms,
} from './reservation.util.js';

/**
 * 예약 service — 재고 판정 · 예약 · 결제 확인 · 취소 · 조회 · 업체 취소 · 호실 이동.
 * 업체 · 객실 · 상품 · 영업시간은 공유 DB 에서 같은 엔티티로 읽는다(사용자 결정 2026-11-03). 결제는 토스(프론트 승인 · 여기 조회 대조), 환불은 scheduler crontab 이 백그라운드로 한다.
 */
@Injectable()
export class ReservationService {
    /**
     * @param reservationRepository 예약 repository 포트
     * @param paymentGateway 결제 포트(토스)
     * @param smsSender SMS 발송 포트(업체 취소 · 호실 이동 안내)
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayInterface,
        @Inject(SMS_SENDER) private readonly smsSender: SmsSenderInterface,
    ) {}

    /**
     * 호실별 예약 가능 시간 — 업체 · 날짜 · 상품(연박은 박수). 이 상품을 파는 호실만, 구간은 재고 판정을 지난 것만. (내부 HTTP: GET /internal/v1/user-service/reservation/availability)
     *
     * @param dto 업체 · 날짜 · 상품 · 박수
     * @returns 호실별 금액 · 예약 가능 구간
     * @throws BadRequestException 없는 날짜 · 박수가 업체 설정 밖
     * @throws NotFoundException 업체가 없거나 활성이 아닐 때
     */
    async getAvailability(dto: ReservationAvailabilityDto): Promise<ReservationAvailabilityResultDto> {
        // 1. 날짜 · 박수
        if (!isValidDate(dto.date)) {
            throw new BadRequestException({message: RESERVATION_DATE_INVALID_MESSAGE, validation_errors: createValidationError('date', RESERVATION_DATE_INVALID_MESSAGE)});
        }
        const nights = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? Number(dto.nights) : null;
        const empty: ReservationAvailabilityResultDto = {room_plan_type_id: dto.room_plan_type_id, date: dto.date, nights, list: []};

        // 2. 업체 — 활성 · 지워지지 않음
        const store = await this.reservationRepository.findReservationStore({store_id: dto.store_id, store_state_id: RESERVATION_STORE_STATE_ACTIVE});
        if (!store) {
            throw new NotFoundException({message: RESERVATION_STORE_NOT_FOUND_MESSAGE});
        }

        // 3. 업체 상품 설정 — 팔지 않으면 빈 목록, 연박은 박수
        const plan = await this.reservationRepository.findStorePlan({store_id: store.store_id, room_plan_type_id: dto.room_plan_type_id});
        if (!plan || plan.is_used !== 1) {
            return empty;
        }
        if (nights !== null && !isNightsAllowed(plan, nights)) {
            const message = `연박은 ${plan.min_nights} ~ ${plan.max_nights}박으로 예약할 수 있습니다.`;
            throw new BadRequestException({message, validation_errors: createValidationError('nights', message)});
        }

        // 4. 호실 · 판매 중인 그룹 상품 · 기간 가격
        const rooms = await this.reservationRepository.findBookableRooms(store.store_id);
        const group_ids = [...new Set(rooms.map((room) => room.room_group_id))];
        if (group_ids.length === 0) {
            return empty;
        }
        const group_plans = (await this.reservationRepository.findGroupPlans({room_group_id: In(group_ids), room_plan_type_id: plan.room_plan_type_id})).filter(isGroupPlanOnSale);
        if (group_plans.length === 0) {
            return empty;
        }
        const periods = await this.reservationRepository.findGroupPlanPrices({room_group_plan_id: In(group_plans.map((item) => item.room_group_plan_id))});

        // 5. 후보 구간 · 재고 판정 재료(조회 범위 안의 일시 예약불가 · 점유 예약)
        const stays = listStays(plan, toKstDay(dto.date), nights);
        const range = toStaysRange(stays, store.maintenance_minutes);
        const hours = await this.reservationRepository.findStoreHours(store.store_id);
        const breaks = await this.reservationRepository.findStoreBreaks(store.store_id);
        const unavailable = await this.reservationRepository.findUnavailablePeriods({store_id: store.store_id, starts_at: LessThan(range.to), ends_at: MoreThan(range.from)});
        const occupied = await this.reservationRepository.findReservations({
            room_id: In(rooms.map((room) => room.room_id)),
            reservation_state_id: In(RESERVATION_OCCUPYING_STATES),
            start_at: LessThan(range.to),
            blocked_until: MoreThan(range.from),
        });
        const context = buildBookingContext(nowKst(), store, plan, hours, breaks, unavailable);

        // 6. 호실별 금액 · 구간
        return {...empty, list: toAvailabilityRooms(rooms, group_plans, periods, stays, context, occupied, nights)};
    }

    /**
     * 예약 생성 — 재고 판정을 다시 하고 결제(READY) → 예약(PENDING) → 기본 구간(PENDING · 결제 대기 5분)을 만든다. (RabbitMQ: user.reservation.create)
     * - 환불 마감 시각 · 마감 뒤 환불 비율 · 정비시간은 예약 때 업체 값을 저장한다
     * - 같은 호실 점유 겹침의 최종 판정은 배타 제약(repository 가 400)
     *
     * @param user_id 이용자 ID
     * @param dto 호실 · 상품 · 날짜 · 시작 시각 · 박수
     * @returns 예약 ID · 결제 정보(토스 orderId · 금액 · 주문명) · 결제 대기 만료 · 이용 구간
     */
    @Transactional()
    async createReservation(user_id: string, dto: ReservationDto): Promise<ReservationResultDto> {
        // 1. 날짜
        if (!isValidDate(dto.date)) {
            throw new BadRequestException({message: RESERVATION_DATE_INVALID_MESSAGE, validation_errors: createValidationError('date', RESERVATION_DATE_INVALID_MESSAGE)});
        }
        const nights = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? (dto.nights as number) : null;
        const start_time = dto.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY ? (dto.start_time as string) : null;

        // 2. 호실 · 그룹 · 업체
        const room = await this.reservationRepository.findReservationRoom({room_id: dto.room_id});
        const group = room ? await this.reservationRepository.findReservationRoomGroup({room_group_id: room.room_group_id}) : null;
        if (!room || !group) {
            throw new NotFoundException({message: RESERVATION_ROOM_NOT_FOUND_MESSAGE});
        }
        const store = await this.reservationRepository.findReservationStore({store_id: room.store_id, store_state_id: RESERVATION_STORE_STATE_ACTIVE});
        if (!store) {
            throw new NotFoundException({message: RESERVATION_STORE_NOT_FOUND_MESSAGE});
        }

        // 3. 상품 — 업체 상품 설정 · 그룹 상품 판매, 연박 박수
        const plan = await this.reservationRepository.findStorePlan({store_id: store.store_id, room_plan_type_id: dto.room_plan_type_id});
        const [group_plan] = await this.reservationRepository.findGroupPlans({room_group_id: group.room_group_id, room_plan_type_id: dto.room_plan_type_id});
        if (!plan || plan.is_used !== 1 || !group_plan || !isGroupPlanOnSale(group_plan)) {
            throw new BadRequestException({message: '판매하지 않는 상품입니다.'});
        }
        if (nights !== null && !isNightsAllowed(plan, nights)) {
            const message = `연박은 ${plan.min_nights} ~ ${plan.max_nights}박으로 예약할 수 있습니다.`;
            throw new BadRequestException({message, validation_errors: createValidationError('nights', message)});
        }

        // 4. 같은 호실 재예약 제한 — 결제 대기 만료 시각부터 10분
        const now = nowKst();
        const recent = await this.reservationRepository.countRecentExpired(user_id, room.room_id, now.subtract(RESERVATION_REBOOK_BLOCK_MINUTES, 'minute').toDate());
        if (recent > 0) {
            throw new BadRequestException({message: '결제하지 않아 만료된 호실은 10분 뒤에 다시 예약할 수 있습니다.'});
        }

        // 5. 이용 구간 · 재고 판정
        const stay = toStay(plan, toKstDay(dto.date), start_time, nights);
        const range = toStaysRange([stay], store.maintenance_minutes);
        const hours = await this.reservationRepository.findStoreHours(store.store_id);
        const breaks = await this.reservationRepository.findStoreBreaks(store.store_id);
        const unavailable = await this.reservationRepository.findUnavailablePeriods({store_id: store.store_id, starts_at: LessThan(range.to), ends_at: MoreThan(range.from)});
        const occupied = await this.reservationRepository.findReservations({
            room_id: room.room_id,
            reservation_state_id: In(RESERVATION_OCCUPYING_STATES),
            start_at: LessThan(range.to),
            blocked_until: MoreThan(range.from),
        });
        if (!isStayBookable(stay, buildBookingContext(now, store, plan, hours, breaks, unavailable), room.room_state_id, occupied)) {
            throw new BadRequestException({message: '예약할 수 없는 시간입니다.'});
        }

        // 6. 금액 · 주문명
        const periods = await this.reservationRepository.findGroupPlanPrices({room_group_plan_id: group_plan.room_group_plan_id});
        const amount = calculateStayPrice(plan.room_plan_type_id, stay.day, nights, group_plan.price, periods);
        const order_name = buildOrderName(store.store_name, room.room_name, plan.room_plan_type_id, nights);
        const expires_at = now.add(RESERVATION_PAYMENT_PENDING_MINUTES, 'minute').toDate();

        // 7. 결제(READY) — 결제 환경은 키 접두사로(키가 없으면 503)
        const payment = new PaymentEntity();
        payment.payment_id = generateId();
        payment.user_id = user_id;
        payment.payment_state_id = PAYMENT_STATE.READY;
        payment.environment = this.paymentGateway.environment();
        payment.order_name = order_name;
        payment.amount = amount;
        payment.payment_key = null;
        payment.method = null;
        payment.approved_at = null;
        payment.receipt_url = null;
        payment.refund_amount = null;
        payment.refund_reason = null;
        payment.refund_requested_at = null;
        payment.refunded_at = null;
        payment.failure_code = null;
        payment.failure_message = null;
        await this.reservationRepository.insertPayment(payment);

        // 8. 예약(PENDING) — 점유 겹침은 배타 제약이 400
        const reservation = new ReservationEntity();
        reservation.reservation_id = generateId();
        reservation.user_id = user_id;
        reservation.store_id = store.store_id;
        reservation.room_id = room.room_id;
        reservation.room_plan_type_id = plan.room_plan_type_id;
        reservation.reservation_state_id = RESERVATION_STATE.PENDING;
        reservation.start_at = stay.start.toDate();
        reservation.end_at = stay.end.toDate();
        reservation.maintenance_minutes = store.maintenance_minutes;
        reservation.blocked_until = stay.end.add(store.maintenance_minutes, 'minute').toDate();
        reservation.total_price = amount;
        reservation.refund_deadline_at = stay.start.subtract(store.refund_deadline_minutes, 'minute').toDate();
        reservation.late_refund_percent = store.late_refund_percent;
        reservation.checked_in_at = null;
        reservation.completed_at = null;
        reservation.canceled_at = null;
        reservation.cancel_actor = null;
        reservation.cancel_reason = null;
        await this.reservationRepository.insertReservation(reservation);

        // 9. 기본 구간(PENDING · 결제 대기 만료)
        const detail = new ReservationDetailEntity();
        detail.reservation_detail_id = generateId();
        detail.reservation_id = reservation.reservation_id;
        detail.reservation_detail_type_id = RESERVATION_DETAIL_TYPE.BASE;
        detail.room_plan_type_id = plan.room_plan_type_id;
        detail.reservation_state_id = RESERVATION_STATE.PENDING;
        detail.payment_id = payment.payment_id;
        detail.start_at = reservation.start_at;
        detail.end_at = reservation.end_at;
        detail.price = amount;
        detail.expires_at = expires_at;
        await this.reservationRepository.insertReservationDetail(detail);

        return {
            reservation_id: reservation.reservation_id,
            payment_id: payment.payment_id,
            order_name,
            amount,
            expires_at: expires_at.toISOString(),
            start_at: reservation.start_at.toISOString(),
            end_at: reservation.end_at.toISOString(),
        };
    }

    /**
     * 결제 확인 — 프론트가 토스 승인 뒤 넘긴 결제 키로 토스에서 다시 읽어 대조한다(verifyPaymentLookup). (RabbitMQ: user.reservation.payment-confirm)
     * - 결제됨 → 결제 DONE · 구간 · 예약 CONFIRMED / 미결제 · 다른 주문 → 400(쓰기 없음)
     * - 금액 불일치 · 이미 결제 대기가 끝난 예약 → 결제 환불 신청(+ 예약 만료)을 커밋하고 실패를 **반환**한다(재시도 없음)
     * - 같은 결제 키로 이미 확정 → 그대로 결과(중복 요청)
     *
     * @param user_id 이용자 ID
     * @param dto 결제 ID · 결제 키
     * @returns 예약 ID · 상태 — 환불 신청한 실패는 BadRequestException 을 돌려준다
     */
    @Transactional()
    async confirmPayment(user_id: string, dto: ReservationPaymentConfirmDto): Promise<ReservationPaymentConfirmResultDto | BadRequestException> {
        // 1. 내 결제 · 구간 · 예약
        const payment = await this.reservationRepository.findPayment({payment_id: dto.payment_id, user_id});
        const [detail] = payment ? await this.reservationRepository.findReservationDetails({payment_id: payment.payment_id}) : [];
        const reservation = detail ? await this.reservationRepository.findReservation({reservation_id: detail.reservation_id}) : null;
        if (!payment || !detail || !reservation) {
            throw new NotFoundException({message: RESERVATION_PAYMENT_NOT_FOUND_MESSAGE});
        }

        // 2. 이미 확정 — 같은 결제 키면 지금 상태, 다른 키면 400
        if (payment.payment_state_id === PAYMENT_STATE.DONE) {
            if (payment.payment_key === dto.payment_key) {
                return {reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id};
            }
            throw new BadRequestException({message: '이미 다른 결제로 확정된 예약입니다.'});
        }
        if (payment.payment_state_id !== PAYMENT_STATE.READY && payment.payment_state_id !== PAYMENT_STATE.EXPIRED) {
            throw new BadRequestException({message: '확인할 수 없는 결제입니다.'});
        }

        // 3. 토스에서 다시 읽어 대조
        const lookup = await this.paymentGateway.getPayment(dto.payment_key);
        const verdict = verifyPaymentLookup(lookup, payment.payment_id, payment.amount);
        if (verdict === 'NOT_PAID') {
            throw new BadRequestException({message: '결제가 완료되지 않았습니다.'});
        }
        if (verdict === 'FOREIGN') {
            throw new BadRequestException({message: '결제 정보가 맞지 않습니다.'});
        }
        const paid = lookup as PaymentLookupResult;
        const now = nowKst().toDate();

        // 4. 금액 불일치 · 결제 대기가 끝난 예약 — 토스가 받은 금액 전액 환불 신청(+ 아직 결제 대기면 만료), 커밋 뒤 실패를 반환
        const pending = reservation.reservation_state_id === RESERVATION_STATE.PENDING && detail.reservation_state_id === RESERVATION_STATE.PENDING;
        if (verdict === 'MISMATCH' || !pending) {
            const refund = new PaymentEntity();
            refund.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
            refund.payment_key = paid.payment_key;
            refund.method = paid.method;
            refund.approved_at = paid.approved_at ?? now;
            refund.receipt_url = paid.receipt_url;
            refund.refund_amount = paid.total_amount;
            refund.refund_reason = verdict === 'MISMATCH' ? RESERVATION_REFUND_REASON.AMOUNT_MISMATCH : RESERVATION_REFUND_REASON.LATE_PAYMENT;
            refund.refund_requested_at = now;
            if (!(await this.reservationRepository.updatePayment({payment_id: payment.payment_id, payment_state_id: payment.payment_state_id}, refund))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
            if (pending) {
                const expiredDetail = new ReservationDetailEntity();
                expiredDetail.reservation_state_id = RESERVATION_STATE.EXPIRED;
                await this.reservationRepository.updateReservationDetails({payment_id: payment.payment_id, reservation_state_id: RESERVATION_STATE.PENDING}, expiredDetail);
                const expired = new ReservationEntity();
                expired.reservation_state_id = RESERVATION_STATE.EXPIRED;
                await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.PENDING}, expired);
            }
            return new BadRequestException({message: verdict === 'MISMATCH' ? '결제 금액이 맞지 않아 결제를 취소했습니다.' : '결제 대기 시간이 지나 결제를 취소했습니다. 다시 예약해주세요.'});
        }

        // 5. 확정 — 결제 DONE → 구간 → 예약 (상태 조건 — crontab 과 겹치면 400 롤백)
        const done = new PaymentEntity();
        done.payment_state_id = PAYMENT_STATE.DONE;
        done.payment_key = paid.payment_key;
        done.method = paid.method;
        done.approved_at = paid.approved_at ?? now;
        done.receipt_url = paid.receipt_url;
        if (!(await this.reservationRepository.updatePayment({payment_id: payment.payment_id, payment_state_id: PAYMENT_STATE.READY}, done))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        const confirmedDetail = new ReservationDetailEntity();
        confirmedDetail.reservation_state_id = RESERVATION_STATE.CONFIRMED;
        await this.reservationRepository.updateReservationDetails({payment_id: payment.payment_id, reservation_state_id: RESERVATION_STATE.PENDING}, confirmedDetail);
        const confirmed = new ReservationEntity();
        confirmed.reservation_state_id = RESERVATION_STATE.CONFIRMED;
        if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.PENDING}, confirmed))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        return {reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED};
    }

    /**
     * 이용자 취소 — 사유 필수. 확정 예약은 환불 마감 전 100% · 마감 뒤 ~ 이용 시작 전 예약 때 비율(원 단위 내림) 환불 신청, 시작 뒤에는 400.
     * 결제 대기 예약은 결제를 만료한다(환불 없음 — 늦은 승인은 recheck crontab 이 환불한다). 호실은 바로 풀린다. (RabbitMQ: user.reservation.cancel)
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @param dto 취소 사유
     * @returns 환불 금액(결제 대기 취소는 null)
     */
    @Transactional()
    async cancelReservation(user_id: string, reservation_id: string, dto: ReservationCancelDto): Promise<ReservationCancelResultDto> {
        // 1. 내 예약
        const reservation = await this.reservationRepository.findReservation({reservation_id, user_id});
        if (!reservation || reservation.reservation_state_id === RESERVATION_STATE.EXPIRED) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        if (reservation.reservation_state_id !== RESERVATION_STATE.PENDING && reservation.reservation_state_id !== RESERVATION_STATE.CONFIRMED) {
            throw new BadRequestException({message: RESERVATION_NOT_CANCELABLE_MESSAGE});
        }
        const now = nowKst();
        const details = await this.reservationRepository.findReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id});

        // 2. 확정 예약 — 결제마다 환불액(시작 뒤면 400)
        const refunds: {payment_id: string; amount: number}[] = [];
        if (reservation.reservation_state_id === RESERVATION_STATE.CONFIRMED) {
            for (const detail of details) {
                const payment = await this.reservationRepository.findPayment({payment_id: detail.payment_id});
                const amount = payment ? calculateRefundAmount(payment.amount, now, reservation.refund_deadline_at, reservation.start_at, reservation.late_refund_percent) : null;
                if (amount === null) {
                    throw new BadRequestException({message: '이용 시작 후에는 취소할 수 없습니다.'});
                }
                refunds.push({payment_id: detail.payment_id, amount});
            }
        }

        // 3. 예약 · 구간 취소(상태 조건)
        const canceled = new ReservationEntity();
        canceled.reservation_state_id = RESERVATION_STATE.CANCELED;
        canceled.canceled_at = now.toDate();
        canceled.cancel_actor = RESERVATION_CANCEL_ACTOR.USER;
        canceled.cancel_reason = dto.cancel_reason;
        if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id}, canceled))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        const canceledDetail = new ReservationDetailEntity();
        canceledDetail.reservation_state_id = RESERVATION_STATE.CANCELED;
        await this.reservationRepository.updateReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id}, canceledDetail);

        // 4. 결제 대기 — 결제 만료(환불 없음)
        if (reservation.reservation_state_id === RESERVATION_STATE.PENDING) {
            for (const detail of details) {
                const expired = new PaymentEntity();
                expired.payment_state_id = PAYMENT_STATE.EXPIRED;
                await this.reservationRepository.updatePayment({payment_id: detail.payment_id, payment_state_id: PAYMENT_STATE.READY}, expired);
            }
            return {refund_amount: null};
        }

        // 5. 확정 — 환불액 > 0 이면 환불 신청(백그라운드 crontab 이 토스로), 0 이면 결제는 그대로(환불 없이 취소)
        for (const refund of refunds.filter((item) => item.amount > 0)) {
            const requested = new PaymentEntity();
            requested.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
            requested.refund_amount = refund.amount;
            requested.refund_reason = RESERVATION_REFUND_REASON.USER;
            requested.refund_requested_at = now.toDate();
            if (!(await this.reservationRepository.updatePayment({payment_id: refund.payment_id, payment_state_id: PAYMENT_STATE.DONE}, requested))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
        }
        return {refund_amount: refunds.reduce((sum, item) => sum + item.amount, 0)};
    }

    /**
     * 내 예약 목록 — 결제 대기 만료 건 제외, 입실 최근순. (내부 HTTP: GET /internal/v1/user-service/reservation)
     *
     * @param user_id 이용자 ID
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getMyReservations(user_id: string, dto: ReservationListDto): Promise<ReservationListResultDto> {
        const total_count = await this.reservationRepository.countReservations({user_id, reservation_state_id: Not(RESERVATION_STATE.EXPIRED)});
        const pagination = new Pagination({...dto, total_count});
        const rows = await this.reservationRepository.findMyReservationRows(user_id, pagination.limit, pagination.offset);
        return {list: rows.map(toReservationListItem), pagination: pagination.getPagination()};
    }

    /**
     * 내 예약 상세 — 구간 · 결제 포함, 남의 예약 · 결제 대기 만료 건은 404. (내부 HTTP: GET /internal/v1/user-service/reservation/:reservation_id)
     *
     * @param user_id 이용자 ID
     * @param reservation_id 예약 ID
     * @returns 상세
     */
    async getMyReservation(user_id: string, reservation_id: string): Promise<ReservationDetailResultDto> {
        const row = await this.reservationRepository.findMyReservationRow(user_id, reservation_id);
        if (!row) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        const segments = await this.reservationRepository.findReservationSegmentRows(row.reservation_id);
        return toReservationDetail(row, segments);
    }

    /**
     * 내 업체 예약 현황 (매니저) — 날짜(한국 날짜) 하루와 겹치는 결제 대기 · 확정 · 이용 중 · 이용 완료 예약을 호실별로(이용자 이름 · 휴대폰 포함). (내부 HTTP: GET /internal/v1/user-service/reservation/store)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 날짜
     * @returns 호실별 예약
     */
    async getStoreReservations(user_id: string, dto: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        // 1. 날짜
        if (!isValidDate(dto.date)) {
            throw new BadRequestException({message: RESERVATION_DATE_INVALID_MESSAGE, validation_errors: createValidationError('date', RESERVATION_DATE_INVALID_MESSAGE)});
        }

        // 2. 매니저의 소속 업체
        const manager = await this.reservationRepository.findReservationUser({user_id, login_scope: LOGIN_SCOPE.MANAGER});
        if (!manager?.store_id) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 3. 호실 · 그날 예약
        const day = toKstDay(dto.date);
        const rooms = await this.reservationRepository.findStoreRoomRows(manager.store_id);
        const rows = await this.reservationRepository.findStoreReservationRows(manager.store_id, day.toDate(), day.add(1, 'day').toDate());
        return {date: dto.date, list: toStoreReservationRooms(rooms, rows)};
    }

    /**
     * 업체 취소 (매니저) — 내 업체의 결제 대기 · 확정 예약. 확정은 100% 환불 신청, 결제 대기는 결제 만료. 이용자에게 SMS(번호가 있을 때 — 마지막 단계). (RabbitMQ: user.reservation.store-cancel)
     *
     * @param user_id 로그인 매니저 ID
     * @param reservation_id 예약 ID
     * @param dto 취소 사유
     */
    @Transactional()
    async cancelStoreReservation(user_id: string, reservation_id: string, dto: ReservationStoreCancelDto): Promise<void> {
        // 1. 매니저의 소속 업체 · 그 업체 예약
        const manager = await this.reservationRepository.findReservationUser({user_id, login_scope: LOGIN_SCOPE.MANAGER});
        if (!manager?.store_id) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const reservation = await this.reservationRepository.findReservation({reservation_id, store_id: manager.store_id});
        if (!reservation) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        if (reservation.reservation_state_id !== RESERVATION_STATE.PENDING && reservation.reservation_state_id !== RESERVATION_STATE.CONFIRMED) {
            throw new BadRequestException({message: RESERVATION_NOT_CANCELABLE_MESSAGE});
        }
        const now = nowKst().toDate();
        const details = await this.reservationRepository.findReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id});

        // 2. 예약 · 구간 취소(상태 조건)
        const canceled = new ReservationEntity();
        canceled.reservation_state_id = RESERVATION_STATE.CANCELED;
        canceled.canceled_at = now;
        canceled.cancel_actor = RESERVATION_CANCEL_ACTOR.STORE;
        canceled.cancel_reason = dto.cancel_reason;
        if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id}, canceled))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        const canceledDetail = new ReservationDetailEntity();
        canceledDetail.reservation_state_id = RESERVATION_STATE.CANCELED;
        await this.reservationRepository.updateReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id}, canceledDetail);

        // 3. 결제 — 확정은 전액 환불 신청, 결제 대기는 만료
        for (const detail of details) {
            const payment = new PaymentEntity();
            if (reservation.reservation_state_id === RESERVATION_STATE.CONFIRMED) {
                payment.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
                payment.refund_amount = detail.price;
                payment.refund_reason = RESERVATION_REFUND_REASON.STORE;
                payment.refund_requested_at = now;
                await this.reservationRepository.updatePayment({payment_id: detail.payment_id, payment_state_id: PAYMENT_STATE.DONE}, payment);
            } else {
                payment.payment_state_id = PAYMENT_STATE.EXPIRED;
                await this.reservationRepository.updatePayment({payment_id: detail.payment_id, payment_state_id: PAYMENT_STATE.READY}, payment);
            }
        }

        // 4. 이용자 SMS — 번호가 있을 때만(마지막 단계)
        const user = await this.reservationRepository.findReservationUser({user_id: reservation.user_id});
        const store = await this.reservationRepository.findReservationStore({store_id: reservation.store_id});
        if (user?.phone && store) {
            await this.smsSender.send({to: user.phone, text: buildStoreCancelSms(store.store_name, reservation.start_at, dto.cancel_reason)});
        }
    }

    /**
     * 호실 이동 (매니저) — 내 업체의 이용 시작 전 확정 예약을 같은 객실 그룹 · 사용중지 아닌 다른 호실로. 겹침은 배타 제약이 400, 금액 · 시간은 그대로. 이용자에게 SMS. (RabbitMQ: user.reservation.room-change)
     *
     * @param user_id 로그인 매니저 ID
     * @param reservation_id 예약 ID
     * @param dto 옮길 호실 ID
     */
    @Transactional()
    async changeReservationRoom(user_id: string, reservation_id: string, dto: ReservationRoomChangeDto): Promise<void> {
        // 1. 매니저의 소속 업체 · 그 업체 예약
        const manager = await this.reservationRepository.findReservationUser({user_id, login_scope: LOGIN_SCOPE.MANAGER});
        if (!manager?.store_id) {
            throw new NotFoundException({message: RESERVATION_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const reservation = await this.reservationRepository.findReservation({reservation_id, store_id: manager.store_id});
        if (!reservation) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }
        if (reservation.reservation_state_id !== RESERVATION_STATE.CONFIRMED || !nowKst().isBefore(reservation.start_at)) {
            throw new BadRequestException({message: '이용 시작 전의 확정 예약만 옮길 수 있습니다.'});
        }
        if (reservation.room_id === dto.room_id) {
            throw new BadRequestException({message: '지금과 같은 호실입니다.', validation_errors: createValidationError('room_id', '지금과 같은 호실입니다.')});
        }

        // 2. 지금 호실 · 옮길 호실 — 같은 그룹 · 사용중지 아님
        const from = await this.reservationRepository.findReservationRoom({room_id: reservation.room_id});
        const to = await this.reservationRepository.findReservationRoom({room_id: dto.room_id, store_id: manager.store_id});
        if (!from || !to) {
            throw new NotFoundException({message: RESERVATION_ROOM_NOT_FOUND_MESSAGE});
        }
        if (to.room_group_id !== from.room_group_id) {
            throw new BadRequestException({message: '같은 객실 그룹의 호실로만 옮길 수 있습니다.', validation_errors: createValidationError('room_id', '같은 객실 그룹의 호실로만 옮길 수 있습니다.')});
        }
        if (to.room_state_id === RESERVATION_ROOM_STATE.DISABLED) {
            throw new BadRequestException({message: '사용중지된 호실로는 옮길 수 없습니다.', validation_errors: createValidationError('room_id', '사용중지된 호실로는 옮길 수 없습니다.')});
        }

        // 3. 옮기기 — 상태 조건 · 겹침은 repository 가 400
        const entity = new ReservationEntity();
        entity.room_id = to.room_id;
        if (!(await this.reservationRepository.changeReservationRoom({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.CONFIRMED}, entity))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }

        // 4. 이용자 SMS — 번호가 있을 때만(마지막 단계)
        const user = await this.reservationRepository.findReservationUser({user_id: reservation.user_id});
        const store = await this.reservationRepository.findReservationStore({store_id: reservation.store_id});
        if (user?.phone && store) {
            await this.smsSender.send({to: user.phone, text: buildRoomChangeSms(store.store_name, reservation.start_at, from.room_name, to.room_name)});
        }
    }
}
```

- `findReservationStore` 는 지워지지 않은 업체만 — SMS 단계에서 업체가 지워졌으면(실제로는 소프트 삭제 · 탈퇴 업체 예약이 없다) SMS 를 건너뛴다.
- 업체 취소의 환불액은 구간 금액(`detail.price` = 결제 금액 — 결제 1건 = 구간 1개)이다.
### user-service — 인바운드 어댑터 · 모듈

형제: 내부 HTTP door.controller.ts · admin room.controller.ts(`@InternalActor('user_id')` · Query DTO `new 클래스명(query)`), 큐 user.controller.queue.ts · admin room.controller.queue.ts(payload = path param + 본문, `requireActor`), 도메인 모듈 door.module.ts(큐 컨트롤러는 providers).

```ts
// apps/user-service/src/reservation/controllers/reservation.controller.ts — new
import {Controller, Get, HttpCode, Param, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {ReservationAvailabilityDto, ReservationAvailabilityResultDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import {ReservationDetailParamDto, ReservationDetailResultDto} from '@app/contracts/reservation/dto/reservation-detail.dto.js';
import {ReservationListDto, ReservationListResultDto} from '@app/contracts/reservation/dto/reservation-list.dto.js';
import {ReservationStoreDto, ReservationStoreResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {ReservationService} from '../reservation.service.js';

/**
 * 예약 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로(조회)만 받는다(외부 비공개, Swagger 없음).
 * 정적 경로(`/availability` · `/store`)를 `/:reservation_id` 보다 먼저 선언한다. 내부 토큰 검사는 전역 InternalAuthGuard 가 한다.
 */
@Controller('/internal/v1/user-service/reservation')
export class ReservationController {
    /**
     * @param reservationService 예약 service
     */
    constructor(private readonly reservationService: ReservationService) {}

    /**
     * 호실별 예약 가능 시간 (인증 없음)
     */
    @Get('/availability')
    @HttpCode(200)
    async getAvailability(@Query() query: ReservationAvailabilityDto): Promise<ReservationAvailabilityResultDto> {
        const dto = new ReservationAvailabilityDto(query);
        return this.reservationService.getAvailability(dto);
    }

    /**
     * 내 업체 예약 현황 (매니저)
     */
    @Get('/store')
    @HttpCode(200)
    async getStoreReservations(@InternalActor('user_id') user_id: string, @Query() query: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        const dto = new ReservationStoreDto(query);
        return this.reservationService.getStoreReservations(user_id, dto);
    }

    /**
     * 내 예약 목록 (이용자)
     */
    @Get('/')
    @HttpCode(200)
    async getMyReservations(@InternalActor('user_id') user_id: string, @Query() query: ReservationListDto): Promise<ReservationListResultDto> {
        const dto = new ReservationListDto(query);
        return this.reservationService.getMyReservations(user_id, dto);
    }

    /**
     * 내 예약 상세 (이용자)
     */
    @Get('/:reservation_id')
    @HttpCode(200)
    async getMyReservation(@InternalActor('user_id') user_id: string, @Param() param: ReservationDetailParamDto): Promise<ReservationDetailResultDto> {
        return this.reservationService.getMyReservation(user_id, param.reservation_id);
    }
}
```

```ts
// apps/user-service/src/reservation/controllers/reservation.controller.queue.ts — new
import type {BadRequestException} from '@nestjs/common';
import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {ReservationCancelDto, ReservationCancelParamDto, ReservationCancelResultDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import type {ReservationPaymentConfirmDto, ReservationPaymentConfirmResultDto} from '@app/contracts/reservation/dto/reservation-payment-confirm.dto.js';
import type {ReservationRoomChangeDto, ReservationRoomChangeParamDto} from '@app/contracts/reservation/dto/reservation-room-change.dto.js';
import type {ReservationStoreCancelDto, ReservationStoreCancelParamDto} from '@app/contracts/reservation/dto/reservation-store-cancel.dto.js';
import type {ReservationDto, ReservationResultDto} from '@app/contracts/reservation/dto/reservation.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {ReservationService} from '../reservation.service.js';

/**
 * 예약 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `user.reservation.*` 명령을 `@OnCommand` 로 받아 service 로 위임만 한다.
 * HTTP 컨트롤러가 아니라 provider 다(도메인 모듈 providers). 입력 검증은 게이트웨이 ValidationPipe 에서 끝났다.
 */
@Injectable()
export class ReservationQueueController {
    /**
     * @param reservationService 예약 service
     */
    constructor(private readonly reservationService: ReservationService) {}

    /**
     * 예약 생성 — 이용자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(RESERVATION_COMMAND.CREATE)
    async createReservation(command: MessageEnvelope<ReservationDto>): Promise<ReservationResultDto> {
        return this.reservationService.createReservation(requireActor(command).user_id, command.payload);
    }

    /**
     * 결제 확인 — 이용자 (환불 신청한 실패는 반환된 예외 → failed, 재시도 없음)
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(RESERVATION_COMMAND.PAYMENT_CONFIRM)
    async confirmPayment(command: MessageEnvelope<ReservationPaymentConfirmDto>): Promise<ReservationPaymentConfirmResultDto | BadRequestException> {
        return this.reservationService.confirmPayment(requireActor(command).user_id, command.payload);
    }

    /**
     * 이용자 취소
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(RESERVATION_COMMAND.CANCEL)
    async cancelReservation(command: MessageEnvelope<ReservationCancelParamDto & ReservationCancelDto>): Promise<ReservationCancelResultDto> {
        return this.reservationService.cancelReservation(requireActor(command).user_id, command.payload.reservation_id, command.payload);
    }

    /**
     * 업체 취소 — 매니저
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(RESERVATION_COMMAND.STORE_CANCEL)
    async cancelStoreReservation(command: MessageEnvelope<ReservationStoreCancelParamDto & ReservationStoreCancelDto>): Promise<void> {
        return this.reservationService.cancelStoreReservation(requireActor(command).user_id, command.payload.reservation_id, command.payload);
    }

    /**
     * 호실 이동 — 매니저
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(RESERVATION_COMMAND.ROOM_CHANGE)
    async changeReservationRoom(command: MessageEnvelope<ReservationRoomChangeParamDto & ReservationRoomChangeDto>): Promise<void> {
        return this.reservationService.changeReservationRoom(requireActor(command).user_id, command.payload.reservation_id, command.payload);
    }
}
```

```ts
// apps/user-service/src/reservation/reservation.module.ts — new
import {Module} from '@nestjs/common';
import {ReservationController} from './controllers/reservation.controller.js';
import {ReservationQueueController} from './controllers/reservation.controller.queue.js';
import {ReservationRepository} from './repositories/reservation.repository.js';
import {ReservationService} from './reservation.service.js';
import {RESERVATION_REPOSITORY} from './reservation.symbols.js';

/**
 * 예약 도메인 — 결제 포트(PAYMENT_GATEWAY) · SMS 포트(SMS_SENDER)는 루트 모듈의 PaymentModule · SmsModule 이 전역으로 준다.
 * - ReservationController(controllers/reservation.controller.ts): 내부 HTTP — 예약 가능 시간 · 내 예약 · 업체 현황
 * - ReservationQueueController(controllers/reservation.controller.queue.ts): RabbitMQ `user.reservation.*` — HTTP 컨트롤러가 아니라 provider
 */
@Module({controllers: [ReservationController], providers: [ReservationService, ReservationQueueController, {provide: RESERVATION_REPOSITORY, useClass: ReservationRepository}]})
export class ReservationModule {}
```

```ts
// apps/user-service/src/user-service.module.ts — modified (import 2줄 · 주석 2줄 · imports 에 PaymentModule · ReservationModule)
import {PaymentModule} from '@app/integration/payment/payment.module.js';
import {ReservationModule} from './reservation/reservation.module.js';
 * - PaymentModule: 결제 포트(PAYMENT_GATEWAY, 토스페이먼츠) — 예약 결제 확인 · 결제 환경
 * 도메인: UserModule(회원) · DoorModule(문) · ReservationModule(예약). crontab 은 scheduler 앱이 돌린다(이 서비스에는 ScheduleModule 이 없다).
    imports: [
        DatabaseModule,
        MessagingModule.forService({queue: USER_COMMAND_QUEUE, binding_keys: [USER_COMMAND_BINDING], broker_user: BROKER_USER.USER_SERVICE}),
        SmsModule,
        DoorStoreModule,
        PaymentModule,
        UserModule,
        DoorModule,
        ReservationModule,
    ],
```

### gateway — 공개 라우트 (`apps/gateway/src/api/v1/user-service/reservation/`)

형제: 동기 admin-service room.controller.ts(`InternalHttpClient` · Query DTO `new 클래스명(query)` · Swagger 순서), 큐 room.controller.queue.ts(`commandStream.dispatch` 한 줄 · payload = path param + 본문), 가드 없는 공개 라우트 door.controller.ts, 도메인 모듈 user.module.ts(`[동기, 큐]`). 로그인 그룹은 가드로 가른다 — 이용자 `PassportJwtAuthGuard`, 매니저 `PassportJwtManagerAuthGuard`.

```ts
// apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.ts — new
import {Controller, Get, HttpCode, Param, Query, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {ReservationAvailabilityDto, ReservationAvailabilityResultDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import {ReservationDetailParamDto, ReservationDetailResultDto} from '@app/contracts/reservation/dto/reservation-detail.dto.js';
import {ReservationListDto, ReservationListResultDto} from '@app/contracts/reservation/dto/reservation-list.dto.js';
import {ReservationStoreDto, ReservationStoreResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {RESERVATION_INTERNAL_PATH} from '@app/contracts/reservation/reservation.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 예약 공개 API — 동기 경로(내부 HTTP → user-service). 예약 가능 시간은 로그인 없이, 내 예약은 이용자 가드, 업체 현황은 매니저 가드.
 * 정적 경로(`/availability` · `/store`)를 `/:reservation_id` 보다 먼저 선언한다. 쓰기(큐)는 같은 경로 접두의 reservation.controller.queue.ts.
 */
@ApiTags('예약')
@Controller('/api/v1/user-service/reservation')
export class ReservationController {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 호실별 예약 가능 시간 (로그인 없음) — 업체 · 날짜 · 상품(연박은 박수), 이 상품을 파는 호실만
     */
    @Get('/availability')
    @HttpCode(200)
    @ApiOperation({summary: '호실별 예약 가능 시간'})
    @ApiOkResponse({type: ReservationAvailabilityResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getAvailability(@Query() query: ReservationAvailabilityDto): Promise<ReservationAvailabilityResultDto> {
        const dto = new ReservationAvailabilityDto(query);
        return this.internalHttp.request<ReservationAvailabilityResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.AVAILABILITY, {query: dto});
    }

    /**
     * 내 업체 예약 현황 (업체 관리자) — 날짜 하루와 겹치는 예약을 호실별로
     */
    @Get('/store')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 예약 현황'})
    @ApiOkResponse({type: ReservationStoreResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStoreReservations(@PassportActor() actor: Actor, @Query() query: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        const dto = new ReservationStoreDto(query);
        return this.internalHttp.request<ReservationStoreResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.STORE, {actor, query: dto});
    }

    /**
     * 내 예약 목록 (이용자) — 결제 대기 만료 건 제외, 입실 최근순
     */
    @Get('/')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 예약 목록'})
    @ApiOkResponse({type: ReservationListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyReservations(@PassportActor() actor: Actor, @Query() query: ReservationListDto): Promise<ReservationListResultDto> {
        const dto = new ReservationListDto(query);
        return this.internalHttp.request<ReservationListResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.LIST, {actor, query: dto});
    }

    /**
     * 내 예약 상세 (이용자) — 구간 · 결제 포함
     */
    @Get('/:reservation_id')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 예약 상세'})
    @ApiOkResponse({type: ReservationDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyReservation(@PassportActor() actor: Actor, @Param() param: ReservationDetailParamDto): Promise<ReservationDetailResultDto> {
        return this.internalHttp.request<ReservationDetailResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.detail(param.reservation_id), {actor});
    }
}
```

```ts
// apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.queue.ts — new
import {Body, Controller, Ip, Param, Patch, Post, Res, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {Response} from 'express';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {ReservationCancelDto, ReservationCancelParamDto, ReservationCancelResultDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import {ReservationPaymentConfirmDto, ReservationPaymentConfirmResultDto} from '@app/contracts/reservation/dto/reservation-payment-confirm.dto.js';
import {ReservationRoomChangeDto, ReservationRoomChangeParamDto} from '@app/contracts/reservation/dto/reservation-room-change.dto.js';
import {ReservationStoreCancelDto, ReservationStoreCancelParamDto} from '@app/contracts/reservation/dto/reservation-store-cancel.dto.js';
import {ReservationDto, ReservationResultDto} from '@app/contracts/reservation/dto/reservation.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 예약 공개 API — 큐 경로(RabbitMQ `user.reservation.*` → user-service + 요청 단위 SSE).
 * 예약 생성 · 결제 확인 · 취소는 이용자 가드, 업체 취소 · 호실 이동은 매니저 가드(내 업체 예약만). path param 은 payload 에 합쳐 보낸다.
 */
@ApiTags('예약')
@Controller('/api/v1/user-service/reservation')
export class ReservationQueueController {
    /**
     * @param commandStream 큐 경로 전달(명령 발행 + 요청 단위 SSE)
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 예약 생성 (이용자) — 결제 대기 5분. done 의 data 로 토스 결제창을 연다(orderId = payment_id)
     */
    @Post('/')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '예약 생성'})
    @ApiBody({type: ReservationDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ReservationResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createReservation(@PassportActor() actor: Actor, @Body() dto: ReservationDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.CREATE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 결제 확인 (이용자) — 토스 승인 뒤 결제 키를 보내면 토스에서 다시 읽어 대조하고 확정한다
     */
    @Post('/payment-confirm')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '결제 확인'})
    @ApiBody({type: ReservationPaymentConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ReservationPaymentConfirmResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmPayment(@PassportActor() actor: Actor, @Body() dto: ReservationPaymentConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.PAYMENT_CONFIRM, actor, payload: dto, client_ip: ip});
    }

    /**
     * 이용자 취소 — 사유 필수, 환불 규정대로(백그라운드 환불)
     */
    @Patch('/:reservation_id/cancel')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '예약 취소'})
    @ApiBody({type: ReservationCancelDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ReservationCancelResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async cancelReservation(@PassportActor() actor: Actor, @Param() param: ReservationCancelParamDto, @Body() dto: ReservationCancelDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.CANCEL, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 취소 (업체 관리자) — 100% 환불 + 이용자 SMS. done 의 data 는 null
     */
    @Patch('/:reservation_id/store-cancel')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 예약 취소'})
    @ApiBody({type: ReservationStoreCancelDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async cancelStoreReservation(
        @PassportActor() actor: Actor,
        @Param() param: ReservationStoreCancelParamDto,
        @Body() dto: ReservationStoreCancelDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.STORE_CANCEL, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 호실 이동 (업체 관리자) — 같은 객실 그룹의 다른 호실로 + 이용자 SMS. done 의 data 는 null
     */
    @Patch('/:reservation_id/room')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '예약 호실 이동'})
    @ApiBody({type: ReservationRoomChangeDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeReservationRoom(
        @PassportActor() actor: Actor,
        @Param() param: ReservationRoomChangeParamDto,
        @Body() dto: ReservationRoomChangeDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.ROOM_CHANGE, actor, payload: {...param, ...dto}, client_ip: ip});
    }
}
```

```ts
// apps/gateway/src/api/v1/user-service/reservation/reservation.module.ts — new
import {Module} from '@nestjs/common';
import {ReservationController} from './controllers/reservation.controller.js';
import {ReservationQueueController} from './controllers/reservation.controller.queue.js';

/**
 * 게이트웨이 예약 라우트 — `/api/v1/user-service/reservation`. 전달 수단(TransportModule)은 전역이다.
 * - ReservationController: 동기 경로 — 예약 가능 시간(로그인 없음) · 내 예약(이용자) · 업체 현황(매니저)
 * - ReservationQueueController: 큐 경로 — 예약 생성 · 결제 확인 · 취소(이용자) · 업체 취소 · 호실 이동(매니저)
 */
@Module({controllers: [ReservationController, ReservationQueueController]})
export class ReservationModule {}
```

```ts
// apps/gateway/src/gateway.module.ts — modified (import 1줄 · 주석 1줄 · imports 끝에 ReservationModule)
import {ReservationModule} from './api/v1/user-service/reservation/reservation.module.js';
 * - 예약 라우트: ReservationModule(/api/v1/user-service/reservation — 예약 가능 시간은 가드 없음, 내 예약 · 예약 쓰기는 이용자 가드, 업체 현황 · 업체 취소 · 호실 이동은 매니저 가드)
@Module({imports: [MessagingModule.forGateway(), TransportModule, PassportJwtAuthModule, UserModule, ManagerModule, AdminModule, StoreModule, RoomModule, DoorModule, ReservationModule]})
```
### scheduler — 예약 crontab (`apps/scheduler/src/reservation/`)

형제: user-leave-cleanup.crontab.ts(운영 가드 · `JobLockService.runExclusive` · 잠금 키 파일 상수 · 건별 try/catch), scheduler user.repository.ts(crontab 전용 repository — `txHost.tx`). 여러 표를 바꾸는 상태 전환은 repository 메서드 1개가 `txHost.withTransaction` 으로 묶는다(CLS 컨텍스트 밖에서도 `cls.run({ifNested: 'inherit'})` 으로 돈다 — @nestjs-cls/transactional transaction-host.js). 토스 조회 대조는 user-service 와 같은 `verifyPaymentLookup`.

```ts
// apps/scheduler/src/reservation/reservation.symbols.ts — new
/** 예약 repository 포트 토큰(scheduler) — 구현: ReservationRepository */
export const RESERVATION_REPOSITORY = Symbol('ReservationRepositoryInterface');
```

```ts
// apps/scheduler/src/reservation/reservation.util.ts — new
import {BadRequestException} from '@nestjs/common';
import {PAYMENT_STATE, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';

/** 결제 대기 전환 — 결제 · 구간 · 예약에 쓸 엔티티 */
export interface PendingTransition {
    payment: PaymentEntity;
    detail: ReservationDetailEntity;
    reservation: ReservationEntity;
}

/**
 * 결제 대기 → 확정 — 토스에서 승인된 결제.
 *
 * @param lookup 토스 조회 결과
 * @param now 지금(승인 시각이 없을 때)
 * @returns 결제 DONE · 구간 · 예약 CONFIRMED
 */
export function buildConfirmTransition(lookup: PaymentLookupResult, now: Date): PendingTransition {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.DONE;
    payment.payment_key = lookup.payment_key;
    payment.method = lookup.method;
    payment.approved_at = lookup.approved_at ?? now;
    payment.receipt_url = lookup.receipt_url;
    return {payment, ...buildStateEntities(RESERVATION_STATE.CONFIRMED)};
}

/**
 * 결제 대기 → 만료 — 승인된 결제가 없다.
 *
 * @returns 결제 · 구간 · 예약 EXPIRED
 */
export function buildExpireTransition(): PendingTransition {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.EXPIRED;
    return {payment, ...buildStateEntities(RESERVATION_STATE.EXPIRED)};
}

/**
 * 결제 대기 → 환불 신청 + 만료 — 승인됐지만 금액이 다르다.
 *
 * @param lookup 토스 조회 결과
 * @param reason 환불 사유
 * @param now 지금
 * @returns 결제 REFUND_REQUESTED · 구간 · 예약 EXPIRED
 */
export function buildRefundTransition(lookup: PaymentLookupResult, reason: string, now: Date): PendingTransition {
    return {payment: buildRefundRequest(lookup, reason, now), ...buildStateEntities(RESERVATION_STATE.EXPIRED)};
}

/**
 * 환불 신청 결제 — 토스가 받은 금액 전액(승인 키 · 시각 포함 — CHK_Payment_Approved).
 *
 * @param lookup 토스 조회 결과
 * @param reason 환불 사유
 * @param now 지금
 * @returns 결제 REFUND_REQUESTED
 */
export function buildRefundRequest(lookup: PaymentLookupResult, reason: string, now: Date): PaymentEntity {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.REFUND_REQUESTED;
    payment.payment_key = lookup.payment_key;
    payment.method = lookup.method;
    payment.approved_at = lookup.approved_at ?? now;
    payment.receipt_url = lookup.receipt_url;
    payment.refund_amount = lookup.total_amount;
    payment.refund_reason = reason;
    payment.refund_requested_at = now;
    return payment;
}

/**
 * 환불 완료 결제.
 *
 * @param refunded_at 토스 취소 시각
 * @returns 결제 REFUNDED
 */
export function buildRefunded(refunded_at: Date): PaymentEntity {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.REFUNDED;
    payment.refunded_at = refunded_at;
    return payment;
}

/**
 * 환불 실패 결제 — 토스 업무 실패(400)의 code · message(CHK_Payment_Failure — 메시지 필수).
 *
 * @param error 결제 포트의 업무 실패
 * @returns 결제 REFUND_FAILED
 */
export function buildRefundFailed(error: BadRequestException): PaymentEntity {
    const body = error.getResponse() as {message?: unknown; payment_error_code?: unknown};
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.REFUND_FAILED;
    payment.failure_code = typeof body.payment_error_code === 'string' ? body.payment_error_code : null;
    payment.failure_message = typeof body.message === 'string' ? body.message.slice(0, 255) : error.message.slice(0, 255);
    return payment;
}

/**
 * 구간 · 예약 상태 엔티티.
 *
 * @param state 바꿀 예약 상태
 * @returns 구간 · 예약
 */
function buildStateEntities(state: string): {detail: ReservationDetailEntity; reservation: ReservationEntity} {
    const detail = new ReservationDetailEntity();
    detail.reservation_state_id = state;
    const reservation = new ReservationEntity();
    reservation.reservation_state_id = state;
    return {detail, reservation};
}
```

```ts
// apps/scheduler/src/reservation/interfaces/reservation.repository.interface.ts — new
import type {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import type {PendingTransition} from '../reservation.util.js';

/** 결제 대기가 끝난 기본 구간 행 — 구간 + 결제(QueryBuilder raw) */
export interface ExpiredPendingRow {
    reservation_id: string;
    payment_id: string;
    amount: number;
}

/**
 * 예약 repository 포트(scheduler) — 결제 대기 만료 · 늦은 승인 · 환불 crontab 의 데이터 접근. 상태 전환은 상태 조건을 건다(두 번 돌아도 같은 결과).
 */
export interface ReservationRepositoryInterface {
    /** 결제 대기 만료 시각이 지난 기본 구간(구간 PENDING · 결제 READY) */
    findExpiredPendingRows(now: Date): Promise<ExpiredPendingRow[]>;
    /** 결제 대기 전환 — 결제(READY) → 구간(PENDING) → 예약(PENDING) 을 한 트랜잭션으로, 결제가 이미 바뀌었으면 false */
    transitionPending(row: ExpiredPendingRow, transition: PendingTransition): Promise<boolean>;
    /** 다시 확인할 만료 결제 — 결제 EXPIRED · since 뒤에 바뀜 */
    findRecheckPayments(since: Date): Promise<PaymentEntity[]>;
    /** 환불 신청 결제 */
    findRefundRequestedPayments(): Promise<PaymentEntity[]>;
    /** 결제 수정 — 상태 조건(from_state)을 건 쓰기, 1행이면 true */
    updatePayment(payment_id: string, from_state: string, entity: PaymentEntity): Promise<boolean>;
}
```

```ts
// apps/scheduler/src/reservation/repositories/reservation.repository.ts — new
import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {MoreThanOrEqual} from 'typeorm';
import type {Repository, SelectQueryBuilder} from 'typeorm';
import {PAYMENT_STATE, RESERVATION_DETAIL_TYPE, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {ExpiredPendingRow, ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import type {PendingTransition} from '../reservation.util.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * 예약 repository(scheduler) — crontab 이 쓰는 예약 · 구간 · 결제 접근. 한 건의 상태 전환(결제 · 구간 · 예약)은 withTransaction 으로 묶고,
 * 상태 조건(READY · PENDING · EXPIRED · REFUND_REQUESTED)을 걸어 다른 요청(결제 확인 · 취소)과 겹쳐도 한쪽만 바꾼다.
 */
@Injectable()
export class ReservationRepository implements ReservationRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_reservation */
    private get reservations(): Repository<ReservationEntity> {
        return this.txHost.tx.getRepository(ReservationEntity);
    }

    /** t_reservation_detail */
    private get reservationDetails(): Repository<ReservationDetailEntity> {
        return this.txHost.tx.getRepository(ReservationDetailEntity);
    }

    /** t_payment */
    private get payments(): Repository<PaymentEntity> {
        return this.txHost.tx.getRepository(PaymentEntity);
    }

    /**
     * 결제 대기 만료 시각이 지난 기본 구간
     *
     * @param now 지금
     * @returns 구간 행
     */
    async findExpiredPendingRows(now: Date): Promise<ExpiredPendingRow[]> {
        try {
            return await this.buildExpiredPendingQuery(now).getRawMany<ExpiredPendingRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 대기 만료 쿼리 — 기본 구간 PENDING · expires_at ≤ now · 결제 READY. 매핑 민감(결제 조인 · raw select — 별칭이 ExpiredPendingRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param now 지금
     * @returns 쿼리 빌더
     */
    buildExpiredPendingQuery(now: Date): SelectQueryBuilder<ReservationDetailEntity> {
        return this.reservationDetails
            .createQueryBuilder('d')
            .select('d.reservation_id', 'reservation_id')
            .addSelect('d.payment_id', 'payment_id')
            .addSelect('p.amount', 'amount')
            .innerJoin(PaymentEntity, 'p', 'p.payment_id = d.payment_id')
            .where('d.reservation_detail_type_id = :base', {base: RESERVATION_DETAIL_TYPE.BASE})
            .andWhere('d.reservation_state_id = :pending', {pending: RESERVATION_STATE.PENDING})
            .andWhere('d.expires_at <= :now', {now})
            .andWhere('p.payment_state_id = :ready', {ready: PAYMENT_STATE.READY})
            .orderBy('d.expires_at', 'ASC');
    }

    /**
     * 결제 대기 전환 — 결제(READY) → 구간(PENDING) → 예약(PENDING). 결제가 이미 바뀌었으면(결제 확인 · 취소가 먼저) 아무것도 바꾸지 않고 false, 그 뒤가 어긋나면 롤백(500).
     *
     * @param row 구간 행
     * @param transition 결제 · 구간 · 예약 엔티티
     * @returns 바꿨으면 true
     */
    async transitionPending(row: ExpiredPendingRow, transition: PendingTransition): Promise<boolean> {
        try {
            return await this.txHost.withTransaction(async () => {
                const payment = await this.payments.update({payment_id: row.payment_id, payment_state_id: PAYMENT_STATE.READY}, transition.payment);
                if (payment.affected !== 1) {
                    return false;
                }
                await this.reservationDetails.update({payment_id: row.payment_id, reservation_state_id: RESERVATION_STATE.PENDING}, transition.detail);
                const reservation = await this.reservations.update({reservation_id: row.reservation_id, reservation_state_id: RESERVATION_STATE.PENDING}, transition.reservation);
                if (reservation.affected !== 1) {
                    throw new Error('reservation state changed');
                }
                return true;
            });
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 다시 확인할 만료 결제
     *
     * @param since 기준 시각(지금 − 30분)
     * @returns 결제 목록
     */
    async findRecheckPayments(since: Date): Promise<PaymentEntity[]> {
        try {
            return await this.payments.find({where: {payment_state_id: PAYMENT_STATE.EXPIRED, updated_at: MoreThanOrEqual(since)}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 환불 신청 결제
     *
     * @returns 결제 목록
     */
    async findRefundRequestedPayments(): Promise<PaymentEntity[]> {
        try {
            return await this.payments.find({where: {payment_state_id: PAYMENT_STATE.REFUND_REQUESTED}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 결제 수정 — 상태 조건을 건 쓰기
     *
     * @param payment_id 결제 ID
     * @param from_state 지금 상태(조건)
     * @param entity 바꿀 필드만 할당한 엔티티
     * @returns 1행이면 true
     */
    async updatePayment(payment_id: string, from_state: string, entity: PaymentEntity): Promise<boolean> {
        try {
            const result = await this.payments.update({payment_id, payment_state_id: from_state}, entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
```

```ts
// apps/scheduler/src/reservation/crontabs/reservation-payment-expire.crontab.ts — new
import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {RESERVATION_REFUND_REASON} from '@app/contracts/reservation/reservation.constants.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {PAYMENT_GATEWAY} from '@app/integration/integration.symbols.js';
import {verifyPaymentLookup} from '@app/integration/integration.util.js';
import type {PaymentGatewayInterface, PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';
import {buildConfirmTransition, buildExpireTransition, buildRefundTransition} from '../reservation.util.js';

/** 결제 대기 만료 잠금 키 */
export const RESERVATION_PAYMENT_EXPIRE_LOCK = 'reservation.payment-expire';

/**
 * 결제 대기 만료 스케줄러 — 결제 대기 5분이 지난 예약을 토스 주문번호 조회로 가른다(사용자 결정 2026-11-03).
 * 토스는 승인된 결제만 조회 · 취소하므로 "취소 요청"이 아니라 조회로 판단한다 — 결제됨은 확정, 금액 다름은 환불 신청 + 만료, 미결제는 만료(호실이 풀린다).
 * 토스 503 · 건별 실패는 건너뛰고 다음 회차에 다시 본다(대상은 상태로 고르므로 두 번 돌아도 같은 결과).
 */
@Injectable()
export class ReservationPaymentExpireCrontab {
    /**
     * @param reservationRepository 예약 repository 포트
     * @param paymentGateway 결제 포트(토스)
     * @param jobLock 인스턴스 1대 실행 잠금
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayInterface,
        private readonly jobLock: JobLockService,
    ) {}

    /**
     * 1분마다(운영 전용) — 만료 시각이 지난 결제 대기를 확정 · 만료 · 환불 신청으로 정리한다.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async expirePendingPayments(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_PAYMENT_EXPIRE_LOCK, async () => {
            const now = new Date();
            const rows = await this.reservationRepository.findExpiredPendingRows(now);
            for (const row of rows) {
                try {
                    const lookup = await this.paymentGateway.findByPaymentId(row.payment_id);
                    const verdict = verifyPaymentLookup(lookup, row.payment_id, row.amount);
                    if (verdict === 'PAID') {
                        await this.reservationRepository.transitionPending(row, buildConfirmTransition(lookup as PaymentLookupResult, now));
                    } else if (verdict === 'MISMATCH') {
                        await this.reservationRepository.transitionPending(row, buildRefundTransition(lookup as PaymentLookupResult, RESERVATION_REFUND_REASON.AMOUNT_MISMATCH, now));
                    } else {
                        await this.reservationRepository.transitionPending(row, buildExpireTransition());
                    }
                } catch {
                    // 토스 503 · 건별 실패는 건너뛰고 다음 회차에 다시 본다
                }
            }
        });
    }
}
```

```ts
// apps/scheduler/src/reservation/crontabs/reservation-payment-recheck.crontab.ts — new
import {Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {dayjs} from '@app/common/utils/dayjs.js';
import {PAYMENT_STATE, RESERVATION_REFUND_REASON} from '@app/contracts/reservation/reservation.constants.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {PAYMENT_GATEWAY} from '@app/integration/integration.symbols.js';
import {verifyPaymentLookup} from '@app/integration/integration.util.js';
import type {PaymentGatewayInterface, PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';
import {buildRefundRequest} from '../reservation.util.js';

/** 늦은 승인 재확인 잠금 키 */
export const RESERVATION_PAYMENT_RECHECK_LOCK = 'reservation.payment-recheck';

/** 만료 뒤 다시 확인하는 시간(분) — 토스 인증은 최대 30분 유효하다 */
const RESERVATION_PAYMENT_RECHECK_MINUTES = 30;

/**
 * 늦은 승인 재확인 스케줄러 — 결제 대기가 만료 · 취소된 뒤 프론트가 토스에서 늦게 승인한 결제를 찾아 환불 신청한다(만료 후 30분 동안).
 * 결제 확인 요청이 오면 그쪽이 먼저 환불 신청하고, 오지 않아도 여기서 잡는다 — 돈만 빠지는 일이 없게.
 */
@Injectable()
export class ReservationPaymentRecheckCrontab {
    /**
     * @param reservationRepository 예약 repository 포트
     * @param paymentGateway 결제 포트(토스)
     * @param jobLock 인스턴스 1대 실행 잠금
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayInterface,
        private readonly jobLock: JobLockService,
    ) {}

    /**
     * 5분마다(운영 전용) — 30분 안에 만료된 결제를 다시 조회해 승인됐으면 환불 신청한다.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async recheckExpiredPayments(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_PAYMENT_RECHECK_LOCK, async () => {
            const now = new Date();
            const payments = await this.reservationRepository.findRecheckPayments(dayjs(now).subtract(RESERVATION_PAYMENT_RECHECK_MINUTES, 'minute').toDate());
            for (const payment of payments) {
                try {
                    const lookup = await this.paymentGateway.findByPaymentId(payment.payment_id);
                    const verdict = verifyPaymentLookup(lookup, payment.payment_id, payment.amount);
                    if (verdict === 'PAID' || verdict === 'MISMATCH') {
                        await this.reservationRepository.updatePayment(
                            payment.payment_id,
                            PAYMENT_STATE.EXPIRED,
                            buildRefundRequest(lookup as PaymentLookupResult, RESERVATION_REFUND_REASON.LATE_PAYMENT, now),
                        );
                    }
                } catch {
                    // 토스 503 · 건별 실패는 건너뛰고 다음 회차에 다시 본다
                }
            }
        });
    }
}
```

```ts
// apps/scheduler/src/reservation/crontabs/reservation-refund.crontab.ts — new
import {BadRequestException, Inject, Injectable} from '@nestjs/common';
import {Cron, CronExpression} from '@nestjs/schedule';
import {PAYMENT_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';
import {PAYMENT_GATEWAY} from '@app/integration/integration.symbols.js';
import type {PaymentGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';
import {buildRefundFailed, buildRefunded} from '../reservation.util.js';

/** 환불 처리 잠금 키 */
export const RESERVATION_REFUND_LOCK = 'reservation.refund';

/**
 * 환불 처리 스케줄러 — 환불 신청(REFUND_REQUESTED) 결제를 토스 취소로 환불한다(백그라운드 환불 — 사용자 결정 2026-10-29).
 * 금액은 결제의 refund_amount(전액 또는 일부), 멱등키 cancel-<payment_id> 라 다시 돌아도 한 번만 취소된다.
 * 업무 실패(400)는 REFUND_FAILED(관리자가 따로 처리), 일시 실패(503)는 건너뛰고 다음 회차에 다시 한다.
 */
@Injectable()
export class ReservationRefundCrontab {
    /**
     * @param reservationRepository 예약 repository 포트
     * @param paymentGateway 결제 포트(토스)
     * @param jobLock 인스턴스 1대 실행 잠금
     */
    constructor(
        @Inject(RESERVATION_REPOSITORY) private readonly reservationRepository: ReservationRepositoryInterface,
        @Inject(PAYMENT_GATEWAY) private readonly paymentGateway: PaymentGatewayInterface,
        private readonly jobLock: JobLockService,
    ) {}

    /**
     * 1분마다(운영 전용) — 환불 신청 결제를 토스로 환불한다.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async refundRequestedPayments(): Promise<void> {
        if (process.env.NODE_ENV !== 'production') {
            return;
        }
        await this.jobLock.runExclusive(RESERVATION_REFUND_LOCK, async () => {
            const payments = await this.reservationRepository.findRefundRequestedPayments();
            for (const payment of payments) {
                try {
                    const result = await this.paymentGateway.cancel({
                        payment_id: payment.payment_id,
                        payment_key: payment.payment_key as string,
                        reason: payment.refund_reason as string,
                        amount: payment.refund_amount as number,
                    });
                    await this.reservationRepository.updatePayment(payment.payment_id, PAYMENT_STATE.REFUND_REQUESTED, buildRefunded(result.canceled_at));
                } catch (error) {
                    if (error instanceof BadRequestException) {
                        await this.reservationRepository.updatePayment(payment.payment_id, PAYMENT_STATE.REFUND_REQUESTED, buildRefundFailed(error)).catch(() => false);
                    }
                    // 일시 실패(503) · 건별 실패는 건너뛰고 다음 회차에 다시 한다
                }
            }
        });
    }
}
```

```ts
// apps/scheduler/src/reservation/reservation.module.ts — new
import {Module} from '@nestjs/common';
import {ReservationPaymentExpireCrontab} from './crontabs/reservation-payment-expire.crontab.js';
import {ReservationPaymentRecheckCrontab} from './crontabs/reservation-payment-recheck.crontab.js';
import {ReservationRefundCrontab} from './crontabs/reservation-refund.crontab.js';
import {ReservationRepository} from './repositories/reservation.repository.js';
import {RESERVATION_REPOSITORY} from './reservation.symbols.js';

/**
 * scheduler 예약 도메인 — crontab 3개(결제 대기 만료 · 늦은 승인 재확인 · 환불). 결제 포트(PAYMENT_GATEWAY)는 루트 모듈의 PaymentModule 이 전역으로 준다.
 */
@Module({providers: [ReservationPaymentExpireCrontab, ReservationPaymentRecheckCrontab, ReservationRefundCrontab, {provide: RESERVATION_REPOSITORY, useClass: ReservationRepository}]})
export class ReservationModule {}
```

```ts
// apps/scheduler/src/scheduler.module.ts — modified (import 2줄 · 주석 · imports)
import {PaymentModule} from '@app/integration/payment/payment.module.js';
import {ReservationModule} from './reservation/reservation.module.js';
 * - PaymentModule: 결제 포트(PAYMENT_GATEWAY, 토스) — 결제 대기 만료 조회 · 늦은 승인 재확인 · 환불
 * 도메인: UserModule(탈퇴 자동처리) · ReservationModule(결제 대기 만료 · 늦은 승인 · 환불)
@Module({imports: [DatabaseModule, ScheduleModule.forRoot(), PaymentModule, UserModule, ReservationModule]})
```

```yaml
# compose.scheduler.yml — modified (머리 주석에서 "토스" 를 빼고, environment 블록의 TOSS_SECRET_KEY: '' 줄 삭제 — .env 의 값이 그대로 전달된다)
#   - 쓰지 않는 비밀값(브로커 · JWT · 토큰 암호화 · 내부 토큰 · 비밀번호 해시 · AWS · DB 관리자)은 빈 값으로 덮어 전달하지 않는다. 토스 시크릿 키는 환불 · 결제 대기 만료에 쓴다.
```
### admin-service — 업체 환불 규정 · 연박 박수 · 점유 예약 확인

형제: 업체 설정 기본값 store.constants.ts(:58 · :61 · :67-71), 입점 승인 store.service.ts(:455-484), 내 업체 규정 `changeMyStoreReservationPolicy`(:1016-1031), 응답 변환 store.util.ts(:499 · :589), 종류별 값 가르기 `updateMyRoomPlan`(room.service.ts:113-168), 상품 설정 raw select `buildRoomPlanRowsQuery`(room.repository.ts:127-141), 삭제 `deleteMyRoom` · `deleteMyRoomGroup`(room.service.ts:288-320 · :806-822).

```ts
// apps/admin-service/src/store/store.constants.ts — modified (환불 기준 상수를 바꾸고 비율 · 연박 박수 기본값)
/** 100% 환불 마감 기본값(분) — 입점 승인 때 · 기존 업체(DB 기본값) */
export const STORE_REFUND_DEADLINE_MINUTES_DEFAULT = 60;

/** 마감 뒤 환불 비율 기본값(%) — 입점 승인 때 · 기존 업체(DB 기본값) */
export const STORE_LATE_REFUND_PERCENT_DEFAULT = 50;

/** 업체 상품 설정 기본값 — 입점 승인 때 3행. 연박은 최소 1박 · 최대 30박 */
export const STORE_PLAN_DEFAULTS: Pick<RoomPlanEntity, 'room_plan_type_id' | 'usage_hours' | 'check_in_time' | 'check_out_time' | 'min_nights' | 'max_nights'>[] = [
    {room_plan_type_id: 'HOURLY', usage_hours: 3, check_in_time: null, check_out_time: null, min_nights: null, max_nights: null},
    {room_plan_type_id: 'NIGHT', usage_hours: null, check_in_time: '22:00', check_out_time: '09:00', min_nights: null, max_nights: null},
    {room_plan_type_id: 'LONG', usage_hours: null, check_in_time: '15:00', check_out_time: '11:00', min_nights: 1, max_nights: 30},
];
```

```ts
// apps/admin-service/src/store/store.service.ts — modified (import 의 상수 이름 · 입점 승인 · 상품 설정 기본값 · 내 업체 규정)
    STORE_LATE_REFUND_PERCENT_DEFAULT,
    STORE_PLAN_DEFAULTS,
    STORE_REFUND_DEADLINE_MINUTES_DEFAULT,

        // 입점 승인 — 업체 행
        store.booking_open_hours = STORE_BOOKING_OPEN_HOURS_DEFAULT;
        store.refund_deadline_minutes = STORE_REFUND_DEADLINE_MINUTES_DEFAULT;
        store.late_refund_percent = STORE_LATE_REFUND_PERCENT_DEFAULT;

        // 입점 승인 — 업체 상품 설정 3행
            plan.check_in_time = defaults.check_in_time;
            plan.check_out_time = defaults.check_out_time;
            plan.min_nights = defaults.min_nights;
            plan.max_nights = defaults.max_nights;

    /**
     * 내 업체 예약 · 환불 규정 설정 (업체 관리자) — 이용 시작 n시간 전부터 예약, n분 전까지 취소 100% 환불, 그 뒤 ~ 이용 시작 전 취소는 비율 환불. 예약할 때 값을 예약에 저장한다(예약 기능). (RabbitMQ: admin.store.mine-reservation-policy)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 예약 가능 시작(시간) · 100% 환불 마감(분) · 마감 뒤 환불 비율(%)
     */
    @Transactional()
    async changeMyStoreReservationPolicy(user_id: string, dto: StoreMineReservationPolicyDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.booking_open_hours = dto.booking_open_hours;
        storeEntity.refund_deadline_minutes = dto.refund_deadline_minutes;
        storeEntity.late_refund_percent = dto.late_refund_percent;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }
```

```ts
// apps/admin-service/src/store/store.util.ts — modified (업체 상세 · 내 업체 상세 응답 두 곳 — refund_deadline_hours 줄을 바꾼다)
        refund_deadline_minutes: entity.refund_deadline_minutes,
        late_refund_percent: entity.late_refund_percent,
```

```ts
// apps/admin-service/src/room/room.constants.ts — modified (호실 상태 주석 · 메시지 2개 추가)
/**
 * 호실 상태 — t_room_state PK (seeder.targets.ts 의 ROOM_STATE_SEED_DATA 와 같다).
 * 호실 상태와 예약 상태는 따로다(사용자 결정 2026-11-03) — 예약 시간에 맞춘 사용중 · 정비중 전환은 Phase 19, 정비 완료 → 예약가능 · 사용중지는 업체 관리자.
 */

/** 점유 예약(결제 대기 · 확정 · 이용 중)이 있는 호실 삭제 */
export const ROOM_HAS_RESERVATION_MESSAGE = '예약이 있는 호실은 지울 수 없습니다.';

/** 점유 예약이 있는 객실 그룹 삭제 */
export const ROOM_GROUP_HAS_RESERVATION_MESSAGE = '예약이 있는 객실 그룹은 지울 수 없습니다.';
```

```ts
// apps/admin-service/src/room/interfaces/room.repository.interface.ts — modified (RoomPlanRow 필드 2개 · 포트 메서드 2개)
export interface RoomPlanRow {
    // … 기존 필드 …
    check_out_time: string | null;
    min_nights: number | null;
    max_nights: number | null;
}

    /** 호실의 점유 예약(결제 대기 · 확정 · 이용 중) 수 */
    countRoomActiveReservations(room_id: string): Promise<number>;
    /** 그룹 호실들의 점유 예약 수 — 지워지지 않은 호실 */
    countGroupActiveReservations(room_group_id: string): Promise<number>;
```

```ts
// apps/admin-service/src/room/repositories/room.repository.ts — modified (getter 1개 · 상품 설정 select 2줄 · 메서드 2개 + 빌더 1개)
import {In} from 'typeorm';
import {RESERVATION_OCCUPYING_STATES} from '@app/contracts/reservation/reservation.constants.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';

    /** t_reservation — 호실 · 그룹 삭제 전 점유 예약 확인(예약 표를 room 어휘로 읽기만) */
    private get reservations(): Repository<ReservationEntity> {
        return this.txHost.tx.getRepository(ReservationEntity);
    }

    // buildRoomPlanRowsQuery — check_out_time 다음
            .addSelect('p.min_nights', 'min_nights')
            .addSelect('p.max_nights', 'max_nights')

    /**
     * 호실의 점유 예약 수
     *
     * @param room_id 호실 ID
     * @returns 개수
     */
    async countRoomActiveReservations(room_id: string): Promise<number> {
        try {
            return await this.reservations.count({where: {room_id, reservation_state_id: In(RESERVATION_OCCUPYING_STATES)}});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 호실들의 점유 예약 수
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 개수
     */
    async countGroupActiveReservations(room_group_id: string): Promise<number> {
        try {
            return await this.buildGroupActiveReservationsQuery(room_group_id).getCount();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 점유 예약 쿼리 — 지워지지 않은 그룹 호실 조인 · 점유 상태 IN. 매핑 민감(조인 · IN)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 쿼리 빌더
     */
    buildGroupActiveReservationsQuery(room_group_id: string): SelectQueryBuilder<ReservationEntity> {
        return this.reservations
            .createQueryBuilder('v')
            .innerJoin(RoomEntity, 'r', 'r.room_id = v.room_id')
            .where('r.room_group_id = :room_group_id', {room_group_id})
            .andWhere('r.is_deleted = 0')
            .andWhere('v.reservation_state_id IN (:...states)', {states: RESERVATION_OCCUPYING_STATES});
    }
```

```ts
// apps/admin-service/src/room/room.util.ts — modified (toRoomPlanItem — check_out_time 다음)
        min_nights: row.min_nights === null ? null : Number(row.min_nights),
        max_nights: row.max_nights === null ? null : Number(row.max_nights),
```

```ts
// apps/admin-service/src/room/room.service.ts — modified (updateMyRoomPlan JSDoc · 4번 블록, deleteMyRoomGroup · deleteMyRoom 점유 예약 확인)
    /**
     * 업체 상품 설정 수정 — 종류별. 사용 여부 · 예약 가능 요일은 모든 종류, 종류에 필요한 값은 service 가 가른다(CHK_RoomPlan_* 와 같은 조합). (RabbitMQ: admin.room.plan-update)
     * - 시간 이용(HOURLY): 이용 시간 필수(없으면 400 validation_errors.usage_hours), 입실 · 퇴실 시각 · 박수는 보내도 NULL
     * - 1박 · 연박: 입실 · 퇴실 시각 필수(없는 필드로 400), 둘이 같으면 400(validation_errors.check_out_time), 이용 시간은 NULL
     * - 연박: 최소 · 최대 박수 필수(없는 필드로 400), 최소 > 최대면 400(validation_errors.min_nights). 1박 · 시간 이용의 박수는 NULL
     *
     * @param user_id 로그인 매니저 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param dto 사용 여부 · 예약 가능 요일 · 이용 시간 · 입실 · 퇴실 시각 · 최소 · 최대 박수
     */
        // 4. 종류별 값 — 시간 이용은 이용 시간만, 1박 · 연박은 입실 · 퇴실 시각, 연박은 박수도
        if (room_plan_type_id === ROOM_PLAN_TYPE.HOURLY) {
            // … 기존 그대로(usage_hours 확인 · 시각 null) …
        } else {
            // … 기존 그대로(입실 · 퇴실 시각 확인 · usage_hours null) …
        }
        if (room_plan_type_id === ROOM_PLAN_TYPE.LONG) {
            const min_nights = dto.min_nights ?? null;
            const max_nights = dto.max_nights ?? null;
            if (min_nights === null) {
                throw new BadRequestException({message: '연박은 최소 박수를 입력해주세요.', validation_errors: createValidationError('min_nights', '연박은 최소 박수를 입력해주세요.')});
            }
            if (max_nights === null) {
                throw new BadRequestException({message: '연박은 최대 박수를 입력해주세요.', validation_errors: createValidationError('max_nights', '연박은 최대 박수를 입력해주세요.')});
            }
            if (min_nights > max_nights) {
                throw new BadRequestException({message: '최소 박수는 최대 박수보다 클 수 없습니다.', validation_errors: createValidationError('min_nights', '최소 박수는 최대 박수보다 클 수 없습니다.')});
            }
            entity.min_nights = min_nights;
            entity.max_nights = max_nights;
        } else {
            entity.min_nights = null;
            entity.max_nights = null;
        }

    /**
     * 객실 그룹 삭제 — 그룹 · 그 그룹의 호실 · 사진을 소프트 삭제하고(사용자 결정 2026-10-31) 사진 저장소 파일을 실제로 지운다(마지막). 그룹 상품 · 기간 가격 행은 남지만 그룹이 지워져 닿을 수 없다. (RabbitMQ: admin.room.group-delete)
     * - 그룹 호실에 점유 예약(결제 대기 · 확정 · 이용 중)이 있으면 400
     */
        // 3. 점유 예약 — 있으면 지울 수 없다
        if ((await this.roomRepository.countGroupActiveReservations(group.room_group_id)) > 0) {
            throw new BadRequestException({message: ROOM_GROUP_HAS_RESERVATION_MESSAGE});
        }

        // 4. 지울 저장소 파일 키 … (이하 번호만 하나씩 밀린다)

    /**
     * 호실 삭제 — 그 업체의 호실만 소프트 삭제(is_deleted = 1). 점유 예약(결제 대기 · 확정 · 이용 중)이 있으면 400. (RabbitMQ: admin.room.delete)
     */
    @Transactional()
    async deleteMyRoom(user_id: string, room_id: string): Promise<void> {
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const room = await this.roomRepository.findRoom({room_id, store_id: store.store_id});
        if (!room) {
            throw new NotFoundException({message: ROOM_NOT_FOUND_MESSAGE});
        }
        if ((await this.roomRepository.countRoomActiveReservations(room.room_id)) > 0) {
            throw new BadRequestException({message: ROOM_HAS_RESERVATION_MESSAGE});
        }
        await this.roomRepository.deleteRoom({room_id: room.room_id});
    }
```
### Tests — user-service 예약 spec (`apps/user-service/src/reservation/test/`)

형제: 큐 · 동기 경로 부팅 room.test-helper.ts(`bootCommandPath` · `bootHttpPath` · `runCommand` · `validateBody` · 픽스처), [CASES] 표를 service spec 안에 두는 door.test-helper.ts `DOOR_TIME_CASES`(util 단위 spec 없음 — AGENTS), 시간 `vi.useFakeTimers({toFake: ['Date']})`.

```ts
// apps/user-service/src/reservation/test/reservation.test-helper.ts — new
import {BadRequestException, INestApplication, Type, ValidationPipe} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR, DiscoveryModule} from '@nestjs/core';
import {Test, TestingModule} from '@nestjs/testing';
import type {Mock} from 'vitest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import type {Actor} from '@app/contracts/actor.js';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import type {MessageEnvelope, ResultPayload} from '@app/contracts/message-envelope.js';
import {PAYMENT_GATEWAY, SMS_SENDER} from '@app/integration/integration.symbols.js';
import type {PaymentLookupResult} from '@app/integration/interfaces/integration.interface.js';
import {CommandHandlerRegistry} from '@app/messaging/command-handler.registry.js';
import {CommandDispatcher, DispatchDecision} from '@app/messaging/command.dispatcher.js';
import {buildCommandEnvelope, encodeEnvelope} from '@app/messaging/messaging.util.js';
import {ReservationController} from '../controllers/reservation.controller.js';
import {ReservationQueueController} from '../controllers/reservation.controller.queue.js';
import type {ReservationRepositoryInterface} from '../interfaces/reservation.repository.interface.js';
import {ReservationService} from '../reservation.service.js';
import {RESERVATION_REPOSITORY} from '../reservation.symbols.js';

/** 결과 큐 이름 */
export const TEST_REPLY_TO = 'gw-test';

/** 테스트용 내부 요청 비밀값 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 지금 — 2026-11-03(화) 09:00 한국 시각 */
export const NOW = new Date('2026-11-03T00:00:00Z');

/** 32자 hex ID 형식 */
export const ID_PATTERN = /^[a-f0-9]{32}$/;

/** 이용자 · 매니저 actor */
export const USER_ACTOR: Actor = {user_id: 'a'.repeat(32), auth_id: 'USER'};
export const MANAGER_ACTOR: Actor = {user_id: 'm'.repeat(32), auth_id: 'MANAGER'};

/** 업체 · 그룹 · 호실 · 그룹 상품 · 예약 · 결제 · 구간 ID */
export const STORE_ID = 'b'.repeat(32);
export const ROOM_GROUP_ID = 'c'.repeat(32);
export const ROOM_ID = 'd'.repeat(32);
export const ROOM_ID_2 = 'e'.repeat(32);
export const ROOM_GROUP_PLAN_ID = 'f'.repeat(32);
export const RESERVATION_ID = '1'.repeat(32);
export const PAYMENT_ID = '2'.repeat(32);
export const DETAIL_ID = '3'.repeat(32);

/** 토스 결제 키 */
export const PAYMENT_KEY = 'tgen_20261103000000abcde';

/** 예약 repository mock */
export type ReservationRepositoryMock = {[K in keyof ReservationRepositoryInterface]: Mock};

/** 결제 포트 mock */
export type PaymentGatewayMock = {environment: Mock; getPayment: Mock; findByPaymentId: Mock; cancel: Mock};

/** SMS 포트 mock */
export type SmsSenderMock = {send: Mock};

/**
 * 예약 repository mock — 포트 메서드마다 vi.fn(), 목록은 빈 배열 · 쓰기는 성공 기본값
 *
 * @returns mock
 */
export function createReservationRepositoryMock(): ReservationRepositoryMock {
    return {
        findReservationStore: vi.fn().mockResolvedValue(storeEntity()),
        findReservationRoom: vi.fn().mockResolvedValue(roomEntity()),
        findReservationRoomGroup: vi.fn().mockResolvedValue({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID, room_group_name: '스탠다드', is_deleted: 0}),
        findBookableRooms: vi.fn().mockResolvedValue([bookableRoom()]),
        findStorePlan: vi.fn().mockResolvedValue(planEntity('HOURLY')),
        findGroupPlans: vi.fn().mockResolvedValue([groupPlanEntity('HOURLY')]),
        findGroupPlanPrices: vi.fn().mockResolvedValue([]),
        findStoreHours: vi.fn().mockResolvedValue(everyDayHours('10:00:00', '22:00:00')),
        findStoreBreaks: vi.fn().mockResolvedValue([]),
        findUnavailablePeriods: vi.fn().mockResolvedValue([]),
        findReservations: vi.fn().mockResolvedValue([]),
        countRecentExpired: vi.fn().mockResolvedValue(0),
        findReservation: vi.fn().mockResolvedValue(reservationEntity()),
        findReservationDetails: vi.fn().mockResolvedValue([detailEntity()]),
        findPayment: vi.fn().mockResolvedValue(paymentEntity()),
        findReservationUser: vi.fn().mockResolvedValue({user_id: MANAGER_ACTOR.user_id, store_id: STORE_ID, name: '김이용', phone: '01012345678'}),
        insertPayment: vi.fn(),
        insertReservation: vi.fn(),
        insertReservationDetail: vi.fn(),
        updateReservation: vi.fn().mockResolvedValue(true),
        changeReservationRoom: vi.fn().mockResolvedValue(true),
        updateReservationDetails: vi.fn(),
        updatePayment: vi.fn().mockResolvedValue(true),
        countReservations: vi.fn().mockResolvedValue(0),
        findMyReservationRows: vi.fn().mockResolvedValue([]),
        findMyReservationRow: vi.fn().mockResolvedValue(null),
        findReservationSegmentRows: vi.fn().mockResolvedValue([]),
        findStoreRoomRows: vi.fn().mockResolvedValue([]),
        findStoreReservationRows: vi.fn().mockResolvedValue([]),
    };
}

/**
 * 결제 포트 mock — 테스트 키(TEST), 조회 기본값은 결제됨
 *
 * @returns mock
 */
export function createPaymentGatewayMock(): PaymentGatewayMock {
    return {environment: vi.fn().mockReturnValue('TEST'), getPayment: vi.fn().mockResolvedValue(tossLookup()), findByPaymentId: vi.fn().mockResolvedValue(tossLookup()), cancel: vi.fn()};
}

/**
 * SMS 포트 mock
 *
 * @returns mock
 */
export function createSmsSenderMock(): SmsSenderMock {
    return {send: vi.fn().mockResolvedValue(undefined)};
}

/**
 * 큐 경로 부팅 — 실제 ReservationQueueController · ReservationService · CommandHandlerRegistry · CommandDispatcher, repository · 결제 · SMS 포트만 mock.
 *
 * @param repo repository mock
 * @param payment 결제 포트 mock
 * @param sms SMS 포트 mock
 * @returns dispatcher · module
 */
export async function bootCommandPath(
    repo: ReservationRepositoryMock,
    payment: PaymentGatewayMock = createPaymentGatewayMock(),
    sms: SmsSenderMock = createSmsSenderMock(),
): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [
            ReservationService,
            ReservationQueueController,
            CommandHandlerRegistry,
            CommandDispatcher,
            {provide: RESERVATION_REPOSITORY, useValue: repo},
            {provide: PAYMENT_GATEWAY, useValue: payment},
            {provide: SMS_SENDER, useValue: sms},
        ],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}

/**
 * 동기 경로 부팅 — 실제 ReservationController + ReservationService + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor.
 *
 * @param repo repository mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: ReservationRepositoryMock): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [ReservationController],
        providers: [
            ReservationService,
            {provide: RESERVATION_REPOSITORY, useValue: repo},
            {provide: PAYMENT_GATEWAY, useValue: createPaymentGatewayMock()},
            {provide: SMS_SENDER, useValue: createSmsSenderMock()},
            {provide: APP_GUARD, useClass: InternalAuthGuard},
            {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor},
        ],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalFilters(new CustomErrorFilter());
    app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
    await app.init();
    return app;
}

/**
 * 게이트웨이가 붙이는 내부 요청 헤더
 *
 * @param actor 로그인 회원(없으면 인증 없음)
 * @returns 헤더
 */
export function internalHeaders(actor: Actor | null = null): Record<string, string> {
    const headers: Record<string, string> = {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN, [INTERNAL_HEADER.CLIENT_IP]: '10.0.0.1'};
    if (actor) {
        headers[INTERNAL_HEADER.ACTOR_USER_ID] = actor.user_id;
        headers[INTERNAL_HEADER.ACTOR_AUTH_ID] = actor.auth_id;
    }
    return headers;
}

/**
 * 명령 1건을 디스패처에 넣는다.
 *
 * @param dispatcher 디스패처
 * @param params 종류 · payload · actor
 * @returns 판정 · 봉투 · 결과
 */
export async function runCommand(
    dispatcher: CommandDispatcher,
    params: {type: string; payload: unknown; actor?: Actor | null; delivery_count?: number},
): Promise<{decision: DispatchDecision; command: MessageEnvelope<unknown>; result: ResultPayload<unknown> | null}> {
    const command = buildCommandEnvelope({type: params.type, actor: params.actor ?? null, payload: params.payload, reply_to: TEST_REPLY_TO, client_ip: '10.0.0.1'});
    const decision = await dispatcher.dispatch(encodeEnvelope(command), params.delivery_count ?? 0);
    return {decision, command, result: decision.result?.payload ?? null};
}

/**
 * 게이트웨이 ValidationPipe 로 본문(또는 쿼리 · path param)을 검증한다.
 *
 * @param metatype DTO 클래스
 * @param body 입력
 * @returns 실패 본문 또는 null
 */
export async function validateBody(metatype: Type<unknown>, body: unknown): Promise<Record<string, unknown> | null> {
    const pipe = new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory});
    try {
        await pipe.transform(body, {type: 'body', metatype});
        return null;
    } catch (error) {
        return (error as BadRequestException).getResponse() as Record<string, unknown>;
    }
}

/**
 * 업체 — 활성 · 영업중 · 영업시간 사용 · 정비 30분 · 예약 72시간 전부터 · 환불 마감 60분 · 마감 뒤 50%
 *
 * @param override 바꿀 필드
 * @returns 업체 엔티티 모양
 */
export function storeEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_id: STORE_ID,
        store_state_id: 'ACTIVE',
        store_name: '루미 강남점',
        is_always_open: 0,
        is_open: 1,
        maintenance_minutes: 30,
        booking_open_hours: 72,
        refund_deadline_minutes: 60,
        late_refund_percent: 50,
        is_deleted: 0,
        ...override,
    };
}

/**
 * 호실 — 예약가능
 *
 * @param override 바꿀 필드
 * @returns 호실 엔티티 모양
 */
export function roomEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {room_id: ROOM_ID, store_id: STORE_ID, room_group_id: ROOM_GROUP_ID, room_name: '101호', floor: 1, room_state_id: 'AVAILABLE', is_deleted: 0, ...override};
}

/**
 * 예약 가능 호실 행
 *
 * @param override 바꿀 필드
 * @returns 행
 */
export function bookableRoom(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {room_id: ROOM_ID, room_name: '101호', floor: 1, room_state_id: 'AVAILABLE', room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', ...override};
}

/**
 * 업체 상품 설정 — 종류별 기본(시간 이용 3시간 · 1박 22:00 → 09:00 · 연박 15:00 → 11:00 · 1 ~ 30박), 매일
 *
 * @param room_plan_type_id 상품 종류
 * @param override 바꿀 필드
 * @returns 상품 설정 엔티티 모양
 */
export function planEntity(room_plan_type_id: string, override: Record<string, unknown> = {}): Record<string, unknown> {
    const byType: Record<string, Record<string, unknown>> = {
        HOURLY: {usage_hours: 3, check_in_time: null, check_out_time: null, min_nights: null, max_nights: null},
        NIGHT: {usage_hours: null, check_in_time: '22:00:00', check_out_time: '09:00:00', min_nights: null, max_nights: null},
        LONG: {usage_hours: null, check_in_time: '15:00:00', check_out_time: '11:00:00', min_nights: 1, max_nights: 30},
    };
    return {room_plan_id: '9'.repeat(32), store_id: STORE_ID, room_plan_type_id, is_used: 1, days_of_week: 127, ...byType[room_plan_type_id], ...override};
}

/**
 * 그룹 상품 — 판매 · 30,000원
 *
 * @param room_plan_type_id 상품 종류
 * @param override 바꿀 필드
 * @returns 그룹 상품 엔티티 모양
 */
export function groupPlanEntity(room_plan_type_id: string, override: Record<string, unknown> = {}): Record<string, unknown> {
    return {room_group_plan_id: ROOM_GROUP_PLAN_ID, room_group_id: ROOM_GROUP_ID, room_plan_type_id, is_used: 1, price: 30000, ...override};
}

/**
 * 매일 같은 영업시간(일 ~ 토 7행)
 *
 * @param open_time 여는 시각
 * @param close_time 닫는 시각
 * @returns 영업시간 행
 */
export function everyDayHours(open_time: string, close_time: string): Record<string, unknown>[] {
    return [0, 1, 2, 3, 4, 5, 6].map((day_of_week) => ({store_id: STORE_ID, day_of_week, is_closed: 0, open_time, close_time, is_deleted: 0}));
}

/**
 * 예약 — 확정, 2026-11-10 13:00 ~ 16:00(한국 시각), 환불 마감 12:00, 30,000원
 *
 * @param override 바꿀 필드
 * @returns 예약 엔티티 모양
 */
export function reservationEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        reservation_id: RESERVATION_ID,
        user_id: USER_ACTOR.user_id,
        store_id: STORE_ID,
        room_id: ROOM_ID,
        room_plan_type_id: 'HOURLY',
        reservation_state_id: 'CONFIRMED',
        start_at: new Date('2026-11-10T04:00:00Z'),
        end_at: new Date('2026-11-10T07:00:00Z'),
        maintenance_minutes: 30,
        blocked_until: new Date('2026-11-10T07:30:00Z'),
        total_price: 30000,
        refund_deadline_at: new Date('2026-11-10T03:00:00Z'),
        late_refund_percent: 50,
        checked_in_at: null,
        completed_at: null,
        canceled_at: null,
        cancel_actor: null,
        cancel_reason: null,
        ...override,
    };
}

/**
 * 결제 — 확정(DONE), 30,000원
 *
 * @param override 바꿀 필드
 * @returns 결제 엔티티 모양
 */
export function paymentEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        payment_id: PAYMENT_ID,
        user_id: USER_ACTOR.user_id,
        payment_state_id: 'DONE',
        environment: 'TEST',
        order_name: '루미 강남점 101호 시간 이용',
        amount: 30000,
        payment_key: PAYMENT_KEY,
        method: '카드',
        approved_at: new Date('2026-11-03T00:01:00Z'),
        receipt_url: 'https://receipt.test/1',
        refund_amount: null,
        refund_reason: null,
        refund_requested_at: null,
        refunded_at: null,
        failure_code: null,
        failure_message: null,
        ...override,
    };
}

/**
 * 기본 구간 — 확정, 결제 1건
 *
 * @param override 바꿀 필드
 * @returns 구간 엔티티 모양
 */
export function detailEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        reservation_detail_id: DETAIL_ID,
        reservation_id: RESERVATION_ID,
        reservation_detail_type_id: 'BASE',
        room_plan_type_id: 'HOURLY',
        reservation_state_id: 'CONFIRMED',
        payment_id: PAYMENT_ID,
        start_at: new Date('2026-11-10T04:00:00Z'),
        end_at: new Date('2026-11-10T07:00:00Z'),
        price: 30000,
        expires_at: new Date('2026-11-03T00:05:00Z'),
        ...override,
    };
}

/**
 * 토스 조회 결과 — 승인 완료 · 우리 결제 ID · 30,000원
 *
 * @param override 바꿀 필드
 * @returns 조회 결과
 */
export function tossLookup(override: Partial<PaymentLookupResult> = {}): PaymentLookupResult {
    return {
        payment_key: PAYMENT_KEY,
        order_id: PAYMENT_ID,
        status: 'DONE',
        total_amount: 30000,
        method: '카드',
        approved_at: new Date('2026-11-03T00:01:00Z'),
        receipt_url: 'https://receipt.test/1',
        ...override,
    };
}
/**
 * 내 예약 목록 · 상세 행 — 확정, 2026-11-10 13:00 ~ 16:00
 *
 * @returns 행
 */
export function listRow(): Record<string, unknown> {
    return {
        reservation_id: RESERVATION_ID,
        store_id: STORE_ID,
        store_name: '루미 강남점',
        room_id: ROOM_ID,
        room_name: '101호',
        room_group_name: '스탠다드',
        room_plan_type_id: 'HOURLY',
        room_plan_type_name: '시간 이용',
        reservation_state_id: 'CONFIRMED',
        reservation_state_name: '예약 확정',
        start_at: new Date('2026-11-10T04:00:00Z'),
        end_at: new Date('2026-11-10T07:00:00Z'),
        total_price: 30000,
        refund_deadline_at: new Date('2026-11-10T03:00:00Z'),
        late_refund_percent: 50,
        canceled_at: null,
        cancel_actor: null,
        cancel_reason: null,
        created_at: new Date('2026-11-03T00:00:00Z'),
    };
}
```
```ts
// apps/user-service/src/reservation/test/reservation-availability.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In} from 'typeorm';
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import {ReservationAvailabilityDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import {
    bookableRoom,
    bootHttpPath,
    createReservationRepositoryMock,
    everyDayHours,
    groupPlanEntity,
    internalHeaders,
    NOW,
    planEntity,
    ReservationRepositoryMock,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    ROOM_ID,
    STORE_ID,
    storeEntity,
    validateBody,
} from './reservation.test-helper.js';

const PATH = '/internal/v1/user-service/reservation/availability';

/**
 * from ~ to(포함) 30분마다 'HH:mm'
 *
 * @param from 처음
 * @param to 끝
 * @returns 시각 목록
 */
function times(from: string, to: string): string[] {
    const result: string[] = [];
    for (let at = dayjs(`2000-01-01 ${from}`); !at.isAfter(dayjs(`2000-01-01 ${to}`)); at = at.add(30, 'minute')) {
        result.push(at.format('HH:mm'));
    }
    return result;
}

/** 재고 판정 케이스 입력 */
interface AvailabilityCase {
    query: Record<string, string>;
    now?: string;
    store?: Record<string, unknown>;
    plan?: Record<string, unknown>;
    hours?: Record<string, unknown>[];
    breaks?: Record<string, unknown>[];
    unavailable?: Record<string, unknown>[];
    occupied?: Record<string, unknown>[];
    room_state_id?: string;
    group_price?: number;
    prices?: Record<string, unknown>[];
    slots: string[];
    price?: number;
}

/**
 * [CASES:availability] — 재고 판정 · 요금 12개(사용자 결정 2026-11-03). 지금 2026-11-03(화) 09:00 한국 시각, 기본 업체 영업 10:00 ~ 22:00 · 정비 30분 · 72시간 전부터.
 * [이름, 입력 · 기대(시작 시각 한국 HH:mm · 금액)]
 */
const AVAILABILITY_CASES: [string, AvailabilityCase][] = [
    ['1. 시간 이용 3시간 · 영업 10 ~ 22시 — 10:00 ~ 19:00 30분마다', {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, slots: times('10:00', '19:00')}],
    [
        '2. 브레이크 13 ~ 14시 — 걸치는 시작 제외, 끝이 13:00 에 맞닿는 10:00 은 허용',
        {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, breaks: [{start_time: '13:00:00', end_time: '14:00:00'}], slots: ['10:00', ...times('14:00', '19:00')]},
    ],
    [
        '3. 자정 넘는 영업 18 ~ 06시 — 전날 영업으로 00:00 ~ 03:00, 그날 18:00 ~ 23:30',
        {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, hours: everyDayHours('18:00:00', '06:00:00'), slots: [...times('00:00', '03:00'), ...times('18:00', '23:30')]},
    ],
    [
        '4. 기존 점유 [12:00, 15:30) — 새 [시작, 끝 + 정비 30분)이 겹치면 제외',
        {
            query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'},
            occupied: [{room_id: ROOM_ID, start_at: new Date('2026-11-04T03:00:00Z'), blocked_until: new Date('2026-11-04T06:30:00Z')}],
            slots: times('15:30', '19:00'),
        },
    ],
    [
        '5. 오늘 10:10 · 정비중 호실 — 지난 시각 제외, 30분 안(10:30)은 예약가능 호실만',
        {query: {date: '2026-11-03', room_plan_type_id: 'HOURLY'}, now: '2026-11-03T01:10:00Z', room_state_id: 'MAINTENANCE', slots: times('11:00', '19:00')},
    ],
    [
        '6. 예약 가능 기간 24시간(24시간 업체) — 시작 ≤ 내일 09:00',
        {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, store: {booking_open_hours: 24, is_always_open: 1}, slots: times('00:00', '09:00')},
    ],
    ['7. 수요일 예약 불가(119) · 수요일 대실 — 없음', {query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'}, plan: {days_of_week: 119}, slots: []}],
    [
        '7-2. 수요일 예약 불가 · 화요일 입실 숙박(화 → 수) — 입실일만 보므로 가능',
        {query: {date: '2026-11-03', room_plan_type_id: 'NIGHT'}, store: {is_always_open: 1}, plan: {days_of_week: 119}, slots: ['22:00']},
    ],
    [
        '8. 24시간 업체 + 브레이크 13 ~ 14시 — 하루 전체에서 브레이크에 걸치는 시작만 뺀다',
        {
            query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'},
            store: {is_always_open: 1},
            breaks: [{start_time: '13:00:00', end_time: '14:00:00'}],
            slots: [...times('00:00', '10:00'), ...times('14:00', '23:30')],
        },
    ],
    ['9. 숙박 22:00 → 09:00 · 영업 10 ~ 23시 — 체크아웃 09:00 이 영업시간 밖', {query: {date: '2026-11-04', room_plan_type_id: 'NIGHT'}, hours: everyDayHours('10:00:00', '23:00:00'), slots: []}],
    [
        '9-2. 숙박 22:00 → 09:00 · 영업 08 ~ 23시 — 체크인 · 체크아웃 모두 영업시간 안',
        {query: {date: '2026-11-04', room_plan_type_id: 'NIGHT'}, hours: everyDayHours('08:00:00', '23:00:00'), slots: ['22:00']},
    ],
    [
        '10. 연박 3박 · 수요일 예약 불가 · 화요일 입실 — 입실일만 보므로 가능',
        {query: {date: '2026-11-03', room_plan_type_id: 'LONG', nights: '3'}, store: {is_always_open: 1}, plan: {days_of_week: 119, min_nights: 2, max_nights: 5}, slots: ['15:00']},
    ],
    [
        '11. 연박 3박 요금 — 기간 가격(11/4 ~ 11/5) 박만 기간 요금 80,000 + 80,000 + 50,000',
        {
            query: {date: '2026-11-04', room_plan_type_id: 'LONG', nights: '3'},
            store: {is_always_open: 1},
            group_price: 50000,
            prices: [{room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: '2026-11-04', end_date: '2026-11-05', price: 80000, is_deleted: 0}],
            slots: ['15:00'],
            price: 210000,
        },
    ],
    [
        '12. 일시 예약불가 12:00 ~ 13:00 — 겹치는 시작 제외(13:00 맞닿음은 허용)',
        {
            query: {date: '2026-11-04', room_plan_type_id: 'HOURLY'},
            unavailable: [{starts_at: new Date('2026-11-04T03:00:00Z'), ends_at: new Date('2026-11-04T04:00:00Z')}],
            slots: times('13:00', '19:00'),
        },
    ],
];

describe('GET /internal/v1/user-service/reservation/availability — 호실별 예약 가능 시간 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createReservationRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[CASES:availability] 재고 판정 · 요금', () => {
        it.each(AVAILABILITY_CASES)('%s', async (_label, input) => {
            vi.setSystemTime(new Date(input.now ?? NOW.toISOString()));
            const type = input.query.room_plan_type_id;
            repo.findReservationStore.mockResolvedValueOnce(storeEntity(input.store));
            repo.findStorePlan.mockResolvedValueOnce(planEntity(type, input.plan));
            repo.findBookableRooms.mockResolvedValueOnce([bookableRoom({room_state_id: input.room_state_id ?? 'AVAILABLE'})]);
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity(type, {price: input.group_price ?? 30000})]);
            repo.findGroupPlanPrices.mockResolvedValueOnce(input.prices ?? []);
            repo.findStoreHours.mockResolvedValueOnce(input.hours ?? everyDayHours('10:00:00', '22:00:00'));
            repo.findStoreBreaks.mockResolvedValueOnce(input.breaks ?? []);
            repo.findUnavailablePeriods.mockResolvedValueOnce(input.unavailable ?? []);
            repo.findReservations.mockResolvedValueOnce(input.occupied ?? []);

            const res = await request(app.getHttpServer())
                .get(PATH)
                .query({store_id: STORE_ID, ...input.query})
                .set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.list).toHaveLength(1);
            const room = res.body.list[0];
            expect(room.slots.map((slot: {start_at: string}) => dayjs(slot.start_at).tz(KST_TIMEZONE).format('HH:mm'))).toEqual(input.slots);
            if (input.price !== undefined) {
                expect(room.price).toBe(input.price);
            }
        });
    });

    describe('[SUCCESS]', () => {
        it('응답 모양 · 조회 조건 — 활성 업체, 판매 중인 그룹 상품의 호실만, 점유 상태 · 조회 범위', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({room_plan_type_id: 'HOURLY', date: '2026-11-04', nights: null});
            expect(res.body.list[0]).toMatchObject({room_id: ROOM_ID, room_name: '101호', floor: 1, room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', price: 30000});
            expect(res.body.list[0].slots[0]).toEqual({start_at: '2026-11-04T01:00:00.000Z', end_at: '2026-11-04T04:00:00.000Z'});
            expect(repo.findReservationStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: 'ACTIVE'});
            expect(repo.findStorePlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id: 'HOURLY'});
            expect(repo.findGroupPlans).toHaveBeenCalledWith({room_group_id: In([ROOM_GROUP_ID]), room_plan_type_id: 'HOURLY'});
            expect(repo.findGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: In([ROOM_GROUP_PLAN_ID])});
            const [occupiedWhere] = repo.findReservations.mock.calls[0] as [Record<string, unknown>];
            expect(occupiedWhere.room_id).toEqual(In([ROOM_ID]));
            expect(occupiedWhere.reservation_state_id).toEqual(In(['PENDING', 'CONFIRMED', 'CHECKED_IN']));
        });

        it('그룹 상품을 팔지 않는 그룹(요금 0)의 호실은 나오지 않는다 — 빈 목록', async () => {
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('HOURLY', {price: 0})]);

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.body.list).toEqual([]);
            expect(repo.findReservations).not.toHaveBeenCalled();
        });

        it('영업중 아님(is_open 0) — 호실은 나오지만 구간이 없다', async () => {
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_open: 0}));

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.body.list).toHaveLength(1);
            expect(res.body.list[0].slots).toEqual([]);
        });
    });

    describe('[SKIP]', () => {
        it('업체가 이 상품을 팔지 않으면(is_used 0) 빈 목록 — 호실 조회 없음', async () => {
            repo.findStorePlan.mockResolvedValueOnce(planEntity('HOURLY', {is_used: 0}));

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.list).toEqual([]);
            expect(repo.findBookableRooms).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('업체가 없거나 활성이 아니면 404, 상품 조회 없음', async () => {
            repo.findReservationStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findStorePlan).not.toHaveBeenCalled();
        });

        it('연박 박수가 업체 설정(2 ~ 5박) 밖이면 400 validation_errors.nights', async () => {
            repo.findStorePlan.mockResolvedValueOnce(planEntity('LONG', {min_nights: 2, max_nights: 5}));

            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'LONG', nights: '1'}).set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '연박은 2 ~ 5박으로 예약할 수 있습니다.', validation_errors: [{property: 'nights', message: '연박은 2 ~ 5박으로 예약할 수 있습니다.'}]});
            expect(repo.findBookableRooms).not.toHaveBeenCalled();
        });

        it('없는 날짜(2026-02-30)면 400 validation_errors.date, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-02-30', room_plan_type_id: 'HOURLY'}).set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '없는 날짜입니다.', validation_errors: [{property: 'date', message: '없는 날짜입니다.'}]});
            expect(repo.findReservationStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('연박인데 박수가 없으면 → nights', async () => {
            await expect(validateBody(ReservationAvailabilityDto, {store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'LONG'})).resolves.toEqual({
                message: '연박은 박수를 입력해주세요.',
                validation_errors: [{property: 'nights', message: '연박은 박수를 입력해주세요.'}],
            });
        });

        it('날짜 형식이 아니면 → date', async () => {
            await expect(validateBody(ReservationAvailabilityDto, {store_id: STORE_ID, date: '20261104', room_plan_type_id: 'HOURLY'})).resolves.toEqual({
                message: '날짜를 YYYY-MM-DD 로 입력해주세요.',
                validation_errors: [{property: 'date', message: '날짜를 YYYY-MM-DD 로 입력해주세요.'}],
            });
        });
    });

    describe('[FAIL:internal]', () => {
        it('게이트웨이 내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({store_id: STORE_ID, date: '2026-11-04', room_plan_type_id: 'HOURLY'});

            expect(res.status).toBe(403);
            expect(repo.findReservationStore).not.toHaveBeenCalled();
        });
    });
});
```

```ts
// apps/user-service/src/reservation/test/reservation-create.spec.ts — new
import {BadRequestException, ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import type {Actor} from '@app/contracts/actor.js';
import {ReservationDto} from '@app/contracts/reservation/dto/reservation.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    groupPlanEntity,
    ID_PATTERN,
    NOW,
    PaymentGatewayMock,
    planEntity,
    ReservationRepositoryMock,
    ROOM_GROUP_ID,
    ROOM_ID,
    runCommand,
    STORE_ID,
    storeEntity,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const HOURLY = {room_id: ROOM_ID, room_plan_type_id: 'HOURLY', date: '2026-11-04', start_time: '13:30'};

describe('user.reservation.create — 예약 생성 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let payment: PaymentGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createReservationRepositoryMock();
        payment = createPaymentGatewayMock();
        ({dispatcher, module} = await bootCommandPath(repo, payment));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('결제(READY · TEST) → 예약(PENDING · 정비 · 환불 마감 · 비율 저장) → 기본 구간(PENDING · 결제 대기 5분) 순으로 쓰고 결제 정보를 돌려준다', async () => {
            const {decision, result} = await runCreate(HOURLY);

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('user.reservation.create.done');
            const [paid] = repo.insertPayment.mock.calls[0] as [PaymentEntity];
            expect(paid).toBeInstanceOf(PaymentEntity);
            expect(paid.payment_id).toMatch(ID_PATTERN);
            expect(paid).toMatchObject({
                user_id: USER_ACTOR.user_id,
                payment_state_id: 'READY',
                environment: 'TEST',
                order_name: '루미 강남점 101호 시간 이용',
                amount: 30000,
                payment_key: null,
                refund_amount: null,
            });
            const [reservation] = repo.insertReservation.mock.calls[0] as [ReservationEntity];
            expect(reservation).toBeInstanceOf(ReservationEntity);
            expect(reservation).toMatchObject({
                user_id: USER_ACTOR.user_id,
                store_id: STORE_ID,
                room_id: ROOM_ID,
                room_plan_type_id: 'HOURLY',
                reservation_state_id: 'PENDING',
                start_at: new Date('2026-11-04T04:30:00Z'),
                end_at: new Date('2026-11-04T07:30:00Z'),
                maintenance_minutes: 30,
                blocked_until: new Date('2026-11-04T08:00:00Z'),
                total_price: 30000,
                refund_deadline_at: new Date('2026-11-04T03:30:00Z'),
                late_refund_percent: 50,
                canceled_at: null,
                cancel_actor: null,
                cancel_reason: null,
            });
            const [detail] = repo.insertReservationDetail.mock.calls[0] as [ReservationDetailEntity];
            expect(detail).toBeInstanceOf(ReservationDetailEntity);
            expect(detail).toMatchObject({
                reservation_id: reservation.reservation_id,
                reservation_detail_type_id: 'BASE',
                reservation_state_id: 'PENDING',
                payment_id: paid.payment_id,
                price: 30000,
                expires_at: new Date('2026-11-03T00:05:00Z'),
            });
            expect(repo.insertPayment.mock.invocationCallOrder[0]).toBeLessThan(repo.insertReservation.mock.invocationCallOrder[0]);
            expect(result?.result).toEqual({
                reservation_id: reservation.reservation_id,
                payment_id: paid.payment_id,
                order_name: '루미 강남점 101호 시간 이용',
                amount: 30000,
                expires_at: '2026-11-03T00:05:00.000Z',
                start_at: '2026-11-04T04:30:00.000Z',
                end_at: '2026-11-04T07:30:00.000Z',
            });
            expect(repo.countRecentExpired).toHaveBeenCalledWith(USER_ACTOR.user_id, ROOM_ID, new Date('2026-11-02T23:50:00Z'));
        });

        it('연박 3박 — 주문명에 박수, 금액은 박마다 합계, 끝은 3일 뒤 체크아웃', async () => {
            repo.findStorePlan.mockResolvedValueOnce(planEntity('LONG'));
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('LONG', {price: 50000})]);
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_always_open: 1}));

            await runCreate({room_id: ROOM_ID, room_plan_type_id: 'LONG', date: '2026-11-04', nights: 3});

            const [paid] = repo.insertPayment.mock.calls[0] as [PaymentEntity];
            expect(paid).toMatchObject({order_name: '루미 강남점 101호 연박 3박', amount: 150000});
            const [reservation] = repo.insertReservation.mock.calls[0] as [ReservationEntity];
            expect(reservation.start_at).toEqual(new Date('2026-11-04T06:00:00Z'));
            expect(reservation.end_at).toEqual(new Date('2026-11-07T02:00:00Z'));
        });

        it('1박 10:00 → 12:00 — 퇴실 시각이 입실보다 늦어도 항상 다음 날 퇴실', async () => {
            repo.findStorePlan.mockResolvedValueOnce(planEntity('NIGHT', {check_in_time: '10:00:00', check_out_time: '12:00:00'}));
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('NIGHT')]);
            repo.findReservationStore.mockResolvedValueOnce(storeEntity({is_always_open: 1}));

            await runCreate({room_id: ROOM_ID, room_plan_type_id: 'NIGHT', date: '2026-11-04'});

            const [reservation] = repo.insertReservation.mock.calls[0] as [ReservationEntity];
            expect(reservation.start_at).toEqual(new Date('2026-11-04T01:00:00Z'));
            expect(reservation.end_at).toEqual(new Date('2026-11-05T03:00:00Z'));
            expect(reservation.blocked_until).toEqual(new Date('2026-11-05T03:30:00Z'));
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면 404, 쓰기 없음', async () => {
            repo.findReservationRoom.mockResolvedValueOnce(null);

            const {result} = await runCreate(HOURLY);

            expect(result?.error).toEqual({status_code: 404, body: {message: '호실을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('업체가 활성이 아니면 404', async () => {
            repo.findReservationStore.mockResolvedValueOnce(null);

            const {result} = await runCreate(HOURLY);

            expect(result?.error?.status_code).toBe(404);
            expect(repo.findReservationStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: 'ACTIVE'});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('그룹 상품을 팔지 않으면 400 판매하지 않는 상품, 쓰기 없음', async () => {
            repo.findGroupPlans.mockResolvedValueOnce([groupPlanEntity('HOURLY', {is_used: 0})]);

            const {result} = await runCreate(HOURLY);

            expect(result?.error).toEqual({status_code: 400, body: {message: '판매하지 않는 상품입니다.', validation_errors: null}});
            expect(repo.findGroupPlans).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'HOURLY'});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('같은 호실에서 10분 안에 결제 대기가 만료된 적이 있으면 400, 재고 판정 없음', async () => {
            repo.countRecentExpired.mockResolvedValueOnce(1);

            const {result} = await runCreate(HOURLY);

            expect(result?.error).toEqual({status_code: 400, body: {message: '결제하지 않아 만료된 호실은 10분 뒤에 다시 예약할 수 있습니다.', validation_errors: null}});
            expect(repo.findStoreHours).not.toHaveBeenCalled();
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('재고 판정에 걸리면(영업시간 밖 07:00 시작) 400, 쓰기 없음', async () => {
            const {result} = await runCreate({...HOURLY, start_time: '07:00'});

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약할 수 없는 시간입니다.', validation_errors: null}});
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });

        it('없는 날짜면 400 validation_errors.date, 호실 조회 없음', async () => {
            const {result} = await runCreate({...HOURLY, date: '2026-02-30'});

            expect(result?.error).toEqual({status_code: 400, body: {message: '없는 날짜입니다.', validation_errors: [{property: 'date', message: '없는 날짜입니다.'}]}});
            expect(repo.findReservationRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('같은 호실 점유 겹침(배타 제약 — repository 400)이면 failed 400, 구간 쓰기 없음', async () => {
            repo.insertReservation.mockRejectedValueOnce(new BadRequestException({message: '이미 예약된 시간입니다.'}));

            const {result} = await runCreate(HOURLY);

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 예약된 시간입니다.', validation_errors: null}});
            expect(repo.insertReservationDetail).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:external]', () => {
        it('토스 키가 없으면(결제 환경 503) 재시도, 쓰기 없음', async () => {
            payment.environment.mockImplementationOnce(() => {
                throw new ServiceUnavailableException({message: '결제 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'});
            });

            const {decision} = await runCreate(HOURLY);

            expect(decision.action).toBe('requeue');
            expect(repo.insertPayment).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('시간 이용 시작 시각이 30분 단위가 아니면 → start_time', async () => {
            await expect(validateBody(ReservationDto, {...HOURLY, start_time: '13:15'})).resolves.toEqual({
                message: '시작 시각을 30분 단위 HH:mm 으로 입력해주세요.',
                validation_errors: [{property: 'start_time', message: '시작 시각을 30분 단위 HH:mm 으로 입력해주세요.'}],
            });
        });

        it('연박 박수가 181 이면 → nights', async () => {
            await expect(validateBody(ReservationDto, {room_id: ROOM_ID, room_plan_type_id: 'LONG', date: '2026-11-04', nights: 181})).resolves.toEqual({
                message: '박수는 1 ~ 180박 사이로 입력해주세요.',
                validation_errors: [{property: 'nights', message: '박수는 1 ~ 180박 사이로 입력해주세요.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 호실 조회 없음', async () => {
            const {result} = await runCreate(HOURLY, null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findReservationRoom).not.toHaveBeenCalled();
        });
    });

    /**
     * 예약 생성 명령 1건
     *
     * @param payload 입력
     * @param actor 로그인 이용자(없으면 null)
     * @returns 판정 · 결과
     */
    async function runCreate(payload: Record<string, unknown>, actor: Actor | null = USER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.CREATE, payload, actor});
    }
});
```

- 생성 spec 의 영업시간 기본값은 helper 의 매일 10:00 ~ 22:00(재고 판정 실패 케이스는 07:00 시작).
```ts
// apps/user-service/src/reservation/test/reservation-payment-confirm.spec.ts — new
import type {TestingModule} from '@nestjs/testing';
import {ReservationPaymentConfirmDto} from '@app/contracts/reservation/dto/reservation-payment-confirm.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    detailEntity,
    NOW,
    PAYMENT_ID,
    PAYMENT_KEY,
    paymentEntity,
    PaymentGatewayMock,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    runCommand,
    tossLookup,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {payment_id: PAYMENT_ID, payment_key: PAYMENT_KEY};

describe('user.reservation.payment-confirm — 결제 확인 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let payment: PaymentGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createReservationRepositoryMock();
        repo.findPayment.mockResolvedValue(paymentEntity({payment_state_id: 'READY', payment_key: null, method: null, approved_at: null, receipt_url: null}));
        repo.findReservationDetails.mockResolvedValue([detailEntity({reservation_state_id: 'PENDING'})]);
        repo.findReservation.mockResolvedValue(reservationEntity({reservation_state_id: 'PENDING'}));
        payment = createPaymentGatewayMock();
        ({dispatcher, module} = await bootCommandPath(repo, payment));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 결제 확인 명령 1건
     *
     * @param actor 로그인 이용자(없으면 null)
     * @returns 판정 · 결과
     */
    function runConfirm(actor: typeof USER_ACTOR | null = USER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.PAYMENT_CONFIRM, payload: PAYLOAD, actor});
    }

    describe('[SUCCESS]', () => {
        it('토스 조회가 결제됨이면 결제 DONE(결제 키 · 수단 · 승인 · 영수증) → 구간 → 예약 CONFIRMED, 모두 상태 조건', async () => {
            const {decision, result} = await runConfirm();

            expect(decision.action).toBe('ack');
            expect(result?.result).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(repo.findPayment).toHaveBeenCalledWith({payment_id: PAYMENT_ID, user_id: USER_ACTOR.user_id});
            expect(payment.getPayment).toHaveBeenCalledWith(PAYMENT_KEY);
            const [paymentWhere, done] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(paymentWhere).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'READY'});
            expect(done).toBeInstanceOf(PaymentEntity);
            expect(done).toMatchObject({payment_state_id: 'DONE', payment_key: PAYMENT_KEY, method: '카드', approved_at: new Date('2026-11-03T00:01:00Z'), receipt_url: 'https://receipt.test/1'});
            const [detailWhere, detail] = repo.updateReservationDetails.mock.calls[0] as [unknown, ReservationDetailEntity];
            expect(detailWhere).toEqual({payment_id: PAYMENT_ID, reservation_state_id: 'PENDING'});
            expect(detail.reservation_state_id).toBe('CONFIRMED');
            const [reservationWhere, reservation] = repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity];
            expect(reservationWhere).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'PENDING'});
            expect(reservation.reservation_state_id).toBe('CONFIRMED');
        });

        it('같은 결제 키로 이미 확정된 결제면 토스 조회 없이 지금 상태(중복 요청)', async () => {
            repo.findPayment.mockResolvedValueOnce(paymentEntity());
            repo.findReservation.mockResolvedValueOnce(reservationEntity());

            const {result} = await runConfirm();

            expect(result?.result).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(payment.getPayment).not.toHaveBeenCalled();
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service] 대조 — 쓰기 없음', () => {
        it('토스에서 승인 전(IN_PROGRESS)이면 400 결제가 완료되지 않았습니다', async () => {
            payment.getPayment.mockResolvedValueOnce(tossLookup({status: 'IN_PROGRESS'}));

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 400, body: {message: '결제가 완료되지 않았습니다.', validation_errors: null}});
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });

        it('주문번호가 다른 결제면 400 결제 정보가 맞지 않습니다 — 다른 주문이라 환불하지 않는다', async () => {
            payment.getPayment.mockResolvedValueOnce(tossLookup({order_id: '9'.repeat(32)}));

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 400, body: {message: '결제 정보가 맞지 않습니다.', validation_errors: null}});
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });

        it('다른 결제 키로 이미 확정된 결제면 400', async () => {
            repo.findPayment.mockResolvedValueOnce(paymentEntity({payment_key: 'tgen_other'}));

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 다른 결제로 확정된 예약입니다.', validation_errors: null}});
            expect(payment.getPayment).not.toHaveBeenCalled();
        });

        it('내 결제가 아니면 404', async () => {
            repo.findPayment.mockResolvedValueOnce(null);

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 404, body: {message: '결제를 찾을 수 없습니다.', validation_errors: null}});
            expect(payment.getPayment).not.toHaveBeenCalled();
        });

        it('그 사이 crontab 이 바꿨으면(결제 READY 조건 0행) 400, 예약 쓰기 없음(롤백)', async () => {
            repo.updatePayment.mockResolvedValueOnce(false);

            const {result} = await runConfirm();

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null}});
            expect(repo.updateReservation).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:committed] 환불 신청을 커밋하고 실패를 반환 — 재시도 없음', () => {
        it('금액이 다르면 토스 금액 전액 환불 신청 + 구간 · 예약 만료, failed 400 · ack', async () => {
            payment.getPayment.mockResolvedValueOnce(tossLookup({total_amount: 10000}));

            const {decision, result} = await runConfirm();

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: '결제 금액이 맞지 않아 결제를 취소했습니다.', validation_errors: null}});
            const [where, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'READY'});
            expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', payment_key: PAYMENT_KEY, refund_amount: 10000, refund_reason: '결제 금액 불일치', refund_requested_at: NOW});
            expect((repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity])[1].reservation_state_id).toBe('EXPIRED');
            expect((repo.updateReservationDetails.mock.calls[0] as [unknown, ReservationDetailEntity])[1].reservation_state_id).toBe('EXPIRED');
        });

        it('이미 만료된 예약에 늦게 온 결제면 환불 신청, 예약은 그대로, failed 400 · ack', async () => {
            repo.findPayment.mockResolvedValueOnce(paymentEntity({payment_state_id: 'EXPIRED', payment_key: null, approved_at: null}));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'EXPIRED'}));
            repo.findReservationDetails.mockResolvedValueOnce([detailEntity({reservation_state_id: 'EXPIRED'})]);

            const {decision, result} = await runConfirm();

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: '결제 대기 시간이 지나 결제를 취소했습니다. 다시 예약해주세요.', validation_errors: null}});
            const [where, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'EXPIRED'});
            expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', refund_amount: 30000, refund_reason: '결제 대기 시간 경과'});
            expect(repo.updateReservation).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('결제 ID 형식이 아니면 → payment_id', async () => {
            await expect(validateBody(ReservationPaymentConfirmDto, {payment_id: 'x', payment_key: PAYMENT_KEY})).resolves.toEqual({
                message: '결제 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'payment_id', message: '결제 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 결제 조회 없음', async () => {
            const {result} = await runConfirm(null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findPayment).not.toHaveBeenCalled();
        });
    });
});
```

```ts
// apps/user-service/src/reservation/test/reservation-cancel.spec.ts — new
import type {TestingModule} from '@nestjs/testing';
import {ReservationCancelDto} from '@app/contracts/reservation/dto/reservation-cancel.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createReservationRepositoryMock,
    detailEntity,
    PAYMENT_ID,
    paymentEntity,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    runCommand,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID, cancel_reason: '일정이 바뀌었습니다'};

/** 환불액 케이스 입력 — 이용 2026-11-10 13:00 ~ 16:00(한국 시각) */
interface RefundCase {
    now: string;
    amount?: number;
    late_refund_percent?: number;
    refund_deadline_at?: string;
    refund: number | null;
}

/**
 * [CASES:refund] — 이용자 취소 환불액 8개(사용자 결정 2026-11-03). 기본 결제 30,000원 · 환불 마감 12:00(60분 전) · 마감 뒤 50%.
 * [이름, 입력 · 기대 환불액(null = 취소 불가 400)]
 */
const REFUND_CASES: [string, RefundCase][] = [
    ['1. 마감 전(11:59) — 100%', {now: '2026-11-10T02:59:00Z', refund: 30000}],
    ['2. 마감 정각(12:00) — 마감 뒤 50%', {now: '2026-11-10T03:00:00Z', refund: 15000}],
    ['3. 15,001원 · 50% — 원 단위 내림 7,500', {now: '2026-11-10T03:30:00Z', amount: 15001, refund: 7500}],
    ['4. 비율 0% — 0원(환불 없이 취소)', {now: '2026-11-10T03:30:00Z', late_refund_percent: 0, refund: 0}],
    ['5. 비율 100% — 전액', {now: '2026-11-10T03:30:00Z', late_refund_percent: 100, refund: 30000}],
    ['6. 시작 정각(13:00) — 취소 불가', {now: '2026-11-10T04:00:00Z', refund: null}],
    ['7. 시작 뒤(13:30) — 취소 불가', {now: '2026-11-10T04:30:00Z', refund: null}],
    ['8. 마감 0분(마감 = 시작) · 12:59 — 100%', {now: '2026-11-10T03:59:00Z', refund_deadline_at: '2026-11-10T04:00:00Z', refund: 30000}],
];

describe('user.reservation.cancel — 이용자 취소 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
        repo = createReservationRepositoryMock();
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 취소 명령 1건
     *
     * @param actor 로그인 이용자(없으면 null)
     * @returns 판정 · 결과
     */
    function runCancel(actor: typeof USER_ACTOR | null = USER_ACTOR) {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.CANCEL, payload: PAYLOAD, actor});
    }

    describe('[CASES:refund] 환불액', () => {
        it.each(REFUND_CASES)('%s', async (_label, input) => {
            vi.setSystemTime(new Date(input.now));
            repo.findReservation.mockResolvedValueOnce(
                reservationEntity({late_refund_percent: input.late_refund_percent ?? 50, ...(input.refund_deadline_at ? {refund_deadline_at: new Date(input.refund_deadline_at)} : {})}),
            );
            repo.findPayment.mockResolvedValueOnce(paymentEntity({amount: input.amount ?? 30000}));

            const {result} = await runCancel();

            if (input.refund === null) {
                expect(result?.error).toEqual({status_code: 400, body: {message: '이용 시작 후에는 취소할 수 없습니다.', validation_errors: null}});
                expect(repo.updateReservation).not.toHaveBeenCalled();
                return;
            }
            expect(result?.result).toEqual({refund_amount: input.refund});
            if (input.refund > 0) {
                const [where, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
                expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'DONE'});
                expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', refund_amount: input.refund, refund_reason: '이용자 예약 취소'});
            } else {
                expect(repo.updatePayment).not.toHaveBeenCalled();
            }
        });
    });

    describe('[SUCCESS]', () => {
        it('확정 예약 — 예약 · 구간 CANCELED(주체 USER · 사유 · 시각), 상태 조건 CONFIRMED', async () => {
            await runCancel();

            const [where, canceled] = repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity];
            expect(where).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
            expect(canceled).toBeInstanceOf(ReservationEntity);
            expect(canceled).toMatchObject({reservation_state_id: 'CANCELED', cancel_actor: 'USER', cancel_reason: '일정이 바뀌었습니다', canceled_at: new Date('2026-11-09T00:00:00Z')});
            expect(repo.updateReservationDetails).toHaveBeenCalledWith(
                {reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'},
                expect.objectContaining({reservation_state_id: 'CANCELED'}),
            );
            expect(repo.findReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, user_id: USER_ACTOR.user_id});
        });

        it('결제 대기 예약 — 취소 + 결제 EXPIRED(환불 없음), refund_amount null', async () => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'PENDING'}));
            repo.findReservationDetails.mockResolvedValueOnce([detailEntity({reservation_state_id: 'PENDING'})]);

            const {result} = await runCancel();

            expect(result?.result).toEqual({refund_amount: null});
            const [where, expired] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
            expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'READY'});
            expect(expired.payment_state_id).toBe('EXPIRED');
            expect(repo.findPayment).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it.each(['CHECKED_IN', 'COMPLETED', 'CANCELED'])('%s 예약은 400 취소할 수 없는 예약, 쓰기 없음', async (state) => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: state}));

            const {result} = await runCancel();

            expect(result?.error).toEqual({status_code: 400, body: {message: '취소할 수 없는 예약입니다.', validation_errors: null}});
            expect(repo.updateReservation).not.toHaveBeenCalled();
        });

        it('남의 예약 · 결제 대기 만료 예약은 404', async () => {
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'EXPIRED'}));

            const {result} = await runCancel();

            expect(result?.error).toEqual({status_code: 404, body: {message: '예약을 찾을 수 없습니다.', validation_errors: null}});
        });

        it('그 사이 상태가 바뀌었으면(예약 조건 0행) 400, 결제 쓰기 없음', async () => {
            repo.updateReservation.mockResolvedValueOnce(false);

            const {result} = await runCancel();

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null}});
            expect(repo.updatePayment).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('사유가 없으면 → cancel_reason', async () => {
            await expect(validateBody(ReservationCancelDto, {})).resolves.toEqual({
                message: '취소 사유를 입력해주세요.',
                validation_errors: [{property: 'cancel_reason', message: '취소 사유를 입력해주세요.'}],
            });
        });

        it('사유가 256자면 → cancel_reason', async () => {
            await expect(validateBody(ReservationCancelDto, {cancel_reason: 'a'.repeat(256)})).resolves.toEqual({
                message: '취소 사유는 255자 이내로 입력해주세요.',
                validation_errors: [{property: 'cancel_reason', message: '취소 사유는 255자 이내로 입력해주세요.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 예약 조회 없음', async () => {
            const {result} = await runCancel(null);

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findReservation).not.toHaveBeenCalled();
        });
    });
});
```
```ts
// apps/user-service/src/reservation/test/reservation-list.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {Not} from 'typeorm';
import {bootHttpPath, createReservationRepositoryMock, internalHeaders, listRow, RESERVATION_ID, ReservationRepositoryMock, ROOM_ID, STORE_ID, USER_ACTOR} from './reservation.test-helper.js';

const PATH = '/internal/v1/user-service/reservation';

describe('GET /internal/v1/user-service/reservation — 내 예약 목록 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        repo = createReservationRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    it('[SUCCESS] count(결제 대기 만료 제외) → 페이지 → 목록, 시각은 ISO', async () => {
        repo.countReservations.mockResolvedValueOnce(21);
        repo.findMyReservationRows.mockResolvedValueOnce([listRow()]);

        const res = await request(app.getHttpServer()).get(PATH).query({page: '2', size: '20'}).set(internalHeaders(USER_ACTOR));

        expect(res.status).toBe(200);
        expect(repo.countReservations).toHaveBeenCalledWith({user_id: USER_ACTOR.user_id, reservation_state_id: Not('EXPIRED')});
        expect(repo.findMyReservationRows).toHaveBeenCalledWith(USER_ACTOR.user_id, 20, 20);
        expect(res.body.list[0]).toEqual({
            reservation_id: RESERVATION_ID,
            store_id: STORE_ID,
            store_name: '루미 강남점',
            room_id: ROOM_ID,
            room_name: '101호',
            room_group_name: '스탠다드',
            room_plan_type_id: 'HOURLY',
            room_plan_type_name: '시간 이용',
            reservation_state_id: 'CONFIRMED',
            reservation_state_name: '예약 확정',
            start_at: '2026-11-10T04:00:00.000Z',
            end_at: '2026-11-10T07:00:00.000Z',
            total_price: 30000,
            refund_deadline_at: '2026-11-10T03:00:00.000Z',
            created_at: '2026-11-03T00:00:00.000Z',
        });
        expect(res.body.pagination).toMatchObject({total_count: 21});
    });
});
```

```ts
// apps/user-service/src/reservation/test/reservation-detail.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createReservationRepositoryMock, DETAIL_ID, internalHeaders, listRow, PAYMENT_ID, RESERVATION_ID, ReservationRepositoryMock, USER_ACTOR} from './reservation.test-helper.js';

const PATH = `/internal/v1/user-service/reservation/${RESERVATION_ID}`;

describe('GET /internal/v1/user-service/reservation/:reservation_id — 내 예약 상세 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        repo = createReservationRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    it('[SUCCESS] 예약 + 마감 뒤 비율 · 취소 정보 + 구간 · 결제', async () => {
        repo.findMyReservationRow.mockResolvedValueOnce(listRow());
        repo.findReservationSegmentRows.mockResolvedValueOnce([
            {
                reservation_detail_id: DETAIL_ID,
                reservation_detail_type_id: 'BASE',
                reservation_detail_type_name: '기본',
                reservation_state_id: 'CONFIRMED',
                start_at: new Date('2026-11-10T04:00:00Z'),
                end_at: new Date('2026-11-10T07:00:00Z'),
                price: 30000,
                expires_at: new Date('2026-11-03T00:05:00Z'),
                payment_id: PAYMENT_ID,
                payment_state_id: 'DONE',
                payment_state_name: '결제 완료',
                amount: 30000,
                method: '카드',
                approved_at: new Date('2026-11-03T00:01:00Z'),
                receipt_url: 'https://receipt.test/1',
                refund_amount: null,
                refunded_at: null,
            },
        ]);

        const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

        expect(res.status).toBe(200);
        expect(repo.findMyReservationRow).toHaveBeenCalledWith(USER_ACTOR.user_id, RESERVATION_ID);
        expect(repo.findReservationSegmentRows).toHaveBeenCalledWith(RESERVATION_ID);
        expect(res.body).toMatchObject({reservation_id: RESERVATION_ID, late_refund_percent: 50, canceled_at: null, cancel_actor: null, cancel_reason: null});
        expect(res.body.segments).toEqual([
            {
                reservation_detail_id: DETAIL_ID,
                reservation_detail_type_id: 'BASE',
                reservation_detail_type_name: '기본',
                reservation_state_id: 'CONFIRMED',
                start_at: '2026-11-10T04:00:00.000Z',
                end_at: '2026-11-10T07:00:00.000Z',
                price: 30000,
                expires_at: '2026-11-03T00:05:00.000Z',
                payment: {
                    payment_id: PAYMENT_ID,
                    payment_state_id: 'DONE',
                    payment_state_name: '결제 완료',
                    amount: 30000,
                    method: '카드',
                    approved_at: '2026-11-03T00:01:00.000Z',
                    receipt_url: 'https://receipt.test/1',
                    refund_amount: null,
                    refunded_at: null,
                },
            },
        ]);
    });

    it('[FAIL:service] 남의 예약 · 결제 대기 만료 건(행 없음)은 404, 구간 조회 없음', async () => {
        const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

        expect(res.status).toBe(404);
        expect(res.body).toEqual({message: '예약을 찾을 수 없습니다.', validation_errors: null});
        expect(repo.findReservationSegmentRows).not.toHaveBeenCalled();
    });

    it('[FAIL:validation] 예약 ID 형식이 아니면 400', async () => {
        const res = await request(app.getHttpServer()).get('/internal/v1/user-service/reservation/xyz').set(internalHeaders(USER_ACTOR));

        expect(res.status).toBe(400);
        expect(res.body.validation_errors).toEqual([{property: 'reservation_id', message: '예약 ID가 올바르지 않습니다.'}]);
    });
});
```


```ts
// apps/user-service/src/reservation/test/reservation-store.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    createReservationRepositoryMock,
    internalHeaders,
    MANAGER_ACTOR,
    RESERVATION_ID,
    ReservationRepositoryMock,
    ROOM_GROUP_ID,
    ROOM_ID,
    ROOM_ID_2,
    STORE_ID,
} from './reservation.test-helper.js';

const PATH = '/internal/v1/user-service/reservation/store';

describe('GET /internal/v1/user-service/reservation/store — 내 업체 예약 현황 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        repo = createReservationRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    it('[SUCCESS] 매니저 소속 업체 · 그날 [0시, 다음 날 0시) — 호실마다 예약(이용자 이름 · 휴대폰)을 붙인다, 예약 없는 호실은 빈 배열', async () => {
        repo.findStoreRoomRows.mockResolvedValueOnce([
            {room_id: ROOM_ID, room_name: '101호', floor: 1, room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', room_state_id: 'IN_USE', room_state_name: '사용중'},
            {room_id: ROOM_ID_2, room_name: '102호', floor: 1, room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', room_state_id: 'AVAILABLE', room_state_name: '예약가능'},
        ]);
        repo.findStoreReservationRows.mockResolvedValueOnce([
            {
                reservation_id: RESERVATION_ID,
                room_id: ROOM_ID,
                reservation_state_id: 'CONFIRMED',
                reservation_state_name: '예약 확정',
                room_plan_type_id: 'HOURLY',
                room_plan_type_name: '시간 이용',
                start_at: new Date('2026-11-10T00:00:00Z'),
                end_at: new Date('2026-11-10T03:00:00Z'),
                blocked_until: new Date('2026-11-10T03:30:00Z'),
                total_price: 30000,
                user_name: '김이용',
                user_phone: '01012345678',
            },
        ]);

        const res = await request(app.getHttpServer()).get(PATH).query({date: '2026-11-10'}).set(internalHeaders(MANAGER_ACTOR));

        expect(res.status).toBe(200);
        expect(repo.findReservationUser).toHaveBeenCalledWith({user_id: MANAGER_ACTOR.user_id, login_scope: 'MANAGER'});
        expect(repo.findStoreRoomRows).toHaveBeenCalledWith(STORE_ID);
        expect(repo.findStoreReservationRows).toHaveBeenCalledWith(STORE_ID, new Date('2026-11-09T15:00:00Z'), new Date('2026-11-10T15:00:00Z'));
        expect(res.body.date).toBe('2026-11-10');
        expect(res.body.list[0].reservations).toEqual([
            {
                reservation_id: RESERVATION_ID,
                reservation_state_id: 'CONFIRMED',
                reservation_state_name: '예약 확정',
                room_plan_type_id: 'HOURLY',
                room_plan_type_name: '시간 이용',
                start_at: '2026-11-10T00:00:00.000Z',
                end_at: '2026-11-10T03:00:00.000Z',
                blocked_until: '2026-11-10T03:30:00.000Z',
                total_price: 30000,
                user_name: '김이용',
                user_phone: '01012345678',
            },
        ]);
        expect(res.body.list[1]).toMatchObject({room_id: ROOM_ID_2, room_state_id: 'AVAILABLE', reservations: []});
    });

    it('[FAIL:service] 소속 업체가 없으면 404, 호실 조회 없음', async () => {
        repo.findReservationUser.mockResolvedValueOnce({user_id: MANAGER_ACTOR.user_id, store_id: null});

        const res = await request(app.getHttpServer()).get(PATH).query({date: '2026-11-10'}).set(internalHeaders(MANAGER_ACTOR));

        expect(res.status).toBe(404);
        expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
        expect(repo.findStoreRoomRows).not.toHaveBeenCalled();
    });

    it('[FAIL:validation] 날짜 형식이 아니면 400 → date', async () => {
        const res = await request(app.getHttpServer()).get(PATH).query({date: '11/10'}).set(internalHeaders(MANAGER_ACTOR));

        expect(res.status).toBe(400);
        expect(res.body.validation_errors).toEqual([{property: 'date', message: '날짜를 YYYY-MM-DD 로 입력해주세요.'}]);
    });
});
```

```ts
// apps/user-service/src/reservation/test/reservation-store-cancel.spec.ts — new
import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {ReservationStoreCancelDto} from '@app/contracts/reservation/dto/reservation-store-cancel.dto.js';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    createSmsSenderMock,
    detailEntity,
    MANAGER_ACTOR,
    PAYMENT_ID,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    runCommand,
    SmsSenderMock,
    STORE_ID,
    USER_ACTOR,
    validateBody,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID, cancel_reason: '설비 고장'};

describe('user.reservation.store-cancel — 업체 취소 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
        repo = createReservationRepositoryMock();
        repo.findReservationUser.mockImplementation(async (where: {user_id: string}) =>
            where.user_id === MANAGER_ACTOR.user_id ? {user_id: MANAGER_ACTOR.user_id, store_id: STORE_ID} : {user_id: USER_ACTOR.user_id, phone: '01012345678'},
        );
        sms = createSmsSenderMock();
        ({dispatcher, module} = await bootCommandPath(repo, createPaymentGatewayMock(), sms));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 업체 취소 명령 1건
     *
     * @returns 판정 · 결과
     */
    function runStoreCancel() {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.STORE_CANCEL, payload: PAYLOAD, actor: MANAGER_ACTOR});
    }

    it('[SUCCESS] 확정 예약 — 예약 · 구간 CANCELED(주체 STORE) + 구간 금액 100% 환불 신청 + 이용자 SMS(마지막)', async () => {
        const {decision} = await runStoreCancel();

        expect(decision.action).toBe('ack');
        expect(repo.findReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, store_id: STORE_ID});
        const [, canceled] = repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity];
        expect(canceled).toMatchObject({reservation_state_id: 'CANCELED', cancel_actor: 'STORE', cancel_reason: '설비 고장'});
        const [where, refund] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
        expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'DONE'});
        expect(refund).toMatchObject({payment_state_id: 'REFUND_REQUESTED', refund_amount: 30000, refund_reason: '업체 예약 취소'});
        expect(sms.send).toHaveBeenCalledTimes(1);
        expect(sms.send).toHaveBeenCalledWith({to: '01012345678', text: '[roomless] 루미 강남점 11/10 13:00 예약이 업체 사정으로 취소되었습니다. 결제 금액은 전액 환불됩니다. 사유: 설비 고장'});
        expect(sms.send.mock.invocationCallOrder[0]).toBeGreaterThan(repo.updatePayment.mock.invocationCallOrder[0]);
    });

    it('[SUCCESS] 결제 대기 예약 — 결제 EXPIRED(환불 없음)', async () => {
        repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'PENDING'}));
        repo.findReservationDetails.mockResolvedValueOnce([detailEntity({reservation_state_id: 'PENDING'})]);

        await runStoreCancel();

        const [where, expired] = repo.updatePayment.mock.calls[0] as [unknown, PaymentEntity];
        expect(where).toEqual({payment_id: PAYMENT_ID, payment_state_id: 'READY'});
        expect(expired.payment_state_id).toBe('EXPIRED');
    });

    it('[SKIP] 이용자 번호가 없으면(휴대폰 인증 전) SMS 를 건너뛰고 done', async () => {
        repo.findReservationUser.mockImplementation(async (where: {user_id: string}) =>
            where.user_id === MANAGER_ACTOR.user_id ? {user_id: MANAGER_ACTOR.user_id, store_id: STORE_ID} : {user_id: USER_ACTOR.user_id, phone: null},
        );

        const {decision} = await runStoreCancel();

        expect(decision.action).toBe('ack');
        expect(sms.send).not.toHaveBeenCalled();
    });

    it('[FAIL:service] 다른 업체 예약(없음)은 404, 쓰기 없음', async () => {
        repo.findReservation.mockResolvedValueOnce(null);

        const {result} = await runStoreCancel();

        expect(result?.error).toEqual({status_code: 404, body: {message: '예약을 찾을 수 없습니다.', validation_errors: null}});
        expect(repo.updateReservation).not.toHaveBeenCalled();
    });

    it('[FAIL:external] SMS 503 이면 재시도(쓰기는 롤백 — 다시 돌 때 같은 결과)', async () => {
        sms.send.mockRejectedValueOnce(new ServiceUnavailableException({message: 'SMS를 보내지 못했습니다. 잠시 후 다시 시도해주세요.'}));

        const {decision} = await runStoreCancel();

        expect(decision.action).toBe('requeue');
    });

    it('[FAIL:validation] 사유가 없으면 → cancel_reason', async () => {
        await expect(validateBody(ReservationStoreCancelDto, {})).resolves.toEqual({
            message: '취소 사유를 입력해주세요.',
            validation_errors: [{property: 'cancel_reason', message: '취소 사유를 입력해주세요.'}],
        });
    });
});
```

```ts
// apps/user-service/src/reservation/test/reservation-room-change.spec.ts — new
import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {RESERVATION_COMMAND} from '@app/contracts/reservation/reservation.commands.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createPaymentGatewayMock,
    createReservationRepositoryMock,
    createSmsSenderMock,
    MANAGER_ACTOR,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    roomEntity,
    ROOM_ID,
    ROOM_ID_2,
    runCommand,
    SmsSenderMock,
    STORE_ID,
    USER_ACTOR,
} from './reservation.test-helper.js';

const PAYLOAD = {reservation_id: RESERVATION_ID, room_id: ROOM_ID_2};

describe('user.reservation.room-change — 호실 이동 (큐 경로)', () => {
    let repo: ReservationRepositoryMock;
    let sms: SmsSenderMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-09T00:00:00Z'));
        repo = createReservationRepositoryMock();
        repo.findReservationUser.mockImplementation(async (where: {user_id: string}) =>
            where.user_id === MANAGER_ACTOR.user_id ? {user_id: MANAGER_ACTOR.user_id, store_id: STORE_ID} : {user_id: USER_ACTOR.user_id, phone: '01012345678'},
        );
        repo.findReservationRoom.mockImplementation(async (where: {room_id: string}) => (where.room_id === ROOM_ID ? roomEntity() : roomEntity({room_id: ROOM_ID_2, room_name: '102호'})));
        sms = createSmsSenderMock();
        ({dispatcher, module} = await bootCommandPath(repo, createPaymentGatewayMock(), sms));
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await module.close();
    });

    /**
     * 호실 이동 명령 1건
     *
     * @returns 판정 · 결과
     */
    function runChange() {
        return runCommand(dispatcher, {type: RESERVATION_COMMAND.ROOM_CHANGE, payload: PAYLOAD, actor: MANAGER_ACTOR});
    }

    it('[SUCCESS] 같은 그룹 · 사용 가능한 호실로 room_id 만 바꾸고(상태 조건 CONFIRMED) 이용자 SMS', async () => {
        const {decision} = await runChange();

        expect(decision.action).toBe('ack');
        expect(repo.findReservationRoom).toHaveBeenCalledWith({room_id: ROOM_ID_2, store_id: STORE_ID});
        const [where, entity] = repo.changeReservationRoom.mock.calls[0] as [unknown, ReservationEntity];
        expect(where).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
        expect(entity).toBeInstanceOf(ReservationEntity);
        expect(entity).toEqual(Object.assign(new ReservationEntity(), {room_id: ROOM_ID_2}));
        expect(sms.send).toHaveBeenCalledWith({to: '01012345678', text: '[roomless] 루미 강남점 11/10 13:00 예약 호실이 101호에서 102호로 변경되었습니다.'});
    });

    it.each([
        ['다른 그룹 호실', roomEntity({room_id: ROOM_ID_2, room_group_id: '7'.repeat(32)}), '같은 객실 그룹의 호실로만 옮길 수 있습니다.'],
        ['사용중지 호실', roomEntity({room_id: ROOM_ID_2, room_state_id: 'DISABLED'}), '사용중지된 호실로는 옮길 수 없습니다.'],
    ])('[FAIL:service] %s 이면 400 validation_errors.room_id, 이동 없음', async (_label, target, message) => {
        repo.findReservationRoom.mockImplementation(async (where: {room_id: string}) => (where.room_id === ROOM_ID ? roomEntity() : target));

        const {result} = await runChange();

        expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property: 'room_id', message}]}});
        expect(repo.changeReservationRoom).not.toHaveBeenCalled();
    });

    it('[FAIL:service] 이용 시작 뒤 · 확정이 아닌 예약은 400', async () => {
        repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'PENDING'}));

        const {result} = await runChange();

        expect(result?.error).toEqual({status_code: 400, body: {message: '이용 시작 전의 확정 예약만 옮길 수 있습니다.', validation_errors: null}});
        expect(repo.changeReservationRoom).not.toHaveBeenCalled();
    });

    it('[FAIL:duplicate] 옮길 호실에 겹치는 예약(배타 제약 — repository 400)이면 failed 400, SMS 없음', async () => {
        repo.changeReservationRoom.mockRejectedValueOnce(new BadRequestException({message: '옮길 호실에 겹치는 예약이 있습니다.'}));

        const {result} = await runChange();

        expect(result?.error).toEqual({status_code: 400, body: {message: '옮길 호실에 겹치는 예약이 있습니다.', validation_errors: null}});
        expect(sms.send).not.toHaveBeenCalled();
    });

    it('[SECURITY] actor 없는 명령은 failed 401', async () => {
        const {result} = await runCommand(dispatcher, {type: RESERVATION_COMMAND.ROOM_CHANGE, payload: PAYLOAD, actor: null});

        expect(result?.error?.status_code).toBe(401);
        expect(repo.findReservation).not.toHaveBeenCalled();
    });
});
```
```ts
// apps/user-service/src/reservation/test/reservation.repository.spec.ts — new
import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, In, LessThan, MoreThan, Not, QueryFailedError} from 'typeorm';
import type {EntityTarget, FindManyOptions, ObjectLiteral} from 'typeorm';
import {RESERVATION_OCCUPYING_STATES, RESERVATION_STATE} from '@app/contracts/reservation/reservation.constants.js';
import {ENTITIES} from '@app/database/entities.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {ReservationRepository} from '../repositories/reservation.repository.js';

/**
 * PostgreSQL 제약 위반 오류
 *
 * @param code 23P01(배타 제약) 등
 * @param constraint 제약명
 * @returns QueryFailedError
 */
function constraintError(code: string, constraint: string): QueryFailedError {
    return new QueryFailedError('INSERT ...', [], Object.assign(new Error('violates constraint'), {code, constraint}));
}

/**
 * select 별칭 목록
 *
 * @param sql SQL
 * @returns 별칭
 */
function selectAliases(sql: string): string[] {
    return [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]);
}

/**
 * repository 가 manager.find · count 에 넘긴 옵션을 SQL 로 빌드한다 — EntityManager.find · count 와 같은 방식(실행만 뺀다).
 *
 * @param dataSource 메타데이터만 만든 DataSource
 * @param call 가로챈 호출 인자(대상 엔티티, 옵션)
 * @returns 공백을 하나로 줄인 SQL 과 파라미터
 */
function buildFindQuery(dataSource: DataSource, call: unknown[]): [string, unknown[]] {
    const [target, options] = call as [EntityTarget<ObjectLiteral>, FindManyOptions<ObjectLiteral>];
    const [sql, parameters] = dataSource.manager.createQueryBuilder(target, dataSource.getMetadata(target).name).setFindOptions(options).getQueryAndParameters();
    return [sql.replace(/\s+/g, ' '), parameters];
}

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티)마다 가짜 repository.
 *
 * @returns 저장소와 가짜 repository 들
 */
function makeRepository() {
    const fake = () => ({
        findOne: vi.fn().mockResolvedValue(null),
        find: vi.fn().mockResolvedValue([]),
        insert: vi.fn(),
        update: vi.fn().mockResolvedValue({affected: 1}),
        count: vi.fn().mockResolvedValue(0),
    });
    const repositories = new Map<unknown, ReturnType<typeof fake>>();
    const txHost = {
        tx: {
            getRepository: (entity: unknown) => {
                if (!repositories.has(entity)) {
                    repositories.set(entity, fake());
                }
                return repositories.get(entity);
            },
        },
    } as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    const repository = new ReservationRepository(txHost);
    return {repository, of: (entity: unknown) => txHost.tx.getRepository(entity as never) as unknown as ReturnType<typeof fake>};
}

describe('ReservationRepository — 조건 · 오류 변환', () => {
    it('[SUCCESS] is_deleted 가 있는 표(업체 · 기간 가격)는 조건에 is_deleted = 0 을 더하고, 상품 설정은 그대로', async () => {
        const {repository, of} = makeRepository();

        await repository.findReservationStore({store_id: 's1'});
        await repository.findGroupPlanPrices({room_group_plan_id: 'gp1'});
        await repository.findStorePlan({store_id: 's1', room_plan_type_id: 'HOURLY'});

        expect(of(StoreEntity).findOne).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, loadRelationIds: true});
        expect(of(RoomGroupPlanPriceEntity).find).toHaveBeenCalledWith({where: {room_group_plan_id: 'gp1', is_deleted: 0}, loadRelationIds: true});
        expect(of(RoomPlanEntity).findOne).toHaveBeenCalledWith({where: {store_id: 's1', room_plan_type_id: 'HOURLY'}, loadRelationIds: true});
    });

    it('[FAIL:duplicate] insertReservation 은 점유 겹침(EXC_Reservation_RoomIdBlockedRange)을 400 으로, 그 밖은 통일 500', async () => {
        const {repository, of} = makeRepository();
        of(ReservationEntity).insert.mockRejectedValueOnce(constraintError('23P01', 'EXC_Reservation_RoomIdBlockedRange'));
        of(ReservationEntity).insert.mockRejectedValueOnce(new Error('db'));

        const taken = await repository.insertReservation(new ReservationEntity()).catch((e: unknown) => e);
        const failed = await repository.insertReservation(new ReservationEntity()).catch((e: unknown) => e);

        expect(taken).toBeInstanceOf(BadRequestException);
        expect((taken as BadRequestException).getResponse()).toEqual({message: '이미 예약된 시간입니다.'});
        expect(failed).toBeInstanceOf(InternalServerErrorException);
        expect((failed as InternalServerErrorException).getResponse()).toEqual({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
    });

    it('[FAIL:duplicate] changeReservationRoom 은 옮길 호실 겹침을 400 으로', async () => {
        const {repository, of} = makeRepository();
        of(ReservationEntity).update.mockRejectedValueOnce(constraintError('23P01', 'EXC_Reservation_RoomIdBlockedRange'));

        const error = await repository.changeReservationRoom({reservation_id: 'r1'}, new ReservationEntity()).catch((e: unknown) => e);

        expect((error as BadRequestException).getResponse()).toEqual({message: '옮길 호실에 겹치는 예약이 있습니다.'});
    });

    it('[SUCCESS] updateReservation 은 1행이면 true, 0행이면 false(상태 조건)', async () => {
        const {repository, of} = makeRepository();
        of(ReservationEntity).update.mockResolvedValueOnce({affected: 1}).mockResolvedValueOnce({affected: 0});

        await expect(repository.updateReservation({reservation_id: 'r1', reservation_state_id: 'PENDING'}, new ReservationEntity())).resolves.toBe(true);
        await expect(repository.updateReservation({reservation_id: 'r1', reservation_state_id: 'PENDING'}, new ReservationEntity())).resolves.toBe(false);
    });

    it.each([
        ['findBookableRooms', 'buildBookableRoomsQuery', ['s1']],
        ['countRecentExpired', 'buildRecentExpiredQuery', ['u1', 'r1', new Date('2026-11-03T00:00:00Z')]],
        ['findReservationSegmentRows', 'buildReservationSegmentsQuery', ['v1']],
        ['findStoreRoomRows', 'buildStoreRoomsQuery', ['s1']],
        ['findStoreReservationRows', 'buildStoreReservationsQuery', ['s1', new Date('2026-11-09T15:00:00Z'), new Date('2026-11-10T15:00:00Z')]],
    ] as const)('%s 는 같은 인자로 %s 를 실행하고, 실패는 통일 500', async (method, builder, args) => {
        const {repository} = makeRepository();
        const failing = {getRawMany: vi.fn().mockRejectedValue(new Error('db')), getCount: vi.fn().mockRejectedValue(new Error('db'))};
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue(failing);

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledWith(...args);
    });
});

describe('[SMOKE:data-access] 예약 가능 호실 · 최근 만료 · 내 예약 · 구간 · 업체 현황 — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: ReservationRepository;

    /** 빌드된 SQL(빌드 때 실행 출력으로 고정) */
    const BOOKABLE_ROOMS_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."room_group_id" AS "room_group_id", "g"."room_group_name" AS "room_group_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 ORDER BY "r"."floor" ASC, "r"."room_name" ASC';
    const RECENT_EXPIRED_SQL =
        'SELECT "r"."reservation_id" AS "r_reservation_id", "r"."start_at" AS "r_start_at", "r"."end_at" AS "r_end_at", "r"."maintenance_minutes" AS "r_maintenance_minutes", "r"."blocked_until" AS "r_blocked_until", "r"."total_price" AS "r_total_price", "r"."refund_deadline_at" AS "r_refund_deadline_at", "r"."late_refund_percent" AS "r_late_refund_percent", "r"."checked_in_at" AS "r_checked_in_at", "r"."completed_at" AS "r_completed_at", "r"."canceled_at" AS "r_canceled_at", "r"."cancel_actor" AS "r_cancel_actor", "r"."cancel_reason" AS "r_cancel_reason", "r"."created_at" AS "r_created_at", "r"."updated_at" AS "r_updated_at", "r"."user_id" AS "r_user_id", "r"."store_id" AS "r_store_id", "r"."room_id" AS "r_room_id", "r"."room_plan_type_id" AS "r_room_plan_type_id", "r"."reservation_state_id" AS "r_reservation_state_id" FROM "t_reservation" "r" INNER JOIN "t_reservation_detail" "d" ON "d"."reservation_id" = "r"."reservation_id" AND "d"."reservation_detail_type_id" = $1 WHERE "r"."user_id" = $2 AND "r"."room_id" = $3 AND "r"."reservation_state_id" = $4 AND "d"."expires_at" > $5';
    const MY_RESERVATIONS_SQL =
        'SELECT "r"."reservation_id" AS "reservation_id", "r"."store_id" AS "store_id", "r"."room_id" AS "room_id", "r"."room_plan_type_id" AS "room_plan_type_id", "r"."reservation_state_id" AS "reservation_state_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at", "r"."total_price" AS "total_price", "r"."refund_deadline_at" AS "refund_deadline_at", "r"."late_refund_percent" AS "late_refund_percent", "r"."canceled_at" AS "canceled_at", "r"."cancel_actor" AS "cancel_actor", "r"."cancel_reason" AS "cancel_reason", "r"."created_at" AS "created_at", "s"."store_name" AS "store_name", "rm"."room_name" AS "room_name", "g"."room_group_name" AS "room_group_name", "pt"."room_plan_type_name" AS "room_plan_type_name", "st"."reservation_state_name" AS "reservation_state_name" FROM "t_reservation" "r" INNER JOIN "t_store" "s" ON "s"."store_id" = "r"."store_id" INNER JOIN "t_room" "rm" ON "rm"."room_id" = "r"."room_id" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "rm"."room_group_id" INNER JOIN "t_room_plan_type" "pt" ON "pt"."room_plan_type_id" = "r"."room_plan_type_id" INNER JOIN "t_reservation_state" "st" ON "st"."reservation_state_id" = "r"."reservation_state_id" WHERE "r"."user_id" = $1 AND "r"."reservation_state_id" <> $2';
    const MY_RESERVATION_SQL =
        'SELECT "r"."reservation_id" AS "reservation_id", "r"."store_id" AS "store_id", "r"."room_id" AS "room_id", "r"."room_plan_type_id" AS "room_plan_type_id", "r"."reservation_state_id" AS "reservation_state_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at", "r"."total_price" AS "total_price", "r"."refund_deadline_at" AS "refund_deadline_at", "r"."late_refund_percent" AS "late_refund_percent", "r"."canceled_at" AS "canceled_at", "r"."cancel_actor" AS "cancel_actor", "r"."cancel_reason" AS "cancel_reason", "r"."created_at" AS "created_at", "s"."store_name" AS "store_name", "rm"."room_name" AS "room_name", "g"."room_group_name" AS "room_group_name", "pt"."room_plan_type_name" AS "room_plan_type_name", "st"."reservation_state_name" AS "reservation_state_name" FROM "t_reservation" "r" INNER JOIN "t_store" "s" ON "s"."store_id" = "r"."store_id" INNER JOIN "t_room" "rm" ON "rm"."room_id" = "r"."room_id" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "rm"."room_group_id" INNER JOIN "t_room_plan_type" "pt" ON "pt"."room_plan_type_id" = "r"."room_plan_type_id" INNER JOIN "t_reservation_state" "st" ON "st"."reservation_state_id" = "r"."reservation_state_id" WHERE "r"."user_id" = $1 AND "r"."reservation_state_id" <> $2 AND "r"."reservation_id" = $3';
    const SEGMENTS_SQL =
        'SELECT "d"."reservation_detail_id" AS "reservation_detail_id", "d"."reservation_detail_type_id" AS "reservation_detail_type_id", "d"."reservation_state_id" AS "reservation_state_id", "d"."start_at" AS "start_at", "d"."end_at" AS "end_at", "d"."price" AS "price", "d"."expires_at" AS "expires_at", "d"."payment_id" AS "payment_id", "dt"."reservation_detail_type_name" AS "reservation_detail_type_name", "p"."payment_state_id" AS "payment_state_id", "p"."amount" AS "amount", "p"."method" AS "method", "p"."approved_at" AS "approved_at", "p"."receipt_url" AS "receipt_url", "p"."refund_amount" AS "refund_amount", "p"."refunded_at" AS "refunded_at", "ps"."payment_state_name" AS "payment_state_name" FROM "t_reservation_detail" "d" INNER JOIN "t_reservation_detail_type" "dt" ON "dt"."reservation_detail_type_id" = "d"."reservation_detail_type_id" INNER JOIN "t_payment" "p" ON "p"."payment_id" = "d"."payment_id" INNER JOIN "t_payment_state" "ps" ON "ps"."payment_state_id" = "p"."payment_state_id" WHERE "d"."reservation_id" = $1 ORDER BY "d"."start_at" ASC';
    const STORE_ROOMS_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_group_id" AS "room_group_id", "r"."room_state_id" AS "room_state_id", "g"."room_group_name" AS "room_group_name", "rs"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "rs" ON "rs"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 ORDER BY "r"."floor" ASC, "r"."room_name" ASC';
    const STORE_RESERVATIONS_SQL =
        'SELECT "r"."reservation_id" AS "reservation_id", "r"."room_id" AS "room_id", "r"."reservation_state_id" AS "reservation_state_id", "r"."room_plan_type_id" AS "room_plan_type_id", "r"."start_at" AS "start_at", "r"."end_at" AS "end_at", "r"."blocked_until" AS "blocked_until", "r"."total_price" AS "total_price", "st"."reservation_state_name" AS "reservation_state_name", "pt"."room_plan_type_name" AS "room_plan_type_name", "u"."name" AS "user_name", "u"."phone" AS "user_phone" FROM "t_reservation" "r" INNER JOIN "t_reservation_state" "st" ON "st"."reservation_state_id" = "r"."reservation_state_id" INNER JOIN "t_room_plan_type" "pt" ON "pt"."room_plan_type_id" = "r"."room_plan_type_id" INNER JOIN "t_user" "u" ON "u"."user_id" = "r"."user_id" WHERE "r"."store_id" = $1 AND "r"."reservation_state_id" IN ($2, $3, $4, $5) AND "r"."start_at" < $6 AND "r"."end_at" > $7 ORDER BY "r"."start_at" ASC';

    beforeAll(async () => {
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('예약 가능 호실 — 지워지지 않은 호실 · 그룹, 층 · 호실명 순, 별칭 = BookableRoomRow 키', () => {
        const [sql, parameters] = repository.buildBookableRoomsQuery('s1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('INNER JOIN "t_room_group" "g"');
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toContain('"g"."is_deleted" = 0');
        expect([...selectAliases(flat)].sort()).toEqual(['floor', 'room_group_id', 'room_group_name', 'room_id', 'room_name', 'room_state_id']);
        expect(flat).toBe(BOOKABLE_ROOMS_SQL);
    });

    it('최근 결제 대기 만료 — 기본 구간 조인 · 만료 상태 · expires_at > since', () => {
        const since = new Date('2026-11-02T23:50:00Z');
        const [sql, parameters] = repository.buildRecentExpiredQuery('u1', 'r1', since).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['BASE', 'u1', 'r1', 'EXPIRED', since]);
        expect(flat).toContain('INNER JOIN "t_reservation_detail" "d"');
        expect(flat).toContain('"d"."expires_at" > $5');
        expect(flat).toBe(RECENT_EXPIRED_SQL);
    });

    it.each([
        [null, ['u1', 'EXPIRED']],
        ['v1', ['u1', 'EXPIRED', 'v1']],
    ])('내 예약 (예약 %s) — 업체 · 호실 · 그룹 · 상품 종류 · 상태 조인, 결제 대기 만료 제외, 별칭 = ReservationListRow 키', (reservation_id, expectedParameters) => {
        const [sql, parameters] = repository.buildMyReservationsQuery('u1', reservation_id).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expectedParameters);
        expect(flat).toContain('"r"."reservation_state_id" <> $2');
        expect(selectAliases(flat)).toHaveLength(19);
        expect(flat).toBe(reservation_id === null ? MY_RESERVATIONS_SQL : MY_RESERVATION_SQL);
    });

    it('예약 구간 — 종류 · 결제 · 결제 상태 조인, 시작 순, 별칭 = ReservationSegmentRow 키', () => {
        const [sql, parameters] = repository.buildReservationSegmentsQuery('v1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['v1']);
        expect(flat).toContain('INNER JOIN "t_payment" "p"');
        expect(selectAliases(flat)).toHaveLength(17);
        expect(flat).toBe(SEGMENTS_SQL);
    });

    it('업체 현황 호실 — 지워지지 않은 호실 · 그룹 + 상태명', () => {
        const [sql] = repository.buildStoreRoomsQuery('s1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(flat).toContain('INNER JOIN "t_room_state" "rs"');
        expect(flat).toBe(STORE_ROOMS_SQL);
    });

    it('업체 현황 예약 — 보이는 상태 IN · [from, to) 겹침 · 이용자 조인, 별칭 = StoreReservationRow 키', () => {
        const from = new Date('2026-11-09T15:00:00Z');
        const to = new Date('2026-11-10T15:00:00Z');
        const [sql, parameters] = repository.buildStoreReservationsQuery('s1', from, to).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1', 'PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', to, from]);
        expect(flat).toContain('INNER JOIN "t_user" "u"');
        expect(selectAliases(flat)).toContain('user_phone');
        expect(flat).toBe(STORE_RESERVATIONS_SQL);
    });
});

describe('[SMOKE:data-access] find 조건(관계 필드 In · LessThan · MoreThan · Not) — DB 연결 없이 SQL 빌드, repository 가 넘긴 옵션 그대로', () => {
    let dataSource: DataSource;
    let repository: ReservationRepository;
    let find: ReturnType<typeof vi.spyOn>;
    let count: ReturnType<typeof vi.spyOn>;
    const from = new Date('2026-11-04T00:00:00Z');
    const to = new Date('2026-11-05T00:00:00Z');

    /** 빌드된 SQL(빌드 때 실행 출력으로 고정) */
    const OCCUPIED_SQL =
        'SELECT "ReservationEntity"."reservation_id" AS "ReservationEntity_reservation_id", "ReservationEntity"."start_at" AS "ReservationEntity_start_at", "ReservationEntity"."end_at" AS "ReservationEntity_end_at", "ReservationEntity"."maintenance_minutes" AS "ReservationEntity_maintenance_minutes", "ReservationEntity"."blocked_until" AS "ReservationEntity_blocked_until", "ReservationEntity"."total_price" AS "ReservationEntity_total_price", "ReservationEntity"."refund_deadline_at" AS "ReservationEntity_refund_deadline_at", "ReservationEntity"."late_refund_percent" AS "ReservationEntity_late_refund_percent", "ReservationEntity"."checked_in_at" AS "ReservationEntity_checked_in_at", "ReservationEntity"."completed_at" AS "ReservationEntity_completed_at", "ReservationEntity"."canceled_at" AS "ReservationEntity_canceled_at", "ReservationEntity"."cancel_actor" AS "ReservationEntity_cancel_actor", "ReservationEntity"."cancel_reason" AS "ReservationEntity_cancel_reason", "ReservationEntity"."created_at" AS "ReservationEntity_created_at", "ReservationEntity"."updated_at" AS "ReservationEntity_updated_at", "ReservationEntity"."user_id" AS "ReservationEntity_user_id", "ReservationEntity"."store_id" AS "ReservationEntity_store_id", "ReservationEntity"."room_id" AS "ReservationEntity_room_id", "ReservationEntity"."room_plan_type_id" AS "ReservationEntity_room_plan_type_id", "ReservationEntity"."reservation_state_id" AS "ReservationEntity_reservation_state_id" FROM "t_reservation" "ReservationEntity" WHERE (("ReservationEntity"."room_id" IN ($1, $2)) AND ("ReservationEntity"."reservation_state_id" IN ($3, $4, $5)) AND ("ReservationEntity"."start_at" < $6) AND ("ReservationEntity"."blocked_until" > $7))';
    const UNAVAILABLE_SQL =
        'SELECT "StoreUnavailablePeriodEntity"."store_unavailable_period_id" AS "StoreUnavailablePeriodEntity_store_unavailable_period_id", "StoreUnavailablePeriodEntity"."starts_at" AS "StoreUnavailablePeriodEntity_starts_at", "StoreUnavailablePeriodEntity"."ends_at" AS "StoreUnavailablePeriodEntity_ends_at", "StoreUnavailablePeriodEntity"."memo" AS "StoreUnavailablePeriodEntity_memo", "StoreUnavailablePeriodEntity"."is_deleted" AS "StoreUnavailablePeriodEntity_is_deleted", "StoreUnavailablePeriodEntity"."created_at" AS "StoreUnavailablePeriodEntity_created_at", "StoreUnavailablePeriodEntity"."updated_at" AS "StoreUnavailablePeriodEntity_updated_at", "StoreUnavailablePeriodEntity"."store_id" AS "StoreUnavailablePeriodEntity_store_id" FROM "t_store_unavailable_period" "StoreUnavailablePeriodEntity" WHERE (("StoreUnavailablePeriodEntity"."store_id" = $1) AND ("StoreUnavailablePeriodEntity"."starts_at" < $2) AND ("StoreUnavailablePeriodEntity"."ends_at" > $3) AND ("StoreUnavailablePeriodEntity"."is_deleted" = $4))';
    const GROUP_PLANS_SQL =
        'SELECT "RoomGroupPlanEntity"."room_group_plan_id" AS "RoomGroupPlanEntity_room_group_plan_id", "RoomGroupPlanEntity"."is_used" AS "RoomGroupPlanEntity_is_used", "RoomGroupPlanEntity"."price" AS "RoomGroupPlanEntity_price", "RoomGroupPlanEntity"."created_at" AS "RoomGroupPlanEntity_created_at", "RoomGroupPlanEntity"."updated_at" AS "RoomGroupPlanEntity_updated_at", "RoomGroupPlanEntity"."room_group_id" AS "RoomGroupPlanEntity_room_group_id", "RoomGroupPlanEntity"."room_plan_type_id" AS "RoomGroupPlanEntity_room_plan_type_id" FROM "t_room_group_plan" "RoomGroupPlanEntity" WHERE (("RoomGroupPlanEntity"."room_group_id" IN ($1, $2)) AND ("RoomGroupPlanEntity"."room_plan_type_id" = $3))';
    const GROUP_PLAN_PRICES_SQL =
        'SELECT "RoomGroupPlanPriceEntity"."room_group_plan_price_id" AS "RoomGroupPlanPriceEntity_room_group_plan_price_id", "RoomGroupPlanPriceEntity"."start_date" AS "RoomGroupPlanPriceEntity_start_date", "RoomGroupPlanPriceEntity"."end_date" AS "RoomGroupPlanPriceEntity_end_date", "RoomGroupPlanPriceEntity"."price" AS "RoomGroupPlanPriceEntity_price", "RoomGroupPlanPriceEntity"."memo" AS "RoomGroupPlanPriceEntity_memo", "RoomGroupPlanPriceEntity"."is_deleted" AS "RoomGroupPlanPriceEntity_is_deleted", "RoomGroupPlanPriceEntity"."created_at" AS "RoomGroupPlanPriceEntity_created_at", "RoomGroupPlanPriceEntity"."updated_at" AS "RoomGroupPlanPriceEntity_updated_at", "RoomGroupPlanPriceEntity"."room_group_plan_id" AS "RoomGroupPlanPriceEntity_room_group_plan_id" FROM "t_room_group_plan_price" "RoomGroupPlanPriceEntity" WHERE (("RoomGroupPlanPriceEntity"."room_group_plan_id" IN ($1, $2)) AND ("RoomGroupPlanPriceEntity"."is_deleted" = $3))';
    const STORE_HOURS_SQL =
        'SELECT "StoreHourEntity"."store_hour_id" AS "StoreHourEntity_store_hour_id", "StoreHourEntity"."day_of_week" AS "StoreHourEntity_day_of_week", "StoreHourEntity"."is_closed" AS "StoreHourEntity_is_closed", "StoreHourEntity"."open_time" AS "StoreHourEntity_open_time", "StoreHourEntity"."close_time" AS "StoreHourEntity_close_time", "StoreHourEntity"."is_deleted" AS "StoreHourEntity_is_deleted", "StoreHourEntity"."created_at" AS "StoreHourEntity_created_at", "StoreHourEntity"."updated_at" AS "StoreHourEntity_updated_at", "StoreHourEntity"."store_id" AS "StoreHourEntity_store_id" FROM "t_store_hour" "StoreHourEntity" WHERE (("StoreHourEntity"."store_id" = $1) AND ("StoreHourEntity"."is_deleted" = $2))';
    const STORE_BREAKS_SQL =
        'SELECT "StoreBreakEntity"."store_break_id" AS "StoreBreakEntity_store_break_id", "StoreBreakEntity"."start_time" AS "StoreBreakEntity_start_time", "StoreBreakEntity"."end_time" AS "StoreBreakEntity_end_time", "StoreBreakEntity"."is_deleted" AS "StoreBreakEntity_is_deleted", "StoreBreakEntity"."created_at" AS "StoreBreakEntity_created_at", "StoreBreakEntity"."updated_at" AS "StoreBreakEntity_updated_at", "StoreBreakEntity"."store_id" AS "StoreBreakEntity_store_id" FROM "t_store_break" "StoreBreakEntity" WHERE (("StoreBreakEntity"."store_id" = $1) AND ("StoreBreakEntity"."is_deleted" = $2))';
    const COUNT_RESERVATIONS_SQL =
        'SELECT "ReservationEntity"."reservation_id" AS "ReservationEntity_reservation_id", "ReservationEntity"."start_at" AS "ReservationEntity_start_at", "ReservationEntity"."end_at" AS "ReservationEntity_end_at", "ReservationEntity"."maintenance_minutes" AS "ReservationEntity_maintenance_minutes", "ReservationEntity"."blocked_until" AS "ReservationEntity_blocked_until", "ReservationEntity"."total_price" AS "ReservationEntity_total_price", "ReservationEntity"."refund_deadline_at" AS "ReservationEntity_refund_deadline_at", "ReservationEntity"."late_refund_percent" AS "ReservationEntity_late_refund_percent", "ReservationEntity"."checked_in_at" AS "ReservationEntity_checked_in_at", "ReservationEntity"."completed_at" AS "ReservationEntity_completed_at", "ReservationEntity"."canceled_at" AS "ReservationEntity_canceled_at", "ReservationEntity"."cancel_actor" AS "ReservationEntity_cancel_actor", "ReservationEntity"."cancel_reason" AS "ReservationEntity_cancel_reason", "ReservationEntity"."created_at" AS "ReservationEntity_created_at", "ReservationEntity"."updated_at" AS "ReservationEntity_updated_at", "ReservationEntity"."user_id" AS "ReservationEntity_user_id", "ReservationEntity"."store_id" AS "ReservationEntity_store_id", "ReservationEntity"."room_id" AS "ReservationEntity_room_id", "ReservationEntity"."room_plan_type_id" AS "ReservationEntity_room_plan_type_id", "ReservationEntity"."reservation_state_id" AS "ReservationEntity_reservation_state_id" FROM "t_reservation" "ReservationEntity" WHERE (("ReservationEntity"."user_id" = $1) AND ("ReservationEntity"."reservation_state_id" != $2))';

    beforeAll(async () => {
        // 접속하지 않는다 — find · count 는 옵션만 가로채고, SQL 은 같은 옵션으로 QueryBuilder 가 조립한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
        find = vi.spyOn(dataSource.manager, 'find').mockResolvedValue([]);
        count = vi.spyOn(dataSource.manager, 'count').mockResolvedValue(0);
    });

    beforeEach(() => {
        find.mockClear();
        count.mockClear();
    });

    it('점유 예약 — 호실 IN · 점유 상태 IN · 시작 < 범위 끝 · 막힌 끝 > 범위 시작', async () => {
        await repository.findReservations({room_id: In(['r1', 'r2']), reservation_state_id: In(RESERVATION_OCCUPYING_STATES), start_at: LessThan(to), blocked_until: MoreThan(from)});
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(find).toHaveBeenCalledTimes(1);
        expect(parameters).toEqual(['r1', 'r2', 'PENDING', 'CONFIRMED', 'CHECKED_IN', to, from]);
        expect(sql).toContain(
            'WHERE (("ReservationEntity"."room_id" IN ($1, $2)) AND ("ReservationEntity"."reservation_state_id" IN ($3, $4, $5)) AND ("ReservationEntity"."start_at" < $6) AND ("ReservationEntity"."blocked_until" > $7))',
        );
        expect(sql).toBe(OCCUPIED_SQL);
    });

    it('일시 예약불가 — 업체 · 시작 < 범위 끝 · 끝 > 범위 시작 · 지워지지 않은 것', async () => {
        await repository.findUnavailablePeriods({store_id: 's1', starts_at: LessThan(to), ends_at: MoreThan(from)});
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(parameters).toEqual(['s1', to, from, 0]);
        expect(sql).toContain('("StoreUnavailablePeriodEntity"."starts_at" < $2) AND ("StoreUnavailablePeriodEntity"."ends_at" > $3) AND ("StoreUnavailablePeriodEntity"."is_deleted" = $4)');
        expect(sql).toBe(UNAVAILABLE_SQL);
    });

    it('그룹 상품 — 그룹 IN · 상품 종류(삭제 표시 없는 테이블)', async () => {
        await repository.findGroupPlans({room_group_id: In(['g1', 'g2']), room_plan_type_id: 'HOURLY'});
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(parameters).toEqual(['g1', 'g2', 'HOURLY']);
        expect(sql).toContain('WHERE (("RoomGroupPlanEntity"."room_group_id" IN ($1, $2)) AND ("RoomGroupPlanEntity"."room_plan_type_id" = $3))');
        expect(sql).toBe(GROUP_PLANS_SQL);
    });

    it('기간 가격 — 그룹 상품 IN · 지워지지 않은 것', async () => {
        await repository.findGroupPlanPrices({room_group_plan_id: In(['gp1', 'gp2'])});
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(parameters).toEqual(['gp1', 'gp2', 0]);
        expect(sql).toContain('WHERE (("RoomGroupPlanPriceEntity"."room_group_plan_id" IN ($1, $2)) AND ("RoomGroupPlanPriceEntity"."is_deleted" = $3))');
        expect(sql).toBe(GROUP_PLAN_PRICES_SQL);
    });

    it.each([
        ['영업시간', 'findStoreHours', 'StoreHourEntity', STORE_HOURS_SQL],
        ['브레이크타임', 'findStoreBreaks', 'StoreBreakEntity', STORE_BREAKS_SQL],
    ] as const)('%s — 업체 · 지워지지 않은 것', async (_label, method, alias, expectedSql) => {
        await repository[method]('s1');
        const [sql, parameters] = buildFindQuery(dataSource, find.mock.calls[0]);

        expect(parameters).toEqual(['s1', 0]);
        expect(sql).toContain(`WHERE (("${alias}"."store_id" = $1) AND ("${alias}"."is_deleted" = $2))`);
        expect(sql).toBe(expectedSql);
    });

    it('내 예약 수 — 이용자 · 결제 대기 만료 제외(Not)', async () => {
        await repository.countReservations({user_id: 'u1', reservation_state_id: Not(RESERVATION_STATE.EXPIRED)});
        const [sql, parameters] = buildFindQuery(dataSource, count.mock.calls[0]);

        expect(count).toHaveBeenCalledTimes(1);
        expect(parameters).toEqual(['u1', 'EXPIRED']);
        expect(sql).toContain('WHERE (("ReservationEntity"."user_id" = $1) AND ("ReservationEntity"."reservation_state_id" != $2))');
        expect(sql).toBe(COUNT_RESERVATIONS_SQL);
    });
});
```

```ts
// apps/scheduler/src/reservation/test/reservation.repository.spec.ts — new
import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {PaymentEntity} from '@app/database/entities/payment/payment.entity.js';
import {ReservationDetailEntity} from '@app/database/entities/reservation/reservation-detail.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {ReservationRepository} from '../repositories/reservation.repository.js';
import {buildConfirmTransition, buildExpireTransition} from '../reservation.util.js';

const ROW = {reservation_id: 'r1', payment_id: 'p1', amount: 30000};

/**
 * txHost(withTransaction 은 콜백을 바로 실행) · tx.getRepository 를 흉내 낸다.
 *
 * @returns 저장소와 가짜 repository 들
 */
function makeRepository() {
    const payments = {update: vi.fn().mockResolvedValue({affected: 1}), find: vi.fn().mockResolvedValue([])};
    const details = {update: vi.fn().mockResolvedValue({affected: 1})};
    const reservations = {update: vi.fn().mockResolvedValue({affected: 1})};
    const txHost = {
        withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
        tx: {getRepository: (entity: unknown) => (entity === PaymentEntity ? payments : entity === ReservationDetailEntity ? details : reservations)},
    } as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new ReservationRepository(txHost), payments, details, reservations};
}

describe('ReservationRepository(scheduler) — 결제 대기 전환 · 상태 조건', () => {
    it('[SUCCESS] transitionPending — 결제(READY) → 구간(PENDING) → 예약(PENDING) 을 한 트랜잭션으로', async () => {
        const {repository, payments, details, reservations} = makeRepository();
        const transition = buildConfirmTransition(
            {payment_key: 'k', order_id: 'p1', status: 'DONE', total_amount: 30000, method: '카드', approved_at: new Date('2026-11-03T00:01:00Z'), receipt_url: null},
            new Date(),
        );

        await expect(repository.transitionPending(ROW, transition)).resolves.toBe(true);

        expect(payments.update).toHaveBeenCalledWith({payment_id: 'p1', payment_state_id: 'READY'}, transition.payment);
        expect(details.update).toHaveBeenCalledWith({payment_id: 'p1', reservation_state_id: 'PENDING'}, transition.detail);
        expect(reservations.update).toHaveBeenCalledWith({reservation_id: 'r1', reservation_state_id: 'PENDING'}, transition.reservation);
        expect(transition.payment).toMatchObject({payment_state_id: 'DONE', payment_key: 'k'});
        expect((transition.reservation as ReservationEntity).reservation_state_id).toBe('CONFIRMED');
    });

    it('[SKIP] 결제가 이미 바뀌었으면(결제 확인 · 취소가 먼저) 구간 · 예약은 건드리지 않고 false', async () => {
        const {repository, payments, details} = makeRepository();
        payments.update.mockResolvedValueOnce({affected: 0});

        await expect(repository.transitionPending(ROW, buildExpireTransition())).resolves.toBe(false);
        expect(details.update).not.toHaveBeenCalled();
    });

    it('[FAIL:repository] 예약이 어긋나면(0행) 롤백 — 통일 500', async () => {
        const {repository, reservations} = makeRepository();
        reservations.update.mockResolvedValueOnce({affected: 0});

        await expect(repository.transitionPending(ROW, buildExpireTransition())).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('[SUCCESS] updatePayment 는 상태 조건(from_state)을 건다 — 1행이면 true', async () => {
        const {repository, payments} = makeRepository();
        const entity = new PaymentEntity();

        await expect(repository.updatePayment('p1', 'REFUND_REQUESTED', entity)).resolves.toBe(true);
        expect(payments.update).toHaveBeenCalledWith({payment_id: 'p1', payment_state_id: 'REFUND_REQUESTED'}, entity);
    });
});

describe('[SMOKE:data-access] 결제 대기 만료 — DB 연결 없이 SQL 빌드', () => {
    it('기본 구간 PENDING · expires_at ≤ now · 결제 READY, 별칭 = ExpiredPendingRow 키', async () => {
        const dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        const repository = new ReservationRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
        const now = new Date('2026-11-03T00:05:00Z');

        const [sql, parameters] = repository.buildExpiredPendingQuery(now).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['BASE', 'PENDING', now, 'READY']);
        expect(flat).toContain('INNER JOIN "t_payment" "p"');
        expect(flat).toContain('"d"."expires_at" <= $3');
        expect([...flat.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]).sort()).toEqual(['amount', 'payment_id', 'reservation_id']);
    });
});
```
### Tests — admin-service spec 고침

```ts
// apps/admin-service/src/store/test/store.test-helper.ts · apps/admin-service/src/room/test/room.test-helper.ts — modified (업체 픽스처 — refund_deadline_hours 줄을 바꾼다)
        refund_deadline_minutes: 60,
        late_refund_percent: 50,
```

```ts
// apps/admin-service/src/store/test/store-mine-reservation-policy.spec.ts — modified (payload · 성공 단언 · 검증 케이스)
const PAYLOAD = {booking_open_hours: 48, refund_deadline_minutes: 90, late_refund_percent: 30};

        it('내 업체(잠금)의 예약 가능 시작 · 환불 마감(분) · 마감 뒤 환불 비율만 바꾼다', async () => {
            const {decision} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_RESERVATION_POLICY, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            const [where, entity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity).toEqual(Object.assign(new StoreEntity(), {booking_open_hours: 48, refund_deadline_minutes: 90, late_refund_percent: 30}));
        });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('환불 마감 10,081분 → refund_deadline_minutes', async () => {
            await expect(validateBody(StoreMineReservationPolicyDto, {...PAYLOAD, refund_deadline_minutes: 10081})).resolves.toEqual({
                message: '환불 마감은 0 ~ 10,080분 사이로 입력해주세요.',
                validation_errors: [{property: 'refund_deadline_minutes', message: '환불 마감은 0 ~ 10,080분 사이로 입력해주세요.'}],
            });
        });

        it('마감 뒤 환불 비율 101% → late_refund_percent', async () => {
            await expect(validateBody(StoreMineReservationPolicyDto, {...PAYLOAD, late_refund_percent: 101})).resolves.toEqual({
                message: '마감 뒤 환불 비율은 0 ~ 100% 사이로 입력해주세요.',
                validation_errors: [{property: 'late_refund_percent', message: '마감 뒤 환불 비율은 0 ~ 100% 사이로 입력해주세요.'}],
            });
        });

        it('마감 뒤 환불 비율이 없으면 → late_refund_percent', async () => {
            await expect(validateBody(StoreMineReservationPolicyDto, {booking_open_hours: 48, refund_deadline_minutes: 90})).resolves.toEqual({
                message: '마감 뒤 환불 비율을 입력해주세요.',
                validation_errors: [{property: 'late_refund_percent', message: '마감 뒤 환불 비율을 입력해주세요.'}],
            });
        });
    });
```

```ts
// apps/admin-service/src/store/test/store-application-approve.spec.ts — modified (업체 행 · 상품 설정 3행 단언)
            expect(store).toMatchObject({booking_open_hours: 72, refund_deadline_minutes: 60, late_refund_percent: 50});

            const [plans] = repo.insertStorePlans.mock.calls[0] as [RoomPlanEntity[]];
            expect(plans.map((plan) => [plan.room_plan_type_id, plan.min_nights, plan.max_nights])).toEqual([
                ['HOURLY', null, null],
                ['NIGHT', null, null],
                ['LONG', 1, 30],
            ]);
```

```ts
// apps/admin-service/src/store/test/store-detail.spec.ts · store-mine.spec.ts — modified (응답 단언의 refund_deadline_hours 줄)
            refund_deadline_minutes: 60,
            late_refund_percent: 50,
```

```ts
// apps/admin-service/src/room/test/room.test-helper.ts — modified (repository mock 2개 · planRow 기본값)
        countRoomActiveReservations: vi.fn().mockResolvedValue(0),
        countGroupActiveReservations: vi.fn().mockResolvedValue(0),

export function planRow(override: Partial<RoomPlanRow> = {}): RoomPlanRow {
    return {
        // … 기존 필드 …
        check_out_time: '11:00:00',
        min_nights: null,
        max_nights: null,
        ...override,
    };
}
```

```ts
// apps/admin-service/src/room/test/room-plan-update.spec.ts — modified (연박 케이스 추가 · 1박 성공 단언에 박수 null)
        it('1박 — 박수는 보내도 NULL', async () => {
            await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: {room_plan_type_id: 'NIGHT', is_used: 1, days_of_week: 127, check_in_time: '22:00', check_out_time: '09:00', min_nights: 2, max_nights: 5}, actor: MANAGER_ACTOR});

            const [, entity] = repo.updateRoomPlan.mock.calls[0] as [unknown, RoomPlanEntity];
            expect(entity).toMatchObject({min_nights: null, max_nights: null});
        });

        it('연박 — 입실 · 퇴실 시각 + 최소 · 최대 박수', async () => {
            repo.findRoomPlan.mockResolvedValueOnce(planEntity({room_plan_type_id: 'LONG'}));

            await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: {room_plan_type_id: 'LONG', is_used: 1, days_of_week: 127, check_in_time: '15:00', check_out_time: '11:00', min_nights: 2, max_nights: 14}, actor: MANAGER_ACTOR});

            const [, entity] = repo.updateRoomPlan.mock.calls[0] as [unknown, RoomPlanEntity];
            expect(entity).toMatchObject({usage_hours: null, check_in_time: '15:00', check_out_time: '11:00', min_nights: 2, max_nights: 14});
        });

    describe('[FAIL:service] 연박 박수', () => {
        it('연박인데 최소 박수가 없으면 400 validation_errors.min_nights, 수정 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: {room_plan_type_id: 'LONG', is_used: 1, days_of_week: 127, check_in_time: '15:00', check_out_time: '11:00', max_nights: 14}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '연박은 최소 박수를 입력해주세요.', validation_errors: [{property: 'min_nights', message: '연박은 최소 박수를 입력해주세요.'}]}});
            expect(repo.updateRoomPlan).not.toHaveBeenCalled();
        });

        it('최소 > 최대면 400 validation_errors.min_nights', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: {room_plan_type_id: 'LONG', is_used: 1, days_of_week: 127, check_in_time: '15:00', check_out_time: '11:00', min_nights: 5, max_nights: 3}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '최소 박수는 최대 박수보다 클 수 없습니다.', validation_errors: [{property: 'min_nights', message: '최소 박수는 최대 박수보다 클 수 없습니다.'}]}});
            expect(repo.updateRoomPlan).not.toHaveBeenCalled();
        });
    });

        it('최대 박수 181 → max_nights', async () => {
            await expect(validateBody(RoomPlanUpdateDto, {is_used: 1, days_of_week: 127, max_nights: 181})).resolves.toEqual({
                message: '최대 박수는 1 ~ 180박 사이로 입력해주세요.',
                validation_errors: [{property: 'max_nights', message: '최대 박수는 1 ~ 180박 사이로 입력해주세요.'}],
            });
        });
```

- `planEntity` 는 room-plan-update.spec 이 쓰는 기존 픽스처(없으면 helper 의 `planRow` 를 엔티티 모양으로 쓴다 — build 때 기존 spec 의 픽스처 이름을 따른다).

```ts
// apps/admin-service/src/room/test/room-plan-list.spec.ts — modified (항목 단언에 박수)
            expect(res.body.list[2]).toMatchObject({room_plan_type_id: 'LONG', min_nights: 1, max_nights: 30});
```

```ts
// apps/admin-service/src/room/test/room-delete.spec.ts — modified ([FAIL:service] 추가)
        it('점유 예약(결제 대기 · 확정 · 이용 중)이 있는 호실은 failed 400, 삭제 없음', async () => {
            repo.countRoomActiveReservations.mockResolvedValueOnce(1);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.DELETE, payload: {room_id: ROOM_ID}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약이 있는 호실은 지울 수 없습니다.', validation_errors: null}});
            expect(repo.countRoomActiveReservations).toHaveBeenCalledWith(ROOM_ID);
            expect(repo.deleteRoom).not.toHaveBeenCalled();
        });
```

```ts
// apps/admin-service/src/room/test/room-group-delete.spec.ts — modified ([FAIL:service] 추가)
        it('그룹 호실에 점유 예약이 있으면 failed 400, 호실 · 사진 · 그룹 삭제와 저장소 삭제 없음', async () => {
            repo.countGroupActiveReservations.mockResolvedValueOnce(2);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: {room_group_id: ROOM_GROUP_ID}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '예약이 있는 객실 그룹은 지울 수 없습니다.', validation_errors: null}});
            expect(repo.countGroupActiveReservations).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(repo.deleteRooms).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroup).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });
```

```ts
// apps/admin-service/src/room/test/room.repository.spec.ts — modified (상품 설정 Smoke 의 키 · 스냅숏, 점유 예약 조건 · Smoke 추가)
const ROOM_PLAN_ROW_KEYS = ['room_plan_id', 'store_id', 'room_plan_type_id', 'room_plan_type_name', 'is_used', 'days_of_week', 'usage_hours', 'check_in_time', 'check_out_time', 'min_nights', 'max_nights'];
// ROOM_PLAN_ROWS_SQL — 끝의 select 에 "p"."min_nights" AS "min_nights", "p"."max_nights" AS "max_nights" 가 붙는다(build 때 실행 출력으로 바꾼다)

    it('[SUCCESS] countRoomActiveReservations — 호실 · 점유 상태 IN', async () => {
        const {repository, reservations} = makeRepository();

        await repository.countRoomActiveReservations('r1');

        expect(reservations.count).toHaveBeenCalledWith({where: {room_id: 'r1', reservation_state_id: In(['PENDING', 'CONFIRMED', 'CHECKED_IN'])}});
    });

    it('그룹 점유 예약 — 지워지지 않은 그룹 호실 조인 · 점유 상태 IN', () => {
        const [sql, parameters] = repository.buildGroupActiveReservationsQuery('g1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['g1', 'PENDING', 'CONFIRMED', 'CHECKED_IN']);
        expect(flat).toContain('INNER JOIN "t_room" "r" ON "r"."room_id" = "v"."room_id"');
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toContain('"v"."reservation_state_id" IN ($2, $3, $4)');
    });
```

- room.repository.spec 의 `makeRepository` 가 돌려주는 가짜 repository 목록에 `reservations`(t_reservation — `count`)를 더한다.
### 설정 · 문서

```sh
# .env.example — modified (토스 절 주석 두 줄)
# 세팅 방법: docs/guides/toss-setup.md — 결제창 · 승인은 프론트(Next.js), 서버는 토스 조회로 검증 · 환불(user-service 예약 · scheduler 결제 대기 만료 · 환불 crontab)
# 시크릿 키 — 개발은 테스트 키(test_sk_…), 운영은 라이브 키(live_sk_…). 비어 있으면 부팅은 되고 예약 생성 · 결제 확인 · 환불만 실패한다(503)
TOSS_SECRET_KEY=
```

````md
<!-- docs/guides/toss-setup.md — modified (1. 역할 블록 · 4. 실패와 재시도 표 · 새 6절) -->
```
이용자 → (서버) 예약 생성 POST /api/v1/user-service/reservation → payment_id(orderId) · amount · order_name · 결제 대기 5분
       → (프론트) 결제창(클라이언트 키 test_ck_…) → 토스 인증
       → (프론트 서버) 승인 API POST /v1/payments/confirm(시크릿 키) → paymentKey 를 서버로
       → (서버) 결제 확인 POST /api/v1/user-service/reservation/payment-confirm {payment_id, payment_key}
                → GET /v1/payments/{paymentKey} 로 다시 읽어 대조(상태 DONE · 금액 · orderId = payment_id) → 확정
5분 지남 → (scheduler) GET /v1/payments/orders/{orderId} — 승인됐으면 확정, 아니면 만료(호실이 풀린다)
환불   → (서버) 환불 신청만 기록 → (scheduler, 1분마다) POST /v1/payments/{paymentKey}/cancel {cancelReason, cancelAmount}(Idempotency-Key cancel-<payment_id>)
```

- 환불 금액은 전액 또는 일부다(환불 마감 뒤 업체 비율 — `cancelAmount`). 결제 1건에 환불은 1번이다(멱등키가 결제 ID 하나).
- scheduler 도 `TOSS_SECRET_KEY` 를 쓴다(결제 대기 만료 조회 · 늦은 승인 재확인 · 환불). crontab 은 운영(`NODE_ENV=production`)에서만 돈다 — 테스트 키로 끝까지 시험하려면 scheduler 를 production 으로 띄운다.

## 6. 시험 순서 (테스트 키)

1. 예약 생성 → done 의 `payment_id` · `amount` · `order_name` 으로 프론트 결제창을 연다.
2. 토스 테스트 카드로 결제 → 프론트 서버 승인 → 결제 확인 API → 내 예약 상세가 `CONFIRMED`.
3. 취소 → 결제가 `REFUND_REQUESTED` → 1분 안에 `REFUNDED`(scheduler).
4. 결제창을 열고 결제하지 않으면 5분 뒤 `EXPIRED`, 같은 호실은 10분 동안 다시 예약할 수 없다.
````

```md
<!-- README.md — modified -->
<!-- user-service 설명 끝 -->
… 예약: 호실별 예약 가능 시간(로그인 없음) · 예약(결제 대기 5분) · 토스 결제 확인 · 취소(업체 환불 규정 — 마감 전 100%, 마감 뒤 비율) · 내 예약, 업체 관리자의 예약 현황 · 업체 취소(100% 환불 + SMS) · 호실 이동(같은 그룹 + SMS). 업체 · 객실 · 상품 · 영업시간은 공유 DB 에서 읽는다.
<!-- admin-service 설명 — 내 업체 설정 · 객실 -->
… 예약 · 환불 규정(예약 n시간 전부터 · 환불 마감 n분 · 마감 뒤 환불 비율) … 업체 상품 설정(시간 이용 · 1박 · 연박 — 사용 여부 · 예약 가능 요일 · 이용 시간 · 입퇴실 시각 · 연박 최소 · 최대 박수) … 예약이 있는 호실 · 그룹은 지울 수 없다.
<!-- scheduler 설명 -->
- **scheduler** — crontab 전용 서버(탈퇴 자동처리 · 결제 대기 만료 · 늦게 승인된 결제 환불 · 환불 처리). 들어오는 연결이 없고(포트 없음) DB · 토스에만 붙는다. 여러 대여도 DB 잠금으로 회차마다 1대만 실행한다.
<!-- 외부 연동 줄 -->
… 결제는 토스페이먼츠(결제창 · 승인은 프론트, 서버는 토스 조회로 검증 · 환불 — 환불은 scheduler 가 백그라운드로, 전액 또는 일부 — [docs/guides/toss-setup.md](docs/guides/toss-setup.md)) …
<!-- 실행 1. 준비 — 토스 줄 -->
- 토스 시크릿 키(`TOSS_SECRET_KEY`)도 비워도 서버는 뜬다 — 예약 생성 · 결제 확인 · 환불만 실패한다(user-service · scheduler 가 쓴다). 테스트 키 받는 법 · 시험 순서는 [docs/guides/toss-setup.md](docs/guides/toss-setup.md).
```

```md
<!-- AGENTS.md — modified -->
<!-- Architecture 트리 -->
│   ├── api/v1/<service>/<domain>/  # 공개 라우트 — user-service/{user,door,reservation} · admin-service/{manager,admin,store,room}. …
│   ├── reservation/          # 예약 도메인(예약 가능 시간 · 예약 · 결제 확인 · 취소 · 내 예약 — 이용자, 예약 현황 · 업체 취소 · 호실 이동 — 매니저): controllers/ → ReservationService → 공유 DB(업체 · 객실 · 상품 · 영업시간 읽기) · PAYMENT_GATEWAY · SMS_SENDER
└── scheduler/src/            # crontab 전용 — …
    ├── user/                 # crontabs/(탈퇴 자동처리) → repository 직접
    └── reservation/          # crontabs/(결제 대기 만료 · 늦은 승인 재확인 · 환불) → repository 직접 · PAYMENT_GATEWAY
<!-- Validation — Query DTO 적용 목록에 더한다 -->
… · reservation `ReservationAvailabilityDto` · `ReservationListDto` · `ReservationStoreDto`
<!-- Data Layer — Pagination 적용 목록 -->
… · 내 예약 목록(reservation.service.ts)
<!-- Auth — 인증 없는 공개 라우트 -->
- **인증 없는 공개 라우트(적용 — 문 `/api/v1/user-service/door/open` · `/close`, 예약 가능 시간 `/api/v1/user-service/reservation/availability`)**: 문은 문 쪽 타 업체 프로그램이 부르고(가드 없음 — 열기는 QR 이 열쇠, 닫기는 지워지지 않은 호실만), 예약 가능 시간은 로그인 전 둘러보기용이다. …
<!-- Key Patterns 외부 연동 — 결제 줄 -->
  - 결제는 `PAYMENT_GATEWAY`(토스페이먼츠) — 결제창 · 승인은 프론트(Next.js), 서버는 토스 조회로 검증(`verifyPaymentLookup` — 상태 · 금액 · orderId = `payment_id`) · 취소(환불 — 전액 또는 일부, `Idempotency-Key: cancel-<payment_id>`). 환불은 신청만 기록하고 scheduler crontab 이 토스로 처리한다. 업무 실패 400(토스 메시지 + `payment_error_code`) · 일시 실패 503(재시도). 키 `TOSS_SECRET_KEY`(user-service · scheduler, test_ → 결제 환경 TEST).
<!-- Testing — Smoke 적용 목록 -->
… · [user-service reservation.repository.spec.ts](apps/user-service/src/reservation/test/reservation.repository.spec.ts) 예약 가능 호실 · 최근 만료 · 내 예약(목록 · 상세) · 구간 · 업체 현황(호실 · 예약), [scheduler reservation.repository.spec.ts](apps/scheduler/src/reservation/test/reservation.repository.spec.ts) 결제 대기 만료, room.repository.spec.ts 그룹 점유 예약
```

```md
<!-- docs/data-layer.md — modified -->
<!-- 예약 · 결제 소절에 더한다 -->
  - 업체 환불 규정 — `t_store.refund_deadline_minutes`(100% 환불 마감, 분 · 0 ~ 10,080) · `late_refund_percent`(마감 뒤 ~ 이용 시작 전 취소 환불 비율, 0 ~ 100). 예약할 때 마감 시각(`t_reservation.refund_deadline_at`)과 비율(`t_reservation.late_refund_percent`)을 예약에 저장한다 — 업체가 바꿔도 기존 예약은 그대로다.
  - 환불은 전액 또는 일부 — `CHK_Payment_RefundedAmount`(환불 완료면 0 < `refund_amount` ≤ `amount`). 부분 환불 상태는 따로 두지 않는다.
  - 연박 박수 — `t_room_plan.min_nights` · `max_nights`(연박 행만, CHECK `CHK_RoomPlan_LongNights`).
  - 예약 가능 요일(`days_of_week`)은 입실일 하나로 판정한다(숙박 · 연박도).
<!-- Smoke 적용 목록 -->
… · 예약(user-service) 예약 가능 호실 · 최근 만료 · 내 예약 · 구간 · 업체 현황, scheduler 결제 대기 만료, room 그룹 점유 예약
```

```md
<!-- docs/integration.md — modified -->
<!-- 머리 사용처 -->
> 사용처: … 결제(`PaymentModule`) — user-service 예약 생성(결제 환경) · 결제 확인(`getPayment`), scheduler 결제 대기 만료 · 늦은 승인 재확인(`findByPaymentId`) · 환불(`cancel`).
<!-- 원칙 — 결제 줄 -->
- **결제는 `PAYMENT_GATEWAY`(토스페이먼츠)** — 결제창 · 승인은 프론트(Next.js), 서버는 토스에서 다시 읽어 `verifyPaymentLookup`(결제됨 · 미결제 · 금액 불일치 · 다른 주문)으로 대조하고, 환불은 금액을 지정한 취소(`cancel({…, amount})` — 전액 또는 일부)로 한다. 서버 요청 안에서는 환불 신청만 기록하고 토스 취소는 scheduler crontab 이 한다. 프론트가 넘긴 값만 믿지 않는다.
<!-- 구성 표 -->
| `integration.util.ts` | `toE164KrPhone` · `classifyTossFailure` · `verifyPaymentLookup` — 토스 조회 결과 ↔ 우리 결제 행 대조 |
| `integration.constants.ts` | … · `TOSS_PAYMENT_STATUS_DONE` |
```

```md
<!-- docs/architecture.md — modified (앱 구성 표 — user-service · scheduler 행, libs/integration 행 결제 사용처) -->
| `apps/user-service` | 이용자 서버 — user(회원) · door(문) · reservation(예약 — 공유 DB 의 업체 · 객실 · 상품 · 영업시간을 읽는다) | … |
| `apps/scheduler` | crontab 전용 — user(탈퇴 자동처리) · reservation(결제 대기 만료 · 늦은 승인 재확인 · 환불 — 토스) | … |
… / 결제: user-service 예약 · scheduler 환불 …
```

```md
<!-- docs/messaging.md — modified (서비스 명령 큐 설명 줄 뒤에 한 줄) -->
- user-service 명령: 회원 `user.member.*` · 예약 `user.reservation.*`(create · payment-confirm · cancel · store-cancel · room-change — 업체 취소 · 호실 이동은 매니저 actor). admin-service 명령: `admin.manager.*` · `admin.admin.*` · `admin.store.*` · `admin.room.*`.
```

```md
<!-- .beaver/output/spec/room/room-manage-spec.md · .beaver/output/spec/store/<예약 · 환불 규정 spec> — modified (변경 줄, 2026-11-03) -->
- 업체 상품 설정 — 연박은 최소 · 최대 박수(1 ~ 180, 2026-11-03 Phase 17 에서 추가). 예약 가능 요일은 입실일 기준. 1박 퇴실은 항상 다음 날(퇴실 시각이 입실보다 늦어도 — 2026-11-03).
- 호실 · 그룹 삭제 — 점유 예약(결제 대기 · 확정 · 이용 중)이 있으면 400(Phase 17).
- 예약 · 환불 규정 — 환불 기준은 분 단위(`refund_deadline_minutes`), 마감 뒤 ~ 이용 시작 전 취소는 업체 비율 환불(`late_refund_percent`, 기본 50%) — 2026-11-03 Phase 17 에서 변경(예전: 시간 단위 · 기준 뒤 환불 신청 불가).
```

---

## Test Cases

```
[CASES:availability]   reservation-availability.spec — 재고 판정 · 요금 12개(+ 7-2 · 9-2 짝 케이스), 지금 2026-11-03(화) 09:00 한국 시각
  1  대실 3시간 · 영업 10 ~ 22시                       → 10:00 ~ 19:00 30분마다
  2  브레이크 13 ~ 14시                                 → 10:00(13:00 맞닿음 허용) + 14:00 ~ 19:00
  3  자정 넘는 영업 18 ~ 06시                           → 00:00 ~ 03:00(전날 영업) + 18:00 ~ 23:30
  4  기존 점유 [12:00, 15:30) · 정비 30분               → 15:30 ~ 19:00
  5  오늘 10:10 · 정비중 호실                           → 11:00 ~ 19:00(10:30 즉시 입실 제외)
  6  예약 가능 기간 24시간 · 24시간 업체                → 00:00 ~ 09:00
  7  수요일 불가 · 수요일 대실 / 7-2 화요일 입실 숙박   → 없음 / 22:00(입실일만)
  8  24시간 업체 + 브레이크 13 ~ 14시                   → 00:00 ~ 10:00 + 14:00 ~ 23:30
  9  숙박 22 → 09 · 영업 10 ~ 23 / 9-2 영업 08 ~ 23     → 없음(체크아웃 밖) / 22:00
  10 연박 3박 · 수요일 불가 · 화요일 입실               → 15:00(입실일만) — 박수 밖은 [FAIL:service] 400 nights
  11 연박 3박 요금 · 기간 가격 11/4 ~ 11/5              → 80,000 + 80,000 + 50,000 = 210,000
  12 일시 예약불가 12:00 ~ 13:00                        → 13:00 ~ 19:00
[CASES:refund]         reservation-cancel.spec — 환불액 8개(결제 30,000 · 마감 12:00 · 이용 13:00 · 비율 50%)
  마감 전 100% / 마감 정각 50% / 15,001 · 50% → 7,500 / 0% → 0(환불 신청 없음) / 100% / 시작 정각 400 / 시작 뒤 400 / 마감 0분 · 12:59 → 100%
[CASES:verifyPaymentLookup]  build 때 임시 스크립트(커밋 안 함 — libs/integration 은 spec 없음) + reservation-payment-confirm.spec 흐름
  없음 → NOT_PAID / IN_PROGRESS → NOT_PAID / DONE · 일치 → PAID / DONE · 금액 다름 → MISMATCH / DONE · 주문번호 다름 → FOREIGN / CANCELED → NOT_PAID
[SUCCESS]   create(쓰기 순서 · 엔티티 값 · 결제 정보 · 연박 금액 · 1박은 퇴실 시각과 관계없이 다음 날 퇴실) · payment-confirm(확정 3단 상태 조건 · 중복 요청) · cancel(확정 · 결제 대기) · list(count → 페이지 → 목록 · EXPIRED 제외) · detail(구간 · 결제) · store(그날 범위 · 호실별) · store-cancel(100% 환불 · SMS 마지막) · room-change(room_id 만 · SMS)
[SKIP]      availability(업체 상품 판매 안 함 → 빈 목록) · store-cancel(번호 없음 → SMS 생략) · scheduler transitionPending(결제가 이미 바뀜 → false)
[FAIL:service]   availability(업체 없음 404 · 박수 밖 · 없는 날짜) · create(호실 · 업체 404 · 판매 안 함 · 10분 재예약 제한 · 재고 판정 · 없는 날짜) · payment-confirm(미결제 · 다른 주문 · 다른 키 · 남의 결제 · 상태 경합 — 쓰기 없음) · cancel(취소 불가 상태 · 남의 · 만료 · 상태 경합) · detail · store(소속 업체 없음) · store-cancel(다른 업체) · room-change(다른 그룹 · 사용중지 · 시작 뒤/미확정) · admin room-plan-update(최소 박수 없음 · 최소 > 최대) · room-delete · room-group-delete(점유 예약)
[FAIL:committed] payment-confirm(금액 불일치 · 늦은 결제 → 환불 신청 커밋 + 반환된 실패, ack)
[FAIL:duplicate] create(배타 제약 400 — 구간 쓰기 없음) · room-change(옮길 호실 겹침)
[FAIL:external]  create(토스 키 없음 503 → requeue) · store-cancel(SMS 503 → requeue)
[FAIL:validation] 게이트웨이 DTO — availability(연박 박수 없음 · 날짜 형식) · create(30분 단위 · 박수 181) · payment-confirm(결제 ID) · cancel(사유 없음 · 256자) · detail(예약 ID) · store(날짜) · store-cancel(사유) · admin 규정(마감 10,081분 · 비율 101 · 비율 없음) · 상품 설정(최대 박수 181)
[FAIL:internal]  availability(내부 토큰 없음 403)
[SECURITY]  create · payment-confirm · cancel · room-change(actor 없음 401)
[FAIL:repository] user-service repository(통일 500 · 23P01 → 400 두 곳) · scheduler repository(예약 어긋남 → 롤백 500)
[SMOKE:data-access] user-service reservation.repository.spec — 예약 가능 호실 · 최근 만료 · 내 예약(목록 · 상세) · 구간 · 업체 현황 호실 · 예약 / scheduler — 결제 대기 만료 / admin room.repository.spec — 상품 설정(박수 select 추가 — 스냅숏 갱신) · 그룹 점유 예약
PGlite(build 확인 · 커밋 안 함): ReservationBooking 적용 → 기존 업체 refund_deadline_hours 2 → refund_deadline_minutes 120 · late_refund_percent 50, 기존 연박 행 1 · 30, 대실 행에 박수 넣으면 CHK_RoomPlan_LongNights 거부, 부분 환불(REFUNDED · refund_amount 15,000 < 30,000) 허용 · 0 · 초과 거부, db:check 일치, down → 다시 up

테스트 생략(위임형): crontab 3개(scheduler crontab spec 없음 — AGENTS, 판정은 verifyPaymentLookup 표 · 전환은 repository spec), 게이트웨이 컨트롤러, 결제 어댑터(실제 토스 호출 금지 — 요청 모양은 코드 읽기), 엔티티 · 마이그레이션(db:check + PGlite)
```

---

## Response Codes

| Code | Cause |
|------|------|
| 200 (예약 가능 시간) | 호실별 금액 · 구간 — 업체가 상품을 안 팔면 빈 목록, 영업중 아님이면 구간 없음 |
| done (예약 생성) | 예약 ID · 결제 ID(토스 orderId) · 주문명 · 금액 · 결제 대기 만료 · 이용 구간 |
| done (결제 확인) | `{reservation_id, reservation_state_id: CONFIRMED}` — 같은 결제 재요청도 done |
| done (이용자 취소) | `{refund_amount}` — 0 은 환불 없이 취소, 결제 대기 취소는 null |
| done (업체 취소 · 호실 이동) | data null |
| 200 (내 예약 · 상세 · 업체 현황) | 목록 · 페이지 / 상세(구간 · 결제) / 호실별 예약 |
| 400 | DTO 검증 · 없는 날짜 · 박수 범위 · 판매하지 않는 상품 · 예약할 수 없는 시간 · 10분 재예약 제한 · 이미 예약된 시간(23P01) · 결제가 완료되지 않음 · 결제 정보가 맞지 않음 · 다른 결제로 확정 · 확인할 수 없는 결제 · 상태가 바뀜 · 취소할 수 없는 예약 · 이용 시작 후 취소 · 호실 이동 조건(같은 호실 · 다른 그룹 · 사용중지 · 시작 뒤 · 겹침) · admin 연박 박수 · 예약이 있는 호실 · 그룹 삭제 |
| 400 (반환 — 커밋된 실패, 재시도 없음) | 결제 금액 불일치 · 결제 대기 시간 경과 — 환불 신청을 기록한 뒤 |
| 401 · 403 | actor 없음 · 다른 그룹 토큰(게이트웨이) / 내부 토큰 없음 |
| 404 | 업체 · 호실 · 예약 · 결제 · 소속 업체 없음(남의 것 · 결제 대기 만료 건 포함) |
| 503 | 토스 키 없음 · 토스 일시 실패 · SMS 실패 — 큐는 재시도 |
| 500 | DB 오류(통일 메시지) |
