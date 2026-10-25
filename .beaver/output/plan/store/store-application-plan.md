# Plan — store-application

## Feature Summary
- **Feature**: 업체 입점·관리(Phase 9 #37 ~ #41)
  - 이용자: 입점 신청 · 업체 정보 파일(사업자등록증 1 · 업체 사진 5) · 내 신청
  - 총관리자: 신청 목록 · 상세 · 승인(업체 + 업체 총관리자 계정 + SMS) · 반려, 업체 목록 · 상세 · 수정 · 상태 변경
- **Entry point**: 게이트웨이 `/api/v1/admin-service/store`(동기 7 · 큐 8 — 신청 취소 포함) → admin-service store 도메인(`/internal/v1/admin-service/store` · `admin.store.*`)
- **Domain**: store (admin-service — 새 도메인)
- **Spec**: [store-application-spec.md](../../spec/store/store-application-spec.md)

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/store/store-application.entity.ts` | modified — `business_license_image_key` · `head_manager_name` 삭제, `head_manager_phone` → `owner_phone`(대표자 = 업체 총관리자) · 주석 |
| `libs/database/src/entities/store/store-file-purpose.entity.ts` | new — 업체 정보 파일 용도 룩업(+ `is_private`) |
| `libs/database/src/entities/store/store-file.entity.ts` | new — 업체 정보 파일 |
| `libs/database/src/entities/store/store-image.entity.ts` | **deleted** — `t_store_file` 로 합친다(사용처 · 데이터 없음) |
| `libs/database/src/entities.ts` | modified — `StoreFilePurposeEntity` · `StoreFileEntity` 추가, `StoreImageEntity` 제거 |
| `libs/database/src/seeder/seeder.targets.ts` | modified — `STORE_FILE_PURPOSE_SEED_DATA` |
| `libs/database/src/migrations/<ts>-StoreFile.ts` · `migrations.ts` | new · modified — `db:generate` (down 손 보정) |
| `libs/integration/src/interfaces/integration.interface.ts` | modified — `StorageDownloadResult` · `createDownloadUrl` |
| `libs/integration/src/integration.constants.ts` | modified — `STORAGE_DOWNLOAD_URL_TTL_SECONDS` |
| `libs/integration/src/storage/s3-storage.gateway.ts` | modified — presigned GET |
| `libs/contracts/src/store/store.commands.ts` | new — `STORE_COMMAND` · `STORE_INTERNAL_PATH` |
| `libs/contracts/src/store/dto/*.dto.ts` (15) | new — 신청 취소 `store-application-cancel.dto.ts` 포함 |
| `apps/admin-service/src/store/{store.module,store.symbols,store.constants,store.util,store.service}.ts` | new |
| `apps/admin-service/src/store/interfaces/store.repository.interface.ts` · `repositories/store.repository.ts` | new |
| `apps/admin-service/src/store/controllers/store.controller.ts` · `store.controller.queue.ts` | new |
| `apps/admin-service/src/store/test/store.test-helper.ts` + spec 16 | new — 신청 취소 `store-application-cancel.spec.ts` 포함 |
| `apps/admin-service/src/admin-service.module.ts` | modified — `StorageModule` · `StoreModule` |
| `apps/gateway/src/modules/transport/internal-http.client.ts` | modified — `query` 옵션 |
| `apps/gateway/src/api/v1/admin-service/store/{store.module.ts, controllers/store.controller.ts, controllers/store.controller.queue.ts}` | new |
| `apps/gateway/src/gateway.module.ts` | modified — `StoreModule` |
| `AGENTS.md` · `docs/{architecture,conventions,data-layer,integration,testing,api}.md` · `docs/guides/aws-setup.md` | modified — store 도메인 · 목록 규약 적용 · 검증 데코레이터 · 경로 함수 · 파일 규칙(용도 룩업 `is_private` · 새 키) · CloudFront 기본 구성 |
| `README.md` | modified — admin-service 설명에 업체 입점 · 관리 |
| `.beaver/output/spec/platform/cache-spec.md` | 반영됨(기획 때) — 무효화 지점 표 |
| `.beaver/output/roadmap/roomless-roadmap.md` (+ html) | modified — `roadmap-status.js` 로 상태 |

삭제할 코드:
- `t_store_application.business_license_image_key`(Phase 8)
- `t_store_image` · `StoreImageEntity`(Phase 8) — 업체 사진도 업체 정보 파일 `t_store_file` 한 곳에 둔다(사용자 결정 2026-10-26)
- `docs/data-layer.md` 트리의 `store-image`

store 를 읽던 앱 코드는 없다(새 도메인).

---

## Design

### Data Access — 엔티티 · 시드 · 마이그레이션

형제: 용도 룩업 `t_sms_purpose`(sms-purpose.entity.ts) · 동작 플래그가 있는 룩업 `t_state.is_login_allowed`(state.entity.ts) · FK `user.entity.ts:23-41`.

```ts
// libs/database/src/entities/store/store-application.entity.ts — modified
// 1) 클래스 주석
/**
 * 입점 신청 — 이용자가 신청하고 총관리자가 승인 · 반려한다. 승인하면 업체(t_store)와 업체 총관리자 계정을 만들고 store_id 를 남긴다.
 * 신청 때 올린 업체 정보 파일(사업자등록증 · 업체 사진)은 t_store_file(store_application_id) — 승인하면 같은 행에 store_id 를 채운다.
 * 신청자 user_id 는 다른 서비스 소유 테이블(t_user)이라 FK 없이 ID 만 둔다(data-layer.md — 서비스 간 FK 를 새로 만들지 않는다).
 */
// 2) 아래 컬럼 블록을 지운다
//    @Column({name: 'business_license_image_key', length: 255, nullable: false, comment: '사업자등록증 사진 저장 키(S3)'})
//    business_license_image_key: string;
//    @Column({name: 'head_manager_name', length: 50, nullable: false, comment: '업체 총관리자 이름 — 승인 때 만드는 매니저 계정'})
//    head_manager_name: string;
// 3) 대표자 = 업체 총관리자 (사용자 결정 2026-10-26) — 대표자명 주석, 업체 총관리자 번호 → 대표자 휴대폰 번호
    @Column({name: 'owner_name', length: 50, nullable: false, comment: '대표자명 — 승인 때 만드는 업체 총관리자(매니저) 계정의 이름'})
    owner_name: string;

    @Column({name: 'owner_phone', length: 30, nullable: false, comment: '대표자 휴대폰 번호(숫자만) — 승인 때 만드는 업체 총관리자(매니저) 계정 · 안내 SMS'})
    owner_phone: string;
```

```ts
// libs/database/src/entities/store/store-file-purpose.entity.ts — new
import {Column, Entity, PrimaryColumn} from 'typeorm';

/**
 * 업체 정보 파일 용도 (룩업) — 기본 데이터는 seeder.targets.ts.
 * is_private 가 저장 키 · 열람 주소를 정한다 — 1 이면 private/ 키 + 서명된 열람 주소(presigned GET), 0 이면 공개 키 + CDN 공개 주소.
 */
@Entity({name: 't_store_file_purpose', comment: '업체 정보 파일 용도'})
export class StoreFilePurposeEntity {
    @PrimaryColumn({name: 'store_file_purpose_id', length: 20, comment: '업체 정보 파일 용도 ID', primaryKeyConstraintName: 'PK_StoreFilePurpose'})
    store_file_purpose_id: string;

    @Column({name: 'store_file_purpose_name', length: 50, nullable: false, comment: '업체 정보 파일 용도명'})
    store_file_purpose_name: string;

    @Column({name: 'is_private', type: 'smallint', nullable: false, default: 0, comment: '비공개 여부(0: 공개 — CDN 공개 주소, 1: 비공개 — private/ 키 · 서명된 열람 주소)'})
    is_private: number;
}
```

```ts
// libs/database/src/entities/store/store-file.entity.ts — new
import {BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Unique} from 'typeorm';
import {StoreApplicationEntity} from './store-application.entity.js';
import {StoreFilePurposeEntity} from './store-file-purpose.entity.js';
import {StoreEntity} from './store.entity.js';

/**
 * 업체 정보 파일 — 파일 1개 = 1행(사업자등록증 · 업체 사진). 업체의 정보다.
 * 입점 신청 때는 신청(store_application_id)에 붙여 올리고(대기 중에만 추가 · 삭제), 승인하면 같은 행에 업체(store_id)를 채운다 — 파일을 옮기거나 복사하지 않는다.
 * 비공개 여부는 용도(t_store_file_purpose.is_private)가 정한다.
 */
@Entity({name: 't_store_file', comment: '업체 정보 파일'})
@Unique('UK_StoreFile_FileKey', ['file_key'])
@Index('IDX_StoreFile_StoreApplicationIdSortOrder', ['store_application_id', 'sort_order'])
@Index('IDX_StoreFile_StoreIdSortOrder', ['store_id', 'sort_order'])
export class StoreFileEntity {
    @PrimaryColumn({name: 'store_file_id', length: 32, comment: '업체 정보 파일 ID', primaryKeyConstraintName: 'PK_StoreFile'})
    store_file_id: string;

    @ManyToOne(() => StoreFilePurposeEntity, {nullable: false, onUpdate: 'CASCADE', onDelete: 'CASCADE'})
    @JoinColumn({name: 'store_file_purpose_id', referencedColumnName: 'store_file_purpose_id', foreignKeyConstraintName: 'FK_StoreFile_StoreFilePurpose'})
    store_file_purpose_id: string;

    @ManyToOne(() => StoreApplicationEntity, {nullable: true, onUpdate: 'CASCADE', onDelete: 'RESTRICT'})
    @JoinColumn({name: 'store_application_id', referencedColumnName: 'store_application_id', foreignKeyConstraintName: 'FK_StoreFile_StoreApplication'})
    store_application_id: string | null;

    @ManyToOne(() => StoreEntity, {nullable: true, onUpdate: 'CASCADE', onDelete: 'RESTRICT'})
    @JoinColumn({name: 'store_id', referencedColumnName: 'store_id', foreignKeyConstraintName: 'FK_StoreFile_Store'})
    store_id: string | null;

    @Column({name: 'file_key', length: 255, nullable: false, comment: '저장 키(S3 — 비공개 private/store-application/…, 공개 store/application/…) — 같은 키를 덮어쓰지 않는다'})
    file_key: string;

    @Column({name: 'file_name', length: 255, nullable: false, comment: '원본 파일명'})
    file_name: string;

    @Column({name: 'content_type', length: 100, nullable: false, comment: 'MIME 타입(image/jpeg · image/png)'})
    content_type: string;

    @Column({name: 'sort_order', type: 'smallint', nullable: false, default: 0, comment: '정렬 순서(용도 안에서 0부터 — 업체 사진은 0 이 대표)'})
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
// libs/database/src/entities/store/store-image.entity.ts — deleted (git rm)
```

```ts
// libs/database/src/entities.ts — modified
import {StoreFilePurposeEntity} from './entities/store/store-file-purpose.entity.js';
import {StoreFileEntity} from './entities/store/store-file.entity.js';
// import {StoreImageEntity} from './entities/store/store-image.entity.js';  ← 삭제

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
    UserEntity,
    UserSettingEntity,
    SessionEntity,
    SessionRefreshEntity,
    SmsVerificationEntity,
    ApiLogEntity,
];
```

```ts
// libs/database/src/seeder/seeder.targets.ts — modified (추가분)
import {StoreFilePurposeEntity} from '../entities/store/store-file-purpose.entity.js';

/** 업체 정보 파일 용도(t_store_file_purpose) 기본 데이터 — admin-service store.constants.ts 의 STORE_FILE_PURPOSE 와 같다. 사업자등록증만 비공개 */
export const STORE_FILE_PURPOSE_SEED_DATA: StoreFilePurposeEntity[] = [
    {store_file_purpose_id: 'BUSINESS_LICENSE', store_file_purpose_name: '사업자등록증', is_private: 1},
    {store_file_purpose_id: 'STORE_IMAGE', store_file_purpose_name: '업체 사진', is_private: 0},
];

// SEED_TARGETS: StoreApplicationStateEntity 다음 줄
    {entity: StoreFilePurposeEntity, data: STORE_FILE_PURPOSE_SEED_DATA},
```

시드는 PK 기준으로 없는 행만 넣는다(seeder.service.ts). 그래서 나중에 `is_private` 값을 바꾸려면 시드가 아니라 마이그레이션으로 고쳐야 한다. 이 내용을 data-layer.md 룩업 항목에 한 줄 적는다.

마이그레이션 — `npm run db:generate -- StoreFile` 후 손으로 고친다. 형제는 1792780576432-StoreSchema.ts 이다.
- 머리 주석을 쓴다(아래).
- 생성된 단일 컬럼 UK 이름이 `UK_StoreFile_FileKey` 인지 확인한다(`UQ_<해시>` 면 고친다).
- down 의 `ADD "business_license_image_key" … NOT NULL` 은 `DEFAULT ''` 로 추가한 뒤 `DROP DEFAULT` 로 고친다 — 기존 행이 있어도 되돌릴 수 있게.
- down 은 생성기대로 `t_store_image` 를 다시 만든다(데이터는 없었다).
- `head_manager_phone` → `owner_phone` 은 생성기가 DROP + ADD 로 계산한다. 데이터가 사라지지 않게 `ALTER TABLE "t_store_application" RENAME COLUMN "head_manager_phone" TO "owner_phone"` 한 줄로 바꾼다(형제 1792477492198-RenameColumns.ts). down 은 반대 RENAME 이다.
- `head_manager_name` 은 DROP 이다. down 은 `DEFAULT ''` 로 추가한 뒤 DROP DEFAULT.

```ts
// libs/database/src/migrations/<ts>-StoreFile.ts — 머리 주석 · down 보정 부분
/**
 * 업체 정보 파일 (로드맵 Phase 9)
 * - t_store_file_purpose(용도 룩업 + is_private, 기본 데이터는 seeder) · t_store_file(UK_StoreFile_FileKey — 신청 · 업체 FK)
 * - t_store_image 삭제 — 업체 사진도 t_store_file 로 (Phase 8 에서 만들었고 사용처 · 데이터 없음)
 * - t_store_application.business_license_image_key 삭제 — 사업자등록증은 t_store_file 로
 * - t_store_application 대표자 = 업체 총관리자: head_manager_name 삭제(대표자명 owner_name 을 쓴다), head_manager_phone → owner_phone (RENAME — 손으로 고친 부분)
 */
// up — 생성된 DROP "head_manager_phone" + ADD "owner_phone" 를 RENAME 으로 바꾼다
await queryRunner.query(`ALTER TABLE "t_store_application" RENAME COLUMN "head_manager_phone" TO "owner_phone"`);
// down — 생성된 ADD 를 바꾼다
await queryRunner.query(`ALTER TABLE "t_store_application" ADD "business_license_image_key" character varying(255) NOT NULL DEFAULT ''`);
await queryRunner.query(`ALTER TABLE "t_store_application" ALTER COLUMN "business_license_image_key" DROP DEFAULT`);
```

### Data Access — 저장소 포트(비공개 파일 열람 주소)

```ts
// libs/integration/src/interfaces/integration.interface.ts — modified (추가분)
/** 열람 주소 */
export interface StorageDownloadResult {
    /** 비공개 파일을 GET 으로 볼 주소 (STORAGE_DOWNLOAD_URL_TTL_SECONDS 동안 유효) */
    download_url: string;
    /** download_url 이 만료되는 시각 */
    expires_at: Date;
}

// StorageGatewayInterface 주석: "파일 저장소 포트 — 공개 파일(업체 · 객실 그룹 사진 — CDN 공개 주소)과 비공개 파일(사업자등록증 — private/, 서명된 열람 주소)."
    /**
     * 비공개 파일(private/ 접두 — CDN · 공개 읽기 밖)을 잠깐 볼 수 있는 열람 주소를 발급한다(presigned GET).
     *
     * @throws ServiceUnavailableException `{message: STORAGE_UNAVAILABLE_MESSAGE}` — 서명하지 못했을 때
     */
    createDownloadUrl(key: string): Promise<StorageDownloadResult>;
```

```ts
// libs/integration/src/integration.constants.ts — modified (추가분)
/** 비공개 파일 열람 주소(presigned GET)의 유효 시간(초) */
export const STORAGE_DOWNLOAD_URL_TTL_SECONDS = 600;
```

```ts
// libs/integration/src/storage/s3-storage.gateway.ts — modified (추가분 · import 에 GetObjectCommand · STORAGE_DOWNLOAD_URL_TTL_SECONDS · StorageDownloadResult)
    /**
     * 비공개 파일 열람 주소를 서명한다(네트워크 호출 없음) — CDN · 공개 읽기 밖(private/)의 파일용.
     *
     * @param key 저장 키
     * @returns 열람 주소 · 만료 시각
     * @throws ServiceUnavailableException 서명하지 못했을 때(자격증명 · 버킷 설정 없음)
     */
    async createDownloadUrl(key: string): Promise<StorageDownloadResult> {
        try {
            const downloadUrl = await getSignedUrl(this.client, new GetObjectCommand({Bucket: process.env.AWS_S3_BUCKET, Key: key}), {expiresIn: STORAGE_DOWNLOAD_URL_TTL_SECONDS});
            return {download_url: downloadUrl, expires_at: new Date(Date.now() + STORAGE_DOWNLOAD_URL_TTL_SECONDS * 1000)};
        } catch (error) {
            throw toUnavailable(this.logger, '열람 주소 발급', error);
        }
    }
```

### Data Access — 게이트웨이 내부 HTTP 쿼리 문자열

```ts
// apps/gateway/src/modules/transport/internal-http.client.ts — modified
export interface InternalRequestOptions {
    /** JSON 본문 */
    body?: unknown;
    /** 로그인 회원 (헤더로 전달) */
    actor?: Actor | null;
    /** 클라이언트 IP (헤더로 전달) */
    client_ip?: string | null;
    /** 쿼리 문자열 — 값이 undefined · null 인 키는 뺀다(목록 Query DTO) */
    query?: object;
}

// request() — fetch 주소
            response = await fetch(`${base}${path}${toQueryString(options.query)}`, init);

/**
 * 쿼리 객체를 `?a=1&b=2` 로 바꾼다 — undefined · null 인 값은 뺀다. 없으면 빈 문자열.
 *
 * @param query 쿼리 객체
 * @returns 쿼리 문자열
 */
function toQueryString(query: object | undefined): string {
    if (!query) {
        return '';
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
            params.append(key, String(value));
        }
    }
    const text = params.toString();
    return text ? `?${text}` : '';
}
```

### Input/Validation — contracts (규격 상수 · DTO 14)

```ts
// libs/contracts/src/store/store.commands.ts — new
/** store 내부 HTTP 경로 접두 */
const STORE_INTERNAL_BASE = '/internal/v1/admin-service/store';

