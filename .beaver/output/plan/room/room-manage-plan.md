# Plan — room-manage

## Feature Summary
- **Feature**: 객실 관리(Phase 13) — 업체 관리자가 업체 상품 설정 · 객실 그룹(상세정보 · 사진) · 그룹 상품 · 상품별 기간 가격 · 호실 · 호실 상태를 관리한다(API 21개), 호실 상태 5개로 개편
- **Entry point**: `게이트웨이 /api/v1/admin-service/room/…`(동기 6 · 큐 15, 매니저 가드) → admin-service room 도메인(`/internal/v1/admin-service/room/…` · `admin.room.*`)
- **Domain**: room (로드맵 Phase 13 — #53 · #54 · #55 · #56 · #57 · #103)
- **Spec**: [room-manage-spec.md](../../spec/room/room-manage-spec.md)

---

## File List

| File | Action |
|------|------|
| `libs/contracts/src/room/room.commands.ts` | new — `ROOM_COMMAND` 15개 · `ROOM_INTERNAL_PATH` |
| `libs/contracts/src/room/dto/*.dto.ts` (21개) | new — room-plan-list · room-plan-update · room-group-list · room-group-detail · room-group · room-group-update · room-group-delete · room-group-image-upload-url · room-group-image · room-group-image-order · room-group-image-delete · room-group-plan-update · room-group-plan-price-list · room-group-plan-price · room-group-plan-price-update · room-group-plan-price-delete · room-list · room · room-update · room-delete · room-state |
| `apps/admin-service/src/room/room.module.ts` · `room.symbols.ts` · `room.constants.ts` · `room.util.ts` | new — 도메인 모듈 · DI 토큰 · 상수 · util(`canChangeRoomState` 등) |
| `apps/admin-service/src/room/interfaces/room.repository.interface.ts` · `repositories/room.repository.ts` | new — 포트 · 어댑터(내 업체 · 업체 상품 설정 · 그룹 · 그룹 상품 · 사진 · 기간 가격 · 호실, QueryBuilder 빌더 7개) |
| `apps/admin-service/src/room/room.service.ts` | new — `RoomService` 21개 메서드 |
| `apps/admin-service/src/room/controllers/room.controller.ts` · `room.controller.queue.ts` | new — 내부 HTTP 6 · `@OnCommand` 15 |
| `apps/admin-service/src/admin-service.module.ts` | modified — `RoomModule` 등록 |
| `apps/gateway/src/api/v1/admin-service/room/room.module.ts` · `controllers/room.controller.ts` · `room.controller.queue.ts` | new — 공개 라우트(동기 6 · 큐 15) |
| `apps/gateway/src/gateway.module.ts` | modified — `RoomModule` 등록 |
| `libs/database/src/typeorm-error.ts` | modified — `isExclusionViolation`(23P01) |
| `libs/database/src/seeder/seeder.targets.ts` | modified — `ROOM_STATE_SEED_DATA` 5행(예약가능 · 예약완료 · 사용중 · 정비중 · 사용중지) |
| `libs/database/src/migrations/1793400000000-RoomState.ts` · `migrations.ts` | new · modified — 호실 상태 데이터 마이그레이션(손으로, 스키마 변경 없음) |
| `apps/admin-service/src/room/test/room.test-helper.ts` | new — mock · 부팅 · 행 도우미 |
| `apps/admin-service/src/room/test/*.spec.ts` (service 기능 spec 21개 + `room.repository.spec.ts`) | new |
| `apps/admin-service/src/store/test/store-mine-profile.spec.ts` | modified — Phase 12 단언 고침(값이 있는 키만 비교) |
| `docs/data-layer.md` · `docs/architecture.md` · `AGENTS.md` · `README.md` · `.beaver/output/spec/platform/cache-spec.md` | modified — room 도메인 · `isExclusionViolation` · Smoke 목록 · 호실 상태 · 캐시 무효화 지점 |
| `.beaver/output/roadmap/roomless-roadmap.md` (+ html) | modified(ship) — Phase 13 done, #55 목표(상태 5개 · 정비 완료), 공통 규칙 재고 판정(사용중지 · 예약가능), 지금 할 일 사용자 줄(`RoomState`) |

삭제할 코드: 없음. room 테이블을 다루는 코드가 처음 생긴다. Phase 12 시드의 STANDBY 는 데이터 마이그레이션이 AVAILABLE 로 옮기고 지운다(시드 배열에서도 뺀다).

---

## Design
공용 이름 계약(phase13-contract.md)의 이름을 그대로 쓴다. 아래 코드는 scratch 사본에서 `prettier --check` · `tsc --noEmit -p tsconfig.json` · `oxlint` 통과를 확인했다(코드 블록 첫 줄의 `// <경로> — new|modified` 주석은 표시용 — 파일에는 넣지 않는다).

### Contracts — 규격 상수

`ROOM_COMMAND`(명령 15개 — `admin.room.*`, admin-service `q.admin.cmd` 의 `admin.#` 바인딩 그대로라 큐 · 바인딩 상수는 두지 않는다) · `ROOM_INTERNAL_PATH`(동기 6개 — 파라미터 경로는 `encodeURIComponent` 경로 함수).

```ts
// libs/contracts/src/room/room.commands.ts — new
/** room 내부 HTTP 경로 접두 */
const ROOM_INTERNAL_BASE = '/internal/v1/admin-service/room';

/**
 * room 도메인(객실 관리 — 업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 기간 가격 · 호실) RabbitMQ 명령 종류 (= 라우팅 키, admin-service 의 q.admin.cmd 가 `admin.#` 로 받는다).
 * 모두 업체 관리자(업체 총관리자 · 업체 관리자)의 내 업체 쓰기다. 조회 · 업로드 주소는 내부 HTTP 동기 경로다.
 */
export const ROOM_COMMAND = {
    /** 업체 상품 설정 수정 — 종류별 (업체 관리자) */
    PLAN_UPDATE: 'admin.room.plan-update',
    /** 객실 그룹 등록 — 그룹 상품 3행을 함께 만든다 (업체 관리자) */
    GROUP_CREATE: 'admin.room.group-create',
    /** 객실 그룹 수정 (업체 관리자) */
    GROUP_UPDATE: 'admin.room.group-update',
    /** 객실 그룹 삭제 — 그 그룹의 호실 · 사진도 함께 삭제 (업체 관리자) */
    GROUP_DELETE: 'admin.room.group-delete',
    /** 객실 그룹 사진 등록 (업체 관리자) */
    GROUP_IMAGE: 'admin.room.group-image',
    /** 객실 그룹 사진 순서 변경 (업체 관리자) */
    GROUP_IMAGE_ORDER: 'admin.room.group-image-order',
    /** 객실 그룹 사진 삭제 (업체 관리자) */
    GROUP_IMAGE_DELETE: 'admin.room.group-image-delete',
    /** 그룹 상품 수정 — 종류별 사용 여부 · 기본 요금 (업체 관리자) */
    GROUP_PLAN_UPDATE: 'admin.room.group-plan-update',
    /** 상품별 기간 가격 등록 (업체 관리자) */
    GROUP_PLAN_PRICE: 'admin.room.group-plan-price',
    /** 상품별 기간 가격 수정 (업체 관리자) */
    GROUP_PLAN_PRICE_UPDATE: 'admin.room.group-plan-price-update',
    /** 상품별 기간 가격 삭제 (업체 관리자) */
    GROUP_PLAN_PRICE_DELETE: 'admin.room.group-plan-price-delete',
    /** 호실 등록 (업체 관리자) */
    CREATE: 'admin.room.create',
    /** 호실 수정 — 그룹 이동 포함 (업체 관리자) */
    UPDATE: 'admin.room.update',
    /** 호실 삭제 (업체 관리자) */
    DELETE: 'admin.room.delete',
    /** 호실 상태 변경 — 정비 완료 · 사용중지 · 사용 재개 (업체 관리자) */
    STATE: 'admin.room.state',
} as const;

/**
 * room 도메인 내부 HTTP 경로 (게이트웨이 → admin-service). 파라미터가 있는 경로는 함수로 만든다 — 게이트웨이가 경로 문자열을 이어 붙이지 않는다.
 */
export const ROOM_INTERNAL_PATH = {
    /** 업체 상품 설정 목록 (GET, 업체 관리자) */
    PLAN_LIST: `${ROOM_INTERNAL_BASE}/plan`,
    /** 객실 그룹 목록 (GET, 업체 관리자) */
    GROUP_LIST: `${ROOM_INTERNAL_BASE}/group`,
    /** 객실 그룹 상세 (GET, 업체 관리자) */
    group: (room_group_id: string) => `${ROOM_INTERNAL_BASE}/group/${encodeURIComponent(room_group_id)}`,
    /** 객실 그룹 사진 업로드 주소 (POST, 업체 관리자) */
    groupImageUploadUrl: (room_group_id: string) => `${ROOM_INTERNAL_BASE}/group/${encodeURIComponent(room_group_id)}/image/upload-url`,
    /** 상품별 기간 가격 목록 (GET, 업체 관리자) */
    groupPlanPrices: (room_group_id: string, room_plan_type_id: string) => `${ROOM_INTERNAL_BASE}/group/${encodeURIComponent(room_group_id)}/plan/${encodeURIComponent(room_plan_type_id)}/price`,
    /** 호실 목록 (GET, 업체 관리자) */
    ROOM_LIST: ROOM_INTERNAL_BASE,
} as const;
```

### Input/Validation — DTO

모든 DTO 는 `libs/contracts/src/room/dto/`. 결과의 일시는 형제처럼 ISO 8601 문자열(`created_at` · `updated_at` · `expires_at` — service util 이 `toISOString()`), 없을 수 있는 값은 `T | null` + `{nullable: true, type}`. Query DTO 3종은 `data?: Partial<T>` 생성자 + `super(data)`.

`room-plan-list.dto.ts` — 업체 상품 설정 목록 결과(#1) — `RoomPlanItemResultDto` · `RoomPlanListResultDto`.

```ts
// libs/contracts/src/room/dto/room-plan-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';

/**
 * 업체 상품 설정 1개 — 업체 × 상품 종류. 이용 시간은 시간 이용만, 입실 · 퇴실 시각은 1박 · 연박만 값이 있다
 */
export class RoomPlanItemResultDto {
    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '사용 여부 (0: 팔지 않음, 1: 판매)'})
    is_used: number;

    @ApiProperty({description: '예약 가능 요일 (비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127)'})
    days_of_week: number;

    @ApiProperty({description: '이용 시간(시간) — 시간 이용만, 1박 · 연박은 null', nullable: true, type: Number})
    usage_hours: number | null;

    @ApiProperty({description: '입실 시각 (HH:mm, 한국 시각) — 1박 · 연박(첫날)만, 시간 이용은 null', nullable: true, type: String})
    check_in_time: string | null;

    @ApiProperty({description: '퇴실 시각 (HH:mm, 한국 시각 — 1박은 입실보다 이르면 다음 날, 연박은 마지막 날) — 시간 이용은 null', nullable: true, type: String})
    check_out_time: string | null;
}

/**
 * 업체 상품 설정 목록 — 상품 종류마다 1개(3개)
 */
export class RoomPlanListResultDto {
    @ApiProperty({description: '목록 (HOURLY · NIGHT · LONG 순)', type: () => [RoomPlanItemResultDto]})
    list: RoomPlanItemResultDto[];
}
```

`room-plan-update.dto.ts` — 업체 상품 설정 수정(#2) — 종류는 경로(`IsIn`), 종류별 값(`usage_hours` · `check_in_time` · `check_out_time`)은 선택 필드로 두고 service 가 종류로 가른다.

```ts
// libs/contracts/src/room/dto/room-plan-update.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, Min} from 'class-validator';

/**
 * 업체 상품 설정 수정 path param — 상품 종류
 */
export class RoomPlanUpdateParamDto {
    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 업체 상품 설정 수정 — 종류별. 시간 이용(HOURLY)은 이용 시간 필수 · 시각은 받지 않고, 1박 · 연박은 입실 · 퇴실 시각 필수(서로 달라야 한다) · 이용 시간은 받지 않는다.
 * 종류가 경로라 종류별 값은 선택 필드로 두고 service 가 종류로 가른다(없으면 400 — validation_errors 에 그 필드)
 */
export class RoomPlanUpdateDto {
    @ApiProperty({description: '사용 여부 (0: 팔지 않음, 1: 판매)', enum: [0, 1]})
    @IsIn([0, 1], {message: '사용 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '사용 여부를 입력해주세요.'})
    is_used: number;

    @ApiProperty({description: '예약 가능 요일 (비트 합 1 ~ 127 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127. 팔지 않으려면 is_used 0)'})
    @IsInt({message: '예약 가능 요일은 정수로 입력해주세요.'})
    @Min(1, {message: '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'})
    @Max(127, {message: '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'})
    @IsNotEmpty({message: '예약 가능 요일을 입력해주세요.'})
    days_of_week: number;

    @ApiProperty({description: '이용 시간(시간, 1 ~ 24) — 시간 이용(HOURLY)이면 필수, 1박 · 연박은 받지 않는다', required: false})
    @IsOptional()
    @IsInt({message: '이용 시간은 시간 단위 정수로 입력해주세요.'})
    @Min(1, {message: '이용 시간은 1 ~ 24시간 사이로 입력해주세요.'})
    @Max(24, {message: '이용 시간은 1 ~ 24시간 사이로 입력해주세요.'})
    usage_hours?: number;

    @ApiProperty({description: '입실 시각 (HH:mm, 한국 시각) — 1박 · 연박이면 퇴실 시각과 세트로 필수, 시간 이용은 받지 않는다', required: false})
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '입실 시각을 HH:mm 으로 입력해주세요.'})
    check_in_time?: string;

    @ApiProperty({description: '퇴실 시각 (HH:mm, 한국 시각 — 1박은 입실보다 이르면 다음 날) — 1박 · 연박이면 입실 시각과 세트로 필수(입실과 달라야 한다), 시간 이용은 받지 않는다', required: false})
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '퇴실 시각을 HH:mm 으로 입력해주세요.'})
    check_out_time?: string;
}
```

`room-group-list.dto.ts` — 객실 그룹 목록(#3) — Query DTO(`keyword`) + 결과(`list` · `pagination`).

```ts
// libs/contracts/src/room/dto/room-group-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 객실 그룹 목록 query — 검색어(그룹명 부분 일치). 지워지지 않은 그룹만, 등록일 최신순
 */
export class RoomGroupListDto extends PaginationDto {
    @ApiProperty({description: '검색어 — 그룹명 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 검색어는 null
     */
    constructor(data?: Partial<RoomGroupListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 객실 그룹 목록 항목
 */
export class RoomGroupListItemResultDto {
    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '그룹명'})
    room_group_name: string;

    @ApiProperty({description: '호실 수 (지워지지 않은 호실)'})
    room_count: number;

    @ApiProperty({description: '대표 사진 열람 주소 (CDN — 순서가 가장 앞인 사진) — 사진이 없으면 null', nullable: true, type: String})
    image_url: string | null;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 객실 그룹 목록
 */
export class RoomGroupListResultDto {
    @ApiProperty({description: '목록 (등록일 최신순)', type: () => [RoomGroupListItemResultDto]})
    list: RoomGroupListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

`room-group-detail.dto.ts` — 객실 그룹 상세(#4) — param + 상세정보 · 사진 · 그룹 상품 · 상세 결과.

```ts
// libs/contracts/src/room/dto/room-group-detail.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 상세 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupDetailParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 상세정보 (t_room_group.room_group_detail) — 저장되지 않은 항목도 기본값으로 채워 모두 있다
 */
export class RoomGroupDetailValueResultDto {
    @ApiProperty({description: '객실 안의 방 개수 (원룸 1 · 투룸 2)'})
    room_count: number;

    @ApiProperty({description: '샤워실 유무 (0: 없음, 1: 있음)'})
    has_shower: number;

    @ApiProperty({description: 'TV 유무 (0: 없음, 1: 있음)'})
    has_tv: number;

    @ApiProperty({description: 'PC 유무 (0: 없음, 1: 있음)'})
    has_pc: number;
}

/**
 * 객실 그룹 사진
 */
export class RoomGroupDetailImageResultDto {
    @ApiProperty({description: '객실 그룹 사진 ID'})
    room_group_image_id: string;

    @ApiProperty({description: '원본 파일명'})
    file_name: string;

    @ApiProperty({description: 'MIME 타입'})
    content_type: string;

    @ApiProperty({description: '정렬 순서 (가장 앞이 대표)'})
    sort_order: number;

    @ApiProperty({description: '열람 주소 (CDN 공개 주소)'})
    image_url: string;
}

/**
 * 그룹 상품 — 그룹 × 상품 종류의 사용 여부 · 기본 요금
 */
export class RoomGroupDetailPlanResultDto {
    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '사용 여부 (0: 이 그룹은 팔지 않음, 1: 판매 — 업체 상품 설정도 사용 중이어야 판다)'})
    is_used: number;

    @ApiProperty({description: '기본 요금(원) — 시간 이용 1회 · 1박 · 연박 1박당'})
    price: number;
}

/**
 * 객실 그룹 상세 — 그룹 정보 · 상세정보 · 사진 · 그룹 상품 3개
 */
export class RoomGroupDetailResultDto {
    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '그룹명'})
    room_group_name: string;

    @ApiProperty({description: '설명', nullable: true, type: String})
    description: string | null;

    @ApiProperty({description: '상세정보 (항목 모두)', type: () => RoomGroupDetailValueResultDto})
    room_group_detail: RoomGroupDetailValueResultDto;

    @ApiProperty({description: '사진 (정렬 순서)', type: () => [RoomGroupDetailImageResultDto]})
    images: RoomGroupDetailImageResultDto[];

    @ApiProperty({description: '그룹 상품 (HOURLY · NIGHT · LONG 순)', type: () => [RoomGroupDetailPlanResultDto]})
    plans: RoomGroupDetailPlanResultDto[];

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '수정일시 (ISO 8601)'})
    updated_at: string;
}
```

`room-group.dto.ts` — 객실 그룹 등록(#5) — 선택 중첩 `room_group_detail`(`@IsOptional` → `@Type` → `@ValidateNested`) + 결과 `room_group_id`.

```ts
// libs/contracts/src/room/dto/room-group.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Max, MaxLength, Min, ValidateNested} from 'class-validator';

/**
 * 객실 그룹 등록의 상세정보 — 보낸 알려진 항목만 받고, 빠진 항목은 service 가 지금 기본값으로 채워 전부 저장한다. 선언하지 않은 항목은 버린다
 */
export class RoomGroupDetailInputDto {
    @ApiProperty({description: '객실 안의 방 개수 (1 ~ 20 — 원룸 1 · 투룸 2)', required: false})
    @IsOptional()
    @IsInt({message: '방 개수는 정수로 입력해주세요.'})
    @Min(1, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    @Max(20, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    room_count?: number;

    @ApiProperty({description: '샤워실 유무 (0: 없음, 1: 있음)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: '샤워실 유무가 올바르지 않습니다.'})
    has_shower?: number;

    @ApiProperty({description: 'TV 유무 (0: 없음, 1: 있음)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'TV 유무가 올바르지 않습니다.'})
    has_tv?: number;

    @ApiProperty({description: 'PC 유무 (0: 없음, 1: 있음)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'PC 유무가 올바르지 않습니다.'})
    has_pc?: number;
}

/**
 * 객실 그룹 등록 — 그룹 상품 3개(사용 안 함 · 요금 0)를 함께 만든다. 업체 안 지워지지 않은 그룹명이 같으면 400. 설명은 비우면 null
 */
export class RoomGroupDto {
    @ApiProperty({description: '그룹명 (100자 — 업체 안에서 유일)'})
    @MaxLength(100, {message: '그룹명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '그룹명을 입력해주세요.'})
    room_group_name: string;

    @ApiProperty({description: '설명 (2,000자) — 비우면 null', required: false})
    @IsOptional()
    @MaxLength(2000, {message: '설명은 2,000자 이내로 입력해주세요.'})
    description?: string;

    @ApiProperty({description: '상세정보 — 빠진 항목은 기본값(방 1 · 샤워실 · TV · PC 있음)으로 채워 저장한다, 안 보내면 모두 기본값', required: false, type: () => RoomGroupDetailInputDto})
    @IsOptional()
    @Type(() => RoomGroupDetailInputDto)
    @ValidateNested({message: '상세정보 형식이 올바르지 않습니다.'})
    room_group_detail?: RoomGroupDetailInputDto;
}

/**
 * 객실 그룹 등록 결과
 */
export class RoomGroupResultDto {
    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;
}
```

`room-group-update.dto.ts` — 객실 그룹 수정(#6) — param · 상세정보(독립 선언 `RoomGroupUpdateDetailDto`) · 본문.

```ts
// libs/contracts/src/room/dto/room-group-update.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min, ValidateNested} from 'class-validator';

/**
 * 객실 그룹 수정 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupUpdateParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 수정의 상세정보 — 보낸 알려진 항목만 받고, 빠진 항목은 service 가 지금 기본값으로 채워 통째로 저장한다. 선언하지 않은 항목은 버린다
 */
export class RoomGroupUpdateDetailDto {
    @ApiProperty({description: '객실 안의 방 개수 (1 ~ 20 — 원룸 1 · 투룸 2)', required: false})
    @IsOptional()
    @IsInt({message: '방 개수는 정수로 입력해주세요.'})
    @Min(1, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    @Max(20, {message: '방 개수는 1 ~ 20 사이로 입력해주세요.'})
    room_count?: number;

    @ApiProperty({description: '샤워실 유무 (0: 없음, 1: 있음)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: '샤워실 유무가 올바르지 않습니다.'})
    has_shower?: number;

    @ApiProperty({description: 'TV 유무 (0: 없음, 1: 있음)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'TV 유무가 올바르지 않습니다.'})
    has_tv?: number;

    @ApiProperty({description: 'PC 유무 (0: 없음, 1: 있음)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'PC 유무가 올바르지 않습니다.'})
    has_pc?: number;
}

/**
 * 객실 그룹 수정 — 그룹명 · 설명(비우면 null) · 상세정보(보내면 기본값으로 채워 통째로, 안 보내면 그대로). 업체 안 지워지지 않은 그룹명이 같으면 400
 */
export class RoomGroupUpdateDto {
    @ApiProperty({description: '그룹명 (100자 — 업체 안에서 유일)'})
    @MaxLength(100, {message: '그룹명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '그룹명을 입력해주세요.'})
    room_group_name: string;

    @ApiProperty({description: '설명 (2,000자) — 비우면 null', required: false})
    @IsOptional()
    @MaxLength(2000, {message: '설명은 2,000자 이내로 입력해주세요.'})
    description?: string;

    @ApiProperty({description: '상세정보 — 보내면 빠진 항목을 기본값(방 1 · 샤워실 · TV · PC 있음)으로 채워 통째로 바꾼다, 안 보내면 그대로', required: false, type: () => RoomGroupUpdateDetailDto})
    @IsOptional()
    @Type(() => RoomGroupUpdateDetailDto)
    @ValidateNested({message: '상세정보 형식이 올바르지 않습니다.'})
    room_group_detail?: RoomGroupUpdateDetailDto;
}
```

`room-group-delete.dto.ts` — 객실 그룹 삭제(#7) — param.

```ts
// libs/contracts/src/room/dto/room-group-delete.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 삭제 path param — 내 업체의 지워지지 않은 그룹만(아니면 404). 그 그룹의 호실 · 사진도 함께 지운다
 */
export class RoomGroupDeleteParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}
```

`room-group-image-upload-url.dto.ts` — 그룹 사진 업로드 주소(#8) — param · `content_type` · 결과(`file_key` · `upload_url` · `expires_at`).

```ts
// libs/contracts/src/room/dto/room-group-image-upload-url.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 사진 업로드 주소 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupImageUploadUrlParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 사진 업로드 주소 요청 — 그룹마다 사진 5장까지
 */
export class RoomGroupImageUploadUrlDto {
    @ApiProperty({description: '올릴 사진의 MIME 타입 — 업로드할 때 같은 Content-Type 헤더로 PUT 한다', enum: ['image/jpeg', 'image/png']})
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 객실 그룹 사진 업로드 주소 — 이 주소로 PUT 한 뒤 file_key 로 사진을 등록한다
 */
export class RoomGroupImageUploadUrlResultDto {
    @ApiProperty({description: '저장 키 — 사진 등록 때 보낸다'})
    file_key: string;

    @ApiProperty({description: '업로드 주소 (PUT, 10분 유효)'})
    upload_url: string;

    @ApiProperty({description: '업로드 주소 만료일시 (ISO 8601)'})
    expires_at: string;
}
```

`room-group-image.dto.ts` — 그룹 사진 등록(#9) — param · 본문(`file_key` · `file_name` · `content_type`) · 결과 `room_group_image_id`.

```ts
// libs/contracts/src/room/dto/room-group-image.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 객실 그룹 사진 등록 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupImageParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 사진 등록 — 업로드 주소로 올린 사진의 키를 그룹에 붙인다(마지막 순서)
 */
export class RoomGroupImageDto {
    @ApiProperty({description: '저장 키 — 업로드 주소 응답의 file_key'})
    @MaxLength(255, {message: '저장 키가 올바르지 않습니다.'})
    @IsNotEmpty({message: '저장 키를 입력해주세요.'})
    file_key: string;

    @ApiProperty({description: '원본 파일명'})
    @MaxLength(255, {message: '파일명은 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '파일명을 입력해주세요.'})
    file_name: string;

    @ApiProperty({description: 'MIME 타입 — 업로드 주소를 받을 때와 같다', enum: ['image/jpeg', 'image/png']})
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 객실 그룹 사진 등록 결과
 */
export class RoomGroupImageResultDto {
    @ApiProperty({description: '객실 그룹 사진 ID'})
    room_group_image_id: string;
}
```

`room-group-image-order.dto.ts` — 그룹 사진 순서(#10) — param · `room_group_image_ids`(배열 · 5개 · 각 32자 hex — 형제 `StoreMineFileOrderDto` 순서).

```ts
// libs/contracts/src/room/dto/room-group-image-order.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {ArrayMaxSize, IsArray, IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 사진 순서 변경 path param — 내 업체의 지워지지 않은 그룹만(아니면 404)
 */
export class RoomGroupImageOrderParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;
}

/**
 * 객실 그룹 사진 순서 변경 — 지금 그룹 사진 ID 전부를 원하는 순서로(가장 앞이 대표)
 */
export class RoomGroupImageOrderDto {
    @ApiProperty({description: '그룹 사진 ID 전부를 원하는 순서로 — 빠지거나 남거나 겹치면 400', type: [String]})
    @Matches(/^[a-f0-9]{32}$/, {each: true, message: '사진 ID가 올바르지 않습니다.'})
    @ArrayMaxSize(5, {message: '객실 그룹 사진은 5장까지입니다.'})
    @IsArray({message: '사진 ID를 배열로 입력해주세요.'})
    @IsNotEmpty({message: '사진 ID를 입력해주세요.'})
    room_group_image_ids: string[];
}
```

`room-group-image-delete.dto.ts` — 그룹 사진 삭제(#11) — param 2개.

```ts
// libs/contracts/src/room/dto/room-group-image-delete.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 객실 그룹 사진 삭제 path param — 내 업체 그룹의 지워지지 않은 사진만(아니면 404)
 */
export class RoomGroupImageDeleteParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    @ApiProperty({description: '객실 그룹 사진 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '사진 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '사진 ID를 입력해주세요.'})
    room_group_image_id: string;
}
```

`room-group-plan-update.dto.ts` — 그룹 상품 수정(#12) — param(그룹 · 종류) · `is_used` · `price`(0 ~ 10,000,000 — 판매면 1원 이상은 service).

```ts
// libs/contracts/src/room/dto/room-group-plan-update.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, Matches, Max, Min} from 'class-validator';

/**
 * 그룹 상품 수정 path param — 내 업체의 지워지지 않은 그룹 × 상품 종류
 */
export class RoomGroupPlanUpdateParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 그룹 상품 수정 — 사용 여부 · 기본 요금. 판매(is_used 1)인데 요금이 0 이면 400
 */
export class RoomGroupPlanUpdateDto {
    @ApiProperty({description: '사용 여부 (0: 이 그룹은 팔지 않음, 1: 판매 — 업체 상품 설정도 사용 중이어야 판다)', enum: [0, 1]})
    @IsIn([0, 1], {message: '사용 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '사용 여부를 입력해주세요.'})
    is_used: number;

    @ApiProperty({description: '기본 요금(원, 0 ~ 10,000,000 — 판매면 1원 이상) — 시간 이용 1회 · 1박 · 연박 1박당'})
    @IsInt({message: '요금은 원 단위 정수로 입력해주세요.'})
    @Min(0, {message: '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'})
    @Max(10000000, {message: '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'})
    @IsNotEmpty({message: '요금을 입력해주세요.'})
    price: number;
}
```

`room-group-plan-price-list.dto.ts` — 기간 가격 목록(#13) — param · Query DTO(페이지만) · 결과.

```ts
// libs/contracts/src/room/dto/room-group-plan-price-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 상품별 기간 가격 목록 path param — 내 업체의 지워지지 않은 그룹 × 상품 종류
 */
export class RoomGroupPlanPriceListParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 상품별 기간 가격 목록 query — 페이지만. 지워지지 않은 기간만, 시작 날짜 순
 */
export class RoomGroupPlanPriceListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<RoomGroupPlanPriceListDto>) {
        super(data);
    }
}

/**
 * 상품별 기간 가격 목록 항목
 */
export class RoomGroupPlanPriceItemResultDto {
    @ApiProperty({description: '기간 가격 ID'})
    room_group_plan_price_id: string;

    @ApiProperty({description: '시작 날짜 (YYYY-MM-DD, 한국 날짜 — 포함)'})
    start_date: string;

    @ApiProperty({description: '종료 날짜 (YYYY-MM-DD, 한국 날짜 — 포함)'})
    end_date: string;

    @ApiProperty({description: '이 기간의 요금(원) — 기본 요금 대신'})
    price: number;

    @ApiProperty({description: '메모 (예: 여름 성수기)', nullable: true, type: String})
    memo: string | null;
}

/**
 * 상품별 기간 가격 목록
 */
export class RoomGroupPlanPriceListResultDto {
    @ApiProperty({description: '목록 (시작 날짜 순)', type: () => [RoomGroupPlanPriceItemResultDto]})
    list: RoomGroupPlanPriceItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

`room-group-plan-price.dto.ts` — 기간 가격 등록(#14) — param · 본문(`YYYY-MM-DD` 형식만 — 없는 날짜 · 종료 ≥ 시작은 service dayjs strict) · 결과.

```ts
// libs/contracts/src/room/dto/room-group-plan-price.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 상품별 기간 가격 등록 path param — 내 업체의 지워지지 않은 그룹 × 상품 종류
 */
export class RoomGroupPlanPriceParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 상품별 기간 가격 등록 — 시작 ~ 종료 날짜(둘 다 포함) 동안 기본 요금 대신 쓴다. 같은 상품의 다른 기간과 날짜가 겹치면 400. 메모는 비우면 null
 */
export class RoomGroupPlanPriceDto {
    @ApiProperty({description: '시작 날짜 (YYYY-MM-DD, 한국 날짜 — 포함)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '시작 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '시작 날짜를 입력해주세요.'})
    start_date: string;

    @ApiProperty({description: '종료 날짜 (YYYY-MM-DD, 한국 날짜 — 포함, 시작 날짜와 같거나 늦다)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '종료 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '종료 날짜를 입력해주세요.'})
    end_date: string;

    @ApiProperty({description: '이 기간의 요금(원, 1 ~ 10,000,000) — 기본 요금 대신'})
    @IsInt({message: '기간 요금은 원 단위 정수로 입력해주세요.'})
    @Min(1, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @Max(10000000, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @IsNotEmpty({message: '기간 요금을 입력해주세요.'})
    price: number;

    @ApiProperty({description: '메모 (30자 — 예: 여름 성수기)', required: false})
    @IsOptional()
    @MaxLength(30, {message: '메모는 30자 이내로 입력해주세요.'})
    memo?: string;
}

/**
 * 상품별 기간 가격 등록 결과
 */
export class RoomGroupPlanPriceResultDto {
    @ApiProperty({description: '기간 가격 ID'})
    room_group_plan_price_id: string;
}
```

`room-group-plan-price-update.dto.ts` — 기간 가격 수정(#15) — param 3개 · 본문(등록과 같은 4 필드, 독립 선언).

```ts
// libs/contracts/src/room/dto/room-group-plan-price-update.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 상품별 기간 가격 수정 path param — 내 업체 그룹 상품의 지워지지 않은 기간 가격만(아니면 404)
 */
export class RoomGroupPlanPriceUpdateParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    @ApiProperty({description: '기간 가격 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '기간 가격 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '기간 가격 ID를 입력해주세요.'})
    room_group_plan_price_id: string;
}

/**
 * 상품별 기간 가격 수정 — 등록과 같은 필드를 통째로. 같은 상품의 다른 기간(자기 자신 제외)과 날짜가 겹치면 400. 메모는 비우면 null
 */
export class RoomGroupPlanPriceUpdateDto {
    @ApiProperty({description: '시작 날짜 (YYYY-MM-DD, 한국 날짜 — 포함)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '시작 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '시작 날짜를 입력해주세요.'})
    start_date: string;

    @ApiProperty({description: '종료 날짜 (YYYY-MM-DD, 한국 날짜 — 포함, 시작 날짜와 같거나 늦다)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '종료 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '종료 날짜를 입력해주세요.'})
    end_date: string;

    @ApiProperty({description: '이 기간의 요금(원, 1 ~ 10,000,000) — 기본 요금 대신'})
    @IsInt({message: '기간 요금은 원 단위 정수로 입력해주세요.'})
    @Min(1, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @Max(10000000, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @IsNotEmpty({message: '기간 요금을 입력해주세요.'})
    price: number;

    @ApiProperty({description: '메모 (30자 — 예: 여름 성수기)', required: false})
    @IsOptional()
    @MaxLength(30, {message: '메모는 30자 이내로 입력해주세요.'})
    memo?: string;
}
```

`room-group-plan-price-delete.dto.ts` — 기간 가격 삭제(#16) — param 3개.

```ts
// libs/contracts/src/room/dto/room-group-plan-price-delete.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 상품별 기간 가격 삭제 path param — 내 업체 그룹 상품의 지워지지 않은 기간 가격만(아니면 404)
 */
export class RoomGroupPlanPriceDeleteParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    @ApiProperty({description: '기간 가격 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '기간 가격 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '기간 가격 ID를 입력해주세요.'})
    room_group_plan_price_id: string;
}
```

`room-list.dto.ts` — 호실 목록(#17) — Query DTO(`floor` 정수 문자열 · `room_group_id`) + 결과.

```ts
// libs/contracts/src/room/dto/room-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsOptional, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 호실 목록 query — 층 · 객실 그룹 필터. 지워지지 않은 호실만, 층 · 호실명 순
 */
export class RoomListDto extends PaginationDto {
    @ApiProperty({description: '층 (정수 — 지하는 음수, B1 = -1) — 없으면 전체', required: false})
    @IsOptional()
    @Matches(/^-?\d{1,3}$/, {message: '층을 정수로 입력해주세요.'})
    floor: string | null;

    @ApiProperty({description: '객실 그룹 ID — 없으면 전체', required: false})
    @IsOptional()
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    room_group_id: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<RoomListDto>) {
        super(data);
        this.floor = data?.floor ?? null;
        this.room_group_id = data?.room_group_id ?? null;
    }
}

/**
 * 호실 목록 항목
 */
export class RoomListItemResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '객실 그룹 ID'})
    room_group_id: string;

    @ApiProperty({description: '그룹명'})
    room_group_name: string;

    @ApiProperty({description: '호실명 (예: 101호)'})
    room_name: string;

    @ApiProperty({description: '층 (지하는 음수, B1 = -1)'})
    floor: number;

    @ApiProperty({description: '호실 상태 (AVAILABLE: 예약가능, RESERVED: 예약완료, IN_USE: 사용중, MAINTENANCE: 정비중, DISABLED: 사용중지)'})
    room_state_id: string;

    @ApiProperty({description: '호실 상태명'})
    room_state_name: string;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 호실 목록
 */
export class RoomListResultDto {
    @ApiProperty({description: '목록 (층 · 호실명 순)', type: () => [RoomListItemResultDto]})
    list: RoomListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

`room.dto.ts` — 호실 등록(#18) — `room_group_id` · `room_name` · `floor` + 결과 `room_id`.

```ts
// libs/contracts/src/room/dto/room.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 호실 등록 — 내 업체의 지워지지 않은 그룹에(없으면 404), 상태는 예약가능. 업체 안 지워지지 않은 호실명이 같으면 400
 */
export class RoomDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

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

/**
 * 호실 등록 결과
 */
export class RoomResultDto {
    @ApiProperty({description: '호실 ID'})
    room_id: string;
}
```

`room-update.dto.ts` — 호실 수정(#19) — param · 본문(등록과 같은 3 필드, 독립 선언).

```ts
// libs/contracts/src/room/dto/room-update.dto.ts — new
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
 * 호실 수정 — 등록과 같은 필드를 통째로(그룹 이동 포함 — 내 업체의 지워지지 않은 그룹만, 없으면 404). 업체 안 지워지지 않은 호실명이 같으면 400
 */
export class RoomUpdateDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

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

`room-delete.dto.ts` — 호실 삭제(#20) — param.

```ts
// libs/contracts/src/room/dto/room-delete.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 삭제 path param — 내 업체의 지워지지 않은 호실만(아니면 404)
 */
export class RoomDeleteParamDto {
    @ApiProperty({description: '호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}
```

`room-state.dto.ts` — 호실 상태 변경(#21) — param · `room_state_id`(`AVAILABLE` · `DISABLED` 만 — 전환 표는 service `canChangeRoomState`).

```ts
// libs/contracts/src/room/dto/room-state.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 상태 변경 path param — 내 업체의 지워지지 않은 호실만(아니면 404)
 */
export class RoomStateParamDto {
    @ApiProperty({description: '호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}

/**
 * 호실 상태 변경 — 업체 관리자는 정비 완료(정비중 → 예약가능) · 사용중지(예약가능 · 정비중 → 사용중지) · 사용 재개(사용중지 → 예약가능)만 바꾼다. 그 밖의 전환은 400
 */
export class RoomStateDto {
    @ApiProperty({description: '바꿀 상태 (AVAILABLE: 예약가능 — 정비 완료 · 사용 재개, DISABLED: 사용중지)', enum: ['AVAILABLE', 'DISABLED']})
    @IsIn(['AVAILABLE', 'DISABLED'], {message: '바꿀 수 있는 호실 상태가 아닙니다.'})
    @IsNotEmpty({message: '호실 상태를 입력해주세요.'})
    room_state_id: string;
}
```

### Entry Point — 게이트웨이

`RoomModule` — controllers `[RoomController, RoomQueueController]`(동기 → 큐 순).

```ts
// apps/gateway/src/api/v1/admin-service/room/room.module.ts — new
import {Module} from '@nestjs/common';
import {RoomController} from './controllers/room.controller.js';
import {RoomQueueController} from './controllers/room.controller.queue.js';

/**
 * 게이트웨이 객실 관리 라우트 — `/api/v1/admin-service/room`(매니저 가드 — 업체 총관리자 · 업체 관리자, 내 업체만). 전달 수단(TransportModule)은 전역이다.
 * - RoomController(controllers/room.controller.ts): 동기 경로 — 업체 상품 설정 · 객실 그룹 · 기간 가격 · 호실 조회, 그룹 사진 업로드 주소
 * - RoomQueueController(controllers/room.controller.queue.ts): 큐 경로 — 업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 기간 가격 · 호실 쓰기 · 호실 상태
 */
@Module({controllers: [RoomController, RoomQueueController]})
export class RoomModule {}
```

`RoomController` — 동기 6개(`InternalHttpClient` 만, 매니저 가드 · `@ApiBearerAuth()`). Query DTO 는 `const dto = new X(query)` 후 `query: dto`, 경로는 `ROOM_INTERNAL_PATH`.

```ts
// apps/gateway/src/api/v1/admin-service/room/controllers/room.controller.ts — new
import {Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
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
import {RoomGroupDetailParamDto, RoomGroupDetailResultDto} from '@app/contracts/room/dto/room-group-detail.dto.js';
import {RoomGroupImageUploadUrlDto, RoomGroupImageUploadUrlParamDto, RoomGroupImageUploadUrlResultDto} from '@app/contracts/room/dto/room-group-image-upload-url.dto.js';
import {RoomGroupListDto, RoomGroupListResultDto} from '@app/contracts/room/dto/room-group-list.dto.js';
import {RoomGroupPlanPriceListDto, RoomGroupPlanPriceListParamDto, RoomGroupPlanPriceListResultDto} from '@app/contracts/room/dto/room-group-plan-price-list.dto.js';
import {RoomListDto, RoomListResultDto} from '@app/contracts/room/dto/room-list.dto.js';
import {RoomPlanListResultDto} from '@app/contracts/room/dto/room-plan-list.dto.js';
import {ROOM_INTERNAL_PATH} from '@app/contracts/room/room.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 객실 관리 공개 API — 동기 경로(내부 HTTP → admin-service room 도메인). 조회 · 그룹 사진 업로드 주소.
 * 모두 매니저 가드(업체 총관리자 · 업체 관리자)이고 내 업체만 다룬다. 정적 경로(`/plan` · `/group…`)를 매개변수 경로보다 먼저 선언한다.
 * 큐 경로(업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 기간 가격 · 호실 쓰기 · 호실 상태)는 같은 경로 접두의 room.controller.queue.ts(RoomQueueController)에 둔다.
 */
@ApiTags('객실 관리')
@Controller('/api/v1/admin-service/room')
export class RoomController {
    /**
     * @param internalHttp 동기 경로 — admin-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 업체 상품 설정 목록 (업체 관리자) — 시간 이용 · 1박 · 연박 3개, 사용 여부 · 예약 가능 요일 · 이용 시간 · 입실 · 퇴실 시각
     */
    @Get('/plan')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 상품 설정 목록'})
    @ApiOkResponse({type: RoomPlanListResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRoomPlans(@PassportActor() actor: Actor): Promise<RoomPlanListResultDto> {
        return this.internalHttp.request<RoomPlanListResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.PLAN_LIST, {actor});
    }

    /**
     * 객실 그룹 목록 (업체 관리자) — 그룹명 검색, 호실 수 · 대표 사진, 등록일 최신순
     */
    @Get('/group')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 목록'})
    @ApiOkResponse({type: RoomGroupListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRoomGroups(@PassportActor() actor: Actor, @Query() query: RoomGroupListDto): Promise<RoomGroupListResultDto> {
        const dto = new RoomGroupListDto(query);
        return this.internalHttp.request<RoomGroupListResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.GROUP_LIST, {actor, query: dto});
    }

    /**
     * 객실 그룹 상세 (업체 관리자) — 그룹 정보 · 상세정보 · 사진 열람 주소 · 그룹 상품 3개, 남의 업체 그룹은 404
     */
    @Get('/group/:room_group_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 상세'})
    @ApiOkResponse({type: RoomGroupDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRoomGroup(@PassportActor() actor: Actor, @Param() param: RoomGroupDetailParamDto): Promise<RoomGroupDetailResultDto> {
        return this.internalHttp.request<RoomGroupDetailResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.group(param.room_group_id), {actor});
    }

    /**
     * 객실 그룹 사진 업로드 주소 (업체 관리자) — 그룹마다 5장까지, 받은 주소로 같은 Content-Type 헤더로 PUT 한 뒤 file_key 로 사진을 등록한다
     */
    @Post('/group/:room_group_id/image/upload-url')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 사진 업로드 주소'})
    @ApiBody({type: RoomGroupImageUploadUrlDto})
    @ApiOkResponse({type: RoomGroupImageUploadUrlResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyRoomGroupImageUploadUrl(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupImageUploadUrlParamDto,
        @Body() dto: RoomGroupImageUploadUrlDto,
    ): Promise<RoomGroupImageUploadUrlResultDto> {
        return this.internalHttp.request<RoomGroupImageUploadUrlResultDto>('admin', 'POST', ROOM_INTERNAL_PATH.groupImageUploadUrl(param.room_group_id), {actor, body: dto});
    }

    /**
     * 상품별 기간 가격 목록 (업체 관리자) — 그룹 × 상품 종류의 지워지지 않은 기간, 시작 날짜 순
     */
    @Get('/group/:room_group_id/plan/:room_plan_type_id/price')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '상품별 기간 가격 목록'})
    @ApiOkResponse({type: RoomGroupPlanPriceListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRoomGroupPlanPrices(@PassportActor() actor: Actor, @Param() param: RoomGroupPlanPriceListParamDto, @Query() query: RoomGroupPlanPriceListDto): Promise<RoomGroupPlanPriceListResultDto> {
        const dto = new RoomGroupPlanPriceListDto(query);
        return this.internalHttp.request<RoomGroupPlanPriceListResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.groupPlanPrices(param.room_group_id, param.room_plan_type_id), {actor, query: dto});
    }

    /**
     * 호실 목록 (업체 관리자) — 층 · 객실 그룹 필터, 그룹명 · 상태명 포함, 층 · 호실명 순
     */
    @Get('/')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 목록'})
    @ApiOkResponse({type: RoomListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyRooms(@PassportActor() actor: Actor, @Query() query: RoomListDto): Promise<RoomListResultDto> {
        const dto = new RoomListDto(query);
        return this.internalHttp.request<RoomListResultDto>('admin', 'GET', ROOM_INTERNAL_PATH.ROOM_LIST, {actor, query: dto});
    }
}
```

`RoomQueueController` — 큐 15개(`CommandStreamService` 만). param + 본문은 `payload: {...param, ...dto}`, param 만이면 `payload: param`. 정적 경로(`/plan…` · `/group…`)를 `/:room_id` 보다 먼저, 결과가 있는 4개(그룹 등록 · 사진 등록 · 기간 가격 등록 · 호실 등록)만 `@ApiOkResponse`.

```ts
// apps/gateway/src/api/v1/admin-service/room/controllers/room.controller.queue.ts — new
import {Body, Controller, Delete, Ip, Param, Patch, Post, Put, Res, UseGuards} from '@nestjs/common';
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
import {RoomDeleteParamDto} from '@app/contracts/room/dto/room-delete.dto.js';
import {RoomGroupDeleteParamDto} from '@app/contracts/room/dto/room-group-delete.dto.js';
import {RoomGroupImageDeleteParamDto} from '@app/contracts/room/dto/room-group-image-delete.dto.js';
import {RoomGroupImageOrderDto, RoomGroupImageOrderParamDto} from '@app/contracts/room/dto/room-group-image-order.dto.js';
import {RoomGroupImageDto, RoomGroupImageParamDto, RoomGroupImageResultDto} from '@app/contracts/room/dto/room-group-image.dto.js';
import {RoomGroupPlanPriceDeleteParamDto} from '@app/contracts/room/dto/room-group-plan-price-delete.dto.js';
import {RoomGroupPlanPriceUpdateDto, RoomGroupPlanPriceUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-price-update.dto.js';
import {RoomGroupPlanPriceDto, RoomGroupPlanPriceParamDto, RoomGroupPlanPriceResultDto} from '@app/contracts/room/dto/room-group-plan-price.dto.js';
import {RoomGroupPlanUpdateDto, RoomGroupPlanUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-update.dto.js';
import {RoomGroupUpdateDto, RoomGroupUpdateParamDto} from '@app/contracts/room/dto/room-group-update.dto.js';
import {RoomGroupDto, RoomGroupResultDto} from '@app/contracts/room/dto/room-group.dto.js';
import {RoomPlanUpdateDto, RoomPlanUpdateParamDto} from '@app/contracts/room/dto/room-plan-update.dto.js';
import {RoomStateDto, RoomStateParamDto} from '@app/contracts/room/dto/room-state.dto.js';
import {RoomUpdateDto, RoomUpdateParamDto} from '@app/contracts/room/dto/room-update.dto.js';
import {RoomDto, RoomResultDto} from '@app/contracts/room/dto/room.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 객실 관리 공개 API — 큐 경로(RabbitMQ `admin.room.*` → admin-service + 요청 단위 SSE).
 * 모두 매니저 가드(업체 총관리자 · 업체 관리자)이고 내 업체만 다룬다. path param 은 payload 에 합쳐 보낸다.
 * 정적 경로(`/plan…` · `/group…`)를 `/:room_id` 보다 먼저 선언한다. 동기 경로(조회 · 그룹 사진 업로드 주소)는 같은 경로 접두의 room.controller.ts(RoomController)에 둔다.
 */
@ApiTags('객실 관리')
@Controller('/api/v1/admin-service/room')
export class RoomQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 업체 상품 설정 수정 (업체 관리자) — 종류별, 시간 이용은 이용 시간 · 1박 · 연박은 입실 · 퇴실 시각. done 의 data 는 null.
     */
    @Patch('/plan/:room_plan_type_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 상품 설정 수정'})
    @ApiBody({type: RoomPlanUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoomPlan(@PassportActor() actor: Actor, @Param() param: RoomPlanUpdateParamDto, @Body() dto: RoomPlanUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.PLAN_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 객실 그룹 등록 (업체 관리자) — 그룹명 · 설명 · 상세정보, 그룹 상품 3개(사용 안 함 · 요금 0)를 함께 만든다. done 의 data 는 객실 그룹 ID.
     */
    @Post('/group')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 등록'})
    @ApiBody({type: RoomGroupDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: RoomGroupResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyRoomGroup(@PassportActor() actor: Actor, @Body() dto: RoomGroupDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_CREATE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 객실 그룹 수정 (업체 관리자) — 그룹명 · 설명 · 상세정보(보내면 통째로, 안 보내면 그대로). done 의 data 는 null.
     */
    @Patch('/group/:room_group_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 수정'})
    @ApiBody({type: RoomGroupUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoomGroup(@PassportActor() actor: Actor, @Param() param: RoomGroupUpdateParamDto, @Body() dto: RoomGroupUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 객실 그룹 삭제 (업체 관리자) — 그 그룹의 호실 · 사진도 함께 지운다(사진 파일은 저장소에서도 삭제). done 의 data 는 null.
     */
    @Delete('/group/:room_group_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteMyRoomGroup(@PassportActor() actor: Actor, @Param() param: RoomGroupDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 객실 그룹 사진 등록 (업체 관리자) — 업로드 주소로 올린 사진의 키, 마지막 순서. done 의 data 는 객실 그룹 사진 ID.
     */
    @Post('/group/:room_group_id/image')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 사진 등록'})
    @ApiBody({type: RoomGroupImageDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: RoomGroupImageResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyRoomGroupImage(@PassportActor() actor: Actor, @Param() param: RoomGroupImageParamDto, @Body() dto: RoomGroupImageDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_IMAGE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 객실 그룹 사진 순서 변경 (업체 관리자) — 그룹 사진 ID 전부를 원하는 순서로(가장 앞이 대표). done 의 data 는 null.
     */
    @Put('/group/:room_group_id/image/order')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 사진 순서 변경'})
    @ApiBody({type: RoomGroupImageOrderDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async reorderMyRoomGroupImages(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupImageOrderParamDto,
        @Body() dto: RoomGroupImageOrderDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_IMAGE_ORDER, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 객실 그룹 사진 삭제 (업체 관리자) — 그 그룹의 사진, 사진 파일은 저장소에서도 삭제. done 의 data 는 null.
     */
    @Delete('/group/:room_group_id/image/:room_group_image_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '객실 그룹 사진 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteMyRoomGroupImage(@PassportActor() actor: Actor, @Param() param: RoomGroupImageDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 그룹 상품 수정 (업체 관리자) — 그룹 × 상품 종류의 사용 여부 · 기본 요금, 판매인데 요금 0 이면 400. done 의 data 는 null.
     */
    @Patch('/group/:room_group_id/plan/:room_plan_type_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '그룹 상품 수정'})
    @ApiBody({type: RoomGroupPlanUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoomGroupPlan(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupPlanUpdateParamDto,
        @Body() dto: RoomGroupPlanUpdateDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 상품별 기간 가격 등록 (업체 관리자) — 시작 ~ 종료 날짜(둘 다 포함) · 요금 · 메모, 같은 상품의 다른 기간과 겹치면 400. done 의 data 는 기간 가격 ID.
     */
    @Post('/group/:room_group_id/plan/:room_plan_type_id/price')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '상품별 기간 가격 등록'})
    @ApiBody({type: RoomGroupPlanPriceDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: RoomGroupPlanPriceResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyRoomGroupPlanPrice(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupPlanPriceParamDto,
        @Body() dto: RoomGroupPlanPriceDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 상품별 기간 가격 수정 (업체 관리자) — 등록과 같은 필드를 통째로, 같은 상품의 다른 기간(자기 자신 제외)과 겹치면 400. done 의 data 는 null.
     */
    @Patch('/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '상품별 기간 가격 수정'})
    @ApiBody({type: RoomGroupPlanPriceUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoomGroupPlanPrice(
        @PassportActor() actor: Actor,
        @Param() param: RoomGroupPlanPriceUpdateParamDto,
        @Body() dto: RoomGroupPlanPriceUpdateDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 상품별 기간 가격 삭제 (업체 관리자) — 그 그룹 상품의 기간 가격만. done 의 data 는 null.
     */
    @Delete('/group/:room_group_id/plan/:room_plan_type_id/price/:room_group_plan_price_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '상품별 기간 가격 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteMyRoomGroupPlanPrice(@PassportActor() actor: Actor, @Param() param: RoomGroupPlanPriceDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 호실 등록 (업체 관리자) — 그룹 · 호실명 · 층, 상태는 예약가능. done 의 data 는 호실 ID.
     */
    @Post('/')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 등록'})
    @ApiBody({type: RoomDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: RoomResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyRoom(@PassportActor() actor: Actor, @Body() dto: RoomDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.CREATE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 호실 수정 (업체 관리자) — 그룹(이동 포함) · 호실명 · 층 통째로. done 의 data 는 null.
     */
    @Patch('/:room_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 수정'})
    @ApiBody({type: RoomUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyRoom(@PassportActor() actor: Actor, @Param() param: RoomUpdateParamDto, @Body() dto: RoomUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 호실 삭제 (업체 관리자). done 의 data 는 null.
     */
    @Delete('/:room_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteMyRoom(@PassportActor() actor: Actor, @Param() param: RoomDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 호실 상태 변경 (업체 관리자) — 정비 완료(정비중 → 예약가능) · 사용중지 · 사용 재개만, 그 밖의 전환은 400. done 의 data 는 null.
     */
    @Patch('/:room_id/state')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '호실 상태 변경'})
    @ApiBody({type: RoomStateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeMyRoomState(@PassportActor() actor: Actor, @Param() param: RoomStateParamDto, @Body() dto: RoomStateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ROOM_COMMAND.STATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }
}
```

게이트웨이 루트 모듈 — `RoomModule` import · `imports` 끝에 등록 · JSDoc 라우트 목록에 추가(3줄 변경, 전체 파일).

```ts
// apps/gateway/src/gateway.module.ts — modified
import {Module} from '@nestjs/common';
import {MessagingModule} from '@app/messaging/messaging.module.js';
import {PassportJwtAuthModule} from './guards/passport.jwt.auth/passport.jwt.auth.module.js';
import {TransportModule} from './modules/transport/transport.module.js';
import {AdminModule} from './api/v1/admin-service/admin/admin.module.js';
import {ManagerModule} from './api/v1/admin-service/manager/manager.module.js';
import {RoomModule} from './api/v1/admin-service/room/room.module.js';
import {StoreModule} from './api/v1/admin-service/store/store.module.js';
import {UserModule} from './api/v1/user-service/user/user.module.js';

/**
 * 게이트웨이 루트 모듈 — 유일한 외부 진입점.
 * DB 를 쓰지 않는다. 회원 상태 확인도 user-service 내부 HTTP 로 묻는다.
 * - MessagingModule.forGateway: 명령 발행 + 인스턴스 전용 결과 큐
 * - TransportModule: 동기(내부 HTTP) · 큐(RabbitMQ + SSE) 전달 수단
 * - PassportJwtAuthModule: JWT 전략 (guards/)
 * - 로그인 그룹별 라우트: UserModule(/api/v1/user-service/user) · ManagerModule(/api/v1/admin-service/manager) · AdminModule(/api/v1/admin-service/admin) · StoreModule(/api/v1/admin-service/store — 이용자 · 관리자 가드) · RoomModule(/api/v1/admin-service/room — 매니저 가드)
 */
@Module({imports: [MessagingModule.forGateway(), TransportModule, PassportJwtAuthModule, UserModule, ManagerModule, AdminModule, StoreModule, RoomModule]})
export class GatewayModule {}
```
### Data Access — 시드 · 데이터 마이그레이션

호실 상태를 5개(예약가능 `AVAILABLE` · 예약완료 `RESERVED` · 사용중 `IN_USE` · 정비중 `MAINTENANCE` · 사용중지 `DISABLED`)로 바꾼다. 엔티티 · 스키마는 그대로라 `db:generate` 대상이 아니고, 기존 DB 의 데이터는 손으로 쓴 데이터 마이그레이션 `RoomState` 가 맞춘다(`db:check` 는 그대로 통과 — PGlite 로 확인).

- 시드(`ROOM_STATE_SEED_DATA`)는 PK 가 없는 행만 넣고 이름은 고치지 않는다(`pickMissingRows`). 그래서 기존 DB 의 STANDBY 정리 · 이름 변경(IN_USE 이용중 → 사용중)은 마이그레이션이 하고, 새 DB 는 마이그레이션이 AVAILABLE · RESERVED 를 넣은 뒤 시드가 나머지 3행을 새 이름으로 넣는다.
- `FK_Room_RoomState` 가 `ON DELETE CASCADE` 라 상태 행을 지우기 전에 호실을 먼저 옮긴다(옮기지 않으면 호실 행이 지워진다). up: AVAILABLE · RESERVED 추가(`ON CONFLICT DO NOTHING`) → 호실 STANDBY → AVAILABLE → STANDBY 행 삭제 → 이름 3개 정리. down 은 반대(이름 되돌림 → STANDBY 추가 → AVAILABLE · RESERVED 호실을 STANDBY 로 → 두 행 삭제 — 예약완료 구분은 되돌리면 사라진다).
- 호실의 `updated_at` 은 건드리지 않는다(상태 코드 이름 변경이지 관리자가 바꾼 것이 아니다). 이름 표는 `RenameColumns` 처럼 파일 상수 배열 `NAMES` 로 두고 up/down 이 같은 표를 앞 · 뒤로 쓴다(값은 `$1` · `$2` 파라미터).
- 타임스탬프 `1793400000000`(직전 `1793386485207` 보다 크다), 클래스 `RoomState1793400000000`. `migrations.ts` 는 import 한 줄 + `MIGRATIONS` 한 줄 배열 끝에 추가(한 줄 형식 유지 — 이 파일은 원래도 prettier 200자를 넘는다, migrations 폴더만 `.prettierignore`).

```ts
// libs/database/src/seeder/seeder.targets.ts — modified (ROOM_STATE_SEED_DATA 블록만 교체 — 나머지 · SEED_TARGETS 순서 그대로)
/**
 * 호실 상태(t_room_state) 기본 데이터 — admin-service room.constants.ts 의 ROOM_STATE 와 같다. 사용중지(DISABLED) 호실은 예약을 받지 않는다.
 * 예약 → 예약완료 · 체크인 → 사용중 · 체크아웃 → 정비중 · 정비 완료(업체 관리자) → 예약가능. 기존 DB 의 STANDBY 정리 · 이름은 마이그레이션 RoomState 가 맞춘다(시드는 PK 가 있으면 건너뛴다)
 */
export const ROOM_STATE_SEED_DATA: RoomStateEntity[] = [
    {room_state_id: 'AVAILABLE', room_state_name: '예약가능'},
    {room_state_id: 'RESERVED', room_state_name: '예약완료'},
    {room_state_id: 'IN_USE', room_state_name: '사용중'},
    {room_state_id: 'MAINTENANCE', room_state_name: '정비중'},
    {room_state_id: 'DISABLED', room_state_name: '사용중지'},
];
```

```ts
// libs/database/src/migrations/1793400000000-RoomState.ts — new
import type {MigrationInterface, QueryRunner} from 'typeorm';

/** 이름을 바꾸는 호실 상태 — [상태 ID, 지금 이름, 바꿀 이름] (MAINTENANCE · DISABLED 는 이름이 같지만 5개 상태의 이름을 한 곳에서 맞춘다) */
const NAMES: [string, string, string][] = [
    ['IN_USE', '이용중', '사용중'],
    ['MAINTENANCE', '정비중', '정비중'],
    ['DISABLED', '사용중지', '사용중지'],
];

/**
 * 호실 상태 5개로 개편 (로드맵 Phase 13 #55) — 데이터만 바꾼다(엔티티 · 스키마 변경 없음 — db:check 그대로, 그래서 손으로 쓴 마이그레이션이다).
 * - 예약가능(AVAILABLE) · 예약완료(RESERVED) 추가, 스탠바이(STANDBY) 호실은 예약가능으로 옮긴 뒤 STANDBY 행 삭제
 * - 이름 정리 — IN_USE 이용중 → 사용중 · MAINTENANCE 정비중 · DISABLED 사용중지
 * FK_Room_RoomState 가 ON DELETE CASCADE 라 상태 행을 지우기 전에 호실을 먼저 옮긴다(옮기지 않으면 호실이 지워진다).
 * 시드(ROOM_STATE_SEED_DATA)는 PK 가 없는 행만 넣고 이름을 고치지 않으므로, 기존 DB 의 이름 · STANDBY 정리는 여기서 한다. 호실의 수정일은 바꾸지 않는다(상태 코드 이름 변경이다).
 */
export class RoomState1793400000000 implements MigrationInterface {
    name = 'RoomState1793400000000';

    /**
     * 적용 — 새 상태 추가 → 호실 STANDBY → AVAILABLE → STANDBY 행 삭제 → 이름 정리
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`INSERT INTO "t_room_state" ("room_state_id", "room_state_name") VALUES ('AVAILABLE', '예약가능'), ('RESERVED', '예약완료') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`UPDATE "t_room" SET "room_state_id" = 'AVAILABLE' WHERE "room_state_id" = 'STANDBY'`);
        await queryRunner.query(`DELETE FROM "t_room_state" WHERE "room_state_id" = 'STANDBY'`);
        for (const [room_state_id, , to] of NAMES) {
            await queryRunner.query(`UPDATE "t_room_state" SET "room_state_name" = $1 WHERE "room_state_id" = $2`, [to, room_state_id]);
        }
    }

    /**
     * 되돌리기 — 이름 되돌림 → STANDBY 추가 → 예약가능 · 예약완료 호실을 STANDBY 로 → AVAILABLE · RESERVED 행 삭제.
     * 예약완료 호실도 스탠바이로 옮긴다(예전 상태에는 예약완료가 없다 — 되돌리면 그 구분은 사라진다).
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        for (const [room_state_id, from] of [...NAMES].reverse()) {
            await queryRunner.query(`UPDATE "t_room_state" SET "room_state_name" = $1 WHERE "room_state_id" = $2`, [from, room_state_id]);
        }
        await queryRunner.query(`INSERT INTO "t_room_state" ("room_state_id", "room_state_name") VALUES ('STANDBY', '스탠바이') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`UPDATE "t_room" SET "room_state_id" = 'STANDBY' WHERE "room_state_id" IN ('AVAILABLE', 'RESERVED')`);
        await queryRunner.query(`DELETE FROM "t_room_state" WHERE "room_state_id" IN ('AVAILABLE', 'RESERVED')`);
    }
}
```

```ts
// libs/database/src/migrations.ts — modified (import 한 줄 + 배열 끝 `RoomState1793400000000` — 파일 전체)
import {Init1791903600000} from './migrations/1791903600000-Init.js';
import {RenameColumns1792477492198} from './migrations/1792477492198-RenameColumns.js';
import {SmsVerification1792477679219} from './migrations/1792477679219-SmsVerification.js';
import {LoginScopeStoreDetail1792682222497} from './migrations/1792682222497-LoginScopeStoreDetail.js';
import {StoreSchema1792780576432} from './migrations/1792780576432-StoreSchema.js';
import {StoreFile1792953783038} from './migrations/1792953783038-StoreFile.js';
import {StoreCodeManagerScope1793027933626} from './migrations/1793027933626-StoreCodeManagerScope.js';
import {StoreOperation1793037973399} from './migrations/1793037973399-StoreOperation.js';
import {StoreReservationPolicy1793260428802} from './migrations/1793260428802-StoreReservationPolicy.js';
import {RoomSchema1793386485207} from './migrations/1793386485207-RoomSchema.js';
import {RoomState1793400000000} from './migrations/1793400000000-RoomState.js';

/**
 * DataSource 에 등록할 마이그레이션 목록 (실행 순서 = 클래스명 끝의 타임스탬프 순).
 * ESM 에서는 glob 경로 로딩 대신 명시 목록을 쓴다. 새 마이그레이션은 여기에 한 줄 추가한다.
 */
export const MIGRATIONS = [Init1791903600000, RenameColumns1792477492198, SmsVerification1792477679219, LoginScopeStoreDetail1792682222497, StoreSchema1792780576432, StoreFile1792953783038, StoreCodeManagerScope1793027933626, StoreOperation1793037973399, StoreReservationPolicy1793260428802, RoomSchema1793386485207, RoomState1793400000000];
```

### Data Access — typeorm-error

`isExclusionViolation(error, constraint)` 를 `isUniqueViolation` 옆에 같은 모양으로 더한다(PostgreSQL 23P01 — 배타 제약 위반, `driverError.constraint` 가 제약명). 파일 머리 오류 코드 주석에 23P01 을 더한다.

```ts
// libs/database/src/typeorm-error.ts — modified (파일 전체)
import {QueryFailedError} from 'typeorm';

/** PostgreSQL 오류 코드 — 23505: UNIQUE 위반, 23503: FOREIGN KEY 위반, 23P01: EXCLUDE(배타 제약) 위반 */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_EXCLUSION_VIOLATION = '23P01';

/**
 * TypeORM 오류에서 PostgreSQL 드라이버 오류(code · constraint)를 꺼낸다.
 *
 * @param error catch 로 잡은 값
 * @returns 드라이버 오류 또는 null
 */
function driverErrorOf(error: unknown): {code?: string; constraint?: string} | null {
    if (!(error instanceof QueryFailedError)) return null;
    return (error.driverError as {code?: string; constraint?: string} | undefined) ?? null;
}

/**
 * 특정 UK 제약 위반인지 — repository 의 "제약명별 if 분기" 에 쓴다.
 *
 * @param error catch 로 잡은 값
 * @param constraint 제약명 (예: 'UK_User_LoginId')
 * @returns 해당 UK 위반이면 true
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
    const driverError = driverErrorOf(error);
    return driverError?.code === PG_UNIQUE_VIOLATION && driverError.constraint === constraint;
}

/**
 * 특정 FK 제약 위반인지 — repository 의 "제약명별 if 분기" 에 쓴다.
 *
 * @param error catch 로 잡은 값
 * @param constraint 제약명 (예: 'FK_User_Auth')
 * @returns 해당 FK 위반이면 true
 */
export function isForeignKeyViolation(error: unknown, constraint: string): boolean {
    const driverError = driverErrorOf(error);
    return driverError?.code === PG_FOREIGN_KEY_VIOLATION && driverError.constraint === constraint;
}

/**
 * 특정 배타 제약(EXC_ — 범위 겹침) 위반인지 — repository 의 "제약명별 if 분기" 에 쓴다.
 *
 * @param error catch 로 잡은 값
 * @param constraint 제약명 (예: 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange')
 * @returns 해당 배타 제약 위반이면 true
 */
export function isExclusionViolation(error: unknown, constraint: string): boolean {
    const driverError = driverErrorOf(error);
    return driverError?.code === PG_EXCLUSION_VIOLATION && driverError.constraint === constraint;
}
```

### Data Access — 도메인 상수 · util

- `room.constants.ts` — 계약 §2 의 상수 · 메시지 그대로 + service 섹션 계약 추가분(`ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE` · `ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE` · `ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE`). 계약에 없던 내부 상수 2개를 더했다(다른 섹션은 참조하지 않는다): `ROOM_STATE_TRANSITIONS`(전환 표 — AGENTS "도메인 값 상수는 constants" · `canChangeRoomState` 가 쓴다) · `ROOM_STORE_STATE_LEAVE = 'LEAVE'`(room 은 store.constants 의 `STORE_STATE` 를 import 할 수 없다 — `buildManagerStoreQuery` 가 쓴다).
- `ROOM_PLAN_TYPE_ORDER` 는 `string[]` 로 둔다(`as const` 면 `indexOf(row.room_plan_type_id: string)` 가 타입 오류).
- `room.util.ts` — 계약 §2 함수 전부 + 계약 추가분 `isSameTimeOfDay`. 날짜 · 시각은 `@app/common/utils/dayjs.js` 만(`isValidDate` strict · `toTimeOfDay` · `isSameTimeOfDay` 기준일 위 dayjs · raw 행 `created_at` → `dayjs(x).toISOString()` — raw select 의 timestamptz 는 `Date` 로 온다, PGlite 확인). 저장 키는 store.util 과 같은 `randomUUID` 32자 + 파일 전용 접두 헬퍼 `roomGroupImagePrefix`(export 안 함 — util 파일 허용).
- `buildRoomGroupDetail(dto?: … | null)` — 입력 자체 · 항목이 `undefined` · `null` 이면 보내지 않은 것과 같다(contracts 섹션 추가분), 알려진 4항목만 남기고 기본값으로 채운다(선언 안 된 키는 버린다). `toRoomGroupDetail` 도 이 함수로 상세정보를 4항목으로 맞춘다(@AfterLoad 를 거치지 않은 엔티티 · 지난 항목이 남은 JSON 도 같은 모양).
- `buildPlanPriceOverlapWhere` — `{room_group_plan_id, start_date: LessThanOrEqual(end_date), end_date: MoreThanOrEqual(start_date)}` + 수정이면 `room_group_plan_price_id: Not(exclude_id)`(키 순서 = SQL 파라미터 순서). 날짜 두 끝 포함이라 하루만 겹쳐도 겹침, 바로 다음 날은 겹침 아님(PGlite 확인).
- 변환 함수의 숫자 컬럼은 형제처럼 `Number(...)` 로 감싼다(raw 의 smallint · integer 는 이미 number — PGlite 확인, 방어). 기간 가격 `start_date` · `end_date` 는 엔티티 date 컬럼 값 그대로(TypeORM 이 `'YYYY-MM-DD'` 문자열로 hydrate — PGlite 확인).

```ts
// apps/admin-service/src/room/room.symbols.ts — new
/** room repository 포트 토큰 — 구현: RoomRepository */
export const ROOM_REPOSITORY = Symbol('RoomRepositoryInterface');
```

```ts
// apps/admin-service/src/room/room.constants.ts — new
import type {RoomGroupDetail} from '@app/database/entities/room/room-group.entity.js';

/**
 * 호실 상태 — t_room_state PK (seeder.targets.ts 의 ROOM_STATE_SEED_DATA 와 같다).
 * 예약 → 예약완료(Phase 17) · 체크인 → 사용중 · 체크아웃 → 정비중(Phase 19) · 정비 완료 → 예약가능(업체 관리자), 사용중지는 업체 관리자가 켜고 끈다.
 */
export const ROOM_STATE = {AVAILABLE: 'AVAILABLE', RESERVED: 'RESERVED', IN_USE: 'IN_USE', MAINTENANCE: 'MAINTENANCE', DISABLED: 'DISABLED'} as const;

/** 업체 관리자가 바꿀 수 있는 호실 상태 전환 [지금 상태, 바꿀 상태] — 정비 완료 · 사용중지 · 사용 재개 (canChangeRoomState) */
export const ROOM_STATE_TRANSITIONS: [string, string][] = [
    [ROOM_STATE.MAINTENANCE, ROOM_STATE.AVAILABLE],
    [ROOM_STATE.AVAILABLE, ROOM_STATE.DISABLED],
    [ROOM_STATE.MAINTENANCE, ROOM_STATE.DISABLED],
    [ROOM_STATE.DISABLED, ROOM_STATE.AVAILABLE],
];

/** 상품 종류 — t_room_plan_type PK (seeder.targets.ts 의 ROOM_PLAN_TYPE_SEED_DATA 와 같다) */
export const ROOM_PLAN_TYPE = {HOURLY: 'HOURLY', NIGHT: 'NIGHT', LONG: 'LONG'} as const;

/** 상품 종류 순서 — 시간 이용 · 1박 · 연박 (업체 상품 설정 목록 · 그룹 상세의 그룹 상품 · 그룹 등록 때 만드는 그룹 상품 3행) */
export const ROOM_PLAN_TYPE_ORDER: string[] = [ROOM_PLAN_TYPE.HOURLY, ROOM_PLAN_TYPE.NIGHT, ROOM_PLAN_TYPE.LONG];

/** 그룹 사진 한도 — 그룹 1개 기준 */
export const ROOM_GROUP_IMAGE_LIMIT = 5;

/** 객실 그룹 상세정보의 알려진 항목 — 입력에서 이 항목만 남긴다(선언 안 된 키는 버린다). 항목을 더하면 RoomGroupDetail · ROOM_GROUP_DETAIL_DEFAULTS 와 함께 고친다 */
export const ROOM_GROUP_DETAIL_KEYS: (keyof RoomGroupDetail)[] = ['room_count', 'has_shower', 'has_tv', 'has_pc'];

/** 그룹 사진 MIME 타입 → 확장자 */
export const ROOM_IMAGE_EXTENSION: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png'};

/** 기간 가격 날짜 입력 형식 — 한국 날짜 (dayjs 형식 문자열) */
export const ROOM_DATE_FORMAT = 'YYYY-MM-DD';

/** 탈퇴 업체 상태 — t_store_state PK. 매니저의 소속 업체에서 뺀다(store 도메인 상수는 import 하지 않는다) */
export const ROOM_STORE_STATE_LEAVE = 'LEAVE';

/** 매니저의 소속 업체 없음 — 탈퇴 업체 · 지운 업체 포함 (모든 객실 관리 API) */
export const ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';

/** 객실 그룹 없음 — 남의 업체 그룹 · 지운 그룹 포함 */
export const ROOM_GROUP_NOT_FOUND_MESSAGE = '객실 그룹을 찾을 수 없습니다.';

/** 호실 없음 — 남의 업체 호실 · 지운 호실 포함 */
export const ROOM_NOT_FOUND_MESSAGE = '호실을 찾을 수 없습니다.';

/** 그룹명 중복 — 같은 업체의 지워지지 않은 그룹 (repository — UK_RoomGroup_StoreIdRoomGroupName) */
export const ROOM_GROUP_NAME_TAKEN_MESSAGE = '이미 있는 그룹명입니다.';

/** 호실명 중복 — 같은 업체의 지워지지 않은 호실 (repository — UK_Room_StoreIdRoomName) */
export const ROOM_NAME_TAKEN_MESSAGE = '이미 있는 호실명입니다.';

/** 그룹 사진 없음 — 다른 그룹 사진 · 지운 사진 포함 (사진 삭제 · 순서) */
export const ROOM_GROUP_IMAGE_NOT_FOUND_MESSAGE = '사진을 찾을 수 없습니다.';

/** 그룹 사진 한도 초과 (업로드 주소 · 사진 등록) */
export const ROOM_GROUP_IMAGE_LIMIT_MESSAGE = '올릴 수 있는 사진 수를 넘었습니다.';

/** 같은 저장 키로 다시 등록 (repository — UK_RoomGroupImage_FileKey) */
export const ROOM_GROUP_IMAGE_TAKEN_MESSAGE = '이미 등록된 사진입니다.';

/** 업로드 주소로 발급하지 않은 저장 키 (그룹 사진 등록) */
export const ROOM_FILE_KEY_INVALID_MESSAGE = '업로드 주소로 받은 저장 키가 아닙니다.';

/** 저장소에 아직 파일이 없다 (그룹 사진 등록) */
export const ROOM_FILE_NOT_UPLOADED_MESSAGE = '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.';

/** 업체 상품 설정 · 그룹 상품 없음 — 종류마다 행이 늘 있으므로 보통은 생기지 않는다 */
export const ROOM_PLAN_NOT_FOUND_MESSAGE = '상품 설정을 찾을 수 없습니다.';

/** 기간 가격 없음 — 다른 그룹 상품의 기간 가격 · 지운 기간 가격 포함 */
export const ROOM_PLAN_PRICE_NOT_FOUND_MESSAGE = '기간 가격을 찾을 수 없습니다.';

/** 기간 가격 겹침 — 같은 그룹 상품의 지워지지 않은 다른 기간과 날짜가 겹친다 (service 선검사 · repository — EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange) */
export const ROOM_PLAN_PRICE_OVERLAP_MESSAGE = '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.';

/** 기간 가격 시작 날짜가 없는 날짜 — 2026-02-30 등 (validation_errors.start_date) */
export const ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE = '없는 시작 날짜입니다.';

/** 기간 가격 종료 날짜가 없는 날짜 (validation_errors.end_date) */
export const ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE = '없는 종료 날짜입니다.';

/** 기간 가격 종료 날짜가 시작 날짜보다 이르다 (validation_errors.end_date) */
export const ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE = '종료 날짜는 시작 날짜보다 빠를 수 없습니다.';

/** 업체 관리자가 바꿀 수 없는 호실 상태 전환 (canChangeRoomState 가 false) */
export const ROOM_STATE_CHANGE_INVALID_MESSAGE = '지금 상태에서는 바꿀 수 없습니다.';
```

```ts
// apps/admin-service/src/room/room.util.ts — new
import {randomUUID} from 'node:crypto';
import {LessThanOrEqual, MoreThanOrEqual, Not} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {dayjs} from '@app/common/utils/dayjs.js';
import type {RoomGroupDetailImageResultDto, RoomGroupDetailPlanResultDto, RoomGroupDetailResultDto} from '@app/contracts/room/dto/room-group-detail.dto.js';
import type {RoomGroupListItemResultDto} from '@app/contracts/room/dto/room-group-list.dto.js';
import type {RoomGroupPlanPriceItemResultDto} from '@app/contracts/room/dto/room-group-plan-price-list.dto.js';
import type {RoomListItemResultDto} from '@app/contracts/room/dto/room-list.dto.js';
import type {RoomPlanItemResultDto} from '@app/contracts/room/dto/room-plan-list.dto.js';
import type {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {ROOM_GROUP_DETAIL_DEFAULTS} from '@app/database/entities/room/room-group.entity.js';
import type {RoomGroupDetail, RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {RoomGroupPlanRow, RoomGroupRow, RoomPlanRow, RoomRow} from './interfaces/room.repository.interface.js';
import {ROOM_DATE_FORMAT, ROOM_GROUP_DETAIL_KEYS, ROOM_IMAGE_EXTENSION, ROOM_PLAN_TYPE_ORDER, ROOM_STATE_TRANSITIONS} from './room.constants.js';

/**
 * 업체 관리자가 호실 상태를 바꿀 수 있는지 — 정비중 → 예약가능(정비 완료) · 예약가능 / 정비중 → 사용중지 · 사용중지 → 예약가능(사용 재개)만.
 * 그 밖(예약완료 · 사용중에서, 예약완료 · 사용중 · 정비중으로, 같은 상태로, 모르는 상태)은 false.
 *
 * @param from 지금 상태 (t_room.room_state_id)
 * @param to 바꿀 상태
 * @returns 바꿀 수 있으면 true
 */
export function canChangeRoomState(from: string, to: string): boolean {
    return ROOM_STATE_TRANSITIONS.some(([allowedFrom, allowedTo]) => allowedFrom === from && allowedTo === to);
}

/**
 * 저장할 객실 그룹 상세정보 — 알려진 항목(ROOM_GROUP_DETAIL_KEYS) 중 값이 있는 것만 남기고, 빠진 항목은 지금 기본값(ROOM_GROUP_DETAIL_DEFAULTS)으로 채워 전부 만든다.
 * 선언 안 된 키는 버린다(ValidationPipe whitelist 꺼짐 · 큐 경로는 다시 검증하지 않는다). 입력 · 항목이 null 이면 보내지 않은 것과 같다.
 *
 * @param dto 상세정보 입력 (없거나 null 이면 기본값 그대로)
 * @returns 상세정보 (항목 모두)
 */
export function buildRoomGroupDetail(dto?: Partial<Record<keyof RoomGroupDetail, number | null>> | null): RoomGroupDetail {
    const detail: Record<keyof RoomGroupDetail, number> = {...ROOM_GROUP_DETAIL_DEFAULTS};
    for (const key of ROOM_GROUP_DETAIL_KEYS) {
        const value = dto?.[key];
        if (value !== undefined && value !== null) {
            detail[key] = value;
        }
    }
    return detail as RoomGroupDetail;
}

/**
 * 그룹 사진 저장 키 접두 — 공개(CDN 은 store/ 접두만 읽는다).
 *
 * @param store_id 업체 ID
 * @param room_group_id 객실 그룹 ID
 * @returns 접두 (끝에 / 없음)
 */
function roomGroupImagePrefix(store_id: string, room_group_id: string): string {
    return `store/${store_id}/room-group/${room_group_id}`;
}

/**
 * 그룹 사진 저장 키 — `store/<store_id>/room-group/<room_group_id>/<uuid 32자>.<jpg|png>`. 업로드마다 새 키다(같은 키를 덮어쓰지 않는다 — CDN 캐시).
 *
 * @param store_id 업체 ID
 * @param room_group_id 객실 그룹 ID
 * @param content_type MIME 타입 (image/jpeg · image/png)
 * @returns 저장 키
 */
export function buildRoomGroupImageKey(store_id: string, room_group_id: string, content_type: string): string {
    return `${roomGroupImagePrefix(store_id, room_group_id)}/${randomUUID().replace(/-/g, '')}.${ROOM_IMAGE_EXTENSION[content_type]}`;
}

/**
 * 등록하려는 키가 그 업체 · 그룹 · 형식으로 발급한 키 모양(`<접두>/<uuid 32자>.<확장자>`)인지 — 다른 업체 · 그룹의 키나 다른 접두를 막는다.
 *
 * @param file_key 등록하려는 키
 * @param store_id 업체 ID
 * @param room_group_id 객실 그룹 ID
 * @param content_type MIME 타입
 * @returns 맞으면 true
 */
export function isRoomGroupImageKey(file_key: string, store_id: string, room_group_id: string, content_type: string): boolean {
    const prefix = roomGroupImagePrefix(store_id, room_group_id);
    const extension = ROOM_IMAGE_EXTENSION[content_type];
    return Boolean(extension) && file_key.startsWith(`${prefix}/`) && new RegExp(`^[a-f0-9]{32}\\.${extension}$`).test(file_key.slice(prefix.length + 1));
}

/**
 * 새 그룹 사진의 정렬 순서 — 지금 사진의 가장 큰 순서 + 1, 없으면 0. 삭제로 빈 번호가 있어도 마지막에 붙는다.
 *
 * @param images 지금 그룹 사진 (지워지지 않은 것)
 * @returns 정렬 순서
 */
export function nextSortOrder(images: {sort_order: number}[]): number {
    return images.length > 0 ? Math.max(...images.map((image) => Number(image.sort_order))) + 1 : 0;
}

/**
 * 받은 ID 목록이 지금 ID 전부를 빠짐 · 남음 · 겹침 없이 담았는지 (순서 무관).
 *
 * @param ids 받은 ID 목록
 * @param current 지금 ID 목록
 * @returns 같은 집합이면 true
 */
export function isSameIdSet(ids: string[], current: string[]): boolean {
    return ids.length === current.length && new Set(ids).size === ids.length && ids.every((id) => current.includes(id));
}

/**
 * 상품 종류 순서(시간 이용 · 1박 · 연박 — ROOM_PLAN_TYPE_ORDER)로 정렬한 새 배열 — 모르는 종류는 맨 뒤.
 *
 * @param rows 상품 종류 ID 가 있는 행
 * @returns 정렬한 새 배열 (원본은 그대로)
 */
export function sortByPlanType<T extends {room_plan_type_id: string}>(rows: T[]): T[] {
    const rank = (row: T): number => {
        const index = ROOM_PLAN_TYPE_ORDER.indexOf(row.room_plan_type_id);
        return index === -1 ? ROOM_PLAN_TYPE_ORDER.length : index;
    };
    return [...rows].sort((a, b) => rank(a) - rank(b));
}

/**
 * 있는 날짜인지 — 'YYYY-MM-DD' strict 파싱(2026-02-30 · 13월은 false).
 *
 * @param value 날짜 문자열
 * @returns 있는 날짜면 true
 */
export function isValidDate(value: string): boolean {
    return dayjs(value, ROOM_DATE_FORMAT, true).isValid();
}

/**
 * 기간 가격 겹침 WHERE — 같은 그룹 상품의 다른 기간 중 시작 ≤ 새 종료 그리고 종료 ≥ 새 시작(시작 · 종료 날짜 둘 다 포함 — 하루만 겹쳐도 겹침). 수정이면 자기 자신은 뺀다.
 *
 * @param room_group_plan_id 그룹 상품 ID
 * @param start_date 새 시작 날짜 'YYYY-MM-DD'
 * @param end_date 새 종료 날짜 'YYYY-MM-DD'
 * @param exclude_id 수정하는 기간 가격 ID (등록이면 null)
 * @returns WHERE
 */
export function buildPlanPriceOverlapWhere(room_group_plan_id: string, start_date: string, end_date: string, exclude_id: string | null): FindOptionsWhere<RoomGroupPlanPriceEntity> {
    const where: FindOptionsWhere<RoomGroupPlanPriceEntity> = {room_group_plan_id, start_date: LessThanOrEqual(end_date), end_date: MoreThanOrEqual(start_date)};
    return exclude_id ? {...where, room_group_plan_price_id: Not(exclude_id)} : where;
}

/**
 * time 컬럼 값('HH:mm:ss')을 'HH:mm' 으로 — 기준일(2000-01-01, UTC) 위의 dayjs 로 바꿔 형식만 맞춘다(서버 시간대와 무관).
 *
 * @param value 하루 안 시각 또는 null
 * @returns 'HH:mm' 또는 null
 */
export function toTimeOfDay(value: string | null): string | null {
    return value ? dayjs.utc(`2000-01-01 ${value}`).format('HH:mm') : null;
}

/**
 * 하루 안 시각 두 개가 같은지 — 'HH:mm' · 'HH:mm:ss' 를 섞어도 된다(기준일 2000-01-01, UTC 위의 dayjs 로 비교 — 서버 시간대와 무관).
 *
 * @param a 하루 안 시각
 * @param b 하루 안 시각
 * @returns 같으면 true
 */
export function isSameTimeOfDay(a: string, b: string): boolean {
    return dayjs.utc(`2000-01-01 ${a}`).isSame(dayjs.utc(`2000-01-01 ${b}`));
}

/**
 * 업체 상품 설정 항목.
 *
 * @param row 업체 상품 설정 행
 * @returns 항목 (시각은 'HH:mm' 또는 null)
 */
export function toRoomPlanItem(row: RoomPlanRow): RoomPlanItemResultDto {
    return {
        room_plan_type_id: row.room_plan_type_id,
        room_plan_type_name: row.room_plan_type_name,
        is_used: Number(row.is_used),
        days_of_week: Number(row.days_of_week),
        usage_hours: row.usage_hours === null ? null : Number(row.usage_hours),
        check_in_time: toTimeOfDay(row.check_in_time),
        check_out_time: toTimeOfDay(row.check_out_time),
    };
}

/**
 * 객실 그룹 목록 항목.
 *
 * @param row 객실 그룹 목록 행
 * @param image_url 대표 사진 CDN 주소 (사진이 없으면 null)
 * @returns 항목
 */
export function toRoomGroupListItem(row: RoomGroupRow, image_url: string | null): RoomGroupListItemResultDto {
    return {room_group_id: row.room_group_id, room_group_name: row.room_group_name, room_count: Number(row.room_count), image_url, created_at: dayjs(row.created_at).toISOString()};
}

/**
 * 객실 그룹 상세 — 상세정보는 알려진 항목을 모두(빠진 항목은 기본값) 담는다.
 *
 * @param group 객실 그룹
 * @param images 사진 항목 (정렬 순서 순)
 * @param plans 그룹 상품 항목 (상품 종류 순)
 * @returns 상세
 */
export function toRoomGroupDetail(group: RoomGroupEntity, images: RoomGroupDetailImageResultDto[], plans: RoomGroupDetailPlanResultDto[]): RoomGroupDetailResultDto {
    return {
        room_group_id: group.room_group_id,
        room_group_name: group.room_group_name,
        description: group.description ?? null,
        room_group_detail: buildRoomGroupDetail(group.room_group_detail),
        images,
        plans,
        created_at: group.created_at.toISOString(),
        updated_at: group.updated_at.toISOString(),
    };
}

/**
 * 객실 그룹 사진 항목.
 *
 * @param image 그룹 사진
 * @param image_url CDN 공개 주소
 * @returns 항목
 */
export function toRoomGroupImageItem(image: RoomGroupImageEntity, image_url: string): RoomGroupDetailImageResultDto {
    return {room_group_image_id: image.room_group_image_id, file_name: image.file_name, content_type: image.content_type, sort_order: Number(image.sort_order), image_url};
}

/**
 * 그룹 상품 항목.
 *
 * @param row 그룹 상품 행
 * @returns 항목
 */
export function toRoomGroupPlanItem(row: RoomGroupPlanRow): RoomGroupDetailPlanResultDto {
    return {room_plan_type_id: row.room_plan_type_id, room_plan_type_name: row.room_plan_type_name, is_used: Number(row.is_used), price: Number(row.price)};
}

/**
 * 기간 가격 목록 항목 — 날짜는 date 컬럼 값 그대로('YYYY-MM-DD').
 *
 * @param price 기간 가격
 * @returns 항목
 */
export function toRoomGroupPlanPriceItem(price: RoomGroupPlanPriceEntity): RoomGroupPlanPriceItemResultDto {
    return {room_group_plan_price_id: price.room_group_plan_price_id, start_date: price.start_date, end_date: price.end_date, price: price.price, memo: price.memo ?? null};
}

/**
 * 호실 목록 항목.
 *
 * @param row 호실 목록 행
 * @returns 항목
 */
export function toRoomListItem(row: RoomRow): RoomListItemResultDto {
    return {
        room_id: row.room_id,
        room_group_id: row.room_group_id,
        room_group_name: row.room_group_name,
        room_name: row.room_name,
        floor: Number(row.floor),
        room_state_id: row.room_state_id,
        room_state_name: row.room_state_name,
        created_at: dayjs(row.created_at).toISOString(),
    };
}
```

### Data Access — repository

포트 메서드 33개(계약 §2 순서) + public QueryBuilder 빌더 7개(포트 밖, try/catch 없음 — Smoke 용). getter 는 실제로 repository 를 쓰는 엔티티 7개(`stores` · `roomPlans` · `roomGroups` · `roomGroupPlans` · `roomGroupImages` · `roomGroupPlanPrices` · `rooms`) — 룩업 `t_room_plan_type` · `t_room_state` · `t_user` 는 조인 대상 클래스로만 쓴다.

- **소프트 삭제** — `is_deleted` 가 있는 그룹 · 사진 · 기간 가격 · 호실의 조회 · 개수 · 수정은 `notDeleted(where)`, 삭제(`deleteRoomGroup` · `deleteRoomGroupImage(s)` · `deleteRoomGroupPlanPrice` · `deleteRoom(s)`)는 `update(notDeleted(where), is_deleted = 1 인 new 엔티티)`(훅이 수정일). `deleteRoomGroupPlanPrice` 만 `affected === 1`. 업체 상품 설정 · 그룹 상품은 `is_deleted` 가 없어 `notDeleted` 를 쓰지 않는다(컴파일 오류가 막는다). QueryBuilder 빌더는 raw 문자열 `"<별칭>"."is_deleted" = 0`(조인한 그룹 · 서브쿼리의 호실 · 사진 포함), setFindOptions 빌더는 `notDeleted` 가 넣는 파라미터 `$n = 0`.
- **제약 위반 변환** — `UK_RoomGroup_StoreIdRoomGroupName`(insert · update) → 400 `{message: ROOM_GROUP_NAME_TAKEN_MESSAGE, validation_errors: createValidationError('room_group_name', …)}`, `UK_Room_StoreIdRoomName`(insert · update) → 400 + `validation_errors.room_name`, `UK_RoomGroupImage_FileKey`(insert) → 400 `{message: ROOM_GROUP_IMAGE_TAKEN_MESSAGE}`, `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange`(insert · update, `isExclusionViolation`) → 400 `{message: ROOM_PLAN_PRICE_OVERLAP_MESSAGE}`(validation_errors 없음 — service 선검사와 같은 본문). 그 밖은 통일 500. `createValidationError` 는 `@app/common/utils/validation.js`(store.service.ts 와 같은 import). 부분 유니크 인덱스 이름이 PostgreSQL 오류의 `constraint` 로 오는 것 · 23P01 + 제약명은 PGlite 실행으로 확인했다.
- **`buildManagerStoreQuery`** — store `buildStoreByManagerQuery` 와 SQL 이 글자까지 같다(t_user 매니저 그룹 조인 · `store_state_id <> 'LEAVE'` · `"s"."is_deleted" = 0` · 잠금이면 `setLock('pessimistic_write', undefined, ['s'])` → `FOR UPDATE OF s`). 트랜잭션 밖 잠금은 TypeORM 이 거부 → 500(PGlite 확인).
- **`buildRoomGroupRowsQuery` 방식(선택 근거)** — WHERE · 정렬 · 페이지는 `setFindOptions({where: notDeleted(where), order: {created_at: 'DESC'}, take, skip})` 로 만들고(형제 `buildStoreListQuery` 와 같은 FindOptions where 경로 — 관계 필드 `store_id` · `ILike` · 배열 OR 을 그대로 받는다), 그 뒤 `.select()` 로 선택 목록만 `RoomGroupRow` 별칭으로 바꾼다. setFindOptions 는 호출 즉시 적용되고 `select` 옵션이 없으면 선택 목록을 건드리지 않으므로 뒤의 `.select()` 가 이긴다. 조인이 없어 `take`/`skip` 은 `LIMIT`/`OFFSET` 이 된다. `room_count` · `cover_file_key` 는 상관 서브쿼리(`addSelect(sub => …, alias)`) — 서브쿼리 빌더는 바깥 별칭 `g` 를 모르므로 식별자를 `"r"."room_group_id" = "g"."room_group_id"` 처럼 직접 따옴표로 쓴다. 개수는 `CAST(COUNT(*) AS integer)` 로 int8(문자열로 온다) 대신 number. raw 문자열로 WHERE 를 다시 만드는 방식(Brackets)은 FindOptionsWhere 배열을 받는 계약 시그니처와 맞지 않아 쓰지 않았다.
- **`buildRoomRowsQuery`** — `t_room r` ⋈ `t_room_group g` ⋈ `t_room_state st`, `r.is_deleted = 0 AND g.is_deleted = 0`, `floor` · `room_group_id` 는 `null` 이 아닐 때만 `andWhere`(층 0 도 필터 — `!== null` 비교), 층 · 호실명 순, 조인이 있어 `limit`/`offset`(take/skip 아님).
- **기타 빌더** — `buildRoomPlanRowsQuery`(p ⋈ t, `RoomPlanRow` 별칭 9개, 정렬 없음 — service 가 `sortByPlanType`) · `buildRoomGroupPlanRowsQuery`(gp ⋈ t, `RoomGroupPlanRow` 별칭 6개) · `buildRoomGroupImagesQuery`(setFindOptions — `notDeleted<RoomGroupImageEntity>({room_group_id})`, `sort_order` · `created_at` ASC, getMany) · `buildRoomGroupPlanPriceListQuery`(setFindOptions — `start_date` ASC, take/skip, getMany — 목록 · 겹침 where 둘 다 이 빌더로 Smoke).
- raw select 의 SELECT 절 순서는 TypeORM 이 본 테이블 컬럼을 먼저, 조인 테이블 컬럼을 뒤로 모은다(아래 Smoke 의 실제 순서). 별칭 집합은 행 타입 키와 같다.

```ts
// apps/admin-service/src/room/interfaces/room.repository.interface.ts — new
import type {FindOptionsWhere} from 'typeorm';
import type {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import type {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';

/** 업체 상품 설정 조회 행 — 업체 상품 설정 컬럼 + 상품 종류명 (QueryBuilder raw — t_room_plan_type 조인). 시각은 time 컬럼 값 그대로('HH:mm:ss') */
export interface RoomPlanRow {
    room_plan_id: string;
    store_id: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    is_used: number;
    days_of_week: number;
    usage_hours: number | null;
    check_in_time: string | null;
    check_out_time: string | null;
}

/** 객실 그룹 목록 행 — 그룹 컬럼 + 지워지지 않은 호실 수 · 대표 사진(지워지지 않은 사진 중 정렬 순서 · 등록일이 가장 앞) 저장 키 (QueryBuilder raw — 서브쿼리) */
export interface RoomGroupRow {
    room_group_id: string;
    room_group_name: string;
    created_at: Date;
    room_count: number;
    cover_file_key: string | null;
}

/** 그룹 상품 조회 행 — 그룹 상품 컬럼 + 상품 종류명 (QueryBuilder raw — t_room_plan_type 조인) */
export interface RoomGroupPlanRow {
    room_group_plan_id: string;
    room_group_id: string;
    room_plan_type_id: string;
    room_plan_type_name: string;
    is_used: number;
    price: number;
}

/** 호실 목록 행 — 호실 컬럼 + 그룹명 · 상태명 (QueryBuilder raw — t_room_group · t_room_state 조인) */
export interface RoomRow {
    room_id: string;
    room_group_id: string;
    room_group_name: string;
    room_name: string;
    floor: number;
    room_state_id: string;
    room_state_name: string;
    created_at: Date;
}

/** 호실 목록 조건 — 업체 + 선택 필터(층 · 그룹, 없으면 null) */
export interface RoomListFilter {
    store_id: string;
    floor: number | null;
    room_group_id: string | null;
}

/**
 * room repository 포트 — 업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 상품별 기간 가격 · 호실과, room 어휘로 다루는 매니저의 소속 업체(t_store · t_user)를 다룬다.
 * WHERE 는 service · util 이 만들고(배열 = OR) repository 는 실행 + DB 오류 변환만 한다. 소프트 삭제 테이블(그룹 · 사진 · 기간 가격 · 호실)의 is_deleted = 0 은 repository 가 붙인다.
 * insert · update 의 엔티티는 호출자가 `new XEntity()` + 필드 할당으로 만든다(@BeforeInsert/@BeforeUpdate 트리거).
 */
export interface RoomRepositoryInterface {
    /** 매니저의 소속 업체 (탈퇴 업체 · 지운 업체 제외) — lock 이면 업체 행을 잠근다(쓰기 트랜잭션 안에서만) */
    findManagerStore(user_id: string, lock: boolean): Promise<StoreEntity | null>;
    /** 업체 상품 설정 행 — 상품 종류명 포함(순서는 service 가 sortByPlanType) */
    findRoomPlanRows(store_id: string): Promise<RoomPlanRow[]>;
    /** 업체 상품 설정 단건 */
    findRoomPlan(where: FindOptionsWhere<RoomPlanEntity>): Promise<RoomPlanEntity | null>;
    /** 업체 상품 설정 수정 */
    updateRoomPlan(where: FindOptionsWhere<RoomPlanEntity>, entity: RoomPlanEntity): Promise<void>;
    /** 객실 그룹 개수 — 목록 */
    countRoomGroups(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[]): Promise<number>;
    /** 객실 그룹 목록 행 — 호실 수 · 대표 사진 키 포함, 등록일 최신순 */
    findRoomGroupRows(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[], limit: number, offset: number): Promise<RoomGroupRow[]>;
    /** 객실 그룹 단건 */
    findRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity | null>;
    /** 객실 그룹 등록 — 그룹명 UK → 400 */
    insertRoomGroup(entity: RoomGroupEntity): Promise<void>;
    /** 객실 그룹 수정 — 그룹명 UK → 400 */
    updateRoomGroup(where: FindOptionsWhere<RoomGroupEntity>, entity: RoomGroupEntity): Promise<void>;
    /** 객실 그룹 삭제 — 삭제 표시(소프트 삭제) */
    deleteRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<void>;
    /** 그룹 상품 등록 — 그룹 등록 때 상품 종류마다 1행 */
    insertRoomGroupPlans(entities: RoomGroupPlanEntity[]): Promise<void>;
    /** 그룹의 그룹 상품 행 — 상품 종류명 포함(순서는 service 가 sortByPlanType) */
    findRoomGroupPlanRows(room_group_id: string): Promise<RoomGroupPlanRow[]>;
    /** 그룹 상품 단건 */
    findRoomGroupPlan(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity | null>;
    /** 그룹 상품 수정 (사용 여부 · 요금) */
    updateRoomGroupPlan(where: FindOptionsWhere<RoomGroupPlanEntity>, entity: RoomGroupPlanEntity): Promise<void>;
    /** 그룹의 사진 — 정렬 순서 · 등록일 순 */
    findRoomGroupImages(room_group_id: string): Promise<RoomGroupImageEntity[]>;
    /** 그룹 사진 단건 */
    findRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<RoomGroupImageEntity | null>;
    /** 그룹 사진 등록 — 같은 키 → 400 */
    insertRoomGroupImage(entity: RoomGroupImageEntity): Promise<void>;
    /** 그룹 사진 수정 (정렬 순서) */
    updateRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>, entity: RoomGroupImageEntity): Promise<void>;
    /** 그룹 사진 삭제 — 삭제 표시(소프트 삭제, S3 객체는 service 가 지운다) */
    deleteRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<void>;
    /** 그룹 사진 여러 건 삭제 (그룹 삭제) — 삭제 표시(소프트 삭제) */
    deleteRoomGroupImages(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<void>;
    /** 기간 가격 개수 — 목록 · 겹침 확인 */
    countRoomGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<number>;
    /** 기간 가격 목록 — 시작 날짜 순 */
    findRoomGroupPlanPriceList(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, limit: number, offset: number): Promise<RoomGroupPlanPriceEntity[]>;
    /** 기간 가격 단건 */
    findRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity | null>;
    /** 기간 가격 등록 — 배타 제약(겹침) → 400 */
    insertRoomGroupPlanPrice(entity: RoomGroupPlanPriceEntity): Promise<void>;
    /** 기간 가격 수정 — 배타 제약(겹침) → 400 */
    updateRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, entity: RoomGroupPlanPriceEntity): Promise<void>;
    /** 기간 가격 삭제 — 삭제 표시(소프트 삭제), 조건에 맞는 행을 지웠으면 true */
    deleteRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<boolean>;
    /** 호실 개수 — 목록 */
    countRooms(where: FindOptionsWhere<RoomEntity>): Promise<number>;
    /** 호실 목록 행 — 그룹명 · 상태명 포함, 층 · 호실명 순 */
    findRoomRows(filter: RoomListFilter, limit: number, offset: number): Promise<RoomRow[]>;
    /** 호실 단건 */
    findRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
    /** 호실 등록 — 호실명 UK → 400 */
    insertRoom(entity: RoomEntity): Promise<void>;
    /** 호실 수정 (호실명 · 층 · 그룹 · 상태) — 호실명 UK → 400 */
    updateRoom(where: FindOptionsWhere<RoomEntity>, entity: RoomEntity): Promise<void>;
    /** 호실 삭제 — 삭제 표시(소프트 삭제) */
    deleteRoom(where: FindOptionsWhere<RoomEntity>): Promise<void>;
    /** 호실 여러 건 삭제 (그룹 삭제) — 삭제 표시(소프트 삭제) */
    deleteRooms(where: FindOptionsWhere<RoomEntity>): Promise<void>;
}
```

```ts
// apps/admin-service/src/room/repositories/room.repository.ts — new
import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder} from 'typeorm';
import {createValidationError} from '@app/common/utils/validation.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from '@app/database/entities/room/room-plan-type.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomStateEntity} from '@app/database/entities/room/room-state.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import {isExclusionViolation, isUniqueViolation} from '@app/database/typeorm-error.js';
import type {RoomGroupPlanRow, RoomGroupRow, RoomListFilter, RoomPlanRow, RoomRepositoryInterface, RoomRow} from '../interfaces/room.repository.interface.js';
import {ROOM_GROUP_IMAGE_TAKEN_MESSAGE, ROOM_GROUP_NAME_TAKEN_MESSAGE, ROOM_NAME_TAKEN_MESSAGE, ROOM_PLAN_PRICE_OVERLAP_MESSAGE, ROOM_STORE_STATE_LEAVE} from '../room.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * room repository (아웃바운드 어댑터) — t_room_plan · t_room_group · t_room_group_image · t_room_group_plan · t_room_group_plan_price · t_room 과
 * 룩업 t_room_plan_type · t_room_state(조인), 공유 DB 의 t_store · t_user(매니저의 소속 업체)를 직접 다룬다. `txHost.tx` 는 `@Transactional()` 범위 안에서는 트랜잭션 EntityManager 다.
 * 삭제는 소프트 삭제(is_deleted = 1)이고, is_deleted 가 있는 테이블(그룹 · 사진 · 기간 가격 · 호실)의 조회 · 개수 · 수정에는 항상 is_deleted = 0 을 붙인다(notDeleted · QueryBuilder 조건 — service 는 넣지 않는다).
 * 업체 상품 설정 · 그룹 상품은 종류마다 반드시 있는 행이라 지우지 않는다(is_deleted 없음).
 */
@Injectable()
export class RoomRepository implements RoomRepositoryInterface {
    /**
     * @param txHost 트랜잭션 전파용 EntityManager 홀더
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_store repository (현재 트랜잭션 기준) — 매니저의 소속 업체 */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_room_plan repository (현재 트랜잭션 기준) — 업체 상품 설정 */
    private get roomPlans(): Repository<RoomPlanEntity> {
        return this.txHost.tx.getRepository(RoomPlanEntity);
    }

    /** t_room_group repository (현재 트랜잭션 기준) */
    private get roomGroups(): Repository<RoomGroupEntity> {
        return this.txHost.tx.getRepository(RoomGroupEntity);
    }

    /** t_room_group_plan repository (현재 트랜잭션 기준) — 그룹 상품 */
    private get roomGroupPlans(): Repository<RoomGroupPlanEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanEntity);
    }

    /** t_room_group_image repository (현재 트랜잭션 기준) */
    private get roomGroupImages(): Repository<RoomGroupImageEntity> {
        return this.txHost.tx.getRepository(RoomGroupImageEntity);
    }

    /** t_room_group_plan_price repository (현재 트랜잭션 기준) — 상품별 기간 가격 */
    private get roomGroupPlanPrices(): Repository<RoomGroupPlanPriceEntity> {
        return this.txHost.tx.getRepository(RoomGroupPlanPriceEntity);
    }

    /** t_room repository (현재 트랜잭션 기준) — 호실 */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /**
     * 매니저의 소속 업체 — 매니저 그룹 회원의 store_id 로 찾는다. 탈퇴 업체 · 지운 업체는 없는 것과 같다.
     *
     * @param user_id 로그인 매니저 ID
     * @param lock true 면 업체 행을 잠근다(FOR UPDATE — 같은 업체의 객실 설정 쓰기를 한 번에 하나로). 트랜잭션 안에서만
     * @returns 업체 또는 null
     */
    async findManagerStore(user_id: string, lock: boolean): Promise<StoreEntity | null> {
        try {
            return await this.buildManagerStoreQuery(user_id, lock).getOne();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 매니저의 소속 업체 쿼리 — 매핑 민감(t_user 조인 · 관계 컬럼 · 잠금)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param user_id 로그인 매니저 ID
     * @param lock true 면 업체 행만 잠근다(FOR UPDATE OF s — 매니저 행은 잠그지 않는다)
     * @returns 쿼리 빌더
     */
    buildManagerStoreQuery(user_id: string, lock: boolean): SelectQueryBuilder<StoreEntity> {
        const query = this.stores
            .createQueryBuilder('s')
            .innerJoin(UserEntity, 'u', 'u.store_id = s.store_id')
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('s.store_state_id <> :leave', {leave: ROOM_STORE_STATE_LEAVE})
            .andWhere('s.is_deleted = 0')
            .loadAllRelationIds();
        return lock ? query.setLock('pessimistic_write', undefined, ['s']) : query;
    }

    /**
     * 업체 상품 설정 행 — 상품 종류명 포함
     *
     * @param store_id 업체 ID
     * @returns 상품 종류마다 1행 (순서는 service 가 sortByPlanType)
     */
    async findRoomPlanRows(store_id: string): Promise<RoomPlanRow[]> {
        try {
            return await this.buildRoomPlanRowsQuery(store_id).getRawMany<RoomPlanRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 상품 설정 조회 쿼리 — 매핑 민감(상품 종류 조인 · raw select — 별칭이 RoomPlanRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildRoomPlanRowsQuery(store_id: string): SelectQueryBuilder<RoomPlanEntity> {
        return this.roomPlans
            .createQueryBuilder('p')
            .select('p.room_plan_id', 'room_plan_id')
            .addSelect('p.store_id', 'store_id')
            .addSelect('p.room_plan_type_id', 'room_plan_type_id')
            .addSelect('t.room_plan_type_name', 'room_plan_type_name')
            .addSelect('p.is_used', 'is_used')
            .addSelect('p.days_of_week', 'days_of_week')
            .addSelect('p.usage_hours', 'usage_hours')
            .addSelect('p.check_in_time', 'check_in_time')
            .addSelect('p.check_out_time', 'check_out_time')
            .innerJoin(RoomPlanTypeEntity, 't', 't.room_plan_type_id = p.room_plan_type_id')
            .where('p.store_id = :store_id', {store_id});
    }

    /**
     * 업체 상품 설정 단건
     *
     * @param where 조회 조건
     * @returns 업체 상품 설정 또는 null
     */
    async findRoomPlan(where: FindOptionsWhere<RoomPlanEntity>): Promise<RoomPlanEntity | null> {
        try {
            return await this.roomPlans.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 상품 설정 수정 — 종류별 조합(CHECK CHK_RoomPlan_UsageHoursCheckInOutTime)은 service 가 먼저 맞추므로 위반은 통일 500
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomPlan(where: FindOptionsWhere<RoomPlanEntity>, entity: RoomPlanEntity): Promise<void> {
        try {
            await this.roomPlans.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 객실 그룹 개수
     *
     * @param where 조회 조건 (배열 = OR)
     * @returns 개수
     */
    async countRoomGroups(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[]): Promise<number> {
        try {
            return await this.roomGroups.count({where: notDeleted(where)});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 객실 그룹 목록 행
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 그룹 행 (등록일 최신순, 호실 수 · 대표 사진 키 포함)
     */
    async findRoomGroupRows(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[], limit: number, offset: number): Promise<RoomGroupRow[]> {
        try {
            return await this.buildRoomGroupRowsQuery(where, limit, offset).getRawMany<RoomGroupRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 객실 그룹 목록 쿼리 — WHERE 는 FindOptions 경로(setFindOptions — 관계 필드 · ILike · 배열 OR, 지워지지 않은 그룹만)로 만들고, select 는 RoomGroupRow 별칭으로 바꾼다.
     * 호실 수는 지워지지 않은 호실을 세는 서브쿼리, 대표 사진은 지워지지 않은 사진 중 정렬 순서 · 등록일이 가장 앞인 1장의 저장 키 서브쿼리다(없으면 NULL).
     * 매핑 민감(관계 필드 where · ILike · 배열 OR · 서브쿼리 · raw select)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildRoomGroupRowsQuery(where: FindOptionsWhere<RoomGroupEntity> | FindOptionsWhere<RoomGroupEntity>[], limit: number, offset: number): SelectQueryBuilder<RoomGroupEntity> {
        return this.roomGroups
            .createQueryBuilder('g')
            .setFindOptions({where: notDeleted(where), order: {created_at: 'DESC'}, take: limit, skip: offset})
            .select('g.room_group_id', 'room_group_id')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('g.created_at', 'created_at')
            .addSelect((sub) => sub.select('CAST(COUNT(*) AS integer)').from(RoomEntity, 'r').where('"r"."room_group_id" = "g"."room_group_id"').andWhere('"r"."is_deleted" = 0'), 'room_count')
            .addSelect(
                (sub) =>
                    sub
                        .select('"i"."file_key"')
                        .from(RoomGroupImageEntity, 'i')
                        .where('"i"."room_group_id" = "g"."room_group_id"')
                        .andWhere('"i"."is_deleted" = 0')
                        .orderBy('"i"."sort_order"', 'ASC')
                        .addOrderBy('"i"."created_at"', 'ASC')
                        .limit(1),
                'cover_file_key',
            );
    }

    /**
     * 객실 그룹 단건
     *
     * @param where 조회 조건
     * @returns 그룹 또는 null (상세정보는 @AfterLoad 가 기본값으로 채운다)
     */
    async findRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<RoomGroupEntity | null> {
        try {
            return await this.roomGroups.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 객실 그룹 등록 — 같은 업체의 지워지지 않은 그룹명이 있으면 400(부분 유니크 UK_RoomGroup_StoreIdRoomGroupName — 선검사 없이 DB 가 막는다)
     *
     * @param entity new RoomGroupEntity() + 할당
     */
    async insertRoomGroup(entity: RoomGroupEntity): Promise<void> {
        try {
            await this.roomGroups.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_RoomGroup_StoreIdRoomGroupName')) {
                throw new BadRequestException({message: ROOM_GROUP_NAME_TAKEN_MESSAGE, validation_errors: createValidationError('room_group_name', ROOM_GROUP_NAME_TAKEN_MESSAGE)});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 객실 그룹 수정 — 같은 업체의 지워지지 않은 다른 그룹과 그룹명이 같으면 400
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomGroup(where: FindOptionsWhere<RoomGroupEntity>, entity: RoomGroupEntity): Promise<void> {
        try {
            await this.roomGroups.update(notDeleted(where), entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_RoomGroup_StoreIdRoomGroupName')) {
                throw new BadRequestException({message: ROOM_GROUP_NAME_TAKEN_MESSAGE, validation_errors: createValidationError('room_group_name', ROOM_GROUP_NAME_TAKEN_MESSAGE)});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 객실 그룹 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제 — 예약이 호실 · 그룹 상품을 가리킨다). 호실 · 사진은 service 가 같은 트랜잭션에서 함께 삭제 표시한다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRoomGroup(where: FindOptionsWhere<RoomGroupEntity>): Promise<void> {
        try {
            const entity = new RoomGroupEntity();
            entity.is_deleted = 1;
            await this.roomGroups.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 등록 — 그룹 등록 때 상품 종류마다 1행. 방금 만든 그룹이라 UK 위반이 없으므로 위반은 통일 500
     *
     * @param entities new RoomGroupPlanEntity() + 할당 (상품 종류마다 1개)
     */
    async insertRoomGroupPlans(entities: RoomGroupPlanEntity[]): Promise<void> {
        try {
            await this.roomGroupPlans.insert(entities);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹의 그룹 상품 행 — 상품 종류명 포함
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 상품 종류마다 1행 (순서는 service 가 sortByPlanType)
     */
    async findRoomGroupPlanRows(room_group_id: string): Promise<RoomGroupPlanRow[]> {
        try {
            return await this.buildRoomGroupPlanRowsQuery(room_group_id).getRawMany<RoomGroupPlanRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 조회 쿼리 — 매핑 민감(상품 종류 조인 · raw select — 별칭이 RoomGroupPlanRow 키와 같다)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 쿼리 빌더
     */
    buildRoomGroupPlanRowsQuery(room_group_id: string): SelectQueryBuilder<RoomGroupPlanEntity> {
        return this.roomGroupPlans
            .createQueryBuilder('gp')
            .select('gp.room_group_plan_id', 'room_group_plan_id')
            .addSelect('gp.room_group_id', 'room_group_id')
            .addSelect('gp.room_plan_type_id', 'room_plan_type_id')
            .addSelect('t.room_plan_type_name', 'room_plan_type_name')
            .addSelect('gp.is_used', 'is_used')
            .addSelect('gp.price', 'price')
            .innerJoin(RoomPlanTypeEntity, 't', 't.room_plan_type_id = gp.room_plan_type_id')
            .where('gp.room_group_id = :room_group_id', {room_group_id});
    }

    /**
     * 그룹 상품 단건
     *
     * @param where 조회 조건
     * @returns 그룹 상품 또는 null
     */
    async findRoomGroupPlan(where: FindOptionsWhere<RoomGroupPlanEntity>): Promise<RoomGroupPlanEntity | null> {
        try {
            return await this.roomGroupPlans.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 상품 수정 — 사용 여부 · 요금
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomGroupPlan(where: FindOptionsWhere<RoomGroupPlanEntity>, entity: RoomGroupPlanEntity): Promise<void> {
        try {
            await this.roomGroupPlans.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹의 사진
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 지워지지 않은 사진 (정렬 순서 · 등록일 순)
     */
    async findRoomGroupImages(room_group_id: string): Promise<RoomGroupImageEntity[]> {
        try {
            return await this.buildRoomGroupImagesQuery(room_group_id).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 사진 쿼리 — 매핑 민감(관계 필드 where · 정렬)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param room_group_id 객실 그룹 ID
     * @returns 쿼리 빌더
     */
    buildRoomGroupImagesQuery(room_group_id: string): SelectQueryBuilder<RoomGroupImageEntity> {
        return this.roomGroupImages
            .createQueryBuilder('i')
            .setFindOptions({where: notDeleted<RoomGroupImageEntity>({room_group_id}), order: {sort_order: 'ASC', created_at: 'ASC'}, loadRelationIds: true});
    }

    /**
     * 그룹 사진 단건
     *
     * @param where 조회 조건
     * @returns 사진 또는 null
     */
    async findRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<RoomGroupImageEntity | null> {
        try {
            return await this.roomGroupImages.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 사진 등록 — 같은 저장 키는 400(UK_RoomGroupImage_FileKey — 지운 행까지 전체)
     *
     * @param entity new RoomGroupImageEntity() + 할당
     */
    async insertRoomGroupImage(entity: RoomGroupImageEntity): Promise<void> {
        try {
            await this.roomGroupImages.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_RoomGroupImage_FileKey')) {
                throw new BadRequestException({message: ROOM_GROUP_IMAGE_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 그룹 사진 수정 — 정렬 순서
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>, entity: RoomGroupImageEntity): Promise<void> {
        try {
            await this.roomGroupImages.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 사진 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제). S3 객체는 service 가 실제로 지운다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRoomGroupImage(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<void> {
        try {
            const entity = new RoomGroupImageEntity();
            entity.is_deleted = 1;
            await this.roomGroupImages.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 그룹 사진 여러 건 삭제 — 그룹 삭제. 그 그룹의 지워지지 않은 사진을 모두 삭제 표시한다(소프트 삭제). S3 객체는 service 가 마지막에 지운다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRoomGroupImages(where: FindOptionsWhere<RoomGroupImageEntity>): Promise<void> {
        try {
            const entity = new RoomGroupImageEntity();
            entity.is_deleted = 1;
            await this.roomGroupImages.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 개수
     *
     * @param where 조회 조건 (목록 — 그룹 상품, 겹침 — buildPlanPriceOverlapWhere)
     * @returns 개수
     */
    async countRoomGroupPlanPrices(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<number> {
        try {
            return await this.roomGroupPlanPrices.count({where: notDeleted(where)});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 목록
     *
     * @param where 조회 조건
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 시작 날짜 순
     */
    async findRoomGroupPlanPriceList(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, limit: number, offset: number): Promise<RoomGroupPlanPriceEntity[]> {
        try {
            return await this.buildRoomGroupPlanPriceListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 목록 쿼리 — 매핑 민감(관계 필드 where · LessThanOrEqual · MoreThanOrEqual · Not 날짜 비교)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     * 겹침 조건(count)도 같은 FindOptions where 경로라 Smoke 는 두 조건을 모두 이 빌더로 고정한다.
     *
     * @param where 조회 조건
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildRoomGroupPlanPriceListQuery(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, limit: number, offset: number): SelectQueryBuilder<RoomGroupPlanPriceEntity> {
        return this.roomGroupPlanPrices.createQueryBuilder('pp').setFindOptions({where: notDeleted(where), order: {start_date: 'ASC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 기간 가격 단건
     *
     * @param where 조회 조건
     * @returns 기간 가격 또는 null
     */
    async findRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<RoomGroupPlanPriceEntity | null> {
        try {
            return await this.roomGroupPlanPrices.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 기간 가격 등록 — 같은 그룹 상품의 지워지지 않은 다른 기간과 겹치면 400(배타 제약 EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange — service 선검사를 동시 요청이 함께 통과한 경우).
     * 시작 ≤ 종료(CHECK)는 service 가 먼저 막으므로 위반은 통일 500
     *
     * @param entity new RoomGroupPlanPriceEntity() + 할당
     */
    async insertRoomGroupPlanPrice(entity: RoomGroupPlanPriceEntity): Promise<void> {
        try {
            await this.roomGroupPlanPrices.insert(entity);
        } catch (error) {
            if (isExclusionViolation(error, 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange')) {
                throw new BadRequestException({message: ROOM_PLAN_PRICE_OVERLAP_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 기간 가격 수정 — 같은 그룹 상품의 지워지지 않은 다른 기간과 겹치면 400(배타 제약)
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>, entity: RoomGroupPlanPriceEntity): Promise<void> {
        try {
            await this.roomGroupPlanPrices.update(notDeleted(where), entity);
        } catch (error) {
            if (isExclusionViolation(error, 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange')) {
                throw new BadRequestException({message: ROOM_PLAN_PRICE_OVERLAP_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 기간 가격 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제). 그룹 상품을 조건에 넣으면 다른 그룹 상품 것 · 이미 지운 것은 0건이다.
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     * @returns 지웠으면 true, 조건에 맞는 행이 없으면 false
     */
    async deleteRoomGroupPlanPrice(where: FindOptionsWhere<RoomGroupPlanPriceEntity>): Promise<boolean> {
        try {
            const entity = new RoomGroupPlanPriceEntity();
            entity.is_deleted = 1;
            const result = await this.roomGroupPlanPrices.update(notDeleted(where), entity);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 개수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countRooms(where: FindOptionsWhere<RoomEntity>): Promise<number> {
        try {
            return await this.rooms.count({where: notDeleted(where)});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 목록 행
     *
     * @param filter 업체 + 선택 필터(층 · 그룹)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 호실 행 (층 · 호실명 순, 그룹명 · 상태명 포함)
     */
    async findRoomRows(filter: RoomListFilter, limit: number, offset: number): Promise<RoomRow[]> {
        try {
            return await this.buildRoomRowsQuery(filter, limit, offset).getRawMany<RoomRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 목록 쿼리 — 지워지지 않은 호실 · 그룹만(그룹 · 상태 조인), 층 · 그룹 필터는 값이 있을 때만 더한다.
     * 매핑 민감(조인 · raw select — 별칭이 RoomRow 키와 같다 · 동적 조립)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param filter 업체 + 선택 필터(층 · 그룹)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildRoomRowsQuery(filter: RoomListFilter, limit: number, offset: number): SelectQueryBuilder<RoomEntity> {
        const query = this.rooms
            .createQueryBuilder('r')
            .select('r.room_id', 'room_id')
            .addSelect('r.room_group_id', 'room_group_id')
            .addSelect('g.room_group_name', 'room_group_name')
            .addSelect('r.room_name', 'room_name')
            .addSelect('r.floor', 'floor')
            .addSelect('r.room_state_id', 'room_state_id')
            .addSelect('st.room_state_name', 'room_state_name')
            .addSelect('r.created_at', 'created_at')
            .innerJoin(RoomGroupEntity, 'g', 'g.room_group_id = r.room_group_id')
            .innerJoin(RoomStateEntity, 'st', 'st.room_state_id = r.room_state_id')
            .where('r.store_id = :store_id', {store_id: filter.store_id})
            .andWhere('r.is_deleted = 0')
            .andWhere('g.is_deleted = 0');
        if (filter.floor !== null) {
            query.andWhere('r.floor = :floor', {floor: filter.floor});
        }
        if (filter.room_group_id !== null) {
            query.andWhere('r.room_group_id = :room_group_id', {room_group_id: filter.room_group_id});
        }
        return query.orderBy('r.floor', 'ASC').addOrderBy('r.room_name', 'ASC').limit(limit).offset(offset);
    }

    /**
     * 호실 단건
     *
     * @param where 조회 조건
     * @returns 호실 또는 null
     */
    async findRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null> {
        try {
            return await this.rooms.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 등록 — 같은 업체의 지워지지 않은 호실명이 있으면 400(부분 유니크 UK_Room_StoreIdRoomName — 선검사 없이 DB 가 막는다)
     *
     * @param entity new RoomEntity() + 할당
     */
    async insertRoom(entity: RoomEntity): Promise<void> {
        try {
            await this.rooms.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_Room_StoreIdRoomName')) {
                throw new BadRequestException({message: ROOM_NAME_TAKEN_MESSAGE, validation_errors: createValidationError('room_name', ROOM_NAME_TAKEN_MESSAGE)});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 호실 수정 — 호실명 · 층 · 그룹(이동) · 상태. 같은 업체의 지워지지 않은 다른 호실과 호실명이 같으면 400
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateRoom(where: FindOptionsWhere<RoomEntity>, entity: RoomEntity): Promise<void> {
        try {
            await this.rooms.update(notDeleted(where), entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_Room_StoreIdRoomName')) {
                throw new BadRequestException({message: ROOM_NAME_TAKEN_MESSAGE, validation_errors: createValidationError('room_name', ROOM_NAME_TAKEN_MESSAGE)});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 호실 삭제 — 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제 — 예약이 호실을 가리킨다)
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRoom(where: FindOptionsWhere<RoomEntity>): Promise<void> {
        try {
            const entity = new RoomEntity();
            entity.is_deleted = 1;
            await this.rooms.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 호실 여러 건 삭제 — 그룹 삭제. 그 그룹의 지워지지 않은 호실을 모두 삭제 표시한다(소프트 삭제).
     *
     * @param where 삭제 조건 (지워지지 않은 행만)
     */
    async deleteRooms(where: FindOptionsWhere<RoomEntity>): Promise<void> {
        try {
            const entity = new RoomEntity();
            entity.is_deleted = 1;
            await this.rooms.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
```

### Smoke 예상 SQL

`new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES})` + `buildMetadatas()` + `new RoomRepository({tx: dataSource.manager})` 로 빌더를 만들고 `getQueryAndParameters()` 결과를 `sql.replace(/\s+/g, ' ')` 한 실제 값이다(TypeORM 1.1.2, scratch 복사본에서 실행). `${STORE_SELECT}` 는 store.repository.spec.ts 의 `STORE_SELECT` 상수와 글자까지 같다.

- **buildManagerStoreQuery('u1', false)** — parameters `["u1","MANAGER","LEAVE"]`
  ```text
  ${STORE_SELECT} INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id" WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3 AND "s"."is_deleted" = 0
  ```
- **buildManagerStoreQuery('u1', true) — 끝에 ` FOR UPDATE OF s`** — parameters `["u1","MANAGER","LEAVE"]`
  ```text
  ${STORE_SELECT} INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id" WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3 AND "s"."is_deleted" = 0 FOR UPDATE OF s
  ```
- **buildRoomPlanRowsQuery('s1') — 별칭 순서 room_plan_id, store_id, room_plan_type_id, is_used, days_of_week, usage_hours, check_in_time, check_out_time, room_plan_type_name** — parameters `["s1"]`
  ```text
  SELECT "p"."room_plan_id" AS "room_plan_id", "p"."store_id" AS "store_id", "p"."room_plan_type_id" AS "room_plan_type_id", "p"."is_used" AS "is_used", "p"."days_of_week" AS "days_of_week", "p"."usage_hours" AS "usage_hours", "p"."check_in_time" AS "check_in_time", "p"."check_out_time" AS "check_out_time", "t"."room_plan_type_name" AS "room_plan_type_name" FROM "t_room_plan" "p" INNER JOIN "t_room_plan_type" "t" ON "t"."room_plan_type_id" = "p"."room_plan_type_id" WHERE "p"."store_id" = $1
  ```
- **buildRoomGroupRowsQuery({store_id: 's1'}, 20, 0)** — parameters `["s1",0]`
  ```text
  SELECT "g"."room_group_id" AS "room_group_id", "g"."room_group_name" AS "room_group_name", "g"."created_at" AS "created_at", (SELECT CAST(COUNT(*) AS integer) FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0) AS "room_count", (SELECT "i"."file_key" FROM "t_room_group_image" "i" WHERE "i"."room_group_id" = "g"."room_group_id" AND "i"."is_deleted" = 0 ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC LIMIT 1) AS "cover_file_key" FROM "t_room_group" "g" WHERE (("g"."store_id" = $1) AND ("g"."is_deleted" = $2)) ORDER BY "g"."created_at" DESC LIMIT 20 OFFSET 0
  ```
- **buildRoomGroupRowsQuery({store_id: 's1', room_group_name: ILike('%디럭스%')}, 10, 20)** — service 가 넘기는 모양(객체 하나) — parameters `["s1","%디럭스%",0]`, SELECT 절은 위와 같고 FROM 뒤만 다르다
  ```text
  … FROM "t_room_group" "g" WHERE (("g"."store_id" = $1) AND ("g"."room_group_name" ILIKE $2) AND ("g"."is_deleted" = $3)) ORDER BY "g"."created_at" DESC LIMIT 10 OFFSET 20
  ```
- **buildRoomGroupRowsQuery([{store_id: 's1', room_group_name: ILike('%디럭스%')}], 10, 20) — 배열(OR) 모양** — parameters `["s1","%디럭스%",0]`
  ```text
  SELECT "g"."room_group_id" AS "room_group_id", "g"."room_group_name" AS "room_group_name", "g"."created_at" AS "created_at", (SELECT CAST(COUNT(*) AS integer) FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0) AS "room_count", (SELECT "i"."file_key" FROM "t_room_group_image" "i" WHERE "i"."room_group_id" = "g"."room_group_id" AND "i"."is_deleted" = 0 ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC LIMIT 1) AS "cover_file_key" FROM "t_room_group" "g" WHERE (((("g"."store_id" = $1) AND ("g"."room_group_name" ILIKE $2) AND ("g"."is_deleted" = $3)))) ORDER BY "g"."created_at" DESC LIMIT 10 OFFSET 20
  ```
- **buildRoomGroupPlanRowsQuery('g1')** — parameters `["g1"]`
  ```text
  SELECT "gp"."room_group_plan_id" AS "room_group_plan_id", "gp"."room_group_id" AS "room_group_id", "gp"."room_plan_type_id" AS "room_plan_type_id", "gp"."is_used" AS "is_used", "gp"."price" AS "price", "t"."room_plan_type_name" AS "room_plan_type_name" FROM "t_room_group_plan" "gp" INNER JOIN "t_room_plan_type" "t" ON "t"."room_plan_type_id" = "gp"."room_plan_type_id" WHERE "gp"."room_group_id" = $1
  ```
- **buildRoomGroupImagesQuery('g1')** — parameters `["g1",0]`
  ```text
  SELECT "i"."room_group_image_id" AS "i_room_group_image_id", "i"."file_key" AS "i_file_key", "i"."file_name" AS "i_file_name", "i"."content_type" AS "i_content_type", "i"."sort_order" AS "i_sort_order", "i"."is_deleted" AS "i_is_deleted", "i"."created_at" AS "i_created_at", "i"."updated_at" AS "i_updated_at", "i"."room_group_id" AS "i_room_group_id" FROM "t_room_group_image" "i" WHERE (("i"."room_group_id" = $1) AND ("i"."is_deleted" = $2)) ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC
  ```
- **buildRoomGroupPlanPriceListQuery({room_group_plan_id: 'gp1'}, 20, 0) — 목록** — parameters `["gp1",0]`
  ```text
  SELECT "pp"."room_group_plan_price_id" AS "pp_room_group_plan_price_id", "pp"."start_date" AS "pp_start_date", "pp"."end_date" AS "pp_end_date", "pp"."price" AS "pp_price", "pp"."memo" AS "pp_memo", "pp"."is_deleted" AS "pp_is_deleted", "pp"."created_at" AS "pp_created_at", "pp"."updated_at" AS "pp_updated_at", "pp"."room_group_plan_id" AS "pp_room_group_plan_id" FROM "t_room_group_plan_price" "pp" WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."is_deleted" = $2)) ORDER BY "pp"."start_date" ASC LIMIT 20 OFFSET 0
  ```
- **buildRoomGroupPlanPriceListQuery(buildPlanPriceOverlapWhere('gp1', '2026-07-01', '2026-08-31', null), 1, 0) — 겹침(등록)** — parameters `["gp1","2026-08-31","2026-07-01",0]`
  ```text
  SELECT "pp"."room_group_plan_price_id" AS "pp_room_group_plan_price_id", "pp"."start_date" AS "pp_start_date", "pp"."end_date" AS "pp_end_date", "pp"."price" AS "pp_price", "pp"."memo" AS "pp_memo", "pp"."is_deleted" AS "pp_is_deleted", "pp"."created_at" AS "pp_created_at", "pp"."updated_at" AS "pp_updated_at", "pp"."room_group_plan_id" AS "pp_room_group_plan_id" FROM "t_room_group_plan_price" "pp" WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."is_deleted" = $4)) ORDER BY "pp"."start_date" ASC LIMIT 1 OFFSET 0
  ```
- **buildRoomGroupPlanPriceListQuery(buildPlanPriceOverlapWhere('gp1', '2026-07-01', '2026-08-31', 'pp1'), 1, 0) — 겹침(수정 — 자기 자신 제외 `!=`)** — parameters `["gp1","2026-08-31","2026-07-01","pp1",0]`
  ```text
  SELECT "pp"."room_group_plan_price_id" AS "pp_room_group_plan_price_id", "pp"."start_date" AS "pp_start_date", "pp"."end_date" AS "pp_end_date", "pp"."price" AS "pp_price", "pp"."memo" AS "pp_memo", "pp"."is_deleted" AS "pp_is_deleted", "pp"."created_at" AS "pp_created_at", "pp"."updated_at" AS "pp_updated_at", "pp"."room_group_plan_id" AS "pp_room_group_plan_id" FROM "t_room_group_plan_price" "pp" WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."room_group_plan_price_id" != $4) AND ("pp"."is_deleted" = $5)) ORDER BY "pp"."start_date" ASC LIMIT 1 OFFSET 0
  ```
- **buildRoomRowsQuery({store_id: 's1', floor: null, room_group_id: null}, 20, 0) — 필터 없음** — parameters `["s1"]`
  ```text
  SELECT "r"."room_id" AS "room_id", "r"."room_group_id" AS "room_group_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."created_at" AS "created_at", "g"."room_group_name" AS "room_group_name", "st"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "st" ON "st"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 20 OFFSET 0
  ```
- **buildRoomRowsQuery({store_id: 's1', floor: -1, room_group_id: 'g1'}, 10, 20) — 필터 있음** — parameters `["s1",-1,"g1"]`
  ```text
  SELECT "r"."room_id" AS "room_id", "r"."room_group_id" AS "room_group_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."created_at" AS "created_at", "g"."room_group_name" AS "room_group_name", "st"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "st" ON "st"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 AND "r"."floor" = $2 AND "r"."room_group_id" = $3 ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 10 OFFSET 20
  ```
- **buildRoomRowsQuery({store_id: 's1', floor: 0, room_group_id: null}, 20, 0) — 층 0 도 필터** — parameters `["s1",0]`
  ```text
  SELECT "r"."room_id" AS "room_id", "r"."room_group_id" AS "room_group_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."created_at" AS "created_at", "g"."room_group_name" AS "room_group_name", "st"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "st" ON "st"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 AND "r"."floor" = $2 ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 20 OFFSET 0
  ```

별칭 단언용(`/ AS "([a-z_]+)"/g`, 서브쿼리 · 본 테이블 순서 그대로):
- RoomPlanRow: `['room_plan_id', 'store_id', 'room_plan_type_id', 'is_used', 'days_of_week', 'usage_hours', 'check_in_time', 'check_out_time', 'room_plan_type_name']`
- RoomGroupRow: `['room_group_id', 'room_group_name', 'created_at', 'room_count', 'cover_file_key']`
- RoomGroupPlanRow: `['room_group_plan_id', 'room_group_id', 'room_plan_type_id', 'is_used', 'price', 'room_plan_type_name']`
- RoomRow: `['room_id', 'room_group_id', 'room_name', 'floor', 'room_state_id', 'created_at', 'room_group_name', 'room_state_name']`

오류 변환 단언용(`QueryFailedError('…', [], Object.assign(new Error(), {code, constraint}))` — 형제 `constraintError`): UK 는 `'23505'`, 배타 제약은 `'23P01'` + `'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange'`(repository spec 의 `constraintError` 코드 타입에 `'23P01'` 을 더한다).
### Business Logic — service

`RoomService` 21개 메서드(spec 표 순서 · 이름 · 인자 그대로). 쓰기 15개는 `@Transactional()` + `findManagerStore(user_id, true)`(업체 행 잠금), 조회 · 업로드 주소 6개는 `findManagerStore(user_id, false)`. 그룹은 `store_id`, 사진 · 그룹 상품은 그 그룹, 기간 가격은 그 그룹 상품으로 찾고 없으면 404. 소프트 삭제 조건(`is_deleted = 0`)은 repository 가 붙인다(계약) — service 의 WHERE 에는 넣지 않는다.

이름 계약에 없던 두 이름은 B 섹션 파일에 들어 있다 — `room.util.ts` 의 `isSameTimeOfDay`(1박 · 연박 입실 = 퇴실 검사, 하루 안 시각은 기준일 위 dayjs 로 비교하고 room 은 store.util 을 import 할 수 없어 같은 구현을 둔다) · `room.constants.ts` 의 기간 가격 날짜 메시지 3개(등록 · 수정 두 메서드가 같은 문구 → 상수).

```ts
// apps/admin-service/src/room/room.service.ts — new
import {BadRequestException, Inject, Injectable, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {ILike} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {dayjs} from '@app/common/utils/dayjs.js';
import {generateId} from '@app/common/utils/id.js';
import {Pagination} from '@app/common/utils/pagination.js';
import {toContainsPattern} from '@app/common/utils/search.js';
import {createValidationError} from '@app/common/utils/validation.js';
import type {RoomGroupDetailResultDto} from '@app/contracts/room/dto/room-group-detail.dto.js';
import type {RoomGroupImageOrderDto} from '@app/contracts/room/dto/room-group-image-order.dto.js';
import type {RoomGroupImageUploadUrlDto, RoomGroupImageUploadUrlResultDto} from '@app/contracts/room/dto/room-group-image-upload-url.dto.js';
import type {RoomGroupImageDto, RoomGroupImageResultDto} from '@app/contracts/room/dto/room-group-image.dto.js';
import type {RoomGroupListDto, RoomGroupListResultDto} from '@app/contracts/room/dto/room-group-list.dto.js';
import type {RoomGroupPlanPriceListDto, RoomGroupPlanPriceListResultDto} from '@app/contracts/room/dto/room-group-plan-price-list.dto.js';
import type {RoomGroupPlanPriceUpdateDto} from '@app/contracts/room/dto/room-group-plan-price-update.dto.js';
import type {RoomGroupPlanPriceDto, RoomGroupPlanPriceResultDto} from '@app/contracts/room/dto/room-group-plan-price.dto.js';
import type {RoomGroupPlanUpdateDto} from '@app/contracts/room/dto/room-group-plan-update.dto.js';
import type {RoomGroupUpdateDto} from '@app/contracts/room/dto/room-group-update.dto.js';
import type {RoomGroupDto, RoomGroupResultDto} from '@app/contracts/room/dto/room-group.dto.js';
import type {RoomListDto, RoomListResultDto} from '@app/contracts/room/dto/room-list.dto.js';
import type {RoomPlanListResultDto} from '@app/contracts/room/dto/room-plan-list.dto.js';
import type {RoomPlanUpdateDto} from '@app/contracts/room/dto/room-plan-update.dto.js';
import type {RoomStateDto} from '@app/contracts/room/dto/room-state.dto.js';
import type {RoomUpdateDto} from '@app/contracts/room/dto/room-update.dto.js';
import type {RoomDto, RoomResultDto} from '@app/contracts/room/dto/room.dto.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import type {StorageGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
import type {RoomListFilter, RoomRepositoryInterface} from './interfaces/room.repository.interface.js';
import {
    ROOM_DATE_FORMAT,
    ROOM_FILE_KEY_INVALID_MESSAGE,
    ROOM_FILE_NOT_UPLOADED_MESSAGE,
    ROOM_GROUP_IMAGE_LIMIT,
    ROOM_GROUP_IMAGE_LIMIT_MESSAGE,
    ROOM_GROUP_IMAGE_NOT_FOUND_MESSAGE,
    ROOM_GROUP_NOT_FOUND_MESSAGE,
    ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE,
    ROOM_NOT_FOUND_MESSAGE,
    ROOM_PLAN_NOT_FOUND_MESSAGE,
    ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE,
    ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE,
    ROOM_PLAN_PRICE_NOT_FOUND_MESSAGE,
    ROOM_PLAN_PRICE_OVERLAP_MESSAGE,
    ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE,
    ROOM_PLAN_TYPE,
    ROOM_PLAN_TYPE_ORDER,
    ROOM_STATE,
    ROOM_STATE_CHANGE_INVALID_MESSAGE,
} from './room.constants.js';
import {ROOM_REPOSITORY} from './room.symbols.js';
import {
    buildPlanPriceOverlapWhere,
    buildRoomGroupDetail,
    buildRoomGroupImageKey,
    canChangeRoomState,
    isRoomGroupImageKey,
    isSameIdSet,
    isSameTimeOfDay,
    isValidDate,
    nextSortOrder,
    sortByPlanType,
    toRoomGroupDetail,
    toRoomGroupImageItem,
    toRoomGroupListItem,
    toRoomGroupPlanItem,
    toRoomGroupPlanPriceItem,
    toRoomListItem,
    toRoomPlanItem,
} from './room.util.js';

/**
 * room 도메인 비즈니스 로직 (헥사고날의 안쪽) — 업체 관리자(업체 총관리자 · 업체 관리자)가 내 업체의 상품 설정 · 객실 그룹(상세정보 · 사진) · 그룹 상품 · 기간 가격 · 호실 · 호실 상태를 관리한다.
 * 내부 HTTP 컨트롤러와 RabbitMQ 핸들러가 같은 메서드를 호출한다. public 메서드 1개 = API 1개.
 * 모든 메서드는 actor 로 소속 업체를 먼저 찾고(findManagerStore), 쓰기는 업체 행을 잠가 같은 업체의 객실 쓰기(한도 · 겹침 검사)를 한 번에 하나로 한다.
 * 남의 업체 것은 없는 것과 같다 — 그룹은 업체, 사진 · 그룹 상품은 그 그룹, 기간 가격은 그 그룹 상품 조건으로 찾고 없으면 404.
 * 그룹 사진은 모두 공개라 열람 주소는 CDN 공개 주소(getPublicUrl)다.
 */
@Injectable()
export class RoomService {
    /**
     * @param roomRepository room repository 포트
     * @param storageGateway 파일 저장소 포트 (Amazon S3 · CloudFront 공개 주소)
     */
    constructor(
        @Inject(ROOM_REPOSITORY)
        private readonly roomRepository: RoomRepositoryInterface,
        @Inject(STORAGE_GATEWAY)
        private readonly storageGateway: StorageGatewayInterface,
    ) {}

    /**
     * 업체 상품 설정 목록 — 상품 종류 3행(시간 이용 · 1박 · 연박 순). (내부 HTTP: GET /internal/v1/admin-service/room/plan)
     *
     * @param user_id 로그인 매니저 ID
     * @returns 상품 설정 목록
     */
    async getMyRoomPlans(user_id: string): Promise<RoomPlanListResultDto> {
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const rows = await this.roomRepository.findRoomPlanRows(store.store_id);
        return {list: sortByPlanType(rows).map(toRoomPlanItem)};
    }

    /**
     * 업체 상품 설정 수정 — 종류별. 사용 여부 · 예약 가능 요일은 모든 종류, 종류에 필요한 값은 service 가 가른다(CHK_RoomPlan_UsageHoursCheckInOutTime 과 같은 조합). (RabbitMQ: admin.room.plan-update)
     * - 시간 이용(HOURLY): 이용 시간 필수(없으면 400 validation_errors.usage_hours), 입실 · 퇴실 시각은 보내도 NULL
     * - 1박 · 연박: 입실 · 퇴실 시각 필수(없는 필드로 400), 둘이 같으면 400(validation_errors.check_out_time), 이용 시간은 NULL
     *
     * @param user_id 로그인 매니저 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param dto 사용 여부 · 예약 가능 요일 · 이용 시간 · 입실 · 퇴실 시각
     */
    @Transactional()
    async updateMyRoomPlan(user_id: string, room_plan_type_id: string, dto: RoomPlanUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그 종류 행 (입점 승인 때 3행 — 늘 있다)
        const plan = await this.roomRepository.findRoomPlan({store_id: store.store_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 3. 모든 종류 공통
        const entity = new RoomPlanEntity();
        entity.is_used = dto.is_used;
        entity.days_of_week = dto.days_of_week;

        // 4. 종류별 값 — 시간 이용은 이용 시간만, 1박 · 연박은 입실 · 퇴실 시각만
        if (room_plan_type_id === ROOM_PLAN_TYPE.HOURLY) {
            const usage_hours = dto.usage_hours ?? null;
            if (usage_hours === null) {
                throw new BadRequestException({message: '시간 이용은 이용 시간을 입력해주세요.', validation_errors: createValidationError('usage_hours', '시간 이용은 이용 시간을 입력해주세요.')});
            }
            entity.usage_hours = usage_hours;
            entity.check_in_time = null;
            entity.check_out_time = null;
        } else {
            const check_in_time = dto.check_in_time ?? null;
            const check_out_time = dto.check_out_time ?? null;
            if (check_in_time === null) {
                throw new BadRequestException({message: '입실 시각을 입력해주세요.', validation_errors: createValidationError('check_in_time', '입실 시각을 입력해주세요.')});
            }
            if (check_out_time === null) {
                throw new BadRequestException({message: '퇴실 시각을 입력해주세요.', validation_errors: createValidationError('check_out_time', '퇴실 시각을 입력해주세요.')});
            }
            if (isSameTimeOfDay(check_in_time, check_out_time)) {
                throw new BadRequestException({message: '입실과 퇴실 시각이 같을 수 없습니다.', validation_errors: createValidationError('check_out_time', '입실과 퇴실 시각이 같을 수 없습니다.')});
            }
            entity.usage_hours = null;
            entity.check_in_time = check_in_time;
            entity.check_out_time = check_out_time;
        }

        // 5. 수정
        await this.roomRepository.updateRoomPlan({room_plan_id: plan.room_plan_id}, entity);
    }

    /**
     * 객실 그룹 목록 — 검색어(그룹명 부분 일치), 등록일 최신순. 지워지지 않은 호실 수 · 대표 사진(CDN 공개 주소 또는 null) 포함. (내부 HTTP: GET /internal/v1/admin-service/room/group)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 페이지 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getMyRoomGroups(user_id: string, dto: RoomGroupListDto): Promise<RoomGroupListResultDto> {
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const where: FindOptionsWhere<RoomGroupEntity> = dto.keyword ? {store_id: store.store_id, room_group_name: ILike(toContainsPattern(dto.keyword))} : {store_id: store.store_id};
        const total_count = await this.roomRepository.countRoomGroups(where);
        const pagination = new Pagination({...dto, total_count});
        const rows = await this.roomRepository.findRoomGroupRows(where, pagination.limit, pagination.offset);
        return {list: rows.map((row) => toRoomGroupListItem(row, row.cover_file_key ? this.storageGateway.getPublicUrl(row.cover_file_key) : null)), pagination: pagination.getPagination()};
    }

    /**
     * 객실 그룹 상세 — 그룹 · 상세정보(항목 모두) · 사진(순서대로, CDN 공개 주소) · 그룹 상품 3행(시간 이용 · 1박 · 연박 순). (내부 HTTP: GET /internal/v1/admin-service/room/group/:room_group_id)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @returns 그룹 상세
     */
    async getMyRoomGroup(user_id: string, room_group_id: string): Promise<RoomGroupDetailResultDto> {
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const images = await this.roomRepository.findRoomGroupImages(room_group_id);
        const plans = await this.roomRepository.findRoomGroupPlanRows(room_group_id);
        return toRoomGroupDetail(
            group,
            images.map((image) => toRoomGroupImageItem(image, this.storageGateway.getPublicUrl(image.file_key))),
            sortByPlanType(plans).map(toRoomGroupPlanItem),
        );
    }

    /**
     * 객실 그룹 등록 — 그룹 + 그룹 상품 3행(사용 안 함 · 요금 0)을 같은 트랜잭션에서 만든다. (RabbitMQ: admin.room.group-create)
     * - 상세정보는 보낸 알려진 항목 + 지금 기본값으로 전부 저장한다(선언 안 된 키는 버린다 — 사용자 결정 2026-10-31)
     * - 같은 업체의 지워지지 않은 그룹명이면 repository 가 400(UK_RoomGroup_StoreIdRoomGroupName — 선검사 없음)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 그룹명 · 설명 · 상세정보
     * @returns 객실 그룹 ID
     */
    @Transactional()
    async createMyRoomGroup(user_id: string, dto: RoomGroupDto): Promise<RoomGroupResultDto> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그룹 — 설명은 비우면 null, 상세정보는 알려진 항목 + 기본값
        const group = new RoomGroupEntity();
        group.room_group_id = generateId();
        group.store_id = store.store_id;
        group.room_group_name = dto.room_group_name;
        group.description = dto.description || null;
        group.room_group_detail = buildRoomGroupDetail(dto.room_group_detail);
        group.is_deleted = 0;
        await this.roomRepository.insertRoomGroup(group);

        // 3. 그룹 상품 3행 — 사용 안 함 · 요금 0 (요금은 그룹 상품 수정으로)
        const plans = ROOM_PLAN_TYPE_ORDER.map((room_plan_type_id) => {
            const plan = new RoomGroupPlanEntity();
            plan.room_group_plan_id = generateId();
            plan.room_group_id = group.room_group_id;
            plan.room_plan_type_id = room_plan_type_id;
            plan.is_used = 0;
            plan.price = 0;
            return plan;
        });
        await this.roomRepository.insertRoomGroupPlans(plans);
        return {room_group_id: group.room_group_id};
    }

    /**
     * 객실 그룹 수정 — 그룹명 · 설명(비우면 null) · 상세정보(보내면 알려진 항목 + 기본값으로 통째로, 안 보내면 그대로). (RabbitMQ: admin.room.group-update)
     * - 같은 업체의 지워지지 않은 다른 그룹명이면 repository 가 400(UK_RoomGroup_StoreIdRoomGroupName)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param dto 그룹명 · 설명 · 상세정보
     */
    @Transactional()
    async updateMyRoomGroup(user_id: string, room_group_id: string, dto: RoomGroupUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 수정 — 상세정보는 보냈을 때만(안 보내면 undefined 라 update 가 건드리지 않는다)
        const entity = new RoomGroupEntity();
        entity.room_group_name = dto.room_group_name;
        entity.description = dto.description || null;
        if (dto.room_group_detail) {
            entity.room_group_detail = buildRoomGroupDetail(dto.room_group_detail);
        }
        await this.roomRepository.updateRoomGroup({room_group_id: group.room_group_id}, entity);
    }

    /**
     * 객실 그룹 삭제 — 그룹 · 그 그룹의 호실 · 사진을 소프트 삭제하고(사용자 결정 2026-10-31) 사진 저장소 파일을 실제로 지운다(마지막). 그룹 상품 · 기간 가격 행은 남지만 그룹이 지워져 닿을 수 없다. (RabbitMQ: admin.room.group-delete)
     * - 미래 예약 확인은 예약 기능(Phase 17)이 생길 때
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     */
    @Transactional()
    async deleteMyRoomGroup(user_id: string, room_group_id: string): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 지울 저장소 파일 키
        const images = await this.roomRepository.findRoomGroupImages(group.room_group_id);

        // 4. 호실 → 사진 → 그룹 소프트 삭제(is_deleted = 1)
        await this.roomRepository.deleteRooms({room_group_id: group.room_group_id});
        await this.roomRepository.deleteRoomGroupImages({room_group_id: group.room_group_id});
        await this.roomRepository.deleteRoomGroup({room_group_id: group.room_group_id});

        // 5. 저장소 파일 삭제 (마지막)
        for (const image of images) {
            await this.storageGateway.remove(image.file_key);
        }
    }

    /**
     * 객실 그룹 사진 업로드 주소 — 그룹마다 사진 한도(ROOM_GROUP_IMAGE_LIMIT) 안에서만. 키는 서버가 `store/<store_id>/room-group/<room_group_id>/<uuid 32자>.<jpg|png>`(공개 — CDN)로 만든다. (내부 HTTP: POST /internal/v1/admin-service/room/group/:room_group_id/image/upload-url)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param dto MIME 타입
     * @returns 저장 키 · 업로드 주소 · 만료 시각
     */
    async createMyRoomGroupImageUploadUrl(user_id: string, room_group_id: string, dto: RoomGroupImageUploadUrlDto): Promise<RoomGroupImageUploadUrlResultDto> {
        // 1. 내 업체
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 한도
        const images = await this.roomRepository.findRoomGroupImages(group.room_group_id);
        if (images.length >= ROOM_GROUP_IMAGE_LIMIT) {
            throw new BadRequestException({message: ROOM_GROUP_IMAGE_LIMIT_MESSAGE});
        }

        // 4. 키 → 업로드 주소
        const file_key = buildRoomGroupImageKey(store.store_id, group.room_group_id, dto.content_type);
        const upload = await this.storageGateway.createUploadUrl({key: file_key, content_type: dto.content_type});
        return {file_key, upload_url: upload.upload_url, expires_at: upload.expires_at.toISOString()};
    }

    /**
     * 객실 그룹 사진 등록 — 업로드 주소로 올린 사진의 키를 그룹에 붙인다. (RabbitMQ: admin.room.group-image)
     * - 키 모양(그 업체 · 그룹 · 형식) · 한도 · 실제 업로드(exists) 확인
     * - 정렬 순서는 지금 사진의 가장 큰 순서 + 1 — 삭제로 빈 번호가 있어도 마지막에 붙는다
     * - 같은 키면 repository 가 400(UK_RoomGroupImage_FileKey)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param dto 키 · 파일명 · MIME 타입
     * @returns 객실 그룹 사진 ID
     */
    @Transactional()
    async addMyRoomGroupImage(user_id: string, room_group_id: string, dto: RoomGroupImageDto): Promise<RoomGroupImageResultDto> {
        // 1. 내 업체 (잠금 — 한도 확인 · 등록을 한 번에 하나)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 키 모양 — 그 업체 · 그룹 · 형식으로 발급한 키만
        if (!isRoomGroupImageKey(dto.file_key, store.store_id, group.room_group_id, dto.content_type)) {
            throw new BadRequestException({message: ROOM_FILE_KEY_INVALID_MESSAGE, validation_errors: createValidationError('file_key', ROOM_FILE_KEY_INVALID_MESSAGE)});
        }

        // 4. 한도
        const images = await this.roomRepository.findRoomGroupImages(group.room_group_id);
        if (images.length >= ROOM_GROUP_IMAGE_LIMIT) {
            throw new BadRequestException({message: ROOM_GROUP_IMAGE_LIMIT_MESSAGE});
        }

        // 5. 실제로 올라갔는지
        const uploaded = await this.storageGateway.exists(dto.file_key);
        if (!uploaded) {
            throw new BadRequestException({message: ROOM_FILE_NOT_UPLOADED_MESSAGE});
        }

        // 6. 사진 등록 — 마지막 순서
        const image = new RoomGroupImageEntity();
        image.room_group_image_id = generateId();
        image.room_group_id = group.room_group_id;
        image.file_key = dto.file_key;
        image.file_name = dto.file_name;
        image.content_type = dto.content_type;
        image.sort_order = nextSortOrder(images);
        image.is_deleted = 0;
        await this.roomRepository.insertRoomGroupImage(image);
        return {room_group_image_id: image.room_group_image_id};
    }

    /**
     * 객실 그룹 사진 순서 변경 — 지금 사진 ID 전부를 원하는 순서로 받아 0 부터 다시 매긴다(가장 앞이 대표). (RabbitMQ: admin.room.group-image-order)
     * - 빠지거나 남거나 겹치면 400 (validation_errors.room_group_image_ids)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param dto 사진 ID 순서
     */
    @Transactional()
    async reorderMyRoomGroupImages(user_id: string, room_group_id: string, dto: RoomGroupImageOrderDto): Promise<void> {
        // 1. 내 업체 (잠금 — 등록 · 삭제와 엇갈리지 않게)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 지금 사진 전부를 한 번씩
        const images = await this.roomRepository.findRoomGroupImages(group.room_group_id);
        const current = images.map((image) => image.room_group_image_id);
        if (!isSameIdSet(dto.room_group_image_ids, current)) {
            throw new BadRequestException({
                message: '그룹 사진 전체를 한 번씩 원하는 순서로 보내주세요.',
                validation_errors: createValidationError('room_group_image_ids', '그룹 사진 전체를 한 번씩 원하는 순서로 보내주세요.'),
            });
        }

        // 4. 받은 순서대로 0 부터
        for (const [index, room_group_image_id] of dto.room_group_image_ids.entries()) {
            const image = new RoomGroupImageEntity();
            image.sort_order = index;
            await this.roomRepository.updateRoomGroupImage({room_group_image_id}, image);
        }
    }

    /**
     * 객실 그룹 사진 삭제 — 그 그룹의 사진만. 행을 소프트 삭제(is_deleted = 1)한 뒤 저장소 파일을 실제로 지운다(마지막). 남은 사진의 순서 번호는 그대로. (RabbitMQ: admin.room.group-image-delete)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_group_image_id 객실 그룹 사진 ID
     */
    @Transactional()
    async deleteMyRoomGroupImage(user_id: string, room_group_id: string, room_group_image_id: string): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 그 그룹의 사진
        const image = await this.roomRepository.findRoomGroupImage({room_group_image_id, room_group_id: group.room_group_id});
        if (!image) {
            throw new NotFoundException({message: ROOM_GROUP_IMAGE_NOT_FOUND_MESSAGE});
        }

        // 4. 행 소프트 삭제 → 저장소 파일 삭제(마지막)
        await this.roomRepository.deleteRoomGroupImage({room_group_image_id: image.room_group_image_id});
        await this.storageGateway.remove(image.file_key);
    }

    /**
     * 그룹 상품 수정 — 종류별 사용 여부 · 기본 요금. 판매 = 업체 상품 설정 is_used AND 그룹 상품 is_used(예약 — Phase 17). (RabbitMQ: admin.room.group-plan-update)
     * - 판매(is_used 1)인데 요금 0 이면 400 (validation_errors.price)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param dto 사용 여부 · 기본 요금
     */
    @Transactional()
    async updateMyRoomGroupPlan(user_id: string, room_group_id: string, room_plan_type_id: string, dto: RoomGroupPlanUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 그 그룹의 그 종류 그룹 상품 (그룹을 만들 때 3행 — 늘 있다)
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 4. 판매면 요금 1원 이상
        if (dto.is_used === 1 && dto.price === 0) {
            throw new BadRequestException({message: '판매하려면 요금을 1원 이상 입력해주세요.', validation_errors: createValidationError('price', '판매하려면 요금을 1원 이상 입력해주세요.')});
        }

        // 5. 수정
        const entity = new RoomGroupPlanEntity();
        entity.is_used = dto.is_used;
        entity.price = dto.price;
        await this.roomRepository.updateRoomGroupPlan({room_group_plan_id: plan.room_group_plan_id}, entity);
    }

    /**
     * 상품별 기간 가격 목록 — 그룹 상품(그룹 × 종류)의 지워지지 않은 기간 가격, 시작 날짜 순. (내부 HTTP: GET /internal/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getMyRoomGroupPlanPrices(user_id: string, room_group_id: string, room_plan_type_id: string, dto: RoomGroupPlanPriceListDto): Promise<RoomGroupPlanPriceListResultDto> {
        // 1. 내 업체
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹 → 그 종류 그룹 상품
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 3. count → Pagination → 목록
        const where: FindOptionsWhere<RoomGroupPlanPriceEntity> = {room_group_plan_id: plan.room_group_plan_id};
        const total_count = await this.roomRepository.countRoomGroupPlanPrices(where);
        const pagination = new Pagination({...dto, total_count});
        const prices = await this.roomRepository.findRoomGroupPlanPriceList(where, pagination.limit, pagination.offset);
        return {list: prices.map(toRoomGroupPlanPriceItem), pagination: pagination.getPagination()};
    }

    /**
     * 상품별 기간 가격 등록 — 한국 날짜 범위(시작 · 종료 둘 다 포함) 동안 기본 요금 대신 쓴다. (RabbitMQ: admin.room.group-plan-price)
     * - 없는 날짜(02-30 — dayjs strict)는 그 필드로 400, 종료 < 시작이면 400(validation_errors.end_date — 같은 날은 된다)
     * - 같은 그룹 상품의 지워지지 않은 다른 기간과 겹치면 400 — 업체 행 잠금 아래에서 먼저 세고, DB 배타 제약(EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange) 위반도 repository 가 같은 400 으로 바꾼다
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param dto 시작 · 종료 날짜 · 요금 · 메모
     * @returns 기간 가격 ID
     */
    @Transactional()
    async addMyRoomGroupPlanPrice(user_id: string, room_group_id: string, room_plan_type_id: string, dto: RoomGroupPlanPriceDto): Promise<RoomGroupPlanPriceResultDto> {
        // 1. 내 업체 (잠금 — 겹침 확인 · 등록을 한 번에 하나)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹 → 그 종류 그룹 상품
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 3. 날짜 — strict 파싱이라 없는 날짜(02-30 · 13월)는 거부, 종료가 시작보다 이르면 거부(같은 날은 된다)
        if (!isValidDate(dto.start_date)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE, validation_errors: createValidationError('start_date', ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE)});
        }
        if (!isValidDate(dto.end_date)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE, validation_errors: createValidationError('end_date', ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE)});
        }
        const startDate = dayjs(dto.start_date, ROOM_DATE_FORMAT, true);
        const endDate = dayjs(dto.end_date, ROOM_DATE_FORMAT, true);
        if (endDate.isBefore(startDate)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE, validation_errors: createValidationError('end_date', ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE)});
        }

        // 4. 같은 그룹 상품의 다른 기간과 겹침 (둘 다 포함 — 시작 <= 새 종료 AND 종료 >= 새 시작)
        const overlapping = await this.roomRepository.countRoomGroupPlanPrices(buildPlanPriceOverlapWhere(plan.room_group_plan_id, dto.start_date, dto.end_date, null));
        if (overlapping > 0) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_OVERLAP_MESSAGE});
        }

        // 5. 등록 — 메모는 비우면 null
        const planPrice = new RoomGroupPlanPriceEntity();
        planPrice.room_group_plan_price_id = generateId();
        planPrice.room_group_plan_id = plan.room_group_plan_id;
        planPrice.start_date = dto.start_date;
        planPrice.end_date = dto.end_date;
        planPrice.price = dto.price;
        planPrice.memo = dto.memo || null;
        planPrice.is_deleted = 0;
        await this.roomRepository.insertRoomGroupPlanPrice(planPrice);
        return {room_group_plan_price_id: planPrice.room_group_plan_price_id};
    }

    /**
     * 상품별 기간 가격 수정 — 등록과 같은 필드를 통째로. 겹침 검사는 자기 자신을 뺀다(사용자 결정 2026-10-31). (RabbitMQ: admin.room.group-plan-price-update)
     * - 그 그룹 상품의 지워지지 않은 기간 가격만(없거나 남의 것 404)
     * - 날짜 · 겹침 규칙은 등록과 같다(DB 배타 제약 위반도 repository 가 같은 400)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param room_group_plan_price_id 기간 가격 ID
     * @param dto 시작 · 종료 날짜 · 요금 · 메모
     */
    @Transactional()
    async updateMyRoomGroupPlanPrice(user_id: string, room_group_id: string, room_plan_type_id: string, room_group_plan_price_id: string, dto: RoomGroupPlanPriceUpdateDto): Promise<void> {
        // 1. 내 업체 (잠금 — 겹침 확인 · 수정을 한 번에 하나)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹 → 그 종류 그룹 상품 → 그 그룹 상품의 기간 가격
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }
        const planPrice = await this.roomRepository.findRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id: plan.room_group_plan_id});
        if (!planPrice) {
            throw new NotFoundException({message: ROOM_PLAN_PRICE_NOT_FOUND_MESSAGE});
        }

        // 3. 날짜 — 등록과 같다
        if (!isValidDate(dto.start_date)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE, validation_errors: createValidationError('start_date', ROOM_PLAN_PRICE_START_DATE_INVALID_MESSAGE)});
        }
        if (!isValidDate(dto.end_date)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE, validation_errors: createValidationError('end_date', ROOM_PLAN_PRICE_END_DATE_INVALID_MESSAGE)});
        }
        const startDate = dayjs(dto.start_date, ROOM_DATE_FORMAT, true);
        const endDate = dayjs(dto.end_date, ROOM_DATE_FORMAT, true);
        if (endDate.isBefore(startDate)) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE, validation_errors: createValidationError('end_date', ROOM_PLAN_PRICE_DATE_ORDER_MESSAGE)});
        }

        // 4. 같은 그룹 상품의 다른 기간과 겹침 — 자기 자신 제외
        const overlapping = await this.roomRepository.countRoomGroupPlanPrices(buildPlanPriceOverlapWhere(plan.room_group_plan_id, dto.start_date, dto.end_date, planPrice.room_group_plan_price_id));
        if (overlapping > 0) {
            throw new BadRequestException({message: ROOM_PLAN_PRICE_OVERLAP_MESSAGE});
        }

        // 5. 수정 — 메모는 비우면 null
        const entity = new RoomGroupPlanPriceEntity();
        entity.start_date = dto.start_date;
        entity.end_date = dto.end_date;
        entity.price = dto.price;
        entity.memo = dto.memo || null;
        await this.roomRepository.updateRoomGroupPlanPrice({room_group_plan_price_id: planPrice.room_group_plan_price_id}, entity);
    }

    /**
     * 상품별 기간 가격 삭제 — 그 그룹 상품의 것만 소프트 삭제(행은 남고 목록 · 겹침에서 빠진다), 없으면 404(남의 것 · 이미 삭제된 것 포함). (RabbitMQ: admin.room.group-plan-price-delete)
     *
     * @param user_id 로그인 매니저 ID
     * @param room_group_id 객실 그룹 ID
     * @param room_plan_type_id 상품 종류 (HOURLY · NIGHT · LONG)
     * @param room_group_plan_price_id 기간 가격 ID
     */
    @Transactional()
    async deleteMyRoomGroupPlanPrice(user_id: string, room_group_id: string, room_plan_type_id: string, room_group_plan_price_id: string): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹 → 그 종류 그룹 상품
        const group = await this.roomRepository.findRoomGroup({room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }
        const plan = await this.roomRepository.findRoomGroupPlan({room_group_id: group.room_group_id, room_plan_type_id});
        if (!plan) {
            throw new NotFoundException({message: ROOM_PLAN_NOT_FOUND_MESSAGE});
        }

        // 3. 소프트 삭제 — 0건이면 없는 것
        const deleted = await this.roomRepository.deleteRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id: plan.room_group_plan_id});
        if (!deleted) {
            throw new NotFoundException({message: ROOM_PLAN_PRICE_NOT_FOUND_MESSAGE});
        }
    }

    /**
     * 호실 목록 — 필터(층 · 그룹), 층 · 호실명 순. 그룹명 · 상태명 포함. (내부 HTTP: GET /internal/v1/admin-service/room)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 페이지 · 층 · 그룹
     * @returns 목록 · 페이지 정보
     */
    async getMyRooms(user_id: string, dto: RoomListDto): Promise<RoomListResultDto> {
        // 1. 내 업체
        const store = await this.roomRepository.findManagerStore(user_id, false);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 필터 — 층은 정수 문자열(DTO 가 형식을 본다)
        const filter: RoomListFilter = {store_id: store.store_id, floor: dto.floor ? Number(dto.floor) : null, room_group_id: dto.room_group_id ?? null};
        const where: FindOptionsWhere<RoomEntity> = {
            store_id: filter.store_id,
            ...(filter.floor === null ? {} : {floor: filter.floor}),
            ...(filter.room_group_id === null ? {} : {room_group_id: filter.room_group_id}),
        };

        // 3. count → Pagination → 목록
        const total_count = await this.roomRepository.countRooms(where);
        const pagination = new Pagination({...dto, total_count});
        const rows = await this.roomRepository.findRoomRows(filter, pagination.limit, pagination.offset);
        return {list: rows.map(toRoomListItem), pagination: pagination.getPagination()};
    }

    /**
     * 호실 등록 — 그 업체의 지워지지 않은 그룹에, 상태는 예약가능(AVAILABLE). 업체는 그룹의 업체(= 내 업체). (RabbitMQ: admin.room.create)
     * - 업체 안 지워지지 않은 호실명이면 repository 가 400(UK_Room_StoreIdRoomName)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 그룹 · 호실명 · 층
     * @returns 호실 ID
     */
    @Transactional()
    async createMyRoom(user_id: string, dto: RoomDto): Promise<RoomResultDto> {
        // 1. 내 업체 (잠금)
        const store = await this.roomRepository.findManagerStore(user_id, true);
        if (!store) {
            throw new NotFoundException({message: ROOM_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id: dto.room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 3. 호실 등록 — 예약가능
        const room = new RoomEntity();
        room.room_id = generateId();
        room.store_id = store.store_id;
        room.room_group_id = group.room_group_id;
        room.room_state_id = ROOM_STATE.AVAILABLE;
        room.room_name = dto.room_name;
        room.floor = dto.floor;
        room.is_deleted = 0;
        await this.roomRepository.insertRoom(room);
        return {room_id: room.room_id};
    }

    /**
     * 호실 수정 — 그룹 · 호실명 · 층을 통째로(그룹 이동은 같은 업체 그룹만). (RabbitMQ: admin.room.update)
     * - 업체 안 지워지지 않은 다른 호실명이면 repository 가 400(UK_Room_StoreIdRoomName)
     * - 미래 예약이 있는 호실의 그룹 이동 제한은 예약 기능(Phase 17)이 생길 때
     *
     * @param user_id 로그인 매니저 ID
     * @param room_id 호실 ID
     * @param dto 그룹 · 호실명 · 층
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

        // 3. 옮길 그룹 — 그 업체의 지워지지 않은 그룹
        const group = await this.roomRepository.findRoomGroup({room_group_id: dto.room_group_id, store_id: store.store_id});
        if (!group) {
            throw new NotFoundException({message: ROOM_GROUP_NOT_FOUND_MESSAGE});
        }

        // 4. 수정
        const entity = new RoomEntity();
        entity.room_group_id = group.room_group_id;
        entity.room_name = dto.room_name;
        entity.floor = dto.floor;
        await this.roomRepository.updateRoom({room_id: room.room_id}, entity);
    }

    /**
     * 호실 삭제 — 그 업체의 호실만 소프트 삭제(is_deleted = 1). (RabbitMQ: admin.room.delete)
     * - 미래 예약 확인은 예약 기능(Phase 17)이 생길 때
     *
     * @param user_id 로그인 매니저 ID
     * @param room_id 호실 ID
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
        await this.roomRepository.deleteRoom({room_id: room.room_id});
    }

    /**
     * 호실 상태 변경 — 업체 관리자가 바꿀 수 있는 전환만(canChangeRoomState: 정비중 → 예약가능 · 예약가능/정비중 → 사용중지 · 사용중지 → 예약가능). (RabbitMQ: admin.room.state)
     * - 그 밖(예약완료 · 사용중에서, 같은 상태로)은 400 — 입력은 DTO 가 AVAILABLE · DISABLED 만 받는다
     *
     * @param user_id 로그인 매니저 ID
     * @param room_id 호실 ID
     * @param dto 바꿀 상태 (AVAILABLE · DISABLED)
     */
    @Transactional()
    async changeMyRoomState(user_id: string, room_id: string, dto: RoomStateDto): Promise<void> {
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

        // 3. 전환 표
        if (!canChangeRoomState(room.room_state_id, dto.room_state_id)) {
            throw new BadRequestException({message: ROOM_STATE_CHANGE_INVALID_MESSAGE});
        }

        // 4. 상태
        const entity = new RoomEntity();
        entity.room_state_id = dto.room_state_id;
        await this.roomRepository.updateRoom({room_id: room.room_id}, entity);
    }
}
```

호출 모양 요약(D 섹션 spec 단언용 — 코드와 같다):

| 메서드 | 잠금 | repository 호출 순서 (인자) | 저장소 |
|---|---|---|---|
| getMyRoomPlans | false | findRoomPlanRows(store_id) → sortByPlanType | — |
| updateMyRoomPlan | true | findRoomPlan({store_id, room_plan_type_id}) → updateRoomPlan({room_plan_id}, RoomPlanEntity) | — |
| getMyRoomGroups | false | countRoomGroups(where) → findRoomGroupRows(where, limit, offset) — where = `{store_id}` 또는 `{store_id, room_group_name: ILike(toContainsPattern(keyword))}` | getPublicUrl(cover_file_key) (null 이면 호출 없음) |
| getMyRoomGroup | false | findRoomGroup({room_group_id, store_id}) → findRoomGroupImages(id) → findRoomGroupPlanRows(id) | getPublicUrl × 사진 수 |
| createMyRoomGroup | true | insertRoomGroup(RoomGroupEntity) → insertRoomGroupPlans([HOURLY, NIGHT, LONG]) | — |
| updateMyRoomGroup | true | findRoomGroup → updateRoomGroup({room_group_id}, RoomGroupEntity) | — |
| deleteMyRoomGroup | true | findRoomGroup → findRoomGroupImages → deleteRooms({room_group_id}) → deleteRoomGroupImages({room_group_id}) → deleteRoomGroup({room_group_id}) | remove × 사진 수 (마지막) |
| createMyRoomGroupImageUploadUrl | false | findRoomGroup → findRoomGroupImages(한도) | createUploadUrl({key, content_type}) |
| addMyRoomGroupImage | true | findRoomGroup → (키 모양) → findRoomGroupImages(한도) → insertRoomGroupImage | exists(file_key) (한도 뒤 · insert 앞) |
| reorderMyRoomGroupImages | true | findRoomGroup → findRoomGroupImages → updateRoomGroupImage({room_group_image_id}, {sort_order}) × n | — |
| deleteMyRoomGroupImage | true | findRoomGroup → findRoomGroupImage({room_group_image_id, room_group_id}) → deleteRoomGroupImage({room_group_image_id}) | remove(file_key) (마지막) |
| updateMyRoomGroupPlan | true | findRoomGroup → findRoomGroupPlan({room_group_id, room_plan_type_id}) → updateRoomGroupPlan({room_group_plan_id}, RoomGroupPlanEntity) | — |
| getMyRoomGroupPlanPrices | false | findRoomGroup → findRoomGroupPlan → countRoomGroupPlanPrices({room_group_plan_id}) → findRoomGroupPlanPriceList(같은 where, limit, offset) | — |
| addMyRoomGroupPlanPrice | true | findRoomGroup → findRoomGroupPlan → countRoomGroupPlanPrices(buildPlanPriceOverlapWhere(id, start, end, null)) → insertRoomGroupPlanPrice | — |
| updateMyRoomGroupPlanPrice | true | findRoomGroup → findRoomGroupPlan → findRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id}) → countRoomGroupPlanPrices(…, 자기 ID) → updateRoomGroupPlanPrice({room_group_plan_price_id}, entity) | — |
| deleteMyRoomGroupPlanPrice | true | findRoomGroup → findRoomGroupPlan → deleteRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id}) → false 면 404 | — |
| getMyRooms | false | countRooms({store_id, floor?, room_group_id?}) → findRoomRows({store_id, floor: number\|null, room_group_id: string\|null}, limit, offset) | — |
| createMyRoom | true | findRoomGroup({room_group_id: dto.room_group_id, store_id}) → insertRoom(RoomEntity — AVAILABLE) | — |
| updateMyRoom | true | findRoom({room_id, store_id}) → findRoomGroup({room_group_id: dto.room_group_id, store_id}) → updateRoom({room_id}, RoomEntity) | — |
| deleteMyRoom | true | findRoom({room_id, store_id}) → deleteRoom({room_id}) | — |
| changeMyRoomState | true | findRoom({room_id, store_id}) → canChangeRoomState → updateRoom({room_id}, {room_state_id}) | — |

### Entry Point — admin-service 컨트롤러 · 모듈

동기 6개는 `RoomController`(내부 HTTP), 큐 15개는 `RoomQueueController`(`@OnCommand` provider). 둘 다 service 위임만 한다. repository 클래스 위치는 형제 store 와 같은 `repositories/room.repository.ts` 로 둔다(계약은 클래스명 `RoomRepository` 만 정한다).

```ts
// apps/admin-service/src/room/controllers/room.controller.ts — new
import {Body, Controller, Get, HttpCode, Param, Post, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {RoomGroupDetailParamDto, RoomGroupDetailResultDto} from '@app/contracts/room/dto/room-group-detail.dto.js';
import {RoomGroupImageUploadUrlDto, RoomGroupImageUploadUrlParamDto, RoomGroupImageUploadUrlResultDto} from '@app/contracts/room/dto/room-group-image-upload-url.dto.js';
import {RoomGroupListDto, RoomGroupListResultDto} from '@app/contracts/room/dto/room-group-list.dto.js';
import {RoomGroupPlanPriceListDto, RoomGroupPlanPriceListParamDto, RoomGroupPlanPriceListResultDto} from '@app/contracts/room/dto/room-group-plan-price-list.dto.js';
import {RoomListDto, RoomListResultDto} from '@app/contracts/room/dto/room-list.dto.js';
import {RoomPlanListResultDto} from '@app/contracts/room/dto/room-plan-list.dto.js';
import {RoomService} from '../room.service.js';

/**
 * room 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로(조회 · 업로드 주소)만 받는다(외부 비공개, Swagger 없음). 로그인 매니저는 게이트웨이가 넘긴 actor 헤더에서 꺼낸다.
 * 정적 경로(`/plan` · `/group…`)를 먼저, 호실 목록 `/` 를 마지막에 선언한다.
 */
@Controller('/internal/v1/admin-service/room')
export class RoomController {
    /**
     * @param roomService room service
     */
    constructor(private readonly roomService: RoomService) {}

    /**
     * 업체 상품 설정 목록 (업체 관리자)
     */
    @Get('/plan')
    @HttpCode(200)
    async getMyRoomPlans(@InternalActor('user_id') user_id: string): Promise<RoomPlanListResultDto> {
        return this.roomService.getMyRoomPlans(user_id);
    }

    /**
     * 객실 그룹 목록 (업체 관리자)
     */
    @Get('/group')
    @HttpCode(200)
    async getMyRoomGroups(@InternalActor('user_id') user_id: string, @Query() query: RoomGroupListDto): Promise<RoomGroupListResultDto> {
        const dto = new RoomGroupListDto(query);
        return this.roomService.getMyRoomGroups(user_id, dto);
    }

    /**
     * 객실 그룹 상세 (업체 관리자)
     */
    @Get('/group/:room_group_id')
    @HttpCode(200)
    async getMyRoomGroup(@InternalActor('user_id') user_id: string, @Param() param: RoomGroupDetailParamDto): Promise<RoomGroupDetailResultDto> {
        return this.roomService.getMyRoomGroup(user_id, param.room_group_id);
    }

    /**
     * 객실 그룹 사진 업로드 주소 (업체 관리자)
     */
    @Post('/group/:room_group_id/image/upload-url')
    @HttpCode(200)
    async createMyRoomGroupImageUploadUrl(
        @InternalActor('user_id') user_id: string,
        @Param() param: RoomGroupImageUploadUrlParamDto,
        @Body() dto: RoomGroupImageUploadUrlDto,
    ): Promise<RoomGroupImageUploadUrlResultDto> {
        return this.roomService.createMyRoomGroupImageUploadUrl(user_id, param.room_group_id, dto);
    }

    /**
     * 상품별 기간 가격 목록 (업체 관리자)
     */
    @Get('/group/:room_group_id/plan/:room_plan_type_id/price')
    @HttpCode(200)
    async getMyRoomGroupPlanPrices(
        @InternalActor('user_id') user_id: string,
        @Param() param: RoomGroupPlanPriceListParamDto,
        @Query() query: RoomGroupPlanPriceListDto,
    ): Promise<RoomGroupPlanPriceListResultDto> {
        const dto = new RoomGroupPlanPriceListDto(query);
        return this.roomService.getMyRoomGroupPlanPrices(user_id, param.room_group_id, param.room_plan_type_id, dto);
    }

    /**
     * 호실 목록 (업체 관리자)
     */
    @Get('/')
    @HttpCode(200)
    async getMyRooms(@InternalActor('user_id') user_id: string, @Query() query: RoomListDto): Promise<RoomListResultDto> {
        const dto = new RoomListDto(query);
        return this.roomService.getMyRooms(user_id, dto);
    }
}
```

```ts
// apps/admin-service/src/room/controllers/room.controller.queue.ts — new
import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {RoomDeleteParamDto} from '@app/contracts/room/dto/room-delete.dto.js';
import type {RoomGroupDeleteParamDto} from '@app/contracts/room/dto/room-group-delete.dto.js';
import type {RoomGroupImageDeleteParamDto} from '@app/contracts/room/dto/room-group-image-delete.dto.js';
import type {RoomGroupImageOrderDto, RoomGroupImageOrderParamDto} from '@app/contracts/room/dto/room-group-image-order.dto.js';
import type {RoomGroupImageDto, RoomGroupImageParamDto, RoomGroupImageResultDto} from '@app/contracts/room/dto/room-group-image.dto.js';
import type {RoomGroupPlanPriceDeleteParamDto} from '@app/contracts/room/dto/room-group-plan-price-delete.dto.js';
import type {RoomGroupPlanPriceUpdateDto, RoomGroupPlanPriceUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-price-update.dto.js';
import type {RoomGroupPlanPriceDto, RoomGroupPlanPriceParamDto, RoomGroupPlanPriceResultDto} from '@app/contracts/room/dto/room-group-plan-price.dto.js';
import type {RoomGroupPlanUpdateDto, RoomGroupPlanUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-update.dto.js';
import type {RoomGroupUpdateDto, RoomGroupUpdateParamDto} from '@app/contracts/room/dto/room-group-update.dto.js';
import type {RoomGroupDto, RoomGroupResultDto} from '@app/contracts/room/dto/room-group.dto.js';
import type {RoomPlanUpdateDto, RoomPlanUpdateParamDto} from '@app/contracts/room/dto/room-plan-update.dto.js';
import type {RoomStateDto, RoomStateParamDto} from '@app/contracts/room/dto/room-state.dto.js';
import type {RoomUpdateDto, RoomUpdateParamDto} from '@app/contracts/room/dto/room-update.dto.js';
import type {RoomDto, RoomResultDto} from '@app/contracts/room/dto/room.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {RoomService} from '../room.service.js';

/**
 * room 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.room.*` 명령을 `@OnCommand` 로 받는다.
 * 봉투에서 입력을 꺼내 service 로 위임만 한다(로직 0). path param 은 게이트웨이가 payload 에 합쳐 보낸다(`{...param, ...dto}`).
 * 모두 업체 관리자 명령이라 actor 의 user_id 가 필요해 requireActor 로 꺼낸다.
 */
@Injectable()
export class RoomQueueController {
    /**
     * @param roomService room service
     */
    constructor(private readonly roomService: RoomService) {}

    /**
     * 업체 상품 설정 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.PLAN_UPDATE)
    async updateMyRoomPlan(command: MessageEnvelope<RoomPlanUpdateParamDto & RoomPlanUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoomPlan(requireActor(command).user_id, command.payload.room_plan_type_id, command.payload);
    }

    /**
     * 객실 그룹 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 객실 그룹 ID
     */
    @OnCommand(ROOM_COMMAND.GROUP_CREATE)
    async createMyRoomGroup(command: MessageEnvelope<RoomGroupDto>): Promise<RoomGroupResultDto> {
        return this.roomService.createMyRoomGroup(requireActor(command).user_id, command.payload);
    }

    /**
     * 객실 그룹 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.GROUP_UPDATE)
    async updateMyRoomGroup(command: MessageEnvelope<RoomGroupUpdateParamDto & RoomGroupUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoomGroup(requireActor(command).user_id, command.payload.room_group_id, command.payload);
    }

    /**
     * 객실 그룹 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(ROOM_COMMAND.GROUP_DELETE)
    async deleteMyRoomGroup(command: MessageEnvelope<RoomGroupDeleteParamDto>): Promise<void> {
        return this.roomService.deleteMyRoomGroup(requireActor(command).user_id, command.payload.room_group_id);
    }

    /**
     * 객실 그룹 사진 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     * @returns 객실 그룹 사진 ID
     */
    @OnCommand(ROOM_COMMAND.GROUP_IMAGE)
    async addMyRoomGroupImage(command: MessageEnvelope<RoomGroupImageParamDto & RoomGroupImageDto>): Promise<RoomGroupImageResultDto> {
        return this.roomService.addMyRoomGroupImage(requireActor(command).user_id, command.payload.room_group_id, command.payload);
    }

    /**
     * 객실 그룹 사진 순서 변경 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.GROUP_IMAGE_ORDER)
    async reorderMyRoomGroupImages(command: MessageEnvelope<RoomGroupImageOrderParamDto & RoomGroupImageOrderDto>): Promise<void> {
        return this.roomService.reorderMyRoomGroupImages(requireActor(command).user_id, command.payload.room_group_id, command.payload);
    }

    /**
     * 객실 그룹 사진 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(ROOM_COMMAND.GROUP_IMAGE_DELETE)
    async deleteMyRoomGroupImage(command: MessageEnvelope<RoomGroupImageDeleteParamDto>): Promise<void> {
        return this.roomService.deleteMyRoomGroupImage(requireActor(command).user_id, command.payload.room_group_id, command.payload.room_group_image_id);
    }

    /**
     * 그룹 상품 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.GROUP_PLAN_UPDATE)
    async updateMyRoomGroupPlan(command: MessageEnvelope<RoomGroupPlanUpdateParamDto & RoomGroupPlanUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoomGroupPlan(requireActor(command).user_id, command.payload.room_group_id, command.payload.room_plan_type_id, command.payload);
    }

    /**
     * 상품별 기간 가격 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     * @returns 기간 가격 ID
     */
    @OnCommand(ROOM_COMMAND.GROUP_PLAN_PRICE)
    async addMyRoomGroupPlanPrice(command: MessageEnvelope<RoomGroupPlanPriceParamDto & RoomGroupPlanPriceDto>): Promise<RoomGroupPlanPriceResultDto> {
        return this.roomService.addMyRoomGroupPlanPrice(requireActor(command).user_id, command.payload.room_group_id, command.payload.room_plan_type_id, command.payload);
    }

    /**
     * 상품별 기간 가격 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE)
    async updateMyRoomGroupPlanPrice(command: MessageEnvelope<RoomGroupPlanPriceUpdateParamDto & RoomGroupPlanPriceUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoomGroupPlanPrice(
            requireActor(command).user_id,
            command.payload.room_group_id,
            command.payload.room_plan_type_id,
            command.payload.room_group_plan_price_id,
            command.payload,
        );
    }

    /**
     * 상품별 기간 가격 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE)
    async deleteMyRoomGroupPlanPrice(command: MessageEnvelope<RoomGroupPlanPriceDeleteParamDto>): Promise<void> {
        return this.roomService.deleteMyRoomGroupPlanPrice(requireActor(command).user_id, command.payload.room_group_id, command.payload.room_plan_type_id, command.payload.room_group_plan_price_id);
    }

    /**
     * 호실 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 호실 ID
     */
    @OnCommand(ROOM_COMMAND.CREATE)
    async createMyRoom(command: MessageEnvelope<RoomDto>): Promise<RoomResultDto> {
        return this.roomService.createMyRoom(requireActor(command).user_id, command.payload);
    }

    /**
     * 호실 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.UPDATE)
    async updateMyRoom(command: MessageEnvelope<RoomUpdateParamDto & RoomUpdateDto>): Promise<void> {
        return this.roomService.updateMyRoom(requireActor(command).user_id, command.payload.room_id, command.payload);
    }

    /**
     * 호실 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(ROOM_COMMAND.DELETE)
    async deleteMyRoom(command: MessageEnvelope<RoomDeleteParamDto>): Promise<void> {
        return this.roomService.deleteMyRoom(requireActor(command).user_id, command.payload.room_id);
    }

    /**
     * 호실 상태 변경 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(ROOM_COMMAND.STATE)
    async changeMyRoomState(command: MessageEnvelope<RoomStateParamDto & RoomStateDto>): Promise<void> {
        return this.roomService.changeMyRoomState(requireActor(command).user_id, command.payload.room_id, command.payload);
    }
}
```

```ts
// apps/admin-service/src/room/room.module.ts — new
import {Module} from '@nestjs/common';
import {RoomController} from './controllers/room.controller.js';
import {RoomQueueController} from './controllers/room.controller.queue.js';
import {RoomRepository} from './repositories/room.repository.js';
import {ROOM_REPOSITORY} from './room.symbols.js';
import {RoomService} from './room.service.js';

/**
 * room 도메인(업체 상품 설정 · 객실 그룹 · 그룹 사진 · 그룹 상품 · 기간 가격 · 호실) — 인바운드 어댑터 2종이 같은 service 를 부른다.
 * - RoomController(controllers/room.controller.ts): 내부 HTTP (게이트웨이 동기 경로 — 조회 · 업로드 주소) — controllers 에 등록
 * - RoomQueueController(controllers/room.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로 — 쓰기) — `@OnCommand` provider 라 providers 에 등록
 * 파일 저장소(STORAGE_GATEWAY) 포트는 루트 모듈의 전역 StorageModule 이 준다.
 */
@Module({controllers: [RoomController], providers: [RoomService, RoomQueueController, {provide: ROOM_REPOSITORY, useClass: RoomRepository}]})
export class RoomModule {}
```

```ts
// apps/admin-service/src/admin-service.module.ts — modified (RoomModule 등록 · 문서 주석)
import {Module} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {ADMIN_COMMAND_BINDING, ADMIN_COMMAND_QUEUE} from '@app/contracts/admin/admin.commands.js';
import {DatabaseModule} from '@app/database/database.module.js';
import {SmsModule} from '@app/integration/sms/sms.module.js';
import {StorageModule} from '@app/integration/storage/storage.module.js';
import {BROKER_USER} from '@app/messaging/messaging.constants.js';
import {MessagingModule} from '@app/messaging/messaging.module.js';
import {AdminModule} from './admin/admin.module.js';
import {ManagerModule} from './manager/manager.module.js';
import {RoomModule} from './room/room.module.js';
import {StoreModule} from './store/store.module.js';

/**
 * admin-service 루트 모듈 — 매니저(총매니저 · 매니저) · 관리자(총관리자 · 관리자) · store(업체 · 입점 신청 · 업체 정보 파일) · room(업체 상품 설정 · 객실 그룹 · 호실) 도메인. 게이트웨이를 거친 요청만 받는다.
 * - APP_GUARD(InternalAuthGuard): 모든 HTTP 요청에 게이트웨이의 내부 토큰을 요구한다
 * - APP_INTERCEPTOR(ReturnedExceptionInterceptor): 내부 HTTP 컨트롤러가 반환한 HttpException 을 실패 응답으로 바꾼다(커밋 뒤 실패 — 큐 경로는 CommandDispatcher)
 * - DatabaseModule: TypeORM(PostgreSQL, user-service 와 같은 DB · 엔티티) + `@Transactional()` (nestjs-cls)
 * - MessagingModule.forService: q.admin.cmd(`admin.#`) 소비 → `@OnCommand` 핸들러 디스패치 (user_id 가 gateway 인 명령만 처리)
 * - SmsModule: SMS 발송 포트(SMS_SENDER, Amazon SNS) — 매니저 아이디 찾기 · 비밀번호 초기화 · 입점 승인 안내
 * - StorageModule: 파일 저장소 포트(STORAGE_GATEWAY, Amazon S3 · CloudFront 공개 주소) — 업체 정보 파일 · 객실 그룹 사진
 * 마이그레이션 · 기본 데이터 시드는 DB 를 소유한 user-service 묶음이 맡는다(이 서비스에는 migrate · SeederService 가 없다).
 */
@Module({
    imports: [
        DatabaseModule,
        MessagingModule.forService({queue: ADMIN_COMMAND_QUEUE, binding_keys: [ADMIN_COMMAND_BINDING], broker_user: BROKER_USER.ADMIN_SERVICE}),
        SmsModule,
        StorageModule,
        ManagerModule,
        AdminModule,
        StoreModule,
        RoomModule,
    ],
    providers: [
        {provide: APP_GUARD, useClass: InternalAuthGuard},
        {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor},
    ],
})
export class AdminServiceModule {}
```
### Tests — 도우미

spec 은 두 종류만 둔다(docs/testing.md): service 기능 spec 21개(API 1개당 1개 — repository · `STORAGE_GATEWAY` mock, 큐 15개는 `CommandDispatcher`, 동기 6개는 supertest + 내부 헤더) + `room.repository.spec.ts`(오류 변환 · 조건 · 소프트 삭제 · 통일 500 · Smoke). 전체 회귀 실행은 `/beaver:test`.

계약(phase13-contract §5)에 없어 이 섹션이 정한 이름 · 조건 · 문구 — service · DTO · repository 섹션이 같은 값을 쓴다:

- **도우미 추가 export**: `RoomRepositoryMock` · `StorageGatewayMock` · `TEST_REPLY_TO` · `TEST_INTERNAL_TOKEN` · `ID_PATTERN` · `STORE_CODE` · `IMAGE_KEY` · ID 상수 `ROOM_PLAN_ID` · `ROOM_GROUP_ID` · `ROOM_GROUP_PLAN_ID` · `ROOM_GROUP_PLAN_PRICE_ID` · `ROOM_GROUP_IMAGE_ID` · `ROOM_ID`.
- **service 조회 조건(업체 범위)**: `findRoomPlan({store_id, room_plan_type_id})` · `findRoomGroup({room_group_id, store_id})` · `findRoomGroupImage({room_group_image_id, room_group_id})` · `findRoomGroupPlan({room_group_id, room_plan_type_id})` · `findRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id})` · `findRoom({room_id, store_id})` · `deleteRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id})`(조회 없이 affected 판별 — 형제 `deleteUnavailablePeriod`).
- **service 쓰기 조건(소유 확인 뒤 PK — 형제 `updateStoreFile({store_file_id})`)**: `updateRoomPlan({room_plan_id})` · `updateRoomGroup({room_group_id})` · `updateRoomGroupImage({room_group_image_id})` · `deleteRoomGroupImage({room_group_image_id})` · `updateRoomGroupPlan({room_group_plan_id})` · `updateRoomGroupPlanPrice({room_group_plan_price_id})` · `updateRoom({room_id})` · `deleteRoom({room_id})`, 그룹 삭제는 `deleteRooms` · `deleteRoomGroupImages` · `deleteRoomGroup` 모두 `{room_group_id}`.
- **목록 where**: 그룹 — 검색어 없으면 `{store_id}`, 있으면 `{store_id, room_group_name: ILike(toContainsPattern(keyword))}`(배열 아님). 기간 가격 — `{room_group_plan_id}`. 호실 — 개수 `countRooms({store_id[, floor: number][, room_group_id]})`, 목록 `findRoomRows({store_id, floor: number | null, room_group_id: string | null}, limit, offset)`.
- **사진 한도**는 `findRoomGroupImages(room_group_id).length`(사진 개수 메서드 없음). 등록 순서는 키 모양 → 한도 → `exists`(형제 `addMyStoreFile`).
- **service 400 문구(service 섹션 C 확정값 · 입력 필드 귀속)**: `usage_hours` '시간 이용은 이용 시간을 입력해주세요.' · `check_in_time` '입실 시각을 입력해주세요.' · `check_out_time` '퇴실 시각을 입력해주세요.'(둘 다 없으면 입실부터) · `check_out_time` '입실과 퇴실 시각이 같을 수 없습니다.' · `price` '판매하려면 요금을 1원 이상 입력해주세요.' · `start_date` '없는 시작 날짜입니다.' · `end_date` '없는 종료 날짜입니다.' · `end_date` '종료 날짜는 시작 날짜보다 빠를 수 없습니다.' · `room_group_image_ids` '그룹 사진 전체를 한 번씩 원하는 순서로 보내주세요.'. 기간 겹침(선검사 · EXC 변환 모두) · 호실 상태 거부 · 404 · 한도 · 미업로드는 `validation_errors: null`. 설명 · 메모는 빈 문자열도 null(`|| null`), 새 행은 `is_deleted = 0` 을 넣는다.
- **repository 400 본문**: 그룹명 · 호실명 UK 는 `{message, validation_errors: [{property: 'room_group_name' | 'room_name', message}]}`, 사진 키 UK · 기간 겹침 EXC(23P01)는 `{message}` 만(계약 그대로 — service 를 거치면 `validation_errors: null`, 선검사와 같은 본문).
- **DTO 문구**(validateBody · 내부 HTTP 검증으로 단언): 종류 경로 `room_plan_type_id` '상품 종류가 올바르지 않습니다.' · `room_group_id` '객실 그룹 ID가 올바르지 않습니다.' · `room_group_image_id` · 순서 항목 '사진 ID가 올바르지 않습니다.' · `room_group_plan_price_id` '기간 가격 ID가 올바르지 않습니다.' · `room_id` '호실 ID가 올바르지 않습니다.' · `is_used` '사용 여부가 올바르지 않습니다.' · `days_of_week` '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.' · `usage_hours` '이용 시간은 1 ~ 24시간 사이로 입력해주세요.' · `check_in_time` '입실 시각을 HH:mm 으로 입력해주세요.' · `keyword` '검색어는 100자 이내로 입력해주세요.' · `room_group_name` '그룹명은 100자 이내로 입력해주세요.' · `description` '설명은 2,000자 이내로 입력해주세요.' · `room_group_detail.room_count` '방 개수는 1 ~ 20 사이로 입력해주세요.' · `room_group_detail.has_shower` '샤워실 유무가 올바르지 않습니다.' · `room_group_detail.has_tv` 'TV 유무가 올바르지 않습니다.' · `content_type` 'JPG · PNG 사진만 올릴 수 있습니다.' · `file_name` '파일명은 255자 이내로 입력해주세요.' · `room_group_image_ids` ArrayMaxSize '객실 그룹 사진은 5장까지입니다.' · 그룹 상품 `price` '요금은 0 ~ 10,000,000원 사이로 입력해주세요.' · `start_date` '시작 날짜를 YYYY-MM-DD 로 입력해주세요.' · `end_date` '종료 날짜를 YYYY-MM-DD 로 입력해주세요.' · 기간 `price` '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.' · `memo` '메모는 30자 이내로 입력해주세요.' · `floor`(목록 Query) '층을 정수로 입력해주세요.' · `room_name` '호실명은 50자 이내로 입력해주세요.' · `floor`(등록 · 수정) '층은 -10 ~ 200 사이로 입력해주세요.' · `room_state_id` '바꿀 수 있는 호실 상태가 아닙니다.'
- **Smoke 별칭**: `t_store` s · `t_user` u · `t_room_plan` p · `t_room_plan_type` t · `t_room_group` g · `t_room` r · `t_room_group_image` i · `t_room_group_plan` gp · `t_room_group_plan_price` pp · `t_room_state` st. 엔티티 조회 빌더(사진 · 기간 가격)는 형제 `buildStoreHoursQuery` · `buildUnavailablePeriodListQuery` 처럼 `setFindOptions({where: notDeleted(where), …})`, raw 빌더(상품 설정 · 그룹 목록 · 그룹 상품 · 호실 목록)는 `select(…, '<행 키>')` + `limit` · `offset`.

```ts
// apps/admin-service/src/room/test/room.test-helper.ts — new
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
import {STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import {CommandHandlerRegistry} from '@app/messaging/command-handler.registry.js';
import {CommandDispatcher, DispatchDecision} from '@app/messaging/command.dispatcher.js';
import {buildCommandEnvelope, encodeEnvelope} from '@app/messaging/messaging.util.js';
import {RoomController} from '../controllers/room.controller.js';
import {RoomQueueController} from '../controllers/room.controller.queue.js';
import type {RoomGroupPlanRow, RoomGroupRow, RoomPlanRow, RoomRepositoryInterface, RoomRow} from '../interfaces/room.repository.interface.js';
import {RoomService} from '../room.service.js';
import {ROOM_REPOSITORY} from '../room.symbols.js';

/** 테스트용 게이트웨이 인스턴스 ID (결과 회신 주소) */
export const TEST_REPLY_TO = 'gw-test';

/** 테스트용 내부 요청 토큰 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** 고정 시각 — 2026-01-01 00:00 (로컬) */
export const FIXED_TIME = new Date(2026, 0, 1);

/** 생성 ID 형식 (generateId — 32자 hex) */
export const ID_PATTERN = /^[a-f0-9]{32}$/;

/** 업체 관리자 (매니저 그룹 — 업체 총관리자 · 업체 관리자 모두 같은 경로) */
export const MANAGER_ACTOR: Actor = {user_id: 'h'.repeat(32), auth_id: 'MANAGER'};

/** 업체 ID */
export const STORE_ID = 'b'.repeat(32);

/** 업체코드 */
export const STORE_CODE = 'c'.repeat(32);

/** 업체 상품 설정 ID */
export const ROOM_PLAN_ID = '7'.repeat(32);

/** 객실 그룹 ID */
export const ROOM_GROUP_ID = 'd'.repeat(32);

/** 그룹 상품 ID */
export const ROOM_GROUP_PLAN_ID = '8'.repeat(32);

/** 기간 가격 ID */
export const ROOM_GROUP_PLAN_PRICE_ID = '9'.repeat(32);

/** 그룹 사진 ID */
export const ROOM_GROUP_IMAGE_ID = 'e'.repeat(32);

/** 호실 ID */
export const ROOM_ID = 'f'.repeat(32);

/** 그룹 사진 저장 키 — 그 업체 · 그 그룹 · jpg (공개 store/ 접두) */
export const IMAGE_KEY = `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'2'.repeat(32)}.jpg`;

/** room repository mock — 포트 인터페이스의 모든 메서드가 vi.fn() (빌더는 인터페이스 밖이라 없다) */
export type RoomRepositoryMock = {[K in keyof RoomRepositoryInterface]: Mock};

/** 파일 저장소 포트 mock */
export type StorageGatewayMock = {createUploadUrl: Mock; exists: Mock; getPublicUrl: Mock; remove: Mock; createDownloadUrl: Mock};

/**
 * room repository mock 을 만든다 — 목록 조회는 빈 배열, 기간 가격 겹침 개수는 0, 기간 가격 삭제는 성공(true)이 기본값.
 *
 * @returns 메서드별 vi.fn()
 */
export function createRoomRepositoryMock(): RoomRepositoryMock {
    return {
        findManagerStore: vi.fn(),
        findRoomPlanRows: vi.fn().mockResolvedValue([]),
        findRoomPlan: vi.fn(),
        updateRoomPlan: vi.fn(),
        countRoomGroups: vi.fn(),
        findRoomGroupRows: vi.fn().mockResolvedValue([]),
        findRoomGroup: vi.fn(),
        insertRoomGroup: vi.fn(),
        updateRoomGroup: vi.fn(),
        deleteRoomGroup: vi.fn(),
        insertRoomGroupPlans: vi.fn(),
        findRoomGroupPlanRows: vi.fn().mockResolvedValue([]),
        findRoomGroupPlan: vi.fn(),
        updateRoomGroupPlan: vi.fn(),
        findRoomGroupImages: vi.fn().mockResolvedValue([]),
        findRoomGroupImage: vi.fn(),
        insertRoomGroupImage: vi.fn(),
        updateRoomGroupImage: vi.fn(),
        deleteRoomGroupImage: vi.fn(),
        deleteRoomGroupImages: vi.fn(),
        countRoomGroupPlanPrices: vi.fn().mockResolvedValue(0),
        findRoomGroupPlanPriceList: vi.fn().mockResolvedValue([]),
        findRoomGroupPlanPrice: vi.fn(),
        insertRoomGroupPlanPrice: vi.fn(),
        updateRoomGroupPlanPrice: vi.fn(),
        deleteRoomGroupPlanPrice: vi.fn().mockResolvedValue(true),
        countRooms: vi.fn(),
        findRoomRows: vi.fn().mockResolvedValue([]),
        findRoom: vi.fn(),
        insertRoom: vi.fn(),
        updateRoom: vi.fn(),
        deleteRoom: vi.fn(),
        deleteRooms: vi.fn(),
    };
}

/**
 * 파일 저장소 포트 mock — 업로드 주소 · 공개 주소는 키로 만든 고정 값, 존재 확인 · 삭제는 성공.
 *
 * @returns mock
 */
export function createStorageGatewayMock(): StorageGatewayMock {
    return {
        createUploadUrl: vi.fn().mockResolvedValue({upload_url: 'https://s3.test/upload', expires_at: new Date(2026, 0, 1, 0, 10)}),
        exists: vi.fn().mockResolvedValue(true),
        getPublicUrl: vi.fn((key: string) => `https://cdn.test/${key}`),
        remove: vi.fn().mockResolvedValue(undefined),
        createDownloadUrl: vi.fn((key: string) => Promise.resolve({download_url: `https://s3.test/signed/${key}`, expires_at: new Date(2026, 0, 1, 0, 10)})),
    };
}

/**
 * 큐 경로 부팅 — 실제 RoomQueueController · RoomService · CommandHandlerRegistry · CommandDispatcher 에 repository · 저장소 포트만 mock.
 * registry 가 @OnCommand 를 찾도록 DiscoveryModule + module.init() 이 필수다.
 *
 * @param repo repository mock
 * @param storage 파일 저장소 포트 mock
 * @returns 디스패처와 테스트 모듈
 */
export async function bootCommandPath(repo: RoomRepositoryMock, storage: StorageGatewayMock = createStorageGatewayMock()): Promise<{dispatcher: CommandDispatcher; module: TestingModule}> {
    const module = await Test.createTestingModule({
        imports: [DiscoveryModule],
        providers: [RoomService, RoomQueueController, CommandHandlerRegistry, CommandDispatcher, {provide: ROOM_REPOSITORY, useValue: repo}, {provide: STORAGE_GATEWAY, useValue: storage}],
    }).compile();
    await module.init();
    return {dispatcher: module.get(CommandDispatcher), module};
}

/**
 * 동기 경로 부팅 — 실제 내부 RoomController · RoomService · ValidationPipe · 필터 · 전역 InternalAuthGuard(APP_GUARD) · ReturnedExceptionInterceptor(APP_INTERCEPTOR)
 * (admin-service.module 과 같다) 에 repository · 저장소 포트만 mock.
 *
 * @param repo repository mock
 * @param storage 파일 저장소 포트 mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: RoomRepositoryMock, storage: StorageGatewayMock = createStorageGatewayMock()): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [RoomController],
        providers: [
            RoomService,
            {provide: ROOM_REPOSITORY, useValue: repo},
            {provide: STORAGE_GATEWAY, useValue: storage},
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
 * 게이트웨이가 붙이는 내부 요청 헤더 — actor 가 있으면 로그인 회원 헤더도.
 *
 * @param actor 로그인 회원
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
 * 게이트웨이가 발행하는 것과 같은 명령 봉투를 디스패처에 넣는다.
 *
 * @param dispatcher 디스패처
 * @param params 명령 type · 본문(path param + 본문 DTO) · actor · 이전 전달 횟수
 * @returns 판정 + 명령 봉투 + 결과 본문
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
 * 게이트웨이와 같은 ValidationPipe 설정으로 본문 · path param 을 검증한다 — 큐 경로 DTO 는 게이트웨이에서만 검증되므로(서비스 큐 컨트롤러는 재검증하지 않는다) 여기서 확인한다.
 *
 * @param metatype 본문 · param DTO 클래스
 * @param body 요청 본문 또는 path param 객체
 * @returns 실패 본문 또는 null(통과)
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
 * 업체 행 (활성)
 *
 * @param override 바꿀 필드
 * @returns 업체 행
 */
export function storeRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_id: STORE_ID,
        store_code: STORE_CODE,
        store_state_id: 'ACTIVE',
        store_name: '룸리스 강남점',
        business_number: '1234567890',
        owner_name: '홍길동',
        phone: '0212345678',
        address: '서울시 강남구',
        address_detail: null,
        latitude: 37.4979,
        longitude: 127.0276,
        introduction: null,
        is_always_open: 0,
        is_open: 0,
        maintenance_minutes: 0,
        booking_open_hours: 72,
        refund_deadline_hours: 1,
        suspend_comment: null,
        is_deleted: 0,
        delete_backup: null,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 업체 상품 설정 행 (종류명 조인 — 기본은 1박, time 컬럼은 'HH:mm:ss' 로 온다). findRoomPlan 의 엔티티 자리에도 쓴다.
 *
 * @param override 바꿀 필드
 * @returns 상품 설정 행
 */
export function planRow(override: Partial<RoomPlanRow> = {}): RoomPlanRow {
    return {
        room_plan_id: ROOM_PLAN_ID,
        store_id: STORE_ID,
        room_plan_type_id: 'NIGHT',
        room_plan_type_name: '1박',
        is_used: 1,
        days_of_week: 127,
        usage_hours: null,
        check_in_time: '15:00:00',
        check_out_time: '11:00:00',
        ...override,
    };
}

/**
 * 객실 그룹 목록 행 (지워지지 않은 호실 수 · 대표 사진 키)
 *
 * @param override 바꿀 필드
 * @returns 그룹 목록 행
 */
export function roomGroupRow(override: Partial<RoomGroupRow> = {}): RoomGroupRow {
    return {room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', created_at: FIXED_TIME, room_count: 3, cover_file_key: IMAGE_KEY, ...override};
}

/**
 * 객실 그룹 엔티티 (조회 뒤 상세정보 항목이 모두 채워진 모양 — @AfterLoad)
 *
 * @param override 바꿀 필드
 * @returns 그룹
 */
export function roomGroupEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        room_group_id: ROOM_GROUP_ID,
        store_id: STORE_ID,
        room_group_name: '스탠다드',
        description: null,
        room_group_detail: {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 1},
        is_deleted: 0,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 그룹 사진 행 (그 그룹 · jpg · 순서 0)
 *
 * @param override 바꿀 필드
 * @returns 사진 행
 */
export function imageRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        room_group_image_id: ROOM_GROUP_IMAGE_ID,
        room_group_id: ROOM_GROUP_ID,
        file_key: IMAGE_KEY,
        file_name: '객실.jpg',
        content_type: 'image/jpeg',
        sort_order: 0,
        is_deleted: 0,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 그룹 상품 행 (종류명 조인 — 기본은 1박 · 사용 안 함 · 0원). findRoomGroupPlan 의 엔티티 자리에도 쓴다.
 *
 * @param override 바꿀 필드
 * @returns 그룹 상품 행
 */
export function groupPlanRow(override: Partial<RoomGroupPlanRow> = {}): RoomGroupPlanRow {
    return {room_group_plan_id: ROOM_GROUP_PLAN_ID, room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT', room_plan_type_name: '1박', is_used: 0, price: 0, ...override};
}

/**
 * 기간 가격 행 (date 컬럼은 'YYYY-MM-DD' 문자열로 온다)
 *
 * @param override 바꿀 필드
 * @returns 기간 가격 행
 */
export function priceRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID,
        room_group_plan_id: ROOM_GROUP_PLAN_ID,
        start_date: '2026-07-01',
        end_date: '2026-08-31',
        price: 120000,
        memo: '여름 성수기',
        is_deleted: 0,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 호실 목록 행 (그룹명 · 상태명 조인)
 *
 * @param override 바꿀 필드
 * @returns 호실 목록 행
 */
export function roomRow(override: Partial<RoomRow> = {}): RoomRow {
    return {
        room_id: ROOM_ID,
        room_group_id: ROOM_GROUP_ID,
        room_group_name: '스탠다드',
        room_name: '101호',
        floor: 1,
        room_state_id: 'AVAILABLE',
        room_state_name: '예약가능',
        created_at: FIXED_TIME,
        ...override,
    };
}

/**
 * 호실 엔티티 (예약가능)
 *
 * @param override 바꿀 필드
 * @returns 호실
 */
export function roomEntity(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        room_id: ROOM_ID,
        store_id: STORE_ID,
        room_group_id: ROOM_GROUP_ID,
        room_state_id: 'AVAILABLE',
        room_name: '101호',
        floor: 1,
        is_deleted: 0,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}
```

### Tests — service 기능 spec

#### 1. room-plan-list (동기)

```ts
// apps/admin-service/src/room/test/room-plan-list.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createRoomRepositoryMock, internalHeaders, MANAGER_ACTOR, planRow, RoomRepositoryMock, STORE_ID, storeRow} from './room.test-helper.js';

const PATH = '/internal/v1/admin-service/room/plan';

describe('GET /internal/v1/admin-service/room/plan — 업체 상품 설정 조회 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomPlanRows.mockResolvedValue([
            planRow({room_plan_id: '3'.repeat(32), room_plan_type_id: 'LONG', room_plan_type_name: '연박', is_used: 0, days_of_week: 65, check_in_time: '16:00:00', check_out_time: '12:00:00'}),
            planRow({room_plan_id: '1'.repeat(32), room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', usage_hours: 3, check_in_time: null, check_out_time: null}),
            planRow(),
        ]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('잠그지 않고 내 업체를 찾아 종류 3행을 HOURLY · NIGHT · LONG 순으로 돌려준다 — 시각은 HH:mm, 종류에 없는 값은 null', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledTimes(1);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findRoomPlanRows).toHaveBeenCalledTimes(1);
            expect(repo.findRoomPlanRows).toHaveBeenCalledWith(STORE_ID);
            expect(res.body).toEqual({
                list: [
                    {room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', is_used: 1, days_of_week: 127, usage_hours: 3, check_in_time: null, check_out_time: null},
                    {room_plan_type_id: 'NIGHT', room_plan_type_name: '1박', is_used: 1, days_of_week: 127, usage_hours: null, check_in_time: '15:00', check_out_time: '11:00'},
                    {room_plan_type_id: 'LONG', room_plan_type_name: '연박', is_used: 0, days_of_week: 65, usage_hours: null, check_in_time: '16:00', check_out_time: '12:00'},
                ],
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면(탈퇴 · 지운 업체 포함) 404, 상품 설정 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomPlanRows).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH);

            expect(res.status).toBe(403);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 2. room-plan-update (큐)

```ts
// apps/admin-service/src/room/test/room-plan-update.spec.ts — new
import type {TestingModule} from '@nestjs/testing';
import {RoomPlanUpdateDto, RoomPlanUpdateParamDto} from '@app/contracts/room/dto/room-plan-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, planRow, ROOM_PLAN_ID, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const HOURLY_PAYLOAD = {room_plan_type_id: 'HOURLY', is_used: 1, days_of_week: 62, usage_hours: 4};

describe('admin.room.plan-update — 업체 상품 설정 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomPlan.mockResolvedValue(planRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('시간 이용(HOURLY) — 업체 행을 잠그고 그 업체의 종류 행을 찾아 이용 시간만 저장한다(보낸 입실 · 퇴실 시각은 NULL)', async () => {
            repo.findRoomPlan.mockResolvedValueOnce(planRow({room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', usage_hours: 3, check_in_time: null, check_out_time: null}));

            const {decision, result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.PLAN_UPDATE,
                payload: {...HOURLY_PAYLOAD, check_in_time: '15:00', check_out_time: '11:00'},
                actor: MANAGER_ACTOR,
            });

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.plan-update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomPlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id: 'HOURLY'});
            expect(repo.updateRoomPlan).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoomPlan.mock.calls[0] as [unknown, RoomPlanEntity];
            expect(where).toEqual({room_plan_id: ROOM_PLAN_ID});
            expect(entity).toBeInstanceOf(RoomPlanEntity);
            expect(entity).toMatchObject({is_used: 1, days_of_week: 62, usage_hours: 4, check_in_time: null, check_out_time: null});
            expect(entity.store_id).toBeUndefined();
        });

        it.each(['NIGHT', 'LONG'] as const)('%s — 입실 · 퇴실 시각만 저장한다(보낸 이용 시간은 NULL, 퇴실이 입실보다 이르면 다음 날)', async (room_plan_type_id) => {
            const {result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.PLAN_UPDATE,
                payload: {room_plan_type_id, is_used: 0, days_of_week: 127, usage_hours: 5, check_in_time: '15:00', check_out_time: '11:00'},
                actor: MANAGER_ACTOR,
            });

            expect(result).toEqual({result: null, error: null});
            expect(repo.findRoomPlan).toHaveBeenCalledWith({store_id: STORE_ID, room_plan_type_id});
            const [where, entity] = repo.updateRoomPlan.mock.calls[0] as [unknown, RoomPlanEntity];
            expect(where).toEqual({room_plan_id: ROOM_PLAN_ID});
            expect(entity).toBeInstanceOf(RoomPlanEntity);
            expect(entity).toMatchObject({is_used: 0, days_of_week: 127, usage_hours: null, check_in_time: '15:00', check_out_time: '11:00'});
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['시간 이용인데 이용 시간 없음', {room_plan_type_id: 'HOURLY', is_used: 1, days_of_week: 127}, 'usage_hours', '시간 이용은 이용 시간을 입력해주세요.'],
            ['1박인데 입실 시각 없음', {room_plan_type_id: 'NIGHT', is_used: 1, days_of_week: 127, check_out_time: '11:00'}, 'check_in_time', '입실 시각을 입력해주세요.'],
            ['연박인데 퇴실 시각 없음', {room_plan_type_id: 'LONG', is_used: 1, days_of_week: 127, check_in_time: '15:00'}, 'check_out_time', '퇴실 시각을 입력해주세요.'],
            ['1박인데 이용 시간만(시각 둘 다 없음) → 입실부터', {room_plan_type_id: 'NIGHT', is_used: 1, days_of_week: 127, usage_hours: 3}, 'check_in_time', '입실 시각을 입력해주세요.'],
            ['입실 = 퇴실', {room_plan_type_id: 'NIGHT', is_used: 1, days_of_week: 127, check_in_time: '12:00', check_out_time: '12:00'}, 'check_out_time', '입실과 퇴실 시각이 같을 수 없습니다.'],
        ])('%s → failed 400 validation_errors.%s, 수정 없음', async (_label, payload, property, message) => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.plan-update.failed');
            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property, message}]}});
            expect(repo.updateRoomPlan).not.toHaveBeenCalled();
        });

        it('종류 행이 없으면 failed 404, 수정 없음', async () => {
            repo.findRoomPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: HOURLY_PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoomPlan).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 종류 행 조회 · 수정 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: HOURLY_PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomPlan).not.toHaveBeenCalled();
            expect(repo.updateRoomPlan).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['예약 가능 요일 0(팔지 않으려면 사용 여부 0)', {is_used: 1, days_of_week: 0}, 'days_of_week', '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'],
            ['예약 가능 요일 128', {is_used: 1, days_of_week: 128}, 'days_of_week', '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.'],
            ['이용 시간 25', {is_used: 1, days_of_week: 127, usage_hours: 25}, 'usage_hours', '이용 시간은 1 ~ 24시간 사이로 입력해주세요.'],
            ['입실 시각 24:00', {is_used: 1, days_of_week: 127, check_in_time: '24:00'}, 'check_in_time', '입실 시각을 HH:mm 으로 입력해주세요.'],
            ['사용 여부 2', {is_used: 2, days_of_week: 127}, 'is_used', '사용 여부가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomPlanUpdateDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it('이용 시간 · 시각은 선택 필드 — 종류 조합은 service 가 가른다', async () => {
            await expect(validateBody(RoomPlanUpdateDto, {is_used: 1, days_of_week: 127})).resolves.toBeNull();
        });

        it('종류 경로가 HOURLY · NIGHT · LONG 이 아니면 → room_plan_type_id', async () => {
            await expect(validateBody(RoomPlanUpdateParamDto, {room_plan_type_id: 'WEEKLY'})).resolves.toEqual({
                message: '상품 종류가 올바르지 않습니다.',
                validation_errors: [{property: 'room_plan_type_id', message: '상품 종류가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.PLAN_UPDATE, payload: HOURLY_PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 3. room-group-list (동기)

```ts
// apps/admin-service/src/room/test/room-group-list.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {ILike} from 'typeorm';
import {
    bootHttpPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    FIXED_TIME,
    IMAGE_KEY,
    internalHeaders,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupRow,
    RoomRepositoryMock,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
} from './room.test-helper.js';

const PATH = '/internal/v1/admin-service/room/group';
const OTHER_GROUP_ID = 'a'.repeat(32);

describe('GET /internal/v1/admin-service/room/group — 객실 그룹 목록 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.countRoomGroups.mockResolvedValue(2);
        repo.findRoomGroupRows.mockResolvedValue([roomGroupRow(), roomGroupRow({room_group_id: OTHER_GROUP_ID, room_group_name: '디럭스', room_count: 0, cover_file_key: null})]);
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('검색어가 없으면 내 업체 그룹만 같은 WHERE 로 세고 기본 페이지로 목록 — 대표 사진은 CDN 주소, 사진이 없으면 null', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.countRoomGroups).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.findRoomGroupRows).toHaveBeenCalledWith({store_id: STORE_ID}, 20, 0);
            expect(repo.countRoomGroups.mock.invocationCallOrder[0]).toBeLessThan(repo.findRoomGroupRows.mock.invocationCallOrder[0]);
            expect(storage.getPublicUrl).toHaveBeenCalledTimes(1);
            expect(storage.getPublicUrl).toHaveBeenCalledWith(IMAGE_KEY);
            expect(res.body.list).toEqual([
                {room_group_id: ROOM_GROUP_ID, room_group_name: '스탠다드', room_count: 3, image_url: `https://cdn.test/${IMAGE_KEY}`, created_at: FIXED_TIME.toISOString()},
                {room_group_id: OTHER_GROUP_ID, room_group_name: '디럭스', room_count: 0, image_url: null, created_at: FIXED_TIME.toISOString()},
            ]);
            expect(res.body.pagination).toMatchObject({total_count: 2, page: 1, max_page: 1});
        });

        it('검색어는 그룹명 부분 일치(% · _ 이스케이프) — 같은 WHERE 로 세고 요청 페이지로 목록', async () => {
            repo.countRoomGroups.mockResolvedValueOnce(30);

            const res = await request(app.getHttpServer()).get(`${PATH}?keyword=a_b&page=2&size=10`).set(internalHeaders(MANAGER_ACTOR));

            const where = {store_id: STORE_ID, room_group_name: ILike('%a\\_b%')};
            expect(res.status).toBe(200);
            expect(repo.countRoomGroups).toHaveBeenCalledWith(where);
            expect(repo.findRoomGroupRows).toHaveBeenCalledWith(where, 10, 10);
            expect(res.body.pagination).toMatchObject({total_count: 30, page: 2, max_page: 3});
        });
    });

    describe('[FAIL:validation]', () => {
        it('검색어 101자면 400 validation_errors.keyword, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer())
                .get(`${PATH}?keyword=${'a'.repeat(101)}`)
                .set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '검색어는 100자 이내로 입력해주세요.', validation_errors: [{property: 'keyword', message: '검색어는 100자 이내로 입력해주세요.'}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 404, 개수 · 목록 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.countRoomGroups).not.toHaveBeenCalled();
            expect(repo.findRoomGroupRows).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH);

            expect(res.status).toBe(403);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 4. room-group-detail (동기)

```ts
// apps/admin-service/src/room/test/room-group-detail.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    FIXED_TIME,
    groupPlanRow,
    IMAGE_KEY,
    imageRow,
    internalHeaders,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
} from './room.test-helper.js';

const PATH = `/internal/v1/admin-service/room/group/${ROOM_GROUP_ID}`;
const IMAGE_A = 'a'.repeat(32);
const IMAGE_B = '1'.repeat(32);
const KEY_B = `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.png`;

describe('GET /internal/v1/admin-service/room/group/:room_group_id — 객실 그룹 상세 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity({description: '창가 객실', room_group_detail: {room_count: 2, has_shower: 1, has_tv: 0, has_pc: 1}}));
        repo.findRoomGroupImages.mockResolvedValue([
            imageRow({room_group_image_id: IMAGE_A}),
            imageRow({room_group_image_id: IMAGE_B, file_key: KEY_B, file_name: '욕실.png', content_type: 'image/png', sort_order: 1}),
        ]);
        repo.findRoomGroupPlanRows.mockResolvedValue([
            groupPlanRow({room_group_plan_id: '6'.repeat(32), room_plan_type_id: 'LONG', room_plan_type_name: '연박'}),
            groupPlanRow({room_group_plan_id: '4'.repeat(32), room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', is_used: 1, price: 25000}),
            groupPlanRow({is_used: 1, price: 89000}),
        ]);
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체의 그룹 · 사진(순서대로 CDN 주소) · 그룹 상품 3개(HOURLY · NIGHT · LONG 순)를 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledTimes(1);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(repo.findRoomGroupPlanRows).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(storage.getPublicUrl).toHaveBeenCalledTimes(2);
            expect(storage.getPublicUrl).toHaveBeenNthCalledWith(1, IMAGE_KEY);
            expect(storage.getPublicUrl).toHaveBeenNthCalledWith(2, KEY_B);
            expect(storage.createDownloadUrl).not.toHaveBeenCalled();
            expect(res.body).toEqual({
                room_group_id: ROOM_GROUP_ID,
                room_group_name: '스탠다드',
                description: '창가 객실',
                room_group_detail: {room_count: 2, has_shower: 1, has_tv: 0, has_pc: 1},
                images: [
                    {room_group_image_id: IMAGE_A, file_name: '객실.jpg', content_type: 'image/jpeg', sort_order: 0, image_url: `https://cdn.test/${IMAGE_KEY}`},
                    {room_group_image_id: IMAGE_B, file_name: '욕실.png', content_type: 'image/png', sort_order: 1, image_url: `https://cdn.test/${KEY_B}`},
                ],
                plans: [
                    {room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', is_used: 1, price: 25000},
                    {room_plan_type_id: 'NIGHT', room_plan_type_name: '1박', is_used: 1, price: 89000},
                    {room_plan_type_id: 'LONG', room_plan_type_name: '연박', is_used: 0, price: 0},
                ],
                created_at: FIXED_TIME.toISOString(),
                updated_at: FIXED_TIME.toISOString(),
            });
        });

        it('사진이 없으면 images [] · 열람 주소 없음', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce([]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body.images).toEqual([]);
            expect(storage.getPublicUrl).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹이 없으면(다른 업체 · 지운 그룹) 404, 사진 · 그룹 상품 조회 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
            expect(repo.findRoomGroupPlanRows).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 404, 그룹 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('그룹 ID 가 32자 hex 가 아니면 400 validation_errors.room_group_id, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/admin-service/room/group/xyz').set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '객실 그룹 ID가 올바르지 않습니다.', validation_errors: [{property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH);

            expect(res.status).toBe(403);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 5. room-group-create (큐)

```ts
// apps/admin-service/src/room/test/room-group-create.spec.ts — new
import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {createValidationError} from '@app/common/utils/validation.js';
import {RoomGroupDto} from '@app/contracts/room/dto/room-group.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, ID_PATTERN, MANAGER_ACTOR, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const NAME_TAKEN = '이미 있는 그룹명입니다.';

describe('admin.room.group-create — 객실 그룹 등록 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 행을 잠그고 그룹을 넣은 뒤(상세정보는 알려진 항목만 + 빠진 항목은 기본값) 그룹 상품 3행(HOURLY · NIGHT · LONG — 사용 안 함 · 0원)을 넣는다', async () => {
            const {decision, result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_CREATE,
                payload: {room_group_name: '스탠다드', description: '창가 객실', room_group_detail: {has_tv: 0, unknown: 1}},
                actor: MANAGER_ACTOR,
            });

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-create.done');
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.insertRoomGroup).toHaveBeenCalledTimes(1);
            const group = repo.insertRoomGroup.mock.calls[0][0] as RoomGroupEntity;
            expect(group).toBeInstanceOf(RoomGroupEntity);
            expect(group.room_group_id).toMatch(ID_PATTERN);
            expect(group).toMatchObject({store_id: STORE_ID, room_group_name: '스탠다드', description: '창가 객실', is_deleted: 0});
            expect(group.room_group_detail).toEqual({room_count: 1, has_shower: 1, has_tv: 0, has_pc: 1});
            expect(repo.insertRoomGroupPlans).toHaveBeenCalledTimes(1);
            const plans = repo.insertRoomGroupPlans.mock.calls[0][0] as RoomGroupPlanEntity[];
            expect(plans).toHaveLength(3);
            expect(plans.every((plan) => plan instanceof RoomGroupPlanEntity && ID_PATTERN.test(plan.room_group_plan_id))).toBe(true);
            expect(new Set(plans.map((plan) => plan.room_group_plan_id)).size).toBe(3);
            expect(plans.map(({room_group_id, room_plan_type_id, is_used, price}) => ({room_group_id, room_plan_type_id, is_used, price}))).toEqual([
                {room_group_id: group.room_group_id, room_plan_type_id: 'HOURLY', is_used: 0, price: 0},
                {room_group_id: group.room_group_id, room_plan_type_id: 'NIGHT', is_used: 0, price: 0},
                {room_group_id: group.room_group_id, room_plan_type_id: 'LONG', is_used: 0, price: 0},
            ]);
            expect(repo.insertRoomGroup.mock.invocationCallOrder[0]).toBeLessThan(repo.insertRoomGroupPlans.mock.invocationCallOrder[0]);
            expect(result).toEqual({result: {room_group_id: group.room_group_id}, error: null});
        });

        it('설명 · 상세정보를 보내지 않으면 설명 null, 상세정보는 기본값 전부', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_CREATE, payload: {room_group_name: '스탠다드'}, actor: MANAGER_ACTOR});

            expect(result?.error).toBeNull();
            const group = repo.insertRoomGroup.mock.calls[0][0] as RoomGroupEntity;
            expect(group.description).toBeNull();
            expect(group.room_group_detail).toEqual({room_count: 1, has_shower: 1, has_tv: 1, has_pc: 1});
            expect(repo.insertRoomGroupPlans).toHaveBeenCalledTimes(1);
        });

        it('빈 설명은 null, 상세정보의 null 항목은 값이 없는 것 — 기본값으로 채운다', async () => {
            await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_CREATE,
                payload: {room_group_name: '스탠다드', description: '', room_group_detail: {room_count: 2, has_pc: null}},
                actor: MANAGER_ACTOR,
            });

            const group = repo.insertRoomGroup.mock.calls[0][0] as RoomGroupEntity;
            expect(group.description).toBeNull();
            expect(group.room_group_detail).toEqual({room_count: 2, has_shower: 1, has_tv: 1, has_pc: 1});
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('같은 업체에 지워지지 않은 같은 그룹명이 있으면(UK 변환 — repository 400) failed 400 validation_errors.room_group_name, 그룹 상품 없음', async () => {
            repo.insertRoomGroup.mockRejectedValueOnce(new BadRequestException({message: NAME_TAKEN, validation_errors: createValidationError('room_group_name', NAME_TAKEN)}));

            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_CREATE, payload: {room_group_name: '스탠다드'}, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: NAME_TAKEN, validation_errors: [{property: 'room_group_name', message: NAME_TAKEN}]}});
            expect(repo.insertRoomGroupPlans).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 failed 404, 그룹 · 그룹 상품 등록 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_CREATE, payload: {room_group_name: '스탠다드'}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.insertRoomGroup).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupPlans).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe — 상세정보는 점 경로', () => {
        it.each([
            ['그룹명 101자', {room_group_name: '가'.repeat(101)}, 'room_group_name', '그룹명은 100자 이내로 입력해주세요.'],
            ['설명 2,001자', {room_group_name: '스탠다드', description: '가'.repeat(2001)}, 'description', '설명은 2,000자 이내로 입력해주세요.'],
            ['방 개수 21', {room_group_name: '스탠다드', room_group_detail: {room_count: 21}}, 'room_group_detail.room_count', '방 개수는 1 ~ 20 사이로 입력해주세요.'],
            ['방 개수 0', {room_group_name: '스탠다드', room_group_detail: {room_count: 0}}, 'room_group_detail.room_count', '방 개수는 1 ~ 20 사이로 입력해주세요.'],
            ['TV 유무 2', {room_group_name: '스탠다드', room_group_detail: {has_tv: 2}}, 'room_group_detail.has_tv', 'TV 유무가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomGroupDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it('선언 안 된 상세 항목은 게이트웨이가 막지 않는다(whitelist 꺼짐) — service 가 버린다', async () => {
            await expect(validateBody(RoomGroupDto, {room_group_name: '스탠다드', room_group_detail: {has_tv: 0, unknown: 1}})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_CREATE, payload: {room_group_name: '스탠다드'}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 6. room-group-update (큐)

```ts
// apps/admin-service/src/room/test/room-group-update.spec.ts — new
import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {createValidationError} from '@app/common/utils/validation.js';
import {RoomGroupUpdateDto, RoomGroupUpdateParamDto} from '@app/contracts/room/dto/room-group-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, ROOM_GROUP_ID, roomGroupEntity, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const NAME_TAKEN = '이미 있는 그룹명입니다.';
const PAYLOAD = {room_group_id: ROOM_GROUP_ID, room_group_name: '디럭스'};

describe('admin.room.group-update — 객실 그룹 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity({description: '창가 객실', room_group_detail: {room_count: 3, has_shower: 0, has_tv: 0, has_pc: 0}}));
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹을 찾아 그룹명 · 설명 · 상세정보(보낸 항목 + 기본값으로 통째로 — 지금 값과 합치지 않는다)를 바꾼다', async () => {
            const {decision, result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_UPDATE,
                payload: {...PAYLOAD, description: '넓은 객실', room_group_detail: {room_count: 2, has_pc: 0}},
                actor: MANAGER_ACTOR,
            });

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.updateRoomGroup).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoomGroup.mock.calls[0] as [unknown, RoomGroupEntity];
            expect(where).toEqual({room_group_id: ROOM_GROUP_ID});
            expect(entity).toBeInstanceOf(RoomGroupEntity);
            expect(entity).toMatchObject({room_group_name: '디럭스', description: '넓은 객실'});
            expect(entity.room_group_detail).toEqual({room_count: 2, has_shower: 1, has_tv: 1, has_pc: 0});
            expect(entity.store_id).toBeUndefined();
            expect(entity.is_deleted).toBeUndefined();
        });

        it('상세정보를 보내지 않으면 그대로(엔티티에 넣지 않는다), 설명을 보내지 않으면 null', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            const entity = repo.updateRoomGroup.mock.calls[0][1] as RoomGroupEntity;
            expect(entity.room_group_name).toBe('디럭스');
            expect(entity.description).toBeNull();
            expect(entity.room_group_detail).toBeUndefined();
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹이 없으면(다른 업체 · 지운 그룹) failed 404, 수정 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoomGroup).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 · 수정 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.updateRoomGroup).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('다른 그룹과 그룹명이 겹치면(UK 변환 — repository 400) failed 400 validation_errors.room_group_name', async () => {
            repo.updateRoomGroup.mockRejectedValueOnce(new BadRequestException({message: NAME_TAKEN, validation_errors: createValidationError('room_group_name', NAME_TAKEN)}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: NAME_TAKEN, validation_errors: [{property: 'room_group_name', message: NAME_TAKEN}]}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('샤워실 유무 3 → room_group_detail.has_shower', async () => {
            await expect(validateBody(RoomGroupUpdateDto, {room_group_name: '디럭스', room_group_detail: {has_shower: 3}})).resolves.toEqual({
                message: '샤워실 유무가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_detail.has_shower', message: '샤워실 유무가 올바르지 않습니다.'}],
            });
        });

        it('그룹 ID 경로가 32자 hex 가 아니면 → room_group_id', async () => {
            await expect(validateBody(RoomGroupUpdateParamDto, {room_group_id: 'xyz'})).resolves.toEqual({
                message: '객실 그룹 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_UPDATE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 7. room-group-delete (큐)

```ts
// apps/admin-service/src/room/test/room-group-delete.spec.ts — new
import {ServiceUnavailableException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {RoomGroupDeleteParamDto} from '@app/contracts/room/dto/room-group-delete.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    IMAGE_KEY,
    imageRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const KEY_B = `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.png`;
const PAYLOAD = {room_group_id: ROOM_GROUP_ID};

describe('admin.room.group-delete — 객실 그룹 삭제 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImages.mockResolvedValue([imageRow(), imageRow({room_group_image_id: 'a'.repeat(32), file_key: KEY_B, content_type: 'image/png', sort_order: 1})]);
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹의 사진 키를 먼저 읽고 호실 → 사진 → 그룹 순으로 소프트 삭제한 뒤 사진 S3 객체를 지운다(마지막)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-delete.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(repo.deleteRooms).toHaveBeenCalledTimes(1);
            expect(repo.deleteRooms).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID});
            expect(repo.deleteRoomGroupImages).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroupImages).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID});
            expect(repo.deleteRoomGroup).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID});
            expect(storage.remove).toHaveBeenCalledTimes(2);
            expect(storage.remove).toHaveBeenNthCalledWith(1, IMAGE_KEY);
            expect(storage.remove).toHaveBeenNthCalledWith(2, KEY_B);
            const order = [
                repo.findRoomGroupImages.mock.invocationCallOrder[0],
                repo.deleteRooms.mock.invocationCallOrder[0],
                repo.deleteRoomGroupImages.mock.invocationCallOrder[0],
                repo.deleteRoomGroup.mock.invocationCallOrder[0],
                storage.remove.mock.invocationCallOrder[0],
            ];
            expect(order).toEqual([...order].sort((a, b) => a - b));
        });

        it('사진이 없으면 S3 삭제 없이 행만 지운다', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce([]);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.deleteRooms).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroupImages).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroup).toHaveBeenCalledTimes(1);
            expect(storage.remove).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹이 없으면(다른 업체 · 이미 지운 그룹) failed 404, 삭제 · S3 삭제 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteRooms).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroupImages).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroup).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroup).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:infra]', () => {
        it('S3 삭제가 503 이면 재시도(requeue) — 결과 회신 없음', async () => {
            storage.remove.mockRejectedValueOnce(new ServiceUnavailableException({message: '파일 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const {decision} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('requeue');
            expect(decision.result).toBeNull();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('그룹 ID 경로가 32자 hex 가 아니면 → room_group_id', async () => {
            await expect(validateBody(RoomGroupDeleteParamDto, {room_group_id: 'xyz'})).resolves.toEqual({
                message: '객실 그룹 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_DELETE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 8. room-group-image-upload-url (동기)

```ts
// apps/admin-service/src/room/test/room-group-image-upload-url.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    imageRow,
    internalHeaders,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
} from './room.test-helper.js';

const PATH = `/internal/v1/admin-service/room/group/${ROOM_GROUP_ID}/image/upload-url`;

/**
 * 그룹 사진 n장 (순서 0 ~ n-1)
 *
 * @param count 장 수
 * @returns 사진 행
 */
function images(count: number): Record<string, unknown>[] {
    return Array.from({length: count}, (_, index) => imageRow({room_group_image_id: String(index).repeat(32), sort_order: index}));
}

describe('POST /internal/v1/admin-service/room/group/:room_group_id/image/upload-url — 그룹 사진 업로드 주소 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImages.mockResolvedValue(images(4));
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그룹 사진 한도(5장) 안이면 store/<업체>/room-group/<그룹>/<uuid>.<ext> 공개 키로 업로드 주소를 준다', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/png'});

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(storage.createUploadUrl).toHaveBeenCalledTimes(1);
            const {key, content_type} = storage.createUploadUrl.mock.calls[0][0] as {key: string; content_type: string};
            expect(key).toMatch(new RegExp(`^store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/[a-f0-9]{32}\\.png$`));
            expect(content_type).toBe('image/png');
            expect(res.body).toEqual({file_key: key, upload_url: 'https://s3.test/upload', expires_at: new Date(2026, 0, 1, 0, 10).toISOString()});
        });

        it('JPG 는 .jpg 키 — 업로드마다 새 키', async () => {
            await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});
            await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            const [first, second] = storage.createUploadUrl.mock.calls.map(([input]) => (input as {key: string}).key);
            expect(first).toMatch(/\.jpg$/);
            expect(second).toMatch(/\.jpg$/);
            expect(first).not.toBe(second);
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹 사진이 5장이면 400, 업로드 주소 없음', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce(images(5));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '올릴 수 있는 사진 수를 넘었습니다.', validation_errors: null});
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체 · 지운 그룹) 404, 사진 조회 · 업로드 주소 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 404, 그룹 조회 · 업로드 주소 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(storage.createUploadUrl).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('JPG · PNG 가 아니면 400 validation_errors.content_type, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/gif'});

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: 'JPG · PNG 사진만 올릴 수 있습니다.', validation_errors: [{property: 'content_type', message: 'JPG · PNG 사진만 올릴 수 있습니다.'}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });

        it('그룹 ID 경로가 32자 hex 가 아니면 400 validation_errors.room_group_id', async () => {
            const res = await request(app.getHttpServer()).post('/internal/v1/admin-service/room/group/xyz/image/upload-url').set(internalHeaders(MANAGER_ACTOR)).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toContainEqual({property: 'room_group_id', message: '객실 그룹 ID가 올바르지 않습니다.'});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).post(PATH).send({content_type: 'image/jpeg'});

            expect(res.status).toBe(403);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 9. room-group-image (큐)

```ts
// apps/admin-service/src/room/test/room-group-image.spec.ts — new
import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {RoomGroupImageDto} from '@app/contracts/room/dto/room-group-image.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    ID_PATTERN,
    imageRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const NEW_KEY = `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.jpg`;
const PAYLOAD = {room_group_id: ROOM_GROUP_ID, file_key: NEW_KEY, file_name: '침대.jpg', content_type: 'image/jpeg'};
const KEY_INVALID = '업로드 주소로 받은 저장 키가 아닙니다.';

describe('admin.room.group-image — 그룹 사진 등록 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImages.mockResolvedValue([
            imageRow({sort_order: 0}),
            imageRow({room_group_image_id: 'a'.repeat(32), file_key: `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'4'.repeat(32)}.jpg`, sort_order: 2}),
        ]);
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('키 모양 · 한도 · 업로드를 확인하고 그 그룹에 마지막 순서(가장 큰 순서 + 1)로 등록한다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-image.done');
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(storage.exists).toHaveBeenCalledWith(NEW_KEY);
            expect(repo.insertRoomGroupImage).toHaveBeenCalledTimes(1);
            const inserted = repo.insertRoomGroupImage.mock.calls[0][0] as RoomGroupImageEntity;
            expect(inserted).toBeInstanceOf(RoomGroupImageEntity);
            expect(inserted.room_group_image_id).toMatch(ID_PATTERN);
            expect(inserted).toMatchObject({room_group_id: ROOM_GROUP_ID, file_key: NEW_KEY, file_name: '침대.jpg', content_type: 'image/jpeg', sort_order: 3, is_deleted: 0});
            expect(result).toEqual({result: {room_group_image_id: inserted.room_group_image_id}, error: null});
        });

        it('사진이 없으면 순서 0 (대표 사진)', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce([]);

            await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect((repo.insertRoomGroupImage.mock.calls[0][0] as RoomGroupImageEntity).sort_order).toBe(0);
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['다른 업체 키', `store/${'9'.repeat(32)}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.jpg`, 'image/jpeg'],
            ['다른 그룹 키', `store/${STORE_ID}/room-group/${'a'.repeat(32)}/${'3'.repeat(32)}.jpg`, 'image/jpeg'],
            ['업체 사진 키(그룹 경로 없음)', `store/${STORE_ID}/${'3'.repeat(32)}.jpg`, 'image/jpeg'],
            ['확장자 불일치', `store/${STORE_ID}/room-group/${ROOM_GROUP_ID}/${'3'.repeat(32)}.png`, 'image/jpeg'],
        ])('%s → failed 400 validation_errors.file_key, 업로드 확인 · 등록 없음', async (_label, file_key, content_type) => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: {...PAYLOAD, file_key, content_type}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: KEY_INVALID, validation_errors: [{property: 'file_key', message: KEY_INVALID}]}});
            expect(storage.exists).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });

        it('그룹 사진이 5장이면 failed 400, 업로드 확인 · 등록 없음', async () => {
            repo.findRoomGroupImages.mockResolvedValueOnce([0, 1, 2, 3, 4].map((sort_order) => imageRow({room_group_image_id: String(sort_order).repeat(32), sort_order})));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '올릴 수 있는 사진 수를 넘었습니다.', validation_errors: null}});
            expect(storage.exists).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });

        it('저장소에 아직 없으면 failed 400, 등록 없음', async () => {
            storage.exists.mockResolvedValueOnce(false);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.', validation_errors: null}});
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });

        it('그룹이 없으면 failed 404, 사진 조회 · 등록 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error?.status_code).toBe(404);
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupImage).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('같은 키가 이미 등록돼 있으면(UK 변환 — repository 400) failed 400', async () => {
            repo.insertRoomGroupImage.mockRejectedValueOnce(new BadRequestException({message: '이미 등록된 사진입니다.'}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: '이미 등록된 사진입니다.', validation_errors: null}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['GIF', {file_key: NEW_KEY, file_name: '침대.gif', content_type: 'image/gif'}, 'content_type', 'JPG · PNG 사진만 올릴 수 있습니다.'],
            ['파일명 256자', {file_key: NEW_KEY, file_name: '가'.repeat(256), content_type: 'image/jpeg'}, 'file_name', '파일명은 255자 이내로 입력해주세요.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomGroupImageDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 10. room-group-image-order (큐)

```ts
// apps/admin-service/src/room/test/room-group-image-order.spec.ts — new
import type {TestingModule} from '@nestjs/testing';
import {RoomGroupImageOrderDto} from '@app/contracts/room/dto/room-group-image-order.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    imageRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const A = 'a'.repeat(32);
const B = '1'.repeat(32);
const C = '2'.repeat(32);
const ORDER_MESSAGE = '그룹 사진 전체를 한 번씩 원하는 순서로 보내주세요.';

describe('admin.room.group-image-order — 그룹 사진 순서 변경 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImages.mockResolvedValue([
            imageRow({room_group_image_id: A, sort_order: 0}),
            imageRow({room_group_image_id: B, sort_order: 1}),
            imageRow({room_group_image_id: C, sort_order: 2}),
        ]);
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 그룹 사진 전부를 받은 순서대로 0 부터 다시 매긴다(가장 앞이 대표)', async () => {
            const {decision, result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_IMAGE_ORDER,
                payload: {room_group_id: ROOM_GROUP_ID, room_group_image_ids: [C, A, B]},
                actor: MANAGER_ACTOR,
            });

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-image-order.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImages).toHaveBeenCalledWith(ROOM_GROUP_ID);
            expect(repo.updateRoomGroupImage).toHaveBeenCalledTimes(3);
            const calls = repo.updateRoomGroupImage.mock.calls as [unknown, RoomGroupImageEntity][];
            expect(calls.map(([where]) => where)).toEqual([{room_group_image_id: C}, {room_group_image_id: A}, {room_group_image_id: B}]);
            expect(calls.map(([, entity]) => entity.sort_order)).toEqual([0, 1, 2]);
            expect(calls.every(([, entity]) => entity instanceof RoomGroupImageEntity)).toBe(true);
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['빠짐', [C, A]],
            ['남음', [C, A, B, '3'.repeat(32)]],
            ['겹침', [C, A, A]],
            ['다른 그룹 사진 섞임', [C, A, '4'.repeat(32)]],
        ])('%s → failed 400 validation_errors.room_group_image_ids, 순서 변경 없음', async (_label, room_group_image_ids) => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_ORDER, payload: {room_group_id: ROOM_GROUP_ID, room_group_image_ids}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: ORDER_MESSAGE, validation_errors: [{property: 'room_group_image_ids', message: ORDER_MESSAGE}]}});
            expect(repo.updateRoomGroupImage).not.toHaveBeenCalled();
        });

        it('그룹이 없으면 failed 404, 사진 조회 · 순서 변경 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_ORDER, payload: {room_group_id: ROOM_GROUP_ID, room_group_image_ids: [A, B, C]}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupImages).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupImage).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('6장이면 → room_group_image_ids (한도)', async () => {
            const ids = ['0', '1', '2', '3', '4', '5'].map((digit) => digit.repeat(32));

            await expect(validateBody(RoomGroupImageOrderDto, {room_group_image_ids: ids})).resolves.toEqual({
                message: '객실 그룹 사진은 5장까지입니다.',
                validation_errors: [{property: 'room_group_image_ids', message: '객실 그룹 사진은 5장까지입니다.'}],
            });
        });

        it('항목이 32자 hex 가 아니면 → room_group_image_ids', async () => {
            await expect(validateBody(RoomGroupImageOrderDto, {room_group_image_ids: [A, 'xyz']})).resolves.toEqual({
                message: '사진 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_image_ids', message: '사진 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_ORDER, payload: {room_group_id: ROOM_GROUP_ID, room_group_image_ids: [A, B, C]}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 11. room-group-image-delete (큐)

```ts
// apps/admin-service/src/room/test/room-group-image-delete.spec.ts — new
import type {TestingModule} from '@nestjs/testing';
import {RoomGroupImageDeleteParamDto} from '@app/contracts/room/dto/room-group-image-delete.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    IMAGE_KEY,
    imageRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    ROOM_GROUP_IMAGE_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    StorageGatewayMock,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PAYLOAD = {room_group_id: ROOM_GROUP_ID, room_group_image_id: ROOM_GROUP_IMAGE_ID};

describe('admin.room.group-image-delete — 그룹 사진 삭제 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let storage: StorageGatewayMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupImage.mockResolvedValue(imageRow());
        ({dispatcher, module} = await bootCommandPath(repo, storage));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹의 사진만 찾아 행을 소프트 삭제한 뒤 S3 객체를 지운다(마지막)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-image-delete.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupImage).toHaveBeenCalledWith({room_group_image_id: ROOM_GROUP_IMAGE_ID, room_group_id: ROOM_GROUP_ID});
            expect(repo.deleteRoomGroupImage).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroupImage).toHaveBeenCalledWith({room_group_image_id: ROOM_GROUP_IMAGE_ID});
            expect(storage.remove).toHaveBeenCalledTimes(1);
            expect(storage.remove).toHaveBeenCalledWith(IMAGE_KEY);
            expect(repo.deleteRoomGroupImage.mock.invocationCallOrder[0]).toBeLessThan(storage.remove.mock.invocationCallOrder[0]);
            expect(repo.updateRoomGroupImage).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('사진이 없으면(다른 그룹 · 이미 지운 사진) failed 404, 삭제 · S3 삭제 없음', async () => {
            repo.findRoomGroupImage.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '사진을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteRoomGroupImage).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체) failed 404, 사진 조회 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupImage).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroupImage).not.toHaveBeenCalled();
            expect(storage.remove).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('사진 ID 경로가 32자 hex 가 아니면 → room_group_image_id', async () => {
            await expect(validateBody(RoomGroupImageDeleteParamDto, {room_group_id: ROOM_GROUP_ID, room_group_image_id: 'xyz'})).resolves.toEqual({
                message: '사진 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_image_id', message: '사진 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_IMAGE_DELETE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 12. room-group-plan-update (큐)

```ts
// apps/admin-service/src/room/test/room-group-plan-update.spec.ts — new
import type {TestingModule} from '@nestjs/testing';
import {RoomGroupPlanUpdateDto, RoomGroupPlanUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    groupPlanRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PARAM = {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'};
const SELL_PRICE_MESSAGE = '판매하려면 요금을 1원 이상 입력해주세요.';

describe('admin.room.group-plan-update — 그룹 상품 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupPlan.mockResolvedValue(groupPlanRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹 × 경로의 종류 행을 찾아 사용 여부 · 요금을 바꾼다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 89000}, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-plan-update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.updateRoomGroupPlan).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoomGroupPlan.mock.calls[0] as [unknown, RoomGroupPlanEntity];
            expect(where).toEqual({room_group_plan_id: ROOM_GROUP_PLAN_ID});
            expect(entity).toBeInstanceOf(RoomGroupPlanEntity);
            expect(entity).toMatchObject({is_used: 1, price: 89000});
            expect(entity.room_group_id).toBeUndefined();
            expect(entity.room_plan_type_id).toBeUndefined();
        });

        it('판매 안 함(is_used 0)이면 요금 0 도 된다', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 0, price: 0}, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.updateRoomGroupPlan.mock.calls[0][1]).toMatchObject({is_used: 0, price: 0});
        });
    });

    describe('[FAIL:service]', () => {
        it('판매(is_used 1)인데 요금 0 이면 failed 400 validation_errors.price, 수정 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 0}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: SELL_PRICE_MESSAGE, validation_errors: [{property: 'price', message: SELL_PRICE_MESSAGE}]}});
            expect(repo.updateRoomGroupPlan).not.toHaveBeenCalled();
        });

        it('그룹 상품 행이 없으면 failed 404, 수정 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 89000}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoomGroupPlan).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체 · 지운 그룹) failed 404, 그룹 상품 조회 · 수정 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 89000}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupPlan).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['요금 10,000,001원', {is_used: 1, price: 10000001}, 'price', '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'],
            ['요금 -1원', {is_used: 0, price: -1}, 'price', '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'],
            ['사용 여부 2', {is_used: 2, price: 1000}, 'is_used', '사용 여부가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomGroupPlanUpdateDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it('종류 경로가 HOURLY · NIGHT · LONG 이 아니면 → room_plan_type_id', async () => {
            await expect(validateBody(RoomGroupPlanUpdateParamDto, {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'WEEKLY'})).resolves.toEqual({
                message: '상품 종류가 올바르지 않습니다.',
                validation_errors: [{property: 'room_plan_type_id', message: '상품 종류가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_UPDATE, payload: {...PARAM, is_used: 1, price: 89000}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 13. room-group-plan-price-list (동기)

```ts
// apps/admin-service/src/room/test/room-group-plan-price-list.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    createRoomRepositoryMock,
    groupPlanRow,
    internalHeaders,
    MANAGER_ACTOR,
    priceRow,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    ROOM_GROUP_PLAN_PRICE_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    STORE_ID,
    storeRow,
} from './room.test-helper.js';

const PATH = `/internal/v1/admin-service/room/group/${ROOM_GROUP_ID}/plan/NIGHT/price`;
const OTHER_PRICE_ID = 'a'.repeat(32);

describe('GET /internal/v1/admin-service/room/group/:room_group_id/plan/:room_plan_type_id/price — 상품별 기간 가격 목록 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupPlan.mockResolvedValue(groupPlanRow());
        repo.countRoomGroupPlanPrices.mockResolvedValue(2);
        repo.findRoomGroupPlanPriceList.mockResolvedValue([
            priceRow(),
            priceRow({room_group_plan_price_id: OTHER_PRICE_ID, start_date: '2026-12-24', end_date: '2026-12-25', price: 150000, memo: null}),
        ]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 그룹 × 종류의 그룹 상품으로 같은 WHERE 를 세고 기본 페이지로 시작 날짜 순 목록(YYYY-MM-DD)을 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: ROOM_GROUP_PLAN_ID});
            expect(repo.findRoomGroupPlanPriceList).toHaveBeenCalledWith({room_group_plan_id: ROOM_GROUP_PLAN_ID}, 20, 0);
            expect(res.body).toEqual({
                list: [
                    {room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID, start_date: '2026-07-01', end_date: '2026-08-31', price: 120000, memo: '여름 성수기'},
                    {room_group_plan_price_id: OTHER_PRICE_ID, start_date: '2026-12-24', end_date: '2026-12-25', price: 150000, memo: null},
                ],
                pagination: expect.objectContaining({total_count: 2, page: 1, max_page: 1}),
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹 상품 행이 없으면 404, 개수 · 목록 조회 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '상품 설정을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.findRoomGroupPlanPriceList).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체 · 지운 그룹) 404, 그룹 상품 · 개수 조회 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 404, 그룹 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('종류 경로가 HOURLY · NIGHT · LONG 이 아니면 400 validation_errors.room_plan_type_id, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(`/internal/v1/admin-service/room/group/${ROOM_GROUP_ID}/plan/WEEKLY/price`).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '상품 종류가 올바르지 않습니다.', validation_errors: [{property: 'room_plan_type_id', message: '상품 종류가 올바르지 않습니다.'}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH);

            expect(res.status).toBe(403);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 14. room-group-plan-price (큐)

```ts
// apps/admin-service/src/room/test/room-group-plan-price.spec.ts — new
import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {LessThanOrEqual, MoreThanOrEqual} from 'typeorm';
import {RoomGroupPlanPriceDto} from '@app/contracts/room/dto/room-group-plan-price.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    groupPlanRow,
    ID_PATTERN,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PARAM = {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'};
const PAYLOAD = {...PARAM, start_date: '2026-07-01', end_date: '2026-08-31', price: 120000, memo: '여름 성수기'};
const OVERLAP_MESSAGE = '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.';

describe('admin.room.group-plan-price — 상품별 기간 가격 등록 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupPlan.mockResolvedValue(groupPlanRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 행 잠금 아래 그 그룹 상품의 겹침(시작 ≤ 새 종료 · 종료 ≥ 새 시작)을 세고 등록한다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-plan-price.done');
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledTimes(1);
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: LessThanOrEqual('2026-08-31'), end_date: MoreThanOrEqual('2026-07-01')});
            expect(repo.insertRoomGroupPlanPrice).toHaveBeenCalledTimes(1);
            const inserted = repo.insertRoomGroupPlanPrice.mock.calls[0][0] as RoomGroupPlanPriceEntity;
            expect(inserted).toBeInstanceOf(RoomGroupPlanPriceEntity);
            expect(inserted.room_group_plan_price_id).toMatch(ID_PATTERN);
            expect(inserted).toMatchObject({room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: '2026-07-01', end_date: '2026-08-31', price: 120000, memo: '여름 성수기', is_deleted: 0});
            expect(repo.countRoomGroupPlanPrices.mock.invocationCallOrder[0]).toBeLessThan(repo.insertRoomGroupPlanPrice.mock.invocationCallOrder[0]);
            expect(result).toEqual({result: {room_group_plan_price_id: inserted.room_group_plan_price_id}, error: null});
        });

        it.each([
            ['메모 없음', undefined],
            ['빈 메모', ''],
        ])('하루짜리(시작 = 종료)도 된다 — %s 는 null', async (_label, memo) => {
            const {result} = await runCommand(dispatcher, {
                type: ROOM_COMMAND.GROUP_PLAN_PRICE,
                payload: {...PARAM, start_date: '2026-12-24', end_date: '2026-12-24', price: 150000, memo},
                actor: MANAGER_ACTOR,
            });

            expect(result?.error).toBeNull();
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledWith({room_group_plan_id: ROOM_GROUP_PLAN_ID, start_date: LessThanOrEqual('2026-12-24'), end_date: MoreThanOrEqual('2026-12-24')});
            expect(repo.insertRoomGroupPlanPrice.mock.calls[0][0]).toMatchObject({start_date: '2026-12-24', end_date: '2026-12-24', memo: null});
        });
    });

    describe('[FAIL:service]', () => {
        it.each([
            ['없는 시작 날짜(02-30)', '2026-02-30', '2026-03-02', 'start_date', '없는 시작 날짜입니다.'],
            ['없는 종료 날짜(13월)', '2026-07-01', '2026-13-01', 'end_date', '없는 종료 날짜입니다.'],
            ['종료 < 시작', '2026-08-31', '2026-07-01', 'end_date', '종료 날짜는 시작 날짜보다 빠를 수 없습니다.'],
        ])('%s → failed 400 validation_errors.%s, 겹침 확인 · 등록 없음', async (_label, start_date, end_date, property, message) => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: {...PAYLOAD, start_date, end_date}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property, message}]}});
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹 상품 행이 없으면 failed 404, 겹침 확인 · 등록 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체 · 지운 그룹) failed 404, 그룹 상품 조회 · 등록 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.insertRoomGroupPlanPrice).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('같은 그룹 상품의 다른 기간과 겹치면(선검사) failed 400, 등록 없음', async () => {
            repo.countRoomGroupPlanPrices.mockResolvedValueOnce(1);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: OVERLAP_MESSAGE, validation_errors: null}});
            expect(repo.insertRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('선검사를 지나 DB 배타 제약에 걸려도(EXC 23P01 → repository 400) 같은 failed 400 — 재시도 없음', async () => {
            repo.insertRoomGroupPlanPrice.mockRejectedValueOnce(new BadRequestException({message: OVERLAP_MESSAGE}));

            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 400, body: {message: OVERLAP_MESSAGE, validation_errors: null}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['시작 날짜 모양(슬래시)', {start_date: '2026/07/01', end_date: '2026-08-31', price: 120000}, 'start_date', '시작 날짜를 YYYY-MM-DD 로 입력해주세요.'],
            ['종료 날짜 모양(한 자리 월)', {start_date: '2026-07-01', end_date: '2026-8-31', price: 120000}, 'end_date', '종료 날짜를 YYYY-MM-DD 로 입력해주세요.'],
            ['기간 요금 0원', {start_date: '2026-07-01', end_date: '2026-08-31', price: 0}, 'price', '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'],
            ['메모 31자', {start_date: '2026-07-01', end_date: '2026-08-31', price: 120000, memo: '가'.repeat(31)}, 'memo', '메모는 30자 이내로 입력해주세요.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomGroupPlanPriceDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });

        it('메모 30자 · 요금 10,000,000원은 통과', async () => {
            await expect(validateBody(RoomGroupPlanPriceDto, {start_date: '2026-07-01', end_date: '2026-08-31', price: 10000000, memo: '가'.repeat(30)})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 15. room-group-plan-price-update (큐)

```ts
// apps/admin-service/src/room/test/room-group-plan-price-update.spec.ts — new
import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {LessThanOrEqual, MoreThanOrEqual, Not} from 'typeorm';
import {RoomGroupPlanPriceUpdateDto, RoomGroupPlanPriceUpdateParamDto} from '@app/contracts/room/dto/room-group-plan-price-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    groupPlanRow,
    MANAGER_ACTOR,
    priceRow,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    ROOM_GROUP_PLAN_PRICE_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PARAM = {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT', room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID};
const PAYLOAD = {...PARAM, start_date: '2026-07-15', end_date: '2026-08-20', price: 130000, memo: '극성수기'};
const OVERLAP_MESSAGE = '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.';

describe('admin.room.group-plan-price-update — 상품별 기간 가격 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupPlan.mockResolvedValue(groupPlanRow());
        repo.findRoomGroupPlanPrice.mockResolvedValue(priceRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 그룹 상품의 기간 가격을 찾아 자기 자신을 뺀 겹침을 세고 4개 필드를 통째로 바꾼다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-plan-price-update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.findRoomGroupPlanPrice).toHaveBeenCalledWith({room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID, room_group_plan_id: ROOM_GROUP_PLAN_ID});
            expect(repo.countRoomGroupPlanPrices).toHaveBeenCalledWith({
                room_group_plan_id: ROOM_GROUP_PLAN_ID,
                start_date: LessThanOrEqual('2026-08-20'),
                end_date: MoreThanOrEqual('2026-07-15'),
                room_group_plan_price_id: Not(ROOM_GROUP_PLAN_PRICE_ID),
            });
            expect(repo.updateRoomGroupPlanPrice).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoomGroupPlanPrice.mock.calls[0] as [unknown, RoomGroupPlanPriceEntity];
            expect(where).toEqual({room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID});
            expect(entity).toBeInstanceOf(RoomGroupPlanPriceEntity);
            expect(entity).toMatchObject({start_date: '2026-07-15', end_date: '2026-08-20', price: 130000, memo: '극성수기'});
            expect(entity.room_group_plan_id).toBeUndefined();
            expect(entity.is_deleted).toBeUndefined();
        });

        it('메모를 보내지 않으면 null 로 바꾼다(통째로 교체)', async () => {
            const {memo: _memo, ...withoutMemo} = PAYLOAD;

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: withoutMemo, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect((repo.updateRoomGroupPlanPrice.mock.calls[0][1] as RoomGroupPlanPriceEntity).memo).toBeNull();
        });
    });

    describe('[FAIL:service]', () => {
        it('기간 가격이 없으면(다른 그룹 상품 · 지운 것) failed 404, 수정 없음', async () => {
            repo.findRoomGroupPlanPrice.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '기간 가격을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it.each([
            ['없는 시작 날짜(02-30)', '2026-02-30', '2026-03-02', 'start_date', '없는 시작 날짜입니다.'],
            ['없는 종료 날짜(13월)', '2026-07-15', '2026-13-01', 'end_date', '없는 종료 날짜입니다.'],
            ['종료 < 시작', '2026-08-20', '2026-07-15', 'end_date', '종료 날짜는 시작 날짜보다 빠를 수 없습니다.'],
        ])('%s → failed 400 validation_errors.%s, 겹침 확인 · 수정 없음', async (_label, start_date, end_date, property, message) => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: {...PAYLOAD, start_date, end_date}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message, validation_errors: [{property, message}]}});
            expect(repo.countRoomGroupPlanPrices).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹 상품 행이 없으면 failed 404, 기간 가격 조회 · 수정 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlanPrice).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹이 없으면 failed 404, 그룹 상품 조회 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('자기 자신 말고 다른 기간과 겹치면(선검사) failed 400, 수정 없음', async () => {
            repo.countRoomGroupPlanPrices.mockResolvedValueOnce(1);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: OVERLAP_MESSAGE, validation_errors: null}});
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('DB 배타 제약 위반(EXC 23P01 → repository 400)도 같은 failed 400', async () => {
            repo.updateRoomGroupPlanPrice.mockRejectedValueOnce(new BadRequestException({message: OVERLAP_MESSAGE}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: OVERLAP_MESSAGE, validation_errors: null}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('기간 요금 10,000,001원 → price', async () => {
            await expect(validateBody(RoomGroupPlanPriceUpdateDto, {start_date: '2026-07-15', end_date: '2026-08-20', price: 10000001})).resolves.toEqual({
                message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.',
                validation_errors: [{property: 'price', message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'}],
            });
        });

        it('기간 가격 ID 경로가 32자 hex 가 아니면 → room_group_plan_price_id', async () => {
            await expect(validateBody(RoomGroupPlanPriceUpdateParamDto, {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT', room_group_plan_price_id: 'xyz'})).resolves.toEqual({
                message: '기간 가격 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_plan_price_id', message: '기간 가격 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_UPDATE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 16. room-group-plan-price-delete (큐)

```ts
// apps/admin-service/src/room/test/room-group-plan-price-delete.spec.ts — new
import type {TestingModule} from '@nestjs/testing';
import {RoomGroupPlanPriceDeleteParamDto} from '@app/contracts/room/dto/room-group-plan-price-delete.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    groupPlanRow,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    ROOM_GROUP_PLAN_ID,
    ROOM_GROUP_PLAN_PRICE_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PAYLOAD = {room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT', room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID};

describe('admin.room.group-plan-price-delete — 상품별 기간 가격 삭제 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        repo.findRoomGroupPlan.mockResolvedValue(groupPlanRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 그룹 상품의 기간 가격만 소프트 삭제한다(조회 없이 affected 로 판별)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.group-plan-price-delete.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.findRoomGroupPlan).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, room_plan_type_id: 'NIGHT'});
            expect(repo.deleteRoomGroupPlanPrice).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoomGroupPlanPrice).toHaveBeenCalledWith({room_group_plan_price_id: ROOM_GROUP_PLAN_PRICE_ID, room_group_plan_id: ROOM_GROUP_PLAN_ID});
            expect(repo.updateRoomGroupPlanPrice).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('지운 행이 없으면(다른 그룹 상품 · 이미 지운 것) failed 404', async () => {
            repo.deleteRoomGroupPlanPrice.mockResolvedValueOnce(false);

            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(result?.error).toEqual({status_code: 404, body: {message: '기간 가격을 찾을 수 없습니다.', validation_errors: null}});
        });

        it('그룹 상품 행이 없으면 failed 404, 삭제 없음', async () => {
            repo.findRoomGroupPlan.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '상품 설정을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('그룹이 없으면(다른 업체) failed 404, 그룹 상품 조회 · 삭제 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroupPlan).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroupPlanPrice).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 · 삭제 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.deleteRoomGroupPlanPrice).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('기간 가격 ID 경로가 32자 hex 가 아니면 → room_group_plan_price_id', async () => {
            await expect(validateBody(RoomGroupPlanPriceDeleteParamDto, {...PAYLOAD, room_group_plan_price_id: 'xyz'})).resolves.toEqual({
                message: '기간 가격 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_group_plan_price_id', message: '기간 가격 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.GROUP_PLAN_PRICE_DELETE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 17. room-list (동기)

```ts
// apps/admin-service/src/room/test/room-list.spec.ts — new
import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createRoomRepositoryMock, FIXED_TIME, internalHeaders, MANAGER_ACTOR, ROOM_GROUP_ID, ROOM_ID, roomRow, RoomRepositoryMock, STORE_ID, storeRow} from './room.test-helper.js';

const PATH = '/internal/v1/admin-service/room';

describe('GET /internal/v1/admin-service/room — 호실 목록 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.countRooms.mockResolvedValue(1);
        repo.findRoomRows.mockResolvedValue([roomRow()]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('필터가 없으면 내 업체 호실을 세고 기본 페이지로 층 · 호실명 순 목록(그룹명 · 상태명 포함)을 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.countRooms).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.findRoomRows).toHaveBeenCalledWith({store_id: STORE_ID, floor: null, room_group_id: null}, 20, 0);
            expect(repo.countRooms.mock.invocationCallOrder[0]).toBeLessThan(repo.findRoomRows.mock.invocationCallOrder[0]);
            expect(res.body).toEqual({
                list: [
                    {
                        room_id: ROOM_ID,
                        room_group_id: ROOM_GROUP_ID,
                        room_group_name: '스탠다드',
                        room_name: '101호',
                        floor: 1,
                        room_state_id: 'AVAILABLE',
                        room_state_name: '예약가능',
                        created_at: FIXED_TIME.toISOString(),
                    },
                ],
                pagination: expect.objectContaining({total_count: 1, page: 1}),
            });
        });

        it('층(지하 음수 — 정수 문자열) · 그룹 필터는 숫자 층 · 그룹 ID 로 같은 조건을 세고 목록에 넘긴다', async () => {
            const res = await request(app.getHttpServer()).get(`${PATH}?floor=-1&room_group_id=${ROOM_GROUP_ID}`).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.countRooms).toHaveBeenCalledWith({store_id: STORE_ID, floor: -1, room_group_id: ROOM_GROUP_ID});
            expect(repo.findRoomRows).toHaveBeenCalledWith({store_id: STORE_ID, floor: -1, room_group_id: ROOM_GROUP_ID}, 20, 0);
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['층이 정수가 아님(B1)', 'floor=B1', 'floor', '층을 정수로 입력해주세요.'],
            ['그룹 ID 가 32자 hex 가 아님', 'room_group_id=xyz', 'room_group_id', '객실 그룹 ID가 올바르지 않습니다.'],
        ])('%s → 400 validation_errors.%s, 업체 조회 없음', async (_label, query, property, message) => {
            const res = await request(app.getHttpServer()).get(`${PATH}?${query}`).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property, message}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 404, 개수 · 목록 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.countRooms).not.toHaveBeenCalled();
            expect(repo.findRoomRows).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH);

            expect(res.status).toBe(403);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 18. room-create (큐)

```ts
// apps/admin-service/src/room/test/room-create.spec.ts — new
import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {createValidationError} from '@app/common/utils/validation.js';
import {RoomDto} from '@app/contracts/room/dto/room.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {
    bootCommandPath,
    createRoomRepositoryMock,
    ID_PATTERN,
    MANAGER_ACTOR,
    ROOM_GROUP_ID,
    roomGroupEntity,
    RoomRepositoryMock,
    runCommand,
    STORE_ID,
    storeRow,
    validateBody,
} from './room.test-helper.js';

const PAYLOAD = {room_group_id: ROOM_GROUP_ID, room_name: '101호', floor: 1};
const NAME_TAKEN = '이미 있는 호실명입니다.';

describe('admin.room.create — 호실 등록 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체의 지워지지 않은 그룹에 예약가능 상태로 등록한다 — 업체는 그룹의 업체(= 내 업체)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.create.done');
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: ROOM_GROUP_ID, store_id: STORE_ID});
            expect(repo.insertRoom).toHaveBeenCalledTimes(1);
            const inserted = repo.insertRoom.mock.calls[0][0] as RoomEntity;
            expect(inserted).toBeInstanceOf(RoomEntity);
            expect(inserted.room_id).toMatch(ID_PATTERN);
            expect(inserted).toMatchObject({store_id: STORE_ID, room_group_id: ROOM_GROUP_ID, room_state_id: 'AVAILABLE', room_name: '101호', floor: 1, is_deleted: 0});
            expect(result).toEqual({result: {room_id: inserted.room_id}, error: null});
        });

        it('지하층(-1)도 등록한다', async () => {
            await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: {...PAYLOAD, room_name: 'B101호', floor: -1}, actor: MANAGER_ACTOR});

            expect(repo.insertRoom.mock.calls[0][0]).toMatchObject({room_name: 'B101호', floor: -1});
        });
    });

    describe('[FAIL:service]', () => {
        it('그룹이 없으면(다른 업체 · 지운 그룹) failed 404, 등록 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.insertRoom).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 그룹 조회 · 등록 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoomGroup).not.toHaveBeenCalled();
            expect(repo.insertRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:duplicate]', () => {
        it('업체 안 지워지지 않은 같은 호실명이 있으면(UK 변환 — repository 400) failed 400 validation_errors.room_name', async () => {
            repo.insertRoom.mockRejectedValueOnce(new BadRequestException({message: NAME_TAKEN, validation_errors: createValidationError('room_name', NAME_TAKEN)}));

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: NAME_TAKEN, validation_errors: [{property: 'room_name', message: NAME_TAKEN}]}});
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it.each([
            ['호실명 51자', {...PAYLOAD, room_name: '가'.repeat(51)}, 'room_name', '호실명은 50자 이내로 입력해주세요.'],
            ['층 201', {...PAYLOAD, floor: 201}, 'floor', '층은 -10 ~ 200 사이로 입력해주세요.'],
            ['층 -11', {...PAYLOAD, floor: -11}, 'floor', '층은 -10 ~ 200 사이로 입력해주세요.'],
            ['그룹 ID 가 32자 hex 가 아님', {...PAYLOAD, room_group_id: 'xyz'}, 'room_group_id', '객실 그룹 ID가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, property, message) => {
            await expect(validateBody(RoomDto, body)).resolves.toEqual({message, validation_errors: [{property, message}]});
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.CREATE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 19. room-update (큐)

```ts
// apps/admin-service/src/room/test/room-update.spec.ts — new
import {BadRequestException} from '@nestjs/common';
import type {TestingModule} from '@nestjs/testing';
import {createValidationError} from '@app/common/utils/validation.js';
import {RoomUpdateDto, RoomUpdateParamDto} from '@app/contracts/room/dto/room-update.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, ROOM_ID, roomEntity, roomGroupEntity, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const OTHER_GROUP_ID = 'a'.repeat(32);
const PAYLOAD = {room_id: ROOM_ID, room_group_id: OTHER_GROUP_ID, room_name: '201호', floor: 2};
const NAME_TAKEN = '이미 있는 호실명입니다.';

describe('admin.room.update — 호실 수정 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoom.mockResolvedValue(roomEntity());
        repo.findRoomGroup.mockResolvedValue(roomGroupEntity({room_group_id: OTHER_GROUP_ID, room_group_name: '디럭스'}));
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 호실을 찾아 같은 업체의 다른 그룹으로 옮기고 호실명 · 층을 통째로 바꾼다(상태 · 업체는 그대로)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.update.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(repo.findRoomGroup).toHaveBeenCalledWith({room_group_id: OTHER_GROUP_ID, store_id: STORE_ID});
            expect(repo.updateRoom).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoom.mock.calls[0] as [unknown, RoomEntity];
            expect(where).toEqual({room_id: ROOM_ID});
            expect(entity).toBeInstanceOf(RoomEntity);
            expect(entity).toMatchObject({room_group_id: OTHER_GROUP_ID, room_name: '201호', floor: 2});
            expect(entity.room_state_id).toBeUndefined();
            expect(entity.store_id).toBeUndefined();
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면(다른 업체 · 지운 호실) failed 404, 수정 없음', async () => {
            repo.findRoom.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '호실을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });

        it('옮길 그룹이 없으면(다른 업체 그룹 · 지운 그룹) failed 404, 수정 없음', async () => {
            repo.findRoomGroup.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.UPDATE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '객실 그룹을 찾을 수 없습니다.', validation_errors: null}});
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
            await expect(validateBody(RoomUpdateDto, {room_group_id: OTHER_GROUP_ID, room_name: '201호', floor: 201})).resolves.toEqual({
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

#### 20. room-delete (큐)

```ts
// apps/admin-service/src/room/test/room-delete.spec.ts — new
import type {TestingModule} from '@nestjs/testing';
import {RoomDeleteParamDto} from '@app/contracts/room/dto/room-delete.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, ROOM_ID, roomEntity, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const PAYLOAD = {room_id: ROOM_ID};

describe('admin.room.delete — 호실 삭제 (큐 경로)', () => {
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
        it('그 업체 호실을 찾아 소프트 삭제한다', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.delete.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(repo.deleteRoom).toHaveBeenCalledTimes(1);
            expect(repo.deleteRoom).toHaveBeenCalledWith({room_id: ROOM_ID});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면(다른 업체 · 이미 지운 호실) failed 404, 삭제 없음', async () => {
            repo.findRoom.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '호실을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.deleteRoom).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 호실 조회 · 삭제 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.DELETE, payload: PAYLOAD, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoom).not.toHaveBeenCalled();
            expect(repo.deleteRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('호실 ID 경로가 32자 hex 가 아니면 → room_id', async () => {
            await expect(validateBody(RoomDeleteParamDto, {room_id: 'xyz'})).resolves.toEqual({
                message: '호실 ID가 올바르지 않습니다.',
                validation_errors: [{property: 'room_id', message: '호실 ID가 올바르지 않습니다.'}],
            });
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.DELETE, payload: PAYLOAD, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

#### 21. room-state (큐 — `[CASES:canChangeRoomState]` 전환 표 TDD)

```ts
// apps/admin-service/src/room/test/room-state.spec.ts — new
import type {TestingModule} from '@nestjs/testing';
import {RoomStateDto} from '@app/contracts/room/dto/room-state.dto.js';
import {ROOM_COMMAND} from '@app/contracts/room/room.commands.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createRoomRepositoryMock, MANAGER_ACTOR, ROOM_ID, roomEntity, RoomRepositoryMock, runCommand, STORE_ID, storeRow, validateBody} from './room.test-helper.js';

const STATE_INVALID = '지금 상태에서는 바꿀 수 없습니다.';
const DTO_STATE_INVALID = '바꿀 수 있는 호실 상태가 아닙니다.';

describe('admin.room.state — 호실 상태 변경 (큐 경로)', () => {
    let repo: RoomRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.findRoom.mockResolvedValue(roomEntity({room_state_id: 'MAINTENANCE'}));
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('정비 완료 — 그 업체 정비중 호실을 예약가능으로 바꾼다(상태만)', async () => {
            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: 'AVAILABLE'}, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('admin.room.state.done');
            expect(result).toEqual({result: null, error: null});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.findRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(repo.updateRoom).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateRoom.mock.calls[0] as [unknown, RoomEntity];
            expect(where).toEqual({room_id: ROOM_ID});
            expect(entity).toBeInstanceOf(RoomEntity);
            expect(entity.room_state_id).toBe('AVAILABLE');
            expect(entity.room_name).toBeUndefined();
            expect(entity.floor).toBeUndefined();
            expect(entity.room_group_id).toBeUndefined();
        });
    });

    describe('[CASES:canChangeRoomState] 업체 관리자 전환 표 (사용자 결정 2026-10-31)', () => {
        it.each([
            ['MAINTENANCE', 'AVAILABLE', true],
            ['AVAILABLE', 'DISABLED', true],
            ['MAINTENANCE', 'DISABLED', true],
            ['DISABLED', 'AVAILABLE', true],
            ['AVAILABLE', 'AVAILABLE', false],
            ['DISABLED', 'DISABLED', false],
            ['RESERVED', 'AVAILABLE', false],
            ['RESERVED', 'DISABLED', false],
            ['IN_USE', 'AVAILABLE', false],
            ['IN_USE', 'DISABLED', false],
            ['UNKNOWN', 'AVAILABLE', false],
        ] as const)('%s → %s : 허용 %s', async (from, to, allowed) => {
            repo.findRoom.mockResolvedValueOnce(roomEntity({room_state_id: from}));

            const {decision, result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: to}, actor: MANAGER_ACTOR});

            expect(decision.action).toBe('ack');
            if (allowed) {
                expect(result).toEqual({result: null, error: null});
                expect(repo.updateRoom).toHaveBeenCalledTimes(1);
                expect(repo.updateRoom.mock.calls[0][0]).toEqual({room_id: ROOM_ID});
                expect((repo.updateRoom.mock.calls[0][1] as RoomEntity).room_state_id).toBe(to);
            } else {
                expect(result?.error).toEqual({status_code: 400, body: {message: STATE_INVALID, validation_errors: null}});
                expect(repo.updateRoom).not.toHaveBeenCalled();
            }
        });

        it.each([
            ['AVAILABLE', 'MAINTENANCE'],
            ['AVAILABLE', 'RESERVED'],
        ] as const)('%s → %s : 게이트웨이 DTO 가 거부하고(AVAILABLE · DISABLED 만), 지나쳐 와도 service 가 400', async (from, to) => {
            await expect(validateBody(RoomStateDto, {room_state_id: to})).resolves.toEqual({message: DTO_STATE_INVALID, validation_errors: [{property: 'room_state_id', message: DTO_STATE_INVALID}]});

            repo.findRoom.mockResolvedValueOnce(roomEntity({room_state_id: from}));
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: to}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 400, body: {message: STATE_INVALID, validation_errors: null}});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면(다른 업체 · 지운 호실) failed 404, 상태 변경 없음', async () => {
            repo.findRoom.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: 'AVAILABLE'}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '호실을 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });

        it('소속 업체가 없으면 failed 404, 호실 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: 'AVAILABLE'}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.findRoom).not.toHaveBeenCalled();
            expect(repo.updateRoom).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('AVAILABLE · DISABLED 는 통과', async () => {
            await expect(validateBody(RoomStateDto, {room_state_id: 'AVAILABLE'})).resolves.toBeNull();
            await expect(validateBody(RoomStateDto, {room_state_id: 'DISABLED'})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: ROOM_COMMAND.STATE, payload: {room_id: ROOM_ID, room_state_id: 'AVAILABLE'}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
```

### Tests — repository spec

가짜 `txHost.tx.getRepository(엔티티)` 로 오류 변환 · 넘긴 조건 · 소프트 삭제 · 통일 500 을, 접속 없는 `DataSource` 로 빌더 7개의 SQL 을 고정한다(형제 store.repository.spec.ts). Smoke 의 전체 SQL 은 build 때 dist 로 뽑아 자리표시 상수를 채운다 — 그 전에도 파라미터 배열 · 핵심 조각(`toContain` · `toMatch`) · select 별칭은 여기서 고정한다. `buildPlanPriceOverlapWhere` 는 제외 ID 를 마지막 키로 붙인다(TypeORM 은 where 키 삽입 순서로 파라미터를 매긴다 — `SelectQueryBuilder.buildWhere` 의 `for (const key in where)`).

```ts
// apps/admin-service/src/room/test/room.repository.spec.ts — new
import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, ILike, QueryFailedError} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {RoomGroupImageEntity} from '@app/database/entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from '@app/database/entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from '@app/database/entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from '@app/database/entities/room/room-group.entity.js';
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {RoomGroupPlanRow, RoomGroupRow, RoomPlanRow, RoomRow} from '../interfaces/room.repository.interface.js';
import {RoomRepository} from '../repositories/room.repository.js';
import {buildPlanPriceOverlapWhere} from '../room.util.js';

/** RoomPlanRow 키 — raw select 별칭과 비교 */
const ROOM_PLAN_ROW_KEYS: (keyof RoomPlanRow)[] = ['room_plan_id', 'store_id', 'room_plan_type_id', 'room_plan_type_name', 'is_used', 'days_of_week', 'usage_hours', 'check_in_time', 'check_out_time'];

/** RoomGroupRow 키 */
const ROOM_GROUP_ROW_KEYS: (keyof RoomGroupRow)[] = ['room_group_id', 'room_group_name', 'created_at', 'room_count', 'cover_file_key'];

/** RoomGroupPlanRow 키 */
const ROOM_GROUP_PLAN_ROW_KEYS: (keyof RoomGroupPlanRow)[] = ['room_group_plan_id', 'room_group_id', 'room_plan_type_id', 'room_plan_type_name', 'is_used', 'price'];

/** RoomRow 키 */
const ROOM_ROW_KEYS: (keyof RoomRow)[] = ['room_id', 'room_group_id', 'room_group_name', 'room_name', 'floor', 'room_state_id', 'room_state_name', 'created_at'];

/**
 * PostgreSQL 드라이버가 던지는 것과 같은 모양의 제약 위반 오류.
 *
 * @param code 23505(UK) | 23503(FK) | 23P01(배타 제약)
 * @param constraint 제약명
 * @returns QueryFailedError
 */
function constraintError(code: '23505' | '23503' | '23P01', constraint: string): QueryFailedError {
    return new QueryFailedError('INSERT ...', [], Object.assign(new Error('violates constraint'), {code, constraint}));
}

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티) 가 엔티티별 가짜 repository 를 돌려준다.
 *
 * @returns 저장소와 엔티티별 가짜 repository
 */
function makeRepository() {
    const fake = () => ({
        insert: vi.fn().mockResolvedValue({}),
        findOne: vi.fn().mockResolvedValue(null),
        find: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({affected: 1}),
        delete: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
    });
    const repos = new Map<unknown, ReturnType<typeof fake>>([
        [StoreEntity, fake()],
        [RoomPlanEntity, fake()],
        [RoomGroupEntity, fake()],
        [RoomGroupPlanEntity, fake()],
        [RoomGroupImageEntity, fake()],
        [RoomGroupPlanPriceEntity, fake()],
        [RoomEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {
        repository: new RoomRepository(txHost),
        store: repos.get(StoreEntity)!,
        roomPlan: repos.get(RoomPlanEntity)!,
        group: repos.get(RoomGroupEntity)!,
        groupPlan: repos.get(RoomGroupPlanEntity)!,
        image: repos.get(RoomGroupImageEntity)!,
        price: repos.get(RoomGroupPlanPriceEntity)!,
        room: repos.get(RoomEntity)!,
    };
}

/**
 * raw select 의 별칭 목록 (` AS "<키>"`)
 *
 * @param sql 공백을 한 칸으로 줄인 SQL
 * @returns 별칭 목록 (나온 순서)
 */
function selectAliases(sql: string): string[] {
    return [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((match) => match[1]);
}

describe('RoomRepository — TypeORM 오류 → HTTP 예외 매핑', () => {
    const GROUP_NAME_TAKEN = {message: '이미 있는 그룹명입니다.', validation_errors: [{property: 'room_group_name', message: '이미 있는 그룹명입니다.'}]};
    const ROOM_NAME_TAKEN = {message: '이미 있는 호실명입니다.', validation_errors: [{property: 'room_name', message: '이미 있는 호실명입니다.'}]};
    const IMAGE_TAKEN = {message: '이미 등록된 사진입니다.'};
    const PRICE_OVERLAP = {message: '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.'};

    it.each([
        ['insertRoomGroup', 'group', 'insert', '23505', 'UK_RoomGroup_StoreIdRoomGroupName', GROUP_NAME_TAKEN],
        ['updateRoomGroup', 'group', 'update', '23505', 'UK_RoomGroup_StoreIdRoomGroupName', GROUP_NAME_TAKEN],
        ['insertRoom', 'room', 'insert', '23505', 'UK_Room_StoreIdRoomName', ROOM_NAME_TAKEN],
        ['updateRoom', 'room', 'update', '23505', 'UK_Room_StoreIdRoomName', ROOM_NAME_TAKEN],
        ['insertRoomGroupImage', 'image', 'insert', '23505', 'UK_RoomGroupImage_FileKey', IMAGE_TAKEN],
        ['insertRoomGroupPlanPrice', 'price', 'insert', '23P01', 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange', PRICE_OVERLAP],
        ['updateRoomGroupPlanPrice', 'price', 'update', '23P01', 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange', PRICE_OVERLAP],
    ] as const)('[FAIL:repository] %s — %s.%s 가 %s %s 위반 → 400', async (method, repo, fn, code, constraint, body) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(constraintError(code, constraint));

        const error = await (fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, {}).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual(body);
    });

    it.each([
        ['insertRoomGroup — 다른 UK', 'insertRoomGroup', 'group', 'insert', '23505', 'UK_Room_StoreIdRoomName'],
        ['insertRoom — FK 위반', 'insertRoom', 'room', 'insert', '23503', 'FK_Room_RoomGroup'],
        ['insertRoomGroupPlanPrice — 제약명이 같아도 코드가 23P01 이 아님', 'insertRoomGroupPlanPrice', 'price', 'insert', '23505', 'EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange'],
        ['updateRoomGroupPlanPrice — 다른 배타 제약', 'updateRoomGroupPlanPrice', 'price', 'update', '23P01', 'EXC_Other'],
        ['insertRoomGroupPlans — 새 그룹이라 UK 와 겹칠 수 없다', 'insertRoomGroupPlans', 'groupPlan', 'insert', '23505', 'UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId'],
    ] as const)('[FAIL:repository] %s → 통일 500', async (_label, method, repo, fn, code, constraint) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(constraintError(code, constraint));

        await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, {})).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('그룹 · 사진 · 기간 가격 · 호실의 조회 · 개수 · 수정은 받은 조건에 is_deleted: 0 을 더한다(배열 OR 은 조건마다), 단건 조회는 loadRelationIds', async () => {
        const {repository, group, image, price, room} = makeRepository();
        const groupEntity = new RoomGroupEntity();
        const imageEntity = new RoomGroupImageEntity();
        const priceEntity = new RoomGroupPlanPriceEntity();
        const roomEntity = new RoomEntity();

        await repository.findRoomGroup({room_group_id: 'g1', store_id: 's1'});
        await repository.countRoomGroups({store_id: 's1'});
        await repository.countRoomGroups([{store_id: 's1', room_group_name: ILike('%룸%')}, {store_id: 's2'}]);
        await repository.updateRoomGroup({room_group_id: 'g1'}, groupEntity);
        await repository.findRoomGroupImage({room_group_image_id: 'i1', room_group_id: 'g1'});
        await repository.updateRoomGroupImage({room_group_image_id: 'i1'}, imageEntity);
        await repository.countRoomGroupPlanPrices({room_group_plan_id: 'gp1'});
        await repository.findRoomGroupPlanPrice({room_group_plan_price_id: 'pp1', room_group_plan_id: 'gp1'});
        await repository.updateRoomGroupPlanPrice({room_group_plan_price_id: 'pp1'}, priceEntity);
        await repository.countRooms({store_id: 's1', floor: -1});
        await repository.findRoom({room_id: 'r1', store_id: 's1'});
        await repository.updateRoom({room_id: 'r1'}, roomEntity);

        expect(group.findOne).toHaveBeenCalledWith({where: {room_group_id: 'g1', store_id: 's1', is_deleted: 0}, loadRelationIds: true});
        expect(group.count).toHaveBeenNthCalledWith(1, {where: {store_id: 's1', is_deleted: 0}});
        expect(group.count).toHaveBeenNthCalledWith(2, {
            where: [
                {store_id: 's1', room_group_name: ILike('%룸%'), is_deleted: 0},
                {store_id: 's2', is_deleted: 0},
            ],
        });
        expect(group.update).toHaveBeenCalledWith({room_group_id: 'g1', is_deleted: 0}, groupEntity);
        expect(image.findOne).toHaveBeenCalledWith({where: {room_group_image_id: 'i1', room_group_id: 'g1', is_deleted: 0}, loadRelationIds: true});
        expect(image.update).toHaveBeenCalledWith({room_group_image_id: 'i1', is_deleted: 0}, imageEntity);
        expect(price.count).toHaveBeenCalledWith({where: {room_group_plan_id: 'gp1', is_deleted: 0}});
        expect(price.findOne).toHaveBeenCalledWith({where: {room_group_plan_price_id: 'pp1', room_group_plan_id: 'gp1', is_deleted: 0}, loadRelationIds: true});
        expect(price.update).toHaveBeenCalledWith({room_group_plan_price_id: 'pp1', is_deleted: 0}, priceEntity);
        expect(room.count).toHaveBeenCalledWith({where: {store_id: 's1', floor: -1, is_deleted: 0}});
        expect(room.findOne).toHaveBeenCalledWith({where: {room_id: 'r1', store_id: 's1', is_deleted: 0}, loadRelationIds: true});
        expect(room.update).toHaveBeenCalledWith({room_id: 'r1', is_deleted: 0}, roomEntity);
    });

    it('삭제 표시가 없는 업체 상품 설정 · 그룹 상품은 받은 조건 그대로(행을 지우지 않는 테이블)', async () => {
        const {repository, roomPlan, groupPlan} = makeRepository();
        const planEntity = new RoomPlanEntity();
        const groupPlanEntity = new RoomGroupPlanEntity();

        await repository.findRoomPlan({store_id: 's1', room_plan_type_id: 'HOURLY'});
        await repository.updateRoomPlan({room_plan_id: 'p1'}, planEntity);
        await repository.findRoomGroupPlan({room_group_id: 'g1', room_plan_type_id: 'NIGHT'});
        await repository.updateRoomGroupPlan({room_group_plan_id: 'gp1'}, groupPlanEntity);

        expect(roomPlan.findOne).toHaveBeenCalledWith({where: {store_id: 's1', room_plan_type_id: 'HOURLY'}, loadRelationIds: true});
        expect(roomPlan.update).toHaveBeenCalledWith({room_plan_id: 'p1'}, planEntity);
        expect(groupPlan.findOne).toHaveBeenCalledWith({where: {room_group_id: 'g1', room_plan_type_id: 'NIGHT'}, loadRelationIds: true});
        expect(groupPlan.update).toHaveBeenCalledWith({room_group_plan_id: 'gp1'}, groupPlanEntity);
    });

    it('insert 는 받은 엔티티(그룹 상품은 배열)를 그대로 한 번에 넘긴다 — @BeforeInsert 훅이 돈다', async () => {
        const {repository, group, groupPlan, image, price, room} = makeRepository();
        const groupEntity = new RoomGroupEntity();
        const plans = [new RoomGroupPlanEntity(), new RoomGroupPlanEntity(), new RoomGroupPlanEntity()];
        const imageEntity = new RoomGroupImageEntity();
        const priceEntity = new RoomGroupPlanPriceEntity();
        const roomEntity = new RoomEntity();

        await repository.insertRoomGroup(groupEntity);
        await repository.insertRoomGroupPlans(plans);
        await repository.insertRoomGroupImage(imageEntity);
        await repository.insertRoomGroupPlanPrice(priceEntity);
        await repository.insertRoom(roomEntity);

        expect(group.insert).toHaveBeenCalledTimes(1);
        expect(group.insert.mock.calls[0][0]).toBe(groupEntity);
        expect(groupPlan.insert).toHaveBeenCalledTimes(1);
        expect(groupPlan.insert.mock.calls[0][0]).toBe(plans);
        expect(image.insert.mock.calls[0][0]).toBe(imageEntity);
        expect(price.insert.mock.calls[0][0]).toBe(priceEntity);
        expect(room.insert.mock.calls[0][0]).toBe(roomEntity);
    });

    it.each([
        ['deleteRoomGroup', 'group', RoomGroupEntity, {room_group_id: 'g1'}],
        ['deleteRoomGroupImage', 'image', RoomGroupImageEntity, {room_group_image_id: 'i1'}],
        ['deleteRoomGroupImages', 'image', RoomGroupImageEntity, {room_group_id: 'g1'}],
        ['deleteRoom', 'room', RoomEntity, {room_id: 'r1'}],
        ['deleteRooms', 'room', RoomEntity, {room_group_id: 'g1'}],
    ] as const)('%s 는 실제로 지우지 않고 지워지지 않은 행을 삭제 표시한다(소프트 삭제)', async (method, repo, Entity, where) => {
        const fakes = makeRepository();

        await (fakes.repository[method] as (condition: unknown) => Promise<unknown>)(where);

        expect(fakes[repo].delete).not.toHaveBeenCalled();
        expect(fakes[repo].update).toHaveBeenCalledTimes(1);
        const [condition, entity] = fakes[repo].update.mock.calls[0] as [unknown, object];
        expect(condition).toEqual({...where, is_deleted: 0});
        expect(entity).toBeInstanceOf(Entity);
        expect({...entity}).toEqual({is_deleted: 1});
    });

    it.each([
        [1, true],
        [0, false],
    ])('deleteRoomGroupPlanPrice — affected %s → %s, 넘긴 조건 + 지워지지 않은 행만(그 그룹 상품 것만) 삭제 표시', async (affected, expected) => {
        const {repository, price} = makeRepository();
        price.update.mockResolvedValueOnce({affected});

        await expect(repository.deleteRoomGroupPlanPrice({room_group_plan_price_id: 'pp1', room_group_plan_id: 'gp1'})).resolves.toBe(expected);
        const [where, deleted] = price.update.mock.calls[0] as [unknown, object];
        expect(where).toEqual({room_group_plan_price_id: 'pp1', room_group_plan_id: 'gp1', is_deleted: 0});
        expect(deleted).toBeInstanceOf(RoomGroupPlanPriceEntity);
        expect({...deleted}).toEqual({is_deleted: 1});
        expect(price.delete).not.toHaveBeenCalled();
    });

    it.each([
        ['findRoomPlan', 'roomPlan', 'findOne'],
        ['updateRoomPlan', 'roomPlan', 'update'],
        ['countRoomGroups', 'group', 'count'],
        ['findRoomGroup', 'group', 'findOne'],
        ['insertRoomGroup', 'group', 'insert'],
        ['updateRoomGroup', 'group', 'update'],
        ['deleteRoomGroup', 'group', 'update'],
        ['insertRoomGroupPlans', 'groupPlan', 'insert'],
        ['findRoomGroupPlan', 'groupPlan', 'findOne'],
        ['updateRoomGroupPlan', 'groupPlan', 'update'],
        ['findRoomGroupImage', 'image', 'findOne'],
        ['insertRoomGroupImage', 'image', 'insert'],
        ['updateRoomGroupImage', 'image', 'update'],
        ['deleteRoomGroupImage', 'image', 'update'],
        ['deleteRoomGroupImages', 'image', 'update'],
        ['countRoomGroupPlanPrices', 'price', 'count'],
        ['findRoomGroupPlanPrice', 'price', 'findOne'],
        ['insertRoomGroupPlanPrice', 'price', 'insert'],
        ['updateRoomGroupPlanPrice', 'price', 'update'],
        ['deleteRoomGroupPlanPrice', 'price', 'update'],
        ['countRooms', 'room', 'count'],
        ['findRoom', 'room', 'findOne'],
        ['insertRoom', 'room', 'insert'],
        ['updateRoom', 'room', 'update'],
        ['deleteRoom', 'room', 'update'],
        ['deleteRooms', 'room', 'update'],
    ] as const)('%s 실패는 통일 500', async (method, repo, fn) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(new Error('db'));

        await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, {})).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findManagerStore', 'buildManagerStoreQuery', ['u1', true]],
        ['findRoomPlanRows', 'buildRoomPlanRowsQuery', ['s1']],
        ['findRoomGroupRows', 'buildRoomGroupRowsQuery', [{store_id: 's1'}, 20, 0]],
        ['findRoomGroupPlanRows', 'buildRoomGroupPlanRowsQuery', ['g1']],
        ['findRoomGroupImages', 'buildRoomGroupImagesQuery', ['g1']],
        ['findRoomGroupPlanPriceList', 'buildRoomGroupPlanPriceListQuery', [{room_group_plan_id: 'gp1'}, 20, 0]],
        ['findRoomRows', 'buildRoomRowsQuery', [{store_id: 's1', floor: null, room_group_id: null}, 20, 0]],
    ] as const)('%s 는 같은 인자로 %s 를 실행하고, 실패는 통일 500', async (method, builder, args) => {
        const {repository} = makeRepository();
        const failing = {getOne: vi.fn().mockRejectedValue(new Error('db')), getMany: vi.fn().mockRejectedValue(new Error('db')), getRawMany: vi.fn().mockRejectedValue(new Error('db'))};
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue(failing);

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(...args);
    });
});

describe('[SMOKE:data-access] 소속 업체 · 상품 설정 · 그룹 목록 · 그룹 상품 · 그룹 사진 · 기간 가격(목록 · 겹침) · 호실 목록 — DB 연결 없이 SQL 빌드, 지워지지 않은 행만', () => {
    let dataSource: DataSource;
    let repository: RoomRepository;

    /** 매니저의 소속 업체(잠금 절 제외) — 형제 store buildStoreByManagerQuery 와 같은 문자열이어야 한다(STORE_SELECT + t_user 조인 + 조건) */
    const MANAGER_STORE_SQL =
        'SELECT "s"."store_id" AS "s_store_id", "s"."store_code" AS "s_store_code", "s"."store_name" AS "s_store_name", "s"."business_number" AS "s_business_number", "s"."owner_name" AS "s_owner_name", "s"."phone" AS "s_phone", "s"."address" AS "s_address", "s"."address_detail" AS "s_address_detail", "s"."latitude" AS "s_latitude", "s"."longitude" AS "s_longitude", "s"."introduction" AS "s_introduction", "s"."is_always_open" AS "s_is_always_open", "s"."is_open" AS "s_is_open", "s"."maintenance_minutes" AS "s_maintenance_minutes", "s"."booking_open_hours" AS "s_booking_open_hours", "s"."refund_deadline_hours" AS "s_refund_deadline_hours", "s"."suspend_comment" AS "s_suspend_comment", "s"."is_deleted" AS "s_is_deleted", "s"."delete_backup" AS "s_delete_backup", "s"."created_at" AS "s_created_at", "s"."updated_at" AS "s_updated_at", "s"."store_state_id" AS "s_store_state_id" FROM "t_store" "s" INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id" WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3 AND "s"."is_deleted" = 0';
    /** 업체 상품 설정 행 */
    const ROOM_PLAN_ROWS_SQL =
        'SELECT "p"."room_plan_id" AS "room_plan_id", "p"."store_id" AS "store_id", "p"."room_plan_type_id" AS "room_plan_type_id", "p"."is_used" AS "is_used", "p"."days_of_week" AS "days_of_week", "p"."usage_hours" AS "usage_hours", "p"."check_in_time" AS "check_in_time", "p"."check_out_time" AS "check_out_time", "t"."room_plan_type_name" AS "room_plan_type_name" FROM "t_room_plan" "p" INNER JOIN "t_room_plan_type" "t" ON "t"."room_plan_type_id" = "p"."room_plan_type_id" WHERE "p"."store_id" = $1';
    /** 객실 그룹 목록 — 검색어 없음 */
    const ROOM_GROUP_ROWS_SQL =
        'SELECT "g"."room_group_id" AS "room_group_id", "g"."room_group_name" AS "room_group_name", "g"."created_at" AS "created_at", (SELECT CAST(COUNT(*) AS integer) FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0) AS "room_count", (SELECT "i"."file_key" FROM "t_room_group_image" "i" WHERE "i"."room_group_id" = "g"."room_group_id" AND "i"."is_deleted" = 0 ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC LIMIT 1) AS "cover_file_key" FROM "t_room_group" "g" WHERE (("g"."store_id" = $1) AND ("g"."is_deleted" = $2)) ORDER BY "g"."created_at" DESC LIMIT 10 OFFSET 20';
    /** 객실 그룹 목록 — 검색어 */
    const ROOM_GROUP_ROWS_KEYWORD_SQL =
        'SELECT "g"."room_group_id" AS "room_group_id", "g"."room_group_name" AS "room_group_name", "g"."created_at" AS "created_at", (SELECT CAST(COUNT(*) AS integer) FROM "t_room" "r" WHERE "r"."room_group_id" = "g"."room_group_id" AND "r"."is_deleted" = 0) AS "room_count", (SELECT "i"."file_key" FROM "t_room_group_image" "i" WHERE "i"."room_group_id" = "g"."room_group_id" AND "i"."is_deleted" = 0 ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC LIMIT 1) AS "cover_file_key" FROM "t_room_group" "g" WHERE (("g"."store_id" = $1) AND ("g"."room_group_name" ILIKE $2) AND ("g"."is_deleted" = $3)) ORDER BY "g"."created_at" DESC LIMIT 20 OFFSET 0';
    /** 그룹 상품 행 */
    const ROOM_GROUP_PLAN_ROWS_SQL =
        'SELECT "gp"."room_group_plan_id" AS "room_group_plan_id", "gp"."room_group_id" AS "room_group_id", "gp"."room_plan_type_id" AS "room_plan_type_id", "gp"."is_used" AS "is_used", "gp"."price" AS "price", "t"."room_plan_type_name" AS "room_plan_type_name" FROM "t_room_group_plan" "gp" INNER JOIN "t_room_plan_type" "t" ON "t"."room_plan_type_id" = "gp"."room_plan_type_id" WHERE "gp"."room_group_id" = $1';
    /** 그룹 사진 */
    const ROOM_GROUP_IMAGES_SQL =
        'SELECT "i"."room_group_image_id" AS "i_room_group_image_id", "i"."file_key" AS "i_file_key", "i"."file_name" AS "i_file_name", "i"."content_type" AS "i_content_type", "i"."sort_order" AS "i_sort_order", "i"."is_deleted" AS "i_is_deleted", "i"."created_at" AS "i_created_at", "i"."updated_at" AS "i_updated_at", "i"."room_group_id" AS "i_room_group_id" FROM "t_room_group_image" "i" WHERE (("i"."room_group_id" = $1) AND ("i"."is_deleted" = $2)) ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC';
    /** 기간 가격 목록 */
    const PLAN_PRICE_LIST_SQL =
        'SELECT "pp"."room_group_plan_price_id" AS "pp_room_group_plan_price_id", "pp"."start_date" AS "pp_start_date", "pp"."end_date" AS "pp_end_date", "pp"."price" AS "pp_price", "pp"."memo" AS "pp_memo", "pp"."is_deleted" AS "pp_is_deleted", "pp"."created_at" AS "pp_created_at", "pp"."updated_at" AS "pp_updated_at", "pp"."room_group_plan_id" AS "pp_room_group_plan_id" FROM "t_room_group_plan_price" "pp" WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."is_deleted" = $2)) ORDER BY "pp"."start_date" ASC LIMIT 20 OFFSET 0';
    /** 기간 가격 겹침 (등록) */
    const PLAN_PRICE_OVERLAP_SQL =
        'SELECT "pp"."room_group_plan_price_id" AS "pp_room_group_plan_price_id", "pp"."start_date" AS "pp_start_date", "pp"."end_date" AS "pp_end_date", "pp"."price" AS "pp_price", "pp"."memo" AS "pp_memo", "pp"."is_deleted" AS "pp_is_deleted", "pp"."created_at" AS "pp_created_at", "pp"."updated_at" AS "pp_updated_at", "pp"."room_group_plan_id" AS "pp_room_group_plan_id" FROM "t_room_group_plan_price" "pp" WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."is_deleted" = $4)) ORDER BY "pp"."start_date" ASC LIMIT 1 OFFSET 0';
    /** 기간 가격 겹침 (수정 — 자기 자신 제외) */
    const PLAN_PRICE_OVERLAP_EXCLUDE_SQL =
        'SELECT "pp"."room_group_plan_price_id" AS "pp_room_group_plan_price_id", "pp"."start_date" AS "pp_start_date", "pp"."end_date" AS "pp_end_date", "pp"."price" AS "pp_price", "pp"."memo" AS "pp_memo", "pp"."is_deleted" AS "pp_is_deleted", "pp"."created_at" AS "pp_created_at", "pp"."updated_at" AS "pp_updated_at", "pp"."room_group_plan_id" AS "pp_room_group_plan_id" FROM "t_room_group_plan_price" "pp" WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."room_group_plan_price_id" != $4) AND ("pp"."is_deleted" = $5)) ORDER BY "pp"."start_date" ASC LIMIT 1 OFFSET 0';
    /** 호실 목록 — 필터 없음 */
    const ROOM_ROWS_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_group_id" AS "room_group_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."created_at" AS "created_at", "g"."room_group_name" AS "room_group_name", "st"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "st" ON "st"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 10 OFFSET 20';
    /** 호실 목록 — 층 + 그룹 필터 */
    const ROOM_ROWS_FILTER_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_group_id" AS "room_group_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."created_at" AS "created_at", "g"."room_group_name" AS "room_group_name", "st"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "st" ON "st"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 AND "r"."floor" = $2 AND "r"."room_group_id" = $3 ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 20 OFFSET 0';
    /** 호실 목록 — 0층 필터(0 도 필터다) */
    const ROOM_ROWS_FLOOR_ZERO_SQL =
        'SELECT "r"."room_id" AS "room_id", "r"."room_group_id" AS "room_group_id", "r"."room_name" AS "room_name", "r"."floor" AS "floor", "r"."room_state_id" AS "room_state_id", "r"."created_at" AS "created_at", "g"."room_group_name" AS "room_group_name", "st"."room_state_name" AS "room_state_name" FROM "t_room" "r" INNER JOIN "t_room_group" "g" ON "g"."room_group_id" = "r"."room_group_id" INNER JOIN "t_room_state" "st" ON "st"."room_state_id" = "r"."room_state_id" WHERE "r"."store_id" = $1 AND "r"."is_deleted" = 0 AND "g"."is_deleted" = 0 AND "r"."floor" = $2 ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 20 OFFSET 0';

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new RoomRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it.each([
        [false, ''],
        [true, ' FOR UPDATE OF s'],
    ])('매니저의 소속 업체 (잠금 %s) — t_user 매니저 그룹 조인 · 탈퇴 · 지운 업체 제외, 잠금이면 업체 행만', (lock, lockClause) => {
        const [sql, parameters] = repository.buildManagerStoreQuery('u1', lock).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['u1', 'MANAGER', 'LEAVE']);
        expect(flat).toContain('FROM "t_store" "s" INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id"');
        expect(flat).toContain('"u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3 AND "s"."is_deleted" = 0');
        expect(flat.includes('FOR UPDATE')).toBe(lock);
        expect(flat.endsWith(' FOR UPDATE OF s')).toBe(lock);
        expect(flat).toBe(`${MANAGER_STORE_SQL}${lockClause}`);
    });

    it('업체 상품 설정 — 종류명 조인 · 그 업체 행만(삭제 표시 없는 테이블), select 별칭 = RoomPlanRow 키', () => {
        const [sql, parameters] = repository.buildRoomPlanRowsQuery('s1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('FROM "t_room_plan" "p"');
        expect(flat).toContain('INNER JOIN "t_room_plan_type" "t"');
        expect(flat).toContain('"p"."store_id" = $1');
        expect(flat).not.toContain('is_deleted');
        expect([...selectAliases(flat)].sort()).toEqual([...ROOM_PLAN_ROW_KEYS].sort());
        expect(flat).toBe(ROOM_PLAN_ROWS_SQL);
    });

    it('객실 그룹 목록 — 지워지지 않은 그룹, 호실 수는 지워지지 않은 호실만 · 대표 사진은 지워지지 않은 사진 중 첫 순서, 등록일 최신순 · 페이지', () => {
        const [sql, parameters] = repository.buildRoomGroupRowsQuery({store_id: 's1'}, 10, 20).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expect.arrayContaining(['s1']));
        expect(flat).toContain('FROM "t_room_group" "g"');
        expect(flat).toMatch(/"g"\."store_id" = \$\d+/);
        expect(flat).toMatch(/"g"\."is_deleted" = (0|\$\d+)/);
        expect(flat).toContain('"t_room" "r"');
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toContain('"t_room_group_image" "i"');
        expect(flat).toContain('"i"."is_deleted" = 0');
        expect(flat).toContain('ORDER BY "g"."created_at" DESC');
        expect(flat).toContain('LIMIT 10 OFFSET 20');
        expect(selectAliases(flat)).toEqual(expect.arrayContaining(ROOM_GROUP_ROW_KEYS));
        expect(flat).toBe(ROOM_GROUP_ROWS_SQL);
    });

    it('객실 그룹 목록 — 검색어는 그룹명 ILIKE(이스케이프한 패턴 그대로)', () => {
        const [sql, parameters] = repository.buildRoomGroupRowsQuery({store_id: 's1', room_group_name: ILike('%a\\_b%')}, 20, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expect.arrayContaining(['s1', '%a\\_b%']));
        expect(flat).toMatch(/"g"\."room_group_name" ILIKE \$\d+/);
        expect(flat).toMatch(/"g"\."is_deleted" = (0|\$\d+)/);
        expect(flat).toContain('LIMIT 20 OFFSET 0');
        expect(flat).toBe(ROOM_GROUP_ROWS_KEYWORD_SQL);
    });

    it('그룹 상품 — 종류명 조인 · 그 그룹 행만(삭제 표시 없는 테이블), select 별칭 = RoomGroupPlanRow 키', () => {
        const [sql, parameters] = repository.buildRoomGroupPlanRowsQuery('g1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['g1']);
        expect(flat).toContain('FROM "t_room_group_plan" "gp"');
        expect(flat).toContain('INNER JOIN "t_room_plan_type" "t"');
        expect(flat).toContain('"gp"."room_group_id" = $1');
        expect(flat).not.toContain('is_deleted');
        expect([...selectAliases(flat)].sort()).toEqual([...ROOM_GROUP_PLAN_ROW_KEYS].sort());
        expect(flat).toBe(ROOM_GROUP_PLAN_ROWS_SQL);
    });

    it('그룹 사진 — 그 그룹 · 지워지지 않은 사진, 정렬 순서 · 등록일 순', () => {
        const [sql, parameters] = repository.buildRoomGroupImagesQuery('g1').getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['g1', 0]);
        expect(flat).toContain('FROM "t_room_group_image" "i"');
        expect(flat).toContain('WHERE (("i"."room_group_id" = $1) AND ("i"."is_deleted" = $2))');
        expect(flat).toContain('ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC');
        expect(flat).toBe(ROOM_GROUP_IMAGES_SQL);
    });

    it('기간 가격 목록 — 그 그룹 상품 · 지워지지 않은 것, 시작 날짜 순 · 페이지', () => {
        const [sql, parameters] = repository.buildRoomGroupPlanPriceListQuery({room_group_plan_id: 'gp1'}, 20, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['gp1', 0]);
        expect(flat).toContain('FROM "t_room_group_plan_price" "pp"');
        expect(flat).toContain('WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."is_deleted" = $2))');
        expect(flat).toContain('ORDER BY "pp"."start_date" ASC LIMIT 20 OFFSET 0');
        expect(flat).toBe(PLAN_PRICE_LIST_SQL);
    });

    it('기간 가격 겹침 (등록) — 지워지지 않은 다른 기간의 시작 ≤ 새 종료 그리고 종료 ≥ 새 시작(양 끝 포함)', () => {
        const [sql, parameters] = repository.buildRoomGroupPlanPriceListQuery(buildPlanPriceOverlapWhere('gp1', '2026-07-01', '2026-08-31', null), 1, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['gp1', '2026-08-31', '2026-07-01', 0]);
        expect(flat).toContain('WHERE (("pp"."room_group_plan_id" = $1) AND ("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."is_deleted" = $4))');
        expect(flat).not.toContain('"pp"."room_group_plan_price_id" !=');
        expect(flat).toBe(PLAN_PRICE_OVERLAP_SQL);
    });

    it('기간 가격 겹침 (수정) — 자기 자신(Not)은 빼고 센다', () => {
        const [sql, parameters] = repository.buildRoomGroupPlanPriceListQuery(buildPlanPriceOverlapWhere('gp1', '2026-07-01', '2026-08-31', 'pp1'), 1, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['gp1', '2026-08-31', '2026-07-01', 'pp1', 0]);
        expect(flat).toContain('("pp"."start_date" <= $2) AND ("pp"."end_date" >= $3) AND ("pp"."room_group_plan_price_id" != $4) AND ("pp"."is_deleted" = $5)');
        expect(flat).toBe(PLAN_PRICE_OVERLAP_EXCLUDE_SQL);
    });

    it('호실 목록 (필터 없음) — 지워지지 않은 그룹 · 상태 조인, 그 업체 · 지워지지 않은 호실, 층 · 호실명 순 · 페이지, select 별칭 = RoomRow 키', () => {
        const [sql, parameters] = repository.buildRoomRowsQuery({store_id: 's1', floor: null, room_group_id: null}, 10, 20).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(['s1']);
        expect(flat).toContain('FROM "t_room" "r"');
        expect(flat).toContain('INNER JOIN "t_room_group" "g"');
        expect(flat).toContain('INNER JOIN "t_room_state" "st"');
        expect(flat).toContain('"g"."is_deleted" = 0');
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toContain('"r"."store_id" = $1');
        expect(flat).not.toMatch(/"r"\."floor" = \$\d/);
        expect(flat).not.toMatch(/"r"\."room_group_id" = \$\d/);
        expect(flat).toContain('ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 10 OFFSET 20');
        expect([...selectAliases(flat)].sort()).toEqual([...ROOM_ROW_KEYS].sort());
        expect(flat).toBe(ROOM_ROWS_SQL);
    });

    it.each([
        ['층 -1 + 그룹', {store_id: 's1', floor: -1, room_group_id: 'g1'}, ['s1', -1, 'g1'], ['"r"."floor" = $2', '"r"."room_group_id" = $3'], ROOM_ROWS_FILTER_SQL],
        ['0층(0 도 필터다)', {store_id: 's1', floor: 0, room_group_id: null}, ['s1', 0], ['"r"."floor" = $2'], ROOM_ROWS_FLOOR_ZERO_SQL],
    ] as const)('호실 목록 (%s) — 넘긴 필터만 조건에 더한다', (_label, filter, expectedParameters, fragments, expectedSql) => {
        const [sql, parameters] = repository.buildRoomRowsQuery(filter, 20, 0).getQueryAndParameters();
        const flat = sql.replace(/\s+/g, ' ');

        expect(parameters).toEqual(expectedParameters);
        for (const fragment of fragments) {
            expect(flat).toContain(fragment);
        }
        expect(flat).toContain('"r"."is_deleted" = 0');
        expect(flat).toBe(expectedSql);
    });
});
```

### Test Cases 요약

service 기능 spec 21개(194건) + repository spec 1개(68건 — 오류 · 조건 · 소프트 삭제 · 500 55 + Smoke 13) = 262건. Smoke 의 전체 SQL 상수 12개는 build 때 실제 빌드 결과로 채웠다. 전체 회귀 실행은 `/beaver:test`.

```
[CASES:canChangeRoomState] (사용자 결정 2026-10-31 전환 표, 13개) — room-state.spec.ts 에서 큐 경로로(it.each, util 단위 spec 없음). findRoom 이 from 상태 호실을 돌려준다. 허용 → done null + updateRoom({room_id}, RoomEntity room_state_id = to), 거부 → failed 400 {message: '지금 상태에서는 바꿀 수 없습니다.', validation_errors: null} + updateRoom 미호출
  1   MAINTENANCE → AVAILABLE                      → 허용 (정비 완료)
  2   AVAILABLE   → DISABLED                       → 허용 (사용중지)
  3   MAINTENANCE → DISABLED                       → 허용
  4   DISABLED    → AVAILABLE                      → 허용 (사용 재개)
  5   AVAILABLE   → AVAILABLE                      → 거부 (같은 상태)
  6   DISABLED    → DISABLED                       → 거부 (같은 상태)
  7   RESERVED    → AVAILABLE                      → 거부 (예약완료에서 — Phase 17)
  8   RESERVED    → DISABLED                       → 거부
  9   IN_USE      → AVAILABLE                      → 거부 (사용중에서 — Phase 19)
  10  IN_USE      → DISABLED                       → 거부
  11  UNKNOWN     → AVAILABLE                      → 거부 (표에 없는 상태 행)
  12  AVAILABLE   → MAINTENANCE                    → 거부 — validateBody(RoomStateDto) 400 validation_errors.room_state_id '바꿀 수 있는 호실 상태가 아닙니다.' + 지나쳐 와도 service 400
  13  AVAILABLE   → RESERVED                       → 거부 — 같은 DTO 400 + service 400

[SUCCESS]  room-plan-list.spec.ts (동기) — findManagerStore(user_id, false) 1회 → findRoomPlanRows(STORE_ID) → 200 {list}: LONG · HOURLY · NIGHT 행을 HOURLY · NIGHT · LONG 순으로, 'HH:mm:ss' → 'HH:mm', 시간 이용 시각 null · 1박 · 연박 usage_hours null
[SUCCESS]  room-plan-update.spec.ts — HOURLY {is_used 1, days_of_week 62, usage_hours 4, 시각 보냄} → findManagerStore(user_id, true) · findRoomPlan({store_id, room_plan_type_id: 'HOURLY'}) → updateRoomPlan({room_plan_id}, RoomPlanEntity {usage_hours 4, check_in_time null, check_out_time null}, store_id undefined), ack · 'admin.room.plan-update.done'
[SUCCESS]  room-plan-update — it.each NIGHT · LONG {usage_hours 5 보냄, 15:00 · 11:00} → {usage_hours null, check_in_time '15:00', check_out_time '11:00'}
[SUCCESS]  room-group-list.spec.ts (동기) — countRoomGroups({store_id}) → findRoomGroupRows({store_id}, 20, 0)(개수가 먼저) → list: 대표 사진 키 → getPublicUrl 1회 CDN 주소, 키 없음 → image_url null, room_count · created_at ISO, pagination {total_count 2, page 1, max_page 1}
[SUCCESS]  room-group-list — keyword=a_b&page=2&size=10, 30건 → where {store_id, room_group_name: ILike('%a\\_b%')} 로 count · rows(where, 10, 10), pagination {page 2, max_page 3}
[SUCCESS]  room-group-detail.spec.ts (동기) — findRoomGroup({room_group_id, store_id}) · findRoomGroupImages(ROOM_GROUP_ID) · findRoomGroupPlanRows(ROOM_GROUP_ID) → 본문 전체(description · room_group_detail 4항목 · images 순서대로 getPublicUrl 2회 · plans HOURLY · NIGHT · LONG 순 · created_at · updated_at), createDownloadUrl 미호출 / 사진 없음 → images []
[SUCCESS]  room-group-create.spec.ts — {room_group_name, description, room_group_detail: {has_tv: 0, unknown: 1}} → insertRoomGroup(RoomGroupEntity id 32자 · store_id · is_deleted 0 · room_group_detail {room_count 1, has_shower 1, has_tv 0, has_pc 1}) → insertRoomGroupPlans(RoomGroupPlanEntity 3개 — 서로 다른 id · HOURLY · NIGHT · LONG · is_used 0 · price 0), 그룹이 먼저, done {room_group_id}
[SUCCESS]  room-group-create — 설명 · 상세정보 없음 → description null · 기본값 전부 / description '' → null · {room_count 2, has_pc null} → {room_count 2, has_shower 1, has_tv 1, has_pc 1}
[SUCCESS]  room-group-update.spec.ts — findRoomGroup({room_group_id, store_id}) → updateRoomGroup({room_group_id}, RoomGroupEntity {room_group_name, description, room_group_detail {room_count 2, has_shower 1, has_tv 1, has_pc 0}}) — 지금 값({3, 0, 0, 0})과 합치지 않고 기본값으로 채운다, store_id · is_deleted undefined / 상세정보 없음 → room_group_detail undefined(그대로) · description null
[SUCCESS]  room-group-delete.spec.ts — findRoomGroupImages → deleteRooms({room_group_id}) → deleteRoomGroupImages({room_group_id}) → deleteRoomGroup({room_group_id}) 각 1회 → storage.remove(IMAGE_KEY) · remove(KEY_B)(마지막, invocationCallOrder 오름차순) / 사진 없음 → 행만 지우고 remove 미호출
[SUCCESS]  room-group-image-upload-url.spec.ts (동기) — 사진 4장 → findRoomGroupImages(ROOM_GROUP_ID) → createUploadUrl({key: /^store\/<STORE_ID>\/room-group\/<ROOM_GROUP_ID>\/[a-f0-9]{32}\.png$/, content_type 'image/png'}) → 200 {file_key(같은 키), upload_url, expires_at ISO} / JPG 두 번 → .jpg 키 서로 다름
[SUCCESS]  room-group-image.spec.ts — 사진 순서 [0, 2] → exists(NEW_KEY) → insertRoomGroupImage(RoomGroupImageEntity id 32자 · room_group_id · file_key · file_name · content_type · sort_order 3 · is_deleted 0), done {room_group_image_id} / 사진 없음 → sort_order 0
[SUCCESS]  room-group-image-order.spec.ts — A(0) · B(1) · C(2) → [C, A, B] → updateRoomGroupImage 3회 ({room_group_image_id: C}, 0) · (A, 1) · (B, 2), RoomGroupImageEntity
[SUCCESS]  room-group-image-delete.spec.ts — findRoomGroupImage({room_group_image_id, room_group_id}) → deleteRoomGroupImage({room_group_image_id}) → storage.remove(IMAGE_KEY)(행 삭제가 먼저), updateRoomGroupImage 미호출
[SUCCESS]  room-group-plan-update.spec.ts — findRoomGroupPlan({room_group_id, room_plan_type_id: 'NIGHT'}) → updateRoomGroupPlan({room_group_plan_id}, RoomGroupPlanEntity {is_used 1, price 89000}, room_group_id · room_plan_type_id undefined) / is_used 0 + price 0 → 된다
[SUCCESS]  room-group-plan-price-list.spec.ts (동기) — findRoomGroupPlan → countRoomGroupPlanPrices({room_group_plan_id}) → findRoomGroupPlanPriceList({room_group_plan_id}, 20, 0) → list [{id, start_date '2026-07-01', end_date '2026-08-31', price, memo}, {…, memo null}], pagination {total_count 2}
[SUCCESS]  room-group-plan-price.spec.ts — countRoomGroupPlanPrices({room_group_plan_id, start_date: LessThanOrEqual('2026-08-31'), end_date: MoreThanOrEqual('2026-07-01')}) → insertRoomGroupPlanPrice(RoomGroupPlanPriceEntity id 32자 · 날짜 문자열 · price · memo · is_deleted 0), 개수가 먼저, done {room_group_plan_price_id}
[SUCCESS]  room-group-plan-price — it.each 메모 없음 · 빈 메모 + 하루짜리(시작 = 종료) → 겹침 조건 같은 날짜, memo null
[SUCCESS]  room-group-plan-price-update.spec.ts — findRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id}) → countRoomGroupPlanPrices({…, room_group_plan_price_id: Not(ROOM_GROUP_PLAN_PRICE_ID)}) → updateRoomGroupPlanPrice({room_group_plan_price_id}, RoomGroupPlanPriceEntity 4필드, room_group_plan_id · is_deleted undefined) / 메모 없음 → memo null
[SUCCESS]  room-group-plan-price-delete.spec.ts — deleteRoomGroupPlanPrice({room_group_plan_price_id, room_group_plan_id}) true → done null, updateRoomGroupPlanPrice 미호출
[SUCCESS]  room-list.spec.ts (동기) — countRooms({store_id}) → findRoomRows({store_id, floor: null, room_group_id: null}, 20, 0) → list(그룹명 · 상태명 · created_at ISO) / ?floor=-1&room_group_id=G → countRooms({store_id, floor: -1, room_group_id}) · findRoomRows({store_id, floor: -1, room_group_id}, 20, 0)
[SUCCESS]  room-create.spec.ts — findRoomGroup({room_group_id, store_id}) → insertRoom(RoomEntity id 32자 · store_id STORE_ID · room_group_id · room_state_id 'AVAILABLE' · room_name · floor · is_deleted 0), done {room_id} / 지하층 -1
[SUCCESS]  room-update.spec.ts — findRoom({room_id, store_id}) · findRoomGroup({room_group_id: 다른 그룹, store_id}) → updateRoom({room_id}, RoomEntity {room_group_id, room_name, floor}, room_state_id · store_id undefined)
[SUCCESS]  room-delete.spec.ts — findRoom({room_id, store_id}) → deleteRoom({room_id}), updateRoom 미호출
[SUCCESS]  room-state.spec.ts — MAINTENANCE 호실 → AVAILABLE: updateRoom({room_id}, RoomEntity room_state_id 'AVAILABLE' 만 — room_name · floor · room_group_id undefined)
[SUCCESS]  모든 쓰기(큐 15) findManagerStore(user_id, true) · 조회 · 업로드 주소(동기 6) false, 큐 성공은 ack + '<type>.done'

[FAIL:validation]  room-plan-update — validateBody(RoomPlanUpdateDto): days_of_week 0 · 128 → '예약 가능 요일은 1 ~ 127 사이로 입력해주세요.' / usage_hours 25 → '이용 시간은 1 ~ 24시간 사이로 입력해주세요.' / check_in_time '24:00' → '입실 시각을 HH:mm 으로 입력해주세요.' / is_used 2 → '사용 여부가 올바르지 않습니다.' / {is_used, days_of_week} 만 → null / RoomPlanUpdateParamDto 'WEEKLY' → '상품 종류가 올바르지 않습니다.'
[FAIL:validation]  room-group-list — keyword 101자 → 400 validation_errors.keyword '검색어는 100자 이내로 입력해주세요.', findManagerStore 미호출
[FAIL:validation]  room-group-detail · room-group-image-upload-url — 경로 room_group_id 'xyz' → 400 '객실 그룹 ID가 올바르지 않습니다.', findManagerStore 미호출 / content_type 'image/gif' → 400 'JPG · PNG 사진만 올릴 수 있습니다.'
[FAIL:validation]  room-group-create — validateBody(RoomGroupDto): 그룹명 101자 · 설명 2,001자 · room_group_detail.room_count 21 · 0(점 경로) · room_group_detail.has_tv 2 / 선언 안 된 상세 항목 {has_tv 0, unknown 1} → null(whitelist 꺼짐 — service 가 버린다)
[FAIL:validation]  room-group-update — room_group_detail.has_shower 3 → '샤워실 유무가 올바르지 않습니다.' / RoomGroupUpdateParamDto 'xyz' · room-group-delete RoomGroupDeleteParamDto 'xyz' → room_group_id
[FAIL:validation]  room-group-image — content_type 'image/gif' · file_name 256자 → '파일명은 255자 이내로 입력해주세요.' / room-group-image-order — 6장 → '객실 그룹 사진은 5장까지입니다.' · 항목 'xyz' → '사진 ID가 올바르지 않습니다.'(room_group_image_ids) / room-group-image-delete — room_group_image_id 'xyz'
[FAIL:validation]  room-group-plan-update — price 10,000,001 · -1 → '요금은 0 ~ 10,000,000원 사이로 입력해주세요.' · is_used 2 · 종류 경로 'WEEKLY' / room-group-plan-price-list — 경로 'WEEKLY' → 400, findManagerStore 미호출
[FAIL:validation]  room-group-plan-price — start_date '2026/07/01' → '시작 날짜를 YYYY-MM-DD 로 입력해주세요.' · end_date '2026-8-31' → '종료 날짜를 YYYY-MM-DD 로 입력해주세요.' · price 0 → '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.' · memo 31자 → '메모는 30자 이내로 입력해주세요.' / memo 30자 · price 10,000,000 → null
[FAIL:validation]  room-group-plan-price-update — price 10,000,001 · room_group_plan_price_id 'xyz' → '기간 가격 ID가 올바르지 않습니다.' / room-group-plan-price-delete — 같은 param
[FAIL:validation]  room-list — floor 'B1' → 400 '층을 정수로 입력해주세요.' · room_group_id 'xyz' → 400, findManagerStore 미호출
[FAIL:validation]  room-create — room_name 51자 → '호실명은 50자 이내로 입력해주세요.' · floor 201 · -11 → '층은 -10 ~ 200 사이로 입력해주세요.' · room_group_id 'xyz' / room-update — floor 201 · room_id 'xyz' → '호실 ID가 올바르지 않습니다.' / room-delete — room_id 'xyz'
[FAIL:validation]  room-state — RoomStateDto AVAILABLE · DISABLED → null (MAINTENANCE · RESERVED 는 [CASES] 12 · 13)

[FAIL:service]  모든 spec — 소속 업체 없음(탈퇴 · 지운 업체) → 404 '소속 업체를 찾을 수 없습니다.', 다음 조회(그룹 · 호실 · 종류 행 · 목록) · 쓰기 미호출
[FAIL:service]  room-plan-update — it.each(updateRoomPlan 미호출, ack + '.failed'): HOURLY 이용 시간 없음 → validation_errors.usage_hours '시간 이용은 이용 시간을 입력해주세요.' / NIGHT 입실 없음 · NIGHT 이용 시간만 → check_in_time '입실 시각을 입력해주세요.' / LONG 퇴실 없음 → check_out_time '퇴실 시각을 입력해주세요.' / 12:00 = 12:00 → check_out_time '입실과 퇴실 시각이 같을 수 없습니다.' / 종류 행 없음 → 404 '상품 설정을 찾을 수 없습니다.'
[FAIL:service]  room-group-detail · update · delete · image-upload-url · image · image-order · image-delete · plan-update · plan-price-list · plan-price · plan-price-update · plan-price-delete · room-create · room-update — 그룹 없음(다른 업체 · 지운 그룹) → 404 '객실 그룹을 찾을 수 없습니다.', 사진 · 그룹 상품 · 기간 가격 조회와 쓰기 · S3 삭제 미호출
[FAIL:service]  room-group-image-upload-url — 사진 5장 → 400 '올릴 수 있는 사진 수를 넘었습니다.', createUploadUrl 미호출
[FAIL:service]  room-group-image — it.each 다른 업체 키 · 다른 그룹 키 · 업체 사진 키(그룹 경로 없음) · 확장자 불일치 → 400 validation_errors.file_key '업로드 주소로 받은 저장 키가 아닙니다.', exists · insert 미호출 / 5장 → 400 한도, exists · insert 미호출 / exists false → 400 '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.', insert 미호출
[FAIL:service]  room-group-image-order — it.each 빠짐 · 남음 · 겹침 · 다른 그룹 사진 → 400 validation_errors.room_group_image_ids '그룹 사진 전체를 한 번씩 원하는 순서로 보내주세요.', updateRoomGroupImage 미호출
[FAIL:service]  room-group-image-delete — 사진 없음(다른 그룹 · 지운 사진) → 404 '사진을 찾을 수 없습니다.', deleteRoomGroupImage · remove 미호출
[FAIL:service]  room-group-plan-update — is_used 1 + price 0 → 400 validation_errors.price '판매하려면 요금을 1원 이상 입력해주세요.' / 그룹 상품 없음 → 404 '상품 설정을 찾을 수 없습니다.' — updateRoomGroupPlan 미호출
[FAIL:service]  room-group-plan-price · update — it.each '2026-02-30' → start_date '없는 시작 날짜입니다.' / '2026-13-01' → end_date '없는 종료 날짜입니다.' / 종료 < 시작 → end_date '종료 날짜는 시작 날짜보다 빠를 수 없습니다.' — countRoomGroupPlanPrices · insert/update 미호출 / 그룹 상품 없음 → 404 / (update) 기간 가격 없음 → 404 '기간 가격을 찾을 수 없습니다.', update 미호출
[FAIL:service]  room-group-plan-price-list — 그룹 상품 없음 → 404, count · list 미호출
[FAIL:service]  room-group-plan-price-delete — deleteRoomGroupPlanPrice false → 404 '기간 가격을 찾을 수 없습니다.' / 그룹 상품 · 그룹 없음 → 404, 삭제 미호출
[FAIL:service]  room-update · room-delete · room-state — 호실 없음(다른 업체 · 지운 호실) → 404 '호실을 찾을 수 없습니다.', updateRoom · deleteRoom 미호출 / room-update 옮길 그룹 없음 → 404
[FAIL:service]  (duplicate) room-group-create · update — repository 400(UK 변환) 그대로 failed 400 validation_errors.room_group_name '이미 있는 그룹명입니다.', create 는 insertRoomGroupPlans 미호출 / room-create · update — validation_errors.room_name '이미 있는 호실명입니다.' / room-group-image — '이미 등록된 사진입니다.'(validation_errors null)
[FAIL:service]  (duplicate) room-group-plan-price · update — 겹침 개수 1 → 400 {message: '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.', validation_errors: null}, insert/update 미호출 / repository EXC 400 → 같은 본문, ack(재시도 없음)
[FAIL:service]  (infra) room-group-delete — storage.remove 503 → requeue, 결과 회신 없음

[FAIL:repository]  room.repository.spec.ts — it.each 400 변환: insertRoomGroup · updateRoomGroup 23505 UK_RoomGroup_StoreIdRoomGroupName → {message '이미 있는 그룹명입니다.', validation_errors [room_group_name]} / insertRoom · updateRoom 23505 UK_Room_StoreIdRoomName → [room_name] / insertRoomGroupImage 23505 UK_RoomGroupImage_FileKey → {message '이미 등록된 사진입니다.'} / insertRoomGroupPlanPrice · updateRoomGroupPlanPrice 23P01 EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange → {message '같은 상품의 다른 기간 가격과 날짜가 겹칩니다.'}
[FAIL:repository]  room.repository — 통일 500: 다른 UK(insertRoomGroup + UK_Room_…) · FK(insertRoom + FK_Room_RoomGroup) · 같은 EXC 이름 + 23505 · 다른 EXC(23P01 + EXC_Other) · insertRoomGroupPlans UK(새 그룹)
[FAIL:repository]  room.repository — 조건: findRoomGroup · countRoomGroups(객체 · 배열 OR 조건마다) · updateRoomGroup · findRoomGroupImage · updateRoomGroupImage · countRoomGroupPlanPrices · findRoomGroupPlanPrice · updateRoomGroupPlanPrice · countRooms · findRoom · updateRoom 에 is_deleted: 0, 단건 조회 loadRelationIds: true / findRoomPlan · updateRoomPlan · findRoomGroupPlan · updateRoomGroupPlan 은 조건 그대로
[FAIL:repository]  room.repository — insert 5종은 받은 엔티티(그룹 상품은 배열 3개)를 같은 참조로 1회
[FAIL:repository]  room.repository — 소프트 삭제 it.each deleteRoomGroup · deleteRoomGroupImage · deleteRoomGroupImages · deleteRoom · deleteRooms → update({...where, is_deleted: 0}, 엔티티 인스턴스 {is_deleted: 1}) 1회, delete 미호출 / deleteRoomGroupPlanPrice affected 1 → true · 0 → false, 같은 조건 · 같은 엔티티, delete 미호출
[FAIL:repository]  room.repository — 통일 500 표 26건(findOne · count · insert · update 실패) + 빌더 실행 7건(findManagerStore · findRoomPlanRows · findRoomGroupRows · findRoomGroupPlanRows · findRoomGroupImages · findRoomGroupPlanPriceList · findRoomRows — 같은 인자로 build… 1회 호출, getOne · getMany · getRawMany 실패 → 500)

[SMOKE:data-access]  buildManagerStoreQuery('u1', false · true) — 파라미터 ['u1', 'MANAGER', 'LEAVE'], FROM "t_store" "s" INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id", 탈퇴 제외 · "s"."is_deleted" = 0, 잠금이면 끝이 ' FOR UPDATE OF s'(아니면 FOR UPDATE 없음) — 형제 store 와 같은 SQL
[SMOKE:data-access]  buildRoomPlanRowsQuery('s1') — ['s1'], t_room_plan p + t_room_plan_type t 조인, "p"."store_id" = $1, is_deleted 없음, 별칭 = RoomPlanRow 키
[SMOKE:data-access]  buildRoomGroupRowsQuery — {store_id}, 10, 20: 파라미터에 's1', "g"."is_deleted" 조건 · "r"."is_deleted" = 0(호실 수) · "i"."is_deleted" = 0(대표 사진), ORDER BY "g"."created_at" DESC, LIMIT 10 OFFSET 20, 별칭 ⊇ RoomGroupRow 키 / 검색어 ILike('%a\\_b%') → "g"."room_group_name" ILIKE $n, 파라미터에 패턴 그대로
[SMOKE:data-access]  buildRoomGroupPlanRowsQuery('g1') — ['g1'], t_room_group_plan gp + t_room_plan_type t, "gp"."room_group_id" = $1, is_deleted 없음, 별칭 = RoomGroupPlanRow 키
[SMOKE:data-access]  buildRoomGroupImagesQuery('g1') — ['g1', 0], WHERE (("i"."room_group_id" = $1) AND ("i"."is_deleted" = $2)), ORDER BY "i"."sort_order" ASC, "i"."created_at" ASC
[SMOKE:data-access]  buildRoomGroupPlanPriceListQuery — 목록 {room_group_plan_id: 'gp1'}, 20, 0 → ['gp1', 0], ORDER BY "pp"."start_date" ASC LIMIT 20 OFFSET 0 / 겹침 buildPlanPriceOverlapWhere('gp1', '2026-07-01', '2026-08-31', null) → ['gp1', '2026-08-31', '2026-07-01', 0], "pp"."start_date" <= $2 AND "pp"."end_date" >= $3 / 수정 겹침('pp1') → ['gp1', '2026-08-31', '2026-07-01', 'pp1', 0], "pp"."room_group_plan_price_id" != $4
[SMOKE:data-access]  buildRoomRowsQuery — 필터 없음(10, 20) → ['s1'], t_room r + t_room_group g(지워지지 않은 그룹) + t_room_state st 조인, "r"."is_deleted" = 0, floor · room_group_id 조건 없음, ORDER BY "r"."floor" ASC, "r"."room_name" ASC LIMIT 10 OFFSET 20, 별칭 = RoomRow 키 / it.each 층 -1 + 그룹 → ['s1', -1, 'g1'] · 0층 → ['s1', 0](0 도 필터)

[SECURITY]  큐 15개 spec — actor 없는 명령 → failed 401(requireActor), findManagerStore 미호출
[SECURITY]  동기 6개 spec — 내부 토큰 없음 → 403(InternalAuthGuard), findManagerStore 미호출
[SECURITY]  남의 업체 것은 없는 것과 같다 — 모든 조회 조건에 store_id(그룹 · 호실 · 상품 설정) 또는 그 그룹 · 그 그룹 상품(사진 · 그룹 상품 · 기간 가격)을 단언, 없으면 404
```

### Tests — Phase 12 단언 고침 (store-mine-profile.spec)

Phase 12 에서 넣은 "예전 클라이언트가 편의시설(store_detail)을 보내도 소개 · 연락처만 바꾼다" 케이스가 실패한다(서브에이전트 스크래치 실행 — HEAD 그대로에서도 같다). 엔티티 클래스 필드가 선언만으로 `undefined` 로 정의돼(`useDefineForClassFields`) `Object.keys(new StoreEntity())` 에 컬럼 22개가 모두 잡히기 때문이다. 값이 있는 키만 본다.

```ts
// apps/admin-service/src/store/test/store-mine-profile.spec.ts — modified (해당 it 의 마지막 단언)
            const entity = repo.updateStore.mock.calls[0][1] as StoreEntity;
            expect(entity).not.toHaveProperty('store_detail');
            expect(
                Object.entries(entity)
                    .filter(([, value]) => value !== undefined)
                    .map(([key]) => key)
                    .sort(),
            ).toEqual(['introduction', 'phone']);
```
### 규약 문서

```md
<!-- README.md:8 — admin-service 설명, "… 예약 · 환불 규정 · 일시 예약불가)." 뒤 -->
 객실: 업체 관리자의 업체 상품 설정(시간 이용 · 1박 · 연박 — 사용 여부 · 예약 가능 요일 · 이용 시간 · 입퇴실 시각) · 객실 그룹(상세정보 · 사진과 순서) · 그룹 상품(사용 여부 · 요금) · 상품별 기간 가격 · 호실 · 호실 상태(정비 완료 · 사용중지).
```

```md
<!-- AGENTS.md:36 — 게이트웨이 공개 라우트 -->
│   ├── api/v1/<service>/<domain>/  # 공개 라우트 — user-service/user · admin-service/{manager,admin,store,room}. …

<!-- AGENTS.md:46 — admin-service 도메인 트리, store 줄 다음 -->
│   ├── store/                # 업체 도메인(…): controllers/ → StoreService
│   └── room/                 # 객실 도메인(업체 상품 설정 · 객실 그룹 · 사진 · 그룹 상품 · 기간 가격 · 호실 · 호실 상태 — 업체 관리자): controllers/ → RoomService

<!-- AGENTS.md:121 — repository 제약 위반 -->
… `isUniqueViolation(error, 'UK_…')` · `isForeignKeyViolation(error, 'FK_…')` · `isExclusionViolation(error, 'EXC_…')`(PostgreSQL 23505/23503/23P01)로 …

<!-- AGENTS.md:216 — Data-Access Smoke 현재 적용, store 다음 -->
… [room.repository.spec.ts](apps/admin-service/src/room/test/room.repository.spec.ts) 매니저의 소속 업체(조인 · 잠금) · 업체 상품 설정 · 객실 그룹 목록(호실 수 · 대표 사진) · 그룹 상품 · 그룹 사진 · 기간 가격(목록 · 겹침) · 호실 목록(그룹 · 상태 조인 · 필터), …
```

```md
<!-- docs/data-layer.md:17 — typeorm-error 줄 -->
├── typeorm-error.ts # isUniqueViolation · isForeignKeyViolation · isExclusionViolation

<!-- docs/data-layer.md:143 — 제약 위반 분기 -->
- **제약 위반은 그 제약이 걸릴 수 있는 쓰기에서 제약명별 `if … else if … else` 분기** — `isUniqueViolation(error, 'UK_…')`(23505) · `isForeignKeyViolation(error, 'FK_…')`(23503) · `isExclusionViolation(error, 'EXC_…')`(23P01 — 배타 제약, 기간 가격 겹침 room.repository.ts), 마지막 else 는 500. …

<!-- docs/data-layer.md — 소프트 삭제 절 끝에 한 줄 -->
  - 다른 도메인의 행을 지울 때도 같다 — 객실 그룹 삭제는 그 그룹의 호실 · 사진을 함께 삭제 표시한다(room.service.ts `deleteMyRoomGroup`, 사진 S3 객체는 마지막에 실제 삭제).
```

```md
<!-- docs/architecture.md:128 — admin-service 모듈 -->
… `StoreModule` · `RoomModule`(객실 — 업체 관리자) …
```

```md
<!-- .beaver/output/spec/platform/cache-spec.md — 무효화 지점 표, 마지막 store 행 다음 -->
| 업체 상품 설정 · 그룹 상품 · 기간 가격 수정(`updateMyRoomPlan` · `updateMyRoomGroupPlan` · `addMyRoomGroupPlanPrice` · `updateMyRoomGroupPlanPrice` · `deleteMyRoomGroupPlanPrice`) | admin-service room (Phase 13) | 판매 상품 · 요금 · 예약 가능 요일 | Phase 13 |
| 객실 그룹 · 사진 · 호실 · 호실 상태(`createMyRoomGroup` · `updateMyRoomGroup` · `deleteMyRoomGroup` · `addMyRoomGroupImage` · `reorderMyRoomGroupImages` · `deleteMyRoomGroupImage` · `createMyRoom` · `updateMyRoom` · `deleteMyRoom` · `changeMyRoomState`) | admin-service room (Phase 13) | 객실 그룹 목록 · 사진 · 호실별 예약 가능 여부 | Phase 13 |
```
---

## Test Cases

```
[CASES:canChangeRoomState]  room-state.spec.ts — 큐 명령으로 실행(util 단위 spec 은 두지 않는다 — AGENTS)
  MAINTENANCE → AVAILABLE  허용(정비 완료)
  AVAILABLE → DISABLED     허용(사용중지)
  MAINTENANCE → DISABLED   허용
  DISABLED → AVAILABLE     허용(사용 재개)
  AVAILABLE → AVAILABLE    400(같은 상태)
  DISABLED → DISABLED      400
  RESERVED → AVAILABLE     400(시스템 전용 — 예약)
  RESERVED → DISABLED      400
  IN_USE → AVAILABLE       400(시스템 전용 — 체크인 · 체크아웃)
  IN_USE → DISABLED        400
  UNKNOWN → AVAILABLE      400(없는 상태)
  DTO: 목표 MAINTENANCE · RESERVED 는 게이트웨이 ValidationPipe 가 거부
[SUCCESS]            service 기능 spec 21개 — 업체 행 잠금(쓰기 true · 조회 false) · 업체 범위 조건 · 엔티티 인스턴스와 컬럼 값 · 그룹 등록의 그룹 상품 3행 · 그룹 삭제 순서(호실 → 사진 → 그룹 → S3 삭제 마지막) · 목록 count → Pagination → 행
[FAIL:validation]    DTO 대표 케이스(게이트웨이 ValidationPipe) — 종류 · 상태 IsIn, 요일 1 ~ 127, 이용 시간 1 ~ 24, HH:mm, 날짜 형식, 요금 범위, 이름 길이, 층 범위, 사진 ID 배열
[FAIL:service]       소속 업체 없음 · 그룹 · 호실 · 사진 · 상품 설정 · 기간 가격 없음 404, 종류에 필요한 값 없음 · 입실 = 퇴실 · 판매인데 0원 · 없는 날짜 · 종료 < 시작 · 겹침 · 사진 한도 · 키 모양 · 미업로드 · 순서 집합 불일치 · 바꿀 수 없는 상태 400 — 실패 뒤 쓰기 · S3 미호출
[FAIL:repository]    room.repository.spec.ts — UK 그룹명 · 호실명 · 사진 키 23505 → 400, EXC 기간 겹침 23P01 → 400(등록 · 수정), 통일 500 표
[SUCCESS]            room.repository.spec.ts — 소프트 삭제(update is_deleted 1 엔티티 · delete 미호출 · affected → boolean), notDeleted 조건
[SMOKE:data-access]  buildManagerStoreQuery(잠금 2) · buildRoomPlanRowsQuery · buildRoomGroupRowsQuery(호실 수 · 대표 사진 서브쿼리) · buildRoomGroupPlanRowsQuery · buildRoomGroupImagesQuery · buildRoomGroupPlanPriceListQuery(목록 · 겹침) · buildRoomRowsQuery(필터 있음 · 없음) — 스냅샷은 build 때 dist 로 뽑은 SQL
[SECURITY]           큐 명령 actor 없음 → 401, 업체 조회 없음

테스트 생략(위임형): 게이트웨이 · 서비스 controller 자체, room.util 단위, 엔티티 · 시드 · 데이터 마이그레이션(마이그레이션은 build 때 PGlite scratch 로 확인 — db:check 는 스키마 변경 없음)
```

---

## Response Codes

동기(내부 HTTP — 게이트웨이가 그대로 전달)는 상태 코드 + `ApiFailResultDto`, 큐는 SSE `accepted` → `done`(결과 data) | `failed`(`{status_code, message, validation_errors}`).

| Code | Cause |
|------|------|
| 200 / done | 조회 결과 · 업로드 주소 · 등록 ID(`room_group_id` · `room_group_image_id` · `room_group_plan_price_id` · `room_id`) · 수정 · 삭제(data null) |
| 400 | DTO 검증(게이트웨이 — 필드별 `validation_errors`) · 종류에 필요한 값 없음(이용 시간 / 입실 · 퇴실) · 입실 = 퇴실 · 판매인데 요금 0 · 없는 날짜 · 종료 < 시작 · 기간 겹침(선검사 · 배타 제약 23P01) · 그룹명 · 호실명 중복(부분 유니크 23505) · 사진 키 모양 · 한도 5장 · 아직 안 올라감 · 같은 키 · 사진 순서 집합 불일치 · 바꿀 수 없는 호실 상태 |
| 401 | 토큰 없음 · 만료 · 다른 그룹 토큰(게이트웨이 매니저 가드), 큐 명령에 actor 없음 |
| 404 | 소속 업체 없음 · 객실 그룹 · 호실 · 사진 · 상품 설정 · 기간 가격 없음(남의 업체 것 · 지운 것 포함) |
| 503 | 저장소(S3) 업로드 주소 · 존재 확인 · 삭제 실패(어댑터) — 큐는 재시도 |
| 500 | DB 오류(통일 메시지) — 큐는 재시도 후 failed + DLQ |
