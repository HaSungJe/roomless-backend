# Revision — store-operation — 261029-1

> Change plan for an existing feature. The original spec.md / plan.md are not modified, only referenced.
> 원본: [store-operation-spec.md](../../spec/store/store-operation-spec.md) · [store-operation-plan.md](../../plan/store/store-operation-plan.md) · [report](../../report/store/store-operation-report.md) (Phase 11, 커밋 4fe12f0)

## Reason for Change Request
사용자 요청 2026-10-29 — "업체 운영 설정 ㄱㄱ … 총관리자/관리자용 기능도 있어야함. 업체 목록이나 업체를 강제로 정지시키는 기능. 그리고 영업중 여부 전환 … 은 총관리자/관리자도 가능해야함. 100% 환불 기준은 업체마다 정할 수 있도록. n시간 전까지 100% 환불. 그 이전부터 환불 불가. … 그리고 n시간 전부터 예약 가능 … 이건 업체마다 설정 가능."
업체 목록 · 강제 정지(영업중지)는 Phase 9 에 이미 있다(`GET /api/v1/admin-service/store` · `PATCH /:store_id/state`). 이번 변경은 그 위에 관리자 영업중 여부 전환 · 정지 사유 · 업체별 예약 · 환불 규정을 더한다.

## Spec Before → After

