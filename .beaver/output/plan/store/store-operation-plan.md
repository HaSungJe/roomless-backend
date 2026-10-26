# Plan — store-operation (Phase 11 업체 운영 설정)

## Feature Summary
- **Feature**: 업체 관리자(업체 총관리자 · 업체 관리자)가 자기 업체의 상세를 보고, 소개 · 연락처 · 편의시설 · 사진(순서 포함), 요일별 영업시간(휴무 · 연중무휴), 매일 브레이크타임(서로 겹침 없음), 정비시간, 영업중 여부, 일시 예약불가(일시 범위 · 겹침 없음)를 설정한다
- **Entry point**: `게이트웨이 /api/v1/admin-service/store/mine… (동기 3 · 큐 10, PassportJwtManagerAuthGuard) → admin-service StoreController · StoreQueueController → StoreService`
- **Domain**: store (admin-service) — 로드맵 Phase 11 유닛 #44 · #45 · #46 · #47 · #94 + 새 유닛 일시 예약불가
- **Spec**: [store-operation-spec.md](../../spec/store/store-operation-spec.md)

| # | 라우트 | 경로 | service |
|---|---|---|---|
| 1 | `GET /mine` | 동기 | `getMyStore` |
| 2 | `PATCH /mine/profile` | 큐 `admin.store.mine-profile` | `updateMyStoreProfile` |
| 3 | `POST /mine/file/upload-url` | 동기 | `createMyStoreFileUploadUrl` |
| 4 | `POST /mine/file` | 큐 `admin.store.mine-file` | `addMyStoreFile` |
| 5 | `DELETE /mine/file/:store_file_id` | 큐 `admin.store.mine-file-delete` | `removeMyStoreFile` |
| 6 | `PUT /mine/file/order` | 큐 `admin.store.mine-file-order` | `reorderMyStoreFiles` |
| 7 | `PUT /mine/hours` | 큐 `admin.store.mine-hours` | `replaceMyStoreHours` |
| 8 | `PUT /mine/breaks` | 큐 `admin.store.mine-breaks` | `replaceMyStoreBreaks` |
| 9 | `PATCH /mine/maintenance` | 큐 `admin.store.mine-maintenance` | `changeMyStoreMaintenance` |
| 10 | `PATCH /mine/open` | 큐 `admin.store.mine-open` | `changeMyStoreOpen` |
| 11 | `GET /mine/unavailable-period` | 동기 | `getMyStoreUnavailablePeriodList` |
| 12 | `POST /mine/unavailable-period` | 큐 `admin.store.mine-unavailable-period` | `addMyStoreUnavailablePeriod` |
| 13 | `DELETE /mine/unavailable-period/:store_unavailable_period_id` | 큐 `admin.store.mine-unavailable-period-delete` | `removeMyStoreUnavailablePeriod` |

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/store/store-break.entity.ts` | modified — `day_of_week` · `IDX_StoreBreak_StoreIdDayOfWeek` 삭제 → `IDX_StoreBreak_StoreId`, 매일 브레이크타임 |
| `libs/database/src/entities/store/store-unavailable-period.entity.ts` | new — `t_store_unavailable_period` |
| `libs/database/src/entities/store/store-file.entity.ts` | modified — `file_key` COMMENT · JSDoc(업체 사진 키 접두) |
| `libs/database/src/entities.ts` | modified — `StoreUnavailablePeriodEntity` 등록 |
| `libs/database/src/migrations/<ts>-StoreOperation.ts` | new — `npm run db:generate -- StoreOperation` 후 down 의 `day_of_week` 복구만 손으로 |
| `libs/database/src/migrations.ts` | modified — db:generate 가 등록 |
| `libs/common/src/utils/validation.ts` | modified — 중첩 오류를 점 경로로 펼친다 |
| `libs/common/src/utils/dayjs.ts` | new — 플러그인(customParseFormat · utc · timezone)을 붙인 dayjs · `KST_TIMEZONE` |
| `libs/common/src/utils/kst.ts` | **deleted** — `kstDayStart` · `kstYear` 를 dayjs 로 대체 |
| `libs/common/src/utils/jwt.ts` | modified — exp 변환을 `dayjs.unix` |
| `libs/account/src/utils/sms-verification.ts` | modified — 만료 비교 · 만료 시각을 dayjs |
| `libs/integration/src/storage/s3-storage.gateway.ts` | modified — 주소 만료 시각을 dayjs |
| `apps/user-service/src/user/user.service.ts` | modified — 하루 발송 수 시작점 · refresh 만료를 dayjs |
| `apps/user-service/src/user/user.util.ts` | modified — 연 단위 나이를 dayjs |
| `apps/admin-service/src/manager/manager.service.ts` | modified — 하루 발송 수 시작점 · refresh 만료를 dayjs |
| `apps/admin-service/src/admin/admin.service.ts` | modified — refresh 만료를 dayjs |
| `apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts` | modified — dayjs import 출처만 |
| `apps/user-service/src/user/test/user-phone-verification.spec.ts` · `user-find-login-id.spec.ts` · `apps/admin-service/src/manager/test/manager-find-login-id.spec.ts` | modified — `kstDayStart` 기대값을 고정값으로 |
| `libs/contracts/src/store/store.commands.ts` | modified — 명령 10 · 내부 경로 3 |
| `libs/contracts/src/store/dto/store-mine.dto.ts` | new — 내 업체 상세 결과 |
| `libs/contracts/src/store/dto/store-mine-profile.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-file-upload-url.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-file.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-file-delete.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-file-order.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-hours.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-breaks.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-maintenance.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-open.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-unavailable-period-list.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-unavailable-period.dto.ts` | new |
| `libs/contracts/src/store/dto/store-mine-unavailable-period-delete.dto.ts` | new |
| `apps/admin-service/src/store/store.constants.ts` | modified — 메시지 상수(반복분 승격) · `STORE_DETAIL_KEYS` |
| `apps/admin-service/src/store/store.util.ts` | modified — 키 발급 공통화 · 업체 사진 · 겹침 · 변환 |
| `apps/admin-service/src/store/interfaces/store.repository.interface.ts` | modified — 메서드 12 |
| `apps/admin-service/src/store/repositories/store.repository.ts` | modified — 메서드 12 + 빌더 4 |
| `apps/admin-service/src/store/store.service.ts` | modified — 메서드 13, 반복 메시지 상수로 |
| `apps/admin-service/src/store/controllers/store.controller.ts` | modified — 동기 3 |
| `apps/admin-service/src/store/controllers/store.controller.queue.ts` | modified — `@OnCommand` 10 |
| `apps/admin-service/src/store/store.module.ts` | unchanged |
| `apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.ts` | modified — 동기 3 (매니저 가드, `/:store_id` 앞) |
| `apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts` | modified — 큐 10 (매니저 가드, `/:store_id` 앞) |
| `apps/gateway/src/api/v1/admin-service/store/store.module.ts` | unchanged |
| `apps/admin-service/src/store/test/store.test-helper.ts` | modified — mock 메서드 · `MANAGER_ACTOR` · 행 도우미 · `validateBody` |
| `apps/admin-service/src/store/test/store-mine.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine-profile.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine-file-upload-url.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine-file.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine-file-delete.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine-file-order.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine-hours.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine-breaks.spec.ts` | new — TDD 11 케이스 |
| `apps/admin-service/src/store/test/store-mine-open.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine-unavailable-period-list.spec.ts` | new |
| `apps/admin-service/src/store/test/store-mine-unavailable-period.spec.ts` | new |
| `apps/admin-service/src/store/test/store.repository.spec.ts` | modified — 새 메서드 500 · 조건 · Smoke 4, **기존 스냅샷 3건 보정** |
| `apps/admin-service/src/store/test/store-application-list.spec.ts` | modified — **기존 실패 1건 보정**(페이지 기대값) |
| `AGENTS.md` | modified — Validation 확장 · Smoke 목록 · Auth(store `/mine`) |
| `docs/conventions.md` | modified — 중첩 · 배열 · 숫자 범위 검증, 순서 |
| `docs/data-layer.md` | modified — 영업시간 세트 규칙(memory 이관) · 일시 범위 컬럼 이름 · 업체 행 잠금 |
| `docs/api.md` | modified — 통째로 교체는 PUT, store `/mine` 라우트 |
| `docs/testing.md` | modified — Smoke 목록 · 중첩 검증 케이스 |
| `docs/architecture.md` | modified — libs/common util 목록(kst → dayjs) |
| `README.md` | modified — admin-service 설명에 업체 운영 설정 |
| `.beaver/output/spec/platform/cache-spec.md` | modified — discovery 무효화 지점 표 |

기준선(2026-10-27 `npm test`): 4 failed / 343 passed — 모두 테스트 쪽 기대값이 코드보다 늦은 것(Phase 9 · 10). 이번에 store spec 을 만지므로 같이 고친다(Test Cases 의 [FIX:baseline]).

---

## Design

### Data Access — 엔티티 · 마이그레이션

`libs/database/src/entities/store/store-break.entity.ts` — 요일 삭제(사용자 결정 2026-10-27: 브레이크타임은 요일과 상관없이 매일, 서로 겹침 없음)

```ts
import {BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 브레이크타임 — 요일과 상관없이 매일 같은 시각, 업체마다 여러 개. 연중무휴 업체도 둘 수 있다.
 * 시각은 한국 시각 분 단위이고, 마감이 시작보다 이르면 다음 날까지다(23:00 ~ 02:00).
 * 한 업체의 브레이크타임끼리는 겹치지 않는다(service 가 확인 — 끝점이 맞닿는 것은 겹침이 아니다). 시작 = 마감은 두지 않는다.
 */
@Entity({name: 't_store_break', comment: '업체 브레이크타임(매일)'})
@Index('IDX_StoreBreak_StoreId', ['store_id'])
export class StoreBreakEntity {
    @PrimaryColumn({name: 'store_break_id', length: 32, comment: '브레이크타임 ID', primaryKeyConstraintName: 'PK_StoreBreak'})
    store_break_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreBreak_Store'})
    store_id: string;

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

`libs/database/src/entities/store/store-unavailable-period.entity.ts` (new) — 앞으로 올 시각이라 컬럼은 `expires_at` 과 같은 꼴 `starts_at` · `ends_at`(docs/data-layer.md 컬럼 이름에 더한다). 시작 < 종료는 CHECK, 겹침은 service(업체 행 잠금 안에서 count).

```ts
import {BeforeInsert, BeforeUpdate, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn} from 'typeorm';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 일시 예약불가 — 시작 일시 ~ 종료 일시(분 단위, 반열린 구간) 동안 예약을 받지 않는다. 요일별 휴무(t_store_hour.is_closed)와 별개다.
 * 한 업체의 범위끼리는 겹치지 않는다(service 가 확인 — 맞닿는 것은 겹침이 아니다). 수정 없이 삭제 후 다시 등록한다.
 * 걸리는 기존 예약은 취소하지 않고 특수 표시한다(예약 기능 — Phase 17).
 */
@Entity({name: 't_store_unavailable_period', comment: '업체 일시 예약불가'})
@Index('IDX_StoreUnavailablePeriod_StoreIdStartsAt', ['store_id', 'starts_at'])
@Check('CHK_StoreUnavailablePeriod_StartsAtEndsAt', '"starts_at" < "ends_at"')
export class StoreUnavailablePeriodEntity {
    @PrimaryColumn({name: 'store_unavailable_period_id', length: 32, comment: '일시 예약불가 ID', primaryKeyConstraintName: 'PK_StoreUnavailablePeriod'})
    store_unavailable_period_id: string;

    @ManyToOne(() => StoreEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreUnavailablePeriod_Store'})
    store_id: string;

    @Column({name: 'starts_at', type: 'timestamptz', nullable: false, comment: '시작 일시(분 단위 — 이 시각부터 예약을 받지 않는다)'})
    starts_at: Date;

    @Column({name: 'ends_at', type: 'timestamptz', nullable: false, comment: '종료 일시(분 단위 — 이 시각부터 다시 예약을 받는다, 시작보다 늦다)'})
    ends_at: Date;

    @Column({name: 'memo', type: 'varchar', length: 30, nullable: true, comment: '메모(간단한 사유, 30자)'})
    memo: string | null;

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

`libs/database/src/entities/store/store-file.entity.ts` — 업체 관리자가 올리는 업체 사진(업체에만 붙는다)을 설명에 더한다.

```ts
/**
 * 업체 정보 파일 — 파일 1개 = 1행(사업자등록증 · 업체 사진). 업체의 정보다.
 * 입점 신청 때는 신청(store_application_id)에 붙여 올리고(대기 중에만 추가 · 삭제), 승인하면 같은 행에 업체(store_id)를 채운다 — 파일을 옮기거나 복사하지 않는다.
 * 승인 뒤 업체 관리자가 올리는 업체 사진은 업체에만 붙는다(store_application_id 없음). 사업자등록증은 승인 뒤 바꾸지 않는다.
 * 비공개 여부는 용도(t_store_file_purpose.is_private)가 정한다.
 */
// ...
    @Column({name: 'file_key', length: 255, nullable: false, comment: '저장 키(S3 — 비공개 private/store-application/… · private/store/…, 공개 store/application/… · store/<store_id>/…) — 같은 키를 덮어쓰지 않는다'})
    file_key: string;
```

`libs/database/src/entities.ts` — `StoreBreakEntity` 옆에 등록

```ts
import {StoreUnavailablePeriodEntity} from './entities/store/store-unavailable-period.entity.js';
// ...
    StoreHourEntity,
    StoreBreakEntity,
    StoreUnavailablePeriodEntity,
```

`libs/database/src/migrations/<ts>-StoreOperation.ts` — build 가 `npm run db:generate -- StoreOperation` 으로 만든다(타임스탬프 · 문 순서는 생성 결과를 따른다). 손으로 고치는 곳은 down 의 `day_of_week` 복구 하나 — 브레이크 행이 있으면 NOT NULL 추가가 실패하므로 기본값 0(일요일)으로 넣은 뒤 기본값을 없앤다. up 은 기존 브레이크 행을 그대로 두고 요일만 지운다(지금 브레이크를 쓰는 API 가 없어 행이 없다 — 있으면 매일로 바뀐다).

```ts
import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * 업체 운영 설정(Phase 11).
 * - t_store_break: 요일(day_of_week) 삭제 — 브레이크타임은 요일과 상관없이 매일 같다. 인덱스 IDX_StoreBreak_StoreIdDayOfWeek → IDX_StoreBreak_StoreId. 기존 행은 매일로 남는다.
 * - t_store_unavailable_period: 일시 예약불가(CHK_StoreUnavailablePeriod_StartsAtEndsAt — 시작 < 종료).
 * - t_store_file.file_key COMMENT(업체 사진 키 접두).
 * npm run db:generate 로 엔티티에서 생성한 뒤 down 의 day_of_week 복구(기존 행 — 기본값 0 후 제거)만 손으로 고쳤다.
 */
export class StoreOperation1793100000000 implements MigrationInterface {
    name = 'StoreOperation1793100000000';

    /**
     * 적용
     *
     * @param queryRunner 쿼리 실행기
     */
    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreBreak_StoreIdDayOfWeek"`);
        await queryRunner.query(`ALTER TABLE "t_store_break" DROP COLUMN "day_of_week"`);
        await queryRunner.query(
            `CREATE TABLE "t_store_unavailable_period" ("store_unavailable_period_id" character varying(32) NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL, "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL, "memo" character varying(30), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, "store_id" character varying(32) NOT NULL, CONSTRAINT "CHK_StoreUnavailablePeriod_StartsAtEndsAt" CHECK ("starts_at" < "ends_at"), CONSTRAINT "PK_StoreUnavailablePeriod" PRIMARY KEY ("store_unavailable_period_id")); COMMENT ON COLUMN "t_store_unavailable_period"."store_unavailable_period_id" IS '일시 예약불가 ID'; COMMENT ON COLUMN "t_store_unavailable_period"."starts_at" IS '시작 일시(분 단위 — 이 시각부터 예약을 받지 않는다)'; COMMENT ON COLUMN "t_store_unavailable_period"."ends_at" IS '종료 일시(분 단위 — 이 시각부터 다시 예약을 받는다, 시작보다 늦다)'; COMMENT ON COLUMN "t_store_unavailable_period"."memo" IS '메모(간단한 사유, 30자)'; COMMENT ON COLUMN "t_store_unavailable_period"."created_at" IS '등록일'; COMMENT ON COLUMN "t_store_unavailable_period"."updated_at" IS '수정일'; COMMENT ON COLUMN "t_store_unavailable_period"."store_id" IS '업체 ID'`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_StoreUnavailablePeriod_StoreIdStartsAt" ON "t_store_unavailable_period"  ("store_id", "starts_at") `);
        await queryRunner.query(`COMMENT ON TABLE "t_store_unavailable_period" IS '업체 일시 예약불가'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_break" IS '업체 브레이크타임(매일)'`);
        await queryRunner.query(
            `COMMENT ON COLUMN "t_store_file"."file_key" IS '저장 키(S3 — 비공개 private/store-application/… · private/store/…, 공개 store/application/… · store/<store_id>/…) — 같은 키를 덮어쓰지 않는다'`,
        );
        await queryRunner.query(`CREATE INDEX "IDX_StoreBreak_StoreId" ON "t_store_break"  ("store_id") `);
        await queryRunner.query(
            `ALTER TABLE "t_store_unavailable_period" ADD CONSTRAINT "FK_StoreUnavailablePeriod_Store" FOREIGN KEY ("store_id") REFERENCES "t_store"("store_id") ON DELETE CASCADE ON UPDATE CASCADE`,
        );
    }

    /**
     * 되돌리기 — 브레이크 행이 있으면 요일은 0(일요일)으로 채운다
     *
     * @param queryRunner 쿼리 실행기
     */
    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "t_store_unavailable_period" DROP CONSTRAINT "FK_StoreUnavailablePeriod_Store"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreBreak_StoreId"`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_file"."file_key" IS '저장 키(S3 — 비공개 private/store-application/…, 공개 store/application/…) — 같은 키를 덮어쓰지 않는다'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_break" IS '업체 요일별 브레이크타임'`);
        await queryRunner.query(`COMMENT ON TABLE "t_store_unavailable_period" IS NULL`);
        await queryRunner.query(`DROP INDEX "public"."IDX_StoreUnavailablePeriod_StoreIdStartsAt"`);
        await queryRunner.query(`DROP TABLE "t_store_unavailable_period"`);
        await queryRunner.query(`ALTER TABLE "t_store_break" ADD "day_of_week" smallint NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "t_store_break" ALTER COLUMN "day_of_week" DROP DEFAULT`);
        await queryRunner.query(`COMMENT ON COLUMN "t_store_break"."day_of_week" IS '요일(0: 일 ~ 6: 토) — 브레이크타임이 시작하는 요일'`);
        await queryRunner.query(`CREATE INDEX "IDX_StoreBreak_StoreIdDayOfWeek" ON "t_store_break"  ("store_id", "day_of_week") `);
    }
}
```

build 확인: `npm run db:check` 일치 + PGlite 로 up → down → up(브레이크 행 1개를 넣은 상태에서 down 이 성공하는지)과 CHECK(시작 = 종료 거부)를 scratch 로 확인한다(Phase 10 과 같은 방식, 테스트 밖).

### Input/Validation — 공통 util

`libs/common/src/utils/validation.ts` — 중첩 DTO(`@ValidateNested`) 오류는 첫 단에 `constraints` 가 없고 `children` 에 있다. 지금 factory 는 첫 단만 봐서 `'실패했습니다.'` · `property: 'hours'` 가 된다. 제약이 걸린 오류마다 1건, 대상 필드는 점 경로(`hours.0.open_time`)로 펼친다. ValidationPipe 설정은 그대로다.

```ts
/**
 * class-validator 오류 1건을 ValidationErrorResultDto 로 바꾼다.
 * 첫 번째 제약의 메시지를 쓰고, 그 제약이 `isBoolean` 이며 context.target 이 있으면 그 값을 대상 필드로 쓴다.
 *
 * @param error class-validator 오류
 * @param property 대상 필드 — 중첩이면 점 경로(`hours.0.open_time`), 기본은 그 오류의 필드명
 * @returns 유효성검사 오류 1건
 */
export function toValidationErrorResultDto(error: ValidationError, property: string = error.property): ValidationErrorResultDto {
    const constraints = error.constraints ?? {};
    const constraint = Object.keys(constraints)[0];
    const target = constraint === 'isBoolean' ? error.contexts?.[constraint]?.target : undefined;
    const dto = new ValidationErrorResultDto();
    dto.property = target ? String(target) : property;
    dto.message = (constraint && constraints[constraint]) || VALIDATION_FALLBACK_MESSAGE;
    return dto;
}

/**
 * 중첩 DTO 의 오류를 펼친다 — 제약이 걸린 오류마다 1건, 대상 필드는 부모부터 이은 점 경로.
 * 배열 자체의 제약(@ArrayMaxSize 등)과 항목의 제약이 같이 있으면 둘 다 담는다. 제약도 자식도 없으면 기본 메시지 1건.
 *
 * @param error class-validator 오류
 * @param parent 부모 경로 (첫 단은 '')
 * @returns 유효성검사 오류 목록
 */
function flattenValidationError(error: ValidationError, parent: string): ValidationErrorResultDto[] {
    const property = parent ? `${parent}.${error.property}` : error.property;
    const children = error.children ?? [];
    const own = error.constraints || children.length === 0 ? [toValidationErrorResultDto(error, property)] : [];
    return [...own, ...children.flatMap((child) => flattenValidationError(child, property))];
}

/**
 * 전역 ValidationPipe 의 exceptionFactory.
 * main.ts 와 테스트가 같은 함수를 쓴다(테스트에서 main.ts 를 손으로 재현하지 않는다). 중첩 DTO 의 오류는 점 경로로 펼친다.
 *
 * @param errors class-validator 오류 목록
 * @returns `{message, validation_errors}` 본문의 400 예외
 */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
    const validationErrors = errors.flatMap((error) => flattenValidationError(error, ''));
    const message = validationErrors[0]?.message ?? VALIDATION_FALLBACK_MESSAGE;
    return new BadRequestException({message, validation_errors: validationErrors});
}
```

### 공통 util — 날짜 · 시각은 dayjs 로 통일 (사용자 결정 2026-10-27)

"날짜 / 시간 비교하는 기능들 있으면 dayjs 같은 라이브러리 기능으로 대체하고 제거해" — 직접 만든 날짜 · 시각 계산(한국 시각 오프셋 더하기 · `getTime()` 비교 · `* 60 * 1000` 더하기 · 분 단위 직접 계산)을 dayjs(이미 의존성 1.11.23, 플러그인 `customParseFormat` · `utc` · `timezone` 포함)로 바꾸고 지운다. 플러그인은 한 곳에서 한 번만 붙이고, 앱 · 라이브러리 코드는 `'dayjs'` 를 직접 import 하지 않고 그 모듈에서 가져온다(플러그인이 빠진 채 쓰이지 않게).

| 지금 (직접 만든 것) | 바꾼 뒤 |
|---|---|
| `libs/common/src/utils/kst.ts` `kstDayStart(now)` — `+9시간 · setUTCHours(0) · −9시간` | `dayjs(now).tz(KST_TIMEZONE).startOf('day').toDate()` — **kst.ts 삭제** |
| `kstYear(now)` — `+9시간 · getUTCFullYear()` | `dayjs(now).tz(KST_TIMEZONE).year()` |
| refresh 만료 `oldRefresh.expires_at.getTime() < Date.now()` (user · manager · admin service) | `dayjs(oldRefresh.expires_at).isBefore(dayjs())` |
| SMS 인증 만료 `expires_at.getTime() <= now.getTime()` | `!dayjs(verification.expires_at).isAfter(now)` |
| SMS 만료 시각 `new Date(now.getTime() + SMS_CODE_TTL_MINUTES * 60 * 1000)` | `dayjs(input.now).add(SMS_CODE_TTL_MINUTES, 'minute').toDate()` |
| JWT 만료 `new Date(payload.exp * 1000)` | `dayjs.unix(payload.exp).toDate()` |
| S3 주소 만료 `new Date(Date.now() + TTL_SECONDS * 1000)` (2곳) | `dayjs().add(TTL_SECONDS, 'second').toDate()` |
| (이번 plan) 브레이크 겹침의 분 계산 `toMinuteOfDay` · `toDayIntervals` · 시각 문자열 자르기 · `===` 비교 | 기준일 위 dayjs 시각 + `isBefore` · `isSame` · `add(1, 'day')` · `format('HH:mm')` (store.util 절) |
| (이번 plan) 일시 예약불가 파싱 | `dayjs(값, 형식, true).isValid()` + `dayjs.tz(값, 형식, KST_TIMEZONE)` (service 절) |

그대로 두는 것: 엔티티 훅 · `MoreThan(new Date())` 같은 "지금" 값(계산 · 비교가 아니다), 메시지 봉투 `timestamp: Date.now()`(AMQP 헤더 숫자), `leave_reserved_at` 문자열(이미 dayjs `format`).

`libs/common/src/utils/dayjs.ts` (new)

```ts
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(customParseFormat);
dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 플러그인을 붙인 dayjs — 날짜 · 시각의 파싱 · 비교 · 계산 · 시간대는 직접 만들지 않고 이것으로 한다.
 * - customParseFormat: 형식 지정 파싱 — `dayjs(값, 'YYYY-MM-DD HH:mm', true)` 는 strict 라 없는 날짜 · 시각(02-30 · 13월)이면 isValid() 가 false
 * - utc · timezone: 서버 시간대(TZ)와 무관한 한국 시각 — `dayjs(x).tz(KST_TIMEZONE)` · `dayjs.tz(값, 형식, KST_TIMEZONE)`
 * 앱 · 라이브러리 코드는 'dayjs' 를 직접 import 하지 않고 여기서 가져온다(플러그인이 빠진 채 쓰이지 않게).
 */