/**
 * store 도메인(업체 · 입점 신청) RabbitMQ 명령 종류 (= 라우팅 키, admin-service 의 q.admin.cmd 가 `admin.#` 로 받는다).
 * 큐 경로 기준: 입점 신청 · 파일 등록 · 파일 삭제(이용자), 승인 · 반려 · 업체 수정 · 상태 변경(총관리자). 조회 · 업로드 주소는 내부 HTTP 동기 경로다.
 */
export const STORE_COMMAND = {
    /** 입점 신청 (이용자) */
    APPLICATION: 'admin.store.application',
    /** 신청에 업체 정보 파일 등록 (이용자 — 대기 중 내 신청) */
    APPLICATION_FILE: 'admin.store.application-file',
    /** 신청의 업체 정보 파일 삭제 (이용자 — 대기 중 내 신청) */
    APPLICATION_FILE_DELETE: 'admin.store.application-file-delete',
    /** 입점 승인 (총관리자) */
    APPLICATION_APPROVE: 'admin.store.application-approve',
    /** 입점 반려 (총관리자) */
    APPLICATION_REJECT: 'admin.store.application-reject',
    /** 업체 정보 수정 (총관리자) */
    UPDATE: 'admin.store.update',
    /** 업체 상태 변경 (총관리자) */
    STATE: 'admin.store.state',
} as const;

/**
 * store 도메인 내부 HTTP 경로 (게이트웨이 → admin-service). 파라미터가 있는 경로는 함수로 만든다 — 게이트웨이가 경로 문자열을 이어 붙이지 않는다.
 */
export const STORE_INTERNAL_PATH = {
    /** 내 입점 신청 목록 (GET) */
    MY_APPLICATION_LIST: `${STORE_INTERNAL_BASE}/application/mine`,
    /** 내 입점 신청 상세 (GET) */
    myApplication: (store_application_id: string) => `${STORE_INTERNAL_BASE}/application/mine/${encodeURIComponent(store_application_id)}`,
    /** 파일 업로드 주소 (POST) */
    myApplicationFileUploadUrl: (store_application_id: string) => `${STORE_INTERNAL_BASE}/application/mine/${encodeURIComponent(store_application_id)}/file/upload-url`,
    /** 입점 신청 목록 (GET, 총관리자) */
    APPLICATION_LIST: `${STORE_INTERNAL_BASE}/application`,
    /** 입점 신청 상세 (GET, 총관리자) */
    application: (store_application_id: string) => `${STORE_INTERNAL_BASE}/application/${encodeURIComponent(store_application_id)}`,
    /** 업체 목록 (GET, 총관리자) */
    STORE_LIST: STORE_INTERNAL_BASE,
    /** 업체 상세 (GET, 총관리자) */
    store: (store_id: string) => `${STORE_INTERNAL_BASE}/${encodeURIComponent(store_id)}`,
} as const;
```

공통 조각 — 각 파일이 독립 선언한다("기능당 DTO 1개, 모양 같아도 독립 선언").
- ID param 은 `@Matches(/^[a-f0-9]{32}$/, {message: '<이름> ID가 올바르지 않습니다.'})` + `@IsNotEmpty({message: '<이름> ID를 입력해주세요.'})` 이다. 형제는 manager-find-login-id-confirm.dto.ts:9.
- 휴대폰 번호는 형제(manager-find-login-id.dto.ts:9)의 `/^01[016789]\d{7,8}$/` 를 쓴다.
- 파일 용도는 `@IsIn(['BUSINESS_LICENSE', 'STORE_IMAGE'])` 이다 — 시드 `STORE_FILE_PURPOSE_SEED_DATA` 와 같다.

```ts
// libs/contracts/src/store/dto/store-application.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsLatitude, IsLongitude, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 입점 신청 — 업체 정보 (이용자). 업체 정보 파일은 신청 뒤 따로 붙인다. 위경도는 클라이언트가 주소 검색으로 구해 보낸다.
 */
export class StoreApplicationDto {
    @ApiProperty({description: '상호명', example: '룸리스 강남점'})
    @MaxLength(100, {message: '상호명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호 (숫자 10자리)', example: '1234567890'})
    @Matches(/^\d{10}$/, {message: '사업자등록번호 10자리를 숫자만 입력해주세요.'})
    @IsNotEmpty({message: '사업자등록번호를 입력해주세요.'})
    business_number: string;

