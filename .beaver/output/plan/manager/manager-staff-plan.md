# Plan — manager-staff

## Feature Summary
- **Feature**: 업체 인력(Phase 10 #42 — #43 dropped)
  - A. 업체코드 `t_store.store_code` + 매니저 계정 유일성을 업체 단위로(부분 유니크 인덱스 4개) + 매니저 로그인 · 아이디 찾기 · 비밀번호 초기화에 업체코드
  - B. 입점 신청에 업체 총관리자 아이디 · 비밀번호, 승인은 그 자격증명으로 계정 + 승인 알림 SMS, 내 신청에 승인 신청 · `store_code`
  - C. 업체 총관리자의 업체 관리자 계정 등록 · 목록 · 상세 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제(RolesGuard 첫 사용)
- **Entry point**: 게이트웨이 `/api/v1/admin-service/manager/staff`(동기 2 · 큐 5) → admin-service 매니저 도메인(`/internal/v1/admin-service/manager/staff` · `admin.manager.staff*`), 매니저 `login` · `find-login-id` · `password-reset` 입력, 업체 `/api/v1/admin-service/store/…` 응답
- **Domain**: manager (+ store 보정)
- **Spec**: [manager-staff-spec.md](../../spec/manager/manager-staff-spec.md)

---

## File List

| File | Action |
|------|------|
| `libs/database/src/entities/store/store.entity.ts` | modified — `store_code` + `UK_Store_StoreCode` |
| `libs/database/src/entities/store/store-application.entity.ts` | modified — `head_manager_login_id` · `head_manager_login_pw` |
| `libs/database/src/entities/user/user.entity.ts` | modified — UK 2개 → 부분 유니크 인덱스 4개 |
| `libs/database/src/migrations/<ts>-StoreCodeManagerScope.ts` · `migrations.ts` | new · modified — `db:generate` + 손 보정(기존 행 채움 · 제약 → 인덱스) |
| `libs/common/src/utils/search.ts` | new — `toContainsPattern`(store.util.ts 에서 옮김 — 매니저 도메인도 쓴다) |
| `libs/contracts/src/manager/manager.commands.ts` | modified — `STAFF*` 명령 5 · `STAFF_LIST` · `staff(user_id)` |
| `libs/contracts/src/manager/dto/manager-login.dto.ts` · `manager-find-login-id.dto.ts` · `manager-password-reset.dto.ts` | modified — `store_code` |
| `libs/contracts/src/manager/dto/manager-staff{,-list,-detail,-update,-password-reset,-state,-delete}.dto.ts` (7) | new |
| `libs/contracts/src/store/dto/store-application.dto.ts` · `store-my-application-list.dto.ts` · `store-my-application.dto.ts` · `store-application-detail.dto.ts` · `store-application-approve.dto.ts` · `store-list.dto.ts` · `store-detail.dto.ts` | modified — 자격증명 · `store_code` · 승인 결과 |
| `apps/admin-service/src/manager/manager.constants.ts` | new — 업체 인력 상태 · 메시지 |
| `apps/admin-service/src/manager/manager.util.ts` | modified — 인력 목록 WHERE · 변환 · 등록 SMS 문구 |
| `apps/admin-service/src/manager/interfaces/manager.repository.interface.ts` · `repositories/manager.repository.ts` | modified — `findManagerStore` · `countStaff` · `findStaffList`(+ 빌더) · `insertStaff` · `updateStaff` |
| `apps/admin-service/src/manager/manager.service.ts` | modified — 로그인 · 아이디 찾기 · 비밀번호 초기화에 업체코드, 인력 7 메서드 |
| `apps/admin-service/src/manager/controllers/manager.controller.ts` · `manager.controller.queue.ts` | modified — 인력 동기 2 · 큐 5 |
| `apps/admin-service/src/manager/test/manager.test-helper.ts` + `manager-login` · `manager-find-login-id` · `manager-password-reset` spec | modified — 업체코드 |
| `apps/admin-service/src/manager/test/manager-staff{,-list,-detail,-update,-password-reset,-state,-delete}.spec.ts` (7) | new |
| `apps/admin-service/src/manager/test/manager.repository.spec.ts` | modified — 인력 UK 분기 · 통일 500 · Smoke |
| `apps/admin-service/src/store/store.constants.ts` · `store.util.ts` · `store.service.ts` | modified — 무작위 아이디 · 보이는 상태 제거, 자격증명 · 업체코드 |
| `apps/admin-service/src/store/interfaces/store.repository.interface.ts` · `repositories/store.repository.ts` | modified — `countManagers` 제거 · `insertHeadManager` UK 분기 제거 · `findStores` |
| `apps/admin-service/src/store/test/*` | modified — 자격증명 · 업체코드 · 승인 신청 보임 · 승인 흐름 |
| `apps/gateway/src/api/v1/admin-service/manager/controllers/manager.controller.ts` · `manager.controller.queue.ts` · `manager.module.ts` | modified — 인력 라우트(RolesGuard + `@Roles(HEAD_MANAGER)`) |
| `AGENTS.md` · `docs/{conventions,data-layer,api,architecture,testing}.md` | modified — 부분 유니크 인덱스 · 업체 단위 매니저 계정 · RolesGuard 적용 · `search.ts` · Smoke 목록 |
| `README.md` | modified — 매니저 로그인에 업체코드 · 업체 관리자 관리 · 입점 신청 자격증명 |
| `.beaver/output/spec/platform/cache-spec.md` | modified — 무효화 지점(업체 관리자 수정 · 초기화 · 삭제) |
| `.beaver/output/roadmap/roomless-roadmap.md` (+ html) | modified — `roadmap-status.js` 로 상태 |

삭제할 코드:
- store: `generateHeadManagerLoginId` · `HEAD_MANAGER_LOGIN_ID_ATTEMPTS` · `countManagers`(포트 · 구현 · mock) · `insertHeadManager` 의 UK 분기 · `HEAD_MANAGER_PHONE_TAKEN_MESSAGE` · `STORE_APPLICATION_VISIBLE_STATES` · store.util.ts 의 `toContainsPattern`(→ libs/common)
- store.service.ts 의 `generateTemporaryPassword` · `InternalServerErrorException` · `In` import(쓰지 않게 된다)
- store 승인 spec 의 아이디 겹침 · 5회 실패 케이스, repository spec 의 `insertHeadManager` UK 케이스

---

## Design

### Data Access — 엔티티 · 마이그레이션

```ts
// libs/database/src/entities/store/store.entity.ts — 변경 부분
@Entity({name: 't_store', comment: '업체 정보'})
@Unique('UK_Store_BusinessNumber', ['business_number'])
@Unique('UK_Store_StoreCode', ['store_code'])
@Index('IDX_Store_LatitudeLongitude', ['latitude', 'longitude'])
export class StoreEntity {
    @PrimaryColumn({name: 'store_id', length: 32, comment: '업체 ID', primaryKeyConstraintName: 'PK_Store'})
    store_id: string;

    @Column({name: 'store_code', length: 32, nullable: false, comment: '업체코드(UUID 32자 — PK 와 별개, 매니저 로그인 · 매니저 화면 주소에 쓴다. 승인 때 만들고 바꾸지 않는다)'})
    store_code: string;

    // … 나머지 그대로
}
```

```ts
// libs/database/src/entities/store/store-application.entity.ts — owner_phone 뒤에 추가
    @Column({name: 'head_manager_login_id', length: 30, nullable: false, comment: '업체 총관리자 아이디 — 승인 때 만드는 업체 총관리자(매니저) 계정의 아이디(그 업체 안에서 유일)'})
    head_manager_login_id: string;

    @Column({name: 'head_manager_login_pw', length: 100, nullable: false, comment: '업체 총관리자 비밀번호(bcrypt 해시) — 승인 때 계정에 그대로 옮긴다'})
    head_manager_login_pw: string;
```

```ts
// libs/database/src/entities/user/user.entity.ts — 클래스 데코레이터 변경 (Index import 추가)
@Entity({name: 't_user', comment: '회원 정보'})
@Unique('UK_User_UserSearchCode', ['user_search_code'])
@Unique('UK_User_SnsSnsUserId', ['sns_id', 'sns_user_id'])
// 아이디 · 휴대폰 번호 유일성 — 업체가 없는 계정(이용자 · 총관리자 · 관리자)은 로그인 그룹 안에서, 업체 소속 계정(매니저 그룹)은 그 업체 안에서.
// TypeORM 은 NULLS NOT DISTINCT 가 없고 미인증 이용자의 phone 은 NULL 이라 store_id 로 나눈 부분 유니크 인덱스 둘로 둔다.
@Index('UK_User_LoginIdLoginScope', ['login_id', 'login_scope'], {unique: true, where: '"store_id" IS NULL'})
@Index('UK_User_LoginIdLoginScopeStoreId', ['login_id', 'login_scope', 'store_id'], {unique: true, where: '"store_id" IS NOT NULL'})
@Index('UK_User_PhoneLoginScope', ['phone', 'login_scope'], {unique: true, where: '"store_id" IS NULL'})
@Index('UK_User_PhoneLoginScopeStoreId', ['phone', 'login_scope', 'store_id'], {unique: true, where: '"store_id" IS NOT NULL'})
export class UserEntity {
```

`npm run db:generate -- StoreCodeManagerScope` 결과를 아래 모양으로 손 보정한다(기존 행이 있는 테이블의 NOT NULL 추가 — data-layer.md 규칙).

```ts
// libs/database/src/migrations/<ts>-StoreCodeManagerScope.ts — up (손 보정 뒤 모양, 생성기 출력 순서는 build 때 맞춘다)
public async up(queryRunner: QueryRunner): Promise<void> {
    // t_user — 그룹 단위 UK 를 업체 유무로 나눈 부분 유니크 인덱스로
    await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "UK_User_LoginIdLoginScope"`);
    await queryRunner.query(`ALTER TABLE "t_user" DROP CONSTRAINT "UK_User_PhoneLoginScope"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UK_User_LoginIdLoginScope" ON "t_user" ("login_id", "login_scope") WHERE "store_id" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UK_User_LoginIdLoginScopeStoreId" ON "t_user" ("login_id", "login_scope", "store_id") WHERE "store_id" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UK_User_PhoneLoginScope" ON "t_user" ("phone", "login_scope") WHERE "store_id" IS NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UK_User_PhoneLoginScopeStoreId" ON "t_user" ("phone", "login_scope", "store_id") WHERE "store_id" IS NOT NULL`);

    // t_store.store_code — 기존 행은 새 UUID 로 채운 뒤 NOT NULL · UK
    await queryRunner.query(`ALTER TABLE "t_store" ADD "store_code" character varying(32)`);
    await queryRunner.query(`UPDATE "t_store" SET "store_code" = replace(gen_random_uuid()::text, '-', '')`);
    await queryRunner.query(`ALTER TABLE "t_store" ALTER COLUMN "store_code" SET NOT NULL`);
    await queryRunner.query(`COMMENT ON COLUMN "t_store"."store_code" IS '업체코드(UUID 32자 — PK 와 별개, 매니저 로그인 · 매니저 화면 주소에 쓴다. 승인 때 만들고 바꾸지 않는다)'`);
    await queryRunner.query(`ALTER TABLE "t_store" ADD CONSTRAINT "UK_Store_StoreCode" UNIQUE ("store_code")`);

    // t_store_application — 업체 총관리자 자격증명 (기존 행은 빈 값 → 기본값 제거)
    await queryRunner.query(`ALTER TABLE "t_store_application" ADD "head_manager_login_id" character varying(30) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "t_store_application" ALTER COLUMN "head_manager_login_id" DROP DEFAULT`);
    await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."head_manager_login_id" IS '업체 총관리자 아이디 — 승인 때 만드는 업체 총관리자(매니저) 계정의 아이디(그 업체 안에서 유일)'`);
    await queryRunner.query(`ALTER TABLE "t_store_application" ADD "head_manager_login_pw" character varying(100) NOT NULL DEFAULT ''`);
    await queryRunner.query(`ALTER TABLE "t_store_application" ALTER COLUMN "head_manager_login_pw" DROP DEFAULT`);
    await queryRunner.query(`COMMENT ON COLUMN "t_store_application"."head_manager_login_pw" IS '업체 총관리자 비밀번호(bcrypt 해시) — 승인 때 계정에 그대로 옮긴다'`);
}

public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "t_store_application" DROP COLUMN "head_manager_login_pw"`);
    await queryRunner.query(`ALTER TABLE "t_store_application" DROP COLUMN "head_manager_login_id"`);
    await queryRunner.query(`ALTER TABLE "t_store" DROP CONSTRAINT "UK_Store_StoreCode"`);
    await queryRunner.query(`ALTER TABLE "t_store" DROP COLUMN "store_code"`);
    await queryRunner.query(`DROP INDEX "public"."UK_User_PhoneLoginScopeStoreId"`);
    await queryRunner.query(`DROP INDEX "public"."UK_User_PhoneLoginScope"`);
    await queryRunner.query(`DROP INDEX "public"."UK_User_LoginIdLoginScopeStoreId"`);
    await queryRunner.query(`DROP INDEX "public"."UK_User_LoginIdLoginScope"`);
    // 업체가 달라 같은 아이디 · 번호를 쓰는 매니저가 있으면 실패한다 — 되돌리기 전에 정리해야 한다
    await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "UK_User_PhoneLoginScope" UNIQUE ("phone", "login_scope")`);
    await queryRunner.query(`ALTER TABLE "t_user" ADD CONSTRAINT "UK_User_LoginIdLoginScope" UNIQUE ("login_id", "login_scope")`);
}
```