export {dayjs};

/** dayjs 인스턴스 타입 */
export type {Dayjs} from 'dayjs';

/** 한국 시간대 — 서머타임 없음 */
export const KST_TIMEZONE = 'Asia/Seoul';
```

`libs/common/src/utils/kst.ts` — **삭제**(쓰는 곳 5개를 아래처럼 바꾼 뒤).

`apps/user-service/src/user/user.service.ts` · `apps/admin-service/src/manager/manager.service.ts` — 하루 발송 수의 시작점 · refresh 만료

```ts
// before
import dayjs from 'dayjs';
import {kstDayStart} from '@app/common/utils/kst.js';
// after
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';

// before (각 2곳 — 휴대폰 인증 · 아이디 찾기 / 아이디 찾기 · 비밀번호 초기화 발송)
const sentToday = await this.userRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(kstDayStart(now))});
// after
const sentToday = await this.userRepository.countSmsVerifications({phone: dto.phone, created_at: MoreThanOrEqual(dayjs(now).tz(KST_TIMEZONE).startOf('day').toDate())});

// before (토큰 재발급)
if (oldRefresh.expires_at.getTime() < Date.now()) {
// after
if (dayjs(oldRefresh.expires_at).isBefore(dayjs())) {
```

`apps/admin-service/src/admin/admin.service.ts` — import 출처 · refresh 만료

```ts
// before
import dayjs from 'dayjs';
// ...
if (oldRefresh.expires_at.getTime() < Date.now()) {
// after
import {dayjs} from '@app/common/utils/dayjs.js';
// ...
if (dayjs(oldRefresh.expires_at).isBefore(dayjs())) {
```

`apps/user-service/src/user/user.util.ts` — 연 단위 나이

```ts
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';

/**
 * 성인 여부 — 청소년보호법 기준: 만 19세가 되는 해의 1월 1일부터 성인(한국 날짜의 올해 − 출생 연도 ≥ 19). 생일은 보지 않는다.
 *
 * @param birth YYYY-MM-DD
 * @param now 기준 시각 (기본: 지금)
 * @returns 성인이면 true
 */
export function isAdult(birth: string, now: Date = new Date()): boolean {
    return dayjs(now).tz(KST_TIMEZONE).year() - dayjs(birth, 'YYYY-MM-DD').year() >= ADULT_AGE;
}
```

`apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts` — import 출처만(`import dayjs from 'dayjs'` → `import {dayjs} from '@app/common/utils/dayjs.js'`).

`libs/account/src/utils/sms-verification.ts`

```ts
import {dayjs} from '@app/common/utils/dayjs.js';

// checkSmsVerification
if (!dayjs(verification.expires_at).isAfter(now)) {
    return 'EXPIRED';
}

// buildSmsVerification
entity.expires_at = dayjs(input.now).add(SMS_CODE_TTL_MINUTES, 'minute').toDate();
```

`libs/common/src/utils/jwt.ts`

```ts
import {dayjs} from '@app/common/utils/dayjs.js';

// extractJwtExpiresAt
return dayjs.unix(payload.exp).toDate();
```

`libs/integration/src/storage/s3-storage.gateway.ts`

```ts
import {dayjs} from '@app/common/utils/dayjs.js';

// createUploadUrl
return {upload_url: uploadUrl, expires_at: dayjs().add(STORAGE_UPLOAD_URL_TTL_SECONDS, 'second').toDate()};
// createDownloadUrl
return {download_url: downloadUrl, expires_at: dayjs().add(STORAGE_DOWNLOAD_URL_TTL_SECONDS, 'second').toDate()};
```

build 확인: `npm run typecheck`(플러그인 타입 보강 — `dayjs.tz` · `.tz()` · `dayjs.unix`) · 남은 직접 계산이 없는지 `grep -rn "getTime()\|\* 1000\|kst" apps libs`(테스트 · 마이그레이션 제외).

### Input/Validation — contracts

검증 규약 확장(사용자 결정 2026-10-27 "규약에 더해 쓴다"): 배열 입력 `@IsArray` · `@ArrayMaxSize`, 중첩 `@ValidateNested({each})` + `@Type(() => 항목 DTO)`(class-transformer — 중첩 항목을 인스턴스로 만들어야 검증된다), 숫자 범위 `@IsInt` · `@Min` · `@Max`, 문자열 배열 항목 `@Matches(…, {each: true})`. 모든 제약에 `message`. 순서는 필수 `@ApiProperty` → (`@Type`) → 제약 → `@IsNotEmpty`. `@IsNotEmpty` 는 `''` · null · undefined 만 막아 숫자 0 · 빈 배열 · `{}` 는 통과한다.

`libs/contracts/src/store/store.commands.ts`

```ts
/**
 * store 도메인(업체 · 입점 신청) RabbitMQ 명령 종류 (= 라우팅 키, admin-service 의 q.admin.cmd 가 `admin.#` 로 받는다).
 * 큐 경로 기준: 입점 신청 · 신청 취소 · 파일 등록 · 파일 삭제(이용자), 승인 · 반려 · 업체 수정 · 상태 변경(총관리자), 내 업체 설정(업체 관리자). 조회 · 업로드 주소는 내부 HTTP 동기 경로다.
 */
export const STORE_COMMAND = {
    // ... 기존 8개 그대로
    /** 내 업체 소개 · 연락처 · 편의시설 수정 (업체 관리자) */
    MINE_PROFILE: 'admin.store.mine-profile',
    /** 내 업체 사진 등록 (업체 관리자) */
    MINE_FILE: 'admin.store.mine-file',
    /** 내 업체 사진 삭제 (업체 관리자) */
    MINE_FILE_DELETE: 'admin.store.mine-file-delete',
    /** 내 업체 사진 순서 변경 (업체 관리자) */
    MINE_FILE_ORDER: 'admin.store.mine-file-order',
    /** 내 업체 영업시간 설정 — 연중무휴 · 요일별 (업체 관리자) */
    MINE_HOURS: 'admin.store.mine-hours',
    /** 내 업체 브레이크타임 설정 (업체 관리자) */
    MINE_BREAKS: 'admin.store.mine-breaks',
    /** 내 업체 정비시간 설정 (업체 관리자) */
    MINE_MAINTENANCE: 'admin.store.mine-maintenance',
    /** 내 업체 영업중 여부 변경 (업체 관리자) */
    MINE_OPEN: 'admin.store.mine-open',
    /** 내 업체 일시 예약불가 등록 (업체 관리자) */
    MINE_UNAVAILABLE_PERIOD: 'admin.store.mine-unavailable-period',
    /** 내 업체 일시 예약불가 삭제 (업체 관리자) */
    MINE_UNAVAILABLE_PERIOD_DELETE: 'admin.store.mine-unavailable-period-delete',
} as const;

export const STORE_INTERNAL_PATH = {
    // ... 기존 경로 그대로
    /** 내 업체 상세 (GET, 업체 관리자) */
    MINE: `${STORE_INTERNAL_BASE}/mine`,
    /** 내 업체 사진 업로드 주소 (POST, 업체 관리자) */
    MINE_FILE_UPLOAD_URL: `${STORE_INTERNAL_BASE}/mine/file/upload-url`,
    /** 내 업체 일시 예약불가 목록 (GET, 업체 관리자) */
    MINE_UNAVAILABLE_PERIOD_LIST: `${STORE_INTERNAL_BASE}/mine/unavailable-period`,
} as const;
```

`libs/contracts/src/store/dto/store-mine.dto.ts` (new) — 입력 없음(actor 로 업체를 찾는다)

```ts
import {ApiProperty} from '@nestjs/swagger';

/**
 * 내 업체의 업체 정보 파일 (사업자등록증 · 업체 사진)
 */
export class StoreMineFileItemResultDto {
    @ApiProperty({description: '업체 정보 파일 ID'})
    store_file_id: string;

    @ApiProperty({description: '용도 (BUSINESS_LICENSE · STORE_IMAGE)'})
    store_file_purpose_id: string;

    @ApiProperty({description: '원본 파일명'})
    file_name: string;

    @ApiProperty({description: 'MIME 타입'})
    content_type: string;

    @ApiProperty({description: '비공개 여부 (1: 서명된 열람 주소 · 10분 유효, 0: CDN 공개 주소)'})
    is_private: number;

    @ApiProperty({description: '열람 주소'})
    file_url: string;

    @ApiProperty({description: '정렬 순서 (업체 사진은 가장 앞이 대표)'})
    sort_order: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 내 업체의 요일 영업시간
 */
export class StoreMineHourItemResultDto {
    @ApiProperty({description: '요일 (0: 일 ~ 6: 토)'})
    day_of_week: number;

    @ApiProperty({description: '휴무 여부 (0: 영업, 1: 휴무)'})
    is_closed: number;

    @ApiProperty({description: '영업 시작 시각 (HH:mm, 한국 시각) — 휴무면 null', nullable: true, type: String})
    open_time: string | null;

    @ApiProperty({description: '영업 마감 시각 (HH:mm — 시작보다 이르면 다음 날) — 휴무면 null', nullable: true, type: String})
    close_time: string | null;
}

/**
 * 내 업체의 브레이크타임 (매일)
 */
export class StoreMineBreakItemResultDto {
    @ApiProperty({description: '브레이크타임 ID'})
    store_break_id: string;

    @ApiProperty({description: '시작 시각 (HH:mm, 한국 시각)'})
    start_time: string;

    @ApiProperty({description: '마감 시각 (HH:mm — 시작보다 이르면 다음 날)'})
    end_time: string;
}

/**
 * 내 업체 상세 (업체 관리자)
 */
export class StoreMineResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '업체코드 (매니저 로그인 · 매니저 화면 주소)'})
    store_code: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND)'})
    store_state_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '업체 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '상세주소', nullable: true, type: String})
    address_detail: string | null;

    @ApiProperty({description: '위도'})
    latitude: number;

    @ApiProperty({description: '경도'})
    longitude: number;

    @ApiProperty({description: '업체 소개', nullable: true, type: String})
    introduction: string | null;

    @ApiProperty({description: '편의시설 (room_count · has_shower · has_tv · has_pc — 없는 항목은 빠진다)', type: Object})
    store_detail: Record<string, number>;

    @ApiProperty({description: '24시간 연중무휴 여부 (0 · 1 — 1 이면 요일별 영업시간이 비어 있다)'})
    is_always_open: number;

    @ApiProperty({description: '영업중 여부 (0: 영업중 아님, 1: 영업중)'})
    is_open: number;

    @ApiProperty({description: '정비시간(분)'})
    maintenance_minutes: number;

    @ApiProperty({description: '요일별 영업시간 (일 ~ 토 순)', type: () => [StoreMineHourItemResultDto]})
    hours: StoreMineHourItemResultDto[];

    @ApiProperty({description: '브레이크타임 (매일 · 시작 시각 순)', type: () => [StoreMineBreakItemResultDto]})
    breaks: StoreMineBreakItemResultDto[];

    @ApiProperty({description: '업체 정보 파일 (용도 · 정렬 순서)', type: () => [StoreMineFileItemResultDto]})
    files: StoreMineFileItemResultDto[];

    @ApiProperty({description: '수정일시 (ISO 8601)'})
    updated_at: string;
}
```

`libs/contracts/src/store/dto/store-mine-profile.dto.ts` (new)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min, ValidateNested} from 'class-validator';

/**
 * 업체 편의시설 (t_store.store_detail) — 보낸 항목만 남는다(통째로 교체). 선언하지 않은 항목은 service 가 버린다
 */
export class StoreMineProfileDetailDto {
    @ApiProperty({description: '방 칸수 (0 ~ 100)', required: false})
    @IsOptional()
    @IsInt({message: '방 칸수는 정수로 입력해주세요.'})
    @Min(0, {message: '방 칸수는 0 ~ 100 사이로 입력해주세요.'})
    @Max(100, {message: '방 칸수는 0 ~ 100 사이로 입력해주세요.'})
    room_count?: number;

    @ApiProperty({description: '샤워실 유무 (0 · 1)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: '샤워실 유무가 올바르지 않습니다.'})
    has_shower?: number;

    @ApiProperty({description: 'TV 유무 (0 · 1)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'TV 유무가 올바르지 않습니다.'})
    has_tv?: number;

    @ApiProperty({description: 'PC 유무 (0 · 1)', required: false, enum: [0, 1]})
    @IsOptional()
    @IsIn([0, 1], {message: 'PC 유무가 올바르지 않습니다.'})
    has_pc?: number;
}

/**
 * 내 업체 소개 수정 — 소개 · 연락처 · 편의시설. 상호명 · 주소 · 위경도 · 사업자등록번호는 총관리자가 바꾼다. 소개는 비우면 null
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

    @ApiProperty({description: '편의시설 — 보낸 항목으로 통째로 바꾼다(빠진 항목은 지운다, 모두 지우려면 {})', type: () => StoreMineProfileDetailDto})
    @Type(() => StoreMineProfileDetailDto)
    @ValidateNested({message: '편의시설 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '편의시설을 입력해주세요.'})
    store_detail: StoreMineProfileDetailDto;
}
```

`libs/contracts/src/store/dto/store-mine-file-upload-url.dto.ts` (new) — 용도는 업체 사진 고정(사업자등록증은 승인 뒤 바꾸지 않는다)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty} from 'class-validator';

/**
 * 내 업체 사진 업로드 주소 요청 — 업체 사진 5장까지(승인 때 넘어온 사진 포함)
 */
export class StoreMineFileUploadUrlDto {
    @ApiProperty({description: '올릴 사진의 MIME 타입 — 업로드할 때 같은 Content-Type 헤더로 PUT 한다', enum: ['image/jpeg', 'image/png']})
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 내 업체 사진 업로드 주소 — 이 주소로 PUT 한 뒤 file_key 로 사진을 등록한다
 */
export class StoreMineFileUploadUrlResultDto {
    @ApiProperty({description: '저장 키 — 사진 등록 때 보낸다'})
    file_key: string;

