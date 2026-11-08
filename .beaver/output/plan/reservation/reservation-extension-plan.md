# Plan — reservation-extension (연장 · Phase 26)

## Feature Summary
- **Feature**: 이용 중 예약의 끝 시각에 이어 붙여 늘린다(여러 번 가능).
  - 시간 이용 · 1박 → 업체 시간 이용 상품의 이용 시간만큼, 그룹 시간 이용 요금
  - 연박 → 하루(퇴실 시각 그대로), 그룹 1박 요금, 연박 최대 박수까지
  - 신청 즉시 예약의 점유 끝을 늘려 잡아 두고 5분 안에 결제. 결제하지 않으면 만료 · 되돌림, 그 예약은 다시 연장할 수 없다
  - 업체가 상품(시간 이용 · 1박 · 연박)별로 연장 가능 여부 · 최대 연장 횟수(1 ~ 10)를 정한다 — 기본 가능 · 3회, 연장할 때의 지금 설정을 본다
- **Entry point**:
  - 동기 `GET /api/v1/user-service/reservation/:reservation_id/extension`(연장 조회 — 잡아 두지 않는다)
  - 큐 `POST /api/v1/user-service/reservation/:reservation_id/extension`(`user.reservation.extend` — 잡아 두기 + 결제 정보)
  - 기존 변경: 결제 확인 `user.reservation.payment-confirm`(연장 구간 확정) · scheduler 결제 대기 만료(연장 구간) · 이용 전환(결제 대기 연장이 있으면 종료 대기) · 이용자 취소 · 이용 중 취소 승인(결제 대기 연장 정리)
  - 기존 변경(연장 설정): 업체 상품 설정 조회 `GET /api/v1/admin-service/room/plan` · 수정 `PATCH …/plan/:room_plan_type_id`(`admin.room.plan-update`) · 입점 승인(기본값) · 업체 둘러보기 상세 `GET /api/v1/user-service/discovery/store/:store_id`(상품 설정 항목)
- **Domain**: reservation(user-service · scheduler) · room · store(admin-service) · discovery(user-service) · libs/database(t_room_plan 컬럼 2 · CHECK · 부분 유니크 1) — 로드맵 Phase 26 #81 · #124
- **Spec**: [reservation-extension-spec.md](../../spec/reservation/reservation-extension-spec.md)

구현 단위 — 순서대로 한다.
- A. 스키마 — 업체 상품별 연장 설정(t_room_plan 컬럼 2), 결제 대기 구간 예약당 1개(부분 유니크)
- B. 업체 연장 설정 — admin-service 상품 설정 조회 · 수정 · 입점 승인 기본값, discovery 상세
- C. 연장 계산 · 판정 util(TDD)
- D. user-service 조회 · 신청 · 결제 확인 · 취소 정리
- E. scheduler 결제 대기 만료(연장) · 이용 종료 대기
- F. gateway 라우트 · 문서

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/room/room-plan.entity.ts` | modified — `is_extendable`(기본 1) · `max_extensions`(기본 3) · CHECK `CHK_RoomPlan_MaxExtensions`(1 ~ 10), 주석 |
| `libs/database/src/entities/reservation/reservation-detail.entity.ts` | modified — 부분 유니크 `UK_ReservationDetail_ReservationIdPending`, 주석 |
| `libs/contracts/src/room/dto/room-plan-update.dto.ts` · `room-plan-list.dto.ts` | modified — `is_extendable` · `max_extensions`(수정 필수 · 조회 항목) |
| `libs/contracts/src/discovery/dto/discovery-store-detail.dto.ts` | modified — 상품 설정 항목에 `is_extendable` · `max_extensions` |
| `apps/admin-service/src/room/room.service.ts` · `room.util.ts` · `interfaces/room.repository.interface.ts` · `repositories/room.repository.ts` | modified — 수정 때 두 값 쓰기, `RoomPlanRow` · 조회 select · 응답 |
| `apps/admin-service/src/store/store.constants.ts` · `store.service.ts` | modified — `STORE_PLAN_MAX_EXTENSIONS_DEFAULT` 3, 입점 승인 3행에 연장 가능 · 3회 |
| `apps/user-service/src/discovery/interfaces/discovery.repository.interface.ts` · `repositories/discovery.repository.ts` · `discovery.util.ts` | modified — `DiscoveryStorePlanRow` · 상품 설정 select · 응답 |
| `libs/database/src/migrations/<ts>-ReservationExtension.ts` · `libs/database/src/migrations.ts` | new · modified — `npm run db:generate -- ReservationExtension` |
| `libs/contracts/src/reservation/reservation.commands.ts` | modified — `RESERVATION_COMMAND.EXTEND` · `RESERVATION_INTERNAL_PATH.extension()` |
| `libs/contracts/src/reservation/dto/reservation-extension.dto.ts` · `reservation-extend.dto.ts` | new — 조회 · 신청 |
| `apps/user-service/src/reservation/reservation.constants.ts` | modified — 연장 판정 문구 |
| `apps/user-service/src/reservation/reservation.util.ts` | modified — `ExtensionStay` · `toExtensionPlanType` · `toExtensionStay` · `toStayNights` · `calculateExtensionPrice` · `judgeExtension` · `buildExtensionOrderName` · `toExtensionResult`, 파일 전용 `isExtensionWithinStoreHours` |
| `apps/user-service/src/reservation/reservation.service.ts` | modified — 새 `getExtension` · `requestExtension`, `confirmPayment`(연장 구간 갈래), `cancelReservation` · `approveCancelRequest`(결제 대기 연장 정리) |
| `apps/user-service/src/reservation/interfaces/reservation.repository.interface.ts` · `repositories/reservation.repository.ts` | modified — `insertReservationDetail`(부분 유니크 400), 새 `updateReservationHold`(배타 제약 400) |
| `apps/user-service/src/reservation/controllers/reservation.controller.ts` · `reservation.controller.queue.ts` | modified — GET extension · `@OnCommand(EXTEND)` |
| `apps/scheduler/src/reservation/interfaces/reservation.repository.interface.ts` · `repositories/reservation.repository.ts` | modified — `ExpiredPendingRow`(연장 필드), `buildExpiredPendingQuery`(기본 · 연장 + 예약 조인), 새 `transitionExtension`, `buildUsageEndRowsQuery`(결제 대기 연장 제외) |
| `apps/scheduler/src/reservation/reservation.util.ts` | modified — `ExtensionTransition` · `buildExtensionConfirmTransition` · `buildExtensionRefundTransition` · `buildExtensionExpireTransition` |
| `apps/scheduler/src/reservation/crontabs/reservation-payment-expire.crontab.ts` | modified — 연장 구간 갈래 |
| `apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.ts` · `reservation.controller.queue.ts` | modified — 공개 라우트 2개 |
| 테스트 — 아래 Test Cases 의 spec 파일들 | new · modified |
| `README.md` · `AGENTS.md` · `docs/{data-layer,messaging,testing}.md` | modified |

---

## Design

### A. 스키마

```ts
// libs/database/src/entities/room/room-plan.entity.ts — 추가(사용 여부 · 예약 가능 요일처럼 모든 종류 공통, 연장 불가로 바꿔도 횟수 값은 남는다)
@Check('CHK_RoomPlan_MaxExtensions', '"max_extensions" BETWEEN 1 AND 10')
// …
    @Column({name: 'is_extendable', type: 'smallint', nullable: false, default: 1, comment: '연장 가능 여부(0: 이 상품 예약은 연장할 수 없다, 1: 연장 가능 — 최대 연장 횟수까지)'})
    is_extendable: number;

    @Column({name: 'max_extensions', type: 'smallint', nullable: false, default: 3, comment: '최대 연장 횟수(1 ~ 10 — 예약 1건의 확정된 연장 구간 수, 연장 불가여도 값은 남는다)'})
    max_extensions: number;