- 확인: `npm run db:check` 통과 + PGlite 로 up/down 을 돌려 본다(기존 `t_store` 행 채움, 부분 인덱스로 업체가 다른 같은 아이디 허용 · 같은 업체 거부 · 이용자 NULL 번호 여러 건 허용).
- **위험** — TypeORM 의 부분 인덱스 비교가 `where` 식 표기 차이로 `db:check` 에 남는 차이를 만들 수 있다. 그러면 엔티티의 `where` 를 PostgreSQL 이 돌려주는 표기(`(store_id IS NULL)`)에 맞춘다.

### Data Access — 공통 util · 저장소 포트

```ts
// libs/common/src/utils/search.ts — new (store.util.ts 의 toContainsPattern 을 옮긴다)
/**
 * 검색어를 부분 일치 패턴으로 — `%` · `_` · `\` 는 글자 그대로 찾도록 이스케이프한다(PostgreSQL 기본 이스케이프 문자 `\`).
 *
 * @param keyword 검색어
 * @returns ILike 패턴
 */
export function toContainsPattern(keyword: string): string {
    return `%${keyword.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}
```

### Input/Validation — contracts

```ts
// libs/contracts/src/manager/manager.commands.ts — 추가 부분
export const MANAGER_COMMAND = {
    // … 기존 5개
    /** 업체 관리자 등록 (업체 총관리자) → 임시 비밀번호 SMS */
    STAFF: 'admin.manager.staff',
    /** 업체 관리자 수정 (업체 총관리자) */
    STAFF_UPDATE: 'admin.manager.staff-update',
    /** 업체 관리자 비밀번호 초기화 (업체 총관리자) → 임시 비밀번호 SMS */
    STAFF_PASSWORD_RESET: 'admin.manager.staff-password-reset',
    /** 업체 관리자 정지 · 해제 (업체 총관리자) */
    STAFF_STATE: 'admin.manager.staff-state',
    /** 업체 관리자 삭제 (업체 총관리자) */
    STAFF_DELETE: 'admin.manager.staff-delete',
} as const;

