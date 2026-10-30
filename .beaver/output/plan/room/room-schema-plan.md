# Plan — room-schema

## Feature Summary
- **Feature**: room 스키마 — 호실 상태 · 상품 종류 룩업(+시드) · 객실 그룹(상세정보 JSON) · 그룹 사진 · 호실 · 업체 상품 설정(업체 × 상품 종류 1행) · 그룹 상품(그룹 × 종류 가격) · 상품별 기간 가격(DB 배타 제약) · 편의시설 이동(`t_store.store_detail` 삭제 → `t_room_group.room_group_detail`)
- **Entry point**: 새 진입점 없음 — 엔티티 · 시드 · 마이그레이션 `RoomSchema` + 기존 입점 승인 · 내 업체 소개 수정 · 업체 상세 응답 정리
- **Domain**: room (로드맵 Phase 12 — #48 ~ #52) + store(바뀌는 업체 코드)
- **Spec**: [room-schema-spec.md](../../spec/room/room-schema-spec.md)

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/room/room-state.entity.ts` | new — 호실 상태 룩업 |
| `libs/database/src/entities/room/room-plan-type.entity.ts` | new — 상품 종류 룩업 |
| `libs/database/src/entities/room/room-group.entity.ts` | new — 객실 그룹 + `RoomGroupDetail`(업체에서 옮겨 온 상세정보) · `ROOM_GROUP_DETAIL_DEFAULTS` · `@AfterLoad` 기본값 채움 |
| `libs/database/src/entities/room/room-group-image.entity.ts` | new — 그룹 사진 |
| `libs/database/src/entities/room/room.entity.ts` | new — 호실 |
| `libs/database/src/entities/room/room-plan.entity.ts` | new — 업체 상품 설정(업체 × 상품 종류, CHECK) |
| `libs/database/src/entities/room/room-group-plan.entity.ts` | new — 그룹 상품 |
| `libs/database/src/entities/room/room-group-plan-price.entity.ts` | new — 상품별 기간 가격(CHECK + 배타 제약) |
| `libs/database/src/entities/store/store.entity.ts` | modified — `StoreDetail` · `store_detail` 삭제 |
| `libs/database/src/entities.ts` | modified — ENTITIES 8개 추가 |
| `libs/database/src/seeder/seeder.targets.ts` | modified — `ROOM_STATE_SEED_DATA` · `ROOM_PLAN_TYPE_SEED_DATA` + SEED_TARGETS |
| `libs/database/src/migrations/<ts>-RoomSchema.ts` | new — `npm run db:generate -- RoomSchema` 후 맨 앞에 확장 생성, 맨 끝에 기존 업체의 업체 상품 설정 3행을 손으로 더한다 |
| `libs/database/src/migrations.ts` | modified — 생성기가 MIGRATIONS 에 등록 |
| `scripts/db-schema.mjs` | modified — PGlite 를 `btree_gist` 확장과 함께 띄운다 |
| `apps/admin-service/src/store/store.constants.ts` | modified — 업체 상품 설정 기본값(`STORE_PLAN_DEFAULTS` · `STORE_PLAN_DAYS_OF_WEEK_ALL`), `STORE_DETAIL_KEYS` · `StoreDetail` import 삭제 |
| `apps/admin-service/src/store/interfaces/store.repository.interface.ts` | modified — `insertStorePlans` |
| `apps/admin-service/src/store/repositories/store.repository.ts` | modified — `roomPlans` getter · `insertStorePlans` |
| `apps/admin-service/src/store/store.service.ts` | modified — 입점 승인이 업체 상품 설정 3행을 넣고 `store_detail` 을 뺀다(`approveApplication`), 내 업체 소개 수정이 소개 · 연락처만(`updateMyStoreProfile`), import 정리 |
| `apps/admin-service/src/store/store.util.ts` | modified — `buildStoreDetail` 삭제, `toStoreDetail` · `toMineDetail` 의 `store_detail` 삭제, import 정리 |
| `libs/contracts/src/store/dto/store-mine-profile.dto.ts` | modified — `StoreMineProfileDetailDto` · `store_detail` 삭제(소개 · 연락처만) |
| `libs/contracts/src/store/dto/store-detail.dto.ts` | modified — 응답 `store_detail` 삭제 |
| `libs/contracts/src/store/dto/store-mine.dto.ts` | modified — 응답 `store_detail` 삭제 |
| `libs/contracts/src/store/store.commands.ts` | modified — `MINE_PROFILE` 주석(편의시설 삭제) |
| `apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts` | modified — `updateMyStoreProfile` JSDoc(편의시설 삭제) |
| `apps/admin-service/src/store/test/store-application-approve.spec.ts` | modified — 업체 상품 설정 3행 단언, 실패 뒤 미호출, `store_detail` 단언 삭제 |
| `apps/admin-service/src/store/test/store-mine-profile.spec.ts` | modified — 편의시설 케이스 삭제, 예전 클라이언트가 `store_detail` 을 보내도 소개 · 연락처만 바꾼다 |
| `apps/admin-service/src/store/test/store-detail.spec.ts` | modified — 응답에 `store_detail` 이 없다 |
| `apps/admin-service/src/store/test/store-mine.spec.ts` | modified — 응답에 `store_detail` 이 없다 |
| `apps/admin-service/src/store/test/store.test-helper.ts` | modified — mock `insertStorePlans`, `storeRow` 의 `store_detail` 삭제 |
| `apps/admin-service/src/store/test/store.repository.spec.ts` | modified — `insertStorePlans` 배열 insert · 통일 500, `STORE_SELECT` Smoke 스냅샷에서 `store_detail` 삭제(dist 로 뽑은 실제 SQL) |
| `docs/data-layer.md` | modified — 엔티티 트리 · 룩업 목록 · 타입(`date` · `integer` · 요일 비트) · 배타 제약 `EXC_` · 삭제 표시 부분 유니크 · 종류별 1행 · 컬럼 이름 · `btree_gist` · jsonb 예(`room_group_detail`) |
| `docs/conventions.md` | modified — 중첩 DTO 예에서 편의시설 삭제, 이름은 뜻이 드러나는 말(음역 ❌) |
| `AGENTS.md` | modified — Data Layer 엔티티 · 컬럼 이름 줄, Validation 중첩 예에서 편의시설 삭제, Conventions 이름 규칙 |
| `README.md` | modified — 마이그레이션이 `btree_gist` 확장을 만든다(적용 계정 권한), admin-service 설명의 내 업체 설정에서 편의시설 삭제 |
| `.beaver/output/spec/platform/cache-spec.md` | modified — 무효화 지점 표의 내 업체 소개 수정 행(편의시설 삭제) · 입점 승인 행에 업체 상품 설정 |
| `libs/database/src/soft-delete.ts` | new — 소프트 삭제 공통 util `notDeleted(where)` |
| `libs/database/src/entities/store/store-application.entity.ts` | modified — `is_deleted` |
| `libs/database/src/entities/store/store-file.entity.ts` | modified — `is_deleted` · `updated_at` + `@BeforeUpdate` |
| `libs/database/src/entities/store/store-hour.entity.ts` | modified — `is_deleted`, `UK_StoreHour_StoreIdDayOfWeek` 를 부분 유니크 인덱스로 |
| `libs/database/src/entities/store/store-break.entity.ts` | modified — `is_deleted` |
| `libs/database/src/entities/store/store-unavailable-period.entity.ts` | modified — `is_deleted` |
| `apps/admin-service/src/store/repositories/store.repository.ts` | modified(소프트 삭제) — 삭제 6곳을 `is_deleted = 1` 로, `is_deleted` 테이블의 조회 · 개수 · 수정 · QueryBuilder 에 `is_deleted = 0` |
| `apps/admin-service/src/store/interfaces/store.repository.interface.ts` | modified(소프트 삭제) — 삭제 메서드 주석 |
| `apps/admin-service/src/manager/repositories/manager.repository.ts` | modified — 소속 업체(`t_store`) · 세션(`t_session`) 조회에 `is_deleted = 0` |
| `apps/admin-service/src/admin/repositories/admin.repository.ts` | modified — 세션 조회에 `is_deleted = 0` |
| `apps/user-service/src/user/repositories/user.repository.ts` | modified — 세션 조회에 `is_deleted = 0` |
| `apps/scheduler/src/user/repositories/user.repository.ts` | 확인 — `t_user` 만 다뤄 변경 없을 것(초안에서 확인) |
| repository spec 5개 · `apps/admin-service/src/store/test/store.test-helper.ts` | modified — 조건에 `is_deleted: 0` · 삭제 단언 `delete` → `update(is_deleted 1)` · 통일 500 표 · Smoke 스냅샷 · 도우미 행에 `is_deleted: 0` |
| `.beaver/memory/naming.md` · `data-layer.md` · `MEMORY.md` | ship 에서 보관 — 네 규칙(종류별 1행 · 음역 금지 · jsonb 기본값 · 소프트 삭제)을 docs · AGENTS.md 에 옮긴 뒤 `_archived/` 로 |
| `.beaver/output/roadmap/roomless-roadmap.md` (+ html) | modified(ship) — Phase 12 유닛 목표(#51 상품 종류 · 업체 상품 설정 · 그룹 상품) · Phase 13 에 업체 상품 설정 API 유닛 · #45 편의시설 이동 메모 · Cross-Cutting "객실 모델" · "이용 단위" · "체크인 · 연장" · Phase 17 #67 · Phase 19 #81 메모 · Notes/Risks "배타 제약과 오프라인 검사" 해결 · 지금 할 일 사용자 줄(`RoomSchema`) |

삭제할 코드(편의시설을 객실 그룹으로 옮기며 빈 자리를 남기지 않는다 — §1.7):
- `t_store.store_detail` 컬럼(마이그레이션 DROP) · `StoreDetail` 인터페이스(store.entity.ts:4-14)
- `StoreMineProfileDetailDto` · `StoreMineProfileDto.store_detail`(store-mine-profile.dto.ts:5-31 · 46-50)
- 응답 `StoreDetailResultDto.store_detail`(store-detail.dto.ts:83-84) · `StoreMineResultDto.store_detail`(store-mine.dto.ts:103-104)
- `STORE_DETAIL_KEYS`(store.constants.ts:42-43) · `buildStoreDetail`(store.util.ts:191-206) · `toStoreDetail` · `toMineDetail` 의 `store_detail` 줄(store.util.ts:513 · 604)
- 입점 승인 `store.store_detail = {}`(store.service.ts:457) · 내 업체 소개 수정 `storeEntity.store_detail = buildStoreDetail(…)`(store.service.ts:698)
- 위를 단언하던 spec 케이스(store-mine-profile.spec.ts 의 편의시설 3건 · 각 spec 의 `store_detail` 기대값)

삭제 · 대체할 코드(소프트 삭제 전환 — 사용자 규칙 2026-10-31):
- 실제 `DELETE` 6곳 — store.repository.ts 165(`applications.delete`) · 293(`storeFiles.delete`) · 333(`buildDeleteApplicationFilesQuery` 의 DeleteQueryBuilder) · 585(`storeHours.delete`) · 635(`storeBreaks.delete`) · 718(`unavailablePeriods.delete`) → `is_deleted = 1` 수정으로 바꾼다(메서드 이름은 그대로)
- `UK_StoreHour_StoreIdDayOfWeek` 의 일반 UK(store-hour.entity.ts:10 `@Unique`) → 부분 유니크 인덱스
- repository spec 의 `delete` 단언 · 통일 500 표의 `delete` 항목 → `update`

---

## Design

### Data Access — 엔티티

형제: 룩업 store-state.entity.ts:6, 파일 행 store-file.entity.ts:13, jsonb store.entity.ts:5, 부분 유니크 인덱스 user.entity.ts:17-20, CHECK store-hour.entity.ts:11 · store-unavailable-period.entity.ts:11.

```ts
// libs/database/src/entities/room/room-state.entity.ts — new
import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 호실 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_room_state', comment: '호실 상태'})
export class RoomStateEntity {
    @PrimaryColumn({name: 'room_state_id', length: 20, comment: '호실 상태 ID', primaryKeyConstraintName: 'PK_RoomState'})
    room_state_id: string;

    @Column({name: 'room_state_name', length: 50, nullable: false, comment: '호실 상태명'})
    room_state_name: string;
}
```

```ts
// libs/database/src/entities/room/room-plan-type.entity.ts — new
import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 상품 종류 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts(HOURLY 시간 이용 · NIGHT 1박 · LONG 연박).
 * 종류마다 다른 설정(판매 여부 · 예약 가능 요일 · 이용 시간 · 입실 · 퇴실 시각)은 업체 상품 설정(t_room_plan)이 업체 × 종류 1행으로 갖고, 코드가 종류 ID 로 가른다.
 */
@Entity({name: 't_room_plan_type', comment: '상품 종류'})
export class RoomPlanTypeEntity {
    @PrimaryColumn({name: 'room_plan_type_id', length: 20, comment: '상품 종류 ID', primaryKeyConstraintName: 'PK_RoomPlanType'})
    room_plan_type_id: string;

    @Column({name: 'room_plan_type_name', length: 50, nullable: false, comment: '상품 종류명'})
    room_plan_type_name: string;
}
```

```ts
// libs/database/src/entities/room/room-group.entity.ts — new
import {AfterLoad, BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from '../store/store.entity.js';

/**
 * 객실 그룹 상세정보(t_room_group.room_group_detail) — 항목은 언제든 바뀔 수 있다(인터페이스 · 기본값만 고치고 마이그레이션 없음).
 * 저장된 JSON 에는 항목이 빠져 있을 수 있다(나중에 더한 항목) — 조회 뒤 ROOM_GROUP_DETAIL_DEFAULTS 로 채운 값이라 항목이 모두 있다.
 */
export interface RoomGroupDetail {
    /** 객실 안의 방 개수(원룸 1 · 투룸 2) */
    room_count: number;
    /** 샤워실 유무(0: 없음, 1: 있음) */
    has_shower: 0 | 1;
    /** TV 유무(0: 없음, 1: 있음) */
    has_tv: 0 | 1;
    /** PC 유무(0: 없음, 1: 있음) */
    has_pc: 0 | 1;
}

/** 객실 그룹 상세정보 기본값 — 저장된 JSON 에 없는 항목은 조회 뒤 이 값으로 채운다(@AfterLoad). 엔티티로 읽지 않는 곳(raw select)도 이 상수로 채운다 */
export const ROOM_GROUP_DETAIL_DEFAULTS: RoomGroupDetail = {room_count: 1, has_shower: 1, has_tv: 1, has_pc: 1};

/**
 * 객실 그룹 — 객실의 유형. 같은 상품 · 가격을 쓰는 호실 묶음이고, 유형별 상세정보는 JSON(room_group_detail) 하나로 관리한다.
 * 상품 설정은 업체 공통(t_room_plan), 가격은 그룹 상품(t_room_group_plan).
 * 지울 때는 삭제 표시(is_deleted = 1)로 남긴다 — 예약이 호실 · 그룹 상품을 가리킨다. 그룹명은 업체 안에서 지워지지 않은 그룹끼리 유일하다.
 */
@Entity({name: 't_room_group', comment: '객실 그룹'})
@Index('UK_RoomGroup_StoreIdRoomGroupName', ['store_id', 'room_group_name'], {unique: true, where: '"is_deleted" = 0'})
export class RoomGroupEntity {
    @PrimaryColumn({name: 'room_group_id', length: 32, comment: '객실 그룹 ID', primaryKeyConstraintName: 'PK_RoomGroup'})
    room_group_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_RoomGroup_Store'})
    store_id: string;

    @Column({name: 'room_group_name', length: 100, nullable: false, comment: '그룹명(업체 안에서 지워지지 않은 그룹끼리 유일)'})
    room_group_name: string;

    @Column({name: 'description', type: 'text', nullable: true, comment: '설명'})
    description: string | null;

    @Column({
        name: 'room_group_detail',
        type: 'jsonb',
        nullable: false,
        default: () => "'{}'",
        comment: '상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다. 없는 항목은 조회 뒤 기본값 — 방 1 · 나머지 1)',
    })
    room_group_detail: RoomGroupDetail;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 예약 이력 때문에 행을 남긴다)'})
    is_deleted: number;

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

    /**
     * 조회 직후 상세정보의 빈 항목을 기본값으로 채운다 — 나중에 더한 항목도 기존 행을 고치지 않고 기본값으로 보인다.
     */
    @AfterLoad()
    fillDetailDefaults(): void {
        this.room_group_detail = {...ROOM_GROUP_DETAIL_DEFAULTS, ...this.room_group_detail};
    }
}
```

`@AfterLoad` 는 엔티티로 읽을 때(`find` · `findOne` · QueryBuilder `getMany` · `getOne`) 돈다. `getRawMany` 같은 raw select 는 돌지 않으므로 그런 조회(Phase 18 discovery 등)는 `ROOM_GROUP_DETAIL_DEFAULTS` 를 같은 방식으로 펼쳐 채운다. 상세정보 입력(Phase 13)은 지금 업체 편의시설처럼 중첩 DTO + 알려진 항목만 남긴다.

```ts
// libs/database/src/entities/room/room-group-image.entity.ts — new
import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {RoomGroupEntity} from './room-group.entity.js';

/**
 * 객실 그룹 사진 — 파일 1개 = 1행, 모두 공개(CDN 공개 주소). 업체 사진(t_store_file)과 같은 컬럼 + 삭제 표시다.
 * 저장 키는 업로드마다 새로 만든다 — `store/<store_id>/room-group/<room_group_id>/<uuid 32자>.<jpg|png>`(CDN 은 store/ 접두만 읽는다). 키를 다시 쓰지 않으므로 UK 는 지운 행까지 전체에 건다.
 * 지울 때는 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제).
 */
@Entity({name: 't_room_group_image', comment: '객실 그룹 사진'})
@Unique('UK_RoomGroupImage_FileKey', ['file_key'])
@Index('IDX_RoomGroupImage_RoomGroupIdSortOrder', ['room_group_id', 'sort_order'])
export class RoomGroupImageEntity {
    @PrimaryColumn({name: 'room_group_image_id', length: 32, comment: '객실 그룹 사진 ID', primaryKeyConstraintName: 'PK_RoomGroupImage'})
    room_group_image_id: string;

    @ManyToOne(() => RoomGroupEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_group_id', referencedColumnName: 'room_group_id', foreignKeyConstraintName: 'FK_RoomGroupImage_RoomGroup'})
    room_group_id: string;

    @Column({name: 'file_key', length: 255, nullable: false, comment: '저장 키(S3 공개 store/<store_id>/room-group/<room_group_id>/…) — 같은 키를 덮어쓰지 않는다'})
    file_key: string;

    @Column({name: 'file_name', length: 255, nullable: false, comment: '원본 파일명'})
    file_name: string;

    @Column({name: 'content_type', length: 100, nullable: false, comment: 'MIME 타입(image/jpeg · image/png)'})
    content_type: string;

    @Column({name: 'sort_order', type: 'smallint', nullable: false, default: 0, comment: '정렬 순서(0부터 — 0 이 대표, 지워지지 않은 사진끼리)'})
    sort_order: number;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제)'})
    is_deleted: number;

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
     * update 직전 수정일을 갱신한다(정렬 순서 변경 · 삭제 표시).
     */
    @BeforeUpdate()
    updateTimestamp(): void {
        this.updated_at = new Date();
    }
}
```

```ts
// libs/database/src/entities/room/room.entity.ts — new
import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from '../store/store.entity.js';
import {RoomGroupEntity} from './room-group.entity.js';
import {RoomStateEntity} from './room-state.entity.js';

/**
 * 호실 — 그룹의 상품 · 가격을 쓰고, 상태 · 사물은 호실마다다. 업체(store_id)는 그룹의 업체와 같다(service 가 맞춘다).
 * 지울 때는 삭제 표시(is_deleted = 1)로 남긴다 — 예약이 호실을 가리킨다. 호실명은 업체 안에서 지워지지 않은 호실끼리 유일하다.
 */
@Entity({name: 't_room', comment: '호실'})
@Index('UK_Room_StoreIdRoomName', ['store_id', 'room_name'], {unique: true, where: '"is_deleted" = 0'})
@Index('IDX_Room_StoreIdFloor', ['store_id', 'floor'])
@Index('IDX_Room_RoomGroupId', ['room_group_id'])
export class RoomEntity {
    @PrimaryColumn({name: 'room_id', length: 32, comment: '호실 ID', primaryKeyConstraintName: 'PK_Room'})
    room_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_Room_Store'})
    store_id: string;

    @ManyToOne(() => RoomGroupEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_group_id', referencedColumnName: 'room_group_id', foreignKeyConstraintName: 'FK_Room_RoomGroup'})
    room_group_id: string;

    @ManyToOne(() => RoomStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_state_id', referencedColumnName: 'room_state_id', foreignKeyConstraintName: 'FK_Room_RoomState'})
    room_state_id: string;

    @Column({name: 'room_name', length: 50, nullable: false, comment: '호실명(예: 101호 — 업체 안에서 지워지지 않은 호실끼리 유일)'})
    room_name: string;

    @Column({name: 'floor', type: 'smallint', nullable: false, comment: '층(정수 — 지하는 음수, B1 = -1)'})
    floor: number;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 예약 이력 때문에 행을 남긴다)'})
    is_deleted: number;

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

업체 상품 설정 — 종류마다 반복되는 설정을 `t_store` 에 `<종류>_<설정>` 컬럼으로 늘어놓지 않고 업체 × 종류 1행으로 둔다(.beaver/memory/naming.md). 시간 이용은 이용 시간만, 1박 · 연박은 입실 · 퇴실 시각 세트만 — 형제 `CHK_StoreHour_OpenCloseTime`(플래그 + 세트, store-hour.entity.ts:11)처럼 CHECK 로 막는다.

```ts
// libs/database/src/entities/room/room-plan.entity.ts — new
import {BeforeInsert, BeforeUpdate, Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {StoreEntity} from '../store/store.entity.js';
import {RoomPlanTypeEntity} from './room-plan-type.entity.js';

/**
 * 업체 상품 설정 — 업체 × 상품 종류(t_room_plan_type)마다 반드시 1행(입점 승인 때 3행). 업체의 모든 객실 공통이다.
 * 판매 여부 · 예약 가능 요일(비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127)은 모든 종류에,
 * 이용 시간은 시간 이용(HOURLY)만, 입실 · 퇴실 시각(한국 시각, 분 단위)은 1박(NIGHT) · 연박(LONG)만 둔다.
 * 1박은 퇴실이 입실보다 이르면 다음 날 퇴실이고, 연박은 첫날 입실 · 마지막 날 퇴실이다. 가격은 그룹 상품(t_room_group_plan).
 */
@Entity({name: 't_room_plan', comment: '업체 상품 설정'})
@Unique('UK_RoomPlan_StoreIdRoomPlanTypeId', ['store_id', 'room_plan_type_id'])
@Check(
    'CHK_RoomPlan_UsageHoursCheckInOutTime',
    `("room_plan_type_id" = 'HOURLY' AND "usage_hours" IS NOT NULL AND "check_in_time" IS NULL AND "check_out_time" IS NULL) OR ("room_plan_type_id" <> 'HOURLY' AND "usage_hours" IS NULL AND "check_in_time" IS NOT NULL AND "check_out_time" IS NOT NULL)`,
)
export class RoomPlanEntity {
    @PrimaryColumn({name: 'room_plan_id', length: 32, comment: '업체 상품 설정 ID', primaryKeyConstraintName: 'PK_RoomPlan'})
    room_plan_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_RoomPlan_Store'})
    store_id: string;

    @ManyToOne(() => RoomPlanTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_plan_type_id', referencedColumnName: 'room_plan_type_id', foreignKeyConstraintName: 'FK_RoomPlan_RoomPlanType'})
    room_plan_type_id: string;

    @Column({name: 'is_used', type: 'smallint', nullable: false, default: 1, comment: '사용 여부(0: 이 업체는 이 종류를 팔지 않음 — 그룹 상품이 사용 중이어도 팔지 않는다, 1: 판매)'})
    is_used: number;

    @Column({name: 'days_of_week', type: 'smallint', nullable: false, default: 127, comment: '예약 가능 요일(비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127)'})
    days_of_week: number;

    @Column({name: 'usage_hours', type: 'smallint', nullable: true, comment: '이용 시간(시간) — 시간 이용(HOURLY)만, 1회 이용 · 연장이 이 시간만큼. 1박 · 연박은 NULL'})
    usage_hours: number | null;

    @Column({name: 'check_in_time', type: 'time', nullable: true, comment: '입실 시각(한국 시각, 분 단위) — 1박 · 연박(첫날)만, check_out_time 과 세트. 시간 이용은 NULL'})
    check_in_time: string | null;

    @Column({name: 'check_out_time', type: 'time', nullable: true, comment: '퇴실 시각(한국 시각, 분 단위) — 1박(입실보다 이르면 다음 날) · 연박(마지막 날)만, check_in_time 과 세트. 시간 이용은 NULL'})
    check_out_time: string | null;

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
// libs/database/src/entities/room/room-group-plan.entity.ts — new
import {BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {RoomGroupEntity} from './room-group.entity.js';
import {RoomPlanTypeEntity} from './room-plan-type.entity.js';

/**
 * 그룹 상품 — 그룹 × 상품 종류(t_room_plan_type)마다 반드시 1행(그룹을 만들 때 3행). 판매 / 판매 안 함은 사용 여부(is_used) 0/1 로 바꾸고, 행은 지우지 않는다.
 * 판매 = 업체 상품 설정(t_room_plan) is_used = 1 AND 그룹 상품 is_used = 1. 예약 가능 요일 · 이용 시간 · 입실 · 퇴실 시각은 업체 상품 설정 공통이다.
 * 예약이 이 행을 가리키고, 적용 가격은 예약에 따로 저장한다.
 */
@Entity({name: 't_room_group_plan', comment: '그룹 상품'})
@Unique('UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId', ['room_group_id', 'room_plan_type_id'])
export class RoomGroupPlanEntity {
    @PrimaryColumn({name: 'room_group_plan_id', length: 32, comment: '그룹 상품 ID', primaryKeyConstraintName: 'PK_RoomGroupPlan'})
    room_group_plan_id: string;

    @ManyToOne(() => RoomGroupEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_group_id', referencedColumnName: 'room_group_id', foreignKeyConstraintName: 'FK_RoomGroupPlan_RoomGroup'})
    room_group_id: string;

    @ManyToOne(() => RoomPlanTypeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_plan_type_id', referencedColumnName: 'room_plan_type_id', foreignKeyConstraintName: 'FK_RoomGroupPlan_RoomPlanType'})
    room_plan_type_id: string;

    @Column({name: 'is_used', type: 'smallint', nullable: false, default: 0, comment: '사용 여부(0: 이 그룹은 이 종류를 팔지 않음, 1: 판매 — 업체 상품 설정도 사용 중이어야 판다)'})
    is_used: number;

    @Column({name: 'price', type: 'integer', nullable: false, default: 0, comment: '기본 요금(원) — 시간 이용 1회 · 1박 · 연박 1박당'})
    price: number;

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
// libs/database/src/entities/room/room-group-plan-price.entity.ts — new
import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Exclusion, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {RoomGroupPlanEntity} from './room-group-plan.entity.js';

/**
 * 상품별 기간 가격(성수기 등) — 한국 날짜 범위(시작 · 종료 둘 다 포함) 동안 기본 요금 대신 쓴다. 이용 날짜가 범위에 포함되면 적용한다(계산은 예약 — Phase 17).
 * 같은 상품의 지워지지 않은 기간끼리는 겹치지 않는다 — DB 배타 제약(EXC_ — btree_gist 확장, WHERE is_deleted = 0)과 service 검사 둘 다.
 * 지울 때는 삭제 표시(is_deleted = 1)로 남긴다(소프트 삭제 — 예약은 적용 가격을 따로 저장한다).
 */
@Entity({name: 't_room_group_plan_price', comment: '상품별 기간 가격'})
@Check('CHK_RoomGroupPlanPrice_StartDateEndDate', '"start_date" <= "end_date"')
@Exclusion('EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange', `USING gist ("room_group_plan_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&) WHERE ("is_deleted" = 0)`)
export class RoomGroupPlanPriceEntity {
    @PrimaryColumn({name: 'room_group_plan_price_id', length: 32, comment: '기간 가격 ID', primaryKeyConstraintName: 'PK_RoomGroupPlanPrice'})
    room_group_plan_price_id: string;

    @ManyToOne(() => RoomGroupPlanEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'room_group_plan_id', referencedColumnName: 'room_group_plan_id', foreignKeyConstraintName: 'FK_RoomGroupPlanPrice_RoomGroupPlan'})
    room_group_plan_id: string;

    @Column({name: 'start_date', type: 'date', nullable: false, comment: '시작 날짜(한국 날짜, 포함)'})
    start_date: string;

    @Column({name: 'end_date', type: 'date', nullable: false, comment: '종료 날짜(한국 날짜, 포함 — 시작 날짜와 같거나 늦다)'})
    end_date: string;

    @Column({name: 'price', type: 'integer', nullable: false, comment: '이 기간의 요금(원) — 기본 요금 대신'})
    price: number;

    @Column({name: 'memo', type: 'varchar', length: 30, nullable: true, comment: '메모(예: 여름 성수기, 30자)'})
    memo: string | null;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, 겹침 검사는 정상 행끼리)'})
    is_deleted: number;

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

`t_store` — 편의시설(`StoreDetail` · `store_detail`)을 지운다. 객실 그룹의 `RoomGroupDetail` · `room_group_detail` 로 옮겼다.

```ts
// libs/database/src/entities/store/store.entity.ts — modified
// 삭제: 파일 앞의 StoreDetail 인터페이스 전체(store.entity.ts:4-14)
/** 업체 상세정보(t_store.store_detail) — 항목은 언제든 바뀔 수 있다. 플래그는 0/1 */
export interface StoreDetail { … }

// 삭제: introduction 다음 컬럼(store.entity.ts:63-64)
    @Column({name: 'store_detail', type: 'jsonb', nullable: false, default: () => "'{}'", comment: '업체 상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다)'})
    store_detail: StoreDetail;

// 클래스 JSDoc 끝에 한 줄
/**
 * 업체 — 입점 승인으로 만들어진다. 이용자에게는 활성(ACTIVE) · 미삭제 업체만 보인다.
 * 영업중 = 영업중 여부(is_open) 1 이고, 24시간 연중무휴(is_always_open) 이거나 요일별 영업시간(t_store_hour) 안 · 브레이크타임 밖.
 * is_open 이 0 이면 연중무휴로 되어 있어도 영업중 아님이다.
 * 상품 설정은 업체 상품 설정(t_room_plan — 상품 종류마다 1행), 편의시설 같은 객실 상세정보는 객실 그룹(t_room_group.room_group_detail)에 있다.
 */
```

```ts
// libs/database/src/entities.ts — modified
import {ApiLogEntity} from './entities/api-log/api-log.entity.js';
import {RoomGroupImageEntity} from './entities/room/room-group-image.entity.js';
import {RoomGroupPlanPriceEntity} from './entities/room/room-group-plan-price.entity.js';
import {RoomGroupPlanEntity} from './entities/room/room-group-plan.entity.js';
import {RoomGroupEntity} from './entities/room/room-group.entity.js';
import {RoomPlanTypeEntity} from './entities/room/room-plan-type.entity.js';
import {RoomPlanEntity} from './entities/room/room-plan.entity.js';
import {RoomStateEntity} from './entities/room/room-state.entity.js';
import {RoomEntity} from './entities/room/room.entity.js';
import {StoreApplicationStateEntity} from './entities/store/store-application-state.entity.js';
// … (기존 import 그대로)

export const ENTITIES = [
    AuthEntity,
    StateEntity,
    SnsEntity,
    SmsPurposeEntity,
    StoreStateEntity,
    StoreApplicationStateEntity,
    StoreFilePurposeEntity,
    StoreEntity,
    StoreApplicationEntity,
    StoreFileEntity,
    StoreHourEntity,
    StoreBreakEntity,
    StoreUnavailablePeriodEntity,
    RoomStateEntity,
    RoomPlanTypeEntity,
    RoomPlanEntity,
    RoomGroupEntity,
    RoomGroupImageEntity,
    RoomEntity,
    RoomGroupPlanEntity,
    RoomGroupPlanPriceEntity,
    UserEntity,
    UserSettingEntity,
    SessionEntity,
    SessionRefreshEntity,
    SmsVerificationEntity,
    ApiLogEntity,
];
```

### Data Access — 소프트 삭제 공통 util

삭제는 항상 소프트 삭제이고, `is_deleted` 가 있는 테이블의 조회 · 개수 · 수정에는 `is_deleted = 0` 이 항상 붙는다 — **repository 가 붙인다**(사용자 결정 2026-10-31, 규약 "WHERE 는 service 가 만들고 repository 는 실행만" 의 예외). 받은 조건은 이 util 로 감싸고, QueryBuilder 빌더는 `"<별칭>"."is_deleted" = 0` 을 직접 더한다(조인한 `is_deleted` 테이블 포함). 형제: `libs/database/src/typeorm-error.ts`(repository 가 쓰는 DB 공통 함수).

```ts
// libs/database/src/soft-delete.ts — new
import type {FindOptionsWhere} from 'typeorm';

/** 소프트 삭제 표시가 있는 엔티티 — is_deleted(0: 정상, 1: 삭제) */
interface SoftDeletable {
    is_deleted: number;
}

/**
 * 지워지지 않은 행만 — 조건에 is_deleted = 0 을 더한다. 배열(OR 조건)이면 조건마다 더한다.
 * is_deleted 가 있는 테이블의 조회 · 개수 · 수정은 repository 가 항상 이 함수로 조건을 감싼다(service 는 조건에 is_deleted 를 넣지 않는다).
 *
 * @param where 조건 (하나 또는 OR 배열)
 * @returns is_deleted = 0 을 더한 조건 (받은 모양 그대로)
 */
export function notDeleted<T extends SoftDeletable>(where: FindOptionsWhere<T>): FindOptionsWhere<T>;
export function notDeleted<T extends SoftDeletable>(where: FindOptionsWhere<T>[]): FindOptionsWhere<T>[];
export function notDeleted<T extends SoftDeletable>(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): FindOptionsWhere<T> | FindOptionsWhere<T>[];
export function notDeleted<T extends SoftDeletable>(where: FindOptionsWhere<T> | FindOptionsWhere<T>[]): FindOptionsWhere<T> | FindOptionsWhere<T>[] {
    if (Array.isArray(where)) {
        return where.map((item) => ({...item, is_deleted: 0}) as FindOptionsWhere<T>);
    }
    return {...where, is_deleted: 0} as FindOptionsWhere<T>;
}
```

삭제 메서드의 모양(형제 메서드 이름은 그대로 — `deleteStoreHours` 예):

```ts
    /**
     * 요일별 영업시간 삭제 — 교체 전 기존 행을 삭제 표시한다(소프트 삭제, 지워지지 않은 행만)
     *
     * @param where 조건 (업체)
     */
    async deleteStoreHours(where: FindOptionsWhere<StoreHourEntity>): Promise<void> {
        try {
            const entity = new StoreHourEntity();
            entity.is_deleted = 1;
            await this.storeHours.update(notDeleted(where), entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
```

메서드별 바뀐 코드는 위 모양을 그대로 따른다 — store repository 25개(조회 · 개수 · 수정은 `notDeleted(where)`, QueryBuilder 빌더는 `"<별칭>"."is_deleted" = 0`, 삭제 6곳은 위 모양, 신청 파일 삭제 쿼리는 DeleteQueryBuilder → UpdateQueryBuilder `set({is_deleted: 1, updated_at: () => 'CURRENT_TIMESTAMP'})`, 파일 업체 지정 쿼리도 `is_deleted = 0` · 수정일), manager `findManagerStore` · `findSession`, admin · user-service `findSession`, scheduler 변경 없음(t_user 만). 메서드별 결과는 report 와 코드에 있다.

### Data Access — 엔티티 (기존 store 테이블 소프트 삭제)

지우는 동작이 있는 store 테이블 5개에 `t_store` 와 같은 `is_deleted` 컬럼을 더한다(지우지 않는 테이블은 그대로 — t_user · t_session_refresh · t_sms_verification · t_user_setting · 룩업 · t_api_log).

```ts
// libs/database/src/entities/store/store-application.entity.ts · store-break.entity.ts · store-unavailable-period.entity.ts — modified (created_at 앞에 추가)
    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제)'})
    is_deleted: number;
```

```ts
// libs/database/src/entities/store/store-file.entity.ts — modified (import 에 BeforeUpdate, sort_order 뒤 is_deleted, created_at 뒤 updated_at, 훅)
import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 소프트 삭제, S3 객체는 실제로 지운다)'})
    is_deleted: number;

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
     * update 직전 수정일을 갱신한다(정렬 순서 변경 · 업체 지정 · 삭제 표시).
     */
    @BeforeUpdate()
    updateTimestamp(): void {
        this.updated_at = new Date();
    }
```

```ts
// libs/database/src/entities/store/store-hour.entity.ts — modified (요일 UK 를 지워지지 않은 행끼리의 부분 유니크 인덱스로 — 교체 = 기존 행 삭제 표시 + 새 행)
import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';

@Entity({name: 't_store_hour', comment: '업체 요일별 영업시간'})
@Index('UK_StoreHour_StoreIdDayOfWeek', ['store_id', 'day_of_week'], {unique: true, where: '"is_deleted" = 0'})
@Check('CHK_StoreHour_OpenCloseTime', `("is_closed" = 1 AND "open_time" IS NULL AND "close_time" IS NULL) OR ("is_closed" = 0 AND "open_time" IS NOT NULL AND "close_time" IS NOT NULL)`)
export class StoreHourEntity {
    // … close_time 뒤
    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제 — 교체 때 기존 행을 삭제 표시)'})
    is_deleted: number;
```

### Data Access — 시드

형제: `STORE_FILE_PURPOSE_SEED_DATA` · `SEED_TARGETS`(seeder.targets.ts — FK 부모를 먼저). 상품 종류 3행은 마이그레이션도 먼저 넣는다(기존 업체의 업체 상품 설정 FK — `ON CONFLICT DO NOTHING`, seeder 는 있는 PK 를 건너뛴다).

```ts
// libs/database/src/seeder/seeder.targets.ts — modified (추가분)
import {RoomPlanTypeEntity} from '../entities/room/room-plan-type.entity.js';
import {RoomStateEntity} from '../entities/room/room-state.entity.js';

/** 호실 상태(t_room_state) 기본 데이터 — 사용중지(DISABLED) 호실은 예약을 받지 않는다 */
export const ROOM_STATE_SEED_DATA: RoomStateEntity[] = [
    {room_state_id: 'STANDBY', room_state_name: '스탠바이'},
    {room_state_id: 'IN_USE', room_state_name: '이용중'},
    {room_state_id: 'MAINTENANCE', room_state_name: '정비중'},
    {room_state_id: 'DISABLED', room_state_name: '사용중지'},
];

/** 상품 종류(t_room_plan_type) 기본 데이터 — 마이그레이션 RoomSchema 도 같은 3행을 넣는다(기존 업체의 업체 상품 설정 FK) */
export const ROOM_PLAN_TYPE_SEED_DATA: RoomPlanTypeEntity[] = [
    {room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용'},
    {room_plan_type_id: 'NIGHT', room_plan_type_name: '1박'},
    {room_plan_type_id: 'LONG', room_plan_type_name: '연박'},
];

export const SEED_TARGETS: SeedTarget[] = [
    {entity: AuthEntity, data: AUTH_SEED_DATA},
    {entity: StateEntity, data: STATE_SEED_DATA},
    {entity: SnsEntity, data: SNS_SEED_DATA},
    {entity: SmsPurposeEntity, data: SMS_PURPOSE_SEED_DATA},
    {entity: StoreStateEntity, data: STORE_STATE_SEED_DATA},
    {entity: StoreApplicationStateEntity, data: STORE_APPLICATION_STATE_SEED_DATA},
    {entity: StoreFilePurposeEntity, data: STORE_FILE_PURPOSE_SEED_DATA},
    {entity: RoomStateEntity, data: ROOM_STATE_SEED_DATA},
    {entity: RoomPlanTypeEntity, data: ROOM_PLAN_TYPE_SEED_DATA},
    {entity: UserEntity, data: buildSuperAdminSeed, key: 'login_id'},
    {entity: UserSettingEntity, data: buildSuperAdminSettingSeed, key: 'user_id'},
];
```

### Data Access — 오프라인 스키마 도구

`btree_gist` 은 프로젝트 첫 PostgreSQL 확장이다. TypeORM 은 배타 제약이 있으면 연결 때 `CREATE EXTENSION IF NOT EXISTS "btree_gist"` 를 시도하고(PostgresDriver.js:406-412), 마이그레이션도 같은 문장을 실행하므로 PGlite 에 확장 모듈을 실어야 한다. PGlite 0.5.9 의 `contrib/btree_gist` 로 배타 제약 거부(23P01 · 제약명)를 기획 중 시험했다.

```js
// scripts/db-schema.mjs — modified
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
// …
async function pendingSchemaDiff() {
    const {ENTITIES} = await import(new URL('entities.js', DIST));
    const {MIGRATIONS} = await import(new URL('migrations.js', DIST));
    // 배타 제약(EXC_ — 기간 겹침)이 쓰는 확장을 실어 둔다 — 운영 PostgreSQL 처럼 CREATE EXTENSION 으로 켠다
    const db = await PGlite.create({extensions: {btree_gist}});
    // … (이하 그대로)
```

### Data Access — 마이그레이션

순서: 엔티티 · ENTITIES 반영 → `npm run db:generate -- RoomSchema`(user-service 빌드 → PGlite 계산 · MIGRATIONS 등록) → **up 맨 앞에 확장 생성, 맨 끝에 기존 업체의 업체 상품 설정 3행을 손으로 더한다** → `npm run db:check` 통과.

생성기가 만드는 나머지(CREATE TABLE 8개 · COMMENT · 인덱스 · 부분 유니크 인덱스 · UK · CHECK 2 · 배타 제약 · FK · t_store DROP COLUMN)는 그대로 둔다. 손으로 고친 뒤의 모양은 다음과 같다. `COMMENT ON COLUMN` 은 엔티티 comment 그대로 생성돼 여기서는 줄였다.

```ts
// libs/database/src/migrations/<ts>-RoomSchema.ts — new (생성 + 손으로 고친 부분)
import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * room 스키마 (로드맵 Phase 12 #48 ~ #52)
 * - 룩업 t_room_state · t_room_plan_type (기본 데이터는 seeder — 상품 종류 3행은 기존 업체의 업체 상품 설정 FK 때문에 여기서도 넣는다)
 * - t_room_group · t_room_group_image · t_room · t_room_plan(업체 상품 설정) · t_room_group_plan · t_room_group_plan_price(기간 겹침 배타 제약 — btree_gist)
 * - 기존 업체마다 업체 상품 설정 3행(입점 승인과 같은 기본값 — 판매 · 매일 · 시간 이용 3시간 · 1박 22:00 ~ 09:00 · 연박 15:00 ~ 11:00)
 * - t_store.store_detail 삭제 — 편의시설은 객실 그룹 상세정보(t_room_group.room_group_detail)로 옮긴다. 기존 값은 옮기지 않는다(받을 그룹이 아직 없다). 되돌리면 빈 값('{}')으로 다시 생긴다
 */
export class RoomSchema<ts> implements MigrationInterface {
    name = 'RoomSchema<ts>';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        // ── 손으로 더한 부분: 배타 제약(EXC_RoomGroupPlanPrice_…)의 varchar 같음(WITH =)을 gist 로 쓰는 확장. 적용 계정에 확장 생성 권한이 필요하다
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "btree_gist"`);
        // ── 여기부터 생성 그대로
        await queryRunner.query(`CREATE TABLE "t_room_state" ("room_state_id" character varying(20) NOT NULL, "room_state_name" character varying(50) NOT NULL, CONSTRAINT "PK_RoomState" PRIMARY KEY ("room_state_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_state" IS '호실 상태'`);
        await queryRunner.query(`CREATE TABLE "t_room_plan_type" ("room_plan_type_id" character varying(20) NOT NULL, "room_plan_type_name" character varying(50) NOT NULL, CONSTRAINT "PK_RoomPlanType" PRIMARY KEY ("room_plan_type_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_plan_type" IS '상품 종류'`);
        await queryRunner.query(`CREATE TABLE "t_room_plan" ("room_plan_id" character varying(32) NOT NULL, "is_used" smallint NOT NULL DEFAULT '1', "days_of_week" smallint NOT NULL DEFAULT '127', "usage_hours" smallint, "check_in_time" TIME, "check_out_time" TIME, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, "room_plan_type_id" character varying(20) NOT NULL, CONSTRAINT "UK_RoomPlan_StoreIdRoomPlanTypeId" UNIQUE ("store_id", "room_plan_type_id"), CONSTRAINT "CHK_RoomPlan_UsageHoursCheckInOutTime" CHECK (("room_plan_type_id" = 'HOURLY' AND "usage_hours" IS NOT NULL AND "check_in_time" IS NULL AND "check_out_time" IS NULL) OR ("room_plan_type_id" <> 'HOURLY' AND "usage_hours" IS NULL AND "check_in_time" IS NOT NULL AND "check_out_time" IS NOT NULL)), CONSTRAINT "PK_RoomPlan" PRIMARY KEY ("room_plan_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_plan" IS '업체 상품 설정'`);
        await queryRunner.query(`CREATE TABLE "t_room_group" ("room_group_id" character varying(32) NOT NULL, "room_group_name" character varying(100) NOT NULL, "description" text, "room_group_detail" jsonb NOT NULL DEFAULT '{}', "is_deleted" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "PK_RoomGroup" PRIMARY KEY ("room_group_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_RoomGroup_StoreIdRoomGroupName" ON "t_room_group" ("store_id", "room_group_name") WHERE "is_deleted" = 0`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group" IS '객실 그룹'`);
        await queryRunner.query(`CREATE TABLE "t_room_group_image" ("room_group_image_id" character varying(32) NOT NULL, "file_key" character varying(255) NOT NULL, "file_name" character varying(255) NOT NULL, "content_type" character varying(100) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "is_deleted" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "room_group_id" character varying(32) NOT NULL, CONSTRAINT "UK_RoomGroupImage_FileKey" UNIQUE ("file_key"), CONSTRAINT "PK_RoomGroupImage" PRIMARY KEY ("room_group_image_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`CREATE INDEX "IDX_RoomGroupImage_RoomGroupIdSortOrder" ON "t_room_group_image" ("room_group_id", "sort_order") `);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group_image" IS '객실 그룹 사진'`);
        await queryRunner.query(`CREATE TABLE "t_room" ("room_id" character varying(32) NOT NULL, "room_name" character varying(50) NOT NULL, "floor" smallint NOT NULL, "is_deleted" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, "room_group_id" character varying(32) NOT NULL, "room_state_id" character varying(20) NOT NULL, CONSTRAINT "PK_Room" PRIMARY KEY ("room_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`CREATE INDEX "IDX_Room_RoomGroupId" ON "t_room" ("room_group_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_Room_StoreIdFloor" ON "t_room" ("store_id", "floor") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_Room_StoreIdRoomName" ON "t_room" ("store_id", "room_name") WHERE "is_deleted" = 0`);
        await queryRunner.query(`COMMENT ON TABLE "t_room" IS '호실'`);
        await queryRunner.query(`CREATE TABLE "t_room_group_plan" ("room_group_plan_id" character varying(32) NOT NULL, "is_used" smallint NOT NULL DEFAULT '0', "price" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "room_group_id" character varying(32) NOT NULL, "room_plan_type_id" character varying(20) NOT NULL, CONSTRAINT "UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId" UNIQUE ("room_group_id", "room_plan_type_id"), CONSTRAINT "PK_RoomGroupPlan" PRIMARY KEY ("room_group_plan_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group_plan" IS '그룹 상품'`);
        await queryRunner.query(`CREATE TABLE "t_room_group_plan_price" ("room_group_plan_price_id" character varying(32) NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "price" integer NOT NULL, "memo" character varying(30), "is_deleted" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "room_group_plan_id" character varying(32) NOT NULL, CONSTRAINT "CHK_RoomGroupPlanPrice_StartDateEndDate" CHECK ("start_date" <= "end_date"), CONSTRAINT "EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange" EXCLUDE USING gist ("room_group_plan_id" WITH =, daterange("start_date", "end_date", '[]') WITH &&) WHERE ("is_deleted" = 0), CONSTRAINT "PK_RoomGroupPlanPrice" PRIMARY KEY ("room_group_plan_price_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`COMMENT ON TABLE "t_room_group_plan_price" IS '상품별 기간 가격'`);
        await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "store_detail"`);
        // ── 기존 store 테이블 소프트 삭제 — is_deleted 는 기본값 0 이라 기존 행에 그대로 채워진다(생성 그대로)
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "t_store_file" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        // ── 손으로 고친 부분: 기존 업체 정보 파일 행이 있어도 NOT NULL 로 추가되도록 임시 기본값 → 등록일로 채움 → 기본값 제거(엔티티에는 기본값이 없다 — 형제 1792682222497-LoginScopeStoreDetail.ts)
        await queryRunner.query(`ALTER TABLE "t_store_file" ADD "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`UPDATE "t_store_file" SET "updated_at" = "created_at"`);
        await queryRunner.query(`ALTER TABLE "t_store_file" ALTER COLUMN "updated_at" DROP DEFAULT`);
        // ── 여기까지 손으로 고친 부분
        await queryRunner.query(`ALTER TABLE "t_store_hour" DROP CONSTRAINT "UK_StoreHour_StoreIdDayOfWeek"`);
        await queryRunner.query(`ALTER TABLE "t_store_hour" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UK_StoreHour_StoreIdDayOfWeek" ON "t_store_hour" ("store_id", "day_of_week") WHERE "is_deleted" = 0`);
        await queryRunner.query(`ALTER TABLE "t_store_break" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "t_store_unavailable_period" ADD "is_deleted" smallint NOT NULL DEFAULT '0'`);
        // … 각 COMMENT ON COLUMN 은 생성 그대로
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD CONSTRAINT "FK_RoomPlan_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_plan" ADD CONSTRAINT "FK_RoomPlan_RoomPlanType" FOREIGN KEY ("room_plan_type_id") REFERENCES "t_room_plan_type"("room_plan_type_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_group" ADD CONSTRAINT "FK_RoomGroup_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_group_image" ADD CONSTRAINT "FK_RoomGroupImage_RoomGroup" FOREIGN KEY ("room_group_id") REFERENCES "t_room_group"("room_group_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room" ADD CONSTRAINT "FK_Room_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room" ADD CONSTRAINT "FK_Room_RoomGroup" FOREIGN KEY ("room_group_id") REFERENCES "t_room_group"("room_group_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room" ADD CONSTRAINT "FK_Room_RoomState" FOREIGN KEY ("room_state_id") REFERENCES "t_room_state"("room_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_group_plan" ADD CONSTRAINT "FK_RoomGroupPlan_RoomGroup" FOREIGN KEY ("room_group_id") REFERENCES "t_room_group"("room_group_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_group_plan" ADD CONSTRAINT "FK_RoomGroupPlan_RoomPlanType" FOREIGN KEY ("room_plan_type_id") REFERENCES "t_room_plan_type"("room_plan_type_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_room_group_plan_price" ADD CONSTRAINT "FK_RoomGroupPlanPrice_RoomGroupPlan" FOREIGN KEY ("room_group_plan_id") REFERENCES "t_room_group_plan"("room_group_plan_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        // ── 손으로 더한 부분: 기존 업체에도 업체 상품 설정 3행(입점 승인과 같은 기본값 — store.constants.ts STORE_PLAN_DEFAULTS).
        // 상품 종류 행이 먼저 있어야 FK 를 만족한다(seeder 는 PK 가 있으면 건너뛴다). PK 는 앱의 generateId() 와 같은 32자
        await queryRunner.query(`INSERT INTO "t_room_plan_type" ("room_plan_type_id", "room_plan_type_name") VALUES ('HOURLY', '시간 이용'), ('NIGHT', '1박'), ('LONG', '연박') ON CONFLICT DO NOTHING`);
        await queryRunner.query(
            `INSERT INTO "t_room_plan" ("room_plan_id", "store_id", "room_plan_type_id", "is_used", "days_of_week", "usage_hours", "check_in_time", "check_out_time", "created_at", "updated_at") ` +
                `SELECT replace(gen_random_uuid()::text, '-', ''), "s"."store_id", "p"."room_plan_type_id", 1, 127, "p"."usage_hours", "p"."check_in_time", "p"."check_out_time", now(), now() FROM "t_store" "s" ` +
                `CROSS JOIN (VALUES ('HOURLY', 3::smallint, NULL::time, NULL::time), ('NIGHT', NULL, TIME '22:00', TIME '09:00'), ('LONG', NULL, TIME '15:00', TIME '11:00')) AS "p" ("room_plan_type_id", "usage_hours", "check_in_time", "check_out_time")`,
        );
    }

    /**
     * 되돌리기 — 생성 그대로(FK → t_store.store_detail 되살림 → 인덱스 · 새 테이블 DROP — 업체 상품 설정 · 상품 종류 행은 테이블과 함께 사라진다).
     * btree_gist 확장은 지우지 않는다(남겨도 해가 없고, 예약 — Phase 16 — 도 쓴다).
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        // 생성기가 up 의 역순으로 쓴다
    }
}
```

생성 결과의 문장 순서 · 따옴표 표기는 생성기를 따른다. 확인할 것:
- 제약명이 `UK_*`(부분 유니크 인덱스 2개 · UK 3개 — `UK_RoomGroupImage_FileKey` · `UK_RoomPlan_StoreIdRoomPlanTypeId` · `UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId`) · `CHK_RoomPlan_UsageHoursCheckInOutTime` · `CHK_RoomGroupPlanPrice_StartDateEndDate` · `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange` · `FK_*` 10개 · `IDX_*` 3개 그대로인지. 단일 컬럼 `@Unique`(`UK_RoomGroupImage_FileKey`)가 `UQ_<해시>` 로 바뀌지 않았는지(data-layer 규칙).
- 배타 제약은 프로젝트 첫 사례다. TypeORM 스키마 비교가 배타 제약을 이름으로 맞추므로 `db:check` 가 통과해야 한다. 식을 바꿀 때는 이름도 바꾼다.
- 부분 유니크 인덱스의 `WHERE "is_deleted" = 0` 가 생성 SQL 에 그대로 있는지.
- `t_store` 의 `DROP COLUMN "store_detail"` 이 있고, down 이 `ADD "store_detail" jsonb NOT NULL DEFAULT '{}'` + 원래 COMMENT(`업체 상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다)`)로 되살리는지.
- down 은 생성 그대로 두되, 앞선 생성기 버릇(되돌리기의 인덱스 컬럼 순서 · 빠진 COMMENT · DROP 직전의 불필요한 COMMENT)을 확인해 고친다. 확장은 down 에 넣지 않는다.
- PGlite 로 직전 마이그레이션까지 적용 + 업체 행 2개를 넣은 뒤 RoomSchema 를 적용 → 업체마다 업체 상품 설정 3행(기본값 · PK 32자) · `store_detail` 이 사라지는지 · 객실 그룹을 `'{}'` · `'{"has_tv": 0}'` 로 넣고 TypeORM `find` 로 읽으면 `{room_count: 1, has_shower: 1, has_tv: 1 | 0, has_pc: 1}` 로 채워지는지(@AfterLoad) · CHECK 가 시간 이용에 입실 시각을 넣는 행 / 1박에 이용 시간을 넣는 행을 거부하는지 · 같은 상품의 겹치는 기간 insert 가 23P01 로 거부되는지 · 맞닿는 기간(8/20 끝 → 8/21 시작)은 들어가는지 · 삭제 표시(is_deleted = 1)한 기간과 겹치는 기간은 들어가는지(배타 제약 WHERE) · down → 다시 up 이 되는지를 scratch 스크립트로 확인한다(사용자 DB 는 건드리지 않는다).

### Business Logic — 입점 승인의 업체 상품 설정 3행

형제: 리비전 261029-1 의 기본값 상수(store.constants.ts:61-64)와 입점 승인이 업체를 넣는 4단계(store.service.ts:440-465). 다른 도메인 테이블 쓰기는 store 어휘의 repository 메서드 — 형제 `insertHeadManager`(store.repository.ts:481), 배열 insert 형제 `insertStoreHours`(store.repository.ts:596).

```ts
// apps/admin-service/src/store/store.constants.ts — modified
// 1행 `import type {StoreDetail} from '@app/database/entities/store/store.entity.js';` → 아래로 바꾼다
import type {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';

// 삭제: 42-43행 STORE_DETAIL_KEYS (편의시설은 객실 그룹으로 옮겼다)

// STORE_REFUND_DEADLINE_HOURS_DEFAULT 뒤에 추가
/** 업체 상품 설정 예약 가능 요일 기본값 — 매일(비트 — 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64) */
export const STORE_PLAN_DAYS_OF_WEEK_ALL = 127;

/** 업체 상품 설정 기본값 — 입점 승인 때 상품 종류(t_room_plan_type)마다 1행, 판매 · 매일. 기존 업체는 마이그레이션 RoomSchema 가 같은 값을 넣는다 */
export const STORE_PLAN_DEFAULTS: Pick<RoomPlanEntity, 'room_plan_type_id' | 'usage_hours' | 'check_in_time' | 'check_out_time'>[] = [
    {room_plan_type_id: 'HOURLY', usage_hours: 3, check_in_time: null, check_out_time: null},
    {room_plan_type_id: 'NIGHT', usage_hours: null, check_in_time: '22:00', check_out_time: '09:00'},
    {room_plan_type_id: 'LONG', usage_hours: null, check_in_time: '15:00', check_out_time: '11:00'},
];
```

```ts
// apps/admin-service/src/store/interfaces/store.repository.interface.ts — modified (insertStore 뒤)
import type {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';
    /** 업체 상품 설정 등록 — 입점 승인 때 상품 종류마다 1행 */
    insertStorePlans(entities: RoomPlanEntity[]): Promise<void>;
```

```ts
// apps/admin-service/src/store/repositories/store.repository.ts — modified
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';

    /** 업체 상품 설정 — 입점 승인 때 상품 종류마다 1행 */
    private get roomPlans(): Repository<RoomPlanEntity> {
        return this.txHost.tx.getRepository(RoomPlanEntity);
    }

    // insertStore 뒤
    /**
     * 업체 상품 설정 등록 — 입점 승인 때 상품 종류마다 1행. 방금 만든 업체라 UK · CHECK 위반이 없으므로 위반은 통일 500
     *
     * @param entities new RoomPlanEntity() + 할당 (상품 종류마다 1개)
     */
    async insertStorePlans(entities: RoomPlanEntity[]): Promise<void> {
        try {
            await this.roomPlans.insert(entities);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
```

```ts
// apps/admin-service/src/store/store.service.ts — modified (approveApplication — 4단계 뒤에 5단계를 넣고 이후 번호를 하나씩 민다, import 에 RoomPlanEntity · STORE_PLAN_DEFAULTS · STORE_PLAN_DAYS_OF_WEEK_ALL 추가, buildStoreDetail 삭제)
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';

        // 4. 업체 등록 — 활성 + 영업준비(is_open = 0) + 업체코드(매니저 로그인 · 매니저 화면 주소)
        // … (기존 그대로 — 단 `store.store_detail = {};` 한 줄은 지운다: 컬럼이 없어졌다)
        store.introduction = null;
        store.is_always_open = 0;
        // …
        await this.storeRepository.insertStore(store);

        // 5. 업체 상품 설정 — 상품 종류마다 1행(판매 · 매일 · 기본 이용 시간 · 입실 · 퇴실 시각)
        const plans = STORE_PLAN_DEFAULTS.map((defaults) => {
            const plan = new RoomPlanEntity();
            plan.room_plan_id = generateId();
            plan.store_id = store_id;
            plan.room_plan_type_id = defaults.room_plan_type_id;
            plan.is_used = 1;
            plan.days_of_week = STORE_PLAN_DAYS_OF_WEEK_ALL;
            plan.usage_hours = defaults.usage_hours;
            plan.check_in_time = defaults.check_in_time;
            plan.check_out_time = defaults.check_out_time;
            return plan;
        });
        await this.storeRepository.insertStorePlans(plans);

        // 6. 신청의 업체 정보 파일을 업체로 (같은 행에 store_id — 파일을 옮기지 않는다)
        // 7. 업체 총관리자 계정 …   8. 신청 승인 …   9. 승인 알림 SMS (마지막 …) — 번호만 바뀐다
```

메서드 JSDoc 의 단계 설명이 있으면 업체 상품 설정 한 줄을 더한다. 업체 상품 설정 조회 · 변경 API 와 응답 필드는 Phase 13 에서 더한다.

### Business Logic — 업체 편의시설 제거 (객실 그룹으로 이동)

형제 근거: 지금 내 업체 소개 수정(store.service.ts:684-700)은 소개 · 연락처 · 편의시설을 한 번에 바꾼다. 편의시설을 빼면 소개 · 연락처만 남는다 — 같은 메서드 · 같은 명령(`admin.store.mine-profile`) · 같은 잠금(`findStoreByManager(user_id, true)`)을 그대로 쓴다.

```ts
// libs/contracts/src/store/dto/store-mine-profile.dto.ts — modified (전체)
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 내 업체 소개 수정 — 소개 · 연락처. 상호명 · 주소 · 위경도 · 사업자등록번호는 총관리자가 바꾼다. 소개는 비우면 null.
 * 편의시설은 객실 그룹 상세정보(t_room_group.room_group_detail)로 옮겼다.
 */
export class StoreMineProfileDto {
    @ApiProperty({description: '업체 소개 (2,000자)', required: false})
    @IsOptional()
    @MaxLength(2000, {message: '업체 소개는 2,000자 이내로 입력해주세요.'})
    introduction?: string;

    @ApiProperty({description: '업체 연락처 (숫자만)'})
    @Matches(/^\d{8,11}$/, {message: '업체 연락처를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '업체 연락처를 입력해주세요.'})
    phone: string;
}
```

```ts
// libs/contracts/src/store/dto/store-detail.dto.ts — modified (StoreDetailResultDto, introduction 다음 — 삭제)
    @ApiProperty({description: '업체 상세정보 (room_count · has_shower · has_tv · has_pc)', type: Object})
    store_detail: Record<string, number>;

// libs/contracts/src/store/dto/store-mine.dto.ts — modified (StoreMineResultDto, introduction 다음 — 삭제)
    @ApiProperty({description: '편의시설 (room_count · has_shower · has_tv · has_pc — 없는 항목은 빠진다)', type: Object})
    store_detail: Record<string, number>;
```

```ts
// libs/contracts/src/store/store.commands.ts — modified (주석)
    /** 내 업체 소개 · 연락처 수정 (업체 관리자) */
    MINE_PROFILE: 'admin.store.mine-profile',

// apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts — modified (JSDoc)
    /**
     * 내 업체 소개 수정 (업체 관리자) — 소개 · 연락처. done 의 data 는 null.
     */
```

```ts
// apps/admin-service/src/store/store.util.ts — modified
// import: StoreMineProfileDetailDto import 줄 삭제, `import type {StoreDetail, StoreEntity}` → `import type {StoreEntity}`,
//         `import {STORE_DETAIL_KEYS, STORE_FILE_EXTENSION, STORE_FILE_PURPOSE}` → `import {STORE_FILE_EXTENSION, STORE_FILE_PURPOSE}`
// 삭제: buildStoreDetail 함수 전체(store.util.ts:191-206)
// toStoreDetail · toMineDetail — introduction 다음의 `store_detail: {...entity.store_detail},` 한 줄 삭제
        introduction: entity.introduction ?? null,
        is_always_open: entity.is_always_open,
```

```ts
// apps/admin-service/src/store/store.service.ts — modified (updateMyStoreProfile)
    /**
     * 내 업체 소개 수정 (업체 관리자) — 소개 · 연락처. (RabbitMQ: admin.store.mine-profile)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 소개 · 연락처
     */
    @Transactional()
    async updateMyStoreProfile(user_id: string, dto: StoreMineProfileDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.introduction = dto.introduction ?? null;
        storeEntity.phone = dto.phone;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }
```

### Tests — 기존 spec

```ts
// apps/admin-service/src/store/test/store.test-helper.ts — modified
// createStoreRepositoryMock — insertStore 뒤
        insertStore: vi.fn(),
        insertStorePlans: vi.fn(),
// storeRow — `store_detail: {},` 줄 삭제
        introduction: null,
        is_always_open: 0,
```

입점 승인 spec — 업체 상품 설정 3행(엔티티 · 새 업체 · 기본값)을 단언하고, 업체를 넣기 전에 끝나는 실패에서는 넣지 않는다.

```ts
// apps/admin-service/src/store/test/store-application-approve.spec.ts — modified
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';

    describe('[SUCCESS]', () => {
        it('업체(활성 · 영업준비 · 업체코드) → 업체 상품 설정 3행 → 파일을 업체로 → 업체 총관리자(신청 때 정한 아이디 · 비밀번호) → 신청 승인(대기 조건) → 승인 알림 SMS(마지막)', async () => {
            // … (기존 그대로)
            expect(store).toMatchObject({
                // … `store_detail: {},` 한 줄 삭제
                introduction: null,
                is_always_open: 0,
                // …
            });
            expect(store).not.toHaveProperty('store_detail');

            // 업체 상품 설정 — 새 업체에 상품 종류마다 1행(판매 · 매일 · 기본 이용 시간 · 입실 · 퇴실 시각)
            expect(repo.insertStorePlans).toHaveBeenCalledTimes(1);
            const plans = repo.insertStorePlans.mock.calls[0][0] as RoomPlanEntity[];
            expect(plans).toHaveLength(3);
            for (const plan of plans) {
                expect(plan).toBeInstanceOf(RoomPlanEntity);
                expect(plan.room_plan_id).toMatch(/^[a-f0-9]{32}$/);
                expect(plan).toMatchObject({store_id: store.store_id, is_used: 1, days_of_week: 127});
            }
            expect(plans.map(({room_plan_type_id, usage_hours, check_in_time, check_out_time}) => ({room_plan_type_id, usage_hours, check_in_time, check_out_time}))).toEqual([
                {room_plan_type_id: 'HOURLY', usage_hours: 3, check_in_time: null, check_out_time: null},
                {room_plan_type_id: 'NIGHT', usage_hours: null, check_in_time: '22:00', check_out_time: '09:00'},
                {room_plan_type_id: 'LONG', usage_hours: null, check_in_time: '15:00', check_out_time: '11:00'},
            ]);
            // … (파일 → 업체 · 업체 총관리자 · 승인 · SMS 그대로)
        });
    });

    describe('[FAIL:service]', () => {
        it('신청이 없으면 failed 404, 업체 등록 없음', async () => {
            // … (기존 그대로)
            expect(repo.insertStore).not.toHaveBeenCalled();
            expect(repo.insertStorePlans).not.toHaveBeenCalled();
        });
        // 137행 케이스(업체 등록 없음)도 같은 미호출 한 줄을 더한다

        it('사업자번호 UK 충돌(repository 400)은 그대로 failed 400, 업체 상품 설정 · 파일 · 계정 처리 없음', async () => {
            // … (기존 그대로)
            expect(repo.insertStorePlans).not.toHaveBeenCalled();
            expect(repo.assignStoreFiles).not.toHaveBeenCalled();
            expect(repo.insertHeadManager).not.toHaveBeenCalled();
        });
    });
```

repository spec — `insertStorePlans` 를 배열 insert · 통일 500 표에 더하고, `STORE_SELECT` 에서 `store_detail` 을 뺀다.

```ts
// apps/admin-service/src/store/test/store.repository.spec.ts — modified
import {RoomPlanEntity} from '@app/database/entities/room/room-plan.entity.js';

// makeRepository — repos 에 [RoomPlanEntity, fake()], 반환에 roomPlan: repos.get(RoomPlanEntity)!

    it('insertStoreHours · insertStoreBreaks · insertStorePlans 는 받은 엔티티 배열을 한 번에 insert 한다', async () => {
        const {repository, hour, break: breaks, roomPlan} = makeRepository();
        const hours = [new StoreHourEntity(), new StoreHourEntity()];
        const items = [new StoreBreakEntity()];
        const plans = [new RoomPlanEntity(), new RoomPlanEntity(), new RoomPlanEntity()];

        await repository.insertStoreHours(hours);
        await repository.insertStoreBreaks(items);
        await repository.insertStorePlans(plans);

        expect(hour.insert).toHaveBeenCalledWith(hours);
        expect(breaks.insert).toHaveBeenCalledWith(items);
        expect(roomPlan.insert).toHaveBeenCalledWith(plans);
    });

    // '%s 실패는 통일 500' 표 — insertStore 뒤에 한 줄
        ['insertStorePlans', 'roomPlan', 'insert'],

    // STORE_SELECT — "s"."store_detail" AS "s_store_detail", 가 빠진다(나머지 그대로 — 최종 문자열은 build 때 dist 로 뽑은 실제 SQL)
        '"s"."longitude" AS "s_longitude", "s"."introduction" AS "s_introduction", "s"."is_always_open" AS "s_is_always_open", ' +
```

내 업체 소개 수정 spec — 편의시설 케이스(아는 항목만 남김 · `{}` 이면 지움 · 중첩 점 경로 2건)를 지우고, 예전 클라이언트가 `store_detail` 을 보내도 소개 · 연락처만 바뀌는지 단언한다.

```ts
// apps/admin-service/src/store/test/store-mine-profile.spec.ts — modified (전체)
import type {TestingModule} from '@nestjs/testing';
import {StoreMineProfileDto} from '@app/contracts/store/dto/store-mine-profile.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {bootCommandPath, createStoreRepositoryMock, MANAGER_ACTOR, runCommand, STORE_ID, StoreRepositoryMock, storeRow, validateBody} from './store.test-helper.js';

describe('admin.store.mine-profile — 내 업체 소개 수정 (큐 경로)', () => {
    let repo: StoreRepositoryMock;
    let dispatcher: CommandDispatcher;
    let module: TestingModule;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        ({dispatcher, module} = await bootCommandPath(repo));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await module.close();
    });

    describe('[SUCCESS]', () => {
        it('업체 행을 잠가 찾고 소개 · 연락처만 바꾼다', async () => {
            const payload = {introduction: '깨끗한 룸입니다.', phone: '0298765432'};

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, true);
            expect(repo.updateStore).toHaveBeenCalledTimes(1);
            const [where, entity] = repo.updateStore.mock.calls[0] as [unknown, StoreEntity];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity.introduction).toBe('깨끗한 룸입니다.');
            expect(entity.phone).toBe('0298765432');
            expect(entity.store_name).toBeUndefined();
            expect(entity.business_number).toBeUndefined();
        });

        it('소개를 빼면 null', async () => {
            await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload: {phone: '0298765432'}, actor: MANAGER_ACTOR});

            const entity = repo.updateStore.mock.calls[0][1] as StoreEntity;
            expect(entity.introduction).toBeNull();
        });

        it('예전 클라이언트가 편의시설(store_detail)을 보내도 소개 · 연락처만 바꾼다 — 편의시설은 객실 그룹으로 옮겼다', async () => {
            const payload = {phone: '0298765432', store_detail: {room_count: 3, has_tv: 1}};

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload, actor: MANAGER_ACTOR});

            expect(result).toEqual({result: null, error: null});
            const entity = repo.updateStore.mock.calls[0][1] as StoreEntity;
            expect(entity).not.toHaveProperty('store_detail');
            expect(Object.keys(entity).sort()).toEqual(['introduction', 'phone']);
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 failed 404, 수정 없음', async () => {
            repo.findStoreByManager.mockResolvedValueOnce(null);

            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload: {phone: '0298765432'}, actor: MANAGER_ACTOR});

            expect(result?.error).toEqual({status_code: 404, body: {message: '소속 업체를 찾을 수 없습니다.', validation_errors: null}});
            expect(repo.updateStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] 게이트웨이 ValidationPipe', () => {
        it('연락처가 숫자 8 ~ 11자리가 아니면 → phone', async () => {
            const body = await validateBody(StoreMineProfileDto, {phone: '02-123-4567'});

            expect(body).toEqual({message: '업체 연락처를 숫자만 정확히 입력해주세요.', validation_errors: [{property: 'phone', message: '업체 연락처를 숫자만 정확히 입력해주세요.'}]});
        });

        it('정상 본문은 통과한다', async () => {
            await expect(validateBody(StoreMineProfileDto, {introduction: '소개', phone: '0212345678'})).resolves.toBeNull();
        });
    });

    describe('[SECURITY]', () => {
        it('actor 없는 명령은 failed 401, 업체 조회 없음', async () => {
            const {result} = await runCommand(dispatcher, {type: STORE_COMMAND.MINE_PROFILE, payload: {phone: '0298765432'}, actor: null});

            expect(result?.error?.status_code).toBe(401);
            expect(repo.findStoreByManager).not.toHaveBeenCalled();
        });
    });
});
```

관리자 업체 상세 · 내 업체 상세 spec — 업체 행의 `store_detail` 덮어쓰기와 응답 기대값을 지우고, 응답에 그 필드가 없음을 단언한다.

```ts
// apps/admin-service/src/store/test/store-detail.spec.ts — modified ([SUCCESS])
            repo.findStore.mockResolvedValueOnce(storeRow());
            // … (파일 행 · 요청 그대로)
            expect(res.body).toMatchObject({
                store_id: STORE_ID,
                store_code: STORE_CODE,
                store_state_id: 'ACTIVE',
                introduction: null,
                is_always_open: 0,
                // … (그대로)
            });
            expect(res.body).not.toHaveProperty('store_detail');

// apps/admin-service/src/store/test/store-mine.spec.ts — modified (storeRow 덮어쓰기 · [SUCCESS] 기대값에서 store_detail 삭제)
            storeRow({
                introduction: '소개',
                is_open: 1,
                // …
            }),
            // … [SUCCESS] 응답 단언
                introduction: '소개',
                is_always_open: 0,
                // …
            expect(result).not.toHaveProperty('store_detail');
```

### 규약 문서

```md
<!-- docs/data-layer.md:10-12 — 엔티티 트리 -->
│   ├── user/        auth · state · sns · sms-purpose(룩업) · user · user-setting · session · session-refresh · sms-verification
│   ├── store/       store-state · store-application-state · store-file-purpose(룩업) · store · store-application · store-file · store-hour · store-break · store-unavailable-period
│   ├── room/        room-state · room-plan-type(룩업) · room-plan · room-group · room-group-image · room · room-group-plan · room-group-plan-price
│   └── api-log/     api-log

<!-- docs/data-layer.md:68 — 제약명 PascalCase 목록, CHK_ 뒤에 추가 -->
· `EXC_<Model>_<내용>`(`@Exclusion('EXC_…', 'USING gist (…)')` — 범위 겹침을 DB 가 막을 때. 예: `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange` 같은 상품의 기간 겹침 — room-group-plan-price.entity.ts. PostgreSQL 확장 `btree_gist` 가 필요하고(마이그레이션이 `CREATE EXTENSION IF NOT EXISTS "btree_gist"` — 적용 계정 권한), 위반은 오류 코드 23P01 · 제약명. 스키마 비교가 이름으로 맞추므로 식을 바꾸면 이름도 바꾼다)

<!-- docs/data-layer.md:72 — 타입 -->
- **타입** — 문자열 `length: n`(nullable 이면 `type: 'varchar'` 명시), 긴 문자열 `text`, 시각 `timestamptz`, 하루 안 시각 `time`, 날짜 `date`, 좌표 `double precision`, 금액 `integer`(원), 플래그 `smallint`(0/1), 자동 증가 `bigint` + `@PrimaryGeneratedColumn`(값은 문자열로 온다), JSON `jsonb`.

<!-- docs/data-layer.md:76 뒤 — 일시 범위 다음에 추가 -->
  - **날짜 범위는 `date` 두 개** — 상품별 기간 가격 `t_room_group_plan_price.start_date` · `end_date`(한국 날짜, 둘 다 포함, CHECK `start_date <= end_date`). 값은 문자열 `'YYYY-MM-DD'` 로 온다(TypeORM 이 `date` 를 문자열로 바꾼다) — 엔티티 타입 `string`. 겹침은 배타 제약 `daterange(start_date, end_date, '[]')` + service 검사 둘 다(사용자 결정 2026-10-30).
  - **요일 비트는 `smallint`** — 일 ~ 토 가능 여부를 비트로(비트 = `1 << day_of_week`, `day_of_week` 는 0: 일 ~ 6: 토 — dayjs `day()` · `t_store_hour`). 일 1 · 월 2 · 화 4 · 수 8 · 목 16 · 금 32 · 토 64, 매일 127. 예: `t_room_plan.days_of_week`.

<!-- docs/data-layer.md:78 — jsonb 예를 바꾼다 -->
  - **jsonb** 는 항목이 자주 바뀌는 상세정보에 쓴다 — 컬럼 하나 + 같은 엔티티 파일의 TS 인터페이스(항목 타입 — 플래그는 `0 | 1`) + **기본값 상수**, `nullable: false` + `default: () => "'{}'"`. 조회 뒤 엔티티의 `@AfterLoad` 훅(`fillDetailDefaults()`)이 `{...기본값, ...저장된 값}` 으로 저장된 JSON 에 없는 항목을 채운다 — 그래서 인터페이스 항목은 조회 뒤 값 기준으로 모두 필수다. 항목을 더할 때는 인터페이스 · 기본값만 고치고, 기존 행을 고치는 마이그레이션이 없다(기존 행은 새 항목이 기본값으로 보인다). 엔티티로 읽지 않는 조회(raw select)는 같은 상수로 채운다. 예: `t_room_group.room_group_detail: RoomGroupDetail` · `ROOM_GROUP_DETAIL_DEFAULTS`(객실 그룹 = 객실 유형별 상세정보 — `room_count` 객실 안의 방 개수 · `has_shower` · `has_tv` · `has_pc` — room-group.entity.ts. 업체의 `t_store.store_detail` 에서 옮겼다 — 사용자 결정 2026-10-31). 로그 원본(`t_api_log` 요청 · 응답 본문)처럼 항목이 정해지지 않은 jsonb 는 대상이 아니다.
  - **종류마다 반복되는 설정은 (주체 × 종류) 1행 테이블** — `<종류>_<설정>` 컬럼(`day_use_hours` · `night_stay_check_in_time` …)을 늘어놓지 않는다. 종류는 룩업 FK, 컬럼은 종류와 무관한 이름이고, 종류별로 쓰지 않는 컬럼은 NULL + CHECK 로 조합을 막는다. 예: 업체 상품 설정 `t_room_plan`(업체 × 상품 종류, 업체마다 종류별 반드시 1행 — 입점 승인 · 마이그레이션이 넣는다, CHECK `CHK_RoomPlan_UsageHoursCheckInOutTime`) — 사용자 결정 2026-10-31.

<!-- docs/data-layer.md:81 — 룩업 -->
- **룩업 엔티티**(auth · state · sns · sms-purpose · store-state · store-application-state · store-file-purpose · room-state · room-plan-type)는 구조 컬럼 + 그 값으로 동작이 갈리는 플래그만 둔다 — …

<!-- docs/data-layer.md:152-158 — 컬럼 이름 -->
- 날짜는 `<명사>_date` 다 — 범위 `start_date` · `end_date`(상품별 기간 가격).
- 기간 설정값은 단위를 이름 끝에 붙인 정수다 — `maintenance_minutes`(분) · `booking_open_hours` · `refund_deadline_hours` · `usage_hours`(시간). …
- 요일 비트는 `days_of_week` 다(`t_room_plan`).
- **삭제는 항상 소프트 삭제** — 행을 지우는 동작은 `is_deleted`(smallint 0/1, 기본 0)를 1 로 바꾸고 행을 남긴다(`DELETE` ❌). 조회 · 개수 · 겹침 검사는 `is_deleted = 0` 만 본다. 통째로 교체도 기존 행을 삭제 표시한 뒤 새 행을 넣는다. 룩업과 종류마다 반드시 있어야 하는 행(업체 상품 설정 `t_room_plan` · 그룹 상품 `t_room_group_plan`)은 지우지 않고 사용 여부 `is_used` 0/1 로 판매 여부를 바꾼다(사용자 규칙 2026-10-31).
  - **DB 데이터만 소프트 삭제** — 파일을 지울 때 S3 객체는 실제로 지우고(`storageGateway.remove`), DB 행만 `is_deleted = 1` 로 바꾼다.
  - **`is_deleted = 0` 은 repository 가 항상 붙인다** — 조회 · 개수 · 수정 메서드는 받은 조건을 `notDeleted(where)`(libs/database/src/soft-delete.ts — 배열 OR 조건이면 각 조건에)로 감싸고, QueryBuilder 빌더는 `"<별칭>"."is_deleted" = 0` 을 더한다(조인한 `is_deleted` 테이블 포함). service 는 조건에 `is_deleted` 를 넣지 않는다 — "WHERE 는 service 가 만들고 repository 는 실행만" 의 예외다(삭제 조건이 빠지는 일을 구조로 막는다). 삭제 메서드는 `update(notDeleted(where), is_deleted = 1 인 엔티티)` — 훅이 수정일을 채운다. 상태 조건을 건 삭제는 `affected === 1` 을 돌려준다.
  - 지우는 동작이 있는 테이블에만 `is_deleted` 를 둔다 — 지우지 않는 테이블(t_user — 탈퇴는 상태 + 정보 가리기, 세션 갱신 · SMS 기록 · 룩업 · API 로그)은 그대로.
- **유일성 · 배타 제약은 지워지지 않은 행끼리** — 부분 유니크 인덱스 `WHERE "is_deleted" = 0`(지운 행의 이름을 다시 쓸 수 있다) · 배타 제약 `… WHERE ("is_deleted" = 0)`. 예: `UK_Room_StoreIdRoomName` · `UK_RoomGroup_StoreIdRoomGroupName` · `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange`(room 엔티티). 지우지 않는 행의 유일성은 일반 UK 다(`UK_RoomPlan_StoreIdRoomPlanTypeId` · `UK_RoomGroupPlan_RoomGroupIdRoomPlanTypeId`). 다시 쓰지 않는 값(업로드마다 새로 만드는 저장 키 `UK_RoomGroupImage_FileKey`)은 전체 행에 건다.

<!-- docs/data-layer.md:88 — 마이그레이션 생성 절에 한 줄 -->
   PGlite 는 `btree_gist` 확장을 실어 띄운다(배타 제약 — scripts/db-schema.mjs). 새 PostgreSQL 확장을 쓰면 PGlite contrib 모듈도 함께 싣는다.
```

```md
<!-- docs/conventions.md:97 — 중첩 예에서 편의시설 삭제 -->
… · 중첩 `@ValidateNested({each: true})` + `@Type(() => 항목 DTO)`(영업시간 · 브레이크타임 — store-mine-hours.dto.ts · store-mine-breaks.dto.ts, 사용자 결정 2026-10-27).

<!-- docs/conventions.md:99 — 점 경로 예 -->
… 제약이 걸린 오류마다 1건(`hours.0.open_time`)을 담는다. …

<!-- docs/conventions.md — "## 파일 · 클래스 명명" 절 끝에 추가 -->
- **이름은 뜻이 바로 드러나는 말로** — 룩업 이름 · 주석 · 사용자 노출 문구에 영어를 한글로 옮겨 적은 말(데이유즈 · 나이트 · 롱스테이)을 쓰지 않는다. 우리말로 뜻을 쓴다(상품 종류 `t_room_plan_type` — 시간 이용 · 1박 · 연박). 코드 ID 는 뜻이 드러나는 영어 대문자다(`HOURLY` · `NIGHT` · `LONG`) — 사용자 결정 2026-10-31.
```

```md
<!-- AGENTS.md — Validation 줄(107) — 중첩 예 -->
· 중첩 `@ValidateNested({each})` + `@Type(() => 항목 DTO)`(store `/mine` 영업시간 · 브레이크타임 · 사진 순서 — 사용자 결정 2026-10-27)

<!-- AGENTS.md — Conventions 의 파일명 줄 뒤에 한 줄 -->
- **이름은 뜻이 드러나는 말**: 룩업 이름 · 주석 · 사용자 노출 문구에 음역(데이유즈 · 나이트)을 쓰지 않고 우리말(시간 이용 · 1박 · 연박), 코드 ID 는 뜻이 드러나는 영어 대문자(`HOURLY` · `NIGHT` · `LONG`).

<!-- AGENTS.md — Data Layer 엔티티 줄(141) -->
`@Check(…)` 뒤 · `@Exclusion('EXC_<Model>_<내용>', 'USING gist (…)')`(범위 겹침 — `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange`, `btree_gist` 확장 · 23P01)
"좌표 `double precision`" 뒤 · 날짜 `date`(문자열 `'YYYY-MM-DD'`) · 금액 `integer`(원) · 요일 비트 `smallint`(`1 << day_of_week`, 매일 127)
jsonb 예 `t_store.store_detail` · `StoreDetail` → `t_room_group.room_group_detail` · `RoomGroupDetail` + 기본값 상수(`ROOM_GROUP_DETAIL_DEFAULTS`) — 조회 뒤 `@AfterLoad` 가 빈 항목을 기본값으로 채운다(항목을 더해도 기존 행 마이그레이션 없음, raw select 는 같은 상수로)
"타임스탬프 `@BeforeInsert`/`@BeforeUpdate` 훅" 뒤 · jsonb 상세정보 기본값 `@AfterLoad` 훅 `fillDetailDefaults()`
끝에 · 종류마다 반복되는 설정은 `<종류>_<설정>` 컬럼 대신 (주체 × 종류) 1행 테이블 + 종류별 컬럼 조합 CHECK(`t_room_plan` — 업체마다 상품 종류별 반드시 1행)

<!-- AGENTS.md — Data Layer 컬럼 이름 줄(142), "범위 `starts_at` · `ends_at` — 일시 예약불가)" 뒤 -->
, 날짜 범위 `start_date` · `end_date`, 요일 비트 `days_of_week`. **삭제는 항상 소프트 삭제**(`is_deleted` — `DELETE` ❌, 교체도 삭제 표시 후 insert, 조회 · 겹침은 `is_deleted = 0`), 유일성 · 배타 제약은 지워지지 않은 행끼리(부분 유니크 인덱스 · 배타 제약 `WHERE "is_deleted" = 0`)
```

```md
<!-- README.md:8 — admin-service 설명의 내 업체 설정 -->
… 업체 관리자의 내 업체 설정(상세 · 소개 · 사진과 순서 · 요일별 영업시간 · 매일 브레이크타임 · 정비시간 · 영업중 여부 · 예…

<!-- README.md:28 — 마이그레이션 줄 뒤 -->
- 마이그레이션은 PostgreSQL 확장 `btree_gist`(기간 겹침 배타 제약)를 만든다 — 적용 계정에 확장 생성 권한이 필요하다(RDS PostgreSQL 13+ 는 DB 의 CREATE 권한).
```

```md
<!-- .beaver/output/spec/platform/cache-spec.md:82 — 무효화 지점 표 -->
| 내 업체 소개 수정(`updateMyStoreProfile`) | admin-service store (Phase 11) | 소개 · 연락처 | Phase 11 |
<!-- 입점 승인 행이 있으면 바뀌는 것에 "업체 상품 설정 3행" 을 더한다 -->
```

---

## Test Cases

```
[CASES]              해당 없음 — 계산형 유닛 없음(요일 비트 판정 · 기간 가격 계산은 Phase 17 #67)
[FAIL:validation]    store-mine-profile.spec.ts — 연락처 형식 오류 → phone(대표 1건) · 정상 본문 통과. 편의시설 중첩 검증 2건은 DTO 와 함께 지운다
[SUCCESS]            store-application-approve.spec.ts — 업체 상품 설정 3행: insertStorePlans 1회, RoomPlanEntity × 3(toBeInstanceOf · PK 32자 · 새 업체 store_id · 판매 1 · 매일 127), 종류별 HOURLY 3시간 / NIGHT '22:00'~'09:00' / LONG '15:00'~'11:00', 업체 엔티티에 store_detail 없음
[SUCCESS]            store-mine-profile.spec.ts — 소개 · 연락처만 바꾼다(잠금 인자 · 바꾼 필드만), 소개를 빼면 null, 예전 클라이언트가 store_detail 을 보내도 엔티티 키는 introduction · phone 뿐
[SUCCESS]            store-detail.spec.ts · store-mine.spec.ts — 응답에 store_detail 이 없다
[FAIL:service]       store-application-approve.spec.ts — 신청 없음 404 · 업체 등록 전 실패 · 사업자번호 UK 400 에서 insertStorePlans 미호출
[FAIL:repository]    store.repository.spec.ts — insertStorePlans 실패는 통일 500(표에 한 줄), 통일 500 표의 삭제 6개 항목은 fake 메서드 delete → update
[SUCCESS]            repository spec 5개(소프트 삭제) — is_deleted 테이블의 find · findOne · count · update 가 받은 조건에 is_deleted: 0 을 더해 부른다(배열 OR 조건은 조건마다), 삭제 메서드는 delete 를 부르지 않고 update(조건 + is_deleted: 0, is_deleted = 1 인 엔티티 — toBeInstanceOf) 를 부른다, 상태 조건 삭제는 affected 1 → true · 0 → false
[SMOKE:data-access]  store.repository.spec.ts — insertStorePlans 는 받은 엔티티 배열을 한 번에 insert, STORE_SELECT 스냅샷에서 store_detail 삭제(업체 목록 · 매니저 소속 업체 Smoke 의 실제 SQL)
[SMOKE:data-access]  repository spec 5개(소프트 삭제) — QueryBuilder 빌더(신청 목록 · 파일 행 · 업체 목록 · 소속 업체 조인 · 영업시간 · 브레이크타임 · 일시 예약불가 목록 · 신청 파일 삭제(Update 로 바뀜) · 업체 지정 · 로그인 회원 조회 중 is_deleted 테이블을 읽는 것)의 SQL 에 "<별칭>"."is_deleted" = 0 이 들어간다 — 스냅샷은 build 때 dist 로 뽑은 실제 SQL

테스트 생략(위임형):
  room 엔티티 · 시드 · 마이그레이션 — spec 은 service 기능 · repository 두 종류만 둔다(docs/testing.md). room 도메인은 아직 둘 다 없다.
  스키마 일치는 `npm run db:check`(엔티티 = 마이그레이션 — 부분 유니크 · UK · CHECK 2 · 배타 제약 포함), 타입은 `npm run typecheck`, 빌드는 `npm run build` 로 확인한다.
  기존 업체 3행 · CHECK · 배타 제약 · 상세정보 기본값 채움(@AfterLoad) · down/up 은 build 때 PGlite scratch 스크립트로 한 번 확인한다(테스트 파일로 두지 않는다 — 실 DB 금지 · 스키마 검사는 db:check · 엔티티 훅 spec 은 두지 않는 종류). 기본값 채움을 쓰는 service 기능 spec 은 객실 그룹 조회 API 와 함께 Phase 13 에 둔다.
  ENTITIES 가 늘어 모든 Data-Access Smoke 의 DataSource 메타데이터가 함께 빌드된다(배타 제약 · CHECK 메타데이터 포함) — `npm test` 에서 깨지지 않는지 확인한다.
  notDeleted util — 라이브러리 단위 spec 은 두지 않는 종류다(docs/testing.md). repository spec 이 조건 인자로 동작을 단언한다.
  service 기능 spec — repository 를 mock 하므로 소프트 삭제 전환으로 바뀌는 단언이 없다(삭제 메서드 이름 · 인자가 그대로). 도우미 행(storeRow · hourRow · breakRow · periodRow · fileRow 등)에 is_deleted: 0 을 더한다.
  소프트 삭제는 build 때 PGlite scratch 로도 확인한다 — 영업시간을 두 번 교체해도 부분 유니크에 걸리지 않는지, 삭제 표시한 행이 조회 · 개수 · 겹침 검사에서 빠지는지.
```

---

## Response Codes

| Code | Cause |
|------|------|
| `db:check` 통과 | 엔티티 8개 추가 · 1개 수정이 마이그레이션 `RoomSchema` 와 일치 |
| `db:check` 실패 | PGlite 에 `btree_gist` 를 싣지 않음(CREATE EXTENSION 실패) · 마이그레이션을 손으로 고치다 엔티티와 다른 DDL 을 남김 — 출력된 DDL 로 고친다 |
| 마이그레이션 up | `btree_gist` 확장 + 새 테이블 8개(인덱스 · 부분 유니크 2 · UK 3 · CHECK 2 · 배타 제약 1 · FK 10) + 상품 종류 3행 + 기존 업체마다 업체 상품 설정 3행 + `t_store.store_detail` 삭제(적용은 사용자) |
| 마이그레이션 up 실패 | 적용 계정에 확장 생성 권한이 없음 — 권한을 주거나 DBA 가 `CREATE EXTENSION btree_gist` 후 다시 적용 |
| 마이그레이션 down | 새 테이블(업체 상품 설정 · 상품 종류 행 포함) · 제약 제거, `t_store.store_detail` 을 `'{}'` 로 되살림(확장은 남긴다) |
| 시드(부팅) | user-service 부팅 시 호실 상태 4건 · 상품 종류 3건(이미 있는 PK — 마이그레이션이 넣은 상품 종류 — 는 건너뛴다) |
| 입점 승인 done | 새 업체 + 업체 상품 설정 3행(판매 · 매일 · 시간 이용 3시간 · 1박 22:00 ~ 09:00 · 연박 15:00 ~ 11:00), 응답 그대로 `{store_id, store_code}` |
| 입점 승인 failed 500 | 업체 상품 설정 insert 실패 — 업체 · 파일 · 계정 쓰기가 함께 롤백되고 재시도(5xx) |
| 내 업체 소개 수정 done | 소개 · 연락처만 바뀐다(`store_detail` 을 보내도 무시) |
| 업체 상세 · 내 업체 상세 200 | 응답에 `store_detail` 이 없다 |
| 기간 가격 겹침 insert | DB 가 23P01 `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange` 로 거부(repository 변환 · service 선검사는 Phase 13) |