```

```ts
// libs/database/src/entities/reservation/reservation-detail.entity.ts — 추가(클래스 데코레이터)
/**
 * 예약 구간 — 기본(BASE) 1개 + 연장(EXTENSION) n개. …
 * 결제 대기(PENDING) 구간은 예약당 1개(부분 유니크 — 결제 대기 중인 연장이 있으면 더 신청할 수 없다, 사용자 결정 2026-11-09).
 */
@Index('UK_ReservationDetail_ReservationIdPending', ['reservation_id'], {unique: true, where: `"reservation_state_id" = 'PENDING'`})
```

### B. 업체 연장 설정 (admin-service room · store, user-service discovery)

```ts
// libs/contracts/src/room/dto/room-plan-update.dto.ts — RoomPlanUpdateDto 에 추가(모든 종류 공통 · 필수 — 설정을 통째로 보낸다)
    @ApiProperty({description: '연장 가능 여부 (0: 이 상품 예약은 연장할 수 없다, 1: 연장 가능 — 최대 연장 횟수까지)', enum: [0, 1]})
    @IsIn([0, 1], {message: '연장 가능 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '연장 가능 여부를 입력해주세요.'})
    is_extendable: number;

    @ApiProperty({description: '최대 연장 횟수 (1 ~ 10 — 예약 1건에 확정되는 연장 수, 연장 불가여도 값은 남는다)'})
    @IsInt({message: '최대 연장 횟수는 정수로 입력해주세요.'})
    @Min(1, {message: '최대 연장 횟수는 1 ~ 10회 사이로 입력해주세요.'})
    @Max(10, {message: '최대 연장 횟수는 1 ~ 10회 사이로 입력해주세요.'})
    @IsNotEmpty({message: '최대 연장 횟수를 입력해주세요.'})
    max_extensions: number;

// libs/contracts/src/room/dto/room-plan-list.dto.ts — RoomPlanItemResultDto 에 추가
    @ApiProperty({description: '연장 가능 여부 (0 · 1)'})
    is_extendable: number;

    @ApiProperty({description: '최대 연장 횟수 (1 ~ 10)'})
    max_extensions: number;

// libs/contracts/src/discovery/dto/discovery-store-detail.dto.ts — DiscoveryStorePlanResultDto 에 같은 두 필드(설명: 이 상품 예약을 이용 중에 연장할 수 있는지 · 몇 번까지)
```

```ts
// apps/admin-service/src/room/room.service.ts — updateMyRoomPlan 3단계(모든 종류 공통)에 추가
        entity.is_extendable = dto.is_extendable;
        entity.max_extensions = dto.max_extensions;

// apps/admin-service/src/room/repositories/room.repository.ts — buildRoomPlanRowsQuery select 추가(RoomPlanRow 에도 두 키)
            .addSelect('p.is_extendable', 'is_extendable')
            .addSelect('p.max_extensions', 'max_extensions')

// apps/admin-service/src/room/room.util.ts — toRoomPlanItem 에 추가
        is_extendable: Number(row.is_extendable),
        max_extensions: Number(row.max_extensions),

// apps/admin-service/src/store/store.constants.ts — 추가
/** 업체 상품 설정 최대 연장 횟수 기본값 — 입점 승인 때 · 기존 업체(DB 기본값), 연장 가능이 기본(사용자 결정 2026-11-09) */
export const STORE_PLAN_MAX_EXTENSIONS_DEFAULT = 3;

// apps/admin-service/src/store/store.service.ts — 입점 승인 5단계(상품 설정 3행)에 추가
            plan.is_extendable = 1;
            plan.max_extensions = STORE_PLAN_MAX_EXTENSIONS_DEFAULT;

// apps/user-service/src/discovery/repositories/discovery.repository.ts — buildStorePlanRowsQuery select 추가(DiscoveryStorePlanRow 에도 두 키)
            .addSelect('p.is_extendable', 'is_extendable')
            .addSelect('p.max_extensions', 'max_extensions')

// apps/user-service/src/discovery/discovery.util.ts — toDiscoveryStorePlan 에 추가
        is_extendable: Number(row.is_extendable),
        max_extensions: Number(row.max_extensions),
```

### Input/Validation (DTO)

```ts
// libs/contracts/src/reservation/reservation.commands.ts — 추가
    /** 연장 신청 — 잡아 두기 + 결제 대기 5분 (이용자) */
    EXTEND: 'user.reservation.extend', // RESERVATION_COMMAND
    /** 내 예약 연장 조회 (GET, 이용자 — 잡아 두지 않는다) */
    extension: (reservation_id: string) => `${RESERVATION_INTERNAL_BASE}/${encodeURIComponent(reservation_id)}/extension`, // RESERVATION_INTERNAL_PATH
```

```ts
// libs/contracts/src/reservation/dto/reservation-extension.dto.ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 연장 조회 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationExtensionParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 연장 조회 — 지금 끝에서 한 단위(시간 이용 · 1박: 업체 이용 시간, 연박: 1일) 늘리면 몇 시까지 · 얼마인지, 못 하면 사유. 잡아 두지 않는다
 */
export class ReservationExtensionResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '연장할 수 있는지 (0 · 1)'})
    is_extendable: number;

    @ApiProperty({description: '연장할 수 없는 사유 — 할 수 있으면 null', nullable: true, type: String})
    reason: string | null;

    @ApiProperty({description: '요금 상품 (HOURLY: 시간 이용 요금 — 시간 이용 · 1박, NIGHT: 1박 요금 — 연박) — 계산할 수 없으면 null', nullable: true, type: String})
    room_plan_type_id: string | null;

    @ApiProperty({description: '연장 시작 일시 (ISO 8601 — 지금 끝) — 계산할 수 없으면 null', nullable: true, type: String})
    start_at: string | null;

    @ApiProperty({description: '연장 뒤 끝 일시 (ISO 8601) — 계산할 수 없으면 null', nullable: true, type: String})
    end_at: string | null;

    @ApiProperty({description: '연장 금액(원) — 계산할 수 없으면 null', nullable: true, type: Number})
    amount: number | null;
}
```

```ts
// libs/contracts/src/reservation/dto/reservation-extend.dto.ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 연장 신청 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationExtendParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 연장 신청 결과 — 연장 구간을 잡아 뒀다. 프론트는 payment_id 를 토스 orderId 로 결제창을 열고, 승인 뒤 기존 결제 확인 API 를 부른다(결제 대기 만료 전까지)
 */