/** 매니저 도메인 내부 HTTP 경로 (게이트웨이 → admin-service). 파라미터가 있는 경로는 함수로 만든다. */
export const MANAGER_INTERNAL_PATH = {
    // … 기존 3개
    /** 업체 관리자 목록 (GET, 업체 총관리자) */
    STAFF_LIST: '/internal/v1/admin-service/manager/staff',
    /** 업체 관리자 상세 (GET, 업체 총관리자) */
    staff: (user_id: string) => `/internal/v1/admin-service/manager/staff/${encodeURIComponent(user_id)}`,
} as const;
```

```ts
// libs/contracts/src/manager/dto/manager-login.dto.ts · manager-find-login-id.dto.ts · manager-password-reset.dto.ts — 각 클래스 첫 필드로 추가 (Matches import)
    @ApiProperty({description: '업체코드 (32자 — 매니저 화면 주소에 들어 있다)', example: '0123456789abcdef0123456789abcdef'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체코드가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체코드를 입력해주세요.'})
    store_code: string;
```

```ts
// libs/contracts/src/manager/dto/manager-staff.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 관리자 등록 입력 (업체 총관리자) — 업체는 로그인한 업체 총관리자의 업체다. 임시 비밀번호는 그 휴대폰으로 SMS.
 */
export class ManagerStaffDto {
    @ApiProperty({description: '로그인 아이디 (영문 · 숫자 · _ 4~30자, 업체 안에서 유일)'})
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 영문 · 숫자 · _ 4~30자로 입력해주세요.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '이름 (닉네임도 같은 값)'})
    @MaxLength(50, {message: '이름은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '이름을 입력해주세요.'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (숫자만, 업체 안에서 유일) — 임시 비밀번호 · 아이디 찾기 · 비밀번호 초기화', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;

    @ApiProperty({description: '성별', enum: ['M', 'F']})
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)', example: '1990-01-01'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;
}

/**
 * 업체 관리자 등록 결과
 */
export class ManagerStaffResultDto {
    @ApiProperty({description: '등록한 업체 관리자 회원 ID'})
    user_id: string;
}
```

```ts
// libs/contracts/src/manager/dto/manager-staff-list.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsOptional, MaxLength} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 업체 관리자 목록 query (업체 총관리자) — 검색어(아이디 · 이름 · 휴대폰 번호 부분 일치)
 */
export class ManagerStaffListDto extends PaginationDto {
    @ApiProperty({description: '검색어 — 아이디 · 이름 · 휴대폰 번호 부분 일치', required: false})
    @IsOptional()
    @MaxLength(100, {message: '검색어는 100자 이내로 입력해주세요.'})
    keyword: string | null;

    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값, 빠진 필터는 null
     */
    constructor(data?: Partial<ManagerStaffListDto>) {
        super(data);
        this.keyword = data?.keyword ?? null;
    }
}

/**
 * 업체 관리자 목록 항목 — 업체 총관리자도 함께(위에) 나온다
 */
export class ManagerStaffListItemResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (없으면 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '권한 (HEAD_MANAGER: 업체 총관리자, MANAGER: 업체 관리자)'})
    auth_id: string;

    @ApiProperty({description: '상태 (ACTIVE · BLOCK)'})
    state_id: string;

    @ApiProperty({description: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호)'})
    is_password_change_required: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 업체 관리자 목록
 */
export class ManagerStaffListResultDto {
    @ApiProperty({description: '목록 (업체 총관리자가 위, 등록일 최신순)', type: () => [ManagerStaffListItemResultDto]})
    list: ManagerStaffListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
```

```ts
// libs/contracts/src/manager/dto/manager-staff-detail.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 상세 path param
 */
export class ManagerStaffDetailParamDto {
    @ApiProperty({description: '업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 상세
 */
export class ManagerStaffDetailResultDto {
    @ApiProperty({description: '회원 ID'})
    user_id: string;

    @ApiProperty({description: '로그인 아이디'})
    login_id: string;

    @ApiProperty({description: '이름'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (없으면 null)', nullable: true, type: String})
    phone: string | null;

    @ApiProperty({description: '성별 (M · F)'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)'})
    birth: string;

    @ApiProperty({description: '권한 (MANAGER)'})
    auth_id: string;

    @ApiProperty({description: '상태 (ACTIVE · BLOCK)'})
    state_id: string;

    @ApiProperty({description: '비밀번호 변경 필요 여부(0: 불필요, 1: 필요 — 임시 비밀번호)'})
    is_password_change_required: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;

    @ApiProperty({description: '수정일시 (ISO 8601)'})
    updated_at: string;
}
```

```ts
// libs/contracts/src/manager/dto/manager-staff-update.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 관리자 수정 path param
 */
export class ManagerStaffUpdateParamDto {
    @ApiProperty({description: '업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 수정 입력 — 전체 교체, 아이디는 바꾸지 않는다
 */
export class ManagerStaffUpdateDto {
    @ApiProperty({description: '이름 (닉네임도 같은 값)'})
    @MaxLength(50, {message: '이름은 50자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '이름을 입력해주세요.'})
    name: string;

    @ApiProperty({description: '휴대폰 번호 (숫자만, 업체 안에서 유일)', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;

    @ApiProperty({description: '성별', enum: ['M', 'F']})
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)', example: '1990-01-01'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;
}
```

```ts
// libs/contracts/src/manager/dto/manager-staff-password-reset.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 비밀번호 초기화 path param — 임시 비밀번호는 그 업체 관리자 휴대폰으로 SMS
 */
export class ManagerStaffPasswordResetParamDto {
    @ApiProperty({description: '업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
```

```ts
// libs/contracts/src/manager/dto/manager-staff-state.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 업체 관리자 정지 · 해제 path param
 */
export class ManagerStaffStateParamDto {
    @ApiProperty({description: '업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 정지 · 해제 입력 — 정지(BLOCK)는 로그인 · 재발급이 막히고, 해제(ACTIVE)는 다시 쓸 수 있다
 */
export class ManagerStaffStateDto {
    @ApiProperty({description: '바꿀 상태 (ACTIVE: 해제, BLOCK: 정지)', enum: ['ACTIVE', 'BLOCK']})
    @IsIn(['ACTIVE', 'BLOCK'], {message: '상태가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상태를 입력해주세요.'})
    state_id: string;

    @ApiProperty({description: '정지 사유 (정지할 때만 남는다 — 로그인 때 보인다)', required: false})
    @IsOptional()
    @MaxLength(255, {message: '정지 사유는 255자 이내로 입력해주세요.'})
    block_comment?: string;
}
```

```ts
// libs/contracts/src/manager/dto/manager-staff-delete.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 삭제 path param — 탈퇴(LEAVE) 처리, 같은 아이디 · 번호로 다시 등록할 수 있다
 */
export class ManagerStaffDeleteParamDto {
    @ApiProperty({description: '업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
```

```ts
// libs/contracts/src/store/dto/store-application.dto.ts — owner_phone 뒤에 추가
    @ApiProperty({description: '업체 총관리자 아이디 (영문 · 숫자 · _ 4~30자) — 승인 때 이 아이디로 업체 총관리자 계정을 만든다'})
    @Matches(/^[a-zA-Z0-9_]{4,30}$/, {message: '아이디는 영문 · 숫자 · _ 4~30자로 입력해주세요.'})
    @IsNotEmpty({message: '업체 총관리자 아이디를 입력해주세요.'})
    head_manager_login_id: string;

    @ApiProperty({description: '업체 총관리자 비밀번호 (8~20자, 영문+숫자 필수, 특수문자 !@#$%^&* 허용) — 해시로만 저장한다'})
    @Matches(/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/, {message: '비밀번호는 8~20자이며 영문과 숫자를 반드시 포함해야 합니다. (특수문자는 !@#$%^&* 만 허용)'})
    @IsNotEmpty({message: '업체 총관리자 비밀번호를 입력해주세요.'})
    head_manager_login_pw: string;
```

```ts
// libs/contracts/src/store/dto/store-my-application-list.dto.ts — StoreMyApplicationItemResultDto 끝에 추가
    @ApiProperty({description: '업체코드 — 승인 신청이면 그 업체의 코드(매니저 로그인 · 매니저 화면 주소), 아니면 null', nullable: true, type: String})
    store_code: string | null;
```

```ts
// libs/contracts/src/store/dto/store-my-application.dto.ts — StoreMyApplicationResultDto 의 owner_phone 뒤 · created_at 뒤에 추가
    @ApiProperty({description: '업체 총관리자 아이디'})
    head_manager_login_id: string;

    @ApiProperty({description: '업체코드 — 승인 신청이면 그 업체의 코드, 아니면 null', nullable: true, type: String})
    store_code: string | null;
```

```ts
// libs/contracts/src/store/dto/store-application-detail.dto.ts — StoreApplicationDetailResultDto 의 store_id 뒤 · owner_phone 뒤에 추가
    @ApiProperty({description: '업체코드 (승인 전 null)', nullable: true, type: String})
    store_code: string | null;

    @ApiProperty({description: '업체 총관리자 아이디'})
    head_manager_login_id: string;
```

```ts
// libs/contracts/src/store/dto/store-application-approve.dto.ts — 결과 변경
/**
 * 입점 승인 결과 — 업체 총관리자는 신청 때 정한 아이디 · 비밀번호로 로그인한다
 */
export class StoreApplicationApproveResultDto {
    @ApiProperty({description: '등록한 업체 ID'})
    store_id: string;

    @ApiProperty({description: '업체코드 (매니저 로그인 · 매니저 화면 주소)'})
    store_code: string;
}
```

```ts
// libs/contracts/src/store/dto/store-list.dto.ts (StoreListItemResultDto) · store-detail.dto.ts (StoreDetailResultDto) — store_id 뒤에 추가
    @ApiProperty({description: '업체코드 (매니저 로그인 · 매니저 화면 주소)'})
    store_code: string;
```

### Data Access — 매니저 repository

```ts
// apps/admin-service/src/manager/interfaces/manager.repository.interface.ts — 추가 (StoreEntity import type)
    /** 매니저 소속 업체 (t_store) — 업체코드 · 업체 ID 로 찾는다 */
    findManagerStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null>;
    /** 업체 인력 수 (t_user 매니저 그룹) — 목록 · 같은 업체 안 아이디 · 번호 확인 */
    countStaff(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number>;
    /** 업체 인력 목록 — 업체 총관리자가 위, 등록일 최신순 */
    findStaffList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]>;
    /** 업체 관리자 계정 등록 — 업체 안 아이디 · 휴대폰 번호 UK → 400 */
    insertStaff(entity: UserEntity): Promise<void>;
    /** 업체 관리자 수정 · 삭제 — 업체 안 휴대폰 번호 UK → 400 */
    updateStaff(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void>;
```

```ts
// apps/admin-service/src/manager/repositories/manager.repository.ts — 추가 부분
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {STAFF_LOGIN_ID_TAKEN_MESSAGE, STAFF_PHONE_TAKEN_MESSAGE} from '../manager.constants.js';

    /** t_store repository (현재 트랜잭션 기준) */
    private get stores(): Repository<StoreEntity> {
        return this.txHost.tx.getRepository(StoreEntity);
    }

    /**
     * 매니저 소속 업체 단건 — 업체코드(로그인 · 아이디 찾기 · 비밀번호 초기화) · 업체 ID(업체 관리자 등록 안내)로 찾는다.
     *
     * @param where 조회 조건
     * @returns 업체 또는 null
     */
    async findManagerStore(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity | null> {
        try {
            return await this.stores.findOne({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 인력 수
     *
     * @param where 조회 조건 (배열 = OR)
     * @returns 개수
     */
    async countStaff(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[]): Promise<number> {
        try {
            return await this.users.count({where});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 인력 목록
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 인력 목록 (업체 총관리자가 위, 등록일 최신순)
     */
    async findStaffList(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): Promise<UserEntity[]> {
        try {
            return await this.buildStaffListQuery(where, limit, offset).getMany();
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 인력 목록 쿼리 — 매핑 민감(관계 필드 where · 정렬 · ILike · 배열 OR)이라 Data-Access Smoke spec 으로 SQL 을 고정한다.
     *
     * @param where 조회 조건 (배열 = OR)
     * @param limit 개수
     * @param offset 건너뛸 개수
     * @returns 쿼리 빌더
     */
    buildStaffListQuery(where: FindOptionsWhere<UserEntity> | FindOptionsWhere<UserEntity>[], limit: number, offset: number): SelectQueryBuilder<UserEntity> {
        return this.users.createQueryBuilder('u').setFindOptions({where, order: {auth_id: 'ASC', created_at: 'DESC'}, take: limit, skip: offset, loadRelationIds: true});
    }

    /**
     * 업체 관리자 계정 등록 — 같은 업체 안 아이디 · 휴대폰 번호면 400
     *
     * @param entity new UserEntity() + 할당
     */
    async insertStaff(entity: UserEntity): Promise<void> {
        try {
            await this.users.insert(entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_User_LoginIdLoginScopeStoreId')) {
                throw new BadRequestException({message: STAFF_LOGIN_ID_TAKEN_MESSAGE});
            } else if (isUniqueViolation(error, 'UK_User_PhoneLoginScopeStoreId')) {
                throw new BadRequestException({message: STAFF_PHONE_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }

    /**
     * 업체 관리자 수정 · 삭제 — 같은 업체 안 휴대폰 번호면 400
     *
     * @param where 수정 조건
     * @param entity 바꿀 필드만 할당한 엔티티
     */
    async updateStaff(where: FindOptionsWhere<UserEntity>, entity: UserEntity): Promise<void> {
        try {
            await this.users.update(where, entity);
        } catch (error) {
            if (isUniqueViolation(error, 'UK_User_PhoneLoginScopeStoreId')) {
                throw new BadRequestException({message: STAFF_PHONE_TAKEN_MESSAGE});
            } else {
                throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
            }
        }
    }
```

### Data Access — store repository 보정

```ts
// apps/admin-service/src/store/interfaces/store.repository.interface.ts — countManagers 삭제, 추가
    /** 업체 여러 건 — 내 신청 목록의 업체코드 */
    findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]>;
    /** 업체 총관리자 계정 등록 (t_user 매니저 그룹) — 새 업체라 그 업체 안에서 겹칠 계정이 없다 */
    insertHeadManager(entity: UserEntity): Promise<void>;
```

```ts
// apps/admin-service/src/store/repositories/store.repository.ts — 변경 부분 (HEAD_MANAGER_PHONE_TAKEN_MESSAGE import 삭제)
    /**
     * 업체 여러 건
     *
     * @param where 조회 조건
     * @returns 업체 목록
     */
    async findStores(where: FindOptionsWhere<StoreEntity>): Promise<StoreEntity[]> {
        try {
            return await this.stores.find({where, loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }

    /**
     * 업체 총관리자 계정 등록 — 아이디 · 휴대폰 번호 유일성은 업체 단위라 새 업체에서는 겹치지 않는다
     *
     * @param entity new UserEntity() + 할당
     */
    async insertHeadManager(entity: UserEntity): Promise<void> {
        try {
            await this.users.insert(entity);
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
    // countManagers 삭제
```

### Business Logic — 매니저 constants · util · service

```ts
// apps/admin-service/src/manager/manager.constants.ts — new
/** 업체 인력 상태 — 삭제(LEAVE)되지 않은 매니저 계정 */
export const STAFF_STATES = ['ACTIVE', 'BLOCK'];

/** 업체 관리자 없음 — 다른 업체 · 업체 총관리자 자신 · 삭제된 계정 포함 */
export const STAFF_NOT_FOUND_MESSAGE = '업체 관리자를 찾을 수 없습니다.';

/** 같은 업체에 같은 아이디 (service · repository) */
export const STAFF_LOGIN_ID_TAKEN_MESSAGE = '이미 사용 중인 아이디입니다.';

/** 같은 업체에 같은 휴대폰 번호 (service · repository) */
export const STAFF_PHONE_TAKEN_MESSAGE = '이미 다른 계정에 등록된 휴대폰 번호입니다.';

/** 업체 총관리자의 소속 업체가 없을 때(데이터 이상) */
export const MANAGER_STORE_NOT_FOUND_MESSAGE = '소속 업체를 찾을 수 없습니다.';
```

```ts
// apps/admin-service/src/manager/manager.util.ts — 추가 부분
import {ILike, In} from 'typeorm';
import type {FindOptionsWhere} from 'typeorm';
import {toContainsPattern} from '@app/common/utils/search.js';
import type {ManagerStaffDetailResultDto} from '@app/contracts/manager/dto/manager-staff-detail.dto.js';
import type {ManagerStaffListDto, ManagerStaffListItemResultDto} from '@app/contracts/manager/dto/manager-staff-list.dto.js';
import {LOGIN_SCOPE} from '@app/contracts/roles.js';
import type {UserEntity} from '@app/database/entities/user/user.entity.js';
import {STAFF_STATES} from './manager.constants.js';

/**
 * 업체 인력 목록 WHERE — 그 업체의 매니저 그룹 · 삭제되지 않은 계정 + 검색어(아이디 · 이름 · 휴대폰 번호 OR).
 *
 * @param store_id 업체 총관리자의 업체 ID
 * @param dto 목록 query
 * @returns WHERE 배열 (OR)
 */
export function buildStaffListWhere(store_id: string, dto: ManagerStaffListDto): FindOptionsWhere<UserEntity>[] {
    const base: FindOptionsWhere<UserEntity> = {login_scope: LOGIN_SCOPE.MANAGER, store_id, state_id: In(STAFF_STATES)};
    if (!dto.keyword) {
        return [base];
    }
    const pattern = toContainsPattern(dto.keyword);
    return [
        {...base, login_id: ILike(pattern)},
        {...base, name: ILike(pattern)},
        {...base, phone: ILike(pattern)},
    ];
}

/**
 * 업체 인력 목록 항목
 *
 * @param entity 매니저 계정
 * @returns 목록 항목
 */
export function toStaffListItem(entity: UserEntity): ManagerStaffListItemResultDto {
    return {
        user_id: entity.user_id,
        login_id: entity.login_id,
        name: entity.name,
        phone: entity.phone ?? null,
        auth_id: entity.auth_id,
        state_id: entity.state_id,
        is_password_change_required: entity.is_password_change_required,
        created_at: entity.created_at.toISOString(),
    };
}

/**
 * 업체 관리자 상세
 *
 * @param entity 업체 관리자 계정
 * @returns 상세
 */
export function toStaffDetail(entity: UserEntity): ManagerStaffDetailResultDto {
    return {
        user_id: entity.user_id,
        login_id: entity.login_id,
        name: entity.name,
        phone: entity.phone ?? null,
        gender: entity.gender,
        birth: entity.birth,
        auth_id: entity.auth_id,
        state_id: entity.state_id,
        is_password_change_required: entity.is_password_change_required,
        created_at: entity.created_at.toISOString(),
        updated_at: entity.updated_at.toISOString(),
    };
}

/**
 * 업체 관리자 등록 안내 SMS 본문 — 상호명 · 업체코드 · 아이디 · 임시 비밀번호.
 *
 * @param store_name 상호명
 * @param store_code 업체코드
 * @param login_id 아이디
 * @param password 임시 비밀번호
 * @returns 본문
 */
export function staffRegisteredText(store_name: string, store_code: string, login_id: string, password: string): string {
    return `[roomless] ${store_name} 업체 관리자 계정이 등록되었습니다. 업체코드 ${store_code} 아이디 ${login_id} 임시 비밀번호 ${password} — 로그인 후 비밀번호를 바꿔주세요.`;
}
```

```ts
// apps/admin-service/src/manager/manager.service.ts — 로그인 · 아이디 찾기 · 비밀번호 초기화(발송) 앞부분 변경
    /**
     * 매니저 로그인 (내부 HTTP: POST /internal/v1/admin-service/manager/login)
     * - 업체코드로 업체를 찾고(없으면 404 — 업체 존재를 드러내지 않는다) 그 업체 안에서 login_id + 매니저 그룹 + state_id IN (ACTIVE, BLOCK) 조회 → 미존재 404
     * - 비밀번호 불일치 → 동일 404 (아이디/비밀번호 구분 비노출)
     * - BLOCK → 403 + block_comment (비밀번호 검증 후 판정 — 비밀번호 없이 정지 여부 탐지 방지)
     */
    @Transactional()
    async login(dto: ManagerLoginDto, ip: string): Promise<ManagerLoginResultDto> {
        // 1. 업체코드 → 업체
        const store = await this.managerRepository.findManagerStore({store_code: dto.store_code});
        if (!store) {
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }

        // 2. 그 업체의 매니저 조회 (ACTIVE / BLOCK 만)
        const manager = await this.managerRepository.findManager({login_id: dto.login_id, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id, state_id: In(['ACTIVE', 'BLOCK'])});
        if (!manager) {
            throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
        }
        // 3 ~ 8. 비밀번호 · BLOCK · 기기 · 세션 · 토큰 — 그대로 (번호만 하나씩 민다)
    }

    @Transactional()
    async sendFindLoginId(dto: ManagerFindLoginIdDto, ip: string): Promise<ManagerFindLoginIdResultDto> {
        // 1. 업체코드 → 그 업체에서 그 번호가 등록된 매니저 (탈퇴 완료 제외)
        const store = await this.managerRepository.findManagerStore({store_code: dto.store_code});
        const manager = store ? await this.managerRepository.findManager({phone: dto.phone, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id, state_id: In(ACCOUNT_RECOVERY_STATES)}) : null;
        if (!manager) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }
        // 2 ~ 3. 하루 한도 · 기록 · 발송 — 그대로
    }

    @Transactional()
    async sendPasswordReset(dto: ManagerPasswordResetDto, ip: string): Promise<ManagerPasswordResetResultDto> {
        // 1. 업체코드 → 그 업체에서 아이디 + 번호가 같은 매니저
        const store = await this.managerRepository.findManagerStore({store_code: dto.store_code});
        const manager = store
            ? await this.managerRepository.findManager({login_id: dto.login_id, phone: dto.phone, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id, state_id: In(ACCOUNT_RECOVERY_STATES)})
            : null;
        if (!manager) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }
        // 2 ~ 3. 그대로
    }
```

```ts
// apps/admin-service/src/manager/manager.service.ts — 업체 관리자 6 메서드 (import: AUTH_ID · Not · generateTemporaryPassword(이미 있음) · Pagination · manager.constants · manager.util · DTO 6)
    /**
     * 업체 관리자 등록 (업체 총관리자) — 같은 업체 안에서 아이디 · 휴대폰 번호가 겹치면 400, 임시 비밀번호는 업체 관리자 휴대폰으로 SMS(마지막). (RabbitMQ: admin.manager.staff)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param dto 아이디 · 이름 · 휴대폰 번호 · 성별 · 생년월일
     * @returns 등록한 업체 관리자 회원 ID
     */
    @Transactional()
    async registerStaff(user_id: string, dto: ManagerStaffDto): Promise<ManagerStaffResultDto> {
        // 1. 업체 총관리자의 업체 (안내 SMS 에 상호명 · 업체코드)
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        const store = head?.store_id ? await this.managerRepository.findManagerStore({store_id: head.store_id}) : null;
        if (!store) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }

        // 2. 같은 업체 안 아이디 · 휴대폰 번호 (삭제 계정은 마스킹돼 걸리지 않는다)
        if ((await this.managerRepository.countStaff({login_id: dto.login_id, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id})) > 0) {
            throw new BadRequestException({message: STAFF_LOGIN_ID_TAKEN_MESSAGE, validation_errors: createValidationError('login_id', STAFF_LOGIN_ID_TAKEN_MESSAGE)});
        }
        if ((await this.managerRepository.countStaff({phone: dto.phone, login_scope: LOGIN_SCOPE.MANAGER, store_id: store.store_id})) > 0) {
            throw new BadRequestException({message: STAFF_PHONE_TAKEN_MESSAGE, validation_errors: createValidationError('phone', STAFF_PHONE_TAKEN_MESSAGE)});
        }

        // 3. 업체 관리자 계정 — 임시 비밀번호 · 첫 로그인 때 변경
        const temporaryPassword = generateTemporaryPassword();
        const staff = new UserEntity();
        staff.user_id = generateId();
        staff.user_search_code = generateId();
        staff.auth_id = AUTH_ID.MANAGER;
        staff.login_scope = LOGIN_SCOPE.MANAGER;
        staff.state_id = 'ACTIVE';
        staff.sns_id = null;
        staff.sns_user_id = null;
        staff.store_id = store.store_id;
        staff.login_id = dto.login_id;
        staff.login_pw = await getBcrypt(temporaryPassword);
        staff.name = dto.name;
        staff.gender = dto.gender;
        staff.birth = dto.birth;
        staff.phone = dto.phone;
        staff.phone_verified_at = null;
        staff.nickname = dto.name;
        staff.device_os = null;
        staff.device_token = null;
        staff.is_password_change_required = 1;
        staff.block_comment = null;
        staff.leave_comment = null;
        staff.leave_reserved_at = null;
        staff.leave_previous_state_id = null;
        staff.leave_backup = null;
        await this.managerRepository.insertStaff(staff);

        // 4. 안내 SMS (마지막 — 실패 503 이면 등록이 롤백되고 재시도된다)
        await this.smsSender.send({to: dto.phone, text: staffRegisteredText(store.store_name, store.store_code, dto.login_id, temporaryPassword)});
        return {user_id: staff.user_id};
    }

    /**
     * 업체 관리자 목록 (업체 총관리자) — 내 업체의 매니저 그룹(업체 총관리자 포함) · 검색어. (내부 HTTP: GET /internal/v1/admin-service/manager/staff)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param dto 페이지 · 검색어
     * @returns 목록 · 페이지 정보
     */
    async getStaffList(user_id: string, dto: ManagerStaffListDto): Promise<ManagerStaffListResultDto> {
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const where = buildStaffListWhere(head.store_id, dto);
        const total_count = await this.managerRepository.countStaff(where);
        const pagination = new Pagination({...dto, total_count});
        const staff = await this.managerRepository.findStaffList(where, pagination.limit, pagination.offset);
        return {list: staff.map(toStaffListItem), pagination: pagination.getPagination()};
    }

    /**
     * 업체 관리자 상세 (업체 총관리자) — 내 업체의 업체 관리자만. (내부 HTTP: GET /internal/v1/admin-service/manager/staff/:user_id)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     * @returns 상세
     */
    async getStaff(user_id: string, staff_user_id: string): Promise<ManagerStaffDetailResultDto> {
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({user_id: staff_user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.MANAGER, store_id: head.store_id, state_id: In(STAFF_STATES)});
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }
        return toStaffDetail(staff);
    }

    /**
     * 업체 관리자 수정 (업체 총관리자) — 이름(닉네임 같이) · 휴대폰 번호 · 성별 · 생년월일. 같은 업체의 다른 계정과 번호가 겹치면 400. (RabbitMQ: admin.manager.staff-update)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     * @param dto 바꿀 정보
     */
    @Transactional()
    async updateStaff(user_id: string, staff_user_id: string, dto: ManagerStaffUpdateDto): Promise<void> {
        // 1. 내 업체의 업체 관리자
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({user_id: staff_user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.MANAGER, store_id: head.store_id, state_id: In(STAFF_STATES)});
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }

        // 2. 같은 업체의 다른 계정과 번호
        if ((await this.managerRepository.countStaff({phone: dto.phone, login_scope: LOGIN_SCOPE.MANAGER, store_id: head.store_id, user_id: Not(staff.user_id)})) > 0) {
            throw new BadRequestException({message: STAFF_PHONE_TAKEN_MESSAGE, validation_errors: createValidationError('phone', STAFF_PHONE_TAKEN_MESSAGE)});
        }

        // 3. 수정
        const staffEntity = new UserEntity();
        staffEntity.name = dto.name;
        staffEntity.nickname = dto.name;
        staffEntity.phone = dto.phone;
        staffEntity.gender = dto.gender;
        staffEntity.birth = dto.birth;
        await this.managerRepository.updateStaff({user_id: staff.user_id}, staffEntity);
    }

    /**
     * 업체 관리자 비밀번호 초기화 (업체 총관리자) — 임시 비밀번호(영문 + 숫자 10자리) + 변경 필요 표시, 그 휴대폰으로 SMS(마지막). (RabbitMQ: admin.manager.staff-password-reset)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     */
    @Transactional()
    async resetStaffPassword(user_id: string, staff_user_id: string): Promise<void> {
        // 1. 내 업체의 업체 관리자
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({user_id: staff_user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.MANAGER, store_id: head.store_id, state_id: In(STAFF_STATES)});
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }
        if (!staff.phone) {
            throw new BadRequestException({message: '휴대폰 번호가 등록되지 않은 계정입니다.'});
        }

        // 2. 임시 비밀번호 → SMS (마지막)
        const temporaryPassword = generateTemporaryPassword();
        const staffEntity = new UserEntity();
        staffEntity.login_pw = await getBcrypt(temporaryPassword);
        staffEntity.is_password_change_required = 1;
        await this.managerRepository.updateManager({user_id: staff.user_id}, staffEntity);
        await this.smsSender.send({to: staff.phone, text: temporaryPasswordText(temporaryPassword)});
    }

    /**
     * 업체 관리자 정지 · 해제 (업체 총관리자) — ACTIVE ↔ BLOCK, 같은 상태면 400. 정지는 로그인 불가 상태라 다음 요청부터 401 · 재발급도 막힌다. 정지 사유는 정지할 때만 남기고 해제하면 지운다. (RabbitMQ: admin.manager.staff-state)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     * @param dto 바꿀 상태 · 정지 사유
     */
    @Transactional()
    async changeStaffState(user_id: string, staff_user_id: string, dto: ManagerStaffStateDto): Promise<void> {
        // 1. 내 업체의 업체 관리자
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({user_id: staff_user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.MANAGER, store_id: head.store_id, state_id: In(STAFF_STATES)});
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }
        if (staff.state_id === dto.state_id) {
            throw new BadRequestException({message: '이미 같은 상태입니다.'});
        }

        // 2. 상태 · 정지 사유
        const staffEntity = new UserEntity();
        staffEntity.state_id = dto.state_id;
        staffEntity.block_comment = dto.state_id === 'BLOCK' ? (dto.block_comment ?? null) : null;
        await this.managerRepository.updateManager({user_id: staff.user_id}, staffEntity);
    }

    /**
     * 업체 관리자 삭제 (업체 총관리자) — 탈퇴(LEAVE) + 원본 백업, 아이디 DEL_<user_id> · 휴대폰 번호 NULL 로 마스킹해 같은 아이디 · 번호로 다시 등록할 수 있게 한다. (RabbitMQ: admin.manager.staff-delete)
     *
     * @param user_id 로그인한 업체 총관리자 ID
     * @param staff_user_id 업체 관리자 회원 ID
     */
    @Transactional()
    async deleteStaff(user_id: string, staff_user_id: string): Promise<void> {
        const head = await this.managerRepository.findManager({user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.HEAD_MANAGER});
        if (!head?.store_id) {
            throw new NotFoundException({message: MANAGER_STORE_NOT_FOUND_MESSAGE});
        }
        const staff = await this.managerRepository.findManager({user_id: staff_user_id, login_scope: LOGIN_SCOPE.MANAGER, auth_id: AUTH_ID.MANAGER, store_id: head.store_id, state_id: In(STAFF_STATES)});
        if (!staff) {
            throw new NotFoundException({message: STAFF_NOT_FOUND_MESSAGE});
        }
        const staffEntity = new UserEntity();
        staffEntity.state_id = 'LEAVE';
        staffEntity.leave_backup = JSON.stringify(staff); // 마스킹 전 원본(반드시 마스킹 할당보다 먼저)
        staffEntity.login_id = `DEL_${staff.user_id}`;
        staffEntity.phone = null;
        staffEntity.device_os = null;
        staffEntity.device_token = null;
        await this.managerRepository.updateStaff({user_id: staff.user_id}, staffEntity);
    }
```

### Business Logic — store 보정

```ts
// apps/admin-service/src/store/store.constants.ts — 삭제: STORE_APPLICATION_VISIBLE_STATES · HEAD_MANAGER_LOGIN_ID_ATTEMPTS · HEAD_MANAGER_PHONE_TAKEN_MESSAGE. 주석 변경:
/** 입점 신청 없음 — 남의 신청 포함(존재를 드러내지 않는다) */
export const STORE_APPLICATION_NOT_FOUND_MESSAGE = '입점 신청을 찾을 수 없습니다.';
```

```ts
// apps/admin-service/src/store/store.util.ts — 변경 부분 (randomInt · toContainsPattern · generateHeadManagerLoginId 삭제, toContainsPattern 은 @app/common/utils/search.js 에서 import)
/**
 * 입점 승인 안내 SMS 본문 — 아이디 · 비밀번호는 신청자가 정했고 업체코드는 내 신청에서 보인다.
 *
 * @param store_name 상호명
 * @returns 본문
 */
export function storeApprovedText(store_name: string): string {
    return `[roomless] ${store_name} 입점이 승인되었습니다.`;
}

/**
 * 내 입점 신청 목록 항목
 *
 * @param entity 입점 신청
 * @param store_code 승인 신청이면 그 업체의 코드, 아니면 null
 * @returns 목록 항목
 */
export function toMyApplicationItem(entity: StoreApplicationEntity, store_code: string | null): StoreMyApplicationItemResultDto {
    return {
        store_application_id: entity.store_application_id,
        store_application_state_id: entity.store_application_state_id,
        store_name: entity.store_name,
        business_number: entity.business_number,
        reject_comment: entity.reject_comment ?? null,
        reviewed_at: entity.reviewed_at ? entity.reviewed_at.toISOString() : null,
        created_at: entity.created_at.toISOString(),
        store_code,
    };
}

// toMyApplicationDetail(entity, store_code, files) — owner_phone 뒤 head_manager_login_id: entity.head_manager_login_id, created_at 뒤 store_code
// toApplicationDetail(entity, store_code, applicant, files) — store_id 뒤 store_code, owner_phone 뒤 head_manager_login_id: entity.head_manager_login_id
// toStoreListItem · toStoreDetail — store_id 뒤 store_code: entity.store_code
```

```ts
// apps/admin-service/src/store/store.service.ts — 변경 부분
    @Transactional()
    async apply(user_id: string, dto: StoreApplicationDto): Promise<StoreApplicationResultDto> {
        // 1 ~ 2. 그대로
        // 3. 신청 등록 (대기) — 업체 총관리자 비밀번호는 해시로만 둔다
        const application = new StoreApplicationEntity();
        // … 기존 할당
        application.owner_phone = dto.owner_phone;
        application.head_manager_login_id = dto.head_manager_login_id;
        application.head_manager_login_pw = await getBcrypt(dto.head_manager_login_pw);
        // …
    }

    /**
     * 내 입점 신청 목록 — 대기 · 반려 · 승인 모두, 승인 신청은 업체코드 포함. (내부 HTTP: GET /internal/v1/admin-service/store/application/mine)
     */
    async getMyApplicationList(user_id: string, dto: StoreMyApplicationListDto): Promise<StoreMyApplicationListResultDto> {
        const where: FindOptionsWhere<StoreApplicationEntity> = {user_id};
        const total_count = await this.storeRepository.countApplications(where);
        const pagination = new Pagination({...dto, total_count});
        const applications = await this.storeRepository.findApplicationList(where, pagination.limit, pagination.offset);
        const storeIds = applications.flatMap((application) => (application.store_id ? [application.store_id] : []));
        const stores = storeIds.length > 0 ? await this.storeRepository.findStores({store_id: In(storeIds)}) : [];
        const codes = new Map(stores.map((store) => [store.store_id, store.store_code]));
        return {
            list: applications.map((application) => toMyApplicationItem(application, application.store_id ? (codes.get(application.store_id) ?? null) : null)),
            pagination: pagination.getPagination(),
        };
    }

    /**
     * 내 입점 신청 상세 — 모든 상태, 승인 신청은 업체코드 포함. 남의 신청은 404. (내부 HTTP: GET /internal/v1/admin-service/store/application/mine/:store_application_id)
     */
    async getMyApplication(user_id: string, store_application_id: string): Promise<StoreMyApplicationResultDto> {
        const application = await this.storeRepository.findApplication({store_application_id, user_id});
        if (!application) {
            throw new NotFoundException({message: STORE_APPLICATION_NOT_FOUND_MESSAGE});
        }
        const store = application.store_id ? await this.storeRepository.findStore({store_id: application.store_id}) : null;
        const rows = await this.storeRepository.findApplicationFileRows(store_application_id);
        // … 파일 열람 주소 그대로
        return toMyApplicationDetail(application, store?.store_code ?? null, files);
    }

    // createMyApplicationFileUploadUrl · addMyApplicationFile · removeMyApplicationFile · cancelMyApplication — 첫 조회만 바뀐다(대기 확인은 그대로)
        const application = await this.storeRepository.findApplication({store_application_id, user_id});

    // getApplication (총관리자) — 업체코드
        const store = application.store_id ? await this.storeRepository.findStore({store_id: application.store_id}) : null;
        // …
        return toApplicationDetail(application, store?.store_code ?? null, toApplicant(applicant), files);

    /**
     * 입점 승인 (총관리자) — 업체 등록(활성 · 영업준비 · 업체코드) + 신청의 업체 정보 파일을 업체로 + 업체 총관리자 계정(신청 때 정한 아이디 · 비밀번호) + 승인 알림 SMS(대표자 번호, 마지막). (RabbitMQ: admin.store.application-approve)
     * - 대기 중 신청만, 사업자등록증 1장 필수, 신청자 계정이 있어야 한다(성별 · 생년월일 복사)
     * - 사업자번호 UK 충돌은 repository 가 400 — 트랜잭션 전체가 롤백된다
     * - 신청 상태는 대기 조건으로 바꾼다 — 그 사이 취소 · 반려됐으면 0건이라 400(롤백, SMS 없음)
     *
     * @param store_application_id 입점 신청 ID
     * @returns 등록한 업체 ID · 업체코드
     */
    @Transactional()
    async approveApplication(store_application_id: string): Promise<StoreApplicationApproveResultDto> {
        // 1 ~ 3. 그대로 (대기 · 사업자등록증 · 신청자)

        // 4. 업체 등록 — 활성 + 영업준비(is_open = 0) + 업체코드
        const store_id = generateId();
        const store_code = generateId();
        const store = new StoreEntity();
        store.store_id = store_id;
        store.store_code = store_code;
        // … 기존 할당
        await this.storeRepository.insertStore(store);

        // 5. 신청의 업체 정보 파일을 업체로 — 그대로
        await this.storeRepository.assignStoreFiles(store_application_id, store_id);

        // 6. 업체 총관리자 계정(= 대표자) — 신청 때 정한 아이디 · 비밀번호(이미 해시), 이름 · 닉네임 대표자명, 휴대폰 대표자 번호
        const manager = new UserEntity();
        manager.user_id = generateId();
        manager.user_search_code = generateId();
        manager.auth_id = AUTH_ID.HEAD_MANAGER;
        manager.login_scope = LOGIN_SCOPE.MANAGER;
        manager.state_id = 'ACTIVE';
        manager.sns_id = null;
        manager.sns_user_id = null;
        manager.store_id = store_id;
        manager.login_id = application.head_manager_login_id;
        manager.login_pw = application.head_manager_login_pw;
        manager.name = application.owner_name;
        manager.gender = applicant.gender;
        manager.birth = applicant.birth;
        manager.phone = application.owner_phone;
        manager.phone_verified_at = null;
        manager.nickname = application.owner_name;
        manager.device_os = null;
        manager.device_token = null;
        manager.is_password_change_required = 0;
        manager.block_comment = null;
        manager.leave_comment = null;
        manager.leave_reserved_at = null;
        manager.leave_previous_state_id = null;
        manager.leave_backup = null;
        await this.storeRepository.insertHeadManager(manager);

        // 7. 신청 승인 (대기 조건) — 그대로

        // 8. 승인 알림 SMS (마지막 — 실패 503 이면 위 쓰기가 모두 롤백되고 재시도된다)
        await this.smsSender.send({to: application.owner_phone, text: storeApprovedText(application.store_name)});
        return {store_id, store_code};
    }
```

### Entry Point — admin-service 매니저 controllers

```ts
// apps/admin-service/src/manager/controllers/manager.controller.ts — 추가 (Query · InternalActor import)
    /**
     * 업체 관리자 목록 (업체 총관리자)
     */
    @Get('/staff')
    @HttpCode(200)
    async getStaffList(@InternalActor('user_id') user_id: string, @Query() query: ManagerStaffListDto): Promise<ManagerStaffListResultDto> {
        const dto = new ManagerStaffListDto(query);
        return this.managerService.getStaffList(user_id, dto);
    }

    /**
     * 업체 관리자 상세 (업체 총관리자)
     */
    @Get('/staff/:user_id')
    @HttpCode(200)
    async getStaff(@InternalActor('user_id') user_id: string, @Param() param: ManagerStaffDetailParamDto): Promise<ManagerStaffDetailResultDto> {
        return this.managerService.getStaff(user_id, param.user_id);
    }
```

```ts
// apps/admin-service/src/manager/controllers/manager.controller.queue.ts — 추가
    /**
     * 업체 관리자 등록 — 업체 총관리자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 업체 관리자 회원 ID
     */
    @OnCommand(MANAGER_COMMAND.STAFF)
    async registerStaff(command: MessageEnvelope<ManagerStaffDto>): Promise<ManagerStaffResultDto> {
        return this.managerService.registerStaff(requireActor(command).user_id, command.payload);
    }

    /**
     * 업체 관리자 수정 — 업체 총관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(MANAGER_COMMAND.STAFF_UPDATE)
    async updateStaff(command: MessageEnvelope<ManagerStaffUpdateParamDto & ManagerStaffUpdateDto>): Promise<void> {
        return this.managerService.updateStaff(requireActor(command).user_id, command.payload.user_id, command.payload);
    }

    /**
     * 업체 관리자 비밀번호 초기화 — 업체 총관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(MANAGER_COMMAND.STAFF_PASSWORD_RESET)
    async resetStaffPassword(command: MessageEnvelope<ManagerStaffPasswordResetParamDto>): Promise<void> {
        return this.managerService.resetStaffPassword(requireActor(command).user_id, command.payload.user_id);
    }

    /**
     * 업체 관리자 정지 · 해제 — 업체 총관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     */
    @OnCommand(MANAGER_COMMAND.STAFF_STATE)
    async changeStaffState(command: MessageEnvelope<ManagerStaffStateParamDto & ManagerStaffStateDto>): Promise<void> {
        return this.managerService.changeStaffState(requireActor(command).user_id, command.payload.user_id, command.payload);
    }

    /**
     * 업체 관리자 삭제 — 업체 총관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(MANAGER_COMMAND.STAFF_DELETE)
    async deleteStaff(command: MessageEnvelope<ManagerStaffDeleteParamDto>): Promise<void> {
        return this.managerService.deleteStaff(requireActor(command).user_id, command.payload.user_id);
    }
```

### Entry Point — 게이트웨이 라우트

```ts
// apps/gateway/src/api/v1/admin-service/manager/controllers/manager.controller.ts — 추가 (Get · Param · Query · UseGuards · ApiBearerAuth import, RolesGuard · Roles · AUTH_ID · PassportActor · PassportJwtManagerAuthGuard)
    /**
     * 업체 관리자 목록 — 업체 총관리자만(업체 관리자 토큰은 403). 내 업체의 업체 총관리자 · 업체 관리자.
     */
    @Get('/staff')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 목록'})
    @ApiOkResponse({type: ManagerStaffListResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStaffList(@PassportActor() actor: Actor, @Query() query: ManagerStaffListDto): Promise<ManagerStaffListResultDto> {
        const dto = new ManagerStaffListDto(query);
        return this.internalHttp.request<ManagerStaffListResultDto>('admin', 'GET', MANAGER_INTERNAL_PATH.STAFF_LIST, {actor, query: dto});
    }

    /**
     * 업체 관리자 상세 — 업체 총관리자만. 내 업체의 업체 관리자가 아니면 404.
     */
    @Get('/staff/:user_id')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @HttpCode(200)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 상세'})
    @ApiOkResponse({type: ManagerStaffDetailResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async getStaff(@PassportActor() actor: Actor, @Param() param: ManagerStaffDetailParamDto): Promise<ManagerStaffDetailResultDto> {
        return this.internalHttp.request<ManagerStaffDetailResultDto>('admin', 'GET', MANAGER_INTERNAL_PATH.staff(param.user_id), {actor});
    }
```

```ts
// apps/gateway/src/api/v1/admin-service/manager/controllers/manager.controller.queue.ts — 추가 (Delete · Param import, RolesGuard · Roles · AUTH_ID, ApiForbiddenResponse · ApiOkResponse)
    /**
     * 업체 관리자 등록 — 업체 총관리자만. 임시 비밀번호는 업체 관리자 휴대폰으로 SMS. done 의 data 는 회원 ID.
     */
    @Post('/staff')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 등록'})
    @ApiBody({type: ManagerStaffDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: ManagerStaffResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async registerStaff(@PassportActor() actor: Actor, @Body() dto: ManagerStaffDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF, actor, payload: dto, client_ip: ip});
    }

    /**
     * 업체 관리자 수정 — 업체 총관리자만. done 의 data 는 null.
     */
    @Patch('/staff/:user_id')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 수정'})
    @ApiBody({type: ManagerStaffUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateStaff(@PassportActor() actor: Actor, @Param() param: ManagerStaffUpdateParamDto, @Body() dto: ManagerStaffUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF_UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 관리자 비밀번호 초기화 — 업체 총관리자만. 임시 비밀번호는 업체 관리자 휴대폰으로 SMS. done 의 data 는 null.
     */
    @Patch('/staff/:user_id/password-reset')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 비밀번호 초기화'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async resetStaffPassword(@PassportActor() actor: Actor, @Param() param: ManagerStaffPasswordResetParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF_PASSWORD_RESET, actor, payload: param, client_ip: ip});
    }

    /**
     * 업체 관리자 정지 · 해제 — 업체 총관리자만. 정지하면 다음 요청부터 로그인 · 재발급이 막힌다. done 의 data 는 null.
     */
    @Patch('/staff/:user_id/state')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 정지 · 해제'})
    @ApiBody({type: ManagerStaffStateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeStaffState(@PassportActor() actor: Actor, @Param() param: ManagerStaffStateParamDto, @Body() dto: ManagerStaffStateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF_STATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 관리자 삭제 — 업체 총관리자만. 같은 아이디 · 번호로 다시 등록할 수 있다. done 의 data 는 null.
     */
    @Delete('/staff/:user_id')
    @UseGuards(PassportJwtManagerAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 관리자 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async deleteStaff(@PassportActor() actor: Actor, @Param() param: ManagerStaffDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.STAFF_DELETE, actor, payload: param, client_ip: ip});
    }
```

```ts
// apps/gateway/src/api/v1/admin-service/manager/manager.module.ts — JSDoc 만
/**
 * 게이트웨이 매니저 그룹(총매니저 · 매니저) 라우트 — `/api/v1/admin-service/manager`. 전달 수단(TransportModule)은 전역이다.
 * - ManagerController(controllers/manager.controller.ts): 동기 경로 — 로그인 · 토큰 재발급 · 업체 관리자 목록 · 상세
 * - ManagerQueueController(controllers/manager.controller.queue.ts): 큐 경로 — 비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화 · 업체 관리자 등록 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제
 * 업체 관리자 라우트는 매니저 가드 + RolesGuard · @Roles(HEAD_MANAGER) — 업체 총관리자만.
 */
```

### 규약 문서 · README

- `AGENTS.md`
  - Data Layer: "nullable 컬럼에 따라 갈리는 유일성(업체 소속 매니저 · 업체 없는 계정)은 부분 유니크 인덱스 `@Index('UK_…', [...], {unique: true, where})` — 이름은 UK_ 접두, `isUniqueViolation` 은 인덱스 이름으로 같다(`UK_User_LoginIdLoginScopeStoreId`)".
  - Auth: 그룹 표의 매니저 로그인에 "업체코드(`store_code`) + 아이디 · 비밀번호, 아이디 · 휴대폰 UK 는 업체 단위", `login_scope` 줄의 "아이디 · 휴대폰 번호 UK 도 그룹 단위다" → "업체 없는 계정은 그룹 단위, 매니저 그룹은 업체 단위".
  - Auth "미적용 규약" 에서 RolesGuard 를 빼고 적용(매니저 인력 라우트)으로. `@PassportUser` 만 미적용으로 남긴다.
  - 공통 로직 분리: 전역 util 목록에 `search`.
  - Testing Smoke 목록에 `manager.repository.spec.ts` `buildStaffListQuery`.
- `docs/data-layer.md` 제약명 항목(부분 유니크 인덱스) · Pagination 적용 목록(`getStaffList`) · 마이그레이션 예(제약 → 부분 인덱스, 기존 행 채움 `gen_random_uuid`).
- `docs/conventions.md` 검색어 util 위치(`libs/common/src/utils/search.ts`).
- `docs/api.md` 그룹 안 권한 — 사례(`/api/v1/admin-service/manager/staff`)로 바꾼다(동기 · 큐 데코레이터 순서 실측).
- `docs/architecture.md` 경로 표에 매니저 인력 라우트.
- `docs/testing.md` Smoke 목록.
- `README.md`: admin-service 매니저 설명 — 로그인 · 아이디 찾기 · 비밀번호 초기화에 업체코드, 업체 총관리자의 업체 관리자 관리. 업체: 신청 때 업체 총관리자 아이디 · 비밀번호, 승인 신청 · 업체코드는 내 신청에서.

---

## Test Cases

spec 두 종류만 둔다(docs/testing.md). service 기능 spec 은 API 1개당 1개(repository · `SMS_SENDER` · `JwtService` mock), repository spec 은 오류 변환 · Smoke.

도우미 변경
- `manager.test-helper.ts`: mock 에 `findManagerStore` · `countStaff` · `findStaffList` · `insertStaff` · `updateStaff`, `internalHeaders(clientIp, actor?)`(actor 헤더), 상수 `STORE_ID` · `STORE_CODE` · `HEAD_ACTOR` · `STAFF_ID`, 행 `headManagerRow` · `staffRow` · `storeRow`.
- `store.test-helper.ts`: mock 에서 `countManagers` 삭제 · `findStores` 추가, `applicationRow` 에 `head_manager_login_id` · `head_manager_login_pw`, `storeRow` 에 `store_code`.

```
[SUCCESS]  manager-staff.spec.ts — 업체 총관리자 → findManagerStore({store_id}) → countStaff 아이디 · 번호(그 업체) 0 → insertStaff 1회(UserEntity: MANAGER · MANAGER 그룹 · store_id · login_id · nickname = name · login_pw bcrypt · is_password_change_required 1 · ACTIVE) → sms.send({to: phone, text: staffRegisteredText(상호명, 업체코드, 아이디, 임시 비밀번호)}) 마지막, done {user_id}
[FAIL:duplicate]  manager-staff — 같은 업체 아이디 → 400 validation_errors.login_id / 번호 → 400 validation_errors.phone — insertStaff · sms 미호출
[FAIL:service]  manager-staff — 업체 총관리자 업체 없음 → 404 '소속 업체를 찾을 수 없습니다.' / insertStaff 400(UK 경쟁) → failed 400, sms 미호출
[FAIL:infra]  manager-staff — sms 503 → requeue
[SECURITY]  manager-staff — actor 없음 → 401, findManager 미호출

[SUCCESS]  manager-staff-list.spec.ts — 헤더 actor(업체 총관리자) → countStaff · findStaffList 의 where [{login_scope: MANAGER, store_id, state_id: In[ACTIVE, BLOCK]}] · 기본 페이지(20, 0), 항목 필드 · phone null
[SUCCESS]  manager-staff-list — keyword → where 3개 OR(login_id · name · phone ILike, 이스케이프)
[FAIL:validation]  manager-staff-list — keyword 101자 → 400 validation_errors.keyword
[FAIL:service]  manager-staff-list — 업체 총관리자가 아니거나 업체 없음 → 404, countStaff 미호출

[SUCCESS]  manager-staff-detail.spec.ts — findManager({user_id: 대상, MANAGER 그룹, auth_id MANAGER, store_id: 내 업체, state_id In[ACTIVE, BLOCK]}) → 상세(gender · birth · updated_at)
[FAIL:service]  manager-staff-detail — 대상 없음(다른 업체 · 업체 총관리자 자신 · 삭제) → 404 '업체 관리자를 찾을 수 없습니다.'
[FAIL:validation]  manager-staff-detail — user_id 'abc' → 400

[SUCCESS]  manager-staff-update.spec.ts — 대상 → countStaff({phone, 그 업체, user_id: Not(대상)}) 0 → updateStaff({user_id}, UserEntity: name · nickname = name · phone · gender · birth), done null
[FAIL:duplicate]  manager-staff-update — 다른 계정과 번호 → 400 validation_errors.phone, updateStaff 미호출
[FAIL:service]  manager-staff-update — 대상 없음 → 404 / updateStaff 400(UK 경쟁) → failed 400

[SUCCESS]  manager-staff-password-reset.spec.ts — 대상 → updateManager({user_id}, login_pw = bcrypt · is_password_change_required 1) → sms.send({to: 대상 phone, text: temporaryPasswordText(임시)}) 마지막
[FAIL:service]  manager-staff-password-reset — 대상 없음 → 404, updateManager · sms 미호출 / 번호 없는 계정 → 400
[FAIL:infra]  manager-staff-password-reset — sms 503 → requeue

[SUCCESS]  manager-staff-state.spec.ts — ACTIVE 대상 + BLOCK · 사유 → updateManager({user_id}, state_id BLOCK · block_comment 사유) / BLOCK 대상 + ACTIVE → state_id ACTIVE · block_comment null / 사유 없이 정지 → block_comment null
[FAIL:service]  manager-staff-state — 같은 상태 → 400 '이미 같은 상태입니다.' / 대상 없음(다른 업체 · 자신 · 삭제) → 404 — updateManager 미호출
[SECURITY]  manager-staff-state — actor 없음 → 401, findManager 미호출

[SUCCESS]  manager-staff-delete.spec.ts — 대상 → updateStaff({user_id}, state_id LEAVE · leave_backup = 원본 JSON(원래 login_id · phone 포함) · login_id 'DEL_<user_id>' · phone null · device null)
[FAIL:service]  manager-staff-delete — 대상 없음 → 404, updateStaff 미호출

[SUCCESS]  manager-login.spec.ts — 업체코드 → findManagerStore({store_code}) → findManager({login_id, MANAGER, store_id, state In[ACTIVE, BLOCK]}) (기존 성공 단언에 store_id)
[FAIL:service]  manager-login — 업체코드 없음 → 404 INVALID_LOGIN, findManager 미호출
[FAIL:validation]  manager-login — store_code 'xyz' → 400 validation_errors.store_code
[SUCCESS]  manager-find-login-id.spec.ts · manager-password-reset.spec.ts — findManager where 에 store_id, 업체코드 없음 → 404 + findManager · sms 미호출

[SUCCESS]  store-apply.spec.ts — 신청 엔티티 head_manager_login_id · head_manager_login_pw = getBcrypt(평문) 결과
[SUCCESS]  store-my-application-list.spec.ts — where {user_id}(모든 상태), 승인 행만 findStores({store_id: In[...]}) → 항목 store_code(승인 = 코드, 대기 · 반려 = null) / 승인 행 없으면 findStores 미호출
[SUCCESS]  store-my-application.spec.ts — where {store_application_id, user_id}, 승인 신청 → findStore → store_code · head_manager_login_id / 대기 → store_code null, findStore 미호출
[FAIL:service]  store-application-file-upload-url · store-application-file · store-application-file-delete · store-application-cancel — 승인 신청 → 400(대기 아님), 남의 신청 → 404
[SUCCESS]  store-application-approve.spec.ts — insertStore 의 store_code 32자, insertHeadManager(login_id = head_manager_login_id · login_pw = 신청 해시 그대로 · is_password_change_required 0), countManagers · getBcrypt 미사용, sms text = storeApprovedText(상호명), done {store_id, store_code}
[SUCCESS]  store-application-detail.spec.ts — 승인 신청 → store_code · head_manager_login_id
[SUCCESS]  store-list.spec.ts · store-detail.spec.ts — 항목 · 상세에 store_code

[FAIL:repository]  manager.repository.spec.ts — insertStaff: UK_User_LoginIdLoginScopeStoreId → 400 아이디 문구 · UK_User_PhoneLoginScopeStoreId → 400 번호 문구 · 그 밖 → 500 / updateStaff: UK_User_PhoneLoginScopeStoreId → 400
[FAIL:repository]  manager.repository — findManagerStore · countStaff · insertStaff · updateStaff 실패 → 통일 500 (it.each 에 추가)
[SMOKE:data-access]  manager.repository — buildStaffListQuery(buildStaffListWhere('s1', {keyword: 'a_b'}), 20, 0): SQL 전체 고정(login_scope · store_id · state_id IN · ILike OR 3개 · ORDER BY auth_id ASC, created_at DESC · LIMIT/OFFSET), 파라미터 '%a\\_b%'
[FAIL:repository]  store.repository.spec.ts — insertHeadManager 실패는 제약 무관 통일 500(UK 케이스 삭제), countManagers 케이스 삭제, findStores 실패 500 · 조건(store_id In)

테스트 생략(위임형):
  게이트웨이 라우트 · RolesGuard 연결 · DTO 클래스 · 모듈 — controller · 인프라 spec 은 두지 않는다(docs/testing.md). RolesGuard 403 은 게이트웨이를 실제로 부를 때 확인한다.
  manager.util 변환 · 문구 · libs/common search util — util 단위 spec 은 두지 않는다. service spec 이 where · 결과 필드 · SMS 본문을 단언한다.
  마이그레이션 — db:check · PGlite up/down 으로 확인한다(테스트 밖).
```

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | 동기 조회 성공 — 업체 관리자 목록 · 상세, 매니저 로그인 |
| SSE `done` | 큐 명령 성공 — 업체 관리자 등록 `{user_id}` · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제 null, 입점 승인 `{store_id, store_code}` |
| 400 | 입력 검증(`validation_errors` — store_code · login_id · phone · state_id · head_manager_login_*), 같은 업체 아이디 · 번호(`validation_errors.login_id` · `phone`), UK 경쟁, 번호 없는 계정, 같은 상태로 정지 · 해제, 대기 아닌 신청(승인 신청 포함) |
| 401 | 토큰 없음 · 다른 그룹 토큰, 큐 명령 actor 없음 |
| 403 | 업체 관리자(MANAGER) 토큰으로 업체 관리자 라우트(RolesGuard) · 매니저 BLOCK 로그인 |
| 404 | 업체코드 없음(로그인 · 아이디 찾기 · 비밀번호 초기화 — 계정 없음과 같은 문구), 업체 관리자 없음(다른 업체 · 자신 · 삭제), 소속 업체 없음, 남의 신청 |
| 500 | DB 실패(통일 문구) |
| 503 | SMS(등록 · 비밀번호 초기화 · 승인) · 브로커 · admin-service 접속 실패 — 큐 경로는 재시도 |