| Item | Before | After |
|------|--------|-------|
| 관리자의 영업중 여부 전환 | 없음 — 업체 관리자만(`PATCH /mine/open`) | **추가** `PATCH /api/v1/admin-service/store/:store_id/open`(관리자 가드 — 총관리자 · 관리자, 큐 `admin.store.open`). 탈퇴 업체 400 · 같은 값 400 · 없는 업체 404. 관리자가 바꿀 수 있는 운영 설정은 이것 하나(사용자 결정 2026-10-29) |
| 업체 강제 정지 | 상태만 바꾼다(`SUSPEND`) | 영업중지로 바꿀 때 **정지 사유**(선택, 255자)를 저장 — `t_store.suspend_comment`. 활성 · 탈퇴로 바꾸면 비운다(NULL). 관리자 업체 상세 · 업체 관리자의 내 업체 상세에 보인다(사용자 결정 2026-10-29). 형제: 업체 관리자 정지의 `block_comment`(manager-staff-state.dto.ts — 선택 · 정지할 때만) |
| 예약 가능 시간 | 없음(로드맵 공통 규칙 "6개월 앞 예약까지") | **업체별** `t_store.booking_open_hours` — 이용 시작 n시간 전부터 예약을 받는다(예: 24 → 12-31 18:00 이용은 12-30 18:00 부터 예약). 1 ~ 4,320시간, 기본 72(사용자 결정 2026-10-29) |
| 100% 환불 기준 | 없음(로드맵 공통 규칙 "시작 1시간 전까지 100%, 그 이후 50%") | **업체별** `t_store.refund_deadline_hours` — 이용 시작 n시간 전까지 환불 신청을 받아 100% 환불, 그 뒤에는 **환불 신청 자체가 안 된다**(50% 구간 없음 — 예: 2 → 12-31 18:00 이용은 12-31 16:00 전까지). 0 ~ 168시간, 기본 1(사용자 결정 2026-10-29) |
| 규정 설정 API | — | **추가** `PATCH /api/v1/admin-service/store/mine/reservation-policy`(업체 관리자, 큐 `admin.store.mine-reservation-policy`) — 두 값을 함께 보낸다 |
| 규정의 적용 | — | 예약 · 환불 신청 때 막는 규칙은 예약 · 결제(Phase 17)에서 구현한다. 예약할 때의 환불 기준을 예약에 저장해 나중에 업체가 바꿔도 이미 한 예약은 그대로(사용자 결정 2026-10-29). 환불은 신청을 받은 뒤 백그라운드에서 토스페이먼츠로 처리(Phase 17 #66) — 로드맵에 적는다(ship) |
| 응답 | 상세에 규정 · 사유 없음 | 관리자 업체 상세 · 내 업체 상세에 `booking_open_hours` · `refund_deadline_hours` · `suspend_comment` |
| 입점 승인 | 업체 등록 때 운영 값 기본 | 같은 자리에서 예약 72 · 환불 1 · 정지 사유 null 을 넣는다 |

추가 없음: 관리자의 정비시간 · 영업시간 · 브레이크 · 일시 예약불가 · 소개 · 사진 변경(업체 관리자만 — 사용자 결정 2026-10-29), 업체 목록(있음).

## Affected Files
| File | Change Type | Description |
|------|-------------|-------------|
| `libs/database/src/entities/store/store.entity.ts` | modify | `booking_open_hours` · `refund_deadline_hours` · `suspend_comment` |
| `libs/database/src/migrations/<ts>-StoreReservationPolicy.ts` · `migrations.ts` | add · modify | `npm run db:generate -- StoreReservationPolicy` — 기존 업체 행은 DB 기본값(72 · 1 · NULL)으로 채워진다 |
| `libs/contracts/src/store/store.commands.ts` | modify | `OPEN` · `MINE_RESERVATION_POLICY` |
| `libs/contracts/src/store/dto/store-open.dto.ts` | add | 관리자 영업중 여부 전환 |
| `libs/contracts/src/store/dto/store-mine-reservation-policy.dto.ts` | add | 예약 · 환불 규정 |
| `libs/contracts/src/store/dto/store-state.dto.ts` | modify | `suspend_comment?` |
| `libs/contracts/src/store/dto/store-detail.dto.ts` · `store-mine.dto.ts` | modify | 결과에 세 필드 |
| `apps/admin-service/src/store/store.constants.ts` | modify | 기본값 상수 2 |
| `apps/admin-service/src/store/store.util.ts` | modify | `toStoreDetail` · `toMineDetail` 에 세 필드 |
| `apps/admin-service/src/store/store.service.ts` | modify | 승인 기본값, `changeStoreState` 정지 사유, `changeStoreOpen` · `changeMyStoreReservationPolicy` |
| `apps/admin-service/src/store/controllers/store.controller.queue.ts` | modify | `@OnCommand` 2 |
| `apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts` | modify | `PATCH /mine/reservation-policy`(매니저 가드 — `/mine…` 묶음 안) · `PATCH /:store_id/open`(관리자 가드 — `/mine/open` 보다 뒤) |
| `apps/admin-service/src/store/test/store-open.spec.ts` · `store-mine-reservation-policy.spec.ts` | add | service 기능 spec |
| `apps/admin-service/src/store/test/{store-state,store-detail,store-mine,store-application-approve}.spec.ts` · `store.repository.spec.ts` | modify | 사유 · 새 필드 · 승인 기본값 · `STORE_SELECT` 스냅샷 |
| `docs/data-layer.md` · `README.md` · `.beaver/output/spec/platform/cache-spec.md` | modify | 규정 컬럼 · README 설명 · 무효화 지점(관리자 영업중 · 규정 · 정지 사유) |

## Code Changes

### 엔티티 · 마이그레이션

```ts
// libs/database/src/entities/store/store.entity.ts — before
    @Column({name: 'maintenance_minutes', type: 'smallint', nullable: false, default: 0, comment: '정비시간(분) — 퇴실 후 다음 이용까지 호실을 막는 시간'})
    maintenance_minutes: number;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제)'})
    is_deleted: number;
```

```ts
// libs/database/src/entities/store/store.entity.ts — after
    @Column({name: 'maintenance_minutes', type: 'smallint', nullable: false, default: 0, comment: '정비시간(분) — 퇴실 후 다음 이용까지 호실을 막는 시간'})
    maintenance_minutes: number;

    @Column({name: 'booking_open_hours', type: 'smallint', nullable: false, default: 72, comment: '예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약을 받는다(1 ~ 4,320)'})
    booking_open_hours: number;

    @Column({
        name: 'refund_deadline_hours',
        type: 'smallint',
        nullable: false,
        default: 1,
        comment: '100% 환불 기준(시간) — 이용 시작 n시간 전까지 환불 신청을 받아 100% 환불, 이후 환불 신청 불가(0 ~ 168). 예약할 때 값을 예약에 저장한다',
    })
    refund_deadline_hours: number;

    @Column({name: 'suspend_comment', type: 'varchar', length: 255, nullable: true, comment: '정지 사유 — 영업중지(SUSPEND)일 때만, 업체 관리자에게 보인다'})
    suspend_comment: string | null;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제)'})
    is_deleted: number;
```

```ts
// libs/database/src/migrations/<ts>-StoreReservationPolicy.ts — after (db:generate 가 만든다 — 기대 내용, 문 순서는 생성 결과를 따른다)
/**
 * 업체 예약 · 환불 규정 · 정지 사유(Phase 11 리비전 261029-1).
 * - t_store.booking_open_hours(기본 72) · refund_deadline_hours(기본 1) — 기존 업체 행은 DB 기본값으로 채워진다
 * - t_store.suspend_comment(정지 사유, NULL)
 */
export class StoreReservationPolicy1793300000000 implements MigrationInterface {
    name = 'StoreReservationPolicy1793300000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_store" ADD "booking_open_hours" smallint NOT NULL DEFAULT '72'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."booking_open_hours" IS '예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약을 받는다(1 ~ 4,320)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "refund_deadline_hours" smallint NOT NULL DEFAULT '1'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."refund_deadline_hours" IS '100% 환불 기준(시간) — 이용 시작 n시간 전까지 환불 신청을 받아 100% 환불, 이후 환불 신청 불가(0 ~ 168). 예약할 때 값을 예약에 저장한다'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "suspend_comment" character varying(255)`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."suspend_comment" IS '정지 사유 — 영업중지(SUSPEND)일 때만, 업체 관리자에게 보인다'`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "suspend_comment"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "refund_deadline_hours"`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "booking_open_hours"`);
    }
}
```

### contracts

```ts
// libs/contracts/src/store/store.commands.ts — after (추가분)
    /** 업체 영업중 여부 변경 (총관리자 · 관리자) */
    OPEN: 'admin.store.open',
    // ...
    /** 내 업체 예약 · 환불 규정 설정 (업체 관리자) */
    MINE_RESERVATION_POLICY: 'admin.store.mine-reservation-policy',
```

```ts
// libs/contracts/src/store/dto/store-open.dto.ts — after (new)
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 영업중 여부 변경 path param (총관리자 · 관리자)
 */
export class StoreOpenParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 영업중 여부 변경 (총관리자 · 관리자) — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님
 */
export class StoreOpenDto {
    @ApiProperty({description: '영업중 여부 (0: 영업중 아님, 1: 영업중)', enum: [0, 1]})
    @IsIn([0, 1], {message: '영업중 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '영업중 여부를 입력해주세요.'})
    is_open: number;
}
```

```ts
// libs/contracts/src/store/dto/store-mine-reservation-policy.dto.ts — after (new)
import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, Max, Min} from 'class-validator';

/**
 * 내 업체 예약 · 환불 규정 — 이용 시작 n시간 전부터 예약을 받고, n시간 전까지만 환불 신청(100% 환불)을 받는다. 예약 · 환불 때의 적용은 예약 기능(Phase 17)
 */
export class StoreMineReservationPolicyDto {
    @ApiProperty({description: '예약 가능 시작 — 이용 시작 n시간 전부터 예약을 받는다 (1 ~ 4,320시간)'})
    @IsInt({message: '예약 가능 시간은 시간 단위 정수로 입력해주세요.'})
    @Min(1, {message: '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'})
    @Max(4320, {message: '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'})
    @IsNotEmpty({message: '예약 가능 시간을 입력해주세요.'})
    booking_open_hours: number;

    @ApiProperty({description: '100% 환불 기준 — 이용 시작 n시간 전까지 환불 신청을 받는다, 이후 환불 불가 (0 ~ 168시간)'})
    @IsInt({message: '환불 기준은 시간 단위 정수로 입력해주세요.'})
    @Min(0, {message: '환불 기준은 0 ~ 168시간 사이로 입력해주세요.'})
    @Max(168, {message: '환불 기준은 0 ~ 168시간 사이로 입력해주세요.'})
    @IsNotEmpty({message: '환불 기준을 입력해주세요.'})
    refund_deadline_hours: number;
}
```

```ts
// libs/contracts/src/store/dto/store-state.dto.ts — before
/**
 * 업체 상태 변경 — 탈퇴(LEAVE)는 되돌릴 수 없고 그 업체 매니저 계정을 정지한다
 */
export class StoreStateDto {
    // store_state_id …
}
```

```ts
// libs/contracts/src/store/dto/store-state.dto.ts — after
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 업체 상태 변경 — 탈퇴(LEAVE)는 되돌릴 수 없고 그 업체 매니저 계정을 정지한다. 영업중지(SUSPEND)면 정지 사유를 남길 수 있다
 */
export class StoreStateDto {
    // store_state_id 그대로

    @ApiProperty({description: '정지 사유 (영업중지로 바꿀 때만 남는다 — 업체 관리자의 내 업체 상세에 보인다, 255자)', required: false})
    @IsOptional()
    @MaxLength(255, {message: '정지 사유는 255자 이내로 입력해주세요.'})
    suspend_comment?: string;
}
```

```ts
// libs/contracts/src/store/dto/store-detail.dto.ts · store-mine.dto.ts — after (maintenance_minutes 다음에 같은 세 필드)
    @ApiProperty({description: '예약 가능 시작(시간) — 이용 시작 n시간 전부터 예약'})
    booking_open_hours: number;

    @ApiProperty({description: '100% 환불 기준(시간) — 이용 시작 n시간 전까지 환불 신청, 이후 환불 불가'})
    refund_deadline_hours: number;

    @ApiProperty({description: '정지 사유 (영업중지일 때만)', nullable: true, type: String})
    suspend_comment: string | null;
```

### store constants · util

```ts
// apps/admin-service/src/store/store.constants.ts — after (추가분)
/** 예약 가능 시작 기본값(시간) — 입점 승인 때 · 기존 업체(DB 기본값) */
export const STORE_BOOKING_OPEN_HOURS_DEFAULT = 72;

/** 100% 환불 기준 기본값(시간) — 입점 승인 때 · 기존 업체(DB 기본값) */
export const STORE_REFUND_DEADLINE_HOURS_DEFAULT = 1;
```

```ts
// apps/admin-service/src/store/store.util.ts — toStoreDetail · toMineDetail, before
        is_open: entity.is_open,
        maintenance_minutes: entity.maintenance_minutes,
```

```ts
// apps/admin-service/src/store/store.util.ts — toStoreDetail · toMineDetail, after
        is_open: entity.is_open,
        maintenance_minutes: entity.maintenance_minutes,
        booking_open_hours: entity.booking_open_hours,
        refund_deadline_hours: entity.refund_deadline_hours,
        suspend_comment: entity.suspend_comment ?? null,
```

### service

```ts
// apps/admin-service/src/store/store.service.ts — approveApplication, before
        store.maintenance_minutes = 0;
        store.is_deleted = 0;
```

```ts
// apps/admin-service/src/store/store.service.ts — approveApplication, after
        store.maintenance_minutes = 0;
        store.booking_open_hours = STORE_BOOKING_OPEN_HOURS_DEFAULT;
        store.refund_deadline_hours = STORE_REFUND_DEADLINE_HOURS_DEFAULT;
        store.suspend_comment = null;
        store.is_deleted = 0;
```

```ts
// apps/admin-service/src/store/store.service.ts — changeStoreState, before
    /**
     * 업체 상태 변경 (총관리자) — 활성 · 영업중지 · 탈퇴. 같은 상태 · 탈퇴 업체는 400. (RabbitMQ: admin.store.state)
     * 탈퇴로 바꾸면 그 업체 매니저 계정을 정지(BLOCK)하고, 사업자번호를 DELETE_<store_id> 로 마스킹(원래 값은 delete_backup)해 같은 번호로 다시 입점 신청할 수 있게 한다.
     * 영업중지는 매니저 계정을 그대로 둔다.
     ...
        // 2. 탈퇴 — 매니저 정지 · 사업자번호 마스킹
        const storeEntity = new StoreEntity();
        storeEntity.store_state_id = dto.store_state_id;
        if (dto.store_state_id === STORE_STATE.LEAVE) {
```

```ts
// apps/admin-service/src/store/store.service.ts — changeStoreState, after
    /**
     * 업체 상태 변경 (총관리자) — 활성 · 영업중지 · 탈퇴. 같은 상태 · 탈퇴 업체는 400. (RabbitMQ: admin.store.state)
     * 탈퇴로 바꾸면 그 업체 매니저 계정을 정지(BLOCK)하고, 사업자번호를 DELETE_<store_id> 로 마스킹(원래 값은 delete_backup)해 같은 번호로 다시 입점 신청할 수 있게 한다.
     * 영업중지는 매니저 계정을 그대로 두고 정지 사유를 남긴다(선택). 활성 · 탈퇴로 바꾸면 정지 사유를 비운다.
     ...
        // 2. 상태 · 정지 사유 — 영업중지일 때만 사유가 남는다
        const storeEntity = new StoreEntity();
        storeEntity.store_state_id = dto.store_state_id;
        storeEntity.suspend_comment = dto.store_state_id === STORE_STATE.SUSPEND ? (dto.suspend_comment ?? null) : null;

        // 3. 탈퇴 — 매니저 정지 · 사업자번호 마스킹
        if (dto.store_state_id === STORE_STATE.LEAVE) {
            // (그대로)
        }

        // 4. 업체 상태
        await this.storeRepository.updateStore({store_id}, storeEntity);
```

```ts
// apps/admin-service/src/store/store.service.ts — after (changeStoreState 다음 · 내 업체 메서드 묶음 끝에 하나씩)
    /**
     * 업체 영업중 여부 변경 (총관리자 · 관리자) — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님. 탈퇴 업체 · 같은 값은 400. (RabbitMQ: admin.store.open)
     *
     * @param store_id 업체 ID
     * @param dto 영업중 여부
     */
    @Transactional()
    async changeStoreOpen(store_id: string, dto: StoreOpenDto): Promise<void> {
        const store = await this.storeRepository.findStore({store_id});
        if (!store) {
            throw new NotFoundException({message: STORE_NOT_FOUND_MESSAGE});
        }
        if (store.store_state_id === STORE_STATE.LEAVE) {
            throw new BadRequestException({message: STORE_LEAVE_LOCKED_MESSAGE});
        }
        if (store.is_open === dto.is_open) {
            throw new BadRequestException({message: STORE_SAME_STATE_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.is_open = dto.is_open;
        await this.storeRepository.updateStore({store_id}, storeEntity);
    }

    /**
     * 내 업체 예약 · 환불 규정 설정 (업체 관리자) — 이용 시작 n시간 전부터 예약, n시간 전까지 환불 신청(100%). 적용은 예약 기능(Phase 17)이 한다. (RabbitMQ: admin.store.mine-reservation-policy)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 예약 가능 시작 · 100% 환불 기준(시간)
     */
    @Transactional()
    async changeMyStoreReservationPolicy(user_id: string, dto: StoreMineReservationPolicyDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.booking_open_hours = dto.booking_open_hours;
        storeEntity.refund_deadline_hours = dto.refund_deadline_hours;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }
```

관리자 영업중 여부 전환은 형제(`changeStoreState` · `updateStore` — 관리자 쓰기, `findStore` · 잠금 없음 · 탈퇴 400)를 따른다. 값 하나를 바꾸는 쓰기라 업체 행 잠금(교체 · 겹침 · 한도용)은 쓰지 않는다.

### controllers

```ts
// apps/admin-service/src/store/controllers/store.controller.queue.ts — after (추가분)
    /**
     * 업체 영업중 여부 변경 — 총관리자 · 관리자
     *
     * @param command 명령 봉투 (payload = path param + 본문)
     */
    @OnCommand(STORE_COMMAND.OPEN)
    async changeStoreOpen(command: MessageEnvelope<StoreOpenParamDto & StoreOpenDto>): Promise<void> {
        return this.storeService.changeStoreOpen(command.payload.store_id, command.payload);
    }

    /**
     * 내 업체 예약 · 환불 규정 설정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_RESERVATION_POLICY)
    async changeMyStoreReservationPolicy(command: MessageEnvelope<StoreMineReservationPolicyDto>): Promise<void> {
        return this.storeService.changeMyStoreReservationPolicy(requireActor(command).user_id, command.payload);
    }
```

```ts
// apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts — after
// (1) /mine… 묶음 안 — changeMyStoreOpen 다음
    /**
     * 내 업체 예약 · 환불 규정 설정 (업체 관리자) — 이용 시작 n시간 전부터 예약, n시간 전까지 100% 환불(이후 환불 불가). done 의 data 는 null.
     */
    @Patch('/mine/reservation-policy')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 예약 · 환불 규정 설정'})
    @ApiBody({type: StoreMineReservationPolicyDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeMyStoreReservationPolicy(@PassportActor() actor: Actor, @Body() dto: StoreMineReservationPolicyDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_RESERVATION_POLICY, actor, payload: dto, client_ip: ip});
    }

// (2) /:store_id/state 다음 — /mine/open 이 앞에 있어 `mine` 이 store_id 로 잡히지 않는다
    /**
     * 업체 영업중 여부 변경 (총관리자 · 관리자) — 같은 값 · 탈퇴 업체는 400. done 의 data 는 null.
     */
    @Patch('/:store_id/open')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 영업중 여부 변경'})
    @ApiBody({type: StoreOpenDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeStoreOpen(@PassportActor() actor: Actor, @Param() param: StoreOpenParamDto, @Body() dto: StoreOpenDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.OPEN, actor, payload: {...param, ...dto}, client_ip: ip});
    }
```

게이트웨이 `StoreController` · `StoreQueueController` 클래스 설명의 라우트 목록에 두 라우트를 더한다(관리자 가드 묶음에 "영업중 여부", 매니저 가드 묶음에 "예약 · 환불 규정").

### 문서 · README · 캐시 표

```md
<!-- docs/data-layer.md — 컬럼 이름 규칙 다음, 정수 기간 컬럼 -->
- 기간 설정값은 단위를 이름 끝에 붙인 정수다 — `maintenance_minutes`(분) · `booking_open_hours` · `refund_deadline_hours`(시간). 업체별 예약 · 환불 규정은 `t_store` 에 두고, 예약할 때의 환불 기준은 예약에 함께 저장한다(Phase 17 — 사용자 결정 2026-10-29).

<!-- README.md — admin-service 설명 -->
… 총관리자의 신청 승인(…) · 반려 · 업체 목록 · 상세 · 수정 · 상태 변경(영업중지 사유) · 영업중 여부 변경, 업체 관리자의 내 업체 설정(상세 · 소개 · 편의시설 · 사진과 순서 · 요일별 영업시간 · 매일 브레이크타임 · 정비시간 · 영업중 여부 · 예약 · 환불 규정 · 일시 예약불가). …

<!-- .beaver/output/spec/platform/cache-spec.md — discovery 무효화 지점 표에 -->
| 관리자 영업중 여부 변경(`changeStoreOpen`) · 정지 사유(`changeStoreState`) | admin-service store (리비전 261029-1) | 영업중 표시 · 상태 | 리비전 |
| 내 업체 예약 · 환불 규정(`changeMyStoreReservationPolicy`) | admin-service store (리비전 261029-1) | 예약 가능 시간 · 환불 규정 | 리비전 |
```

## Test Cases

```
[SUCCESS]  store-open.spec.ts (큐) — findStore({store_id}) → updateStore({store_id}, StoreEntity is_open 1), done null, is_always_open 등 다른 필드 undefined
[FAIL:service]  store-open — it.each: 없는 업체 404 '업체를 찾을 수 없습니다.' · 탈퇴 업체 400 '탈퇴한 업체는 바꿀 수 없습니다.' · 같은 값 400 '이미 같은 상태입니다.' — updateStore 미호출

[SUCCESS]  store-mine-reservation-policy.spec.ts (큐) — findStoreByManager(user_id, true) → updateStore({store_id}, StoreEntity booking_open_hours 24 · refund_deadline_hours 2), done null
[FAIL:service]  store-mine-reservation-policy — 소속 업체 없음 → 404, updateStore 미호출
[FAIL:validation]  store-mine-reservation-policy — validateBody: booking_open_hours 0 → [{property: 'booking_open_hours', message: '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'}] / refund_deadline_hours 169 → refund_deadline_hours / 경계 1 · 4320 · 0 · 168 → null
[SECURITY]  store-mine-reservation-policy — actor 없음 → failed 401

[SUCCESS]  store-state.spec.ts — 영업중지 + 사유 → updateStore 엔티티 suspend_comment '민원 접수' / 사유 없이 영업중지 → null / 영업중지 → 활성 → suspend_comment null / 탈퇴 → null(마스킹 단언 그대로)
[SUCCESS]  store-detail.spec.ts · store-mine.spec.ts — 응답에 booking_open_hours · refund_deadline_hours · suspend_comment(storeRow 기본 72 · 1 · null, 영업중지 행이면 사유)
[SUCCESS]  store-application-approve.spec.ts — insertStore 엔티티 booking_open_hours 72 · refund_deadline_hours 1 · suspend_comment null

[SMOKE:data-access]  store.repository.spec.ts — STORE_SELECT 에 "s"."booking_open_hours" · "s"."refund_deadline_hours" · "s"."suspend_comment"(엔티티 순서대로, build 가 실제 SQL 로 고정) — 업체 목록 · 소속 업체 Smoke 가 같이 쓴다

도우미: storeRow 에 booking_open_hours 72 · refund_deadline_hours 1 · suspend_comment null.
테스트 생략(위임형): 게이트웨이 라우트 · DTO 클래스 — controller spec 은 두지 않는다. 마이그레이션 — db:check · PGlite(기존 행 기본값 채움) 확인.
```

## Decisions
- [x] 관리자가 바꿀 수 있는 운영 설정은 영업중 여부 하나 (사용자 결정 2026-10-29 — "영업 여부만 할 수 있게 하자")
- [x] 업체 목록 · 강제 정지는 Phase 9 그대로, 영업중지 정지 사유를 추가 (사용자 결정 2026-10-29)
- [x] 업체별 예약 가능 시작(n시간 전부터) · 100% 환불 기준(n시간 전까지, 이후 환불 신청 불가 — 50% 구간 없음) (사용자 결정 2026-10-29)
- [x] 기본값 — 환불 1시간 · 예약 72시간 (사용자 결정 2026-10-29)
- [x] 예약할 때의 환불 기준을 예약에 저장(스냅샷) — Phase 17 (사용자 결정 2026-10-29)
- [x] 환불은 신청 뒤 백그라운드에서 토스페이먼츠로 처리 — Phase 17 #66 · 로드맵 공통 규칙 갱신(ship) (사용자 결정 2026-10-29)
- [x] 범위 — 예약 1 ~ 4,320시간(6개월 — 지금 로드맵 상한), 환불 0 ~ 168시간(7일, 0 = 시작 전까지) (Claude 제안 — 검토)
- [x] 정지 사유 — 선택 · 255자, 영업중지일 때만 저장, 활성 · 탈퇴로 바꾸면 비움(형제 업체 관리자 정지 `block_comment` 와 같다). 사유만 바꾸려면 해제 후 다시 정지(같은 상태 400 그대로) (Claude 제안 — 검토)
- [x] 규정 API 하나 `PATCH /mine/reservation-policy`(두 값 함께 필수), 환불 기준 > 예약 가능 시간도 막지 않는다(환불 없는 업체 운영을 허용) (Claude 제안 — 검토)
- [x] 관리자 영업중 여부 전환은 잠금 없이 `findStore`(형제 관리자 쓰기와 같다), 정비시간은 관리자 대상 아님 (Claude 제안 — 검토)
- [x] 로드맵(ship): Phase 11 에 유닛 추가(#99 예약 · 환불 규정 · #100 관리자 영업중 여부 · #101 정지 사유), 공통 규칙 "취소 · 환불" · "사전 예약" 을 업체별 규정으로, Open Decision "취소 규정의 끝"(시작 이후 환불 없음) · "결제 수단"(토스페이먼츠) 해결 표시, Phase 17 #67(환불 util) · #69(예약 생성 — 예약 가능 시작 · 환불 기준 스냅샷) · #70(예약 취소 — "1시간 전 100% · 이후 50%" → 업체 기준까지 100% · 이후 환불 신청 불가, 백그라운드 환불) 메모 (Claude 제안 — 검토)
- [x] 이 리비전은 마이그레이션을 더한다(`StoreReservationPolicy`) — 다른 마이그레이션 Phase(12 · 14 · 16 · 22)와 동시에 돌리지 않는다