export class ReservationExtendResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '연장 구간 ID'})
    reservation_detail_id: string;

    @ApiProperty({description: '결제 ID — 토스 orderId'})
    payment_id: string;

    @ApiProperty({description: '주문명 — 토스 orderName'})
    order_name: string;

    @ApiProperty({description: '결제 금액(원) — 토스 amount'})
    amount: number;

    @ApiProperty({description: '결제 대기 만료 일시 (ISO 8601 — 이때까지 결제가 확인되지 않으면 만료, 그 예약은 다시 연장할 수 없다)'})
    expires_at: string;

    @ApiProperty({description: '연장 시작 일시 (ISO 8601 — 지금 끝)'})
    start_at: string;

    @ApiProperty({description: '연장 뒤 끝 일시 (ISO 8601)'})
    end_at: string;
}
```

### C. 연장 계산 · 판정 util

```ts
// apps/user-service/src/reservation/reservation.constants.ts — 추가
/** 연장 — 이용 중이 아님(시작 전 · 끝남 · 취소 · 결제 대기) */
export const RESERVATION_EXTENSION_NOT_IN_USE_MESSAGE = '이용 중인 예약만 연장할 수 있습니다.';
/** 연장 — 결제하지 않아 만료된 연장이 있음(그 예약은 다시 연장할 수 없다 — 사용자 결정 2026-11-09) */
export const RESERVATION_EXTENSION_EXPIRED_MESSAGE = '결제하지 않은 연장이 있어 더 연장할 수 없습니다.';
/** 연장 — 결제 대기 중인 연장이 있음(판정 · 부분 유니크 UK_ReservationDetail_ReservationIdPending) */
export const RESERVATION_EXTENSION_PENDING_MESSAGE = '결제 대기 중인 연장이 있습니다.';
/** 연장 — 업체 영업중 아님 · 활성 아님 · 호실 사용중지 · 지운 업체 · 호실 */
export const RESERVATION_EXTENSION_UNAVAILABLE_MESSAGE = '지금은 연장할 수 없습니다.';
/** 연장 — 예약 상품이 연장 불가(업체 상품 설정 is_extendable 0) */
export const RESERVATION_EXTENSION_NOT_EXTENDABLE_MESSAGE = '연장할 수 없는 상품입니다.';
/** 연장 — 요금 상품(시간 이용 · 1박)을 팔지 않음 */
export const RESERVATION_EXTENSION_NOT_ON_SALE_MESSAGE = '연장 상품을 팔지 않는 업체입니다.';
/** 연장 — 영업시간 밖 · 브레이크 · 일시 예약불가 */
export const RESERVATION_EXTENSION_TIME_MESSAGE = '연장할 수 없는 시간입니다.';
/** 연장 — 다음 예약과 겹침(정비시간 포함 — 판정 · 배타 제약 EXC_Reservation_RoomIdBlockedRange) */
export const RESERVATION_EXTENSION_NEXT_RESERVATION_MESSAGE = '다음 예약이 있어 연장할 수 없습니다.';
```

```ts
// apps/user-service/src/reservation/reservation.util.ts — 추가
/** 연장 구간 — 요금 상품(HOURLY · NIGHT) · 요금 기준일(연장 시작의 한국 날짜) · 시작(= 지금 끝) · 끝 */
export interface ExtensionStay {
    room_plan_type_id: string;
    day: Dayjs;
    start: Dayjs;
    end: Dayjs;
}

/** 연장 판정 재료 */
export interface ExtensionContext {
    now: Dayjs;
    reservation: Pick<ReservationEntity, 'reservation_state_id' | 'start_at' | 'end_at' | 'room_plan_type_id' | 'maintenance_minutes'>;
    details: Pick<ReservationDetailEntity, 'reservation_detail_type_id' | 'reservation_state_id'>[];
    store: Pick<StoreEntity, 'store_state_id' | 'is_open' | 'is_always_open'> | null;
    room_state_id: string | null;
    base_plan: Pick<RoomPlanEntity, 'room_plan_type_id' | 'is_extendable' | 'max_extensions' | 'max_nights'> | null; // 예약 상품 행 — 연장 설정 · 연박 최대 박수
    unit_plan: Pick<RoomPlanEntity, 'is_used'> | null; // 요금 상품 행(시간 이용 · 1박)
    group_plan: RoomGroupPlanEntity | null;
    stay: ExtensionStay | null;
    hours: StoreHourEntity[];
    breaks: StoreBreakEntity[];
    unavailable: StoreUnavailablePeriodEntity[];
    occupied: OccupiedRange[];
}

/**
 * 연장 요금 상품 — 연박은 1박, 시간 이용 · 1박은 시간 이용(사용자 결정 2026-11-09).
 *
 * @param room_plan_type_id 예약의 기본 상품
 * @returns 요금 상품 종류
 */
export function toExtensionPlanType(room_plan_type_id: string): string {
    return room_plan_type_id === RESERVATION_PLAN_TYPE.LONG ? RESERVATION_PLAN_TYPE.NIGHT : RESERVATION_PLAN_TYPE.HOURLY;
}

/**
 * 연장 구간 — 지금 끝에서 한 단위: 시간 이용 요금이면 + 업체 이용 시간, 1박 요금(연박)이면 + 1일(퇴실 시각 그대로). 요금 기준일은 연장 시작의 한국 날짜.
 * 예: 1박 21:00 ~ 09:00 → 09:00 ~ 13:00(이용 시간 4), 연박 ~ 11/12 11:00 → 11/12 11:00 ~ 11/13 11:00.
 *
 * @param reservation 예약 (끝)
 * @param unit_plan 요금 상품의 업체 설정 (종류 · 이용 시간)
 * @returns 연장 구간
 */
export function toExtensionStay(reservation: Pick<ReservationEntity, 'end_at'>, unit_plan: Pick<RoomPlanEntity, 'room_plan_type_id' | 'usage_hours'>): ExtensionStay {
    const start = dayjs(reservation.end_at).tz(KST_TIMEZONE);
    const end = unit_plan.room_plan_type_id === RESERVATION_PLAN_TYPE.NIGHT ? start.add(1, 'day') : start.add(unit_plan.usage_hours as number, 'hour');
    return {room_plan_type_id: unit_plan.room_plan_type_id, day: toKstDay(start.format(RESERVATION_DATE_FORMAT)), start, end};
}

/**
 * 예약의 박수 — 입실 날짜 ~ 퇴실 날짜(한국 날짜) 차이(연박 최대 박수 판정).
 *
 * @param reservation 예약 (시작 · 끝)
 * @returns 박수
 */
export function toStayNights(reservation: Pick<ReservationEntity, 'start_at' | 'end_at'>): number {
    const start = toKstDay(dayjs(reservation.start_at).tz(KST_TIMEZONE).format(RESERVATION_DATE_FORMAT));
    return toKstDay(dayjs(reservation.end_at).tz(KST_TIMEZONE).format(RESERVATION_DATE_FORMAT)).diff(start, 'day');
}

/**
 * 연장 금액 — 요금 기준일(연장 시작 날짜)의 기간 가격, 없으면 그룹 상품 기본 요금(예약 금액 계산의 priceOn 과 같다).
 *
 * @param stay 연장 구간
 * @param base_price 그룹 상품 기본 요금
 * @param periods 그 그룹 상품의 기간 가격
 * @returns 금액(원)
 */
export function calculateExtensionPrice(stay: ExtensionStay, base_price: number, periods: RoomGroupPlanPriceEntity[]): number {
    return priceOn(stay.day, base_price, periods);
}

/**
 * 연장 구간의 영업시간 · 브레이크 — 시간 단위 연장(시간 이용 요금)은 구간 전체가 영업시간 안 · 브레이크와 안 겹침,
 * 하루 연장(1박 요금 — 연박)은 새 퇴실 시각이 (여는, 닫는] 안 · 브레이크 밖. 24시간 업체는 영업시간을 보지 않는다(브레이크는 본다).
 */
function isExtensionWithinStoreHours(stay: ExtensionStay, is_always_open: number, hours: StoreHourEntity[], breaks: StoreBreakEntity[]): boolean {
    const firstDay = stay.day.subtract(1, 'day');
    const lastDay = toKstDay(stay.end.format(RESERVATION_DATE_FORMAT));
    const breakWindows = listBreakWindows(breaks, firstDay, lastDay);
    const hourWindows = is_always_open === 1 ? null : listBusinessWindows(hours, firstDay, lastDay);
    if (stay.room_plan_type_id === RESERVATION_PLAN_TYPE.HOURLY) {
        const overlapsBreak = breakWindows.some((window) => window.start.isBefore(stay.end) && window.end.isAfter(stay.start));
        const inHours = hourWindows === null || hourWindows.some((window) => !window.start.isAfter(stay.start) && !window.end.isBefore(stay.end));
        return !overlapsBreak && inHours;
    }
    const checkOutBreak = breakWindows.some((window) => window.start.isBefore(stay.end) && !window.end.isBefore(stay.end));
    const checkOutHours = hourWindows === null || hourWindows.some((window) => window.start.isBefore(stay.end) && !window.end.isBefore(stay.end));
    return !checkOutBreak && checkOutHours;
}

/**
 * 연장 가능 판정 — 위에서부터 첫 사유, 할 수 있으면 null(사용자 결정 2026-11-09). 조회의 사유 · 신청의 400 이 같은 문구다.
 * 예약 가능 요일 · 예약 가능 기간 · 즉시 입실 조건은 보지 않는다(이미 이용 중인 호실).
 *
 * @param ctx 판정 재료
 * @returns 못 하는 사유 또는 null
 */