    @ApiProperty({description: '업로드 주소 (PUT, 10분 유효)'})
    upload_url: string;

    @ApiProperty({description: '업로드 주소 만료일시 (ISO 8601)'})
    expires_at: string;
}
```

`libs/contracts/src/store/dto/store-mine-file.dto.ts` (new)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, MaxLength} from 'class-validator';

/**
 * 내 업체 사진 등록 — 업로드 주소로 올린 사진의 키를 업체에 붙인다(마지막 순서)
 */
export class StoreMineFileDto {
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
 * 내 업체 사진 등록 결과
 */
export class StoreMineFileResultDto {
    @ApiProperty({description: '업체 정보 파일 ID'})
    store_file_id: string;
}
```

`libs/contracts/src/store/dto/store-mine-file-delete.dto.ts` (new)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 사진 삭제 path param — 업체 사진만(사업자등록증은 지울 수 없다)
 */
export class StoreMineFileDeleteParamDto {
    @ApiProperty({description: '업체 정보 파일 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 정보 파일 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 정보 파일 ID를 입력해주세요.'})
    store_file_id: string;
}
```

`libs/contracts/src/store/dto/store-mine-file-order.dto.ts` (new)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {ArrayMaxSize, IsArray, IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 사진 순서 변경 — 지금 업체 사진 ID 전부를 원하는 순서로(가장 앞이 대표)
 */
export class StoreMineFileOrderDto {
    @ApiProperty({description: '업체 사진 ID 전부를 원하는 순서로 — 빠지거나 남거나 겹치면 400', type: [String]})
    @Matches(/^[a-f0-9]{32}$/, {each: true, message: '업체 사진 ID가 올바르지 않습니다.'})
    @ArrayMaxSize(5, {message: '업체 사진은 5장까지입니다.'})
    @IsArray({message: '업체 사진 ID를 배열로 입력해주세요.'})
    @IsNotEmpty({message: '업체 사진 ID를 입력해주세요.'})
    store_file_ids: string[];
}
```

`libs/contracts/src/store/dto/store-mine-hours.dto.ts` (new) — 짝 필드 패턴(.beaver/memory/data-layer.md 영업시간 세트 규칙 → 이번에 docs 로 옮긴다)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {ArrayMaxSize, IsArray, IsIn, IsNotEmpty, Matches, ValidateIf, ValidateNested} from 'class-validator';

/**
 * 요일 영업시간 1개 — 휴무가 아니면 시작 · 마감 시각이 세트로 필수(t_store_hour CHK_StoreHour_OpenCloseTime). 휴무면 보낸 시각은 버린다
 */
export class StoreMineHourDto {
    @ApiProperty({description: '요일 (0: 일 ~ 6: 토)', enum: [0, 1, 2, 3, 4, 5, 6]})
    @IsIn([0, 1, 2, 3, 4, 5, 6], {message: '요일이 올바르지 않습니다.'})
    @IsNotEmpty({message: '요일을 입력해주세요.'})
    day_of_week: number;

    @ApiProperty({description: '휴무 여부 (0: 영업, 1: 휴무)', enum: [0, 1]})
    @IsIn([0, 1], {message: '휴무 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '휴무 여부를 입력해주세요.'})
    is_closed: number;

    // open_time / close_time 한 세트: 휴무가 아니면 둘 다 받는다. 휴무면 검증하지 않는다(service 가 NULL 로 저장)
    @ApiProperty({description: '영업 시작 시각 (HH:mm, 한국 시각) — 휴무가 아니면 close_time 과 세트로 필수', required: false})
    @ValidateIf((o) => o.is_closed !== 1)
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '영업 시작 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '휴무가 아니면 영업 시작 시각을 입력해주세요.'})
    open_time?: string;

    @ApiProperty({description: '영업 마감 시각 (HH:mm — 시작보다 이르면 다음 날 마감) — 휴무가 아니면 open_time 과 세트로 필수', required: false})
    @ValidateIf((o) => o.is_closed !== 1)
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '영업 마감 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '휴무가 아니면 영업 마감 시각을 입력해주세요.'})
    close_time?: string;
}

/**
 * 내 업체 영업시간 설정 — 통째로 교체. 연중무휴 1 이면 요일별 영업시간을 비우고, 0 이면 일 ~ 토 7개를 한 번씩 보낸다
 */
export class StoreMineHoursDto {
    @ApiProperty({description: '24시간 연중무휴 여부 (0: 요일별 영업시간, 1: 24시간 연중무휴)', enum: [0, 1]})
    @IsIn([0, 1], {message: '연중무휴 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '연중무휴 여부를 입력해주세요.'})
    is_always_open: number;

    @ApiProperty({description: '요일별 영업시간 — 연중무휴 0 이면 일 ~ 토 7개, 1 이면 빈 배열', type: () => [StoreMineHourDto]})
    @Type(() => StoreMineHourDto)
    @ValidateNested({each: true, message: '요일별 영업시간 형식이 올바르지 않습니다.'})
    @ArrayMaxSize(7, {message: '요일별 영업시간은 7개까지 입력할 수 있습니다.'})
    @IsArray({message: '요일별 영업시간을 배열로 입력해주세요.'})
    @IsNotEmpty({message: '요일별 영업시간을 입력해주세요.'})
    hours: StoreMineHourDto[];
}
```

`libs/contracts/src/store/dto/store-mine-breaks.dto.ts` (new)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {ArrayMaxSize, IsArray, IsNotEmpty, Matches, ValidateNested} from 'class-validator';

/**
 * 브레이크타임 1개 — 매일 같은 시각. 마감이 시작보다 이르면 다음 날까지(23:00 ~ 02:00)
 */
export class StoreMineBreakDto {
    @ApiProperty({description: '브레이크 시작 시각 (HH:mm, 한국 시각)'})
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '브레이크 시작 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '브레이크 시작 시각을 입력해주세요.'})
    start_time: string;

    @ApiProperty({description: '브레이크 마감 시각 (HH:mm — 시작보다 이르면 다음 날)'})
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {message: '브레이크 마감 시각을 HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '브레이크 마감 시각을 입력해주세요.'})
    end_time: string;
}

/**
 * 내 업체 브레이크타임 설정 — 통째로 교체(빈 배열이면 모두 지운다). 서로 겹치면 안 된다(끝점이 맞닿는 것은 된다)
 */
export class StoreMineBreaksDto {
    @ApiProperty({description: '브레이크타임 (매일 · 10개까지 · 서로 겹치면 400)', type: () => [StoreMineBreakDto]})
    @Type(() => StoreMineBreakDto)
    @ValidateNested({each: true, message: '브레이크타임 형식이 올바르지 않습니다.'})
    @ArrayMaxSize(10, {message: '브레이크타임은 10개까지 입력할 수 있습니다.'})
    @IsArray({message: '브레이크타임을 배열로 입력해주세요.'})
    @IsNotEmpty({message: '브레이크타임을 입력해주세요.'})
    breaks: StoreMineBreakDto[];
}
```

`libs/contracts/src/store/dto/store-mine-maintenance.dto.ts` (new)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, Max, Min} from 'class-validator';

/**
 * 내 업체 정비시간 설정 — 퇴실 후 다음 이용까지 호실을 막는 분
 */
export class StoreMineMaintenanceDto {
    @ApiProperty({description: '정비시간(분, 0 ~ 240)'})
    @IsInt({message: '정비시간은 분 단위 정수로 입력해주세요.'})
    @Min(0, {message: '정비시간은 0 ~ 240분 사이로 입력해주세요.'})
    @Max(240, {message: '정비시간은 0 ~ 240분 사이로 입력해주세요.'})
    @IsNotEmpty({message: '정비시간을 입력해주세요.'})
    maintenance_minutes: number;
}
```

`libs/contracts/src/store/dto/store-mine-open.dto.ts` (new)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty} from 'class-validator';

/**
 * 내 업체 영업중 여부 변경 — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님
 */
export class StoreMineOpenDto {
    @ApiProperty({description: '영업중 여부 (0: 영업중 아님, 1: 영업중)', enum: [0, 1]})
    @IsIn([0, 1], {message: '영업중 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '영업중 여부를 입력해주세요.'})
    is_open: number;
}
```

`libs/contracts/src/store/dto/store-mine-unavailable-period-list.dto.ts` (new) — 페이지만(StoreMyApplicationListDto 와 같은 모양)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 내 업체 일시 예약불가 목록 query — 페이지만. 끝나지 않은 것(종료 일시가 지금 이후)만, 시작 순
 */
export class StoreMineUnavailablePeriodListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<StoreMineUnavailablePeriodListDto>) {
        super(data);
    }
}

/**
 * 일시 예약불가 목록 항목
 */
export class StoreMineUnavailablePeriodItemResultDto {
    @ApiProperty({description: '일시 예약불가 ID'})
    store_unavailable_period_id: string;

    @ApiProperty({description: '시작 일시 (ISO 8601)'})
    starts_at: string;

    @ApiProperty({description: '종료 일시 (ISO 8601 — 이 시각부터 다시 예약을 받는다)'})
    ends_at: string;