    @ApiProperty({description: '대표자명 — 승인 때 업체 총관리자 계정의 이름'})
    @MaxLength(50, {message: '대표자명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '대표자명을 입력해주세요.'})
    owner_name: string;

    @ApiProperty({description: '대표자 휴대폰 번호 (숫자만) — 승인 때 업체 총관리자 계정 · 안내 SMS', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '대표자 휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '대표자 휴대폰 번호를 입력해주세요.'})
    owner_phone: string;

    @ApiProperty({description: '업체 연락처 (숫자만)', example: '0212345678'})
    @Matches(/^\d{8,11}$/, {message: '업체 연락처를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '업체 연락처를 입력해주세요.'})
    phone: string;

    @ApiProperty({description: '주소'})
    @MaxLength(255, {message: '주소는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '주소를 입력해주세요.'})
    address: string;

    @ApiProperty({description: '상세주소', required: false})
    @IsOptional()
    @MaxLength(255, {message: '상세주소는 255자 이내로 입력해주세요.'})
    address_detail?: string;

    @ApiProperty({description: '위도 (WGS84)', example: 37.4979})
    @IsLatitude({message: '위도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '위도를 입력해주세요.'})
    latitude: number;

    @ApiProperty({description: '경도 (WGS84)', example: 127.0276})
    @IsLongitude({message: '경도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '경도를 입력해주세요.'})
    longitude: number;

    @ApiProperty({description: '신청 메모', required: false})
    @IsOptional()
    @MaxLength(500, {message: '신청 메모는 500자 이내로 입력해주세요.'})
    application_comment?: string;
}

/**
 * 입점 신청 결과
 */
export class StoreApplicationResultDto {
    @ApiProperty({description: '입점 신청 ID — 업체 정보 파일을 붙일 때 쓴다'})
    store_application_id: string;
}
```

```ts
// libs/contracts/src/store/dto/store-my-application-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 내 입점 신청 목록 query — 페이지만. 승인된 신청은 빠진다(대기 · 반려만).
 */
export class StoreMyApplicationListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<StoreMyApplicationListDto>) {
        super(data);
    }
}

/**
 * 내 입점 신청 목록 항목
 */
export class StoreMyApplicationItemResultDto {
    @ApiProperty({description: '입점 신청 ID'})
    store_application_id: string;

    @ApiProperty({description: '신청 상태 (WAIT: 대기, REJECTED: 반려)'})
    store_application_state_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '반려 사유 (반려가 아니면 null)', nullable: true, type: String})
    reject_comment: string | null;

    @ApiProperty({description: '처리일시 (ISO 8601, 대기면 null)', nullable: true, type: String})
    reviewed_at: string | null;

    @ApiProperty({description: '신청일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 내 입점 신청 목록
 */
export class StoreMyApplicationListResultDto {
    @ApiProperty({description: '목록 (신청일 최신순)', type: () => [StoreMyApplicationItemResultDto]})
    list: StoreMyApplicationItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```ts
// libs/contracts/src/store/dto/store-my-application.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 입점 신청 상세 path param
 */
export class StoreMyApplicationParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 내 입점 신청의 업체 정보 파일
 */
export class StoreMyApplicationFileResultDto {
    @ApiProperty({description: '업체 정보 파일 ID'})
    store_file_id: string;

    @ApiProperty({description: '용도 (BUSINESS_LICENSE: 사업자등록증, STORE_IMAGE: 업체 사진)'})
    store_file_purpose_id: string;

    @ApiProperty({description: '원본 파일명'})
    file_name: string;

    @ApiProperty({description: 'MIME 타입'})
    content_type: string;

    @ApiProperty({description: '비공개 여부 (1: 서명된 열람 주소 · 10분 유효, 0: CDN 공개 주소)'})
    is_private: number;

    @ApiProperty({description: '열람 주소'})
    file_url: string;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 내 입점 신청 상세 — 대기 · 반려 신청만(승인 신청은 404)
 */
export class StoreMyApplicationResultDto {
    @ApiProperty({description: '입점 신청 ID'})
    store_application_id: string;

    @ApiProperty({description: '신청 상태 (WAIT · REJECTED)'})
    store_application_state_id: string;

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

    @ApiProperty({description: '대표자 휴대폰 번호 — 업체 총관리자 계정'})
    owner_phone: string;

    @ApiProperty({description: '신청 메모', nullable: true, type: String})
    application_comment: string | null;

    @ApiProperty({description: '반려 사유', nullable: true, type: String})
    reject_comment: string | null;

    @ApiProperty({description: '처리일시 (ISO 8601)', nullable: true, type: String})
    reviewed_at: string | null;

    @ApiProperty({description: '신청일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '업체 정보 파일 (용도 · 정렬 순서)', type: () => [StoreMyApplicationFileResultDto]})
    files: StoreMyApplicationFileResultDto[];
}
```

```ts
// libs/contracts/src/store/dto/store-application-file-upload-url.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 정보 파일 업로드 주소 path param
 */
export class StoreApplicationFileUploadUrlParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 업체 정보 파일 업로드 주소 요청 — 대기 중 내 신청만
 */
export class StoreApplicationFileUploadUrlDto {
    @ApiProperty({description: '용도 (BUSINESS_LICENSE: 사업자등록증 1장, STORE_IMAGE: 업체 사진 5장까지)', enum: ['BUSINESS_LICENSE', 'STORE_IMAGE']})
    @IsIn(['BUSINESS_LICENSE', 'STORE_IMAGE'], {message: '파일 용도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '파일 용도를 입력해주세요.'})
    store_file_purpose_id: string;

    @ApiProperty({description: '올릴 파일의 MIME 타입 — 업로드할 때 같은 Content-Type 헤더로 PUT 한다', enum: ['image/jpeg', 'image/png']})
    @IsIn(['image/jpeg', 'image/png'], {message: 'JPG · PNG 사진만 올릴 수 있습니다.'})
    @IsNotEmpty({message: '파일 형식을 입력해주세요.'})
    content_type: string;
}

/**
 * 업체 정보 파일 업로드 주소 — 이 주소로 PUT 한 뒤 file_key 로 파일을 등록한다
 */
export class StoreApplicationFileUploadUrlResultDto {
    @ApiProperty({description: '저장 키 — 파일 등록 때 보낸다'})
    file_key: string;

    @ApiProperty({description: '업로드 주소 (PUT, 10분 유효)'})
    upload_url: string;

    @ApiProperty({description: '업로드 주소 만료일시 (ISO 8601)'})
    expires_at: string;
}
```

```ts
// libs/contracts/src/store/dto/store-application-file.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 정보 파일 등록 path param
 */
export class StoreApplicationFileParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 업체 정보 파일 등록 — 업로드 주소로 올린 파일의 키를 신청에 붙인다(대기 중 내 신청만)
 */
export class StoreApplicationFileDto {
    @ApiProperty({description: '용도 (BUSINESS_LICENSE · STORE_IMAGE) — 업로드 주소를 받을 때와 같다', enum: ['BUSINESS_LICENSE', 'STORE_IMAGE']})
    @IsIn(['BUSINESS_LICENSE', 'STORE_IMAGE'], {message: '파일 용도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '파일 용도를 입력해주세요.'})
    store_file_purpose_id: string;

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
 * 업체 정보 파일 등록 결과
 */
export class StoreApplicationFileResultDto {
    @ApiProperty({description: '업체 정보 파일 ID'})
    store_file_id: string;
}
```

```ts
// libs/contracts/src/store/dto/store-application-file-delete.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 정보 파일 삭제 path param — 대기 중 내 신청의 파일만
 */
export class StoreApplicationFileDeleteParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;

    @ApiProperty({description: '업체 정보 파일 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 정보 파일 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 정보 파일 ID를 입력해주세요.'})
    store_file_id: string;
}
```

```ts
// libs/contracts/src/store/dto/store-application-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 입점 신청 목록 query (총관리자) — 상태 · 검색어(상호명 · 사업자등록번호 부분 일치)
 */
export class StoreApplicationListDto extends PaginationDto {
    @ApiProperty({description: '신청 상태 (WAIT · APPROVED · REJECTED) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['WAIT', 'APPROVED', 'REJECTED'], {message: '신청 상태가 올바르지 않습니다.'})
    store_application_state_id: string | null;

    @ApiProperty({description: '검색어 — 상호명 · 사업자등록번호 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<StoreApplicationListDto>) {
        super(data);
        this.store_application_state_id = data?.store_application_state_id ?? null;
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 입점 신청 목록 항목 (총관리자)
 */
export class StoreApplicationListItemResultDto {
    @ApiProperty({description: '입점 신청 ID'})
    store_application_id: string;

    @ApiProperty({description: '신청한 이용자 ID'})
    user_id: string;

    @ApiProperty({description: '신청 상태 (WAIT · APPROVED · REJECTED)'})
    store_application_state_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '승인으로 만든 업체 ID (승인 전 null)', nullable: true, type: String})
    store_id: string | null;

    @ApiProperty({description: '처리일시 (ISO 8601)', nullable: true, type: String})
    reviewed_at: string | null;

    @ApiProperty({description: '신청일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 입점 신청 목록 (총관리자)
 */
export class StoreApplicationListResultDto {
    @ApiProperty({description: '목록 (신청일 최신순)', type: () => [StoreApplicationListItemResultDto]})
    list: StoreApplicationListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```ts
// libs/contracts/src/store/dto/store-application-detail.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 입점 신청 상세 path param (총관리자)
 */
export class StoreApplicationDetailParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 신청자 (t_user 이용자 그룹 — 없으면 상세의 applicant 가 null)
 */
export class StoreApplicationApplicantResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '닉네임'})
    nickname: string;

    @ApiProperty({description: '휴대폰 번호 (미인증 null)', nullable: true, type: String})
    phone: string | null;
}

/**
 * 입점 신청의 업체 정보 파일 (총관리자)
 */
export class StoreApplicationDetailFileResultDto {
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

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 입점 신청 상세 (총관리자)
 */
export class StoreApplicationDetailResultDto {
    @ApiProperty({description: '입점 신청 ID'})
    store_application_id: string;

    @ApiProperty({description: '신청한 이용자 ID'})
    user_id: string;

    @ApiProperty({description: '신청 상태 (WAIT · APPROVED · REJECTED)'})
    store_application_state_id: string;

    @ApiProperty({description: '승인으로 만든 업체 ID', nullable: true, type: String})
    store_id: string | null;

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

    @ApiProperty({description: '대표자 휴대폰 번호 — 업체 총관리자 계정'})
    owner_phone: string;

    @ApiProperty({description: '신청 메모', nullable: true, type: String})
    application_comment: string | null;

    @ApiProperty({description: '반려 사유', nullable: true, type: String})
    reject_comment: string | null;

    @ApiProperty({description: '처리일시 (ISO 8601)', nullable: true, type: String})
    reviewed_at: string | null;

    @ApiProperty({description: '신청일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '신청자 (없으면 null)', nullable: true, type: () => StoreApplicationApplicantResultDto})
    applicant: StoreApplicationApplicantResultDto | null;

    @ApiProperty({description: '업체 정보 파일 (용도 · 정렬 순서)', type: () => [StoreApplicationDetailFileResultDto]})
    files: StoreApplicationDetailFileResultDto[];
}
```

```ts
// libs/contracts/src/store/dto/store-application-approve.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 입점 승인 path param (총관리자)
 */
export class StoreApplicationApproveParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 입점 승인 결과 — 임시 비밀번호는 업체 총관리자 휴대폰으로만 보낸다(응답에 없음)
 */
export class StoreApplicationApproveResultDto {
    @ApiProperty({description: '등록한 업체 ID'})
    store_id: string;

    @ApiProperty({description: '업체 총관리자 아이디'})
    login_id: string;
}
```

```ts
// libs/contracts/src/store/dto/store-application-reject.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 입점 반려 path param (총관리자)
 */
export class StoreApplicationRejectParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 입점 반려 — 사유 필수
 */
export class StoreApplicationRejectDto {
    @ApiProperty({description: '반려 사유 — 신청자가 내 신청에서 본다'})
    @MaxLength(255, {message: '반려 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '반려 사유를 입력해주세요.'})
    reject_comment: string;
}
```

```ts
// libs/contracts/src/store/dto/store-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 업체 목록 query (총관리자) — 상태 · 검색어(상호명 · 사업자등록번호 · 대표자명 부분 일치)
 */
export class StoreListDto extends PaginationDto {
    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE) — 없으면 전체', required: false})
    @IsOptional()
    @IsIn(['ACTIVE', 'SUSPEND', 'LEAVE'], {message: '업체 상태가 올바르지 않습니다.'})
    store_state_id: string | null;

    @ApiProperty({description: '검색어 — 상호명 · 사업자등록번호 · 대표자명 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<StoreListDto>) {
        super(data);
        this.store_state_id = data?.store_state_id ?? null;
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 업체 목록 항목
 */
export class StoreListItemResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE)'})
    store_state_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '사업자등록번호 (탈퇴 업체는 DELETE_<store_id>)'})
    business_number: string;

    @ApiProperty({description: '대표자명'})
    owner_name: string;

    @ApiProperty({description: '업체 연락처'})
    phone: string;

    @ApiProperty({description: '주소'})
    address: string;

    @ApiProperty({description: '영업중 여부 (0: 영업중 아님 · 영업준비, 1: 영업중)'})
    is_open: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 업체 목록
 */
export class StoreListResultDto {
    @ApiProperty({description: '목록 (등록일 최신순)', type: () => [StoreListItemResultDto]})
    list: StoreListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```ts
// libs/contracts/src/store/dto/store-detail.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 상세 path param (총관리자)
 */
export class StoreDetailParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 정보 파일 (총관리자 — 사업자등록증 · 업체 사진)
 */
export class StoreDetailFileResultDto {
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

    @ApiProperty({description: '정렬 순서 (업체 사진은 0 이 대표)'})
    sort_order: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 업체 상세 (총관리자)
 */
export class StoreDetailResultDto {
    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '업체 상태 (ACTIVE · SUSPEND · LEAVE)'})
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

    @ApiProperty({description: '업체 상세정보 (room_count · has_shower · has_tv · has_pc)', type: Object})
    store_detail: Record<string, number>;

    @ApiProperty({description: '24시간 연중무휴 여부 (0 · 1)'})
    is_always_open: number;

    @ApiProperty({description: '영업중 여부 (0: 영업중 아님 · 영업준비, 1: 영업중)'})
    is_open: number;

    @ApiProperty({description: '정비시간(분)'})
    maintenance_minutes: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '수정일시 (ISO 8601)'})
    updated_at: string;

    @ApiProperty({description: '업체 정보 파일 (용도 · 정렬 순서)', type: () => [StoreDetailFileResultDto]})
    files: StoreDetailFileResultDto[];
}
```

```ts
// libs/contracts/src/store/dto/store-update.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsLatitude, IsLongitude, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 업체 정보 수정 path param (총관리자)
 */
export class StoreUpdateParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 정보 수정 — 사업자등록번호는 바꾸지 않는다. 상세주소는 비우면 null
 */
export class StoreUpdateDto {
    @ApiProperty({description: '상호명'})
    @MaxLength(100, {message: '상호명은 100자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '상호명을 입력해주세요.'})
    store_name: string;

    @ApiProperty({description: '대표자명'})
    @MaxLength(50, {message: '대표자명은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '대표자명을 입력해주세요.'})
    owner_name: string;

    @ApiProperty({description: '업체 연락처 (숫자만)'})
    @Matches(/^\d{8,11}$/, {message: '업체 연락처를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '업체 연락처를 입력해주세요.'})
    phone: string;

    @ApiProperty({description: '주소'})
    @MaxLength(255, {message: '주소는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '주소를 입력해주세요.'})
    address: string;

    @ApiProperty({description: '상세주소', required: false})
    @IsOptional()
    @MaxLength(255, {message: '상세주소는 255자 이내로 입력해주세요.'})
    address_detail?: string;

    @ApiProperty({description: '위도 (WGS84)'})
    @IsLatitude({message: '위도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '위도를 입력해주세요.'})
    latitude: number;

    @ApiProperty({description: '경도 (WGS84)'})
    @IsLongitude({message: '경도가 올바르지 않습니다.'})
    @IsNotEmpty({message: '경도를 입력해주세요.'})
    longitude: number;
}
```

```ts
// libs/contracts/src/store/dto/store-state.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 상태 변경 path param (총관리자)
 */
export class StoreStateParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 상태 변경 — 탈퇴(LEAVE)는 되돌릴 수 없고 그 업체 매니저 계정을 정지한다
 */
export class StoreStateDto {
    @ApiProperty({description: '바꿀 상태 (ACTIVE: 활성, SUSPEND: 영업중지, LEAVE: 탈퇴)', enum: ['ACTIVE', 'SUSPEND', 'LEAVE']})
    @IsIn(['ACTIVE', 'SUSPEND', 'LEAVE'], {message: '업체 상태가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 상태를 입력해주세요.'})
    store_state_id: string;
}
```

### Data Access — store repository

형제: manager.repository.ts — 오류 변환 · private getter. 조인으로 룩업 플래그를 읽는 `buildLoginManagerQuery`(t_state.is_login_allowed), QueryBuilder 갱신 `buildConsumeSmsVerificationAttemptQuery`.

```ts
// apps/admin-service/src/store/store.symbols.ts — new
/** store repository 포트 토큰 — 구현: StoreRepository */
export const STORE_REPOSITORY = Symbol('StoreRepositoryInterface');
```

```ts
// apps/admin-service/src/store/interfaces/store.repository.interface.ts — new
import type {FindOptionsWhere} from 'typeorm';
import type {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import type {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';

/** 업체 정보 파일 조회 행 — 파일 컬럼 + 용도의 비공개 여부 (QueryBuilder raw — t_store_file_purpose 조인) */
export interface StoreFileRow {
    store_file_id: string;
    store_file_purpose_id: string;
    store_application_id: string | null;
    store_id: string | null;
    file_key: string;
    file_name: string;
    content_type: string;
    sort_order: number;
    created_at: Date;
    is_private: number;
}

/**
 * store repository 포트 — 입점 신청 · 업체 · 업체 정보 파일과, store 어휘로 다루는 t_user(신청자 · 업체 총관리자 · 업체 매니저)를 다룬다.
 * WHERE 는 service · util 이 만들고(배열 = OR) repository 는 실행 + DB 오류 변환만 한다.
 * insert · update 의 엔티티는 호출자가 `new XEntity()` + 필드 할당으로 만든다(@BeforeInsert/@BeforeUpdate 트리거).
 */
export interface StoreRepositoryInterface {
    /** 입점 신청 단건 */
    findApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<StoreApplicationEntity | null>;
    /** 입점 신청 개수 — 목록 · 중복 확인 */
    countApplications(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[]): Promise<number>;
    /** 입점 신청 목록 — 신청일 최신순 */
    findApplicationList(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[], limit: number, offset: number): Promise<StoreApplicationEntity[]>;
    /** 입점 신청 등록 */
    insertApplication(entity: StoreApplicationEntity): Promise<void>;
    /** 입점 신청 수정 (승인 · 반려) */
    updateApplication(where: FindOptionsWhere<StoreApplicationEntity>, entity: StoreApplicationEntity): Promise<void>;
    /** 업체 정보 파일 용도 단건 (비공개 여부) */
    findStoreFilePurpose(store_file_purpose_id: string): Promise<StoreFilePurposeEntity | null>;
    /** 신청의 업체 정보 파일 — 용도 · 정렬 순서, 비공개 여부 포함 */
    findApplicationFileRows(store_application_id: string): Promise<StoreFileRow[]>;
    /** 업체의 업체 정보 파일 — 용도 · 정렬 순서, 비공개 여부 포함 */
    findStoreFileRows(store_id: string): Promise<StoreFileRow[]>;
    /** 업체 정보 파일 개수 — 용도별 한도 · 정렬 순서 · 승인 조건 */
    countStoreFiles(where: FindOptionsWhere<StoreFileEntity>): Promise<number>;
    /** 업체 정보 파일 단건 */
    findStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity | null>;
    /** 업체 정보 파일 등록 — 같은 키 → 400 */
    insertStoreFile(entity: StoreFileEntity): Promise<void>;
    /** 업체 정보 파일 삭제 */
    deleteStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<void>;
    /** 신청의 업체 정보 파일을 업체로 — 승인 때 store_id 를 채운다 */
    assignStoreFiles(store_application_id: string, store_id: string): Promise<void>;
    /** 업체 단건 */
    findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 업체 개수 — 목록 · 사업자번호 중복 확인 */
    countStores(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number>;
    /** 업체 목록 — 등록일 최신순 */
    findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]>;
    /** 업체 등록 — 사업자번호 UK → 400 */
    insertStore(entity: StoreEntity): Promise<void>;
    /** 업체 수정 (정보 · 상태 · 탈퇴 마스킹) */
    updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void>;
    /** 신청자 — t_user 이용자 그룹 */
    findApplicant(user_id: string): Promise<UserEntity | null>;
    /** 매니저 그룹 회원 수 — 업체 총관리자 아이디 중복 확인 */
    countManagers(where: FindOptionsWhere<UserEntity>): Promise<number>;
    /** 업체 총관리자 계정 등록 (t_user 매니저 그룹) — 아이디 · 휴대폰 번호 UK → 400 */
    insertHeadManager(entity: UserEntity): Promise<void>;
    /** 그 업체 매니저 그룹 회원 상태 변경 (업체 탈퇴 → 정지) */
    updateStoreManagers(store_id: string, state_id: string, block_comment: string | null): Promise<void>;
}
```

```ts
// apps/admin-service/src/store/repositories/store.repository.ts — new
import {BadRequestException, Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository, SelectQueryBuilder, UpdateQueryBuilder} from 'typeorm';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {isUniqueViolation} from '@app/database/typeorm-error.js';
import type {StoreFileRow, StoreRepositoryInterface} from '../interfaces/store.repository.interface.js';
import {HEAD_MANAGER_PHONE_TAKEN_MESSAGE, STORE_BUSINESS_NUMBER_TAKEN_MESSAGE} from '../store.constants.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * store repository (아웃바운드 어댑터) — t_store_application · t_store · t_store_file · t_store_file_purpose 와
 * 공유 DB 의 t_user(신청자 · 업체 총관리자 · 업체 매니저)를 직접 다룬다. `txHost.tx` 는 `@Transactional()` 범위 안에서는 트랜잭션 EntityManager 다.
 */
@Injectable()
export class StoreRepository implements StoreRepositoryInterface {
    /**
     * @param txHost 트랜잭션 전파용 EntityManager 홀더
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_store_application repository (현재 트랜잭션 기준) */
    private get applications(): Repository<StoreApplicationEntity> {
        return this.txHost.tx.getRepository(StoreApplicationEntity);
    }

    /** t_store_file_purpose repository (현재 트랜잭션 기준) */
    private get storeFilePurposes(): Repository<StoreFilePurposeEntity> {
        return this.txHost.tx.getRepository(StoreFilePurposeEntity);
    }

    /** t_store_file repository (현재 트랜잭션 기준) */
    private get storeFiles(): Repository<StoreFileEntity> {
        return this.txHost.tx.getRepository(StoreFileEntity);
    }

    /** t_store repository (현재 트랜잭션 기준) */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /** t_user repository (현재 트랜잭션 기준) */
    private get users(): Repository<UserEntity> {
        return this.txHost.tx.getRepository(UserEntity);
    }

    /**
     * 입점 신청 단건
     *
     * @param where 조회 조건
     * @returns 신청 또는 null
     */
    async findApplication(where: FindOptionsWhere<StoreApplicationEntity>): Promise<StoreApplicationEntity | null> {
        try {
            return await this.applications.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 개수
     *
     * @param where 조회 조건 (배열 = OR)
     * @returns 개수
     */
    async countApplications(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[]): Promise<number> {
        try {
            return await this.applications.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 목록
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 신청 목록 (신청일 최신순)
     */
    async findApplicationList(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[], limit: number, offset: number): Promise<StoreApplicationEntity[]> {
        try {
            return await this.buildApplicationListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 목록 쿼리 — 매핑 민감(관계 필드 where · ILike · 배열 OR)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildApplicationListQuery(where: FindOptionsWhere<StoreApplicationEntity> | FindOptionsWhere<StoreApplicationEntity>[], limit: number, offset: number): SelectQueryBuilder<StoreApplicationEntity> {
        return this.applications.createQueryBuilder('a').setFindOptions({where, order: {created_at: 'DESC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 입점 신청 등록
     *
     * @param entity new StoreApplicationEntity() + 할당
     */
    async insertApplication(entity: StoreApplicationEntity): Promise<void> {
        try {
            await this.applications.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 입점 신청 수정 — 승인 · 반려
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateApplication(where: FindOptionsWhere<StoreApplicationEntity>, entity: StoreApplicationEntity): Promise<void> {
        try {
            await this.applications.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 용도 단건
     *
     * @param store_file_purpose_id 용도 ID
     * @returns 용도(비공개 여부 포함) 또는 null
     */
    async findStoreFilePurpose(store_file_purpose_id: string): Promise<StoreFilePurposeEntity | null> {
        try {
            return await this.storeFilePurposes.findOne({where: {store_file_purpose_id}});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 신청의 업체 정보 파일
     *
     * @param store_application_id 입점 신청 ID
     * @returns 파일 행 (용도 · 정렬 순서, 비공개 여부 포함)
     */
    async findApplicationFileRows(store_application_id: string): Promise<StoreFileRow[]> {
        try {
            return await this.buildStoreFileRowsQuery('store_application_id', store_application_id).getRawMany<StoreFileRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체의 업체 정보 파일
     *
     * @param store_id 업체 ID
     * @returns 파일 행 (용도 · 정렬 순서, 비공개 여부 포함)
     */
    async findStoreFileRows(store_id: string): Promise<StoreFileRow[]> {
        try {
            return await this.buildStoreFileRowsQuery('store_id', store_id).getRawMany<StoreFileRow>();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 조회 쿼리 — 매핑 민감(용도 조인 · raw select)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param column 기준 컬럼 (신청 · 업체)
     * @param id 신청 ID 또는 업체 ID
     * @returns 쿼리 빌더
     */
    buildStoreFileRowsQuery(column: 'store_application_id' | 'store_id', id: string): SelectQueryBuilder<StoreFileEntity> {
        return this.storeFiles
            .createQueryBuilder('f')
            .select('f.store_file_id', 'store_file_id')
            .addSelect('f.store_file_purpose_id', 'store_file_purpose_id')
            .addSelect('f.store_application_id', 'store_application_id')
            .addSelect('f.store_id', 'store_id')
            .addSelect('f.file_key', 'file_key')
            .addSelect('f.file_name', 'file_name')
            .addSelect('f.content_type', 'content_type')
            .addSelect('f.sort_order', 'sort_order')
            .addSelect('f.created_at', 'created_at')
            .addSelect('p.is_private', 'is_private')
            .innerJoin(StoreFilePurposeEntity, 'p', 'p.store_file_purpose_id = f.store_file_purpose_id')
            .where(`f.${column} = :id`, {id})
            .orderBy('f.store_file_purpose_id', 'ASC')
            .addOrderBy('f.sort_order', 'ASC')
            .addOrderBy('f.created_at', 'ASC');
    }

    /**
     * 업체 정보 파일 개수
     *
     * @param where 조회 조건
     * @returns 개수
     */
    async countStoreFiles(where: FindOptionsWhere<StoreFileEntity>): Promise<number> {
        try {
            return await this.storeFiles.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 단건
     *
     * @param where 조회 조건
     * @returns 파일 또는 null
     */
    async findStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<StoreFileEntity | null> {
        try {
            return await this.storeFiles.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 등록 — 같은 저장 키는 400
     *
     * @param entity new StoreFileEntity() + 할당
     */
    async insertStoreFile(entity: StoreFileEntity): Promise<void> {
        try {
            await this.storeFiles.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_StoreFile_FileKey')) {
                throw new BadRequestException({message: '이미 등록된 파일입니다.'});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 업체 정보 파일 삭제
     *
     * @param where 삭제 조건
     */
    async deleteStoreFile(where: FindOptionsWhere<StoreFileEntity>): Promise<void> {
        try {
            await this.storeFiles.delete(where);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 신청의 업체 정보 파일을 업체로 — 승인 때 store_id 를 채운다(파일은 옮기지 않는다)
     *
     * @param store_application_id 입점 신청 ID
     * @param store_id 등록한 업체 ID
     */
    async assignStoreFiles(store_application_id: string, store_id: string): Promise<void> {
        try {
            await this.buildAssignStoreFilesQuery(store_application_id, store_id).execute();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 정보 파일 업체 지정 쿼리 — 매핑 민감(QueryBuilder 갱신 · 관계 컬럼)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_application_id 입점 신청 ID
     * @param store_id 등록한 업체 ID
     * @returns 쿼리 빌더
     */
    buildAssignStoreFilesQuery(store_application_id: string, store_id: string): UpdateQueryBuilder<StoreFileEntity> {
        return this.storeFiles.createQueryBuilder().update(StoreFileEntity).set({store_id}).where('store_application_id = :store_application_id', {store_application_id});
    }

    /**
     * 업체 단건
     *
     * @param where 조회 조건
     * @returns 업체 또는 null
     */
    async findStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 개수
     *
     * @param where 조회 조건 (배열 = OR)
     * @returns 개수
     */
    async countStores(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[]): Promise<number> {
        try {
            return await this.stores.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 목록
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 업체 목록 (등록일 최신순)
     */
    async findStoreList(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): Promise<StoreEntity[]> {
        try {
            return await this.buildStoreListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 목록 쿼리 — 매핑 민감(관계 필드 where · ILike · 배열 OR)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildStoreListQuery(where: FindOptionsWhere<StoreEntity> | FindOptionsWhere<StoreEntity>[], limit: number, offset: number): SelectQueryBuilder<StoreEntity> {
        return this.stores.createQueryBuilder('s').setFindOptions({where, order: {created_at: 'DESC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 업체 등록 — 사업자등록번호가 이미 있으면 400
     *
     * @param entity new StoreEntity() + 할당
     */
    async insertStore(entity: StoreEntity): Promise<void> {
        try {
            await this.stores.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_Store_BusinessNumber')) {
                throw new BadRequestException({message: STORE_BUSINESS_NUMBER_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 업체 수정
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateStore(where: FindOptionsWhere<StoreEntity>, entity: StoreEntity): Promise<void> {
        try {
            await this.stores.update(where, entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 신청자 — t_user 이용자 그룹
     *
     * @param user_id 신청한 이용자 ID
     * @returns 회원 또는 null
     */
    async findApplicant(user_id: string): Promise<UserEntity | null> {
        try {
            return await this.users.findOne({where: {user_id, login_scope: LOGIN_SCOPE.USER}, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 매니저 그룹 회원 수
     *
     * @param where 조회 조건 (login_scope = MANAGER 를 함께 준다)
     * @returns 개수
     */
    async countManagers(where: FindOptionsWhere<UserEntity>): Promise<number> {
        try {
            return await this.users.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 총관리자 계정 등록 — 매니저 그룹 아이디 · 휴대폰 번호가 겹치면 400
     *
     * @param entity new UserEntity() + 할당
     */
    async insertHeadManager(entity: UserEntity): Promise<void> {
        try {
            await this.users.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_User_PhoneLoginScope')) {
                throw new BadRequestException({message: HEAD_MANAGER_PHONE_TAKEN_MESSAGE});
            } else if (isUniqueViolation(error, 'UK_User_LoginIdLoginScope')) {
                throw new BadRequestException({message: '업체 총관리자 아이디가 겹쳤습니다. 다시 승인해주세요.'});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 그 업체 매니저 그룹 회원 상태 변경
     *
     * @param store_id 업체 ID
     * @param state_id 바꿀 상태
     * @param block_comment 정지 사유
     */
    async updateStoreManagers(store_id: string, state_id: string, block_comment: string | null): Promise<void> {
        try {
            await this.buildUpdateStoreManagersQuery(store_id, state_id, block_comment).execute();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 매니저 상태 변경 쿼리 — 매핑 민감(QueryBuilder 갱신 · 관계 컬럼 where)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param store_id 업체 ID
     * @param state_id 바꿀 상태
     * @param block_comment 정지 사유
     * @returns 쿼리 빌더
     */
    buildUpdateStoreManagersQuery(store_id: string, state_id: string, block_comment: string | null): UpdateQueryBuilder<UserEntity> {
        return this.users
            .createQueryBuilder()
            .update(UserEntity)
            .set({state_id, block_comment, updated_at: () => 'CURRENT_TIMESTAMP'})
            .where('store_id = :store_id', {store_id})
            .andWhere('login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER});
    }
}
```

### Business Logic — constants · util · service

```ts
// apps/admin-service/src/store/store.constants.ts — new
/** 업체 상태 — t_store_state PK (seeder.targets.ts 의 STORE_STATE_SEED_DATA 와 같다) */
export const STORE_STATE = {ACTIVE: 'ACTIVE', SUSPEND: 'SUSPEND', LEAVE: 'LEAVE'} as const;

/** 입점 신청 상태 — t_store_application_state PK */
export const STORE_APPLICATION_STATE = {WAIT: 'WAIT', APPROVED: 'APPROVED', REJECTED: 'REJECTED'} as const;

/** 신청자가 볼 수 있는 신청 상태 — 승인되면 신청자는 그 신청을 볼 수 없다 */
export const STORE_APPLICATION_VISIBLE_STATES = ['WAIT', 'REJECTED'];

/** 업체 정보 파일 용도 — t_store_file_purpose PK (비공개 여부는 그 룩업의 is_private) */
export const STORE_FILE_PURPOSE = {BUSINESS_LICENSE: 'BUSINESS_LICENSE', STORE_IMAGE: 'STORE_IMAGE'} as const;

/** 용도별 파일 한도 — 신청 1건 기준 */
export const STORE_FILE_LIMIT: Record<string, number> = {BUSINESS_LICENSE: 1, STORE_IMAGE: 5};

/** 파일 MIME 타입 → 확장자 */
export const STORE_FILE_EXTENSION: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png'};

/** 업체 총관리자 아이디 생성 시도 횟수 — 겹치면 다시 만든다 */
export const HEAD_MANAGER_LOGIN_ID_ATTEMPTS = 5;

/** 업체 탈퇴로 정지한 매니저의 정지 사유 */
export const STORE_LEAVE_BLOCK_COMMENT = '업체 탈퇴로 이용이 정지되었습니다.';

/** 입점 신청 없음 — 남의 신청 · 승인된 내 신청 포함(존재를 드러내지 않는다) */
export const STORE_APPLICATION_NOT_FOUND_MESSAGE = '입점 신청을 찾을 수 없습니다.';

/** 대기 중이 아닌 신청을 바꾸려 할 때 */
export const STORE_APPLICATION_NOT_WAITING_MESSAGE = '대기 중인 입점 신청만 처리할 수 있습니다.';

/** 업체 없음 */
export const STORE_NOT_FOUND_MESSAGE = '업체를 찾을 수 없습니다.';

/** 사업자등록번호 중복 — 대기 신청 · 등록 업체 (service · repository) */
export const STORE_BUSINESS_NUMBER_TAKEN_MESSAGE = '이미 신청 · 등록된 사업자등록번호입니다.';

/** 업체 총관리자 휴대폰 번호가 다른 매니저 계정에 있을 때 (repository) */
export const HEAD_MANAGER_PHONE_TAKEN_MESSAGE = '이미 다른 매니저 계정에 등록된 휴대폰 번호입니다.';

/** 용도별 파일 한도 초과 */
export const STORE_FILE_LIMIT_MESSAGE = '올릴 수 있는 파일 수를 넘었습니다.';

/** 파일 용도가 룩업에 없을 때 */
export const STORE_FILE_PURPOSE_INVALID_MESSAGE = '파일 용도가 올바르지 않습니다.';

/** 탈퇴 업체를 바꾸려 할 때 */
export const STORE_LEAVE_LOCKED_MESSAGE = '탈퇴한 업체는 바꿀 수 없습니다.';
```

```ts
// apps/admin-service/src/store/store.util.ts — new
import {randomInt, randomUUID} from 'node:crypto';
import {ILike} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import type {StoreApplicationApplicantResultDto, StoreApplicationDetailFileResultDto, StoreApplicationDetailResultDto} from '@app/contracts/store/dto/store-application-detail.dto.js';
import type {StoreApplicationListDto, StoreApplicationListItemResultDto} from '@app/contracts/store/dto/store-application-list.dto.js';
import type {StoreDetailFileResultDto, StoreDetailResultDto} from '@app/contracts/store/dto/store-detail.dto.js';
import type {StoreListDto, StoreListItemResultDto} from '@app/contracts/store/dto/store-list.dto.js';
import type {StoreMyApplicationItemResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import type {StoreMyApplicationFileResultDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import type {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import type {StoreEntity} from '@app/database/entities/store/store.entity.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';
import type {StoreFileRow} from './interfaces/store.repository.interface.js';
import {STORE_FILE_EXTENSION} from './store.constants.js';

/**
 * 검색어를 부분 일치 패턴으로 — `%` · `_` · `\` 는 글자 그대로 찾도록 이스케이프한다(PostgreSQL 기본 이스케이프 문자 `\`).
 *
 * @param keyword 검색어
 * @returns ILike 패턴
 */
export function toContainsPattern(keyword: string): string {
    return `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/**
 * 입점 신청 목록 WHERE — 상태 + 검색어(상호명 · 사업자등록번호 OR).
 *
 * @param dto 목록 query
 * @returns WHERE 배열 (OR)
 */
export function buildApplicationListWhere(dto: StoreApplicationListDto): FindOptionsWhere<StoreApplicationEntity>[] {
    const base: FindOptionsWhere<StoreApplicationEntity> = dto.store_application_state_id ? {store_application_state_id: dto.store_application_state_id} : {};
    if (!dto.keyword) {
        return [base];
    }
    const pattern = toContainsPattern(dto.keyword);
    return [
        {...base, store_name: ILike(pattern)},
        {...base, business_number: ILike(pattern)},
    ];
}

/**
 * 업체 목록 WHERE — 상태 + 검색어(상호명 · 사업자등록번호 · 대표자명 OR).
 *
 * @param dto 목록 query
 * @returns WHERE 배열 (OR)
 */
export function buildStoreListWhere(dto: StoreListDto): FindOptionsWhere<StoreEntity>[] {
    const base: FindOptionsWhere<StoreEntity> = dto.store_state_id ? {store_state_id: dto.store_state_id} : {};
    if (!dto.keyword) {
        return [base];
    }
    const pattern = toContainsPattern(dto.keyword);
    return [
        {...base, store_name: ILike(pattern)},
        {...base, business_number: ILike(pattern)},
        {...base, owner_name: ILike(pattern)},
    ];
}

/**
 * 신청 때 올리는 업체 정보 파일의 저장 키 접두 — 비공개 용도는 private/(CDN 이 읽지 못한다), 공개 용도는 store/(CDN).
 *
 * @param is_private 용도의 비공개 여부 (t_store_file_purpose.is_private)
 * @param store_application_id 입점 신청 ID
 * @returns 접두 (끝에 / 없음)
 */
function applicationFilePrefix(is_private: number, store_application_id: string): string {
    return is_private === 1 ? `private/store-application/${store_application_id}` : `store/application/${store_application_id}`;
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
    return `${applicationFilePrefix(is_private, store_application_id)}/${randomUUID().replace(/-/g, '')}.${STORE_FILE_EXTENSION[content_type]}`;
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
    const prefix = `${applicationFilePrefix(is_private, store_application_id)}/`;
    const extension = STORE_FILE_EXTENSION[content_type];
    return Boolean(extension) && file_key.startsWith(prefix) && new RegExp(`^[a-f0-9]{32}\\.${extension}$`).test(file_key.slice(prefix.length));
}

/**
 * 업체 총관리자 아이디 후보 — `m` + 숫자 8자리.
 *
 * @returns 아이디 후보
 */
export function generateHeadManagerLoginId(): string {
    return `m${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
}

/**
 * 입점 승인 안내 SMS 본문 — 업체명 · 아이디 · 임시 비밀번호.
 *
 * @param store_name 상호명
 * @param login_id 업체 총관리자 아이디
 * @param password 임시 비밀번호
 * @returns 본문
 */
export function storeApprovedText(store_name: string, login_id: string, password: string): string {
    return `[roomless] ${store_name} 입점이 승인되었습니다. 아이디 ${login_id} 임시 비밀번호 ${password} — 로그인 후 비밀번호를 바꿔주세요.`;
}

/**
 * 내 입점 신청 목록 항목
 *
 * @param entity 입점 신청
 * @returns 목록 항목
 */
export function toMyApplicationItem(entity: StoreApplicationEntity): StoreMyApplicationItemResultDto {
    return {
        store_application_id: entity.store_application_id,
        store_application_state_id: entity.store_application_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        reject_comment: entity.reject_comment ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
    };
}

/**
 * 내 입점 신청의 업체 정보 파일 항목
 *
 * @param row 파일 행
 * @param file_url 열람 주소
 * @returns 파일 항목
 */
export function toMyApplicationFile(row: StoreFileRow, file_url: string): StoreMyApplicationFileResultDto {
    return {
        store_file_id: row.store_file_id,
        store_file_purpose_id: row.store_file_purpose_id,
        file_name: row.file_name,
        content_type: row.content_type,
        is_private: Number(row.is_private),
        file_url,
        created_at: new Date(row.created_at).toISOString(),
    };
}

/**
 * 내 입점 신청 상세
 *
 * @param entity 입점 신청
 * @param files 파일 항목
 * @returns 상세
 */
export function toMyApplicationDetail(entity: StoreApplicationEntity, files: StoreMyApplicationFileResultDto[]): StoreMyApplicationResultDto {
    return {
        store_application_id: entity.store_application_id,
        store_application_state_id: entity.store_application_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail ?? null,
        latitude: entity.latitude,
        longitude: entity.longitude,
        owner_phone: entity.owner_phone,
        application_comment: entity.application_comment ?? null,
        reject_comment: entity.reject_comment ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
        files,
    };
}

/**
 * 입점 신청 목록 항목 (총관리자)
 *
 * @param entity 입점 신청
 * @returns 목록 항목
 */
export function toApplicationListItem(entity: StoreApplicationEntity): StoreApplicationListItemResultDto {
    return {
        store_application_id: entity.store_application_id,
        user_id: entity.user_id,
        store_application_state_id: entity.store_application_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        store_id: entity.store_id ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
    };
}

/**
 * 입점 신청의 업체 정보 파일 항목 (총관리자)
 *
 * @param row 파일 행
 * @param file_url 열람 주소
 * @returns 파일 항목
 */
export function toApplicationDetailFile(row: StoreFileRow, file_url: string): StoreApplicationDetailFileResultDto {
    return {
        store_file_id: row.store_file_id,
        store_file_purpose_id: row.store_file_purpose_id,
        file_name: row.file_name,
        content_type: row.content_type,
        is_private: Number(row.is_private),
        file_url,
        created_at: new Date(row.created_at).toISOString(),
    };
}

/**
 * 신청자 (없으면 null)
 *
 * @param user t_user 이용자 또는 null
 * @returns 신청자 또는 null
 */
export function toApplicant(user: UserEntity | null): StoreApplicationApplicantResultDto | null {
    if (!user) {
        return null;
    }
    return {user_id: user.user_id, name: user.name, nickname: user.nickname, phone: user.phone ?? null};
}

/**
 * 입점 신청 상세 (총관리자)
 *
 * @param entity 입점 신청
 * @param applicant 신청자
 * @param files 파일 항목
 * @returns 상세
 */
export function toApplicationDetail(entity: StoreApplicationEntity, applicant: StoreApplicationApplicantResultDto | null, files: StoreApplicationDetailFileResultDto[]): StoreApplicationDetailResultDto {
    return {
        store_application_id: entity.store_application_id,
        user_id: entity.user_id,
        store_application_state_id: entity.store_application_state_id,
        store_id: entity.store_id ?? null,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        address_detail: entity.address_detail ?? null,
        latitude: entity.latitude,
        longitude: entity.longitude,
        owner_phone: entity.owner_phone,
        application_comment: entity.application_comment ?? null,
        reject_comment: entity.reject_comment ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
        applicant,
        files,
    };
}

/**
 * 업체 목록 항목
 *
 * @param entity 업체
 * @returns 목록 항목
 */
export function toStoreListItem(entity: StoreEntity): StoreListItemResultDto {
    return {
        store_id: entity.store_id,
        store_state_id: entity.store_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        owner_name: entity.owner_name,
        phone: entity.phone,
        address: entity.address,
        is_open: entity.is_open,
        created_at: entity.created_at.toISOString(),
    };
}

/**
 * 업체의 업체 정보 파일 항목 (총관리자)
 *
 * @param row 파일 행
 * @param file_url 열람 주소
 * @returns 파일 항목
 */
export function toStoreDetailFile(row: StoreFileRow, file_url: string): StoreDetailFileResultDto {
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
 * 업체 상세 (총관리자)
 *
 * @param entity 업체
 * @param files 파일 항목
 * @returns 상세
 */
export function toStoreDetail(entity: StoreEntity, files: StoreDetailFileResultDto[]): StoreDetailResultDto {
    return {
        store_id: entity.store_id,
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
        created_at: entity.created_at.toISOString(),
        updated_at: entity.updated_at.toISOString(),
        files,
    };
}
```

```ts
// apps/admin-service/src/store/store.service.ts — new
import {BadRequestException, Inject, Injectable, InternalServerErrorException, NotFoundException} from '@nestjs/common';
import {Transactional} from '@nestjs-cls/transactional';
import {In} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {generateTemporaryPassword} from '@app/account/utils/password.js';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {generateId} from '@app/common/utils/id.js';
import {Pagination} from '@app/common/utils/pagination.js';
import {createValidationError} from '@app/common/utils/validation.js';
import {AUTH_ID, LOGIN_SCOPE} from '@app/contracts/roles.js';
import type {StoreApplicationApproveResultDto} from '@app/contracts/store/dto/store-application-approve.dto.js';
import type {StoreApplicationDetailFileResultDto, StoreApplicationDetailResultDto} from '@app/contracts/store/dto/store-application-detail.dto.js';
import type {StoreApplicationFileUploadUrlDto, StoreApplicationFileUploadUrlResultDto} from '@app/contracts/store/dto/store-application-file-upload-url.dto.js';
import type {StoreApplicationFileDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import type {StoreApplicationListDto, StoreApplicationListResultDto} from '@app/contracts/store/dto/store-application-list.dto.js';
import type {StoreApplicationRejectDto} from '@app/contracts/store/dto/store-application-reject.dto.js';
import type {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import type {StoreDetailFileResultDto, StoreDetailResultDto} from '@app/contracts/store/dto/store-detail.dto.js';
import type {StoreListDto, StoreListResultDto} from '@app/contracts/store/dto/store-list.dto.js';
import type {StoreMyApplicationListDto, StoreMyApplicationListResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import type {StoreMyApplicationFileResultDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import type {StoreStateDto} from '@app/contracts/store/dto/store-state.dto.js';
import type {StoreUpdateDto} from '@app/contracts/store/dto/store-update.dto.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {SMS_SENDER, STORAGE_GATEWAY} from '@app/integration/integration.symbols.js';
import type {SmsSenderInterface, StorageGatewayInterface} from '@app/integration/interfaces/integration.interface.js';
import type {StoreRepositoryInterface} from './interfaces/store.repository.interface.js';
import {
    HEAD_MANAGER_LOGIN_ID_ATTEMPTS,
    STORE_APPLICATION_NOT_FOUND_MESSAGE,
    STORE_APPLICATION_NOT_WAITING_MESSAGE,
    STORE_APPLICATION_STATE,
    STORE_APPLICATION_VISIBLE_STATES,
    STORE_BUSINESS_NUMBER_TAKEN_MESSAGE,
    STORE_FILE_LIMIT,
    STORE_FILE_LIMIT_MESSAGE,
    STORE_FILE_PURPOSE,
    STORE_FILE_PURPOSE_INVALID_MESSAGE,
    STORE_LEAVE_BLOCK_COMMENT,
    STORE_LEAVE_LOCKED_MESSAGE,
    STORE_NOT_FOUND_MESSAGE,
    STORE_STATE,
} from './store.constants.js';
import {STORE_REPOSITORY} from './store.symbols.js';
import {
    buildApplicationFileKey,
    buildApplicationListWhere,
    buildStoreListWhere,
    generateHeadManagerLoginId,
    isApplicationFileKey,
    storeApprovedText,
    toApplicant,
    toApplicationDetail,
    toApplicationDetailFile,
    toApplicationListItem,
    toMyApplicationDetail,
    toMyApplicationFile,
    toMyApplicationItem,
    toStoreDetail,
    toStoreDetailFile,
    toStoreListItem,
} from './store.util.js';

/**
 * store 도메인 비즈니스 로직 (헥사고날의 안쪽) — 입점 신청(이용자) · 신청 관리 · 업체 관리(총관리자).
 * 내부 HTTP 컨트롤러와 RabbitMQ 핸들러가 같은 메서드를 호출한다. public 메서드 1개 = API 1개.
 * 로그인 그룹(이용자 · 관리자)은 게이트웨이 가드가 가른다 — 이 service 는 actor 의 user_id 만 받는다.
 * 업체 정보 파일의 열람 주소는 용도의 is_private 로 고른다 — 1 이면 서명된 열람 주소, 0 이면 CDN 공개 주소.
 */
@Injectable()
export class StoreService {
    /**
     * @param storeRepository store repository 포트
     * @param storageGateway 파일 저장소 포트 (Amazon S3 · CloudFront 공개 주소)
     * @param smsSender SMS 발송 포트 (Amazon SNS)
     */
    constructor(
        @Inject(STORE_REPOSITORY)
        private readonly storeRepository: StoreRepositoryInterface,
        @Inject(STORAGE_GATEWAY)
        private readonly storageGateway: StorageGatewayInterface,
        @Inject(SMS_SENDER)
        private readonly smsSender: SmsSenderInterface,
    ) {}

    /**
     * 입점 신청 — 업체 정보만 등록하고, 업체 정보 파일은 신청 뒤 따로 붙인다. (RabbitMQ: admin.store.application)
     * - 대기 중 신청이 있으면 400 (한 번에 1건)
     * - 같은 사업자번호의 대기 신청 · 등록 업체가 있으면 400 (validation_errors.business_number)
     *
     * @param user_id 신청한 이용자 ID
     * @param dto 업체 정보
     * @returns 입점 신청 ID
     */
    @Transactional()
    async apply(user_id: string, dto: StoreApplicationDto): Promise<StoreApplicationResultDto> {
        // 1. 대기 중 신청은 1건만
        const waiting = await this.storeRepository.countApplications({user_id, store_application_state_id: STORE_APPLICATION_STATE.WAIT});
        if (waiting > 0) {
            throw new BadRequestException({message: '이미 대기 중인 입점 신청이 있습니다.'});
        }

        // 2. 같은 사업자번호 — 대기 신청 · 등록 업체
        const sameApplications = await this.storeRepository.countApplications({business_number: dto.business_number, store_application_state_id: STORE_APPLICATION_STATE.WAIT});
        const sameStores = await this.storeRepository.countStores({business_number: dto.business_number});
        if (sameApplications + sameStores > 0) {
            throw new BadRequestException({message: STORE_BUSINESS_NUMBER_TAKEN_MESSAGE, validation_errors: createValidationError('business_number', STORE_BUSINESS_NUMBER_TAKEN_MESSAGE)});
        }

        // 3. 신청 등록 (대기)
        const application = new StoreApplicationEntity();
        application.store_application_id = generateId();
        application.user_id = user_id;
        application.store_application_state_id = STORE_APPLICATION_STATE.WAIT;
        application.store_id = null;
        application.store_name = dto.store_name;
        application.business_number = dto.business_number;
        application.owner_name = dto.owner_name;
        application.phone = dto.phone;
        application.address = dto.address;
        application.address_detail = dto.address_detail ?? null;
        application.latitude = Number(dto.latitude);
        application.longitude = Number(dto.longitude);
        application.owner_phone = dto.owner_phone;
        application.application_comment = dto.application_comment ?? null;
        application.reject_comment = null;
        application.reviewed_at = null;
        await this.storeRepository.insertApplication(application);
        return {store_application_id: application.store_application_id};
    }

    /**
     * 내 입점 신청 목록 — 대기 · 반려만(승인 신청은 빠진다). (내부 HTTP: GET /internal/v1/admin-service/store/application/mine)
     *
     * @param user_id 로그인 이용자 ID
     * @param dto 페이지
     * @returns 목록 · 페이지 정보
     */
    async getMyApplicationList(user_id: string, dto: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {
        const where: FindOptionsWhere<StoreApplicationEntity> = {user_id, store_application_state_id: In(STORE_APPLICATION_VISIBLE_STATES)};
        const total_count = await this.storeRepository.countApplications(where);
        const pagination = new Pagination({...dto, total_count});
        const applications = await this.storeRepository.findApplicationList(where, pagination.limit, pagination.offset);
        return {list: applications.map(toMyApplicationItem), pagination: pagination.getPagination()};
    }

    /**
     * 내 입점 신청 상세 — 대기 · 반려만, 업체 정보 파일 열람 주소 포함. 남의 신청 · 승인 신청은 404. (내부 HTTP: GET /internal/v1/admin-service/store/application/mine/:store_application_id)
     *
     * @param user_id 로그인 이용자 ID
     * @param store_application_id 입점 신청 ID
     * @returns 신청 상세
     */
    async getMyApplication(user_id: string, store_application_id: string): Promise<StoreMyApplicationResultDto> {
        const application = await this.storeRepository.findApplication({store_application_id, user_id, store_application_state_id: In(STORE_APPLICATION_VISIBLE_STATES)});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        const rows = await this.storeRepository.findApplicationFileRows(store_application_id);
        const files: StoreMyApplicationFileResultDto[] = [];
        for (const row of rows) {
            const file_url = Number(row.is_private) === 1 ? (await this.storageGateway.createDownloadUrl(row.file_key)).download_url : this.storageGateway.getPublicUrl(row.file_key);
            files.push(toMyApplicationFile(row, file_url));
        }
        return toMyApplicationDetail(application, files);
    }

    /**
     * 업체 정보 파일 업로드 주소 — 대기 중 내 신청 · 용도별 한도 안에서만. 키는 서버가 용도의 비공개 여부로 만든다. (내부 HTTP: POST /internal/v1/admin-service/store/application/mine/:store_application_id/file/upload-url)
     *
     * @param user_id 로그인 이용자 ID
     * @param store_application_id 입점 신청 ID
     * @param dto 용도 · MIME 타입
     * @returns 저장 키 · 업로드 주소 · 만료 시각
     */
    async createMyApplicationFileUploadUrl(user_id: string, store_application_id: string, dto: StoreApplicationFileUploadUrlDto): Promise<StoreApplicationFileUploadUrlResultDto> {
        // 1. 대기 중 내 신청
        const application = await this.storeRepository.findApplication({store_application_id, user_id, store_application_state_id: In(STORE_APPLICATION_VISIBLE_STATES)});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 2. 용도 (비공개 여부)
        const purpose = await this.storeRepository.findStoreFilePurpose(dto.store_file_purpose_id);
        if (!purpose) {
            throw new BadRequestException({message: STORE_FILE_PURPOSE_INVALID_MESSAGE});
        }

        // 3. 용도별 한도
        const count = await this.storeRepository.countStoreFiles({store_application_id, store_file_purpose_id: dto.store_file_purpose_id});
        if (count >= STORE_FILE_LIMIT[dto.store_file_purpose_id]) {
            throw new BadRequestException({message: STORE_FILE_LIMIT_MESSAGE});
        }

        // 4. 키 → 업로드 주소
        const file_key = buildApplicationFileKey(purpose.is_private, store_application_id, dto.content_type);
        const upload = await this.storageGateway.createUploadUrl({key: file_key, content_type: dto.content_type});
        return {file_key, upload_url: upload.upload_url, expires_at: upload.expires_at.toISOString()};
    }

    /**
     * 업체 정보 파일 등록 — 업로드 주소로 올린 파일의 키를 신청에 붙인다. (RabbitMQ: admin.store.application-file)
     * - 대기 중 내 신청만, 키 모양(그 신청 · 용도의 비공개 여부 · 형식) · 용도별 한도 · 실제 업로드(exists) 확인
     *
     * @param user_id 로그인 이용자 ID
     * @param store_application_id 입점 신청 ID
     * @param dto 용도 · 키 · 파일명 · MIME 타입
     * @returns 업체 정보 파일 ID
     */
    @Transactional()
    async addMyApplicationFile(user_id: string, store_application_id: string, dto: StoreApplicationFileDto): Promise<StoreApplicationFileResultDto> {
        // 1. 대기 중 내 신청
        const application = await this.storeRepository.findApplication({store_application_id, user_id, store_application_state_id: In(STORE_APPLICATION_VISIBLE_STATES)});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 2. 용도 (비공개 여부)
        const purpose = await this.storeRepository.findStoreFilePurpose(dto.store_file_purpose_id);
        if (!purpose) {
            throw new BadRequestException({message: STORE_FILE_PURPOSE_INVALID_MESSAGE});
        }

        // 3. 키 모양 — 그 신청 · 용도 · 형식으로 발급한 키만
        if (!isApplicationFileKey(dto.file_key, purpose.is_private, store_application_id, dto.content_type)) {
            throw new BadRequestException({message: '업로드 주소로 받은 저장 키가 아닙니다.', validation_errors: createValidationError('file_key', '업로드 주소로 받은 저장 키가 아닙니다.')});
        }

        // 4. 용도별 한도
        const count = await this.storeRepository.countStoreFiles({store_application_id, store_file_purpose_id: dto.store_file_purpose_id});
        if (count >= STORE_FILE_LIMIT[dto.store_file_purpose_id]) {
            throw new BadRequestException({message: STORE_FILE_LIMIT_MESSAGE});
        }

        // 5. 실제로 올라갔는지
        const uploaded = await this.storageGateway.exists(dto.file_key);
        if (!uploaded) {
            throw new BadRequestException({message: '파일이 아직 올라가지 않았습니다. 업로드 후 다시 시도해주세요.'});
        }

        // 6. 파일 등록 — 신청에 붙인다(업체는 승인 때). 정렬 순서 = 지금 개수
        const file = new StoreFileEntity();
        file.store_file_id = generateId();
        file.store_file_purpose_id = dto.store_file_purpose_id;
        file.store_application_id = store_application_id;
        file.store_id = null;
        file.file_key = dto.file_key;
        file.file_name = dto.file_name;
        file.content_type = dto.content_type;
        file.sort_order = count;
        await this.storeRepository.insertStoreFile(file);
        return {store_file_id: file.store_file_id};
    }

    /**
     * 업체 정보 파일 삭제 — 대기 중 내 신청의 파일만. 행을 지운 뒤 저장소 파일을 지운다(마지막). (RabbitMQ: admin.store.application-file-delete)
     *
     * @param user_id 로그인 이용자 ID
     * @param store_application_id 입점 신청 ID
     * @param store_file_id 업체 정보 파일 ID
     */
    @Transactional()
    async removeMyApplicationFile(user_id: string, store_application_id: string, store_file_id: string): Promise<void> {
        // 1. 대기 중 내 신청
        const application = await this.storeRepository.findApplication({store_application_id, user_id, store_application_state_id: In(STORE_APPLICATION_VISIBLE_STATES)});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 2. 그 신청의 파일
        const file = await this.storeRepository.findStoreFile({store_file_id, store_application_id});
        if (!file) {
            throw new NotFoundException({message: '파일을 찾을 수 없습니다.'});
        }

        // 3. 행 삭제 → 저장소 파일 삭제(마지막)
        await this.storeRepository.deleteStoreFile({store_file_id});
        await this.storageGateway.remove(file.file_key);
    }

    /**
     * 입점 신청 목록 (총관리자) — 상태 · 검색어. (내부 HTTP: GET /internal/v1/admin-service/store/application)
     *
     * @param dto 페이지 · 상태 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getApplicationList(dto: StoreApplicationListDto): Promise<StoreApplicationListResultDto> {
        const where = buildApplicationListWhere(dto);
        const total_count = await this.storeRepository.countApplications(where);
        const pagination = new Pagination({...dto, total_count});
        const applications = await this.storeRepository.findApplicationList(where, pagination.limit, pagination.offset);
        return {list: applications.map(toApplicationListItem), pagination: pagination.getPagination()};
    }

    /**
     * 입점 신청 상세 (총관리자) — 신청자 · 업체 정보 파일 열람 주소 포함. (내부 HTTP: GET /internal/v1/admin-service/store/application/:store_application_id)
     *
     * @param store_application_id 입점 신청 ID
     * @returns 신청 상세
     */
    async getApplication(store_application_id: string): Promise<StoreApplicationDetailResultDto> {
        const application = await this.storeRepository.findApplication({store_application_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        const applicant = await this.storeRepository.findApplicant(application.user_id);
        const rows = await this.storeRepository.findApplicationFileRows(store_application_id);
        const files: StoreApplicationDetailFileResultDto[] = [];
        for (const row of rows) {
            const file_url = Number(row.is_private) === 1 ? (await this.storageGateway.createDownloadUrl(row.file_key)).download_url : this.storageGateway.getPublicUrl(row.file_key);
            files.push(toApplicationDetailFile(row, file_url));
        }
        return toApplicationDetail(application, toApplicant(applicant), files);
    }

    /**
     * 입점 승인 (총관리자) — 업체 등록(활성 · 영업준비) + 신청의 업체 정보 파일을 업체로 + 업체 총관리자(= 대표자) 계정 + 아이디 · 임시 비밀번호 SMS(대표자 번호, 마지막). (RabbitMQ: admin.store.application-approve)
     * - 대기 중 신청만, 사업자등록증 1장 필수, 신청자 계정이 있어야 한다(성별 · 생년월일 복사)
     * - 사업자번호 · 휴대폰 번호 UK 충돌은 repository 가 400 — 트랜잭션 전체가 롤백된다
     *
     * @param store_application_id 입점 신청 ID
     * @returns 등록한 업체 ID · 업체 총관리자 아이디
     */
    @Transactional()
    async approveApplication(store_application_id: string): Promise<StoreApplicationApproveResultDto> {
        // 1. 대기 중 신청
        const application = await this.storeRepository.findApplication({store_application_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }

        // 2. 사업자등록증 1장 필수
        const licenses = await this.storeRepository.countStoreFiles({store_application_id, store_file_purpose_id: STORE_FILE_PURPOSE.BUSINESS_LICENSE});
        if (licenses === 0) {
            throw new BadRequestException({message: '사업자등록증 사진이 없어 승인할 수 없습니다.'});
        }

        // 3. 신청자 (성별 · 생년월일 복사)
        const applicant = await this.storeRepository.findApplicant(application.user_id);
        if (!applicant) {
            throw new BadRequestException({message: '신청자 정보를 찾을 수 없어 승인할 수 없습니다.'});
        }

        // 4. 업체 등록 — 활성 + 영업준비(is_open = 0)
        const store_id = generateId();
        const store = new StoreEntity();
        store.store_id = store_id;
        store.store_state_id = STORE_STATE.ACTIVE;
        store.store_name = application.store_name;
        store.business_number = application.business_number;
        store.owner_name = application.owner_name;
        store.phone = application.phone;
        store.address = application.address;
        store.address_detail = application.address_detail ?? null;
        store.latitude = application.latitude;
        store.longitude = application.longitude;
        store.introduction = null;
        store.store_detail = {};
        store.is_always_open = 0;
        store.is_open = 0;
        store.maintenance_minutes = 0;
        store.is_deleted = 0;
        store.delete_backup = null;
        await this.storeRepository.insertStore(store);

        // 5. 신청의 업체 정보 파일을 업체로 (같은 행에 store_id — 파일을 옮기지 않는다)
        await this.storeRepository.assignStoreFiles(store_application_id, store_id);

        // 6. 업체 총관리자 아이디 — 매니저 그룹에서 겹치면 다시
        let login_id: string | null = null;
        for (let attempt = 0; attempt < HEAD_MANAGER_LOGIN_ID_ATTEMPTS && !login_id; attempt++) {
            const candidate = generateHeadManagerLoginId();
            if ((await this.storeRepository.countManagers({login_id: candidate, login_scope: LOGIN_SCOPE.MANAGER})) === 0) {
                login_id = candidate;
            }
        }
        if (!login_id) {
            throw new InternalServerErrorException({message: '업체 총관리자 아이디를 만들지 못했습니다. 다시 시도해주세요.'});
        }

        // 7. 업체 총관리자 계정(= 대표자) — 이름 · 닉네임 대표자명, 휴대폰 대표자 번호, 임시 비밀번호 · 첫 로그인 때 변경
        const temporaryPassword = generateTemporaryPassword();
        const manager = new UserEntity();
        manager.user_id = generateId();
        manager.user_search_code = generateId();
        manager.auth_id = AUTH_ID.HEAD_MANAGER;
        manager.login_scope = LOGIN_SCOPE.MANAGER;
        manager.state_id = 'ACTIVE';
        manager.sns_id = null;
        manager.sns_user_id = null;
        manager.store_id = store_id;
        manager.login_id = login_id;
        manager.login_pw = await getBcrypt(temporaryPassword);
        manager.name = application.owner_name;
        manager.gender = applicant.gender;
        manager.birth = applicant.birth;
        manager.phone = application.owner_phone;
        manager.phone_verified_at = null;
        manager.nickname = application.owner_name;
        manager.device_os = null;
        manager.device_token = null;
        manager.is_password_change_required = 1;
        manager.block_comment = null;
        manager.leave_comment = null;
        manager.leave_reserved_at = null;
        manager.leave_previous_state_id = null;
        manager.leave_backup = null;
        await this.storeRepository.insertHeadManager(manager);

        // 8. 신청 승인
        const approved = new StoreApplicationEntity();
        approved.store_application_state_id = STORE_APPLICATION_STATE.APPROVED;
        approved.store_id = store_id;
        approved.reviewed_at = new Date();
        await this.storeRepository.updateApplication({store_application_id}, approved);

        // 9. 안내 SMS (마지막 — 실패 503 이면 위 쓰기가 모두 롤백되고 재시도된다)
        await this.smsSender.send({to: application.owner_phone, text: storeApprovedText(application.store_name, login_id, temporaryPassword)});
        return {store_id, login_id};
    }

    /**
     * 입점 반려 (총관리자) — 대기 중 신청만, 사유를 남긴다. 업체 정보 파일은 남긴다(신청자가 사유와 함께 본다). (RabbitMQ: admin.store.application-reject)
     *
     * @param store_application_id 입점 신청 ID
     * @param dto 반려 사유
     */
    @Transactional()
    async rejectApplication(store_application_id: string, dto: StoreApplicationRejectDto): Promise<void> {
        const application = await this.storeRepository.findApplication({store_application_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        if (application.store_application_state_id !== STORE_APPLICATION_STATE.WAIT) {
            throw new BadRequestException({message: STORE_APPLICATION_NOT_WAITING_MESSAGE});
        }
        const rejected = new StoreApplicationEntity();
        rejected.store_application_state_id = STORE_APPLICATION_STATE.REJECTED;
        rejected.reject_comment = dto.reject_comment;
        rejected.reviewed_at = new Date();
        await this.storeRepository.updateApplication({store_application_id}, rejected);
    }

    /**
     * 업체 목록 (총관리자) — 상태 · 검색어. (내부 HTTP: GET /internal/v1/admin-service/store)
     *
     * @param dto 페이지 · 상태 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getStoreList(dto: StoreListDto): Promise<StoreListResultDto> {
        const where = buildStoreListWhere(dto);
        const total_count = await this.storeRepository.countStores(where);
        const pagination = new Pagination({...dto, total_count});
        const stores = await this.storeRepository.findStoreList(where, pagination.limit, pagination.offset);
        return {list: stores.map(toStoreListItem), pagination: pagination.getPagination()};
    }

    /**
     * 업체 상세 (총관리자) — 업체 정보 파일 열람 주소 포함. (내부 HTTP: GET /internal/v1/admin-service/store/:store_id)
     *
     * @param store_id 업체 ID
     * @returns 업체 상세
     */
    async getStore(store_id: string): Promise<StoreDetailResultDto> {
        const store = await this.storeRepository.findStore({store_id});
        if (!store) {
            throw new NotFoundException({message: STORE_NOT_FOUND_MESSAGE});
        }
        const rows = await this.storeRepository.findStoreFileRows(store_id);
        const files: StoreDetailFileResultDto[] = [];
        for (const row of rows) {
            const file_url = Number(row.is_private) === 1 ? (await this.storageGateway.createDownloadUrl(row.file_key)).download_url : this.storageGateway.getPublicUrl(row.file_key);
            files.push(toStoreDetailFile(row, file_url));
        }
        return toStoreDetail(store, files);
    }

    /**
     * 업체 정보 수정 (총관리자) — 사업자번호는 바꾸지 않는다. 탈퇴 업체는 400. (RabbitMQ: admin.store.update)
     *
     * @param store_id 업체 ID
     * @param dto 상호명 · 대표자명 · 연락처 · 주소 · 상세주소 · 위경도
     */
    @Transactional()
    async updateStore(store_id: string, dto: StoreUpdateDto): Promise<void> {
        const store = await this.storeRepository.findStore({store_id});
        if (!store) {
            throw new NotFoundException({message: STORE_NOT_FOUND_MESSAGE});
        }
        if (store.store_state_id === STORE_STATE.LEAVE) {
            throw new BadRequestException({message: STORE_LEAVE_LOCKED_MESSAGE});
        }
        const storeEntity = new StoreEntity();
        storeEntity.store_name = dto.store_name;
        storeEntity.owner_name = dto.owner_name;
        storeEntity.phone = dto.phone;
        storeEntity.address = dto.address;
        storeEntity.address_detail = dto.address_detail ?? null;
        storeEntity.latitude = Number(dto.latitude);
        storeEntity.longitude = Number(dto.longitude);
        await this.storeRepository.updateStore({store_id}, storeEntity);
    }

    /**
     * 업체 상태 변경 (총관리자) — 활성 · 영업중지 · 탈퇴. 같은 상태 · 탈퇴 업체는 400. (RabbitMQ: admin.store.state)
     * 탈퇴로 바꾸면 그 업체 매니저 계정을 정지(BLOCK)하고, 사업자번호를 DELETE_<store_id> 로 마스킹(원래 값은 delete_backup)해 같은 번호로 다시 입점 신청할 수 있게 한다.
     * 영업중지는 매니저 계정을 그대로 둔다.
     *
     * @param store_id 업체 ID
     * @param dto 바꿀 상태
     */
    @Transactional()
    async changeStoreState(store_id: string, dto: StoreStateDto): Promise<void> {
        // 1. 업체 · 바꿀 수 있는 상태인지
        const store = await this.storeRepository.findStore({store_id});
        if (!store) {
            throw new NotFoundException({message: STORE_NOT_FOUND_MESSAGE});
        }
        if (store.store_state_id === STORE_STATE.LEAVE) {
            throw new BadRequestException({message: STORE_LEAVE_LOCKED_MESSAGE});
        }
        if (store.store_state_id === dto.store_state_id) {
            throw new BadRequestException({message: '이미 같은 상태입니다.'});
        }

        // 2. 탈퇴 — 매니저 정지 · 사업자번호 마스킹
        const storeEntity = new StoreEntity();
        storeEntity.store_state_id = dto.store_state_id;
        if (dto.store_state_id === STORE_STATE.LEAVE) {
            await this.storeRepository.updateStoreManagers(store_id, 'BLOCK', STORE_LEAVE_BLOCK_COMMENT);
            storeEntity.business_number = `DELETE_${store_id}`;
            storeEntity.delete_backup = JSON.stringify({business_number: store.business_number});
        }

        // 3. 업체 상태
        await this.storeRepository.updateStore({store_id}, storeEntity);
    }
}
```

### Entry Point — admin-service controllers · module

```ts
// apps/admin-service/src/store/controllers/store.controller.ts — new
import {Body, Controller, Get, HttpCode, Param, Post, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {StoreApplicationDetailParamDto, StoreApplicationDetailResultDto} from '@app/contracts/store/dto/store-application-detail.dto.js';
import {StoreApplicationFileUploadUrlDto, StoreApplicationFileUploadUrlParamDto, StoreApplicationFileUploadUrlResultDto} from '@app/contracts/store/dto/store-application-file-upload-url.dto.js';
import {StoreApplicationListDto, StoreApplicationListResultDto} from '@app/contracts/store/dto/store-application-list.dto.js';
import {StoreDetailParamDto, StoreDetailResultDto} from '@app/contracts/store/dto/store-detail.dto.js';
import {StoreListDto, StoreListResultDto} from '@app/contracts/store/dto/store-list.dto.js';
import {StoreMyApplicationListDto, StoreMyApplicationListResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import {StoreMyApplicationParamDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import {StoreService} from '../store.service.js';

/**
 * store 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로만 받는다(외부 비공개, Swagger 없음).
 * `/application…` 라우트를 `/:store_id` 보다 먼저 선언한다(같은 단 수의 정적 경로가 먼저 맞아야 한다).
 */
@Controller('/internal/v1/admin-service/store')
export class StoreController {
    /**
     * @param storeService store service
     */
    constructor(private readonly storeService: StoreService) {}

    /**
     * 내 입점 신청 목록
     */
    @Get('/application/mine')
    @HttpCode(200)
    async getMyApplicationList(@InternalActor('user_id') user_id: string, @Query() query: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {
        const dto = new StoreMyApplicationListDto(query);
        return this.storeService.getMyApplicationList(user_id, dto);
    }

    /**
     * 내 입점 신청 상세
     */
    @Get('/application/mine/:store_application_id')
    @HttpCode(200)
    async getMyApplication(@InternalActor('user_id') user_id: string, @Param() param: StoreMyApplicationParamDto): Promise<StoreMyApplicationResultDto> {
        return this.storeService.getMyApplication(user_id, param.store_application_id);
    }

    /**
     * 업체 정보 파일 업로드 주소
     */
    @Post('/application/mine/:store_application_id/file/upload-url')
    @HttpCode(200)
    async createMyApplicationFileUploadUrl(@InternalActor('user_id') user_id: string, @Param() param: StoreApplicationFileUploadUrlParamDto, @Body() dto: StoreApplicationFileUploadUrlDto): Promise<StoreApplicationFileUploadUrlResultDto> {
        return this.storeService.createMyApplicationFileUploadUrl(user_id, param.store_application_id, dto);
    }

    /**
     * 입점 신청 목록 (총관리자)
     */
    @Get('/application')
    @HttpCode(200)
    async getApplicationList(@Query() query: StoreApplicationListDto): Promise<StoreApplicationListResultDto> {
        const dto = new StoreApplicationListDto(query);
        return this.storeService.getApplicationList(dto);
    }

    /**
     * 입점 신청 상세 (총관리자)
     */
    @Get('/application/:store_application_id')
    @HttpCode(200)
    async getApplication(@Param() param: StoreApplicationDetailParamDto): Promise<StoreApplicationDetailResultDto> {
        return this.storeService.getApplication(param.store_application_id);
    }

    /**
     * 업체 목록 (총관리자)
     */
    @Get('/')
    @HttpCode(200)
    async getStoreList(@Query() query: StoreListDto): Promise<StoreListResultDto> {
        const dto = new StoreListDto(query);
        return this.storeService.getStoreList(dto);
    }

    /**
     * 업체 상세 (총관리자)
     */
    @Get('/:store_id')
    @HttpCode(200)
    async getStore(@Param() param: StoreDetailParamDto): Promise<StoreDetailResultDto> {
        return this.storeService.getStore(param.store_id);
    }
}
```

```ts
// apps/admin-service/src/store/controllers/store.controller.queue.ts — new
import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {StoreApplicationApproveParamDto, StoreApplicationApproveResultDto} from '@app/contracts/store/dto/store-application-approve.dto.js';
import type {StoreApplicationFileDeleteParamDto} from '@app/contracts/store/dto/store-application-file-delete.dto.js';
import type {StoreApplicationFileDto, StoreApplicationFileParamDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import type {StoreApplicationRejectDto, StoreApplicationRejectParamDto} from '@app/contracts/store/dto/store-application-reject.dto.js';
import type {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import type {StoreStateDto, StoreStateParamDto} from '@app/contracts/store/dto/store-state.dto.js';
import type {StoreUpdateDto, StoreUpdateParamDto} from '@app/contracts/store/dto/store-update.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {StoreService} from '../store.service.js';

/**
 * store 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.store.*` 명령을 `@OnCommand` 로 받는다.
 * 봉투에서 입력을 꺼내 service 로 위임만 한다(로직 0). path param 은 게이트웨이가 payload 에 합쳐 보낸다.
 * 신청자 명령은 actor 의 user_id 가 필요해 requireActor 로 꺼내고, 총관리자 명령은 게이트웨이 관리자 가드를 지난 요청이라 actor 를 쓰지 않는다.
 */
@Injectable()
export class StoreQueueController {
    /**
     * @param storeService store service
     */
    constructor(private readonly storeService: StoreService) {}

    /**
     * 입점 신청 — 로그인 이용자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 입점 신청 ID
     */
    @OnCommand(STORE_COMMAND.APPLICATION)
    async apply(command: MessageEnvelope<StoreApplicationDto>): Promise<StoreApplicationResultDto> {
        return this.storeService.apply(requireActor(command).user_id, command.payload);
    }

    /**
     * 업체 정보 파일 등록 — 로그인 이용자 · 대기 중 내 신청
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     * @returns 업체 정보 파일 ID
     */
    @OnCommand(STORE_COMMAND.APPLICATION_FILE)
    async addMyApplicationFile(command: MessageEnvelope<StoreApplicationFileParamDto & StoreApplicationFileDto>): Promise<StoreApplicationFileResultDto> {
        return this.storeService.addMyApplicationFile(requireActor(command).user_id, command.payload.store_application_id, command.payload);
    }

    /**
     * 업체 정보 파일 삭제 — 로그인 이용자 · 대기 중 내 신청
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(STORE_COMMAND.APPLICATION_FILE_DELETE)
    async removeMyApplicationFile(command: MessageEnvelope<StoreApplicationFileDeleteParamDto>): Promise<void> {
        return this.storeService.removeMyApplicationFile(requireActor(command).user_id, command.payload.store_application_id, command.payload.store_file_id);
    }

    /**
     * 입점 승인 — 총관리자
     *
     * @param command 명령 봉투 (payload = path param)
     * @returns 업체 ID · 업체 총관리자 아이디
     */
    @OnCommand(STORE_COMMAND.APPLICATION_APPROVE)
    async approveApplication(command: MessageEnvelope<StoreApplicationApproveParamDto>): Promise<StoreApplicationApproveResultDto> {
        return this.storeService.approveApplication(command.payload.store_application_id);
    }

    /**
     * 입점 반려 — 총관리자
     *
     * @param command 명령 봉투 (payload = path param + 본문)
     */
    @OnCommand(STORE_COMMAND.APPLICATION_REJECT)
    async rejectApplication(command: MessageEnvelope<StoreApplicationRejectParamDto & StoreApplicationRejectDto>): Promise<void> {
        return this.storeService.rejectApplication(command.payload.store_application_id, command.payload);
    }

    /**
     * 업체 정보 수정 — 총관리자
     *
     * @param command 명령 봉투 (payload = path param + 본문)
     */
    @OnCommand(STORE_COMMAND.UPDATE)
    async updateStore(command: MessageEnvelope<StoreUpdateParamDto & StoreUpdateDto>): Promise<void> {
        return this.storeService.updateStore(command.payload.store_id, command.payload);
    }

    /**
     * 업체 상태 변경 — 총관리자
     *
     * @param command 명령 봉투 (payload = path param + 본문)
     */
    @OnCommand(STORE_COMMAND.STATE)
    async changeStoreState(command: MessageEnvelope<StoreStateParamDto & StoreStateDto>): Promise<void> {
        return this.storeService.changeStoreState(command.payload.store_id, command.payload);
    }
}
```

```ts
// apps/admin-service/src/store/store.module.ts — new
import {Module} from '@nestjs/common';
import {StoreController} from './controllers/store.controller.js';
import {StoreQueueController} from './controllers/store.controller.queue.js';
import {StoreRepository} from './repositories/store.repository.js';
import {STORE_REPOSITORY} from './store.symbols.js';
import {StoreService} from './store.service.js';

/**
 * store 도메인(업체 · 입점 신청 · 업체 정보 파일) — 인바운드 어댑터 2종이 같은 service 를 부른다.
 * - StoreController(controllers/store.controller.ts): 내부 HTTP (게이트웨이 동기 경로) — controllers 에 등록
 * - StoreQueueController(controllers/store.controller.queue.ts): RabbitMQ (게이트웨이 큐 경로) — `@OnCommand` provider 라 providers 에 등록
 * 파일 저장소(STORAGE_GATEWAY) · SMS(SMS_SENDER) 포트는 루트 모듈의 전역 모듈이 준다.
 */
@Module({
    controllers: [StoreController],
    providers: [StoreService, StoreQueueController, {provide: STORE_REPOSITORY, useClass: StoreRepository}],
})
export class StoreModule {}
```

```ts
// apps/admin-service/src/admin-service.module.ts — modified
import {StorageModule} from '@app/integration/storage/storage.module.js';
import {StoreModule} from './store/store.module.js';
// 주석: "admin-service 루트 모듈 — 매니저 · 관리자 · store(업체 · 입점 신청) 도메인." / "- StorageModule: 파일 저장소 포트(STORAGE_GATEWAY, Amazon S3) — 업체 정보 파일"
    imports: [DatabaseModule, MessagingModule.forService({…}), SmsModule, StorageModule, ManagerModule, AdminModule, StoreModule],
```

### Entry Point — 게이트웨이 라우트

```ts
// apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.ts — new
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
import {StoreApplicationDetailParamDto, StoreApplicationDetailResultDto} from '@app/contracts/store/dto/store-application-detail.dto.js';
import {StoreApplicationFileUploadUrlDto, StoreApplicationFileUploadUrlParamDto, StoreApplicationFileUploadUrlResultDto} from '@app/contracts/store/dto/store-application-file-upload-url.dto.js';
import {StoreApplicationListDto, StoreApplicationListResultDto} from '@app/contracts/store/dto/store-application-list.dto.js';
import {StoreDetailParamDto, StoreDetailResultDto} from '@app/contracts/store/dto/store-detail.dto.js';
import {StoreListDto, StoreListResultDto} from '@app/contracts/store/dto/store-list.dto.js';
import {StoreMyApplicationListDto, StoreMyApplicationListResultDto} from '@app/contracts/store/dto/store-my-application-list.dto.js';
import {StoreMyApplicationParamDto, StoreMyApplicationResultDto} from '@app/contracts/store/dto/store-my-application.dto.js';
import {STORE_INTERNAL_PATH} from '@app/contracts/store/store.commands.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 업체 공개 API — 동기 경로(내부 HTTP → admin-service store 도메인). 조회 · 업로드 주소.
 * 신청자 라우트(/application/mine…)는 이용자 가드, 나머지는 관리자 가드. `/application…` 를 `/:store_id` 보다 먼저 선언한다.
 * 큐 경로(신청 · 파일 · 승인 · 반려 · 수정 · 상태)는 같은 경로 접두의 store.controller.queue.ts(StoreQueueController)에 둔다.
 */
@ApiTags('업체')
@Controller('/api/v1/admin-service/store')
export class StoreController {
    /**
     * @param internalHttp 동기 경로 — admin-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 내 입점 신청 목록 — 대기 · 반려만(승인 신청은 보이지 않는다)
     */
    @Get('/application/mine')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 입점 신청 목록'})
    @ApiOkResponse({type: StoreMyApplicationListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyApplicationList(@PassportActor() actor: Actor, @Query() query: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {
        const dto = new StoreMyApplicationListDto(query);
        return this.internalHttp.request<StoreMyApplicationListResultDto>('admin', 'GET', STORE_INTERNAL_PATH.MY_APPLICATION_LIST, {actor, query: dto});
    }

    /**
     * 내 입점 신청 상세 — 업체 정보 파일 열람 주소 포함, 승인 신청은 404
     */
    @Get('/application/mine/:store_application_id')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 입점 신청 상세'})
    @ApiOkResponse({type: StoreMyApplicationResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getMyApplication(@PassportActor() actor: Actor, @Param() param: StoreMyApplicationParamDto): Promise<StoreMyApplicationResultDto> {
        return this.internalHttp.request<StoreMyApplicationResultDto>('admin', 'GET', STORE_INTERNAL_PATH.myApplication(param.store_application_id), {actor});
    }

    /**
     * 업체 정보 파일 업로드 주소 — 받은 주소로 같은 Content-Type 헤더로 PUT 한 뒤 file_key 로 파일을 등록한다
     */
    @Post('/application/mine/:store_application_id/file/upload-url')
    @UseGuards(PassportJwtAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 파일 업로드 주소'})
    @ApiBody({type: StoreApplicationFileUploadUrlDto})
    @ApiOkResponse({type: StoreApplicationFileUploadUrlResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async createMyApplicationFileUploadUrl(@PassportActor() actor: Actor, @Param() param: StoreApplicationFileUploadUrlParamDto, @Body() dto: StoreApplicationFileUploadUrlDto): Promise<StoreApplicationFileUploadUrlResultDto> {
        return this.internalHttp.request<StoreApplicationFileUploadUrlResultDto>('admin', 'POST', STORE_INTERNAL_PATH.myApplicationFileUploadUrl(param.store_application_id), {actor, body: dto});
    }

    /**
     * 입점 신청 목록 (총관리자)
     */
    @Get('/application')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 신청 목록'})
    @ApiOkResponse({type: StoreApplicationListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getApplicationList(@PassportActor() actor: Actor, @Query() query: StoreApplicationListDto): Promise<StoreApplicationListResultDto> {
        const dto = new StoreApplicationListDto(query);
        return this.internalHttp.request<StoreApplicationListResultDto>('admin', 'GET', STORE_INTERNAL_PATH.APPLICATION_LIST, {actor, query: dto});
    }

    /**
     * 입점 신청 상세 (총관리자) — 신청자 · 업체 정보 파일 열람 주소 포함
     */
    @Get('/application/:store_application_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 신청 상세'})
    @ApiOkResponse({type: StoreApplicationDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getApplication(@PassportActor() actor: Actor, @Param() param: StoreApplicationDetailParamDto): Promise<StoreApplicationDetailResultDto> {
        return this.internalHttp.request<StoreApplicationDetailResultDto>('admin', 'GET', STORE_INTERNAL_PATH.application(param.store_application_id), {actor});
    }

    /**
     * 업체 목록 (총관리자)
     */
    @Get('/')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 목록'})
    @ApiOkResponse({type: StoreListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStoreList(@PassportActor() actor: Actor, @Query() query: StoreListDto): Promise<StoreListResultDto> {
        const dto = new StoreListDto(query);
        return this.internalHttp.request<StoreListResultDto>('admin', 'GET', STORE_INTERNAL_PATH.STORE_LIST, {actor, query: dto});
    }

    /**
     * 업체 상세 (총관리자) — 업체 정보 파일 열람 주소 포함
     */
    @Get('/:store_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 상세'})
    @ApiOkResponse({type: StoreDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStore(@PassportActor() actor: Actor, @Param() param: StoreDetailParamDto): Promise<StoreDetailResultDto> {
        return this.internalHttp.request<StoreDetailResultDto>('admin', 'GET', STORE_INTERNAL_PATH.store(param.store_id), {actor});
    }
}
```

```ts
// apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.queue.ts — new
import {Body, Controller, Delete, Ip, Param, Patch, Post, Res, UseGuards} from '@nestjs/common';
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
import {StoreApplicationApproveParamDto, StoreApplicationApproveResultDto} from '@app/contracts/store/dto/store-application-approve.dto.js';
import {StoreApplicationFileDeleteParamDto} from '@app/contracts/store/dto/store-application-file-delete.dto.js';
import {StoreApplicationFileDto, StoreApplicationFileParamDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import {StoreApplicationRejectDto, StoreApplicationRejectParamDto} from '@app/contracts/store/dto/store-application-reject.dto.js';
import {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import {StoreStateDto, StoreStateParamDto} from '@app/contracts/store/dto/store-state.dto.js';
import {StoreUpdateDto, StoreUpdateParamDto} from '@app/contracts/store/dto/store-update.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 업체 공개 API — 큐 경로(RabbitMQ `admin.store.*` → admin-service + 요청 단위 SSE).
 * 신청 · 업체 정보 파일 등록 · 삭제(이용자 가드), 승인 · 반려 · 업체 수정 · 상태 변경(관리자 가드). path param 은 payload 에 합쳐 보낸다.
 * 동기 경로(조회 · 업로드 주소)는 같은 경로 접두의 store.controller.ts(StoreController)에 둔다.
 */
@ApiTags('업체')
@Controller('/api/v1/admin-service/store')
export class StoreQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 입점 신청 — 업체 정보. done 의 data 는 입점 신청 ID(업체 정보 파일을 붙일 때 쓴다).
     */
    @Post('/application')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 신청'})
    @ApiBody({type: StoreApplicationDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreApplicationResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async apply(@PassportActor() actor: Actor, @Body() dto: StoreApplicationDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION, actor, payload: dto, client_ip: ip});
    }

    /**
     * 업체 정보 파일 등록 — 업로드 주소로 올린 파일의 키. done 의 data 는 업체 정보 파일 ID.
     */
    @Post('/application/mine/:store_application_id/file')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 파일 등록'})
    @ApiBody({type: StoreApplicationFileDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreApplicationFileResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyApplicationFile(@PassportActor() actor: Actor, @Param() param: StoreApplicationFileParamDto, @Body() dto: StoreApplicationFileDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_FILE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 정보 파일 삭제 — 대기 중 내 신청의 파일. done 의 data 는 null.
     */
    @Delete('/application/mine/:store_application_id/file/:store_file_id')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 파일 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async removeMyApplicationFile(@PassportActor() actor: Actor, @Param() param: StoreApplicationFileDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_FILE_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 입점 승인 (총관리자) — 업체 등록 + 업체 총관리자 계정 + 안내 SMS. done 의 data 는 업체 ID · 아이디.
     */
    @Patch('/application/:store_application_id/approve')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 승인'})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreApplicationApproveResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async approveApplication(@PassportActor() actor: Actor, @Param() param: StoreApplicationApproveParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_APPROVE, actor, payload: param, client_ip: ip});
    }

    /**
     * 입점 반려 (총관리자) — 사유 필수. done 의 data 는 null.
     */
    @Patch('/application/:store_application_id/reject')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 반려'})
    @ApiBody({type: StoreApplicationRejectDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async rejectApplication(@PassportActor() actor: Actor, @Param() param: StoreApplicationRejectParamDto, @Body() dto: StoreApplicationRejectDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_REJECT, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 정보 수정 (총관리자) — 사업자등록번호 제외. done 의 data 는 null.
     */
    @Patch('/:store_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 수정'})
    @ApiBody({type: StoreUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateStore(@PassportActor() actor: Actor, @Param() param: StoreUpdateParamDto, @Body() dto: StoreUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 상태 변경 (총관리자) — 활성 · 영업중지 · 탈퇴(되돌릴 수 없음 · 매니저 정지). done 의 data 는 null.
     */
    @Patch('/:store_id/state')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 상태 변경'})
    @ApiBody({type: StoreStateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeStoreState(@PassportActor() actor: Actor, @Param() param: StoreStateParamDto, @Body() dto: StoreStateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.STATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }
}
```

```ts
// apps/gateway/src/api/v1/admin-service/store/store.module.ts — new
import {Module} from '@nestjs/common';
import {StoreController} from './controllers/store.controller.js';
import {StoreQueueController} from './controllers/store.controller.queue.js';

/**
 * 게이트웨이 업체 라우트 — `/api/v1/admin-service/store`(이용자 가드: 입점 신청 · 내 신청, 관리자 가드: 신청 관리 · 업체 관리). 전달 수단(TransportModule)은 전역이다.
 * - StoreController(controllers/store.controller.ts): 동기 경로 — 조회 · 업로드 주소
 * - StoreQueueController(controllers/store.controller.queue.ts): 큐 경로 — 신청 · 파일 · 승인 · 반려 · 수정 · 상태
 */
@Module({controllers: [StoreController, StoreQueueController]})
export class StoreModule {}
```

```ts
// apps/gateway/src/gateway.module.ts — modified
import {StoreModule} from './api/v1/admin-service/store/store.module.js';
// 주석의 라우트 목록에 "· StoreModule(/api/v1/admin-service/store — 이용자 · 관리자 가드)"
@Module({imports: [MessagingModule.forGateway(), TransportModule, PassportJwtAuthModule, UserModule, ManagerModule, AdminModule, StoreModule]})
```

### 규약 문서 · README · 기타 문서

```md
<!-- AGENTS.md -->
- Architecture 트리 admin-service: `│   └── store/                # store 도메인(업체 · 입점 신청 · 업체 정보 파일): controllers/ → StoreService — 승인 때 업체 총관리자 계정 · 탈퇴 때 매니저 정지는 store repository 가 t_user 를 직접`
- Conventions 규격 상수: "… 내부 HTTP 경로(`USER_INTERNAL_PATH` · … · `STORE_INTERNAL_PATH`) — path param 이 있는 경로는 contracts 의 경로 함수(`STORE_INTERNAL_PATH.myApplication(id)`)로 만들고 게이트웨이는 이어 붙이지 않는다."
- Validation 사용 데코레이터: `@IsNotEmpty`/`@IsOptional`/`@IsIn`/`@Matches`/`@MaxLength`(+`@ValidateIf`) · 좌표 `@IsLatitude`/`@IsLongitude`
- Validation `@Query()` DTO: "(미적용 규약 — 첫 목록 API 에서 적용)" → "(적용 — store 목록 3종: StoreMyApplicationListDto · StoreApplicationListDto · StoreListDto)"
- Data Layer 엔티티: "룩업 엔티티는 구조 컬럼만" → "룩업 엔티티는 구조 컬럼 + 동작 플래그만(`t_state.is_login_allowed` · `t_store_file_purpose.is_private` — 값은 시드가 PK 로 한 번 넣으므로 바꿀 때는 마이그레이션)"
- Data Layer Pagination: "(미적용 규약 — 자산은 있음, 사용처 0)" → "(적용 — store.service.ts getMyApplicationList · getApplicationList · getStoreList)"
- Testing Data-Access Smoke 현재 적용 목록 + `store.repository.spec.ts` `buildApplicationListQuery` · `buildStoreListQuery` · `buildStoreFileRowsQuery` · `buildAssignStoreFilesQuery` · `buildUpdateStoreManagersQuery`
- Key Patterns 외부 연동: 파일 — "파일 테이블은 용도 룩업 FK(`store_file_purpose_id` → `t_store_file_purpose.is_private`)로 비공개 여부를 정한다 — 1 이면 `private/` 키 + `createDownloadUrl`(presigned GET, 10분), 0 이면 공개 키(`store/` · `room-group/`) + CDN(CloudFront) 공개 주소. 파일은 항상 새 키로(덮어쓰기 금지 — CDN 캐시를 무효화하지 않는다). 첫 사용처 `t_store_file`(업체 정보 파일 — 입점 신청 때 신청에 붙이고 승인 때 업체 지정)"
- Checklist 외부 연동 줄에 "파일 비공개 여부는 용도 룩업 `is_private` 로 서명 주소 · CDN 주소를 고른다, 같은 키 덮어쓰기 금지"
```

- `docs/conventions.md` 세 곳:
  - Validation 허용 데코레이터에 `@IsLatitude` · `@IsLongitude`(좌표 — 숫자 · 문자열 모두 받는다)를 더한다.
  - Query DTO 절을 "적용" 으로 바꾸고 근거(store-application-list.dto.ts · store.controller.ts)를 단다.
  - 규격 상수에 경로 함수를 더한다.
- `docs/data-layer.md` 네 곳:
  - 엔티티 트리 store 를 `store-state · store-application-state · store-file-purpose(룩업) · store · store-application · store-file · store-hour · store-break` 로 바꾼다(`store-image` 제거).
  - 룩업 항목에 동작 플래그(`is_login_allowed` · `is_private`)와 "시드는 없는 행만 넣는다 — 플래그 값을 바꿀 때는 마이그레이션" 을 적는다.
  - Pagination 절을 "적용" + 근거로 바꾸고, 검색어 이스케이프(`toContainsPattern`)를 적는다.
  - QueryBuilder 예에 `buildStoreFileRowsQuery`(용도 조인으로 플래그 읽기 — `buildLoginManagerQuery` 와 같은 모양)를 더한다.
- `docs/integration.md` — 저장소 포트 표에 `createDownloadUrl` · `STORAGE_DOWNLOAD_URL_TTL_SECONDS` 를 넣고 **파일 규칙**을 적는다(사용자 결정 2026-10-26).
  - 파일 테이블은 용도 룩업 FK 를 두고, 룩업의 `is_private` 가 키 접두(`private/` · 공개)와 열람 주소(`createDownloadUrl` · `getPublicUrl`)를 정한다.
  - 파일은 항상 새 키로 올리고 같은 키를 덮어쓰지 않는다.
  - 첫 사용처는 `t_store_file` 이다.
- `docs/guides/aws-setup.md` — **CloudFront 를 기본 구성으로** 바꾼다(지금 5단계 "선택" → 필수).
  - 퍼블릭 액세스 차단 4개를 모두 켠다. 버킷 공개 정책은 없앤다.
  - CloudFront 배포의 원본은 이 버킷(OAC)이다. 버킷 정책은 CloudFront 서비스 주체에게 공개 접두사만 `s3:GetObject` 를 준다.
    - Resource `arn:aws:s3:::roomless-<dev|prod>-files/store/*` (객실 사진이 생기면 Phase 13 에서 `room-group/*` 추가)
    - Condition `AWS:SourceArn` = 배포 ARN
  - 그래서 CloudFront 주소로 `private/*` 를 요청하면 S3 가 403 이다. 비공개 파일은 앱의 presigned GET 으로만 연다(앱 IAM 의 `s3:GetObject` 는 이미 있다).
  - 캐시 정책은 관리형 `CachingOptimized`(키가 바뀌지 않아 길게)이고, 응답 헤더 정책으로 `Cache-Control: public, max-age=31536000, immutable` 을 붙인다.
  - 배포 도메인을 `AWS_S3_PUBLIC_URL` 에 넣는다 — 앱 코드 변경 없음(`getPublicUrl`).
  - 사진을 지워도 CDN 사본은 캐시 기간 동안 남는다(주소를 아는 사람만 본다). 즉시 지워야 하면 CloudFront 무효화를 건다.
  - CORS(4단계)는 그대로 버킷에 둔다(presigned PUT · GET 은 S3 로 직접 간다).
- `docs/architecture.md`: admin-service 트리에 `store/` 를 더한다.
- `docs/testing.md`: Data-Access Smoke 현재 적용 목록에 store repository 를 더한다.
- `docs/api.md`: 동기 GET 목록 예(`@Query() query: XListDto` → `new XListDto(query)` → `{actor, query: dto}`)를 더한다.
- `README.md`: admin-service 설명을 "매니저 · 관리자 계정 + 업체 입점 신청 · 승인 · 업체 관리" 로 바꾼다. 명령 · 실행 방법은 변경 없음.

### 추가 — 입점 신청 취소 (build 중 사용자 요청 2026-10-26)

이 절이 위 코드 블록보다 우선한다. 실제 코드는 아래 파일이 기준이다.

- 규격: `STORE_COMMAND.APPLICATION_CANCEL = 'admin.store.application-cancel'`, DTO `StoreApplicationCancelParamDto {store_application_id}`(`store-application-cancel.dto.ts`).
- 게이트웨이 큐 라우트: `DELETE /api/v1/admin-service/store/application/mine/:store_application_id`(이용자 가드, done data null).
- 서비스 큐 컨트롤러: `@OnCommand(APPLICATION_CANCEL)` → `storeService.cancelMyApplication(requireActor(command).user_id, store_application_id)`.
- `StoreService.cancelMyApplication` (`@Transactional()`):
  1. 대기 중 내 신청을 찾는다 — `findApplication({id, user_id, In[WAIT, REJECTED]})`. 없으면 404, 반려면 400.
  2. 지울 키를 읽는다 — `findApplicationFileRows(id)`.
  3. `deleteApplicationFiles(id)` 다음 `deleteApplication({id, user_id, WAIT})` 를 부른다. false 면 400(롤백).
  4. 키마다 `storageGateway.remove(key)` 를 부른다(마지막).
- repository:
  - `deleteApplication(where): Promise<boolean>` — `affected === 1`. 형제 `consumeSmsVerificationAttempt` 와 같은 모양이다.
  - `deleteApplicationFiles(id)` + 빌더 `buildDeleteApplicationFilesQuery(id)` — `DELETE … WHERE store_application_id = $1 AND store_id IS NULL`, Smoke 대상.
- 동시 처리 보강:
  - `updateApplication` 이 `Promise<boolean>` 을 돌려준다.
  - 승인 · 반려는 where 를 `{store_application_id, store_application_state_id: WAIT}` 로 바꾸고, false 면 400 을 던진다. 승인은 SMS 전이라 롤백되면 발송하지 않는다.

---

## Test Cases

spec 두 종류만 둔다(docs/testing.md).
- service 기능 spec 은 API 1개당 1개다. repository · `STORAGE_GATEWAY` · `SMS_SENDER` 를 mock 하고, 큐는 `runCommand`, 동기는 supertest 로 부팅한다.
- repository spec 은 오류 변환과 Data-Access Smoke 를 다룬다.

도우미 `apps/admin-service/src/store/test/store.test-helper.ts` 는 manager.test-helper.ts 와 같은 모양이다.
- `createStoreRepositoryMock` · `createStorageGatewayMock` · `createSmsSenderMock`
- `bootCommandPath` · `bootHttpPath` · `internalHeaders(actor?)` · `runCommand`
- 행 생성 도우미: `applicationRow` · `fileRow(StoreFileRow)` · `purposeRow` · `storeRow` · `applicantRow`

```
[SUCCESS]  store-apply.spec.ts — 대기 신청 · 같은 번호 없음 → insertApplication 1회, 인자 StoreApplicationEntity(WAIT · user_id · store_id null · owner_name · owner_phone · address_detail/application_comment null · latitude number), done data.store_application_id = 32자
[FAIL:duplicate]  store-apply — 대기 신청 있음 → 400 '이미 대기 중인 입점 신청이 있습니다.', countStores · insertApplication 미호출
[FAIL:duplicate]  store-apply — 같은 사업자번호 대기 신청 또는 등록 업체 → 400 + validation_errors[0].property = business_number, insertApplication 미호출
[SECURITY]  store-apply — actor 없는 명령 → failed(401 ACTOR_REQUIRED), countApplications 미호출

[SUCCESS]  store-my-application-list.spec.ts — 쿼리 없음 → PaginationDto 기본값(page 1 · size 20)으로 countApplications · findApplicationList(where {user_id, store_application_state_id In[WAIT, REJECTED]}, 20, 0), 응답 {list, pagination}
[SUCCESS]  store-my-application-list — page=2&size=5 (문자열) → findApplicationList(..., 5, 5), pagination.page = 2
[SECURITY]  store-my-application-list — 내부 토큰 없는 요청 → 401(전역 InternalAuthGuard), countApplications 미호출

[SUCCESS]  store-my-application.spec.ts — 대기 신청 · 파일 행 2개(is_private 1 · 0) → createDownloadUrl 1회(is_private 1 행의 키) · getPublicUrl 1회(is_private 0 행의 키), files[].file_url · is_private — 열람 주소는 용도 룩업의 is_private 로 고른다
[FAIL:service]  store-my-application — 남의 신청 · 승인 신청(where 에 user_id · In[WAIT, REJECTED]) → findApplication null → 404 '입점 신청을 찾을 수 없습니다.', findApplicationFileRows 미호출
[FAIL:validation]  store-my-application — store_application_id 'abc' → 400 validation_errors.store_application_id

[SUCCESS]  store-application-file-upload-url.spec.ts — 대기 · 용도 BUSINESS_LICENSE(is_private 1) · 0개 → createUploadUrl({key: 'private/store-application/<id>/<32hex>.jpg', content_type: 'image/jpeg'}), 응답 file_key · upload_url · expires_at(ISO)
[SUCCESS]  store-application-file-upload-url — 용도 STORE_IMAGE(is_private 0) → key 'store/application/<id>/<32hex>.png' — 접두는 용도 룩업의 is_private 로
[FAIL:service]  store-application-file-upload-url — 반려 신청 → 400 '대기 중인 입점 신청만 처리할 수 있습니다.', findStoreFilePurpose · createUploadUrl 미호출
[FAIL:service]  store-application-file-upload-url — 용도 룩업 없음 → 400 '파일 용도가 올바르지 않습니다.' / 사업자등록증 1개 · 업체 사진 5개 이미 → 400 '올릴 수 있는 파일 수를 넘었습니다.'
[FAIL:validation]  store-application-file-upload-url — content_type 'image/gif' → 400 'JPG · PNG 사진만 올릴 수 있습니다.' / 용도 'X' → 400

[SUCCESS]  store-application-file.spec.ts — 키 모양 맞음 · 한도 안 · exists true → insertStoreFile 1회(StoreFileEntity: store_file_purpose_id · store_application_id · store_id null · sort_order = 기존 개수 · file_name · content_type), done data.store_file_id
[FAIL:service]  store-application-file — 다른 신청 ID 의 키 · 다른 비공개 여부 접두(사업자등록증인데 store/…) · 확장자/형식 불일치 → 400 validation_errors.file_key, exists 미호출
[FAIL:service]  store-application-file — exists false → 400 '파일이 아직 올라가지 않았습니다…', insertStoreFile 미호출
[FAIL:service]  store-application-file — 승인 · 남의 신청 → 404 / 반려 → 400 / 한도 초과 → 400
[FAIL:repository]  store-application-file — insertStoreFile 400(같은 키) → failed 400 그대로

[SUCCESS]  store-application-file-delete.spec.ts — 대기 · 그 신청의 파일 → deleteStoreFile({store_file_id}) 1회 → remove(file_key) 1회(삭제 뒤)
[FAIL:service]  store-application-file-delete — 파일 없음(다른 신청의 파일 포함 — where 에 store_application_id) → 404 '파일을 찾을 수 없습니다.', deleteStoreFile · remove 미호출
[FAIL:service]  store-application-file-delete — 반려 신청 → 400, remove 미호출

[SUCCESS]  store-application-cancel.spec.ts — 대기 · 내 신청 · 파일 2개 → deleteApplicationFiles(id) → deleteApplication({id, user_id, WAIT}) 순, remove(key) 2회(삭제 뒤), done null
[SUCCESS]  store-application-cancel — 파일 없음 → remove 미호출
[FAIL:service]  store-application-cancel — 남의 · 승인 신청 → 404 / 반려 → 400 — deleteApplicationFiles · deleteApplication · remove 미호출
[FAIL:service]  store-application-cancel — deleteApplication false(그 사이 승인 · 반려) → failed 400 + ack, remove 미호출
[FAIL:infra]  store-application-cancel — remove 503 → requeue
[SECURITY]  store-application-cancel — actor 없음 → 401, findApplication 미호출

[SUCCESS]  store-application-list.spec.ts — 상태 WAIT + keyword '룸%' → countApplications · findApplicationList 의 where 가 [{store_application_state_id: 'WAIT', store_name: ILike('%룸\\%%')}, {…, business_number: ILike(…)}] (2개, 이스케이프), 응답 항목 필드 · null
[SUCCESS]  store-application-list — 필터 없음 → where [{}]
[FAIL:validation]  store-application-list — store_application_state_id 'DONE' → 400 / keyword 101자 → 400

[SUCCESS]  store-application-detail.spec.ts — 신청 + 신청자 + 파일 행 → applicant {user_id · name · nickname · phone}, files URL(is_private 1 서명 · 0 CDN)
[SUCCESS]  store-application-detail — 신청자 없음 → applicant null
[FAIL:service]  store-application-detail — 신청 없음 → 404, findApplicant 미호출

[SUCCESS]  store-application-approve.spec.ts — 대기 · 사업자등록증 1 · 신청자 있음:
             insertStore(StoreEntity: ACTIVE · is_open 0 · 신청 정보 · store_detail {} · 연중무휴 0 · 정비 0),
             assignStoreFiles(store_application_id, store_id) 1회 — 파일을 옮기지 않고 업체 지정,
             countManagers({login_id: /^m\d{8}$/, login_scope: MANAGER}),
             insertHeadManager(UserEntity: HEAD_MANAGER · MANAGER · store_id · is_password_change_required 1 · gender/birth = 신청자 · name/nickname = 대표자명 · phone = 대표자 번호 · login_pw ≠ 평문(bcrypt)),
             updateApplication({store_application_id, store_application_state_id: WAIT}, APPROVED · store_id · reviewed_at),
             sms.send({to: owner_phone, text 에 아이디 포함}) — 마지막, done data {store_id, login_id}
[SUCCESS]  store-application-approve — countManagers 첫 후보 1 → 두 번째 후보 0 → 그 후보로 계정
[FAIL:service]  store-application-approve — 사업자등록증 0개(countStoreFiles where {store_application_id, store_file_purpose_id: BUSINESS_LICENSE}) → 400, insertStore 미호출 / 신청자 없음 → 400, insertStore 미호출 / 대기 아님 → 400 / 신청 없음 → 404
[FAIL:service]  store-application-approve — 아이디 5번 모두 겹침 → failed 500(재시도 판정), insertHeadManager · sms 미호출
[FAIL:repository]  store-application-approve — insertStore 400(사업자번호 UK) → failed 400, assignStoreFiles · insertHeadManager · sms 미호출 / insertHeadManager 400(휴대폰 UK) → failed 400, updateApplication · sms 미호출
[FAIL:service]  store-application-approve — updateApplication false(그 사이 취소 · 반려) → failed 400, sms 미호출
[FAIL:service]  store-application-approve — sms 503 → failed 재시도(requeue) — 트랜잭션 롤백은 실 DB 밖이라 판정만 단언

[SUCCESS]  store-application-reject.spec.ts — 대기 → updateApplication({store_application_id, store_application_state_id: WAIT}, REJECTED · reject_comment · reviewed_at)
[FAIL:service]  store-application-reject — updateApplication false(그 사이 취소 · 승인) → 400
[FAIL:service]  store-application-reject — 대기 아님 → 400, updateApplication 미호출 / 없음 → 404

[SUCCESS]  store-list.spec.ts — store_state_id ACTIVE + keyword → where 3개(OR — 상호명 · 사업자번호 · 대표자명), 응답 항목 is_open 포함
[FAIL:validation]  store-list — store_state_id 'X' → 400

[SUCCESS]  store-detail.spec.ts — 업체 + 파일 행(사업자등록증 is_private 1 · 사진 2 is_private 0) → findStoreFileRows(store_id), files[] URL(서명 1 · CDN 2) · sort_order, store_detail 복사 · null 필드
[FAIL:service]  store-detail — 업체 없음 → 404, findStoreFileRows 미호출

[SUCCESS]  store-update.spec.ts — 활성 업체 → updateStore({store_id}, StoreEntity: 7 필드 · address_detail 없음 → null · business_number 미할당)
[FAIL:service]  store-update — 탈퇴 업체 → 400 '탈퇴한 업체는 바꿀 수 없습니다.', updateStore 미호출 / 없음 → 404

[SUCCESS]  store-state.spec.ts — ACTIVE → SUSPEND: updateStore({store_id}, store_state_id SUSPEND), updateStoreManagers 미호출(영업중지는 매니저 그대로)
[SUCCESS]  store-state — ACTIVE → LEAVE: updateStoreManagers(store_id, 'BLOCK', '업체 탈퇴로 이용이 정지되었습니다.') 1회 → updateStore(LEAVE · business_number 'DELETE_<store_id>' · delete_backup JSON 에 원래 번호)
[FAIL:service]  store-state — 같은 상태 → 400 '이미 같은 상태입니다.' / 탈퇴 업체 → 400 / 없음 → 404 — updateStore · updateStoreManagers 미호출

[FAIL:repository]  store.repository.spec.ts — insertStoreFile: UK_StoreFile_FileKey → 400 '이미 등록된 파일입니다.', 그 밖 → 500
[FAIL:repository]  store.repository — insertStore: UK_Store_BusinessNumber → 400 '이미 신청 · 등록된 사업자등록번호입니다.', 그 밖 → 500
[FAIL:repository]  store.repository — insertHeadManager: UK_User_PhoneLoginScope → 400 휴대폰 문구 · UK_User_LoginIdLoginScope → 400 아이디 문구 · 그 밖 → 500
[FAIL:repository]  store.repository — find* · count* · update* · delete* · assignStoreFiles 실패 → 통일 500 (it.each)
[SUCCESS]  store.repository — findApplicant 가 where {user_id, login_scope: 'USER'} · loadRelationIds 로 조회 / findStoreFilePurpose 가 where {store_file_purpose_id}
[SMOKE:data-access]  store.repository — buildApplicationListQuery(buildApplicationListWhere({state WAIT, keyword '룸'}), 20, 0): SQL 전체 고정(store_application_state_id = · store_name ILIKE · OR · ORDER BY created_at DESC · LIMIT/OFFSET), 파라미터에 '%룸%'
[SMOKE:data-access]  store.repository — buildApplicationListQuery({user_id, store_application_state_id: In(['WAIT','REJECTED'])}, …) — 관계 필드 IN 이 store_application_state_id 컬럼으로
[SMOKE:data-access]  store.repository — buildStoreListQuery(buildStoreListWhere({ACTIVE, keyword 'a_b'})) — 3개 OR · 파라미터 '%a\\_b%'
[SMOKE:data-access]  store.repository — buildStoreFileRowsQuery('store_application_id', 'a1') · ('store_id', 's1'): t_store_file_purpose INNER JOIN · select 별칭 목록 = StoreFileRow 키 · WHERE f.<컬럼> · ORDER BY 용도 · 정렬 순서 · 등록일 (SQL 고정)
[SMOKE:data-access]  store.repository — buildAssignStoreFilesQuery('a1', 's1'): UPDATE "t_store_file" SET "store_id" = $1 WHERE store_application_id = $2 (SQL 고정)
[SUCCESS]  store.repository — updateApplication · deleteApplication: affected 1 → true · 0 → false
[SMOKE:data-access]  store.repository — buildDeleteApplicationFilesQuery('a1'): DELETE FROM "t_store_file" WHERE store_application_id = $1 AND store_id IS NULL (SQL 고정)
[SMOKE:data-access]  store.repository — buildUpdateStoreManagersQuery('s1', 'BLOCK', '사유'): UPDATE "t_user" SET "state_id" = $1, "block_comment" = $2, "updated_at" = CURRENT_TIMESTAMP WHERE store_id = $3 AND login_scope = $4 (SQL 고정)

테스트 생략(위임형):
  StoreModule · 게이트웨이 라우트 · DTO 클래스 자체 — controller · 라이브러리 spec 은 두지 않는다(docs/testing.md).
  저장소 어댑터의 createDownloadUrl — 어댑터 spec 은 두지 않는다(integration.md).
  InternalHttpClient 쿼리 문자열 — 게이트웨이 인프라 spec 은 두지 않는다. 게이트웨이 목록 라우트를 실제로 부를 때 확인한다.
  store.util 의 키 · 아이디 · 문구 · 변환 — util 단위 spec 은 두지 않는다. service spec 이 키 모양 · where · 결과 필드를 단언한다.
```

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | 동기 조회 · 업로드 주소 성공 (#2 · #3 · #4 · #7 · #8 · #11 · #12) |
| SSE `done` | 큐 명령 성공 — #1 `{store_application_id}` · #5 `{store_file_id}` · #9 `{store_id, login_id}` · #6 · #10 · #13 · #14 · #15 null |
| 400 | 입력 검증(`validation_errors`), 대기 신청 중복, 그 사이 처리된 신청(승인 · 반려 · 취소 0건), 사업자번호 중복(`validation_errors.business_number`), 대기 아님, 파일 용도 없음, 용도별 한도, 키 모양(`validation_errors.file_key`), 업로드 안 됨, 같은 키, 사업자등록증 없음, 신청자 없음, 업체 총관리자 휴대폰 · 아이디 UK, 탈퇴 업체, 같은 상태 |
| 401 | 토큰 없음 · 다른 그룹 토큰(이용자 라우트에 관리자 토큰 등 — 그룹 가드), 큐 명령 actor 없음(신청자 명령) |
| 404 | 신청 없음(남의 신청 · 승인된 내 신청 포함) · 파일 없음 · 업체 없음 |
| 500 | DB 실패(통일 문구) · 업체 총관리자 아이디 생성 실패(재시도) · 공개 주소 설정 없음 |
| 503 | S3(업로드 · 열람 주소 · exists · remove) · SMS · 브로커 · admin-service 접속 실패 — 큐 경로는 재시도 |
| SSE `pending` | 대기 시간 초과 · 게이트웨이 종료 — 클라이언트는 리소스를 재조회 |