export function judgeExtension(ctx: ExtensionContext): string | null {
    const state = ctx.reservation.reservation_state_id;
    const in_use = (state === RESERVATION_STATE.CONFIRMED || state === RESERVATION_STATE.CHECKED_IN) && !ctx.now.isBefore(ctx.reservation.start_at) && ctx.now.isBefore(ctx.reservation.end_at);
    if (!in_use) {
        return RESERVATION_EXTENSION_NOT_IN_USE_MESSAGE;
    }
    if (ctx.details.some((detail) => detail.reservation_detail_type_id === RESERVATION_DETAIL_TYPE.EXTENSION && detail.reservation_state_id === RESERVATION_STATE.EXPIRED)) {
        return RESERVATION_EXTENSION_EXPIRED_MESSAGE;
    }
    if (ctx.details.some((detail) => detail.reservation_state_id === RESERVATION_STATE.PENDING)) {
        return RESERVATION_EXTENSION_PENDING_MESSAGE;
    }
    if (!ctx.store || ctx.store.store_state_id !== RESERVATION_STORE_STATE_ACTIVE || ctx.store.is_open !== 1 || !ctx.room_state_id || ctx.room_state_id === RESERVATION_ROOM_STATE.DISABLED) {
        return RESERVATION_EXTENSION_UNAVAILABLE_MESSAGE;
    }
    // 업체 연장 설정 — 예약 상품 행(1박 예약은 시간 이용 요금으로 늘려도 1박 행), 연장할 때의 지금 설정(사용자 결정 2026-11-09)
    if (!ctx.base_plan || ctx.base_plan.is_extendable !== 1) {
        return RESERVATION_EXTENSION_NOT_EXTENDABLE_MESSAGE;
    }
    const confirmed = ctx.details.filter((detail) => detail.reservation_detail_type_id === RESERVATION_DETAIL_TYPE.EXTENSION && detail.reservation_state_id === RESERVATION_STATE.CONFIRMED).length;
    if (confirmed >= ctx.base_plan.max_extensions) {
        return `연장은 최대 ${ctx.base_plan.max_extensions}회까지 할 수 있습니다.`;
    }
    if (!ctx.unit_plan || ctx.unit_plan.is_used !== 1 || !ctx.group_plan || !isGroupPlanOnSale(ctx.group_plan) || !ctx.stay) {
        return RESERVATION_EXTENSION_NOT_ON_SALE_MESSAGE;
    }
    const stay = ctx.stay;
    if (ctx.base_plan.room_plan_type_id === RESERVATION_PLAN_TYPE.LONG && toStayNights(ctx.reservation) + 1 > (ctx.base_plan.max_nights as number)) {
        return `연박은 최대 ${ctx.base_plan.max_nights}박까지 연장할 수 있습니다.`;
    }
    const blockedByPeriod = ctx.unavailable.some((period) => dayjs(period.starts_at).isBefore(stay.end) && dayjs(period.ends_at).isAfter(stay.start));
    if (!isExtensionWithinStoreHours(stay, ctx.store.is_always_open, ctx.hours, ctx.breaks) || blockedByPeriod) {
        return RESERVATION_EXTENSION_TIME_MESSAGE;
    }
    const blocked_until = stay.end.add(ctx.reservation.maintenance_minutes, 'minute');
    if (ctx.occupied.some((range) => dayjs(range.start_at).isBefore(blocked_until) && dayjs(range.blocked_until).isAfter(stay.start))) {
        return RESERVATION_EXTENSION_NEXT_RESERVATION_MESSAGE;
    }
    return null;
}

/**
 * 연장 주문명 — `<상호명> <호실명> 연장 <n>시간` · `… 연장 1일`, 100자로 자른다.
 *
 * @param store_name 상호명
 * @param room_name 호실명
 * @param stay 연장 구간
 * @returns 주문명
 */
export function buildExtensionOrderName(store_name: string, room_name: string, stay: ExtensionStay): string {
    const unit = stay.room_plan_type_id === RESERVATION_PLAN_TYPE.NIGHT ? '1일' : `${stay.end.diff(stay.start, 'hour')}시간`;
    return `${store_name} ${room_name} 연장 ${unit}`.slice(0, RESERVATION_ORDER_NAME_MAX_LENGTH);
}

/**
 * 연장 조회 응답 — 계산할 수 있는 값은 사유가 있어도 채운다.
 *
 * @param reservation_id 예약 ID
 * @param reason 못 하는 사유 또는 null
 * @param stay 연장 구간 또는 null
 * @param amount 금액 또는 null
 * @returns 조회 결과
 */