    @ApiProperty({description: '메모 (간단한 사유)', nullable: true, type: String})
    memo: string | null;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 일시 예약불가 목록
 */
export class StoreMineUnavailablePeriodListResultDto {
    @ApiProperty({description: '목록 (시작 순)', type: () => [StoreMineUnavailablePeriodItemResultDto]})
    list: StoreMineUnavailablePeriodItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

`libs/contracts/src/store/dto/store-mine-unavailable-period.dto.ts` (new) — 입력은 한국 시각 분 단위, 없는 날짜(02-30)는 service 가 400

```ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 내 업체 일시 예약불가 등록 — 시작 일시 ~ 종료 일시(한국 시각 분 단위) 동안 예약을 받지 않는다. 다른 일시 예약불가와 겹치면 400
 */
export class StoreMineUnavailablePeriodDto {
    @ApiProperty({description: '시작 일시 (YYYY-MM-DD HH:mm, 한국 시각)'})
    @Matches(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/, {message: '시작 일시를 YYYY-MM-DD HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '시작 일시를 입력해주세요.'})
    starts_at: string;

    @ApiProperty({description: '종료 일시 (YYYY-MM-DD HH:mm, 한국 시각 — 시작보다 늦고 지금 이후, 이 시각부터 다시 예약을 받는다)'})
    @Matches(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/, {message: '종료 일시를 YYYY-MM-DD HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '종료 일시를 입력해주세요.'})
    ends_at: string;

    @ApiProperty({description: '메모 (30자 — 간단한 사유, 예: 내부 공사)', required: false})
    @IsOptional()
    @MaxLength(30, {message: '메모는 30자 이내로 입력해주세요.'})
    memo?: string;
}

/**
 * 일시 예약불가 등록 결과
 */
export class StoreMineUnavailablePeriodResultDto {
    @ApiProperty({description: '일시 예약불가 ID'})
    store_unavailable_period_id: string;
}
```

`libs/contracts/src/store/dto/store-mine-unavailable-period-delete.dto.ts` (new)

```ts
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 일시 예약불가 삭제 path param — 그 업체 것만(아니면 404)
 */
export class StoreMineUnavailablePeriodDeleteParamDto {
    @ApiProperty({description: '일시 예약불가 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '일시 예약불가 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '일시 예약불가 ID를 입력해주세요.'})
    store_unavailable_period_id: string;
}
```

### Business Logic — store constants · util

`apps/admin-service/src/store/store.constants.ts` — 새 상수 + 이번에 두 곳 이상에서 쓰게 되는 메시지를 상수로 올린다(기존 인라인 3곳을 같이 바꾼다 — service 절).

```ts
import type {StoreDetail} from '@app/database/entities/store/store.entity.js';

// ... 기존 상수 그대로

/** 용도별 파일 한도 — 신청 · 업체 1건 기준(업체 사진은 승인 때 넘어온 것 포함) */
export const STORE_FILE_LIMIT: Record<string, number> = {BUSINESS_LICENSE: 1, STORE_IMAGE: 5};

/** 편의시설(t_store.store_detail)로 저장하는 항목 — 검증 파이프가 선언 안 된 키를 거르지 않으므로 service 가 이 항목만 남긴다 */
export const STORE_DETAIL_KEYS: (keyof StoreDetail)[] = ['room_count', 'has_shower', 'has_tv', 'has_pc'];

/** 매니저의 소속 업체 없음 — 탈퇴 업체 포함 (내 업체 설정 13곳) */
export const STORE_MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';

/** 업체 정보 파일 없음 — 남의 신청 · 업체의 파일, 지울 수 없는 용도 포함 (신청 파일 삭제 · 업체 사진 삭제) */
export const STORE_FILE_NOT_FOUND_MESSAGE = '파일을 찾을 수 없습니다.';

/** 업로드 주소로 발급하지 않은 저장 키 (신청 파일 · 업체 사진 등록) */
export const STORE_FILE_KEY_INVALID_MESSAGE = '업로드 주소로 받은 저장 키가 아닙니다.';

/** 저장소에 아직 파일이 없다 (신청 파일 · 업체 사진 등록) */
export const STORE_FILE_NOT_UPLOADED_MESSAGE = '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.';

/** 바꾸려는 값이 지금과 같다 (업체 상태 · 영업중 여부) */
export const STORE_SAME_STATE_MESSAGE = '이미 같은 상태입니다.';

/** 일시 예약불가 입력 형식 — 한국 시각 분 단위 (dayjs 형식 문자열) */
export const STORE_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm';
```

`apps/admin-service/src/store/store.util.ts` — 키 발급 · 확인을 파일 전용 헬퍼로 묶어 신청 파일 · 업체 사진이 같이 쓴다(기존 `buildApplicationFileKey` · `isApplicationFileKey` 동작은 그대로). 이어서 업체 사진 · 영업시간 · 브레이크 겹침 · 일시 예약불가 · 변환.

```ts
import {randomUUID} from 'node:crypto';
import {ILike, LessThan, MoreThan} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {dayjs} from '@app/common/utils/dayjs.js';
import type {Dayjs} from '@app/common/utils/dayjs.js';
import type {StoreMineBreakDto} from '@app/contracts/store/dto/store-mine-breaks.dto.js';
import type {StoreMineHourDto} from '@app/contracts/store/dto/store-mine-hours.dto.js';
import type {StoreMineProfileDetailDto} from '@app/contracts/store/dto/store-mine-profile.dto.js';
import type {StoreMineUnavailablePeriodItemResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period-list.dto.js';
import type {StoreMineBreakItemResultDto, StoreMineFileItemResultDto, StoreMineHourItemResultDto, StoreMineResultDto} from '@app/contracts/store/dto/store-mine.dto.js';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import type {StoreDetail, StoreEntity} from '@app/database/entities/store/store.entity.js';
// ... 기존 import 그대로
import {STORE_DETAIL_KEYS, STORE_FILE_EXTENSION, STORE_FILE_PURPOSE} from './store.constants.js';

/**
 * 새 저장 키 — `<접두>/<uuid 32자>.<jpg|png>`. 업로드마다 새 키다(같은 키를 덮어쓰지 않는다 — CDN 캐시).
 *
 * @param prefix 접두 (끝에 / 없음)
 * @param content_type MIME 타입
 * @returns 저장 키
 */
function issueFileKey(prefix: string, content_type: string): string {
    return `${prefix}/${randomUUID().replace(/-/g, '')}.${STORE_FILE_EXTENSION[content_type]}`;
}

/**
 * 키가 그 접두 · 형식으로 발급한 모양(`<접두>/<uuid 32자>.<확장자>`)인지 — 남의 신청 · 업체 키나 다른 접두를 막는다.
 *
 * @param file_key 등록하려는 키
 * @param prefix 접두 (끝에 / 없음)
 * @param content_type MIME 타입
 * @returns 맞으면 true
 */
function isIssuedFileKey(file_key: string, prefix: string, content_type: string): boolean {
    const extension = STORE_FILE_EXTENSION[content_type];
    return Boolean(extension) && file_key.startsWith(`${prefix}/`) && new RegExp(`^[a-f0-9]{32}\\.${extension}$`).test(file_key.slice(prefix.length + 1));
}

/**
 * 신청 때 올리는 업체 정보 파일의 저장 키 — `<접두>/<uuid 32자>.<jpg|png>`. 업로드마다 새 키다(같은 키를 덮어쓰지 않는다 — CDN 캐시).
 *
 * @param is_private 용도의 비공개 여부
 * @param store_application_id 입점 신청 ID
 * @param content_type MIME 타입 (image/jpeg · image/png)
 * @returns 저장 키
 */
export function buildApplicationFileKey(is_private: number, store_application_id: string, content_type: string): string {
    return issueFileKey(applicationFilePrefix(is_private, store_application_id), content_type);
}

/**
 * 등록하려는 키가 그 신청 · 용도(비공개 여부) · 형식으로 발급한 키 모양인지 — 남의 신청 키나 다른 접두를 막는다.
 *
 * @param file_key 등록하려는 키
 * @param is_private 용도의 비공개 여부
 * @param store_application_id 입점 신청 ID
 * @param content_type MIME 타입
 * @returns 맞으면 true
 */
export function isApplicationFileKey(file_key: string, is_private: number, store_application_id: string, content_type: string): boolean {
    return isIssuedFileKey(file_key, applicationFilePrefix(is_private, store_application_id), content_type);
}

/**
 * 업체에 올리는 업체 정보 파일의 저장 키 접두 — 비공개 용도는 private/store/(CDN 이 읽지 못한다), 공개 용도는 store/(CDN).
 *
 * @param is_private 용도의 비공개 여부 (t_store_file_purpose.is_private)
 * @param store_id 업체 ID
 * @returns 접두 (끝에 / 없음)
 */
function storeFilePrefix(is_private: number, store_id: string): string {
    return is_private === 1 ? `private/store/${store_id}` : `store/${store_id}`;
}

/**
 * 업체 관리자가 올리는 업체 사진의 저장 키 — `<접두>/<uuid 32자>.<jpg|png>`(업로드마다 새 키).
 *
 * @param is_private 용도의 비공개 여부
 * @param store_id 업체 ID
 * @param content_type MIME 타입 (image/jpeg · image/png)
 * @returns 저장 키
 */
export function buildStoreFileKey(is_private: number, store_id: string, content_type: string): string {
    return issueFileKey(storeFilePrefix(is_private, store_id), content_type);
}

/**
 * 등록하려는 키가 그 업체 · 용도(비공개 여부) · 형식으로 발급한 키 모양인지.
 *
 * @param file_key 등록하려는 키
 * @param is_private 용도의 비공개 여부
 * @param store_id 업체 ID
 * @param content_type MIME 타입
 * @returns 맞으면 true
 */
export function isStoreFileKey(file_key: string, is_private: number, store_id: string, content_type: string): boolean {
    return isIssuedFileKey(file_key, storeFilePrefix(is_private, store_id), content_type);
}

/**
 * 업체 정보 파일 행 중 업체 사진만.
 *
 * @param rows 업체의 업체 정보 파일 행
 * @returns 업체 사진 행 (원래 순서)
 */
export function filterStoreImages(rows: StoreFileRow[]): StoreFileRow[] {
    return rows.filter((row) => row.store_file_purpose_id === STORE_FILE_PURPOSE.STORE_IMAGE);
}

/**
 * 새 업체 사진의 정렬 순서 — 지금 사진의 가장 큰 순서 + 1, 없으면 0. 삭제로 빈 번호가 있어도 마지막에 붙는다.
 *
 * @param images 지금 업체 사진 행
 * @returns 정렬 순서
 */
export function nextSortOrder(images: StoreFileRow[]): number {
    return images.length > 0 ? Math.max(...images.map((row) => Number(row.sort_order))) + 1 : 0;
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
 * 편의시설 — STORE_DETAIL_KEYS 항목 중 값이 있는 것만 담는다(선언 안 된 키 · null 은 버린다).
 *
 * @param dto 편의시설 입력
 * @returns t_store.store_detail 값
 */
export function buildStoreDetail(dto: StoreMineProfileDetailDto): StoreDetail {
    const detail: StoreDetail = {};
    for (const key of STORE_DETAIL_KEYS) {
        const value = dto[key];
        if (value !== undefined && value !== null) {
            detail[key] = value;
        }
    }
    return detail;
}

/**
 * 요일별 영업시간이 일 ~ 토 7개 요일을 한 번씩 담았는지 (요일 값은 DTO 가 0 ~ 6 으로 검증한다).
 *
 * @param hours 요일별 영업시간 입력
 * @returns 7개가 한 번씩이면 true
 */
export function hasEveryDayOnce(hours: StoreMineHourDto[]): boolean {
    return hours.length === 7 && new Set(hours.map((hour) => hour.day_of_week)).size === 7;
}

/**
 * 하루 안 시각('HH:mm' · 'HH:mm:ss')을 기준일(2000-01-01, UTC) 위의 dayjs 로 — 하루 안 시각끼리 비교 · 다음 날 넘김 계산에 쓴다(날짜 · 서버 시간대와 무관).
 *
 * @param time 하루 안 시각
 * @returns 기준일 위 시각
 */
function toTimeOfDay(time: string): Dayjs {
    return dayjs.utc(`2000-01-01 ${time}`);
}

/**
 * 하루 안 시각 두 개가 같은지 — 'HH:mm' · 'HH:mm:ss' 를 섞어도 된다.
 *
 * @param a 하루 안 시각
 * @param b 하루 안 시각
 * @returns 같으면 true
 */
export function isSameTimeOfDay(a: string, b: string): boolean {
    return toTimeOfDay(a).isSame(toTimeOfDay(b));
}

/**
 * 매일 반복하는 시각 범위를 기준일 위 [시작, 마감) 으로 — 마감이 시작보다 늦지 않으면 다음 날 마감(23:00 ~ 02:00 · 23:30 ~ 00:00).
 *
 * @param start_time 시작 'HH:mm'
 * @param end_time 마감 'HH:mm'
 * @returns [시작, 마감)
 */
function toDailyRange(start_time: string, end_time: string): [Dayjs, Dayjs] {
    const start = toTimeOfDay(start_time);
    const end = toTimeOfDay(end_time);
    return [start, end.isAfter(start) ? end : end.add(1, 'day')];
}

/**
 * 브레이크타임끼리 겹치는지 — 매일 반복이라 한쪽을 하루 앞 · 뒤로도 옮겨 비교한다(자정을 넘는 범위가 다음 날 이른 범위와 겹치는 경우 — 23:00 ~ 02:00 + 01:00 ~ 03:00).
 * 반열린 구간이라 끝점이 맞닿는 것(09:00 ~ 09:30 + 09:30 ~ 10:00 · 23:30 ~ 00:00 + 00:00 ~ 00:30)은 겹침이 아니다. 입력 순서와 무관.
 * 시작 = 마감인 항목은 미리 걸러야 한다(하루 전체로 본다).
 *
 * @param breaks 브레이크타임 입력
 * @returns 한 쌍이라도 겹치면 true
 */
export function hasOverlappingBreaks(breaks: StoreMineBreakDto[]): boolean {
    const ranges = breaks.map((item) => toDailyRange(item.start_time, item.end_time));
    return ranges.some(([aStart, aEnd], i) =>
        ranges.slice(i + 1).some(([bStart, bEnd]) => [-1, 0, 1].some((days) => aStart.isBefore(bEnd.add(days, 'day')) && bStart.add(days, 'day').isBefore(aEnd))),
    );
}

/**
 * 일시 예약불가 겹침 WHERE — 그 업체의 다른 범위 중 시작 < 새 종료 그리고 종료 > 새 시작(반열린 구간 — 맞닿는 것은 겹침 아님).
 *
 * @param store_id 업체 ID
 * @param starts_at 새 시작 일시
 * @param ends_at 새 종료 일시
 * @returns WHERE
 */
export function buildUnavailablePeriodOverlapWhere(store_id: string, starts_at: Date, ends_at: Date): FindOptionsWhere<StoreUnavailablePeriodEntity> {
    return {store_id, starts_at: LessThan(ends_at), ends_at: MoreThan(starts_at)};
}

/**
 * time 컬럼 값('HH:mm:ss') → 'HH:mm'.
 *
 * @param time 하루 안 시각
 * @returns 'HH:mm'
 */
function toHourMinute(time: string): string {
    return toTimeOfDay(time).format('HH:mm');
}

/**
 * 내 업체의 요일 영업시간 항목 — 휴무면 시각 null.
 *
 * @param entity 요일 영업시간
 * @returns 항목
 */
export function toMineHourItem(entity: StoreHourEntity): StoreMineHourItemResultDto {
    return {
        day_of_week: entity.day_of_week,
        is_closed: entity.is_closed,
        open_time: entity.open_time ? toHourMinute(entity.open_time) : null,
        close_time: entity.close_time ? toHourMinute(entity.close_time) : null,
    };
}

/**
 * 내 업체의 브레이크타임 항목.
 *
 * @param entity 브레이크타임
 * @returns 항목
 */
export function toMineBreakItem(entity: StoreBreakEntity): StoreMineBreakItemResultDto {
    return {store_break_id: entity.store_break_id, start_time: toHourMinute(entity.start_time), end_time: toHourMinute(entity.end_time)};
}

/**
 * 내 업체의 업체 정보 파일 항목.
 *
 * @param row 파일 행
 * @param file_url 열람 주소
 * @returns 항목
 */
export function toMineFileItem(row: StoreFileRow, file_url: string): StoreMineFileItemResultDto {
    return {
        store_file_id: row.store_file_id,
        store_file_purpose_id: row.store_file_purpose_id,
        file_name: row.file_name,
        content_type: row.content_type,
        is_private: Number(row.is_private),
        file_url,
        sort_order: Number(row.sort_order),
        created_at: new Date(row.created_at).toISOString(),
    };
}

/**
 * 내 업체 상세 (업체 관리자).
 *
 * @param entity 업체
 * @param hours 요일별 영업시간 항목
 * @param breaks 브레이크타임 항목
 * @param files 파일 항목
 * @returns 상세
 */
export function toMineDetail(entity: StoreEntity, hours: StoreMineHourItemResultDto[], breaks: StoreMineBreakItemResultDto[], files: StoreMineFileItemResultDto[]): StoreMineResultDto {
    return {
        store_id: entity.store_id,
        store_code: entity.store_code,
        store_state_id: entity.store_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail ?? null,
        latitude: entity.latitude,
        longitude: entity.longitude,
        introduction: entity.introduction ?? null,
        store_detail: {...entity.store_detail},
        is_always_open: entity.is_always_open,
        is_open: entity.is_open,
        maintenance_minutes: entity.maintenance_minutes,
        hours,
        breaks,
        files,
        updated_at: entity.updated_at.toISOString(),
    };
}

/**
 * 일시 예약불가 목록 항목.
 *
 * @param entity 일시 예약불가
 * @returns 항목
 */
export function toUnavailablePeriodItem(entity: StoreUnavailablePeriodEntity): StoreMineUnavailablePeriodItemResultDto {
    return {
        store_unavailable_period_id: entity.store_unavailable_period_id,
        starts_at: entity.starts_at.toISOString(),
        ends_at: entity.ends_at.toISOString(),
        memo: entity.memo ?? null,
        created_at: entity.created_at.toISOString(),
    };
}
```

### Data Access — store repository

`apps/admin-service/src/store/interfaces/store.repository.interface.ts` — 추가 12개(형제: `findStoreList` · `deleteApplication` · `updateApplication`)

```ts
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import type {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import type {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';

/**
 * store repository 포트 — 입점 신청 · 업체 · 업체 정보 파일 · 영업시간 · 브레이크타임 · 일시 예약불가와,
 * store 어휘로 다루는 t_user(신청자 · 업체 총관리자 · 업체 매니저 · 업체 관리자의 소속 업체)를 다룬다.
 * (나머지 설명 그대로)
 */
export interface StoreRepositoryInterface {
    // ... 기존 메서드 그대로
    /** 업체 정보 파일 수정 (업체 사진 정렬 순서) */
    updateStoreFile(where: FindOptionsWhere<StoreFileEntity>, entity: StoreFileEntity): Promise<void>;
    /** 매니저의 소속 업체 (탈퇴 업체 제외) — lock 이면 업체 행을 잠근다(쓰기 트랜잭션 안에서만) */
    findStoreByManager(user_id: string, lock: boolean): Promise<StoreEntity | null>;
    /** 업체의 요일별 영업시간 — 요일 순 */
    findStoreHours(store_id: string): Promise<StoreHourEntity[]>;
    /** 요일별 영업시간 삭제 (교체) */
    deleteStoreHours(where: FindOptionsWhere<StoreHourEntity>): Promise<void>;
    /** 요일별 영업시간 등록 (교체) */
    insertStoreHours(entities: StoreHourEntity[]): Promise<void>;
    /** 업체의 브레이크타임 — 시작 시각 순 */
    findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]>;
    /** 브레이크타임 삭제 (교체) */
    deleteStoreBreaks(where: FindOptionsWhere<StoreBreakEntity>): Promise<void>;
    /** 브레이크타임 등록 (교체) */
    insertStoreBreaks(entities: StoreBreakEntity[]): Promise<void>;
    /** 일시 예약불가 개수 — 목록 · 겹침 확인 */
    countUnavailablePeriods(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<number>;
    /** 일시 예약불가 목록 — 시작 순 */
    findUnavailablePeriodList(where: FindOptionsWhere<StoreUnavailablePeriodEntity>, limit: number, offset: number): Promise<StoreUnavailablePeriodEntity[]>;
    /** 일시 예약불가 등록 */
    insertUnavailablePeriod(entity: StoreUnavailablePeriodEntity): Promise<void>;
    /** 일시 예약불가 삭제 — 조건에 맞는 행을 지웠으면 true */
    deleteUnavailablePeriod(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<boolean>;
}
```

`apps/admin-service/src/store/repositories/store.repository.ts` — 새 getter 3 · 메서드 12 · 빌더 4. 영업시간 · 브레이크 · 일시 예약불가는 제약이 걸려도 service 가 먼저 막는다(요일 7개 한 번씩 · 시작 < 종료, 교체는 업체 행 잠금 안) — 위반은 통일 500(insertHeadManager 와 같은 판단).

```ts
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
import {STORE_BUSINESS_NUMBER_TAKEN_MESSAGE, STORE_STATE} from '../store.constants.js';

/**
 * store repository (아웃바운드 어댑터) — t_store_application · t_store · t_store_file · t_store_file_purpose · t_store_hour · t_store_break · t_store_unavailable_period 와
 * 공유 DB 의 t_user(신청자 · 업체 총관리자 · 업체 매니저)를 직접 다룬다. `txHost.tx` 는 `@Transactional()` 범위 안에서는 트랜잭션 EntityManager 다.
 */
@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    // ... 기존 getter 그대로

    /** t_store_hour repository (현재 트랜잭션 기준) */
    private get storeHours(): Repository<StoreHourEntity> {
        return this.txHost.tx.getRepository(StoreHourEntity);
    }

    /** t_store_break repository (현재 트랜잭션 기준) */
    private get storeBreaks(): Repository<StoreBreakEntity> {
        return this.txHost.tx.getRepository(StoreBreakEntity);
    }

    /** t_store_unavailable_period repository (현재 트랜잭션 기준) */
    private get unavailablePeriods(): Repository<StoreUnavailablePeriodEntity> {
        return this.txHost.tx.getRepository(StoreUnavailablePeriodEntity);
    }

    // ... 기존 메서드 그대로 (deleteStoreFile 다음에)

    /**
     * 업체 정보 파일 수정 — 업체 사진 정렬 순서
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateStoreFile(where: FindOptionsWhere<StoreFileEntity>, entity: StoreFileEntity): Promise<void> {
        try {
            await this.storeFiles.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    // ... (updateStore 다음에)

    /**
     * 매니저의 소속 업체 — 매니저 그룹 회원의 store_id 로 찾는다. 탈퇴 업체는 없는 것과 같다.
     *
     * @param user_id 로그인 매니저 ID
     * @param lock true 면 업체 행을 잠근다(FOR UPDATE — 같은 업체의 설정 쓰기를 한 번에 하나로). 트랜잭션 안에서만
     * @returns 업체 또는 null
     */
    async findStoreByManager(user_id: string, lock: boolean): Promise<StoreEntity | null> {
        try {
            return await this.buildStoreByManagerQuery(user_id, lock).getOne();
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
    buildStoreByManagerQuery(user_id: string, lock: boolean): SelectQueryBuilder<StoreEntity> {
        const query = this.stores
            .createQueryBuilder('s')
            .innerJoin(UserEntity, 'u', 'u.store_id = s.store_id')
            .where('u.user_id = :user_id', {user_id})
            .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
            .andWhere('s.store_state_id <> :leave', {leave: STORE_STATE.LEAVE})
            .loadAllRelationIds();
        return lock ? query.setLock('pessimistic_write', undefined, ['s']) : query;
    }

    /**
     * 업체의 요일별 영업시간
     *
     * @param store_id 업체 ID
     * @returns 요일 순
     */
    async findStoreHours(store_id: string): Promise<StoreHourEntity[]> {
        try {
            return await this.buildStoreHoursQuery(store_id).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 요일별 영업시간 쿼리 — 매핑 민감(관계 필드 where · 정렬)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreHoursQuery(store_id: string): SelectQueryBuilder<StoreHourEntity> {
        return this.storeHours.createQueryBuilder('h').setFindOptions({where: {store_id}, order: {day_of_week: 'ASC'}, loadRelationIds: true});
    }

    /**
     * 요일별 영업시간 삭제 — 교체
     *
     * @param where 삭제 조건
     */
    async deleteStoreHours(where: FindOptionsWhere<StoreHourEntity>): Promise<void> {
        try {
            await this.storeHours.delete(where);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 요일별 영업시간 등록 — 교체. 요일 UK · 시각 CHECK 는 service 가 먼저 막으므로 위반은 통일 500
     *
     * @param entities new StoreHourEntity() + 할당 (요일마다 1개)
     */
    async insertStoreHours(entities: StoreHourEntity[]): Promise<void> {
        try {
            await this.storeHours.insert(entities);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체의 브레이크타임
     *
     * @param store_id 업체 ID
     * @returns 시작 시각 순
     */
    async findStoreBreaks(store_id: string): Promise<StoreBreakEntity[]> {
        try {
            return await this.buildStoreBreaksQuery(store_id).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 브레이크타임 쿼리 — 매핑 민감(관계 필드 where · 정렬)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreBreaksQuery(store_id: string): SelectQueryBuilder<StoreBreakEntity> {
        return this.storeBreaks.createQueryBuilder('b').setFindOptions({where: {store_id}, order: {start_time: 'ASC'}, loadRelationIds: true});
    }

    /**
     * 브레이크타임 삭제 — 교체
     *
     * @param where 삭제 조건
     */
    async deleteStoreBreaks(where: FindOptionsWhere<StoreBreakEntity>): Promise<void> {
        try {
            await this.storeBreaks.delete(where);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 브레이크타임 등록 — 교체
     *
     * @param entities new StoreBreakEntity() + 할당
     */
    async insertStoreBreaks(entities: StoreBreakEntity[]): Promise<void> {
        try {
            await this.storeBreaks.insert(entities);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 개수
     *
     * @param where 조회 조건 (목록 — 끝나지 않은 것, 겹침 — buildUnavailablePeriodOverlapWhere)
     * @returns 개수
     */
    async countUnavailablePeriods(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<number> {
        try {
            return await this.unavailablePeriods.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 목록
     *
     * @param where 조회 조건
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 시작 순
     */
    async findUnavailablePeriodList(where: FindOptionsWhere<StoreUnavailablePeriodEntity>, limit: number, offset: number): Promise<StoreUnavailablePeriodEntity[]> {
        try {
            return await this.buildUnavailablePeriodListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 목록 쿼리 — 매핑 민감(관계 필드 where · MoreThan · LessThan 시각 비교)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     * 겹침 조건(count)도 같은 FindOptions where 경로라 Smoke 는 두 조건을 모두 이 빌더로 고정한다.
     *
     * @param where 조회 조건
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildUnavailablePeriodListQuery(where: FindOptionsWhere<StoreUnavailablePeriodEntity>, limit: number, offset: number): SelectQueryBuilder<StoreUnavailablePeriodEntity> {
        return this.unavailablePeriods.createQueryBuilder('p').setFindOptions({where, order: {starts_at: 'ASC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 일시 예약불가 등록 — 시작 < 종료(CHECK)는 service 가 먼저 막으므로 위반은 통일 500
     *
     * @param entity new StoreUnavailablePeriodEntity() + 할당
     */
    async insertUnavailablePeriod(entity: StoreUnavailablePeriodEntity): Promise<void> {
        try {
            await this.unavailablePeriods.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 일시 예약불가 삭제 — 업체를 조건에 넣으면 남의 업체 것은 0건이다.
     *
     * @param where 삭제 조건
     * @returns 지웠으면 true, 조건에 맞는 행이 없으면 false
     */
    async deleteUnavailablePeriod(where: FindOptionsWhere<StoreUnavailablePeriodEntity>): Promise<boolean> {
        try {
            const result = await this.unavailablePeriods.delete(where);
            return result.affected === 1;
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
```

build 확인: `buildStoreByManagerQuery` 의 `loadAllRelationIds` 가 `store_state_id` 를 문자열로 채우는지(관계 속성이 객체 · undefined 가 되면 상세의 `store_state_id` 가 틀린다)를 PGlite scratch(마이그레이션 적용 DB 에 업체 · 매니저 1행)로 `getOne()` · 잠금(트랜잭션 안) 둘 다 확인한다. 어긋나면 `setFindOptions({loadRelationIds: true})` + `innerJoin` 으로 바꾸고 Smoke 를 그 SQL 로 고정한다. (build 확인 결과: `{disableMixedMap: true}` 는 `{store_state_id: "ACTIVE"}` 객체로 채워 옵션 없는 `loadAllRelationIds()` 로 고쳤다 — SQL 같음)

### Business Logic — store service

`apps/admin-service/src/store/store.service.ts` — 기존 메서드 아래에 13개. 형제 근거: 업로드 주소 · 등록 · 삭제(`createMyApplicationFileUploadUrl` · `addMyApplicationFile` · `removeMyApplicationFile` — 용도 · 키 모양 · 한도 · exists · 저장소 삭제 마지막), 같은 값 400(`changeStoreState`), 목록(`getStoreList` — count → Pagination → 목록), 조건 삭제 boolean(`cancelMyApplication`).

기존 인라인 메시지 교체(§1.7 — 이번에 두 곳 이상이 된다):

```ts
// addMyApplicationFile 3. 키 모양 · 5. 업로드 확인
if (!isApplicationFileKey(dto.file_key, purpose.is_private, store_application_id, dto.content_type)) {
    throw new BadRequestException({message: STORE_FILE_KEY_INVALID_MESSAGE, validation_errors: createValidationError('file_key', STORE_FILE_KEY_INVALID_MESSAGE)});
}
// ...
if (!uploaded) {
    throw new BadRequestException({message: STORE_FILE_NOT_UPLOADED_MESSAGE});
}

// removeMyApplicationFile 2. 그 신청의 파일
if (!file) {
    throw new NotFoundException({message: STORE_FILE_NOT_FOUND_MESSAGE});
}

// changeStoreState 1.
if (store.store_state_id === dto.store_state_id) {
    throw new BadRequestException({message: STORE_SAME_STATE_MESSAGE});
}
```

import · 클래스 설명

```ts
import {In, MoreThan} from 'typeorm';
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';
import type {StoreMineBreaksDto} from '@app/contracts/store/dto/store-mine-breaks.dto.js';
import type {StoreMineFileOrderDto} from '@app/contracts/store/dto/store-mine-file-order.dto.js';
import type {StoreMineFileUploadUrlDto, StoreMineFileUploadUrlResultDto} from '@app/contracts/store/dto/store-mine-file-upload-url.dto.js';
import type {StoreMineFileDto, StoreMineFileResultDto} from '@app/contracts/store/dto/store-mine-file.dto.js';
import type {StoreMineHoursDto} from '@app/contracts/store/dto/store-mine-hours.dto.js';
import type {StoreMineMaintenanceDto} from '@app/contracts/store/dto/store-mine-maintenance.dto.js';
import type {StoreMineOpenDto} from '@app/contracts/store/dto/store-mine-open.dto.js';
import type {StoreMineProfileDto} from '@app/contracts/store/dto/store-mine-profile.dto.js';
import type {StoreMineUnavailablePeriodListDto, StoreMineUnavailablePeriodListResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period-list.dto.js';
import type {StoreMineUnavailablePeriodDto, StoreMineUnavailablePeriodResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period.dto.js';
import type {StoreMineFileItemResultDto, StoreMineResultDto} from '@app/contracts/store/dto/store-mine.dto.js';
import {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
import {StoreHourEntity} from '@app/database/entities/store/store-hour.entity.js';
import {StoreUnavailablePeriodEntity} from '@app/database/entities/store/store-unavailable-period.entity.js';
// (`import type {FindOptionsWhere} from 'typeorm'` 는 이미 있다)
// constants: + STORE_DATETIME_FORMAT · STORE_FILE_KEY_INVALID_MESSAGE · STORE_FILE_NOT_FOUND_MESSAGE · STORE_FILE_NOT_UPLOADED_MESSAGE · STORE_MANAGER_STORE_NOT_FOUND_MESSAGE · STORE_SAME_STATE_MESSAGE
// util: + buildStoreDetail · buildStoreFileKey · buildUnavailablePeriodOverlapWhere · filterStoreImages · hasEveryDayOnce · hasOverlappingBreaks · isSameIdSet · isSameTimeOfDay · isStoreFileKey · nextSortOrder
//       · toMineBreakItem · toMineDetail · toMineFileItem · toMineHourItem · toUnavailablePeriodItem

/**
 * store 도메인 비즈니스 로직 (헥사고날의 안쪽) — 입점 신청(이용자) · 신청 관리 · 업체 관리(총관리자) · 내 업체 설정(업체 관리자).
 * 내부 HTTP 컨트롤러와 RabbitMQ 핸들러가 같은 메서드를 호출한다. public 메서드 1개 = API 1개.
 * 로그인 그룹(이용자 · 매니저 · 관리자)은 게이트웨이 가드가 가른다 — 이 service 는 actor 의 user_id 만 받는다.
 * 내 업체 설정은 actor 로 소속 업체를 찾고(findStoreByManager), 쓰기는 업체 행을 잠가 같은 업체의 설정 쓰기를 한 번에 하나로 한다.
 * 업체 정보 파일의 열람 주소는 용도의 is_private 로 고른다 — 1 이면 서명된 열람 주소, 0 이면 CDN 공개 주소.
 */
```

메서드 13개 (`changeStoreState` 다음에)

```ts
    /**
     * 내 업체 상세 (업체 관리자) — 업체 정보 · 업체코드 · 영업 설정 · 요일별 영업시간 · 브레이크타임 · 업체 정보 파일 열람 주소. (내부 HTTP: GET /internal/v1/admin-service/store/mine)
     *
     * @param user_id 로그인 매니저 ID
     * @returns 내 업체 상세
     */
    async getMyStore(user_id: string): Promise<StoreMineResultDto> {
        const store = await this.storeRepository.findStoreByManager(user_id, false);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const hours = await this.storeRepository.findStoreHours(store.store_id);
        const breaks = await this.storeRepository.findStoreBreaks(store.store_id);
        const rows = await this.storeRepository.findStoreFileRows(store.store_id);
        const files: StoreMineFileItemResultDto[] = [];
        for (const row of rows) {
            const file_url = Number(row.is_private) === 1 ? (await this.storageGateway.createDownloadUrl(row.file_key)).download_url : this.storageGateway.getPublicUrl(row.file_key);
            files.push(toMineFileItem(row, file_url));
        }
        return toMineDetail(store, hours.map(toMineHourItem), breaks.map(toMineBreakItem), files);
    }

    /**
     * 내 업체 소개 수정 (업체 관리자) — 소개 · 연락처 · 편의시설. 편의시설은 보낸 항목으로 통째로 바꾼다(알려진 항목만). (RabbitMQ: admin.store.mine-profile)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 소개 · 연락처 · 편의시설
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
        storeEntity.store_detail = buildStoreDetail(dto.store_detail);
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }

    /**
     * 내 업체 사진 업로드 주소 (업체 관리자) — 업체 사진 한도(승인 때 넘어온 사진 포함) 안에서만. 키는 서버가 용도의 비공개 여부로 만든다. (내부 HTTP: POST /internal/v1/admin-service/store/mine/file/upload-url)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto MIME 타입
     * @returns 저장 키 · 업로드 주소 · 만료 시각
     */
    async createMyStoreFileUploadUrl(user_id: string, dto: StoreMineFileUploadUrlDto): Promise<StoreMineFileUploadUrlResultDto> {
        // 1. 내 업체
        const store = await this.storeRepository.findStoreByManager(user_id, false);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 업체 사진 용도 (비공개 여부)
        const purpose = await this.storeRepository.findStoreFilePurpose(STORE_FILE_PURPOSE.STORE_IMAGE);
        if (!purpose) {
            throw new BadRequestException({message: STORE_FILE_PURPOSE_INVALID_MESSAGE});
        }

        // 3. 한도
        const count = await this.storeRepository.countStoreFiles({store_id: store.store_id, store_file_purpose_id: STORE_FILE_PURPOSE.STORE_IMAGE});
        if (count >= STORE_FILE_LIMIT[STORE_FILE_PURPOSE.STORE_IMAGE]) {
            throw new BadRequestException({message: STORE_FILE_LIMIT_MESSAGE});
        }

        // 4. 키 → 업로드 주소
        const file_key = buildStoreFileKey(purpose.is_private, store.store_id, dto.content_type);
        const upload = await this.storageGateway.createUploadUrl({key: file_key, content_type: dto.content_type});
        return {file_key, upload_url: upload.upload_url, expires_at: upload.expires_at.toISOString()};
    }

    /**
     * 내 업체 사진 등록 (업체 관리자) — 업로드 주소로 올린 사진의 키를 업체에 붙인다(신청 없음). (RabbitMQ: admin.store.mine-file)
     * - 키 모양(그 업체 · 용도의 비공개 여부 · 형식) · 한도 · 실제 업로드(exists) 확인
     * - 정렬 순서는 지금 사진의 가장 큰 순서 + 1 — 삭제로 빈 번호가 있어도 마지막에 붙는다
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 키 · 파일명 · MIME 타입
     * @returns 업체 정보 파일 ID
     */
    @Transactional()
    async addMyStoreFile(user_id: string, dto: StoreMineFileDto): Promise<StoreMineFileResultDto> {
        // 1. 내 업체 (잠금 — 한도 확인 · 등록을 한 번에 하나)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 업체 사진 용도 (비공개 여부)
        const purpose = await this.storeRepository.findStoreFilePurpose(STORE_FILE_PURPOSE.STORE_IMAGE);
        if (!purpose) {
            throw new BadRequestException({message: STORE_FILE_PURPOSE_INVALID_MESSAGE});
        }

        // 3. 키 모양 — 그 업체 · 용도 · 형식으로 발급한 키만
        if (!isStoreFileKey(dto.file_key, purpose.is_private, store.store_id, dto.content_type)) {
            throw new BadRequestException({message: STORE_FILE_KEY_INVALID_MESSAGE, validation_errors: createValidationError('file_key', STORE_FILE_KEY_INVALID_MESSAGE)});
        }

        // 4. 한도
        const images = filterStoreImages(await this.storeRepository.findStoreFileRows(store.store_id));
        if (images.length >= STORE_FILE_LIMIT[STORE_FILE_PURPOSE.STORE_IMAGE]) {
            throw new BadRequestException({message: STORE_FILE_LIMIT_MESSAGE});
        }

        // 5. 실제로 올라갔는지
        const uploaded = await this.storageGateway.exists(dto.file_key);
        if (!uploaded) {
            throw new BadRequestException({message: STORE_FILE_NOT_UPLOADED_MESSAGE});
        }

        // 6. 사진 등록 — 업체에만 붙는다, 마지막 순서
        const file = new StoreFileEntity();
        file.store_file_id = generateId();
        file.store_file_purpose_id = STORE_FILE_PURPOSE.STORE_IMAGE;
        file.store_application_id = null;
        file.store_id = store.store_id;
        file.file_key = dto.file_key;
        file.file_name = dto.file_name;
        file.content_type = dto.content_type;
        file.sort_order = nextSortOrder(images);
        await this.storeRepository.insertStoreFile(file);
        return {store_file_id: file.store_file_id};
    }

    /**
     * 내 업체 사진 삭제 (업체 관리자) — 그 업체의 업체 사진만(사업자등록증은 지울 수 없어 없는 파일과 같은 404). 행을 지운 뒤 저장소 파일을 지운다(마지막). 남은 사진의 순서 번호는 그대로. (RabbitMQ: admin.store.mine-file-delete)
     *
     * @param user_id 로그인 매니저 ID
     * @param store_file_id 업체 정보 파일 ID
     */
    @Transactional()
    async removeMyStoreFile(user_id: string, store_file_id: string): Promise<void> {
        // 1. 내 업체 (잠금)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 그 업체의 업체 사진
        const file = await this.storeRepository.findStoreFile({store_file_id, store_id: store.store_id, store_file_purpose_id: STORE_FILE_PURPOSE.STORE_IMAGE});
        if (!file) {
            throw new NotFoundException({message: STORE_FILE_NOT_FOUND_MESSAGE});
        }

        // 3. 행 삭제 → 저장소 파일 삭제(마지막)
        await this.storeRepository.deleteStoreFile({store_file_id});
        await this.storageGateway.remove(file.file_key);
    }

    /**
     * 내 업체 사진 순서 변경 (업체 관리자) — 지금 업체 사진 ID 전부를 원하는 순서로 받아 0 부터 다시 매긴다(가장 앞이 대표). (RabbitMQ: admin.store.mine-file-order)
     * - 빠지거나 남거나 겹치면 400 (validation_errors.store_file_ids)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 업체 사진 ID 순서
     */
    @Transactional()
    async reorderMyStoreFiles(user_id: string, dto: StoreMineFileOrderDto): Promise<void> {
        // 1. 내 업체 (잠금 — 등록 · 삭제와 엇갈리지 않게)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 지금 업체 사진 전부를 한 번씩
        const images = filterStoreImages(await this.storeRepository.findStoreFileRows(store.store_id));
        if (!isSameIdSet(dto.store_file_ids, images.map((row) => row.store_file_id))) {
            throw new BadRequestException({
                message: '업체 사진 전체를 한 번씩 원하는 순서로 보내주세요.',
                validation_errors: createValidationError('store_file_ids', '업체 사진 전체를 한 번씩 원하는 순서로 보내주세요.'),
            });
        }

        // 3. 받은 순서대로 0 부터
        for (const [index, store_file_id] of dto.store_file_ids.entries()) {
            const file = new StoreFileEntity();
            file.sort_order = index;
            await this.storeRepository.updateStoreFile({store_file_id}, file);
        }
    }

    /**
     * 내 업체 영업시간 설정 (업체 관리자) — 연중무휴 여부 + 요일별 영업시간을 통째로 교체한다(요일 행을 지우고 다시 넣는다). (RabbitMQ: admin.store.mine-hours)
     * - 연중무휴 1 → 요일 행을 모두 지운다(hours 가 비어 있지 않으면 400). 연중무휴 0 → 일 ~ 토 7개가 한 번씩(아니면 400)
     * - 휴무가 아닌 요일은 시작 · 마감 둘 다(DTO 짝 필드), 휴무면 둘 다 NULL 로 저장한다(CHK_StoreHour_OpenCloseTime)
     * - 시작 = 마감은 400 — 24시간은 연중무휴로만(사용자 결정 2026-10-27). 마감이 시작보다 이르면 다음 날 마감
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 연중무휴 여부 · 요일별 영업시간
     */
    @Transactional()
    async replaceMyStoreHours(user_id: string, dto: StoreMineHoursDto): Promise<void> {
        // 1. 내 업체 (잠금 — 교체 두 건이 엇갈리지 않게)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 연중무휴 ↔ 요일별 영업시간
        if (dto.is_always_open === 1 && dto.hours.length > 0) {
            throw new BadRequestException({message: '24시간 연중무휴면 요일별 영업시간을 비워주세요.', validation_errors: createValidationError('hours', '24시간 연중무휴면 요일별 영업시간을 비워주세요.')});
        }
        if (dto.is_always_open === 0 && !hasEveryDayOnce(dto.hours)) {
            throw new BadRequestException({message: '일 ~ 토 7개 요일의 영업시간을 한 번씩 입력해주세요.', validation_errors: createValidationError('hours', '일 ~ 토 7개 요일의 영업시간을 한 번씩 입력해주세요.')});
        }

        // 3. 영업하는 요일의 시작 = 마감
        const sameIndex = dto.hours.findIndex((hour) => hour.is_closed !== 1 && hour.open_time !== undefined && hour.close_time !== undefined && isSameTimeOfDay(hour.open_time, hour.close_time));
        if (sameIndex >= 0) {
            throw new BadRequestException({
                message: '영업 시작과 마감 시각이 같을 수 없습니다. 24시간 영업은 연중무휴로 설정해주세요.',
                validation_errors: createValidationError(`hours.${sameIndex}.close_time`, '영업 시작과 마감 시각이 같을 수 없습니다. 24시간 영업은 연중무휴로 설정해주세요.'),
            });
        }

        // 4. 교체 — 요일 행 삭제 → 다시 넣기(연중무휴면 넣지 않는다) → 연중무휴 여부
        await this.storeRepository.deleteStoreHours({store_id: store.store_id});
        const entities: StoreHourEntity[] = [];
        for (const hour of dto.hours) {
            const entity = new StoreHourEntity();
            entity.store_hour_id = generateId();
            entity.store_id = store.store_id;
            entity.day_of_week = hour.day_of_week;
            entity.is_closed = hour.is_closed;
            entity.open_time = hour.is_closed === 1 ? null : (hour.open_time ?? null);
            entity.close_time = hour.is_closed === 1 ? null : (hour.close_time ?? null);
            entities.push(entity);
        }
        if (entities.length > 0) {
            await this.storeRepository.insertStoreHours(entities);
        }
        const storeEntity = new StoreEntity();
        storeEntity.is_always_open = dto.is_always_open;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }

    /**
     * 내 업체 브레이크타임 설정 (업체 관리자) — 매일 같은 브레이크타임 목록을 통째로 교체한다(빈 배열이면 모두 지운다). (RabbitMQ: admin.store.mine-breaks)
     * - 시작 = 마감은 400. 마감이 시작보다 이르면 다음 날까지(23:30 ~ 00:00 · 23:00 ~ 02:00)
     * - 서로 겹치면 400 — 반열린 구간이라 끝점이 맞닿는 것(09:00 ~ 09:30 + 09:30 ~ 10:00)은 된다(사용자 결정 2026-10-27)
     * - 영업시간 밖이어도 막지 않는다 — 예약 가능 시간 계산(Phase 17)에서 빠질 뿐이다
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 브레이크타임 목록
     */
    @Transactional()
    async replaceMyStoreBreaks(user_id: string, dto: StoreMineBreaksDto): Promise<void> {
        // 1. 내 업체 (잠금 — 교체 두 건이 합쳐져 겹치지 않게)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 시작 = 마감
        const sameIndex = dto.breaks.findIndex((item) => isSameTimeOfDay(item.start_time, item.end_time));
        if (sameIndex >= 0) {
            throw new BadRequestException({
                message: '브레이크타임의 시작과 마감 시각이 같을 수 없습니다.',
                validation_errors: createValidationError(`breaks.${sameIndex}.end_time`, '브레이크타임의 시작과 마감 시각이 같을 수 없습니다.'),
            });
        }

        // 3. 서로 겹침
        if (hasOverlappingBreaks(dto.breaks)) {
            throw new BadRequestException({message: '브레이크타임이 서로 겹칩니다.', validation_errors: createValidationError('breaks', '브레이크타임이 서로 겹칩니다.')});
        }

        // 4. 교체 — 삭제 → 다시 넣기
        await this.storeRepository.deleteStoreBreaks({store_id: store.store_id});
        const entities: StoreBreakEntity[] = [];
        for (const item of dto.breaks) {
            const entity = new StoreBreakEntity();
            entity.store_break_id = generateId();
            entity.store_id = store.store_id;
            entity.start_time = item.start_time;
            entity.end_time = item.end_time;
            entities.push(entity);
        }
        if (entities.length > 0) {
            await this.storeRepository.insertStoreBreaks(entities);
        }
    }

    /**
     * 내 업체 정비시간 설정 (업체 관리자) — 퇴실 후 다음 이용까지 호실을 막는 분. (RabbitMQ: admin.store.mine-maintenance)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 정비시간(분)
     */
    @Transactional()
    async changeMyStoreMaintenance(user_id: string, dto: StoreMineMaintenanceDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.maintenance_minutes = dto.maintenance_minutes;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }

    /**
     * 내 업체 영업중 여부 변경 (업체 관리자) — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님. 같은 값이면 400. (RabbitMQ: admin.store.mine-open)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 영업중 여부
     */
    @Transactional()
    async changeMyStoreOpen(user_id: string, dto: StoreMineOpenDto): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        if (store.is_open === dto.is_open) {
            throw new BadRequestException({message: STORE_SAME_STATE_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.is_open = dto.is_open;
        await this.storeRepository.updateStore({store_id: store.store_id}, storeEntity);
    }

    /**
     * 내 업체 일시 예약불가 목록 (업체 관리자) — 끝나지 않은 것(종료 일시가 지금 이후)만, 시작 순. (내부 HTTP: GET /internal/v1/admin-service/store/mine/unavailable-period)
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getMyStoreUnavailablePeriodList(user_id: string, dto: StoreMineUnavailablePeriodListDto): Promise<StoreMineUnavailablePeriodListResultDto> {
        const store = await this.storeRepository.findStoreByManager(user_id, false);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const where: FindOptionsWhere<StoreUnavailablePeriodEntity> = {store_id: store.store_id, ends_at: MoreThan(new Date())};
        const total_count = await this.storeRepository.countUnavailablePeriods(where);
        const pagination = new Pagination({...dto, total_count});
        const periods = await this.storeRepository.findUnavailablePeriodList(where, pagination.limit, pagination.offset);
        return {list: periods.map(toUnavailablePeriodItem), pagination: pagination.getPagination()};
    }

    /**
     * 내 업체 일시 예약불가 등록 (업체 관리자) — 한국 시각 분 단위 시작 ~ 종료 일시 동안 예약을 받지 않는다. (RabbitMQ: admin.store.mine-unavailable-period)
     * - 없는 날짜(02-30) · 시작 ≥ 종료 · 이미 끝난 범위(종료 ≤ 지금)는 400. 시작이 과거인 진행 중 범위는 된다
     * - 그 업체의 다른 일시 예약불가와 겹치면 400 — 반열린 구간이라 맞닿는 것은 된다(사용자 결정 2026-10-27)
     * - 걸리는 기존 예약은 취소하지 않고 특수 표시한다 — 예약 기능(Phase 17)이 생길 때
     *
     * @param user_id 로그인 매니저 ID
     * @param dto 시작 · 종료 일시 · 메모
     * @returns 일시 예약불가 ID
     */
    @Transactional()
    async addMyStoreUnavailablePeriod(user_id: string, dto: StoreMineUnavailablePeriodDto): Promise<StoreMineUnavailablePeriodResultDto> {
        // 1. 내 업체 (잠금 — 겹침 확인 · 등록을 한 번에 하나)
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 일시 — 한국 시각 분 단위. strict 파싱이라 없는 날짜 · 시각(02-30 · 13월)은 isValid() 가 false
        if (!dayjs(dto.starts_at, STORE_DATETIME_FORMAT, true).isValid()) {
            throw new BadRequestException({message: '없는 시작 일시입니다.', validation_errors: createValidationError('starts_at', '없는 시작 일시입니다.')});
        }
        if (!dayjs(dto.ends_at, STORE_DATETIME_FORMAT, true).isValid()) {
            throw new BadRequestException({message: '없는 종료 일시입니다.', validation_errors: createValidationError('ends_at', '없는 종료 일시입니다.')});
        }
        const starts_at = dayjs.tz(dto.starts_at, STORE_DATETIME_FORMAT, KST_TIMEZONE);
        const ends_at = dayjs.tz(dto.ends_at, STORE_DATETIME_FORMAT, KST_TIMEZONE);
        if (!ends_at.isAfter(starts_at)) {
            throw new BadRequestException({message: '종료 일시는 시작 일시보다 늦어야 합니다.', validation_errors: createValidationError('ends_at', '종료 일시는 시작 일시보다 늦어야 합니다.')});
        }
        if (!ends_at.isAfter(dayjs())) {
            throw new BadRequestException({message: '이미 지난 기간은 등록할 수 없습니다.', validation_errors: createValidationError('ends_at', '이미 지난 기간은 등록할 수 없습니다.')});
        }

        // 3. 다른 일시 예약불가와 겹침
        const overlapping = await this.storeRepository.countUnavailablePeriods(buildUnavailablePeriodOverlapWhere(store.store_id, starts_at.toDate(), ends_at.toDate()));
        if (overlapping > 0) {
            throw new BadRequestException({message: '다른 일시 예약불가와 겹칩니다.', validation_errors: createValidationError('starts_at', '다른 일시 예약불가와 겹칩니다.')});
        }

        // 4. 등록
        const period = new StoreUnavailablePeriodEntity();
        period.store_unavailable_period_id = generateId();
        period.store_id = store.store_id;
        period.starts_at = starts_at.toDate();
        period.ends_at = ends_at.toDate();
        period.memo = dto.memo ?? null;
        await this.storeRepository.insertUnavailablePeriod(period);
        return {store_unavailable_period_id: period.store_unavailable_period_id};
    }

    /**
     * 내 업체 일시 예약불가 삭제 (업체 관리자) — 그 업체 것만, 없으면 404(남의 업체 것 포함). (RabbitMQ: admin.store.mine-unavailable-period-delete)
     *
     * @param user_id 로그인 매니저 ID
     * @param store_unavailable_period_id 일시 예약불가 ID
     */
    @Transactional()
    async removeMyStoreUnavailablePeriod(user_id: string, store_unavailable_period_id: string): Promise<void> {
        const store = await this.storeRepository.findStoreByManager(user_id, true);
        if (!store) {
            throw new NotFoundException({message: STORE_MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const deleted = await this.storeRepository.deleteUnavailablePeriod({store_unavailable_period_id, store_id: store.store_id});
        if (!deleted) {
            throw new NotFoundException({message: '일시 예약불가를 찾을 수 없습니다.'});
        }
    }
```

### Entry Point — admin-service store controllers

`apps/admin-service/src/store/controllers/store.controller.ts` — 동기 3개를 클래스 맨 앞에(`GET /mine` 이 `GET /:store_id` 보다 먼저 맞아야 한다)

```ts
import {StoreMineFileUploadUrlDto, StoreMineFileUploadUrlResultDto} from '@app/contracts/store/dto/store-mine-file-upload-url.dto.js';
import {StoreMineUnavailablePeriodListDto, StoreMineUnavailablePeriodListResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period-list.dto.js';
import {StoreMineResultDto} from '@app/contracts/store/dto/store-mine.dto.js';

/**
 * store 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로만 받는다(외부 비공개, Swagger 없음).
 * `/mine…` · `/application…` 라우트를 `/:store_id` 보다 먼저 선언한다(같은 단 수의 정적 경로가 먼저 맞아야 한다).
 */
@Controller('/internal/v1/admin-service/store')
export class StoreController {
    // constructor 그대로

    /**
     * 내 업체 상세 (업체 관리자)
     */
    @Get('/mine')
    @HttpCode(200)
    async getMyStore(@InternalActor('user_id') user_id: string): Promise<StoreMineResultDto> {
        return this.storeService.getMyStore(user_id);
    }

    /**
     * 내 업체 사진 업로드 주소 (업체 관리자)
     */
    @Post('/mine/file/upload-url')
    @HttpCode(200)
    async createMyStoreFileUploadUrl(@InternalActor('user_id') user_id: string, @Body() dto: StoreMineFileUploadUrlDto): Promise<StoreMineFileUploadUrlResultDto> {
        return this.storeService.createMyStoreFileUploadUrl(user_id, dto);
    }

    /**
     * 내 업체 일시 예약불가 목록 (업체 관리자)
     */
    @Get('/mine/unavailable-period')
    @HttpCode(200)
    async getMyStoreUnavailablePeriodList(@InternalActor('user_id') user_id: string, @Query() query: StoreMineUnavailablePeriodListDto): Promise<StoreMineUnavailablePeriodListResultDto> {
        const dto = new StoreMineUnavailablePeriodListDto(query);
        return this.storeService.getMyStoreUnavailablePeriodList(user_id, dto);
    }

    // ... 기존 라우트 그대로 (/application/mine …)
}
```

`apps/admin-service/src/store/controllers/store.controller.queue.ts` — `@OnCommand` 10개 (`changeStoreState` 다음에)

```ts
import type {StoreMineBreaksDto} from '@app/contracts/store/dto/store-mine-breaks.dto.js';
import type {StoreMineFileDeleteParamDto} from '@app/contracts/store/dto/store-mine-file-delete.dto.js';
import type {StoreMineFileOrderDto} from '@app/contracts/store/dto/store-mine-file-order.dto.js';
import type {StoreMineFileDto, StoreMineFileResultDto} from '@app/contracts/store/dto/store-mine-file.dto.js';
import type {StoreMineHoursDto} from '@app/contracts/store/dto/store-mine-hours.dto.js';
import type {StoreMineMaintenanceDto} from '@app/contracts/store/dto/store-mine-maintenance.dto.js';
import type {StoreMineOpenDto} from '@app/contracts/store/dto/store-mine-open.dto.js';
import type {StoreMineProfileDto} from '@app/contracts/store/dto/store-mine-profile.dto.js';
import type {StoreMineUnavailablePeriodDeleteParamDto} from '@app/contracts/store/dto/store-mine-unavailable-period-delete.dto.js';
import type {StoreMineUnavailablePeriodDto, StoreMineUnavailablePeriodResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period.dto.js';

/**
 * store 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.store.*` 명령을 `@OnCommand` 로 받는다.
 * 봉투에서 입력을 꺼내 service 로 위임만 한다(로직 0). path param 은 게이트웨이가 payload 에 합쳐 보낸다.
 * 신청자 · 업체 관리자 명령은 actor 의 user_id 가 필요해 requireActor 로 꺼내고, 총관리자 명령은 게이트웨이 관리자 가드를 지난 요청이라 actor 를 쓰지 않는다.
 */
@Injectable()
export class StoreQueueController {
    // ... 기존 그대로

