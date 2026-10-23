# Plan — store-schema

## Feature Summary
- **Feature**: store 스키마 — 입점 신청 · 신청 상태 · 업체 상태 룩업(+시드) · t_store 재설계(상태 · 위경도 · 소개 · 연중무휴 · 현재 영업 여부 · 정비시간) · 업체 사진 · 요일별 영업시간 · 브레이크타임
- **Entry point**: 진입점 없음 — 엔티티 · 시드 · 마이그레이션 `StoreSchema`
- **Domain**: store (로드맵 Phase 8 — #32 ~ #36)
- **Spec**: [store-schema-spec.md](../../spec/store/store-schema-spec.md)

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/store/store-state.entity.ts` | new — 업체 상태 룩업 |
| `libs/database/src/entities/store/store-application-state.entity.ts` | new — 입점 신청 상태 룩업 |
| `libs/database/src/entities/store/store.entity.ts` | modified — 컬럼 추가 · 주석 "업체" |
| `libs/database/src/entities/store/store-application.entity.ts` | new — 입점 신청 |
| `libs/database/src/entities/store/store-image.entity.ts` | new — 업체 사진 |
| `libs/database/src/entities/store/store-hour.entity.ts` | new — 요일별 영업시간 |
| `libs/database/src/entities/store/store-break.entity.ts` | new — 요일별 브레이크타임 |
| `libs/database/src/entities.ts` | modified — ENTITIES 6개 추가 |
| `libs/database/src/seeder/seeder.targets.ts` | modified — `STORE_STATE_SEED_DATA` · `STORE_APPLICATION_STATE_SEED_DATA` + SEED_TARGETS |
| `libs/database/src/migrations/<ts>-StoreSchema.ts` | new — `npm run db:generate -- StoreSchema` 후 t_store 기존 행 처리를 손으로 고친다 |
| `libs/database/src/migrations.ts` | modified — 생성기가 MIGRATIONS 에 등록 |
| `docs/data-layer.md` | modified — 엔티티 트리 · 타입(`time` · `double precision`) · 룩업 목록 · 서비스 간 FK 예 |
| `AGENTS.md` | modified — Data Layer 타입 한 줄 |
| `README.md` | 변경 없음(확인) — 테이블 목록을 두지 않는다(README.md:69 은 `entities/<domain>/` 경로만) |
| `.beaver/output/roadmap/roomless-roadmap.md` (+ html) | modified — Phase 8 유닛 상태 |

삭제할 코드: 없음. `t_store` 를 읽거나 쓰는 앱 코드가 아직 없다(`StoreEntity` 사용처는 user.entity.ts:39 의 FK · entities.ts 뿐).

---

## Design

### Data Access — 엔티티

형제: 룩업 `state.entity.ts:6` · `sms-purpose.entity.ts:6`, FK `user.entity.ts:23-41`, 훅 `user-setting.entity.ts` · `session.entity.ts`(insert 만).

```ts
// libs/database/src/entities/store/store-state.entity.ts — new
import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 업체 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_store_state', comment: '업체 상태'})
export class StoreStateEntity {
    @PrimaryColumn({name: 'store_state_id', length: 20, comment: '업체 상태 ID', primaryKeyConstraintName: 'PK_StoreState'})
    store_state_id: string;

    @Column({name: 'store_state_name', length: 50, nullable: false, comment: '업체 상태명'})
    store_state_name: string;
}
```

```ts
// libs/database/src/entities/store/store-application-state.entity.ts — new
import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 입점 신청 상태 (룩업) — 구조 컬럼만. 기본 데이터는 seeder.targets.ts
 */
@Entity({name: 't_store_application_state', comment: '입점 신청 상태'})
export class StoreApplicationStateEntity {
    @PrimaryColumn({name: 'store_application_state_id', length: 20, comment: '입점 신청 상태 ID', primaryKeyConstraintName: 'PK_StoreApplicationState'})
    store_application_state_id: string;

    @Column({name: 'store_application_state_name', length: 50, nullable: false, comment: '입점 신청 상태명'})
    store_application_state_name: string;
}
```

```ts
// libs/database/src/entities/store/store.entity.ts — modified (전체)
import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {StoreStateEntity} from './store-state.entity.js';

/** 업체 상세정보(t_store.store_detail) — 항목은 언제든 바뀔 수 있다. 플래그는 0/1 */
export interface StoreDetail {
    /** 방 칸수 */
    room_count?: number;
    /** 샤워실 유무 */
    has_shower?: number;
    /** TV 유무 */
    has_tv?: number;
    /** PC 유무 */
    has_pc?: number;
}

/**
 * 업체 — 입점 승인으로 만들어진다. 이용자에게는 활성(ACTIVE) · 미삭제 업체만 보인다.
 * 영업중 = 영업중 여부(is_open) 1 이고, 24시간 연중무휴(is_always_open) 이거나 요일별 영업시간(t_store_hour) 안 · 브레이크타임 밖.
 * is_open 이 0 이면 연중무휴로 되어 있어도 영업중 아님이다.
 * 사진(t_store_image) · 브레이크타임(t_store_break)은 따로 둔다.
 */
@Entity({name: 't_store', comment: '업체 정보'})
@Unique('UK_Store_BusinessNumber', ['business_number'])
@Index('IDX_Store_LatitudeLongitude', ['latitude', 'longitude'])
export class StoreEntity {
    @PrimaryColumn({name: 'store_id', length: 32, comment: '업체 ID', primaryKeyConstraintName: 'PK_Store'})
    store_id: string;

    @ManyToOne(() => StoreStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_state_id', referencedColumnName: 'store_state_id', foreignKeyConstraintName: 'FK_Store_StoreState'})
    store_state_id: string;

    @Column({name: 'store_name', length: 100, nullable: false, comment: '상호명'})
    store_name: string;

    @Column({name: 'business_number', length: 45, nullable: false, comment: '사업자등록번호(숫자 10자리, 삭제 시 DELETE_<store_id> 로 마스킹)'})
    business_number: string;

    @Column({name: 'owner_name', length: 50, nullable: false, comment: '대표자명'})
    owner_name: string;

    @Column({name: 'phone', length: 30, nullable: false, comment: '업체 연락처'})
    phone: string;

    @Column({name: 'address', length: 255, nullable: false, comment: '주소'})
    address: string;

    @Column({name: 'address_detail', type: 'varchar', length: 255, nullable: true, comment: '상세주소'})
    address_detail: string | null;

    @Column({name: 'latitude', type: 'double precision', nullable: false, comment: '위도(WGS84)'})
    latitude: number;

    @Column({name: 'longitude', type: 'double precision', nullable: false, comment: '경도(WGS84)'})
    longitude: number;

    @Column({name: 'introduction', type: 'text', nullable: true, comment: '업체 소개'})
    introduction: string | null;

    @Column({name: 'store_detail', type: 'jsonb', nullable: false, default: () => "'{}'", comment: '업체 상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다)'})
    store_detail: StoreDetail;

    @Column({name: 'is_always_open', type: 'smallint', nullable: false, default: 0, comment: '24시간 연중무휴 여부(0: 요일별 영업시간 t_store_hour, 1: 24시간 연중무휴 — 영업시간을 두지 않는다)'})
    is_always_open: number;

    @Column({name: 'is_open', type: 'smallint', nullable: false, default: 1, comment: '영업중 여부(0: 영업중 아님 — 연중무휴 · 영업시간과 무관하게 영업중 아님으로 본다, 1: 영업중)'})
    is_open: number;

    @Column({name: 'maintenance_minutes', type: 'smallint', nullable: false, default: 0, comment: '정비시간(분) — 퇴실 후 다음 이용까지 호실을 막는 시간'})
    maintenance_minutes: number;

    @Column({name: 'is_deleted', type: 'smallint', nullable: false, default: 0, comment: '삭제여부(0: 정상, 1: 삭제)'})
    is_deleted: number;

    @Column({name: 'delete_backup', type: 'text', nullable: true, comment: '삭제 시 이전 정보 백업(JSON)'})
    delete_backup: string | null;

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
// libs/database/src/entities/store/store-application.entity.ts — new
import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreApplicationStateEntity} from './store-application-state.entity.js';
import {StoreEntity} from './store.entity.js';

/**
 * 입점 신청 — 이용자가 신청하고 총관리자가 승인 · 반려한다. 승인하면 업체(t_store)와 업체 총관리자 계정을 만들고 store_id 를 남긴다.
 * 신청자 user_id 는 다른 서비스 소유 테이블(t_user)이라 FK 없이 ID 만 둔다(data-layer.md — 서비스 간 FK 를 새로 만들지 않는다).
 */
@Entity({name: 't_store_application', comment: '입점 신청'})
@Index('IDX_StoreApplication_UserId', ['user_id'])
export class StoreApplicationEntity {
    @PrimaryColumn({name: 'store_application_id', length: 32, comment: '입점 신청 ID', primaryKeyConstraintName: 'PK_StoreApplication'})
    store_application_id: string;

    @Column({name: 'user_id', length: 32, nullable: false, comment: '신청한 이용자 ID(t_user — 다른 서비스 소유라 FK 없음)'})
    user_id: string;

    @ManyToOne(() => StoreApplicationStateEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_application_state_id', referencedColumnName: 'store_application_state_id', foreignKeyConstraintName: 'FK_StoreApplication_StoreApplicationState'})
    store_application_state_id: string;

    @ManyToOne(() => StoreEntity, {nullable: true, onUpdate: 'CASCADE', onDelete: 'RESTRICT'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreApplication_Store'})
    store_id: string | null;

    @Column({name: 'store_name', length: 100, nullable: false, comment: '상호명'})
    store_name: string;

    @Column({name: 'business_number', length: 10, nullable: false, comment: '사업자등록번호(숫자 10자리)'})
    business_number: string;

    @Column({name: 'owner_name', length: 50, nullable: false, comment: '대표자명'})
    owner_name: string;

    @Column({name: 'phone', length: 30, nullable: false, comment: '업체 연락처'})
    phone: string;

    @Column({name: 'address', length: 255, nullable: false, comment: '주소'})
    address: string;

    @Column({name: 'address_detail', type: 'varchar', length: 255, nullable: true, comment: '상세주소'})
    address_detail: string | null;

    @Column({name: 'latitude', type: 'double precision', nullable: false, comment: '위도(WGS84 — 클라이언트가 주소 검색으로 구해 보낸다)'})
    latitude: number;

    @Column({name: 'longitude', type: 'double precision', nullable: false, comment: '경도(WGS84 — 클라이언트가 주소 검색으로 구해 보낸다)'})
    longitude: number;

    @Column({name: 'head_manager_name', length: 50, nullable: false, comment: '업체 총관리자 이름 — 승인 때 만드는 매니저 계정'})
    head_manager_name: string;

    @Column({name: 'head_manager_phone', length: 30, nullable: false, comment: '업체 총관리자 휴대폰 번호(숫자만) — 승인 때 만드는 매니저 계정 · 안내 SMS'})
    head_manager_phone: string;

    @Column({name: 'business_license_image_key', length: 255, nullable: false, comment: '사업자등록증 사진 저장 키(S3)'})
    business_license_image_key: string;

    @Column({name: 'application_comment', type: 'varchar', length: 500, nullable: true, comment: '신청 메모'})
    application_comment: string | null;

    @Column({name: 'reject_comment', type: 'varchar', length: 255, nullable: true, comment: '반려 사유'})
    reject_comment: string | null;

    @Column({name: 'reviewed_at', type: 'timestamptz', nullable: true, comment: '처리일(승인 · 반려, 대기 NULL)'})
    reviewed_at: Date | null;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '신청일'})
    created_at: Date;

    @Column({name: 'updated_at', type: 'timestamptz', nullable: false, comment: '수정일'})
    updated_at: Date;

    /**
     * insert 직전 신청일 · 수정일을 채운다.
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
// libs/database/src/entities/store/store-image.entity.ts — new
import {BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 사진 — 사진 1장 = 1행. 파일은 S3(presigned 업로드)에 있고 저장 키만 둔다. 화면 주소는 getPublicUrl(key)
 */
@Entity({name: 't_store_image', comment: '업체 사진'})
@Index('IDX_StoreImage_StoreIdSortOrder', ['store_id', 'sort_order'])
export class StoreImageEntity {
    @PrimaryColumn({name: 'store_image_id', length: 32, comment: '업체 사진 ID', primaryKeyConstraintName: 'PK_StoreImage'})
    store_image_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreImage_Store'})
    store_id: string;

    @Column({name: 'image_key', length: 255, nullable: false, comment: '사진 저장 키(S3 — store/<store_id>/<uuid>.jpg)'})
    image_key: string;

    @Column({name: 'sort_order', type: 'smallint', nullable: false, default: 0, comment: '정렬 순서(작을수록 앞, 0: 대표 사진)'})
    sort_order: number;

    @Column({name: 'created_at', type: 'timestamptz', nullable: false, comment: '등록일'})
    created_at: Date;

    /**
     * insert 직전 등록일을 채운다.
     */
    @BeforeInsert()
    insertTimestamp(): void {
        this.created_at = new Date();
    }
}
```

```ts
// libs/database/src/entities/store/store-hour.entity.ts — new
import {BeforeInsert, BeforeUpdate, Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 요일별 영업시간 — 요일마다 1행, 24시간 연중무휴(t_store.is_always_open = 1)가 아닌 업체만 둔다.
 * 시각은 한국 시각 분 단위이고, 마감이 시작보다 이르면 다음 날 마감이다(18:00 ~ 06:00).
 * 휴무가 아니면(is_closed = 0) open_time · close_time 은 세트로 둘 다 있다. 휴무(is_closed = 1)면 둘 다 NULL.
 */
@Entity({name: 't_store_hour', comment: '업체 요일별 영업시간'})
@Unique('UK_StoreHour_StoreIdDayOfWeek', ['store_id', 'day_of_week'])
@Check('CHK_StoreHour_OpenCloseTime', `("is_closed" = 1 AND "open_time" IS NULL AND "close_time" IS NULL) OR ("is_closed" = 0 AND "open_time" IS NOT NULL AND "close_time" IS NOT NULL)`)
export class StoreHourEntity {
    @PrimaryColumn({name: 'store_hour_id', length: 32, comment: '영업시간 ID', primaryKeyConstraintName: 'PK_StoreHour'})
    store_hour_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreHour_Store'})
    store_id: string;

    @Column({name: 'day_of_week', type: 'smallint', nullable: false, comment: '요일(0: 일 ~ 6: 토)'})
    day_of_week: number;

    @Column({name: 'is_closed', type: 'smallint', nullable: false, default: 0, comment: '휴무 여부(0: 영업, 1: 휴무 — 시각 NULL)'})
    is_closed: number;

    @Column({name: 'open_time', type: 'time', nullable: true, comment: '영업 시작 시각(한국 시각, 분 단위 — 휴무가 아니면 close_time 과 세트로 필수, 휴무 NULL)'})
    open_time: string | null;

    @Column({name: 'close_time', type: 'time', nullable: true, comment: '영업 마감 시각(한국 시각, 분 단위 — 시작보다 이르면 다음 날 마감, 휴무가 아니면 open_time 과 세트로 필수, 휴무 NULL)'})
    close_time: string | null;

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
// libs/database/src/entities/store/store-break.entity.ts — new
import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 요일별 브레이크타임 — 하루 여러 개, 연중무휴 업체도 둘 수 있다.
 * 시각은 한국 시각 분 단위이고, 마감이 시작보다 이르면 다음 날까지다(23:00 ~ 02:00 — 시작한 요일에 속한다).
 */
@Entity({name: 't_store_break', comment: '업체 요일별 브레이크타임'})
@Index('IDX_StoreBreak_StoreIdDayOfWeek', ['store_id', 'day_of_week'])
export class StoreBreakEntity {
    @PrimaryColumn({name: 'store_break_id', length: 32, comment: '브레이크타임 ID', primaryKeyConstraintName: 'PK_StoreBreak'})
    store_break_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreBreak_Store'})
    store_id: string;

    @Column({name: 'day_of_week', type: 'smallint', nullable: false, comment: '요일(0: 일 ~ 6: 토) — 브레이크타임이 시작하는 요일'})
    day_of_week: number;

    @Column({name: 'start_time', type: 'time', nullable: false, comment: '브레이크 시작 시각(한국 시각, 분 단위)'})
    start_time: string;

    @Column({name: 'end_time', type: 'time', nullable: false, comment: '브레이크 마감 시각(한국 시각, 분 단위 — 시작보다 이르면 다음 날)'})
    end_time: string;

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
// libs/database/src/entities.ts — modified
import {ApiLogEntity} from './entities/api-log/api-log.entity.js';
import {StoreApplicationStateEntity} from './entities/store/store-application-state.entity.js';
import {StoreApplicationEntity} from './entities/store/store-application.entity.js';
import {StoreBreakEntity} from './entities/store/store-break.entity.js';
import {StoreHourEntity} from './entities/store/store-hour.entity.js';
import {StoreImageEntity} from './entities/store/store-image.entity.js';
import {StoreStateEntity} from './entities/store/store-state.entity.js';
import {StoreEntity} from './entities/store/store.entity.js';
// … user 엔티티 import 그대로 …

export const ENTITIES = [
    AuthEntity,
    StateEntity,
    SnsEntity,
    SmsPurposeEntity,
    StoreStateEntity,
    StoreApplicationStateEntity,
    StoreEntity,
    StoreApplicationEntity,
    StoreImageEntity,
    StoreHourEntity,
    StoreBreakEntity,
    UserEntity,
    UserSettingEntity,
    SessionEntity,
    SessionRefreshEntity,
    SmsVerificationEntity,
    ApiLogEntity,
];
```

### Data Access — 시드

형제: `SMS_PURPOSE_SEED_DATA`(seeder.targets.ts:44) · `SEED_TARGETS`(FK 부모를 먼저).

```ts
// libs/database/src/seeder/seeder.targets.ts — modified (추가분)
import {StoreApplicationStateEntity} from '../entities/store/store-application-state.entity.js';
import {StoreStateEntity} from '../entities/store/store-state.entity.js';

/** 업체 상태(t_store_state) 기본 데이터 — 이용자에게는 ACTIVE 업체만 보인다 */
export const STORE_STATE_SEED_DATA: StoreStateEntity[] = [
    {store_state_id: 'ACTIVE', store_state_name: '활성'},
    {store_state_id: 'SUSPEND', store_state_name: '영업중지'},
    {store_state_id: 'LEAVE', store_state_name: '탈퇴'},
];

/** 입점 신청 상태(t_store_application_state) 기본 데이터 */
export const STORE_APPLICATION_STATE_SEED_DATA: StoreApplicationStateEntity[] = [
    {store_application_state_id: 'WAIT', store_application_state_name: '대기'},
    {store_application_state_id: 'APPROVED', store_application_state_name: '승인'},
    {store_application_state_id: 'REJECTED', store_application_state_name: '반려'},
];

export const SEED_TARGETS: SeedTarget[] = [
    {entity: AuthEntity, data: AUTH_SEED_DATA},
    {entity: StateEntity, data: STATE_SEED_DATA},
    {entity: SnsEntity, data: SNS_SEED_DATA},
    {entity: SmsPurposeEntity, data: SMS_PURPOSE_SEED_DATA},
    {entity: StoreStateEntity, data: STORE_STATE_SEED_DATA},
    {entity: StoreApplicationStateEntity, data: STORE_APPLICATION_STATE_SEED_DATA},
    {entity: UserEntity, data: buildSuperAdminSeed, key: 'login_id'},
    {entity: UserSettingEntity, data: buildSuperAdminSettingSeed, key: 'user_id'},
];
```

### Data Access — 마이그레이션

순서: 엔티티 · ENTITIES 반영 → `npm run db:generate -- StoreSchema`(PGlite 계산 · MIGRATIONS 등록) → 아래처럼 **t_store 에 NOT NULL 컬럼을 더하는 부분만 손으로 고친다**(형제 1792682222497-LoginScopeStoreDetail.ts:19-23) → `npm run db:check` 통과.

생성기가 만드는 나머지(CREATE TABLE 6개 · 주석 · 인덱스 · FK)는 그대로 둔다. 손으로 고친 뒤의 모양은 다음과 같다. `COMMENT ON COLUMN` 은 엔티티 comment 그대로 생성돼 여기서는 줄였다.

```ts
// libs/database/src/migrations/<ts>-StoreSchema.ts — new (생성 + 손으로 고친 부분)
import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * store 스키마 (로드맵 Phase 8 #32 ~ #36)
 * - 룩업 t_store_state · t_store_application_state (기본 데이터는 seeder)
 * - t_store — store_state_id · latitude · longitude · introduction · is_always_open · is_open · maintenance_minutes, 주석 "가맹점" → "업체"
 * - t_store_application · t_store_image · t_store_hour · t_store_break
 * - 기존 t_store 행은 영업중지 · 좌표 0 으로 채운다(손으로 더한 부분 — 이용자에게 노출되지 않고, 총관리자가 고친 뒤 활성으로 바꾼다).
 */
export class StoreSchema<ts> implements MigrationInterface {
    name = 'StoreSchema<ts>';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "t_store_state" ("store_state_id" character varying(20) NOT NULL, "store_state_name" character varying(50) NOT NULL, CONSTRAINT "PK_StoreState" PRIMARY KEY ("store_state_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_state" IS '업체 상태'`);
        await queryRunner.query(`CREATE TABLE "t_store_application_state" ("store_application_state_id" character varying(20) NOT NULL, "store_application_state_name" character varying(50) NOT NULL, CONSTRAINT "PK_StoreApplicationState" PRIMARY KEY ("store_application_state_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_application_state" IS '입점 신청 상태'`);
        await queryRunner.query(`CREATE TABLE "t_store_application" ("store_application_id" character varying(32) NOT NULL, "user_id" character varying(32) NOT NULL, "store_name" character varying(100) NOT NULL, "business_number" character varying(10) NOT NULL, "owner_name" character varying(50) NOT NULL, "phone" character varying(30) NOT NULL, "address" character varying(255) NOT NULL, "address_detail" character varying(255), "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "head_manager_name" character varying(50) NOT NULL, "head_manager_phone" character varying(30) NOT NULL, "business_license_image_key" character varying(255) NOT NULL, "application_comment" character varying(500), "reject_comment" character varying(255), "reviewed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_application_state_id" character varying(20) NOT NULL, "store_id" character varying(32), CONSTRAINT "PK_StoreApplication" PRIMARY KEY ("store_application_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreApplication_UserId" ON "t_store_application" ("user_id") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_application" IS '입점 신청'`);
        await queryRunner.query(`CREATE TABLE "t_store_image" ("store_image_id" character varying(32) NOT NULL, "image_key" character varying(255) NOT NULL, "sort_order" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "PK_StoreImage" PRIMARY KEY ("store_image_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreImage_StoreIdSortOrder" ON "t_store_image" ("store_id", "sort_order") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_image" IS '업체 사진'`);
        await queryRunner.query(`CREATE TABLE "t_store_hour" ("store_hour_id" character varying(32) NOT NULL, "day_of_week" smallint NOT NULL, "is_closed" smallint NOT NULL DEFAULT '0', "open_time" TIME, "close_time" TIME, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "UK_StoreHour_StoreIdDayOfWeek" UNIQUE ("store_id", "day_of_week"), CONSTRAINT "CHK_StoreHour_OpenCloseTime" CHECK (("is_closed" = 1 AND "open_time" IS NULL AND "close_time" IS NULL) OR ("is_closed" = 0 AND "open_time" IS NOT NULL AND "close_time" IS NOT NULL)), CONSTRAINT "PK_StoreHour" PRIMARY KEY ("store_hour_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_hour" IS '업체 요일별 영업시간'`);
        await queryRunner.query(`CREATE TABLE "t_store_break" ("store_break_id" character varying(32) NOT NULL, "day_of_week" smallint NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "PK_StoreBreak" PRIMARY KEY ("store_break_id")); COMMENT ON COLUMN …`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreBreak_StoreIdDayOfWeek" ON "t_store_break" ("store_id", "day_of_week") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_break" IS '업체 요일별 브레이크타임'`);

        // ── 손으로 고친 부분: 기존 t_store 행이 있어도 NOT NULL 로 추가되도록 임시 기본값 → 기본값 제거 (엔티티에는 기본값이 없다)
        // FK 가 기존 행을 받도록 영업중지 룩업 행을 먼저 넣는다(seeder 는 PK 가 있으면 건너뛴다)
        await queryRunner.query(`INSERT INTO "t_store_state" ("store_state_id", "store_state_name") VALUES ('SUSPEND', '영업중지') ON CONFLICT DO NOTHING`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "store_state_id" character varying(20) NOT NULL DEFAULT 'SUSPEND'`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "store_state_id" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_state_id" IS '업체 상태 ID'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "latitude" double precision NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "latitude" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."latitude" IS '위도(WGS84)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "longitude" double precision NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "longitude" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."longitude" IS '경도(WGS84)'`);
        // ── 여기까지 손으로 고친 부분 (아래는 생성 그대로 — 기본값이 있는 컬럼은 기존 행에도 채워진다)
        await queryRunner.query(`ALTER TABLE "t_store" ADD "introduction" text`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."introduction" IS '업체 소개'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "is_always_open" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."is_always_open" IS '24시간 연중무휴 여부(…)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "is_open" smallint NOT NULL DEFAULT '1'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."is_open" IS '영업중 여부(…)'`);
        await queryRunner.query(`ALTER TABLE "t_store" ADD "maintenance_minutes" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."maintenance_minutes" IS '정비시간(분) — …'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_id" IS '업체 ID'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store"."phone" IS '업체 연락처'`);
        await queryRunner.query(`COMMENT ON COLUMN "t_user"."store_id" IS '업체 ID'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store" IS '업체 정보'`);
        await queryRunner.query(`CREATE INDEX "IDX_Store_LatitudeLongitude" ON "t_store" ("latitude", "longitude") `);
        await queryRunner.query(`ALTER TABLE "t_store" ADD CONSTRAINT "FK_Store_StoreState" FOREIGN KEY ("store_state_id") REFERENCES "t_store_state"("store_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD CONSTRAINT "FK_StoreApplication_StoreApplicationState" FOREIGN KEY ("store_application_state_id") REFERENCES "t_store_application_state"("store_application_state_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_application" ADD CONSTRAINT "FK_StoreApplication_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE RESTRICT ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_image" ADD CONSTRAINT "FK_StoreImage_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_hour" ADD CONSTRAINT "FK_StoreHour_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "t_store_break" ADD CONSTRAINT "FK_StoreBreak_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    /**
     * 되돌리기 — 생성 그대로(FK → 인덱스 → t_store 컬럼 · 주석 원복 → 새 테이블 DROP). 넣어 둔 SUSPEND 행은 t_store_state 와 함께 사라진다.
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        // 생성기가 up 의 역순으로 쓴다 — 주석은 '가맹점 정보' · '가맹점 ID (UUID v4)' · '가맹점 연락처' 로 돌아간다
    }
}
```

생성 결과의 문장 순서 · 따옴표 표기는 생성기를 따른다. 확인할 것 세 가지:
- 제약명이 `UK_StoreHour_StoreIdDayOfWeek` · `CHK_StoreHour_OpenCloseTime` · `FK_*` · `IDX_*` 그대로인지 확인한다. 여러 컬럼 UK 라 `UQ_<해시>` 는 나오지 않는다.
- CHECK 는 프로젝트 첫 사례다. TypeORM 스키마 비교는 CHECK 를 이름으로 맞추므로 `db:check` 가 통과해야 한다. 식을 바꿀 때는 이름도 바꾼다(같은 이름이면 차이를 잡지 못한다).
- `store_state_id` · `latitude` · `longitude` 의 ADD 문만 임시 기본값 방식으로 바꿨는지 확인한다.
- `down` 은 생성된 그대로 둔다.

### 규약 문서

```md
<!-- docs/data-layer.md:10-11 — 엔티티 트리 -->
│   ├── user/        auth · state · sns · sms-purpose(룩업) · user · user-setting · session · session-refresh · sms-verification
│   ├── store/       store-state · store-application-state(룩업) · store · store-application · store-image · store-hour · store-break

<!-- docs/data-layer.md:31 — 서비스 간 FK -->
- **다른 서비스 소유 테이블로 가는 FK 를 새로 만들지 않는다.** 필요하면 ID 컬럼만 두고 정합성은 내부 HTTP · 이벤트로 맞춘다. 예: `t_store_application.user_id`(신청한 이용자 — ID + 인덱스만). (기존 `t_user.store_id` FK 는 서비스 분리 때 끊을 대상이다)

<!-- docs/data-layer.md:72 — 타입 -->
- **타입** — 문자열 `length: n`(nullable 이면 `type: 'varchar'` 명시), 긴 문자열 `text`, 시각 `timestamptz`, 하루 안 시각 `time`, 좌표 `double precision`, 플래그 `smallint`(0/1), 자동 증가 `bigint` + `@PrimaryGeneratedColumn`(값은 문자열로 온다), JSON `jsonb`.
  - **하루 안 시각 `time`** 은 영업시간 · 브레이크타임처럼 날짜 없이 반복되는 시각이다. 한국 시각, 분 단위(`HH:mm`, 초는 0)이고 값은 문자열(`'18:00:00'`)로 온다. **마감이 시작보다 이르면 다음 날**이다(18:00 ~ 06:00). 24시간 · 휴무는 시각이 아니라 플래그로 둔다(`t_store.is_always_open` · `t_store_hour.is_closed`) — store-hour.entity.ts.
  - **좌표 `double precision`** — 위도 · 경도(WGS84). JS number 로 온다(`numeric` 은 문자열로 온다). 지도 범위 조회용 `IDX_Store_LatitudeLongitude` — store.entity.ts.

<!-- docs/data-layer.md:68 — 제약명 PascalCase 목록에 CHECK 추가 -->
… · `IDX_<Model>_<Cols>`(`@Index('IDX_…', [...])`) · `CHK_<Model>_<내용>`(`@Check('CHK_…', '<SQL 식>')` — 컬럼 조합 규칙을 DB 가 막을 때. 예: `CHK_StoreHour_OpenCloseTime` 휴무가 아니면 open_time · close_time 둘 다, 휴무면 둘 다 NULL — store-hour.entity.ts. 스키마 비교가 이름으로 맞추므로 식을 바꾸면 이름도 바꾼다). …

<!-- docs/data-layer.md:76 — 룩업 -->
- **룩업 엔티티**(auth · state · sns · sms-purpose · store-state · store-application-state)는 구조 컬럼만. 기본 데이터는 seeder.
```

```md
<!-- AGENTS.md — Data Layer 엔티티 줄의 "시각 `timestamptz`(기존 예외 `leave_reserved_at` 문자열)" 뒤 -->
시각 `timestamptz`(기존 예외 `leave_reserved_at` 문자열) · 하루 안 시각 `time`(한국 시각 분 단위, 마감이 시작보다 이르면 다음 날 — 24시간 · 휴무는 플래그) · 좌표 `double precision`

<!-- AGENTS.md — Data Layer 엔티티 줄의 제약명 목록, `@Index('IDX_…')` 뒤 -->
· `@Check('CHK_<Model>_<내용>', '<SQL 식>')`(컬럼 조합 규칙 — `CHK_StoreHour_OpenCloseTime`)
```

---

## Test Cases

```
[CASES]              해당 없음 — 계산형 유닛 없음
[FAIL:validation]    해당 없음 — 입력 진입점(DTO) 없음(입력 검증은 Phase 9 · 11 의 DTO)
[SMOKE:data-access]  해당 없음 — repository · QueryBuilder 없음

테스트 생략(위임형):
  엔티티 · 시드 · 마이그레이션 — spec 은 service 기능 · repository 두 종류만 둔다(docs/testing.md). 이번 단계에는 둘 다 없다.
  스키마 일치는 `npm run db:check`(엔티티 = 마이그레이션), 타입은 `npm run typecheck`, 빌드는 `npm run build` 로 확인한다.
  기존 spec(service · repository)이 깨지지 않는지 `npm test` 로 확인한다 — ENTITIES 가 늘어 Data-Access Smoke 의 DataSource 메타데이터가 함께 빌드된다.
```

---

## Response Codes

진입점이 없어 결과 계약으로 적는다.

| Code | Cause |
|------|------|
| `db:check` 통과 | 엔티티 6개 추가 · 1개 수정이 마이그레이션 `StoreSchema` 와 일치 |
| `db:check` 실패 | 마이그레이션을 손으로 고칠 때 엔티티와 다른 DDL(기본값을 남김 · 타입 차이)을 남김 — 출력된 DDL 로 고친다 |
| 마이그레이션 up | 새 테이블 6개 + t_store 컬럼 7개 · 인덱스 · FK 6개. 기존 t_store 행은 영업중지 · 좌표 0 · 영업중(`is_open` 기본 1) · 정비 0분(적용은 사용자) |
| 마이그레이션 down | 새 테이블 · 컬럼 · 제약 제거, t_store 주석 원복 |
| 시드(부팅) | user-service 부팅 시 업체 상태 3건 · 신청 상태 3건(이미 있는 PK — 마이그레이션이 넣은 SUSPEND — 는 건너뛴다) |