export function toExtensionResult(reservation_id: string, reason: string | null, stay: ExtensionStay | null, amount: number | null): ReservationExtensionResultDto {
    return {
        reservation_id,
        is_extendable: reason === null ? 1 : 0,
        reason,
        room_plan_type_id: stay?.room_plan_type_id ?? null,
        start_at: stay ? stay.start.toISOString() : null,
        end_at: stay ? stay.end.toISOString() : null,
        amount,
    };
}
```

### D. user-service — Data Access

```ts
// apps/user-service/src/reservation/repositories/reservation.repository.ts — 바뀌는 · 새 메서드
    /**
     * 예약 구간 등록 — 결제 대기 구간이 이미 있으면(겹친 연장 신청 — UK_ReservationDetail_ReservationIdPending) 400
     */
    async insertReservationDetail(entity: ReservationDetailEntity): Promise<void> {
        try {
            await this.reservationDetails.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, DETAIL_PENDING_UNIQUE)) {
                throw new BadRequestException({message: RESERVATION_EXTENSION_PENDING_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 연장 잡아 두기 — 예약의 점유 끝을 늘린다(상태 · 끝 조건, 1행이면 true). 다음 예약과 겹치면(EXC_Reservation_RoomIdBlockedRange) 400
     */
    async updateReservationHold(where: FindOptionsWhere<ReservationEntity>, entity: ReservationEntity): Promise<boolean> {
        try {
            const result = await this.reservations.update(where, entity);
            return result.affected === 1;
        } catch (error) {
            if (isExclusionViolation(error, RESERVATION_EXCLUSION)) {
                throw new BadRequestException({message: RESERVATION_EXTENSION_NEXT_RESERVATION_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }
// 상수: const DETAIL_PENDING_UNIQUE = 'UK_ReservationDetail_ReservationIdPending';
```

### D. user-service — Business Logic

```ts
// apps/user-service/src/reservation/reservation.service.ts — 새 메서드(조회 · 신청은 같은 재료를 읽는다 — service private 헬퍼 금지라 두 메서드에 같은 읽기)
    /**
     * 연장 조회 (이용자) — 지금 끝에서 한 단위 늘리면 몇 시까지 · 얼마인지, 못 하면 사유(잡아 두지 않는다). (내부 HTTP: GET /internal/v1/user-service/reservation/:reservation_id/extension)
     */
    async getExtension(user_id: string, reservation_id: string): Promise<ReservationExtensionResultDto> {
        // 1. 내 예약 — 결제 대기 만료는 404
        const reservation = await this.reservationRepository.findReservation({reservation_id, user_id});
        if (!reservation || reservation.reservation_state_id === RESERVATION_STATE.EXPIRED) {
            throw new NotFoundException({message: RESERVATION_NOT_FOUND_MESSAGE});
        }

        // 2. 재료 — 구간 · 업체 · 호실 · 예약 상품 설정(연장 설정 · 연박 최대 박수) · 요금 상품(업체 설정 · 그룹 상품 · 기간 가격)
        const now = nowKst();
        const details = await this.reservationRepository.findReservationDetails({reservation_id: reservation.reservation_id});
        const store = await this.reservationRepository.findReservationStore({store_id: reservation.store_id});
        const room = await this.reservationRepository.findReservationRoom({room_id: reservation.room_id});
        const base_plan = await this.reservationRepository.findStorePlan({store_id: reservation.store_id, room_plan_type_id: reservation.room_plan_type_id});
        const unit_type = toExtensionPlanType(reservation.room_plan_type_id);
        const unit_plan = unit_type === reservation.room_plan_type_id ? base_plan : await this.reservationRepository.findStorePlan({store_id: reservation.store_id, room_plan_type_id: unit_type});
        const [group_plan] = room ? await this.reservationRepository.findGroupPlans({room_group_id: room.room_group_id, room_plan_type_id: unit_type}) : [];
        const periods = group_plan ? await this.reservationRepository.findGroupPlanPrices({room_group_plan_id: group_plan.room_group_plan_id}) : [];
        const stay = unit_plan ? toExtensionStay(reservation, unit_plan) : null;

        // 3. 연장 구간과 겹치는 영업시간 · 브레이크 · 일시 예약불가 · 그 호실의 다른 점유 예약(정비시간까지)
        const hours = await this.reservationRepository.findStoreHours(reservation.store_id);
        const breaks = await this.reservationRepository.findStoreBreaks(reservation.store_id);
        const unavailable = stay ? await this.reservationRepository.findUnavailablePeriods({store_id: reservation.store_id, starts_at: LessThan(stay.end.toDate()), ends_at: MoreThan(stay.start.toDate())}) : [];
        const occupied = stay
            ? await this.reservationRepository.findReservations({
                  room_id: reservation.room_id,
                  reservation_id: Not(reservation.reservation_id),
                  reservation_state_id: In(RESERVATION_OCCUPYING_STATES),
                  start_at: LessThan(stay.end.add(reservation.maintenance_minutes, 'minute').toDate()),
                  blocked_until: MoreThan(stay.start.toDate()),
              })
            : [];

        // 4. 판정 · 금액
        const reason = judgeExtension({now, reservation, details, store, room_state_id: room?.room_state_id ?? null, base_plan, unit_plan, group_plan: group_plan ?? null, stay, hours, breaks, unavailable, occupied});
        const amount = stay && group_plan ? calculateExtensionPrice(stay, group_plan.price, periods) : null;
        return toExtensionResult(reservation.reservation_id, reason, stay, amount);
    }

    /**
     * 연장 신청 (이용자) — 조회와 같은 판정(못 하면 400 그 사유) 뒤 결제(READY) → 연장 구간(EXTENSION · PENDING · 5분) → 예약 점유 끝 = 새 끝 + 정비시간(잡아 두기).
     * 다음 예약과 겹치면 배타 제약이 400, 겹친 신청은 부분 유니크가 400. 확정은 기존 결제 확인 · 결제 대기 만료가 한다. (RabbitMQ: user.reservation.extend)
     */
    @Transactional()
    async requestExtension(user_id: string, reservation_id: string): Promise<ReservationExtendResultDto> {
        // 1 ~ 4. getExtension 과 같은 읽기 · 판정 — 못 하면 400 그 사유
        // … (같은 코드)
        if (reason !== null || !stay || !group_plan || !store || !room) {
            throw new BadRequestException({message: reason ?? RESERVATION_EXTENSION_UNAVAILABLE_MESSAGE});
        }
        const amount = calculateExtensionPrice(stay, group_plan.price, periods);
        const expires_at = now.add(RESERVATION_PAYMENT_PENDING_MINUTES, 'minute').toDate();

        // 5. 결제(READY) — createReservation 과 같은 컬럼
        const payment = new PaymentEntity();
        payment.payment_id = generateId();
        payment.user_id = user_id;
        payment.payment_state_id = PAYMENT_STATE.READY;
        payment.environment = this.paymentGateway.environment();
        payment.order_name = buildExtensionOrderName(store.store_name, room.room_name, stay);
        payment.amount = amount;
        payment.payment_key = null; // … approved_at · receipt_url · refund_* · failure_* 모두 null(createReservation 과 같다)
        await this.reservationRepository.insertPayment(payment);

        // 6. 연장 구간(EXTENSION · PENDING · 결제 대기 만료) — 결제 대기 구간이 이미 있으면 부분 유니크가 400
        const detail = new ReservationDetailEntity();
        detail.reservation_detail_id = generateId();
        detail.reservation_id = reservation.reservation_id;
        detail.reservation_detail_type_id = RESERVATION_DETAIL_TYPE.EXTENSION;
        detail.room_plan_type_id = stay.room_plan_type_id;
        detail.reservation_state_id = RESERVATION_STATE.PENDING;
        detail.payment_id = payment.payment_id;
        detail.start_at = stay.start.toDate();
        detail.end_at = stay.end.toDate();
        detail.price = amount;
        detail.expires_at = expires_at;
        await this.reservationRepository.insertReservationDetail(detail);

        // 7. 잡아 두기 — 점유 끝 = 새 끝 + 정비시간(상태 · 끝 조건 — 그 사이 바뀌었으면 400, 다음 예약과 겹치면 배타 제약 400)
        const held = new ReservationEntity();
        held.blocked_until = stay.end.add(reservation.maintenance_minutes, 'minute').toDate();
        if (!(await this.reservationRepository.updateReservationHold({reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id, end_at: reservation.end_at}, held))) {
            throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
        }
        return {reservation_id: reservation.reservation_id, reservation_detail_id: detail.reservation_detail_id, payment_id: payment.payment_id, order_name: payment.order_name, amount, expires_at: expires_at.toISOString(), start_at: detail.start_at.toISOString(), end_at: detail.end_at.toISOString()};
    }
```

```ts
// confirmPayment — 3단계(토스 대조) 다음에 연장 구간 갈래를 둔다. 기본 구간은 지금 그대로
        // 4'. 연장 구간 — 결제 대기 연장 + 예약 확정 · 이용 중이면 확정, 아니면(금액 불일치 · 만료 · 취소된 예약) 환불 신청 + (결제 대기면) 구간 만료 · 잡아 둔 구간 되돌림 후 실패 반환
        if (detail.reservation_detail_type_id === RESERVATION_DETAIL_TYPE.EXTENSION) {
            const active = detail.reservation_state_id === RESERVATION_STATE.PENDING && (reservation.reservation_state_id === RESERVATION_STATE.CONFIRMED || reservation.reservation_state_id === RESERVATION_STATE.CHECKED_IN);
            if (verdict === 'MISMATCH' || !active) {
                const refund = new PaymentEntity(); // 기본 구간 환불과 같은 컬럼 — 토스가 받은 금액 전액, 사유 불일치 · 결제 대기 시간 경과
                // … refund 컬럼 할당(지금 4단계와 같다)
                if (!(await this.reservationRepository.updatePayment({payment_id: payment.payment_id, payment_state_id: payment.payment_state_id}, refund))) {
                    throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
                }
                if (detail.reservation_state_id === RESERVATION_STATE.PENDING) {
                    const expiredDetail = new ReservationDetailEntity();
                    expiredDetail.reservation_state_id = RESERVATION_STATE.EXPIRED;
                    await this.reservationRepository.updateReservationDetails({reservation_detail_id: detail.reservation_detail_id, reservation_state_id: RESERVATION_STATE.PENDING}, expiredDetail);
                    const released = new ReservationEntity();
                    released.blocked_until = dayjs(reservation.end_at).add(reservation.maintenance_minutes, 'minute').toDate();
                    await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, end_at: detail.start_at}, released);
                }
                return new BadRequestException({message: verdict === 'MISMATCH' ? '결제 금액이 맞지 않아 결제를 취소했습니다.' : '연장 결제 대기 시간이 지나 결제를 취소했습니다.'});
            }
            // 확정 — 결제 DONE → 구간 CONFIRMED → 예약 끝 · 합계(상태 · 끝 조건 — 어긋나면 400 롤백)
            const done = new PaymentEntity(); // 지금 5단계와 같은 컬럼
            // …
            if (!(await this.reservationRepository.updatePayment({payment_id: payment.payment_id, payment_state_id: PAYMENT_STATE.READY}, done))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
            const confirmedDetail = new ReservationDetailEntity();
            confirmedDetail.reservation_state_id = RESERVATION_STATE.CONFIRMED;
            await this.reservationRepository.updateReservationDetails({reservation_detail_id: detail.reservation_detail_id, reservation_state_id: RESERVATION_STATE.PENDING}, confirmedDetail);
            const extended = new ReservationEntity();
            extended.end_at = detail.end_at;
            extended.total_price = reservation.total_price + detail.price;
            if (!(await this.reservationRepository.updateReservation({reservation_id: reservation.reservation_id, reservation_state_id: In([RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN]), end_at: detail.start_at}, extended))) {
                throw new BadRequestException({message: RESERVATION_STATE_CHANGED_MESSAGE});
            }
            // QR — 유효 끝이 연장 시작(= 이전 끝)인 QR 이면 새 끝으로(결제 대기 중 끝이 지나 Redis 가 지웠어도), Redis 현재 QR 은 마지막
            const roomQr = await this.reservationRepository.findRoomQr({reservation_id: reservation.reservation_id});
            if (roomQr && dayjs(roomQr.ends_at).isSame(detail.start_at)) {
                const extendedQr = new RoomQrEntity();
                extendedQr.ends_at = detail.end_at;
                await this.reservationRepository.updateRoomQr({room_qr_id: roomQr.room_qr_id}, extendedQr);
                await this.doorStore.setQr(roomQr.room_id, roomQr.qr, detail.end_at);
            }
            return {reservation_id: reservation.reservation_id, reservation_state_id: reservation.reservation_state_id};
        }
```

```ts
// cancelReservation(확정 · 이용 중) · approveCancelRequest — 예약 · 구간 취소 다음에 결제 대기 연장 정리(결제는 만료 — 늦은 승인은 재확인 crontab 이 환불)
        const pendingExtensions = await this.reservationRepository.findReservationDetails({reservation_id: reservation.reservation_id, reservation_state_id: RESERVATION_STATE.PENDING});
        // … 예약 · 확정 구간 취소 뒤
        for (const extension of pendingExtensions) {
            const canceledExtension = new ReservationDetailEntity();
            canceledExtension.reservation_state_id = RESERVATION_STATE.CANCELED;
            await this.reservationRepository.updateReservationDetails({reservation_detail_id: extension.reservation_detail_id, reservation_state_id: RESERVATION_STATE.PENDING}, canceledExtension);
            const expiredPayment = new PaymentEntity();
            expiredPayment.payment_state_id = PAYMENT_STATE.EXPIRED;
            await this.reservationRepository.updatePayment({payment_id: extension.payment_id, payment_state_id: PAYMENT_STATE.READY}, expiredPayment);
        }
```

### D. user-service — Entry Point

```ts
// apps/user-service/src/reservation/controllers/reservation.controller.ts — 추가
    /**
     * 내 예약 연장 조회 (이용자 — 잡아 두지 않는다)
     */
    @Get('/:reservation_id/extension')
    @HttpCode(200)
    async getExtension(@InternalActor('user_id') user_id: string, @Param() param: ReservationExtensionParamDto): Promise<ReservationExtensionResultDto> {
        return this.reservationService.getExtension(user_id, param.reservation_id);
    }

// apps/user-service/src/reservation/controllers/reservation.controller.queue.ts — 추가
    /**
     * 연장 신청 — 이용자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(RESERVATION_COMMAND.EXTEND)
    async requestExtension(command: MessageEnvelope<ReservationExtendParamDto>): Promise<ReservationExtendResultDto> {
        return this.reservationService.requestExtension(requireActor(command).user_id, command.payload.reservation_id);
    }
```

### E. scheduler

```ts
// apps/scheduler/src/reservation/interfaces/reservation.repository.interface.ts — ExpiredPendingRow 확장
/** 결제 대기가 끝난 구간 행 — 구간(기본 · 연장) + 결제 + 예약(QueryBuilder raw) */
export interface ExpiredPendingRow {
    reservation_id: string;
    reservation_detail_id: string;
    reservation_detail_type_id: string;
    payment_id: string;
    amount: number;
    price: number;
    detail_start_at: Date;
    detail_end_at: Date;
    reservation_state_id: string;
    reservation_end_at: Date;
    total_price: number;
    maintenance_minutes: number;
}
    /** 연장 결제 대기 전환 — 결제(READY) → 구간(PENDING) → 예약(끝 조건 — 확정이면 끝 · 합계, 아니면 점유 끝 되돌림) · QR(확정만)을 한 트랜잭션으로, 결제가 이미 바뀌었으면 false */
    transitionExtension(row: ExpiredPendingRow, transition: ExtensionTransition): Promise<boolean>;
```

```ts
// apps/scheduler/src/reservation/repositories/reservation.repository.ts
    buildExpiredPendingQuery(now: Date): SelectQueryBuilder<ReservationDetailEntity> {
        return this.reservationDetails
            .createQueryBuilder('d')
            .select('d.reservation_id', 'reservation_id')
            .addSelect('d.reservation_detail_id', 'reservation_detail_id')
            .addSelect('d.reservation_detail_type_id', 'reservation_detail_type_id')
            .addSelect('d.payment_id', 'payment_id')
            .addSelect('p.amount', 'amount')
            .addSelect('d.price', 'price')
            .addSelect('d.start_at', 'detail_start_at')
            .addSelect('d.end_at', 'detail_end_at')
            .addSelect('r.reservation_state_id', 'reservation_state_id')
            .addSelect('r.end_at', 'reservation_end_at')
            .addSelect('r.total_price', 'total_price')
            .addSelect('r.maintenance_minutes', 'maintenance_minutes')
            .innerJoin(PaymentEntity, 'p', 'p.payment_id = d.payment_id')
            .innerJoin(ReservationEntity, 'r', 'r.reservation_id = d.reservation_id')
            .where('d.reservation_state_id = :pending', {pending: RESERVATION_STATE.PENDING})
            .andWhere('d.expires_at <= :now', {now})
            .andWhere('p.payment_state_id = :ready', {ready: PAYMENT_STATE.READY})
            .orderBy('d.expires_at', 'ASC');
    }

    async transitionExtension(row: ExpiredPendingRow, transition: ExtensionTransition): Promise<boolean> {
        try {
            return await this.txHost.withTransaction(async () => {
                const payment = await this.payments.update({payment_id: row.payment_id, payment_state_id: PAYMENT_STATE.READY}, transition.payment);
                if (payment.affected !== 1) {
                    return false;
                }
                await this.reservationDetails.update({reservation_detail_id: row.reservation_detail_id, reservation_state_id: RESERVATION_STATE.PENDING}, transition.detail);
                if (transition.room_qr) {
                    const reservation = await this.reservations.update(
                        {reservation_id: row.reservation_id, reservation_state_id: In([RESERVATION_STATE.CONFIRMED, RESERVATION_STATE.CHECKED_IN]), end_at: row.detail_start_at},
                        transition.reservation,
                    );
                    if (reservation.affected !== 1) {
                        throw new Error('reservation changed');
                    }
                    await this.roomQrs.update({reservation_id: row.reservation_id, ends_at: row.detail_start_at}, transition.room_qr);
                } else {
                    await this.reservations.update({reservation_id: row.reservation_id, end_at: row.detail_start_at}, transition.reservation);
                }
                return true;
            });
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    // buildUsageEndRowsQuery — 결제 대기 중인 연장이 있는 예약은 빼고 결제 결과를 기다린다(최대 5분)
            .andWhere((qb) => `NOT EXISTS ${qb.subQuery().select('1').from(ReservationDetailEntity, 'pd').where('pd.reservation_id = r.reservation_id').andWhere('pd.reservation_state_id = :pending').getQuery()}`)
            .setParameter('pending', RESERVATION_STATE.PENDING)
```

```ts
// apps/scheduler/src/reservation/reservation.util.ts — 추가
/** 연장 결제 대기 전환 — 결제 · 구간 · 예약(확정: 끝 · 합계, 그 밖: 점유 끝 되돌림) · QR(확정만 — 유효 끝 = 새 끝) */
export interface ExtensionTransition {
    payment: PaymentEntity;
    detail: ReservationDetailEntity;
    reservation: ReservationEntity;
    room_qr: RoomQrEntity | null;
}

/** 연장 확정 — 결제 DONE · 구간 CONFIRMED · 예약 끝 = 연장 끝 · 합계 + 연장 금액 · QR 유효 끝 = 연장 끝(Redis 는 QR 동기화가 1분 안에) */
export function buildExtensionConfirmTransition(lookup: PaymentLookupResult, row: ExpiredPendingRow, now: Date): ExtensionTransition {
    const {payment} = buildConfirmTransition(lookup, now);
    const detail = new ReservationDetailEntity();
    detail.reservation_state_id = RESERVATION_STATE.CONFIRMED;
    const reservation = new ReservationEntity();
    reservation.end_at = row.detail_end_at;
    reservation.total_price = Number(row.total_price) + Number(row.price);
    const room_qr = new RoomQrEntity();
    room_qr.ends_at = row.detail_end_at;
    return {payment, detail, reservation, room_qr};
}

/** 연장 환불 — 결제 REFUND_REQUESTED(토스 금액 전액) · 구간 EXPIRED · 점유 끝 되돌림(지금 끝 + 정비시간) */
export function buildExtensionRefundTransition(lookup: PaymentLookupResult, reason: string, row: ExpiredPendingRow, now: Date): ExtensionTransition {
    return {payment: buildRefundRequest(lookup, reason, now), ...buildExtensionRelease(row)};
}

/** 연장 만료 — 결제 EXPIRED · 구간 EXPIRED · 점유 끝 되돌림(그 예약은 다시 연장할 수 없다) */
export function buildExtensionExpireTransition(row: ExpiredPendingRow): ExtensionTransition {
    const payment = new PaymentEntity();
    payment.payment_state_id = PAYMENT_STATE.EXPIRED;
    return {payment, ...buildExtensionRelease(row)};
}

/** 파일 전용 — 구간 만료 · 점유 끝 = 지금 끝 + 정비시간 */
function buildExtensionRelease(row: ExpiredPendingRow): {detail: ReservationDetailEntity; reservation: ReservationEntity; room_qr: null} {
    const detail = new ReservationDetailEntity();
    detail.reservation_state_id = RESERVATION_STATE.EXPIRED;
    const reservation = new ReservationEntity();
    reservation.blocked_until = dayjs(row.reservation_end_at).add(Number(row.maintenance_minutes), 'minute').toDate();
    return {detail, reservation, room_qr: null};
}
```

```ts
// apps/scheduler/src/reservation/crontabs/reservation-payment-expire.crontab.ts — 행마다 구간 종류로 가른다
                    if (row.reservation_detail_type_id === RESERVATION_DETAIL_TYPE.EXTENSION) {
                        const active = row.reservation_state_id === RESERVATION_STATE.CONFIRMED || row.reservation_state_id === RESERVATION_STATE.CHECKED_IN;
                        if (verdict === 'PAID' && active) {
                            await this.reservationRepository.transitionExtension(row, buildExtensionConfirmTransition(lookup as PaymentLookupResult, row, now));
                        } else if (verdict === 'PAID' || verdict === 'MISMATCH') {
                            const reason = verdict === 'MISMATCH' ? RESERVATION_REFUND_REASON.AMOUNT_MISMATCH : RESERVATION_REFUND_REASON.LATE_PAYMENT;
                            await this.reservationRepository.transitionExtension(row, buildExtensionRefundTransition(lookup as PaymentLookupResult, reason, row, now));
                        } else {
                            await this.reservationRepository.transitionExtension(row, buildExtensionExpireTransition(row));
                        }
                        continue;
                    }
                    // 기본 구간 — 지금 그대로(transitionPending)
```

### F. gateway

```ts
// apps/gateway/src/api/v1/user-service/reservation/controllers/reservation.controller.ts — 추가
    /**
     * 연장 조회 — 지금 끝에서 한 단위(시간 이용 · 1박: 업체 이용 시간, 연박: 1일) 늘리면 몇 시까지 · 얼마인지, 못 하면 사유(잡아 두지 않는다)
     */
    @Get('/:reservation_id/extension')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '연장 조회'})
    @ApiOkResponse({type: ReservationExtensionResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getExtension(@PassportActor() actor: Actor, @Param() param: ReservationExtensionParamDto): Promise<ReservationExtensionResultDto> {
        return this.internalHttp.request<ReservationExtensionResultDto>('user', 'GET', RESERVATION_INTERNAL_PATH.extension(param.reservation_id), {actor});
    }

// reservation.controller.queue.ts — 추가
    /**
     * 연장 신청 (이용자) — 이용 중에만, 구간을 잡아 두고 결제 정보(5분). done 의 data 로 토스 결제창(orderId = payment_id) → 결제 확인
     */
    @Post('/:reservation_id/extension')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '연장 신청'})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ReservationExtendResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async requestExtension(@PassportActor() actor: Actor, @Param() param: ReservationExtendParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: RESERVATION_COMMAND.EXTEND, actor, payload: param, client_ip: ip});
    }
```

- 문서: README(이용자 예약 — 연장 조회 · 신청, 업체 상품 설정의 연장 가능 여부 · 최대 횟수, scheduler 결제 대기 만료 · 이용 종료 대기), AGENTS(user-service reservation · admin-service room 설명 · Smoke 목록), docs/data-layer(t_room_plan 연장 설정 · 결제 대기 구간 부분 유니크 · 잡아 두기), docs/messaging(`user.reservation.extend`), docs/testing(Smoke).

---

## Test Cases

```
[CASES:extension-stay] 시간 이용 14:00 ~ 16:00(이용 시간 4) → 16:00 ~ 20:00 · 시간 이용 요금
[CASES:extension-stay] 시간 이용 14:00 ~ 20:00(한 번 연장한 뒤) → 20:00 ~ 다음 날 00:00
[CASES:extension-stay] 시간 이용 22:00 ~ 02:00 → 02:00 ~ 06:00 · 요금 날짜는 연장 시작일(다음 날)
[CASES:extension-stay] 1박 21:00 ~ 다음 날 09:00 → 09:00 ~ 13:00 · 시간 이용 요금
[CASES:extension-stay] 연박 11/10 15:00 ~ 11/12 11:00(2박) → 11/12 11:00 ~ 11/13 11:00 · 1박 요금 · 연장 뒤 3박
[CASES:extension-stay] 연장 시작일이 기간 가격 안 → 기간 요금
[CASES:extension-stay] 연장 시작일이 기간 가격 밖(전날까지) → 기본 요금
[CASES:extension-judge] 확정 · 시작 전 → 불가 `이용 중인 예약만 연장할 수 있습니다.`
[CASES:extension-judge] 이용 중 · 지금 = 끝 정각 → 불가(이용 중 아님)
[CASES:extension-judge] 취소 · 이용 완료 · 결제 대기 → 불가(이용 중 아님)
[CASES:extension-judge] 만료된 연장 구간이 있음 → 불가 `결제하지 않은 연장이 있어 더 연장할 수 없습니다.`
[CASES:extension-judge] 결제 대기 중인 연장 구간이 있음 → 불가 `결제 대기 중인 연장이 있습니다.`
[CASES:extension-judge] 업체 영업중 아님 · 호실 사용중지 → 불가 `지금은 연장할 수 없습니다.`
[CASES:extension-judge] 예약 상품(시간 이용) 행 연장 불가 → 불가 `연장할 수 없는 상품입니다.`
[CASES:extension-judge] 1박 예약 · 1박 행 연장 가능 · 시간 이용 행 연장 불가 → 가능(설정은 예약 상품 행)
[CASES:extension-judge] 확정 연장 3회 · 최대 3회 → 불가 `연장은 최대 3회까지 할 수 있습니다.`
[CASES:extension-judge] 확정 연장 2회 · 최대 3회 → 가능
[CASES:extension-judge] 업체 시간 이용 미판매 · 그룹 시간 이용 요금 0 → 불가 `연장 상품을 팔지 않는 업체입니다.`
[CASES:extension-judge] 연박 2박 · 최대 2박 → 불가 `연박은 최대 2박까지 연장할 수 있습니다.`
[CASES:extension-judge] 연장 구간이 영업 끝(22:00)을 넘음 · 브레이크와 겹침 · 일시 예약불가와 겹침 → 불가 `연장할 수 없는 시간입니다.`
[CASES:extension-judge] 다음 예약 시작 < 연장 끝 + 정비시간 → 불가 `다음 예약이 있어 연장할 수 없습니다.`
[CASES:extension-judge] 다음 예약 시작 = 연장 끝 + 정비시간(맞닿음) → 가능
[CASES:extension-judge] 24시간 업체 · 영업시간 밖 시각 → 가능(브레이크만 본다)
[FAIL:validation] 연장 조회 · 신청 — 예약 ID 형식 → 400
[FAIL:validation] 업체 상품 설정 수정 — 연장 가능 여부 없음 · 0 · 1 밖, 최대 연장 횟수 없음 · 0 · 11 · 소수 → 400
[FAIL:duplicate] 연장 신청 — 다음 예약과 겹침(배타 제약 EXC_Reservation_RoomIdBlockedRange) · 결제 대기 구간 부분 유니크 위반(겹친 신청) → 400
[SMOKE:data-access] 결제 대기 만료 대상(연장 구간 포함 — 구간 종류 · 예약 끝 · 합계 · 정비시간) · 이용 종료 대상(결제 대기 연장 제외 NOT EXISTS) · 연장 판정 재료(그 호실의 다른 점유 예약 · 그 예약의 연장 구간)
[SMOKE:data-access] 업체 상품 설정 select(admin room · discovery — 연장 가능 여부 · 최대 횟수 별칭)
테스트 생략(위임형): gateway 라우트 · contracts 경로 상수 · 모듈 등록 — 프로젝트 규칙상 gateway · controller spec 을 두지 않는다
```

계산 표는 service 기능 spec 이 지난다(util · crontab spec 을 두지 않는 규칙 — AGENTS Testing):

| 표 | 어디서 지나는가 | spec |
|---|---|---|
| `extension-stay` 7 | 연장 조회 응답의 `room_plan_type_id` · `start_at` · `end_at` · `amount`(요금 상품별 `findStorePlan` · `findGroupPlans` mock) | `reservation-extension.spec.ts`(새, 동기 경로) |
| `extension-judge` 16 | 연장 조회 응답의 `is_extendable` · `reason`(재료 mock — 예약 상품 행 · 요금 상품 행을 `findStorePlan` 의 종류별로) — 신청은 대표 2건(이용 중 아님 · 다음 예약)이 같은 문구로 400 · 쓰기 없음 | 같은 파일 · `reservation-extend.spec.ts`(새, 큐 경로) |

그 밖의 spec — 프로젝트 형태:
- user-service
  - `reservation-extend.spec.ts`: [SUCCESS] 결제 READY 엔티티(금액 · 주문명 `연장 4시간` · 환경) · 구간 EXTENSION PENDING(시작 · 끝 · 상품 · 금액 · 만료 5분) · 잡아 두기 조건(예약 · 상태 · 끝) · 엔티티(점유 끝 = 새 끝 + 정비시간) · 순서, 결과; [FAIL] 판정 400 · 쓰기 없음, 배타 제약 400(잡아 두기 reject) · 부분 유니크 400(구간 insert reject) · 잡아 두기 0행 400, 결제 키 없음 503 requeue, 404, 401
  - `reservation-payment-confirm.spec.ts`: 연장 확정(결제 DONE · 구간 조건 `reservation_detail_id` + PENDING · 예약 끝 · 합계 + 조건 `In(확정, 이용 중)` · 끝 = 연장 시작 · QR 유효 끝 · setQr 마지막 · 결과 상태 그대로), 끝이 이미 지나 Redis 가 지운 QR 도 연장, QR 없음(확정 상태) → QR 쓰기 없음, 금액 불일치 · 만료된 연장 · 취소된 예약 → 환불 신청 + 구간 만료 + 잡아 둔 구간 되돌림(결제 대기일 때만) · 반환된 실패 ack, 예약 조건 0행 → 400
  - `reservation-cancel.spec.ts` · `reservation-cancel-request-approve.spec.ts`: 결제 대기 연장 → 구간 CANCELED · 결제 EXPIRED(READY 조건)
  - repository spec: `insertReservationDetail` 부분 유니크 400 · 그 밖 500, `updateReservationHold` 배타 제약 400 · 1행 boolean · 500, Smoke — `findReservations`(다른 점유 예약 `Not` 자기 · 정비시간 경계) · `findReservationDetails`(예약)
- scheduler `reservation.repository.spec.ts`: `transitionExtension` 확정(조건 · 엔티티 · QR) · 되돌림(만료 · 환불) · 결제가 먼저 바뀜 false · 확정 예약 0행 500, Smoke — `buildExpiredPendingQuery`(기본 · 연장 + 예약 조인 · 별칭) · `buildUsageEndRowsQuery`(NOT EXISTS) · `transitionExtension` update 조건
- admin-service
  - `room-plan-update.spec.ts`: 쓰기 엔티티에 `is_extendable` · `max_extensions`(종류 3개 모두), `[FAIL:validation]` 연장 가능 여부 · 최대 횟수(없음 · 범위 · 소수)
  - `room-plan-list.spec.ts`: 항목의 두 값
  - `store-application-approve.spec.ts`: 상품 설정 3행 모두 `is_extendable` 1 · `max_extensions` 3
  - `room.repository.spec.ts`: 상품 설정 select Smoke(두 별칭)
- user-service discovery: `discovery-store-detail.spec.ts`(상품 설정 항목의 두 값) · `discovery.repository.spec.ts`(상품 설정 select Smoke)

## Response Codes

| 진입점 | 성공 | 실패 |
|---|---|---|
| `GET /api/v1/user-service/reservation/:reservation_id/extension` | 200 `{reservation_id, is_extendable, reason, room_plan_type_id, start_at, end_at, amount}` | 400 검증, 401, 404 내 예약 아님 · 결제 대기 만료, 500 |
| `POST /api/v1/user-service/reservation/:reservation_id/extension` | SSE done `{reservation_id, reservation_detail_id, payment_id, order_name, amount, expires_at, start_at, end_at}` | 400 검증 · 판정 사유 · 다음 예약 겹침(배타 제약) · 겹친 신청(부분 유니크) · 상태 바뀜, 401, 404, 503 토스 키 없음(재시도), 500 |
| 결제 확인(변경 — 연장 구간) | done `{reservation_id, reservation_state_id}` | 400 금액 불일치 · 연장 결제 대기 시간이 지남(환불 신청 커밋 — 반환된 실패) · 상태 바뀜, 503 Redis(재시도) |
| scheduler 결제 대기 만료(변경) · 이용 종료(변경) | 연장 확정 · 환불 · 만료 · 되돌림 / 결제 대기 연장 예약은 종료 대기 | 건별 실패는 다음 회차 |
| `PATCH /api/v1/admin-service/room/plan/:room_plan_type_id`(변경) | SSE done null | 400 검증(연장 가능 여부 · 최대 연장 횟수 추가) · 종류별 값, 401, 404, 500 |
| `GET /api/v1/admin-service/room/plan` · `GET /api/v1/user-service/discovery/store/:store_id`(변경) | 200 — 상품 설정 항목에 `is_extendable` · `max_extensions` | 지금 그대로 |