    /**
     * 내 업체 소개 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_PROFILE)
    async updateMyStoreProfile(command: MessageEnvelope<StoreMineProfileDto>): Promise<void> {
        return this.storeService.updateMyStoreProfile(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 사진 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 업체 정보 파일 ID
     */
    @OnCommand(STORE_COMMAND.MINE_FILE)
    async addMyStoreFile(command: MessageEnvelope<StoreMineFileDto>): Promise<StoreMineFileResultDto> {
        return this.storeService.addMyStoreFile(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 사진 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(STORE_COMMAND.MINE_FILE_DELETE)
    async removeMyStoreFile(command: MessageEnvelope<StoreMineFileDeleteParamDto>): Promise<void> {
        return this.storeService.removeMyStoreFile(requireActor(command).user_id, command.payload.store_file_id);
    }

    /**
     * 내 업체 사진 순서 변경 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_FILE_ORDER)
    async reorderMyStoreFiles(command: MessageEnvelope<StoreMineFileOrderDto>): Promise<void> {
        return this.storeService.reorderMyStoreFiles(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 영업시간 설정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_HOURS)
    async replaceMyStoreHours(command: MessageEnvelope<StoreMineHoursDto>): Promise<void> {
        return this.storeService.replaceMyStoreHours(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 브레이크타임 설정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_BREAKS)
    async replaceMyStoreBreaks(command: MessageEnvelope<StoreMineBreaksDto>): Promise<void> {
        return this.storeService.replaceMyStoreBreaks(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 정비시간 설정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_MAINTENANCE)
    async changeMyStoreMaintenance(command: MessageEnvelope<StoreMineMaintenanceDto>): Promise<void> {
        return this.storeService.changeMyStoreMaintenance(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 영업중 여부 변경 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_OPEN)
    async changeMyStoreOpen(command: MessageEnvelope<StoreMineOpenDto>): Promise<void> {
        return this.storeService.changeMyStoreOpen(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 일시 예약불가 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 일시 예약불가 ID
     */
    @OnCommand(STORE_COMMAND.MINE_UNAVAILABLE_PERIOD)
    async addMyStoreUnavailablePeriod(command: MessageEnvelope<StoreMineUnavailablePeriodDto>): Promise<StoreMineUnavailablePeriodResultDto> {
        return this.storeService.addMyStoreUnavailablePeriod(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 일시 예약불가 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(STORE_COMMAND.MINE_UNAVAILABLE_PERIOD_DELETE)
    async removeMyStoreUnavailablePeriod(command: MessageEnvelope<StoreMineUnavailablePeriodDeleteParamDto>): Promise<void> {
        return this.storeService.removeMyStoreUnavailablePeriod(requireActor(command).user_id, command.payload.store_unavailable_period_id);
    }
}
```

### Entry Point — 게이트웨이 store controllers

매니저 가드(`PassportJwtManagerAuthGuard`)만 — 업체 총관리자 · 업체 관리자 모두라 `RolesGuard` · `@Roles` 없음(그룹 전체에 열린 라우트). 동기 · 큐 모두 `/mine…` 을 `/:store_id` 라우트보다 먼저 둔다.

`apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.ts` — 클래스 맨 앞에 3개

```ts
import {StoreMineFileUploadUrlDto, StoreMineFileUploadUrlResultDto} from '@app/contracts/store/dto/store-mine-file-upload-url.dto.js';
import {StoreMineUnavailablePeriodListDto, StoreMineUnavailablePeriodListResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period-list.dto.js';
import {StoreMineResultDto} from '@app/contracts/store/dto/store-mine.dto.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';

/**
 * 업체 공개 API — 동기 경로(내부 HTTP → admin-service store 도메인). 조회 · 업로드 주소.
 * 내 업체 라우트(/mine…)는 매니저 가드, 신청자 라우트(/application/mine…)는 이용자 가드, 나머지는 관리자 가드. `/mine…` · `/application…` 를 `/:store_id` 보다 먼저 선언한다.
 * 큐 경로(신청 · 파일 · 승인 · 반려 · 수정 · 상태 · 내 업체 설정)는 같은 경로 접두의 store.controller.queue.ts(StoreQueueController)에 둔다.
 */
@ApiTags('업체')
@Controller('/api/v1/admin-service/store')
export class StoreController {
    // constructor 그대로

    /**
     * 내 업체 상세 (업체 관리자) — 업체 정보 · 업체코드 · 영업 설정 · 요일별 영업시간 · 브레이크타임 · 업체 정보 파일 열람 주소
     */
    @Get('/mine')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 상세'})
    @ApiOkResponse({type: StoreMineResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyStore(@PassportActor() actor: Actor): Promise<StoreMineResultDto> {
        return this.internalHttp.request<StoreMineResultDto>('admin', 'GET', STORE_INTERNAL_PATH.MINE, {actor});
    }

    /**
     * 내 업체 사진 업로드 주소 (업체 관리자) — 받은 주소로 같은 Content-Type 헤더로 PUT 한 뒤 file_key 로 사진을 등록한다
     */
    @Post('/mine/file/upload-url')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 사진 업로드 주소'})
    @ApiBody({type: StoreMineFileUploadUrlDto})
    @ApiOkResponse({type: StoreMineFileUploadUrlResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyStoreFileUploadUrl(@PassportActor() actor: Actor, @Body() dto: StoreMineFileUploadUrlDto): Promise<StoreMineFileUploadUrlResultDto> {
        return this.internalHttp.request<StoreMineFileUploadUrlResultDto>('admin', 'POST', STORE_INTERNAL_PATH.MINE_FILE_UPLOAD_URL, {actor, body: dto});
    }

    /**
     * 내 업체 일시 예약불가 목록 (업체 관리자) — 끝나지 않은 것만, 시작 순
     */
    @Get('/mine/unavailable-period')
    @UseGuards(PassportJwtManagerAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 일시 예약불가 목록'})
    @ApiOkResponse({type: StoreMineUnavailablePeriodListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyStoreUnavailablePeriodList(@PassportActor() actor: Actor, @Query() query: StoreMineUnavailablePeriodListDto): Promise<StoreMineUnavailablePeriodListResultDto> {
        const dto = new StoreMineUnavailablePeriodListDto(query);
        return this.internalHttp.request<StoreMineUnavailablePeriodListResultDto>('admin', 'GET', STORE_INTERNAL_PATH.MINE_UNAVAILABLE_PERIOD_LIST, {actor, query: dto});
    }

    // ... 기존 라우트 그대로
}
```

`apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts` — 클래스 맨 앞에 10개(`Put` import 추가). 입력 없는 삭제 2개는 path param 만 payload 로.

```ts
import {Body, Controller, Delete, Ip, Param, Patch, Post, Put, Res, UseGuards} from '@nestjs/common';
import {StoreMineBreaksDto} from '@app/contracts/store/dto/store-mine-breaks.dto.js';
import {StoreMineFileDeleteParamDto} from '@app/contracts/store/dto/store-mine-file-delete.dto.js';
import {StoreMineFileOrderDto} from '@app/contracts/store/dto/store-mine-file-order.dto.js';
import {StoreMineFileDto, StoreMineFileResultDto} from '@app/contracts/store/dto/store-mine-file.dto.js';
import {StoreMineHoursDto} from '@app/contracts/store/dto/store-mine-hours.dto.js';
import {StoreMineMaintenanceDto} from '@app/contracts/store/dto/store-mine-maintenance.dto.js';
import {StoreMineOpenDto} from '@app/contracts/store/dto/store-mine-open.dto.js';
import {StoreMineProfileDto} from '@app/contracts/store/dto/store-mine-profile.dto.js';
import {StoreMineUnavailablePeriodDeleteParamDto} from '@app/contracts/store/dto/store-mine-unavailable-period-delete.dto.js';
import {StoreMineUnavailablePeriodDto, StoreMineUnavailablePeriodResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period.dto.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';

/**
 * 업체 공개 API — 큐 경로(RabbitMQ `admin.store.*` → admin-service + 요청 단위 SSE).
 * 내 업체 설정(매니저 가드 — 업체 총관리자 · 업체 관리자), 신청 · 신청 취소 · 업체 정보 파일 등록 · 삭제(이용자 가드), 승인 · 반려 · 업체 수정 · 상태 변경(관리자 가드). path param 은 payload 에 합쳐 보낸다.
 * `/mine…` 을 `/:store_id` 보다 먼저 선언한다. 동기 경로(조회 · 업로드 주소)는 같은 경로 접두의 store.controller.ts(StoreController)에 둔다.
 */
@ApiTags('업체')
@Controller('/api/v1/admin-service/store')
export class StoreQueueController {
    // constructor 그대로

    /**
     * 내 업체 소개 수정 (업체 관리자) — 소개 · 연락처 · 편의시설(통째로 교체). done 의 data 는 null.
     */
    @Patch('/mine/profile')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 소개 수정'})
    @ApiBody({type: StoreMineProfileDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyStoreProfile(@PassportActor() actor: Actor, @Body() dto: StoreMineProfileDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_PROFILE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 사진 등록 (업체 관리자) — 업로드 주소로 올린 사진의 키, 마지막 순서. done 의 data 는 업체 정보 파일 ID.
     */
    @Post('/mine/file')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 사진 등록'})
    @ApiBody({type: StoreMineFileDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreMineFileResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyStoreFile(@PassportActor() actor: Actor, @Body() dto: StoreMineFileDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_FILE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 사진 순서 변경 (업체 관리자) — 업체 사진 ID 전부를 원하는 순서로(가장 앞이 대표). done 의 data 는 null.
     */
    @Put('/mine/file/order')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 사진 순서 변경'})
    @ApiBody({type: StoreMineFileOrderDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async reorderMyStoreFiles(@PassportActor() actor: Actor, @Body() dto: StoreMineFileOrderDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_FILE_ORDER, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 사진 삭제 (업체 관리자) — 업체 사진만(사업자등록증은 지울 수 없다). done 의 data 는 null.
     */
    @Delete('/mine/file/:store_file_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 사진 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async removeMyStoreFile(@PassportActor() actor: Actor, @Param() param: StoreMineFileDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_FILE_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 내 업체 영업시간 설정 (업체 관리자) — 연중무휴 여부 + 요일별 영업시간 통째로 교체. done 의 data 는 null.
     */
    @Put('/mine/hours')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 영업시간 설정'})
    @ApiBody({type: StoreMineHoursDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async replaceMyStoreHours(@PassportActor() actor: Actor, @Body() dto: StoreMineHoursDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_HOURS, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 브레이크타임 설정 (업체 관리자) — 매일 같은 목록 통째로 교체, 서로 겹치면 400. done 의 data 는 null.
     */
    @Put('/mine/breaks')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 브레이크타임 설정'})
    @ApiBody({type: StoreMineBreaksDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async replaceMyStoreBreaks(@PassportActor() actor: Actor, @Body() dto: StoreMineBreaksDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_BREAKS, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 정비시간 설정 (업체 관리자). done 의 data 는 null.
     */
    @Patch('/mine/maintenance')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 정비시간 설정'})
    @ApiBody({type: StoreMineMaintenanceDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeMyStoreMaintenance(@PassportActor() actor: Actor, @Body() dto: StoreMineMaintenanceDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_MAINTENANCE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 영업중 여부 변경 (업체 관리자) — 같은 값이면 400. done 의 data 는 null.
     */
    @Patch('/mine/open')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 영업중 여부 변경'})
    @ApiBody({type: StoreMineOpenDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeMyStoreOpen(@PassportActor() actor: Actor, @Body() dto: StoreMineOpenDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_OPEN, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 일시 예약불가 등록 (업체 관리자) — 한국 시각 분 단위 시작 ~ 종료, 다른 일시 예약불가와 겹치면 400. done 의 data 는 일시 예약불가 ID.
     */
    @Post('/mine/unavailable-period')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 일시 예약불가 등록'})
    @ApiBody({type: StoreMineUnavailablePeriodDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreMineUnavailablePeriodResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyStoreUnavailablePeriod(@PassportActor() actor: Actor, @Body() dto: StoreMineUnavailablePeriodDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_UNAVAILABLE_PERIOD, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 일시 예약불가 삭제 (업체 관리자) — 그 업체 것만. done 의 data 는 null.
     */
    @Delete('/mine/unavailable-period/:store_unavailable_period_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 일시 예약불가 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async removeMyStoreUnavailablePeriod(@PassportActor() actor: Actor, @Param() param: StoreMineUnavailablePeriodDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_UNAVAILABLE_PERIOD_DELETE, actor, payload: param, client_ip: ip});
    }

    // ... 기존 라우트 그대로
}
```

### 규약 문서 · README · 캐시 표

memory `data-layer`(영업시간 세트 규칙 — "AGENTS.md 반영: 미반영")를 이번에 docs 로 옮긴다(261026 리뷰 결정). 모든 조항(휴무 아님 → 둘 다, 휴무 → 둘 다 NULL, CHECK, DTO 짝 필드, service · 시드 · 테스트 데이터도 이 조합만)을 옮기고, ship 의 memory reconcile 이 조항 단위로 다시 읽은 뒤 `_archived/data-layer.md` 로 보관한다.

`AGENTS.md` — Validation 첫 두 줄 · 순서, Data Layer, 라우트 예, Testing Smoke 목록

```md
- `class-validator` 데코레이터. 사용: `@IsNotEmpty`/`@IsOptional`/`@IsIn`/`@Matches`/`@MaxLength`(+`@ValidateIf`) · 위경도 `@IsLatitude`/`@IsLongitude`(숫자 좌표는 위 데코레이터로 검증할 수 없다 — store-application.dto.ts) · 숫자 범위 `@IsInt`/`@Min`/`@Max` · 배열 `@IsArray`/`@ArrayMaxSize`(문자열 항목은 `@Matches(…, {each: true})`) · 중첩 `@ValidateNested({each})` + `@Type(() => 항목 DTO)`(store `/mine` 영업시간 · 브레이크타임 · 편의시설 · 사진 순서). **`@IsString`/`@IsNumber`/`@Transform` 미사용, `@Type` 은 중첩 항목에만**. 중첩 오류는 `validationExceptionFactory` 가 점 경로(`hours.0.open_time`)로 펼친다.
- **모든 제약 데코레이터에 `message: '<한국어 문자열>'` 리터럴 필수**. message 를 받지 않는 것은 `@IsOptional()` 과 `@ValidateIf()` 뿐(`@Type` 은 검증이 아니라 변환).
- **데코레이터 순서**: 필수 `@ApiProperty` → 제약 → `@IsNotEmpty`(맨 마지막) / 선택 `@ApiProperty` → `@IsOptional()` → 제약 / 짝 필드 `@ApiProperty` → `@ValidateIf` → 제약 → `@IsNotEmpty` / 중첩 `@ApiProperty({type: () => [X]})` → `@Type(() => X)` → `@ValidateNested` → 배열 제약 → `@IsNotEmpty`.
```

```md
<!-- Data Layer 엔티티 줄: 시각 · 하루 안 시각 뒤에 -->
… 하루 안 시각 `time`(한국 시각 분 단위, 마감이 시작보다 이르면 다음 날 — 24시간 · 휴무는 플래그) · **영업시간 `t_store_hour` 는 휴무가 아니면 `open_time` · `close_time` 둘 다(세트), 휴무면 둘 다 NULL**(CHECK `CHK_StoreHour_OpenCloseTime` + 입력 DTO 짝 필드 — service · 시드 · 테스트 데이터도 이 조합만) · 좌표 …
<!-- 컬럼 이름 줄 -->
- **컬럼 이름**: 시각은 `<과거분사>_at`(`created_at` · `updated_at` · `verified_at`) · 앞으로 올 시각은 `expires_at` 꼴(만료 `expires_at`, 범위 `starts_at` · `ends_at` — 일시 예약불가), …
<!-- repository 줄 끝에 -->
… 같은 업체 설정의 교체 · 겹침 검사 · 한도는 **업체 행 잠금** 아래에서 한다 — store `findStoreByManager(user_id, true)`(`FOR UPDATE OF s`, 쓰기 트랜잭션 안에서만 — 밖이면 TypeORM 이 거부한다). 조회는 `false`.
```

```md
<!-- Conventions 라우트 줄의 예 -->
… (예: `/api/v1/admin-service/manager/login` → `/internal/v1/admin-service/manager/login`, 객실 관리는 `/api/v1/admin-service/room` + 매니저 가드, 내 업체 설정은 `/api/v1/admin-service/store/mine…` + 매니저 가드). … 통째로 교체하는 쓰기는 `PUT`(영업시간 · 브레이크타임 · 사진 순서), 일부만 바꾸는 쓰기는 `PATCH`.
<!-- Testing Data-Access Smoke 현재 적용의 store 항목 -->
[store.repository.spec.ts](apps/admin-service/src/store/test/store.repository.spec.ts) 목록 2종 · 업체 정보 파일 조회 · 업체 지정 · 신청 파일 삭제 · 매니저 상태 · 매니저의 소속 업체(조인 · 잠금) · 영업시간 · 브레이크타임 · 일시 예약불가(목록 · 겹침),
```

`docs/conventions.md` — Validation 절(사용 · 미사용 줄 교체, 순서에 중첩 추가, 근거 추가), 라우트 절(PUT)

```md
- **사용**: `@IsNotEmpty` · `@IsOptional` · `@IsIn` · `@Matches` · `@MaxLength` (+ 짝 필드 조건부 `@ValidateIf`) · 위경도 `@IsLatitude` · `@IsLongitude`(…그대로) · 숫자 범위 `@IsInt` · `@Min` · `@Max`(정비시간 · 방 칸수) · 배열 `@IsArray` · `@ArrayMaxSize`(문자열 항목은 `@Matches(…, {each: true})` — 사진 순서) · 중첩 `@ValidateNested({each: true})` + `@Type(() => 항목 DTO)`(영업시간 · 브레이크타임 · 편의시설 — store-mine-hours.dto.ts · store-mine-breaks.dto.ts · store-mine-profile.dto.ts, 사용자 결정 2026-10-27).
- **미사용**(grep 0건): `@IsString` · `@IsNumber` · `@IsBoolean` · `@IsEnum` · `@MinLength` · `@Length` · `@Transform`. `@Type` 은 중첩 항목에만 — class-transformer 가 중첩 객체를 그 DTO 인스턴스로 만들어야 `@ValidateNested` 가 항목을 검증한다. 숫자를 바꾸는 `@Type(() => Number)` 는 쓰지 않는다(쿼리 값은 문자열 그대로).
- **중첩 오류의 대상 필드는 점 경로** — `validationExceptionFactory` 가 `children` 을 펼쳐 제약이 걸린 오류마다 1건(`hours.0.open_time` · `store_detail.room_count`)을 담는다. 배열 자체의 제약(`hours` 개수)은 그 필드명 그대로. service 가 항목에 귀속되는 비즈니스 오류를 낼 때도 같은 경로를 쓴다(`createValidationError('breaks.0.end_time', …)`).
- **`@IsNotEmpty` 는 `''` · null · undefined 만 막는다** — 숫자 0 · 빈 배열 · `{}` 는 통과한다. 빈 배열을 막으려면 개수를 service 가 본다(영업시간 7개).
  - 중첩 `@ApiProperty({type: () => [X]})` → `@Type(() => X)` → `@ValidateNested({each: true, message})` → `@ArrayMaxSize` → `@IsArray` → `@IsNotEmpty` (store-mine-hours.dto.ts)
- 같은 경로 다른 verb 가능(`DELETE /leave` · `PATCH /leave`). 통째로 교체하는 쓰기는 `PUT`(`/mine/hours` · `/mine/breaks` · `/mine/file/order`), 일부만 바꾸는 쓰기는 `PATCH`.
```

`docs/data-layer.md` — `time` 항목에 세트 규칙, 컬럼 이름 규칙, repository 의 잠금

```md
  - **하루 안 시각 `time`** 은 … (그대로) … — store-hour.entity.ts · store-break.entity.ts.
  - **영업시간은 휴무가 아니면 `open_time` · `close_time` 둘 다(세트)** — `t_store_hour` 에서 휴무가 아닌 요일(`is_closed = 0`)은 둘 다 채우고, 하나만 있는 행을 만들지 않는다. 휴무(`is_closed = 1`)면 둘 다 NULL. DB 는 CHECK `CHK_StoreHour_OpenCloseTime`, 입력 DTO 는 짝 필드(`@ValidateIf(휴무 아님)` → 제약 → `@IsNotEmpty` — store-mine-hours.dto.ts), service 는 휴무면 보낸 시각을 버리고 NULL 로 저장한다. 시드 · 테스트 데이터도 이 조합만 쓴다(사용자 결정 2026-10-24). 시작 = 마감은 두지 않는다 — 24시간은 `t_store.is_always_open`(사용자 결정 2026-10-27).
  - **브레이크타임은 매일** — `t_store_break` 에 요일이 없다. 한 업체의 브레이크타임끼리 겹치지 않는다(반열린 구간 — 끝점 맞닿음은 허용, 기준일 위 dayjs 시각으로 놓고 자정을 넘는 범위는 다음 날 마감, 한쪽을 하루 앞 · 뒤로도 옮겨 비교 — store.util.ts `hasOverlappingBreaks`).
  - **일시 범위 `timestamptz` 두 개** — 일시 예약불가 `t_store_unavailable_period.starts_at` · `ends_at`(반열린 구간, CHECK `starts_at < ends_at`). 입력은 한국 시각 `YYYY-MM-DD HH:mm`(분 단위)을 dayjs 로 읽고(`dayjs(값, 형식, true).isValid()` 로 없는 날짜를 거른 뒤 `dayjs.tz(값, 형식, KST_TIMEZONE)` — store.service.ts), 겹침은 `starts_at < 새 종료 AND ends_at > 새 시작` 개수로 본다.

### 컬럼 이름 규칙
- 시각은 `<과거분사>_at` 이다 — … (그대로). 앞으로 올 시각은 `expires_at` 꼴이다 — 만료 `expires_at`, 범위 `starts_at` · `ends_at`.

<!-- repository 절 — 상태 조건 쓰기 다음 -->
- **같은 업체 설정은 업체 행을 잠그고 쓴다** — 교체(영업시간 · 브레이크타임 — 지우고 다시 넣기) · 겹침 검사(일시 예약불가) · 한도(업체 사진)는 동시에 두 요청이 같이 통과할 수 있다(교체 두 건이 합쳐져 겹치는 브레이크타임 등). store `findStoreByManager(user_id, true)` 가 `FOR UPDATE OF s` 로 업체 행만 잠가 같은 업체의 설정 쓰기를 한 번에 하나로 만든다. 잠금은 쓰기 트랜잭션(`@Transactional()`) 안에서만 — 밖에서는 TypeORM 이 `PessimisticLockTransactionRequiredError` 를 던진다(repository 가 500). 조회는 `false`.
```

`docs/api.md` — 큐 · 동기 표의 store 행에 `/mine…`(매니저 가드), 동기 인증 핸들러 예에 "내 업체 상세 · 사진 업로드 주소 · 일시 예약불가 목록", 메서드 규칙

```md
- 인증이 붙는 동기 핸들러(store 조회 · 업로드 주소 · 내 업체 — store.controller.ts): HTTP verb → `@UseGuards`(그 그룹의 가드 — 내 업체 `/mine…` 은 매니저 가드, 그룹 안 권한이면 `RolesGuard` 를 뒤에) → …
- 통째로 교체하는 쓰기는 `PUT`(영업시간 · 브레이크타임 · 사진 순서 — 요청 본문이 그 설정 전체다), 일부만 바꾸는 쓰기는 `PATCH`, 하위 자원 추가는 `POST`, 삭제는 `DELETE`.
```

`docs/testing.md` — Smoke 현재 적용 · 큐 경로 중첩 검증

```md
- 현재 적용: … [store.repository.spec.ts](../apps/admin-service/src/store/test/store.repository.spec.ts) `buildApplicationListQuery` · `buildStoreListQuery`(ILike · 배열 OR) · `buildStoreFileRowsQuery`(용도 조인 · raw 별칭) · `buildAssignStoreFilesQuery` · `buildDeleteApplicationFilesQuery` · `buildUpdateStoreManagersQuery` · `buildStoreByManagerQuery`(t_user 조인 · 탈퇴 제외 · `FOR UPDATE OF s`) · `buildStoreHoursQuery` · `buildStoreBreaksQuery`(관계 필드 where · 정렬) · `buildUnavailablePeriodListQuery`(목록 `MoreThan` · 겹침 `LessThan` + `MoreThan`), …

<!-- 큐 경로 절 끝에 -->
- **큐 경로의 입력 검증** — 서비스 큐 컨트롤러는 재검증하지 않으므로 큐 DTO 는 게이트웨이에서만 검증된다. 중첩 · 배열 DTO 처럼 검증 자체가 동작인 경우, 그 service spec 의 `[FAIL:validation]` 은 도우미 `validateBody(DTO, 본문)`(게이트웨이와 같은 `ValidationPipe` 설정 + `validationExceptionFactory`)로 DTO 를 직접 통과시켜 실패 본문(점 경로)을 단언한다 — store-mine-profile · store-mine-hours · store-mine-breaks · store-mine-unavailable-period. 제약이 하나만 걸리는 입력으로 고른다(여러 제약이 걸리면 첫 메시지가 데코레이터 등록 순서에 달린다).
```

`AGENTS.md` 공통 로직 분리 · `docs/conventions.md` 순수 함수 목록 · `docs/architecture.md` libs/common 행 — util 목록의 `kst` 를 `dayjs` 로, 규칙 한 줄 추가(memory `datetime` 이관 — ship 에서 보관)

```md
전역 `libs/common/src/utils/*.ts`(`bcrypt` · `hash` · `cipher` · `jwt` · `validation` · `fail-result` · `retry` · `pagination` · `env` · `id` · `dayjs` · `search`)
- **날짜 · 시각은 dayjs** — 파싱 · 비교 · 계산 · 시간대(한국 시각)를 직접 만들지 않는다(`getTime()` 비교 · `* 1000` 더하기 · 오프셋 계산 · 시각 문자열 자르기 ❌). 플러그인(`customParseFormat` · `utc` · `timezone`)을 붙인 `@app/common/utils/dayjs.js` 의 `dayjs` · `Dayjs` · `KST_TIMEZONE` 만 쓴다(`'dayjs'` 직접 import ❌ — 플러그인이 빠진다). 하루 안 시각(`time` 컬럼)도 기준일 위 dayjs 로 비교한다(store.util.ts). 라이브러리로 되는 일은 util 로 다시 만들지 않는다. (사용자 결정 2026-10-27)
```

`README.md` — admin-service 설명의 업체 문장 끝에

```md
… 업체: 이용자의 입점 신청(…) · …, 총관리자의 신청 승인(…) · 반려 · 업체 목록 · 상세 · 수정 · 상태 변경, 업체 관리자의 내 업체 설정(상세 · 소개 · 편의시설 · 사진과 순서 · 요일별 영업시간 · 매일 브레이크타임 · 정비시간 · 영업중 여부 · 일시 예약불가). user-service 와 같은 DB 를 직접 쓴다.
```

`.beaver/output/spec/platform/cache-spec.md` — 대상 2(discovery) 다음에 무효화 지점 표

```md
### 무효화 지점 표 — discovery(업체 상세 · 목록에 들어가는 업체 · 영업 설정을 바꾸는 쓰기)

| 쓰기 | 앱 | 바뀌는 값 | 지금 |
|---|---|---|---|
| 업체 정보 수정 · 상태 변경(총관리자 — `updateStore` · `changeStoreState`) | admin-service store (Phase 9) | 상호 · 주소 · 좌표 · 상태 | Phase 9 |
| 내 업체 소개 수정(`updateMyStoreProfile`) | admin-service store (Phase 11) | 소개 · 연락처 · 편의시설 | Phase 11 |
| 내 업체 사진 등록 · 삭제 · 순서 변경 | admin-service store (Phase 11) | 사진 · 대표 사진 | Phase 11 |
| 영업시간 · 브레이크타임 교체 · 정비시간 · 영업중 여부(`replaceMyStoreHours` · `replaceMyStoreBreaks` · `changeMyStoreMaintenance` · `changeMyStoreOpen`) | admin-service store (Phase 11) | 영업 설정 — 목록의 영업중 표시 · 예약 가능 시간 | Phase 11 |
| 일시 예약불가 등록 · 삭제 | admin-service store (Phase 11) | 예약 가능 시간 | Phase 11 |
```

---

## Test Cases

spec 두 종류만 둔다(docs/testing.md). service 기능 spec 은 API 1개당 1개(repository · `STORAGE_GATEWAY` mock), repository spec 은 오류 변환 · 조건 · Smoke. build 는 테스트를 쓰기만 하고 돌리지 않는다(`/beaver:test`).

도우미 변경 — `apps/admin-service/src/store/test/store.test-helper.ts`

```ts
import {BadRequestException, INestApplication, Type, ValidationPipe} from '@nestjs/common';
import type {StoreBreakEntity} from '@app/database/entities/store/store-break.entity.js';
// ...

/** 업체 관리자 (매니저 그룹 — 업체 총관리자 · 업체 관리자 모두 같은 경로) */
export const MANAGER_ACTOR: Actor = {user_id: 'h'.repeat(32), auth_id: 'MANAGER'};

// createStoreRepositoryMock 에 추가
        updateStoreFile: vi.fn(),
        findStoreByManager: vi.fn(),
        findStoreHours: vi.fn().mockResolvedValue([]),
        deleteStoreHours: vi.fn(),
        insertStoreHours: vi.fn(),
        findStoreBreaks: vi.fn().mockResolvedValue([]),
        deleteStoreBreaks: vi.fn(),
        insertStoreBreaks: vi.fn(),
        countUnavailablePeriods: vi.fn(),
        findUnavailablePeriodList: vi.fn(),
        insertUnavailablePeriod: vi.fn(),
        deleteUnavailablePeriod: vi.fn().mockResolvedValue(true),

/**
 * 게이트웨이와 같은 ValidationPipe 설정으로 본문을 검증한다 — 큐 경로 DTO 는 게이트웨이에서만 검증되므로(서비스 큐 컨트롤러는 재검증하지 않는다) 중첩 검증 · 점 경로를 여기서 확인한다.
 *
 * @param metatype 본문 DTO 클래스
 * @param body 요청 본문
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
 * 업체 사진 행 (공개 · 업체에 붙음)
 *
 * @param override 바꿀 필드
 * @returns 파일 행
 */
export function imageRow(override: Partial<StoreFileRow> = {}): StoreFileRow {
    return fileRow({
        store_file_purpose_id: 'STORE_IMAGE',
        store_application_id: null,
        store_id: STORE_ID,
        file_key: `store/${STORE_ID}/${'2'.repeat(32)}.jpg`,
        file_name: '사진.jpg',
        is_private: 0,
        ...override,
    });
}

/**
 * 요일 영업시간 행 (time 컬럼은 'HH:mm:ss' 로 온다)
 *
 * @param override 바꿀 필드
 * @returns 영업시간 행
 */
export function hourRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {store_hour_id: 'd'.repeat(32), store_id: STORE_ID, day_of_week: 1, is_closed: 0, open_time: '09:00:00', close_time: '18:00:00', created_at: FIXED_TIME, updated_at: FIXED_TIME, ...override};
}

/**
 * 브레이크타임 행
 *
 * @param override 바꿀 필드
 * @returns 브레이크타임 행
 */
export function breakRow(override: Partial<StoreBreakEntity> = {}): Record<string, unknown> {
    return {store_break_id: 'e'.repeat(32), store_id: STORE_ID, start_time: '12:00:00', end_time: '13:00:00', created_at: FIXED_TIME, updated_at: FIXED_TIME, ...override};
}

/**
 * 일시 예약불가 행
 *
 * @param override 바꿀 필드
 * @returns 일시 예약불가 행
 */
export function periodRow(override: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        store_unavailable_period_id: '9'.repeat(32),
        store_id: STORE_ID,
        starts_at: new Date('2026-11-02T00:00:00.000Z'),
        ends_at: new Date('2026-11-02T09:00:00.000Z'),
        memo: null,
        created_at: FIXED_TIME,
        updated_at: FIXED_TIME,
        ...override,
    };
}
```

```
[FIX:baseline]  store.repository.spec.ts — APPLICATION_SELECT 에 "a"."head_manager_login_id" · "a"."head_manager_login_pw"(owner_phone 다음), 업체 목록 SELECT 에 "s"."store_code"(store_id 다음) — Phase 10 컬럼이 스냅샷에 빠져 3건 실패(2026-10-27 실측). 업체 SELECT 는 STORE_SELECT 상수로 빼 소속 업체 Smoke 와 같이 쓴다
[FIX:kst-삭제]  user-phone-verification.spec.ts · user-find-login-id.spec.ts · manager-find-login-id.spec.ts — `kstDayStart` import 삭제, 하루 발송 수 기대값을 고정값으로 `MoreThanOrEqual(new Date('2025-12-31T15:00:00.000Z'))`(FIXED_TIME = 2026-01-01 의 한국 날짜 0시 — 구현과 같은 dayjs 계산을 되풀이하지 않는다)
[FIX:baseline]  store-application-list.spec.ts — "상태 + 검색어 … 같은 WHERE 로 센다": 총 1건이라 page=2 가 1 로 바로잡혀 offset 0 — 그 케이스만 countApplications.mockResolvedValueOnce(30) 로 두고 (where, 10, 10) 단언 유지

[SUCCESS]  store-mine.spec.ts (동기) — 헤더 actor(MANAGER_ACTOR) → findStoreByManager(user_id, false) → findStoreHours · findStoreBreaks · findStoreFileRows(STORE_ID) 각 1회 → 200 본문: store_code · store_detail · updated_at ISO, hours [{day_of_week 0, is_closed 1, open_time null, close_time null}, {1, 0, '09:00', '18:00'}](hourRow 의 'HH:mm:ss' → 'HH:mm'), breaks [{store_break_id, '12:00', '13:00'}], files — 사업자등록증(is_private 1) createDownloadUrl 서명 주소 · 업체 사진(0) getPublicUrl CDN 주소 · sort_order
[FAIL:service]  store-mine — 소속 업체 없음(탈퇴 포함) → 404 '소속 업체를 찾을 수 없습니다.', findStoreHours · findStoreFileRows 미호출
[SECURITY]  store-mine — 내부 토큰 없음 → 403, findStoreByManager 미호출

[SUCCESS]  store-mine-profile.spec.ts — findStoreByManager(user_id, true) → updateStore({store_id: STORE_ID}, StoreEntity) 1회: introduction · phone, store_detail = {room_count: 3, has_tv: 1}(보낸 {room_count: 3, has_tv: 1, has_pc: null, sauna: 1} 에서 null · 모르는 키를 버린다), store_name · business_number undefined(안 바꾼다), done null
[SUCCESS]  store-mine-profile — introduction 빠짐 → null, store_detail {} → {}
[FAIL:service]  store-mine-profile — 소속 업체 없음 → failed 404, updateStore 미호출
[FAIL:validation]  store-mine-profile — validateBody(StoreMineProfileDto, {phone, store_detail: {room_count: 101}}) → validation_errors [{property: 'store_detail.room_count', message: '방 칸수는 0 ~ 100 사이로 입력해주세요.'}] / store_detail: 'x' → [{property: 'store_detail', message: '편의시설 형식이 올바르지 않습니다.'}] / 정상 본문 → null
[SECURITY]  store-mine-profile — actor 없음 → failed 401, findStoreByManager 미호출

[SUCCESS]  store-mine-file-upload-url.spec.ts (동기) — findStoreFilePurpose('STORE_IMAGE')(is_private 0) · countStoreFiles({store_id: STORE_ID, store_file_purpose_id: 'STORE_IMAGE'}) 4 → createUploadUrl({key: /^store\/<STORE_ID>\/[a-f0-9]{32}\.png$/, content_type: 'image/png'}) → 200 {file_key(같은 키), upload_url, expires_at ISO}
[FAIL:service]  store-mine-file-upload-url — 5장 → 400 '올릴 수 있는 파일 수를 넘었습니다.' / 소속 업체 없음 → 404 — createUploadUrl 미호출
[FAIL:validation]  store-mine-file-upload-url — content_type 'image/gif' → 400 validation_errors.content_type 'JPG · PNG 사진만 올릴 수 있습니다.', findStoreByManager 미호출

[SUCCESS]  store-mine-file.spec.ts — 업체 사진 sort_order [0, 2](삭제로 빈 번호) + 사업자등록증 행 → exists(file_key) → insertStoreFile 1회(StoreFileEntity: purpose STORE_IMAGE · store_application_id null · store_id STORE_ID · sort_order 3 · file_name · content_type), done {store_file_id 32자}
[SUCCESS]  store-mine-file — 업체 사진 없음(사업자등록증만) → sort_order 0
[FAIL:service]  store-mine-file — it.each: 다른 업체 키 `store/<다른 id>/…` · 신청 접두 `store/application/…` · 확장자 불일치(png 키 + image/jpeg) → 400 validation_errors.file_key '업로드 주소로 받은 저장 키가 아닙니다.' — exists · insertStoreFile 미호출
[FAIL:service]  store-mine-file — 업체 사진 5장 → 400 한도 / exists false → 400 '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.' — insertStoreFile 미호출 / 소속 업체 없음 → 404

[SUCCESS]  store-mine-file-delete.spec.ts — findStoreFile({store_file_id, store_id: STORE_ID, store_file_purpose_id: 'STORE_IMAGE'}) → deleteStoreFile({store_file_id}) → storage.remove(file_key) — 행 삭제가 먼저(invocationCallOrder), done null
[FAIL:service]  store-mine-file-delete — 파일 없음(사업자등록증 · 다른 업체 사진) → 404 '파일을 찾을 수 없습니다.', deleteStoreFile · remove 미호출

[SUCCESS]  store-mine-file-order.spec.ts — 업체 사진 A(0) · B(1) · C(2) + 사업자등록증 L → [C, A, B] → updateStoreFile 3회 순서대로 ({store_file_id: C}, sort_order 0) · (A, 1) · (B, 2), 엔티티 StoreFileEntity
[FAIL:service]  store-mine-file-order — it.each: 빠짐 [C, A] · 남음 [C, A, B, X] · 겹침 [C, A, A] · 사업자등록증 섞임 [C, A, L] → 400 validation_errors.store_file_ids '업체 사진 전체를 한 번씩 원하는 순서로 보내주세요.', updateStoreFile 미호출

[SUCCESS]  store-mine-hours.spec.ts — 연중무휴 0 + 일 ~ 토 7개(일요일 휴무인데 시각을 보냄 · 금요일 18:00 ~ 06:00 마감이 다음 날) → deleteStoreHours({store_id}) → insertStoreHours 1회(StoreHourEntity 7개 — id 32자 · 일요일 open_time · close_time null · 금요일 '18:00' · '06:00') → updateStore({store_id}, is_always_open 0), 삭제가 먼저
[SUCCESS]  store-mine-hours — 연중무휴 1 + [] → deleteStoreHours 만, insertStoreHours 미호출, updateStore is_always_open 1
[FAIL:service]  store-mine-hours — it.each(모두 deleteStoreHours 미호출): 연중무휴 1 + 1개 → 400 validation_errors.hours '24시간 연중무휴면 요일별 영업시간을 비워주세요.' / 연중무휴 0 + 6개 · 7개인데 요일 중복 → 400 validation_errors.hours '일 ~ 토 7개 요일의 영업시간을 한 번씩 입력해주세요.' / 영업하는 요일 09:00 ~ 09:00(index 2) → 400 validation_errors 'hours.2.close_time' '영업 시작과 마감 시각이 같을 수 없습니다. 24시간 영업은 연중무휴로 설정해주세요.'
[FAIL:validation]  store-mine-hours — validateBody(StoreMineHoursDto, …): 휴무 아님 + open_time '25:00' → [{property: 'hours.0.open_time', message: '영업 시작 시각을 HH:mm 으로 입력해주세요.'}] / 8개 → [{property: 'hours', message: '요일별 영업시간은 7개까지 입력할 수 있습니다.'}] / 휴무 + 시각 없음 → null(짝 필드는 휴무면 검증하지 않는다)
[SECURITY]  store-mine-hours — actor 없음 → failed 401

[CASES:breaks-overlap] (사용자 합의 11개, 2026-10-27) — store-mine-breaks.spec.ts 에서 큐 경로로(it.each). 겹치지 않음 → done null + deleteStoreBreaks({store_id}) → insertStoreBreaks(StoreBreakEntity 그대로의 시각), 겹침 → failed 400 {message: '브레이크타임이 서로 겹칩니다.', validation_errors: [{property: 'breaks', …}]} + deleteStoreBreaks · insertStoreBreaks 미호출
  1   09:00~09:30 + 23:30~00:00                → 겹치지 않음
  2   09:00~09:30 + 09:30~10:00                → 겹치지 않음 (끝점 맞닿음)
  3   23:00~02:00 + 02:00~03:00                → 겹치지 않음 (자정 넘는 범위의 끝 = 다음 시작)
  4   23:30~00:00 + 00:00~00:30                → 겹치지 않음
  5a  12:00~13:00 (1개)                         → 겹치지 않음 (insertStoreBreaks 1행)
  5b  [] (0개)                                  → 겹치지 않음 (deleteStoreBreaks 만, insertStoreBreaks 미호출)
  6   09:00~09:30 + 09:25~09:35                → 겹침
  7   23:00~02:00 + 01:00~03:00                → 겹침 (자정 넘는 범위의 다음 날 쪽)
  8   22:00~01:00 + 00:30~00:45                → 겹침 (다음 날 쪽에 포함)
  9   12:00~13:00 + 11:00~14:00                → 겹침 (포함)
  10  08:00~08:30 + 12:00~13:00 + 08:15~08:20  → 겹침 (첫 · 셋째, 순서 무관)
  11  10:00~10:00                               → 형식 오류 400 '브레이크타임의 시작과 마감 시각이 같을 수 없습니다.' validation_errors 'breaks.0.end_time'
[FAIL:validation]  store-mine-breaks — validateBody(StoreMineBreaksDto, …): start_time '9:00' → [{property: 'breaks.0.start_time', message: '브레이크 시작 시각을 HH:mm 으로 입력해주세요.'}] / 11개 → [{property: 'breaks', message: '브레이크타임은 10개까지 입력할 수 있습니다.'}]
[FAIL:service]  store-mine-breaks — 소속 업체 없음 → failed 404, deleteStoreBreaks 미호출
[SECURITY]  store-mine-breaks — actor 없음 → failed 401

[SUCCESS]  store-mine-open.spec.ts — is_open 0 → 1: updateStore({store_id}, StoreEntity is_open 1), done null
[FAIL:service]  store-mine-open — 같은 값 → 400 '이미 같은 상태입니다.' / 소속 업체 없음 → 404 — updateStore 미호출

[SUCCESS]  store-mine-unavailable-period-list.spec.ts (동기, Date 고정 2026-11-01T00:00Z) — countUnavailablePeriods · findUnavailablePeriodList 의 where {store_id: STORE_ID, ends_at: MoreThan(지금)} · 기본 페이지(20, 0) → 항목 starts_at · ends_at ISO · memo null · pagination.total_count
[FAIL:service]  store-mine-unavailable-period-list — 소속 업체 없음 → 404, countUnavailablePeriods 미호출

[SUCCESS]  store-mine-unavailable-period.spec.ts (큐, Date 고정 2026-11-01T00:00Z = 한국 11-01 09:00) — '2026-11-02 09:00' ~ '2026-11-02 18:00' → countUnavailablePeriods({store_id, starts_at: LessThan(2026-11-02T09:00Z), ends_at: MoreThan(2026-11-02T00:00Z)}) 0 → insertUnavailablePeriod(StoreUnavailablePeriodEntity: starts_at 2026-11-02T00:00:00.000Z · ends_at 2026-11-02T09:00:00.000Z · memo null), done {store_unavailable_period_id 32자}
[SUCCESS]  store-mine-unavailable-period — 진행 중 범위('2026-11-01 08:00' ~ '2026-11-01 12:00' — 시작이 과거) · 메모 '내부 공사' → memo '내부 공사' 로 등록
[FAIL:service]  store-mine-unavailable-period — it.each(모두 countUnavailablePeriods · insert 미호출): 시작 '2026-02-30 09:00' → 400 starts_at '없는 시작 일시입니다.' / 종료 '2026-13-01 00:00' → 400 ends_at '없는 종료 일시입니다.' / 시작 = 종료 · 시작 > 종료 → 400 ends_at '종료 일시는 시작 일시보다 늦어야 합니다.' / '2026-10-31 09:00' ~ '2026-11-01 09:00'(종료 = 지금) → 400 ends_at '이미 지난 기간은 등록할 수 없습니다.'
[FAIL:duplicate]  store-mine-unavailable-period — countUnavailablePeriods 1 → 400 starts_at '다른 일시 예약불가와 겹칩니다.', insert 미호출
[FAIL:validation]  store-mine-unavailable-period — validateBody(StoreMineUnavailablePeriodDto, {starts_at: '2026/11/02 09:00', ends_at: '2026-11-02 18:00'}) → [{property: 'starts_at', message: '시작 일시를 YYYY-MM-DD HH:mm 으로 입력해주세요.'}] / memo 31자 → [{property: 'memo', message: '메모는 30자 이내로 입력해주세요.'}] · 30자 → null
[SECURITY]  store-mine-unavailable-period — actor 없음 → failed 401

[FAIL:repository]  store.repository.spec.ts — makeRepository 에 StoreHourEntity · StoreBreakEntity · StoreUnavailablePeriodEntity 가짜 추가, 통일 500 it.each 에 updateStoreFile · deleteStoreHours · insertStoreHours · deleteStoreBreaks · insertStoreBreaks · countUnavailablePeriods · insertUnavailablePeriod · deleteUnavailablePeriod
[FAIL:repository]  store.repository — deleteUnavailablePeriod affected 1 → true · 0 → false, 넘긴 조건 그대로 / insertStoreHours 는 배열을 그대로 insert 에 넘긴다
[SMOKE:data-access]  store.repository — buildStoreByManagerQuery('u1', false): STORE_SELECT + INNER JOIN "t_user" "u" ON "u"."store_id" = "s"."store_id" WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."store_state_id" <> $3, 파라미터 ['u1', 'MANAGER', 'LEAVE'] / (…, true): 같은 SQL + FOR UPDATE OF s (잠금 절 모양은 build 가 실제 SQL 로 고정)
[SMOKE:data-access]  store.repository — buildStoreHoursQuery('s1'): "t_store_hour" "h" WHERE "h"."store_id" = $1 ORDER BY "h"."day_of_week" ASC / buildStoreBreaksQuery('s1'): "t_store_break" "b" … ORDER BY "b"."start_time" ASC (select 에 day_of_week 없음)
[SMOKE:data-access]  store.repository — buildUnavailablePeriodListQuery({store_id: 's1', ends_at: MoreThan(d)}, 20, 0): WHERE "p"."store_id" = $1 AND "p"."ends_at" > $2 ORDER BY "p"."starts_at" ASC LIMIT 20 OFFSET 0 / 겹침 buildUnavailablePeriodOverlapWhere('s1', a, b): "p"."starts_at" < $2 AND "p"."ends_at" > $3, 파라미터 ['s1', b, a]

테스트 생략(위임형):
  changeMyStoreMaintenance(정비시간) · removeMyStoreUnavailablePeriod(일시 예약불가 삭제) — 소속 업체 확인 + 값 한 개 쓰기 · 조건 삭제 boolean 만이라 다른 spec 이 같은 갈래(404 · updateStore · affected)를 이미 단언한다. 범위 검증(0 ~ 240)은 게이트웨이 DTO.
  게이트웨이 라우트 · 서비스 controller · DTO 클래스 · 모듈 — controller · 인프라 spec 은 두지 않는다(docs/testing.md). 라우트 순서(`/mine` 이 `/:store_id` 앞)는 store-mine.spec 이 내부 `GET /mine` 200 으로 같이 확인한다.
  store.util · libs/common(validation) — util 단위 spec 은 두지 않는다. 겹침 · 키 · 정렬 순서 · 편의시설 · 일시 파싱 · 점 경로는 위 service spec 이 입력 → 결과로 단언한다.
  마이그레이션 — db:check · PGlite up/down 으로 확인한다(테스트 밖).
  dayjs 교체(jwt · sms-verification · s3 · refresh 만료 · 성인 여부) — 결과가 같아 기존 spec(토큰 재발급 만료 401 · 인증번호 만료 · 하루 발송 한도 · 성인 여부 · 업로드 주소 expires_at)이 그대로 단언한다. 새 케이스 없음.
```

---

## Response Codes

동기(내부 HTTP → 게이트웨이 그대로)는 HTTP 상태, 큐는 SSE `accepted` → `done`(data) | `failed`(`{status_code, message, validation_errors}`) | `pending`. 본문은 모두 `ApiFailResultDto {message, validation_errors}`.

| Code | Cause |
|------|------|
| 200 · done | 성공 — #1 상세 · #3 `{file_key, upload_url, expires_at}` · #11 `{list, pagination}` · #4 `{store_file_id}` · #12 `{store_unavailable_period_id}` · 나머지 큐 done data null |
| 400 | 입력 검증(게이트웨이 ValidationPipe — 중첩은 점 경로 `hours.0.open_time` · `breaks.0.start_time` · `store_detail.room_count`) |
| 400 | #3 · #4 업체 사진 5장 초과 `올릴 수 있는 파일 수를 넘었습니다.` · 용도 룩업 없음 `파일 용도가 올바르지 않습니다.` |
| 400 | #4 저장 키 모양(`validation_errors.file_key`) · 업로드 안 됨 `파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.` · 같은 키 `이미 등록된 파일입니다.`(UK_StoreFile_FileKey) |
| 400 | #6 업체 사진 ID 빠짐 · 남음 · 겹침(`validation_errors.store_file_ids`) |
| 400 | #7 연중무휴인데 요일별 있음 · 7개 요일 아님(`validation_errors.hours`) · 시작 = 마감(`hours.<i>.close_time`) |
| 400 | #8 시작 = 마감(`breaks.<i>.end_time`) · 서로 겹침 `브레이크타임이 서로 겹칩니다.`(`validation_errors.breaks`) |
| 400 | #10 같은 값 `이미 같은 상태입니다.` |
| 400 | #12 없는 일시(`starts_at` · `ends_at`) · 시작 ≥ 종료 · 이미 끝남(`ends_at`) · 다른 일시 예약불가와 겹침(`starts_at`) |
| 401 | 매니저 토큰 없음 · 만료 · 다른 그룹 토큰 · 로그인 불가 계정(게이트웨이 매니저 가드), 큐 명령에 actor 없음 |
| 403 | 서비스 직접 호출(내부 토큰 불일치 — InternalAuthGuard) |
| 404 | 소속 업체 없음 · 탈퇴 업체 `소속 업체를 찾을 수 없습니다.`(전부) · #5 `파일을 찾을 수 없습니다.`(사업자등록증 · 다른 업체) · #13 `일시 예약불가를 찾을 수 없습니다.` |
| 500 | DB 실패 `서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.`(큐는 재시도 3회 후 failed + DLQ) |
| 503 | 저장소(S3) 실패 — #3 업로드 주소 · #4 exists · #5 remove(행 삭제가 롤백되고 재시도) · #1 서명 주소, 브로커 미연결(큐 발행) |
