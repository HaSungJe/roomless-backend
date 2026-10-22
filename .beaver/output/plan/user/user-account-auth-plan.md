# Plan — user-account-auth

## Feature Summary
- **Feature**: 계정·인증 — 로그인 그룹 3개(이용자 · 매니저 · 관리자) 분리, 그룹별 아이디 · 번호 UK, 매니저 아이디 찾기 · 비밀번호 초기화(이용자 미러), 성인 기준(청소년보호법) · 일반 가입 폐지, 업체 상세 JSON
- **Entry point**: `POST · PATCH (게이트웨이 동기 · 큐) — 이용자 /api/v1/user/*, 관리자 /api/v1/admin/*, 매니저 /api/v1/manager/*` — `/api/v1/user/login · /api/v1/admin/login · /api/v1/manager/login · /token-refresh(그룹별) · /password(관리자 · 매니저) · /api/v1/manager/find-login-id · /password-reset`
- **Domain**: user (로드맵 Phase 6 — #24 · #25 + 새 #92 · #93)
- **Spec**: [user-account-auth-spec.md](../../spec/user/user-account-auth-spec.md)

---

## File List

| File | Action |
|------|------|
| `libs/contracts/src/user/user.roles.ts` | new — `AUTH_ID` · `LOGIN_SCOPE` · `LoginScope` |
| `libs/contracts/src/user/user.commands.ts` | modified — `GENERAL_SIGN` 제거, `PASSWORD_RESET(_CONFIRM)` → `MANAGER_PASSWORD_RESET(_CONFIRM)`(`user.manager.*`), `MANAGER_FIND_LOGIN_ID(_CONFIRM)` 추가, 내부 경로 `GENERAL_LOGIN` 제거 · 매니저 · 관리자 로그인 · 재발급 추가 |
| `libs/contracts/src/user/dto/user-general-login.dto.ts` | modified — 결과에 `auth_id` · `store_id` |
| `libs/contracts/src/user/dto/user-general-sign.dto.ts` | deleted — 일반 가입 폐지 |
| `libs/database/src/entities/user/user.entity.ts` | modified — `login_scope` 컬럼, UK `(login_id, login_scope)` · `(phone, login_scope)` (#92) |
| `libs/database/src/entities/store/store.entity.ts` | modified — `store_detail`(jsonb) · `StoreDetail` 타입 (#93) |
| `libs/database/src/migrations/<ts>-LoginScopeStoreDetail.ts` · `migrations.ts` | new · modified — `db:generate` 결과에 `login_scope` 채우기(권한 → 그룹)를 손으로 더한다 |
| `libs/database/src/seeder/seeder.targets.ts` | modified — 첫 총관리자 `login_scope = 'ADMIN'` |
| `libs/database/src/test/seeder.spec.ts` | modified — 총관리자 시드 `login_scope` |
| `apps/user-service/src/user/user.constants.ts` | modified — `ADULT_AGE = 19`, `UNDERAGE_MESSAGE` 주석 |
| `apps/user-service/src/user/user.util.ts` | modified — `isAdult(birth, now)` 청소년보호법 기준 |
| `apps/user-service/src/user/user.service.ts` | modified — `generalSign` 제거, `sign` 에 `login_scope`, `login` · `generalLogin(…, login_scope)` · `tokenRefresh(…, login_scope)` · 휴대폰 인증 · 찾기 · 초기화의 그룹 조건 |
| `apps/user-service/src/user/controllers/user.controller.ts` | modified — 일반 로그인 제거, 매니저 · 관리자 로그인 · 재발급 4개 |
| `apps/user-service/src/user/controllers/user.controller.queue.ts` | modified — 일반 가입 제거, 매니저 아이디 찾기 2개, 비밀번호 초기화 명령 이름 |
| `apps/user-service/src/user/repositories/user.repository.ts` | modified — UK 분기 이름(`UK_User_LoginIdLoginScope` · `UK_User_PhoneLoginScope`) |
| `apps/user-service/src/user/test/*.spec.ts` | modified · deleted — 아래 Test Cases (`user-general-sign.spec.ts` 삭제, `user-general-login.spec.ts` → 매니저 · 관리자 로그인) |
| `apps/gateway/src/api/v1/user/controllers/user.controller.ts` | modified — `/general-login` 제거 |
| `apps/gateway/src/api/v1/user/controllers/user.controller.queue.ts` | modified — `/general-sign` · `/password` · `/password-reset(+confirm)` 제거, 탈퇴 · 철회 · 휴대폰 인증에 `RolesGuard` + `@Roles(USER)` |
| `apps/gateway/src/api/v1/admin/admin.module.ts` · `controllers/admin.controller.ts` · `controllers/admin.controller.queue.ts` | new — 관리자 그룹 로그인 · 재발급 · 비밀번호 변경 |
| `apps/gateway/src/api/v1/manager/manager.module.ts` · `controllers/manager.controller.ts` · `controllers/manager.controller.queue.ts` | new — 매니저 그룹 로그인 · 재발급 · 비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화 |
| `apps/gateway/src/gateway.module.ts` | modified — `AdminModule` · `ManagerModule` |
| `apps/gateway/src/api/v1/{user,admin,manager}/test/*.spec.ts` | modified · new — 라우트 · 권한 · 없어진 라우트 404 |
| `README.md` · `AGENTS.md` · `docs/{api,architecture,conventions,data-layer,testing}.md` | modified — 로그인 그룹 · 라우트 접두 · RolesGuard 적용 · service 예외(로그인 그룹 인자) · 성인 기준 · 일반 가입 폐지 · `store_detail` |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified — Phase 6 유닛 문구 · #92 · #93 · 결정 · 규칙 |

정리할 기존 코드(§1.7)
- 일반 가입 전체: `generalSign` · DTO · 명령 · 게이트웨이 라우트 · spec
- 이용자 일반 로그인: 내부 · 공개 라우트
- 이용자 비밀번호 변경 · 초기화 라우트(공개)
- `sendPasswordReset` 의 SNS 분기 — 매니저 그룹만 받아 죽은 코드
- `isAdult` 의 dayjs 만 나이 계산
- `UK_User_LoginId` · `UK_User_Phone`

---

## Design

### Input/Validation — 권한 · 그룹 상수 · DTO

```typescript
// libs/contracts/src/user/user.roles.ts — 새 파일
/**
 * 회원 권한(t_auth PK) — 게이트웨이 `@Roles(...)` 와 user-service 가 같은 값을 쓴다.
 */
export const AUTH_ID = {SUPER_ADMIN: 'SUPER_ADMIN', ADMIN: 'ADMIN', HEAD_MANAGER: 'HEAD_MANAGER', MANAGER: 'MANAGER', USER: 'USER'} as const;

/**
 * 로그인 그룹(t_user.login_scope) — 그룹마다 로그인 API 가 따로이고, 아이디 · 휴대폰 번호 UK 도 그룹 단위다.
 * USER = 이용자, MANAGER = 총매니저 · 매니저, ADMIN = 총관리자 · 관리자
 */
export const LOGIN_SCOPE = {USER: 'USER', MANAGER: 'MANAGER', ADMIN: 'ADMIN'} as const;

/** 로그인 그룹 값 */
export type LoginScope = (typeof LOGIN_SCOPE)[keyof typeof LOGIN_SCOPE];
```

```typescript
// libs/contracts/src/user/user.commands.ts — 변경부
export const USER_COMMAND = {
    /** SNS 회원가입 (이용자는 SNS 가입만) */
    SIGN: 'user.member.sign',
    /** 회원 탈퇴 신청 */
    LEAVE: 'user.member.leave',
    /** 회원 탈퇴 철회 */
    LEAVE_CANCEL: 'user.member.leave-cancel',
    /** 비밀번호 변경 — 관리자 · 매니저(이용자는 비밀번호 없음). 그룹은 게이트웨이 @Roles 로 가른다 */
    PASSWORD: 'user.member.password',
    /** 휴대폰 인증번호 발송 (로그인 이용자) */
    PHONE_VERIFICATION: 'user.member.phone-verification',
    /** 휴대폰 인증번호 확인 → 회원정보에 번호 저장 (로그인 이용자) */
    PHONE_VERIFICATION_CONFIRM: 'user.member.phone-verification-confirm',
    /** 이용자 아이디 찾기 — 인증번호 발송 */
    FIND_LOGIN_ID: 'user.member.find-login-id',
    /** 이용자 아이디 찾기 — 인증번호 확인 → 가입한 SNS */
    FIND_LOGIN_ID_CONFIRM: 'user.member.find-login-id-confirm',
    /** 매니저 아이디 찾기 — 인증번호 발송 */
    MANAGER_FIND_LOGIN_ID: 'user.manager.find-login-id',
    /** 매니저 아이디 찾기 — 인증번호 확인 → 아이디 */
    MANAGER_FIND_LOGIN_ID_CONFIRM: 'user.manager.find-login-id-confirm',
    /** 매니저 비밀번호 초기화 — 인증번호 발송 */
    MANAGER_PASSWORD_RESET: 'user.manager.password-reset',
    /** 매니저 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호 SMS */
    MANAGER_PASSWORD_RESET_CONFIRM: 'user.manager.password-reset-confirm',
} as const;

/** user-service 내부 HTTP 경로 (게이트웨이 → user-service) — 로그인 · 재발급은 로그인 그룹마다 따로 */
export const USER_INTERNAL_PATH = {
    /** 이용자 SNS 로그인 */
    LOGIN: '/internal/v1/user/login',
    /** 이용자 토큰 재발급 */
    TOKEN_REFRESH: '/internal/v1/user/token-refresh',
    /** 매니저(총매니저 · 매니저) 로그인 */
    MANAGER_LOGIN: '/internal/v1/user/manager-login',
    /** 매니저 토큰 재발급 */
    MANAGER_TOKEN_REFRESH: '/internal/v1/user/manager-token-refresh',
    /** 관리자(총관리자 · 관리자) 로그인 */
    ADMIN_LOGIN: '/internal/v1/user/admin-login',
    /** 관리자 토큰 재발급 */
    ADMIN_TOKEN_REFRESH: '/internal/v1/user/admin-token-refresh',
    /** 로그인 회원 조회 — 뒤에 `/<user_id>` */
    AUTH_USER: '/internal/v1/user/auth-user',
} as const;
```

```typescript
// libs/contracts/src/user/dto/user-general-login.dto.ts — 결과 DTO 변경부 (입력 DTO 그대로 — 매니저 · 관리자 로그인이 쓴다)
export class UserGeneralLoginResultDto {
    // ... 토큰 4종 · is_password_change_required · is_phone_verified 그대로

    @ApiProperty({description: '권한(SUPER_ADMIN · ADMIN · HEAD_MANAGER · MANAGER) — 관리자 페이지 메뉴 구분'})
    auth_id: string;

    @ApiProperty({description: '소속 업체 ID (매니저 그룹, 관리자 그룹은 null)', type: String, nullable: true})
    store_id: string | null;
}
```

### Data — 엔티티 · 마이그레이션 · 시드 (#92 · #93)

```typescript
// libs/database/src/entities/user/user.entity.ts — 변경부
@Entity({name: 't_user', comment: '사용자 정보'})
@Unique('UK_User_LoginIdLoginScope', ['login_id', 'login_scope'])
@Unique('UK_User_UserSearchCode', ['user_search_code'])
@Unique('UK_User_SnsSnsUserId', ['sns_id', 'sns_user_id'])
@Unique('UK_User_PhoneLoginScope', ['phone', 'login_scope'])
export class UserEntity {
    // ...
    @Column({name: 'login_scope', length: 20, nullable: false, comment: '로그인 그룹(USER: 이용자, MANAGER: 총매니저 · 매니저, ADMIN: 총관리자 · 관리자) — 로그인 API · 아이디 · 휴대폰 번호 UK 단위'})
    login_scope: string;

    @Column({name: 'phone', type: 'varchar', length: 30, nullable: true, comment: '휴대폰 번호(숫자만, SMS 인증을 마친 번호 — 로그인 그룹 안에서 번호 1개 = 계정 1개, 미인증 NULL)'})
    phone: string | null;
}
```

```typescript
// libs/database/src/entities/store/store.entity.ts — 변경부
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

export class StoreEntity {
    // ...
    @Column({name: 'store_detail', type: 'jsonb', nullable: false, default: () => "'{}'", comment: '업체 상세정보(JSON — room_count · has_shower · has_tv · has_pc, 항목은 바뀔 수 있다)'})
    store_detail: StoreDetail;
}
```

마이그레이션은 `npm run db:generate -- LoginScopeStoreDetail` 로 만든다. 생성기의 `ADD "login_scope" ... NOT NULL` 은 기존 행(첫 총관리자 등)이 있으면 실패한다. 그래서 그 줄만 아래처럼 손으로 바꾼다(기본값으로 추가 → 권한으로 채움 → 기본값 제거). 엔티티에는 기본값이 없으므로 `db:check` 와 맞는다. 제약 이름은 생성 결과에서 `UK_User_LoginIdLoginScope` · `UK_User_PhoneLoginScope` 인지 확인한다.

```typescript
// libs/database/src/migrations/<ts>-LoginScopeStoreDetail.ts — up() 의 login_scope 부분 (손으로 바꾸는 곳)
await queryRunner.query(`ALTER TABLE "t_user" ADD "login_scope" character varying(20) NOT NULL DEFAULT 'USER'`);
await queryRunner.query(
    `UPDATE "t_user" SET "login_scope" = CASE WHEN "auth_id" IN ('HEAD_MANAGER', 'MANAGER') THEN 'MANAGER' WHEN "auth_id" IN ('SUPER_ADMIN', 'ADMIN') THEN 'ADMIN' ELSE 'USER' END`,
);
await queryRunner.query(`ALTER TABLE "t_user" ALTER COLUMN "login_scope" DROP DEFAULT`);
// 이하 생성 결과 그대로: COMMENT · DROP CONSTRAINT "UK_User_LoginId" · "UK_User_Phone" · ADD CONSTRAINT "UK_User_LoginIdLoginScope" UNIQUE ("login_id", "login_scope") · "UK_User_PhoneLoginScope" UNIQUE ("phone", "login_scope") · t_store "store_detail" jsonb NOT NULL DEFAULT '{}'
```

```typescript
// libs/database/src/seeder/seeder.targets.ts — buildSuperAdminSeed 변경부 (database 는 contracts 를 import 하지 않으므로 리터럴)
    admin.auth_id = 'SUPER_ADMIN';
    admin.login_scope = 'ADMIN'; // 로그인 그룹 — 총관리자 · 관리자
```

### Business Logic — 성인 · 로그인 그룹 (#24 · #25)

```typescript
// apps/user-service/src/user/user.constants.ts — 변경부
/** 성인 나이 — 청소년보호법: 만 19세가 되는 해의 1월 1일부터 성인 */
export const ADULT_AGE = 19;

/** 미성년자 가입 제한 (SNS 가입) — 청소년보호법 기준 */
export const UNDERAGE_MESSAGE = '입력하신 정보로는 서비스 이용이 제한됩니다. 생년월일을 다시 확인해 주세요.';
```

```typescript
// apps/user-service/src/user/user.util.ts — isAdult 교체 (KST_OFFSET_MS 는 같은 파일 상수)
import {ADULT_AGE, DEFAULT_SMS_DAILY_LIMIT, SMS_CODE_TTL_MINUTES, TEMPORARY_PASSWORD_LENGTH} from './user.constants.js';

/**
 * 성인 여부 — 청소년보호법 기준: 만 19세가 되는 해의 1월 1일부터 성인(한국 날짜의 올해 − 출생 연도 ≥ 19). 생일은 보지 않는다.
 *
 * @param birth YYYY-MM-DD
 * @param now 기준 시각 (기본: 지금)
 * @returns 성인이면 true
 */
export function isAdult(birth: string, now: Date = new Date()): boolean {
    const kstYear = new Date(now.getTime() + KST_OFFSET_MS).getUTCFullYear();
    return kstYear - Number(birth.slice(0, 4)) >= ADULT_AGE;
}
```

형제는 지금 `generalLogin` · `tokenRefresh` · `sendFindLoginId` · `confirmFindLoginId` 다(user.service.ts). 흐름 · 예외는 그대로 두고, 조회 조건에 그룹을 더한다. "로그인 그룹만 다른 API 는 메서드 하나 + `login_scope` 인자" 는 사용자 결정이다(spec Decisions).

```typescript
// apps/user-service/src/user/user.service.ts — 변경부
import {AUTH_ID, LOGIN_SCOPE, type LoginScope} from '@app/contracts/user/user.roles.js';
// UserGeneralSignDto · UserGeneralSignResultDto import 삭제

    // sign — 이용자 SNS 가입 (RabbitMQ: user.member.sign)
        // 1. 미성년자(청소년보호법 — 만 19세가 되는 해 전) 가입 제한 — 입력 birth 에 귀속되므로 validation_errors 동봉
        if (!isAdult(dto.birth)) {
            throw new BadRequestException({message: UNDERAGE_MESSAGE, validation_errors: createValidationError('birth', UNDERAGE_MESSAGE)});
        }
        // ...
        userEntity.auth_id = AUTH_ID.USER;
        userEntity.login_scope = LOGIN_SCOPE.USER;

    // generalSign — 메서드 전체 삭제 (일반 가입 폐지)

    // login — 이용자 SNS 로그인 (내부 HTTP: POST /internal/v1/user/login)
        const user = await this.userRepository.findUser({sns_id: dto.sns_id, sns_user_id: dto.sns_user_id, login_scope: LOGIN_SCOPE.USER, state_id: In(['ACTIVE', 'BLOCK'])});

    /**
     * 아이디 · 비밀번호 로그인 — 매니저 · 관리자 그룹 (내부 HTTP: POST /internal/v1/user/manager-login · POST /internal/v1/user/admin-login)
     * 로그인 그룹만 다른 두 API 가 함께 쓴다(login_scope 인자). 다른 그룹 계정은 없는 계정과 같은 404.
     * - login_id + login_scope + state_id IN (ACTIVE, BLOCK) 조회 → 미존재 404
     * - 비밀번호 불일치 → 동일 404 (아이디/비밀번호 구분 비노출)
     * - BLOCK → 403 + block_comment (비밀번호 검증 후 판정)
     *
     * @param dto 로그인 정보
     * @param ip 클라이언트 IP
     * @param login_scope 로그인 그룹 (MANAGER · ADMIN)
     * @returns 토큰 4종 + 비밀번호 변경 필요 여부 + 권한 · 소속 업체
     */
    @Transactional()
    async generalLogin(dto: UserGeneralLoginDto, ip: string, login_scope: LoginScope): Promise<UserGeneralLoginResultDto> {
        // 1. 회원 조회 (그 그룹 · ACTIVE / BLOCK 만)
        const user = await this.userRepository.findUser({login_id: dto.login_id, login_scope, state_id: In(['ACTIVE', 'BLOCK'])});
        // ... 2 ~ 6 그대로
        return {
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            access_token_expires_at: tokens.accessTokenExpiresAt.toISOString(),
            refresh_token_expires_at: tokens.refreshTokenExpiresAt.toISOString(),
            is_password_change_required: user.is_password_change_required,
            is_phone_verified: user.phone_verified_at ? 1 : 0,
            auth_id: user.auth_id,
            store_id: user.store_id ?? null,
        };
    }

    /**
     * 로그인 토큰 재발급 (내부 HTTP: POST /internal/v1/user/token-refresh · manager-token-refresh · admin-token-refresh)
     * 로그인 그룹만 다른 세 API 가 함께 쓴다(login_scope 인자). 회원이 그 그룹이 아니면 상태 이상과 같이 401 + expires_at 단축.
     *
     * @param dto refresh token
     * @param ip 클라이언트 IP
     * @param login_scope 로그인 그룹
     * @returns 토큰 4종
     */
    @Transactional()
    async tokenRefresh(dto: UserTokenRefreshDto, ip: string, login_scope: LoginScope): Promise<UserTokenRefreshResultDto> {
        // ... 1 ~ 3 그대로
        // 4. 회원 state · 로그인 그룹 재검증 — 안전망: expires_at 단축
        const user = await this.userRepository.findUser({user_id: payload.user_id});
        if (!user || user.state_id !== 'ACTIVE' || user.login_scope !== login_scope) {
            // 그대로
        }
        // ... 5 ~ 7 그대로
    }

    // sendPhoneVerification — 다른 계정 번호 확인을 같은 그룹 안에서 (UK_User_PhoneLoginScope)
        const owner = await this.userRepository.findUser({phone: dto.phone, login_scope: user.login_scope});

    /**
     * 아이디 찾기 — 인증번호 발송. 그 번호로 인증한 그 그룹의 회원이 있을 때만 보낸다. (RabbitMQ: user.member.find-login-id · user.manager.find-login-id)
     * 로그인 그룹만 다른 두 API 가 함께 쓴다(login_scope 인자).
     *
     * @param dto 휴대폰 번호
     * @param ip 클라이언트 IP
     * @param login_scope 로그인 그룹 (USER · MANAGER)
     * @returns 인증 ID · 만료 시각
     */
    @Transactional()
    async sendFindLoginId(dto: UserFindLoginIdDto, ip: string, login_scope: LoginScope): Promise<UserFindLoginIdResultDto> {
        // 1. 그 번호로 인증한 그 그룹의 회원 (탈퇴 완료 제외)
        const user = await this.userRepository.findUser({phone: dto.phone, login_scope, state_id: In(ACCOUNT_RECOVERY_STATES)});
        // ... 그대로
    }

    /**
     * 아이디 찾기 — 인증 ID + 인증번호 확인 → 일반 계정은 login_id, SNS 계정은 sns_id, 그리고 가입일시. (RabbitMQ: user.member.find-login-id-confirm · user.manager.find-login-id-confirm)
     * 불일치는 예외를 return 한다 — 소비한 시도 횟수를 커밋하고 실패로 회신된다.
     *
     * @param dto 인증 ID · 인증번호
     * @param login_scope 로그인 그룹 (USER · MANAGER) — 그 기록의 회원이 이 그룹이어야 한다
     * @returns 아이디 또는 가입한 SNS · 가입일시 — 불일치면 BadRequestException(반환, 커밋 뒤 실패)
     */
    @Transactional()
    async confirmFindLoginId(dto: UserFindLoginIdConfirmDto, login_scope: LoginScope): Promise<UserFindLoginIdConfirmResultDto | BadRequestException> {
        // ...
        // 2. 그 기록의 회원 (그 그룹 · 탈퇴 완료 제외)
        const user = await this.userRepository.findUser({user_id: verification.user_id, login_scope, state_id: In(ACCOUNT_RECOVERY_STATES)});
        // ... 그대로
    }

    /**
     * 매니저 비밀번호 초기화 — 인증번호 발송. 아이디 + 휴대폰 번호가 같은 매니저 그룹 계정일 때만 보낸다. (RabbitMQ: user.manager.password-reset)
     *
     * @param dto 아이디 · 휴대폰 번호
     * @param ip 클라이언트 IP
     * @returns 인증 ID · 만료 시각
     */
    @Transactional()
    async sendPasswordReset(dto: UserPasswordResetDto, ip: string): Promise<UserPasswordResetResultDto> {
        // 1. 아이디 + 번호가 같은 매니저 그룹 회원 (이용자는 비밀번호가 없다)
        const user = await this.userRepository.findUser({login_id: dto.login_id, phone: dto.phone, login_scope: LOGIN_SCOPE.MANAGER, state_id: In(ACCOUNT_RECOVERY_STATES)});
        if (!user) {
            throw new NotFoundException({message: ACCOUNT_NOT_FOUND_MESSAGE});
        }
        // SNS 분기 삭제 — 매니저 그룹에는 SNS 계정이 없다
        // ... 2 · 3 그대로
    }

    // confirmPasswordReset (RabbitMQ: user.manager.password-reset-confirm)
        // 2. 그 기록의 회원 (매니저 그룹 · 탈퇴 완료 제외)
        const user = await this.userRepository.findUser({user_id: verification.user_id, login_scope: LOGIN_SCOPE.MANAGER, state_id: In(ACCOUNT_RECOVERY_STATES)});
```

### Data Access — UK 분기 이름

```typescript
// apps/user-service/src/user/repositories/user.repository.ts — 변경부
    // insertUser
            if (isUniqueViolation(error, 'UK_User_LoginIdLoginScope')) {
                throw new BadRequestException({message: '이미 존재하는 로그인 ID입니다.'});
            }
    // updateUser — 휴대폰 번호를 저장할 때 같은 그룹의 다른 계정이 먼저 인증했으면 400
            if (isUniqueViolation(error, 'UK_User_PhoneLoginScope')) {
                throw new BadRequestException({message: PHONE_TAKEN_MESSAGE});
            }
```

조회 조건에 더한 `login_scope` 는 t_user 의 일반 컬럼이다(관계 필드 아님). 매핑 민감 쿼리가 새로 생기지 않는다. `findLoginUser` smoke 스냅샷은 select 목록이 그대로라 바뀌지 않는다.

### Entry Point — user-service 컨트롤러

```typescript
// apps/user-service/src/user/controllers/user.controller.ts — 변경부 (일반 로그인 제거, 그룹별 4개 추가)
import {LOGIN_SCOPE} from '@app/contracts/user/user.roles.js';

    /**
     * 이용자 토큰 재발급
     */
    @Post('/token-refresh')
    @HttpCode(200)
    async tokenRefresh(@Body() dto: UserTokenRefreshDto, @ClientIp() ip: string): Promise<UserTokenRefreshResultDto> {
        return this.userService.tokenRefresh(dto, ip, LOGIN_SCOPE.USER);
    }

    /**
     * 매니저(총매니저 · 매니저) 로그인
     */
    @Post('/manager-login')
    @HttpCode(200)
    async managerLogin(@Body() dto: UserGeneralLoginDto, @ClientIp() ip: string): Promise<UserGeneralLoginResultDto> {
        return this.userService.generalLogin(dto, ip, LOGIN_SCOPE.MANAGER);
    }

    /**
     * 매니저 토큰 재발급
     */
    @Post('/manager-token-refresh')
    @HttpCode(200)
    async managerTokenRefresh(@Body() dto: UserTokenRefreshDto, @ClientIp() ip: string): Promise<UserTokenRefreshResultDto> {
        return this.userService.tokenRefresh(dto, ip, LOGIN_SCOPE.MANAGER);
    }

    /**
     * 관리자(총관리자 · 관리자) 로그인
     */
    @Post('/admin-login')
    @HttpCode(200)
    async adminLogin(@Body() dto: UserGeneralLoginDto, @ClientIp() ip: string): Promise<UserGeneralLoginResultDto> {
        return this.userService.generalLogin(dto, ip, LOGIN_SCOPE.ADMIN);
    }

    /**
     * 관리자 토큰 재발급
     */
    @Post('/admin-token-refresh')
    @HttpCode(200)
    async adminTokenRefresh(@Body() dto: UserTokenRefreshDto, @ClientIp() ip: string): Promise<UserTokenRefreshResultDto> {
        return this.userService.tokenRefresh(dto, ip, LOGIN_SCOPE.ADMIN);
    }
```

```typescript
// apps/user-service/src/user/controllers/user.controller.queue.ts — 변경부
import {LOGIN_SCOPE} from '@app/contracts/user/user.roles.js';
// generalSign 핸들러 · UserGeneralSign* import 삭제

    /**
     * 비밀번호 변경 — 관리자 · 매니저 (그룹은 게이트웨이 @Roles 가 가른다)
     */
    @OnCommand(USER_COMMAND.PASSWORD)
    async changePassword(command: MessageEnvelope<UserPasswordDto>): Promise<void> {
        return this.userService.changePassword(requireActor(command).user_id, command.payload);
    }

    /** 이용자 아이디 찾기 — 인증번호 발송 (비로그인) */
    @OnCommand(USER_COMMAND.FIND_LOGIN_ID)
    async sendFindLoginId(command: MessageEnvelope<UserFindLoginIdDto>): Promise<UserFindLoginIdResultDto> {
        return this.userService.sendFindLoginId(command.payload, command.meta.client_ip ?? '', LOGIN_SCOPE.USER);
    }

    /** 이용자 아이디 찾기 — 인증번호 확인 (비로그인). 불일치는 반환된 BadRequestException. */
    @OnCommand(USER_COMMAND.FIND_LOGIN_ID_CONFIRM)
    async confirmFindLoginId(command: MessageEnvelope<UserFindLoginIdConfirmDto>): Promise<UserFindLoginIdConfirmResultDto | BadRequestException> {
        return this.userService.confirmFindLoginId(command.payload, LOGIN_SCOPE.USER);
    }

    /** 매니저 아이디 찾기 — 인증번호 발송 (비로그인) */
    @OnCommand(USER_COMMAND.MANAGER_FIND_LOGIN_ID)
    async sendManagerFindLoginId(command: MessageEnvelope<UserFindLoginIdDto>): Promise<UserFindLoginIdResultDto> {
        return this.userService.sendFindLoginId(command.payload, command.meta.client_ip ?? '', LOGIN_SCOPE.MANAGER);
    }

    /** 매니저 아이디 찾기 — 인증번호 확인 (비로그인). 불일치는 반환된 BadRequestException. */
    @OnCommand(USER_COMMAND.MANAGER_FIND_LOGIN_ID_CONFIRM)
    async confirmManagerFindLoginId(command: MessageEnvelope<UserFindLoginIdConfirmDto>): Promise<UserFindLoginIdConfirmResultDto | BadRequestException> {
        return this.userService.confirmFindLoginId(command.payload, LOGIN_SCOPE.MANAGER);
    }

    /** 매니저 비밀번호 초기화 — 인증번호 발송 (비로그인) */
    @OnCommand(USER_COMMAND.MANAGER_PASSWORD_RESET)
    async sendPasswordReset(command: MessageEnvelope<UserPasswordResetDto>): Promise<UserPasswordResetResultDto> {
        return this.userService.sendPasswordReset(command.payload, command.meta.client_ip ?? '');
    }

    /** 매니저 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호 SMS (비로그인). 불일치는 반환된 BadRequestException. */
    @OnCommand(USER_COMMAND.MANAGER_PASSWORD_RESET_CONFIRM)
    async confirmPasswordReset(command: MessageEnvelope<UserPasswordResetConfirmDto>): Promise<void | BadRequestException> {
        return this.userService.confirmPasswordReset(command.payload);
    }
```

### Entry Point — 게이트웨이 (그룹별 라우트 · 권한)

이용자 라우트 변경. 형제는 지금 큐 라우트의 `@UseGuards(PassportJwtAuthGuard)` 다(user.controller.queue.ts:82). 권한은 AGENTS.md 규약대로 `RolesGuard` 와 한 세트로 붙인다(인증 → 권한).

```typescript
// apps/gateway/src/api/v1/user/controllers/user.controller.queue.ts — 변경부
import {AUTH_ID} from '@app/contracts/user/user.roles.js';
import {Roles} from '../../../../guards/roles/roles.decorator.js';
import {RolesGuard} from '../../../../guards/roles/roles.guard.js';
// /general-sign · /password · /password-reset · /password-reset/confirm 라우트와 관련 import 삭제

    /**
     * 회원 탈퇴 신청 — 이용자만. done 의 data 는 null.
     */
    @Delete('/leave')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles(AUTH_ID.USER)
    @ApiBearerAuth()
    // ... 기존 데코레이터 + @ApiForbiddenResponse({type: ApiFailResultDto})
    // (탈퇴 철회 PATCH /leave · 휴대폰 인증 POST /phone-verification · /phone-verification/confirm 도 같은 두 줄)
```

```typescript
// apps/gateway/src/api/v1/user/controllers/user.controller.ts — /general-login 라우트와 UserGeneralLogin* import 삭제 (SNS /login · /token-refresh 그대로)
```

```typescript
// apps/gateway/src/api/v1/admin/controllers/admin.controller.ts — 새 파일
import {Body, Controller, HttpCode, Ip, Post} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import {UserGeneralLoginDto, UserGeneralLoginResultDto} from '@app/contracts/user/dto/user-general-login.dto.js';
import {UserTokenRefreshDto, UserTokenRefreshResultDto} from '@app/contracts/user/dto/user-token-refresh.dto.js';
import {USER_INTERNAL_PATH} from '@app/contracts/user/user.commands.js';
import {InternalHttpClient} from '../../../../modules/transport/internal-http.client.js';

/**
 * 관리자 그룹(총관리자 · 관리자) 공개 API — 동기 경로(내부 HTTP). 로그인 · 토큰 재발급.
 * 큐 경로(비밀번호 변경)는 같은 경로 접두의 admin.controller.queue.ts(AdminQueueController)에 둔다.
 */
@ApiTags('관리자')
@Controller('/api/v1/admin')
export class AdminController {
    /**
     * @param internalHttp 동기 경로 — user-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 관리자 로그인 — 총관리자 · 관리자 계정만(다른 그룹은 없는 계정과 같은 404)
     */
    @Post('/login')
    @HttpCode(200)
    @ApiOperation({summary: '관리자 로그인'})
    @ApiBody({type: UserGeneralLoginDto})
    @ApiOkResponse({type: UserGeneralLoginResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async login(@Body() dto: UserGeneralLoginDto, @Ip() ip: string): Promise<UserGeneralLoginResultDto> {
        return this.internalHttp.request<UserGeneralLoginResultDto>('user', 'POST', USER_INTERNAL_PATH.ADMIN_LOGIN, {body: dto, client_ip: ip});
    }

    /**
     * 관리자 토큰 재발급
     */
    @Post('/token-refresh')
    @HttpCode(200)
    @ApiOperation({summary: '관리자 토큰 재발급'})
    @ApiBody({type: UserTokenRefreshDto})
    @ApiOkResponse({type: UserTokenRefreshResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async tokenRefresh(@Body() dto: UserTokenRefreshDto, @Ip() ip: string): Promise<UserTokenRefreshResultDto> {
        return this.internalHttp.request<UserTokenRefreshResultDto>('user', 'POST', USER_INTERNAL_PATH.ADMIN_TOKEN_REFRESH, {body: dto, client_ip: ip});
    }
}
```

```typescript
// apps/gateway/src/api/v1/admin/controllers/admin.controller.queue.ts — 새 파일
import {Body, Controller, Ip, Patch, Res, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOperation,
    ApiProduces,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {Response} from 'express';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {UserPasswordDto} from '@app/contracts/user/dto/user-password.dto.js';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import {AUTH_ID} from '@app/contracts/user/user.roles.js';
import {PassportActor} from '../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {Roles} from '../../../../guards/roles/roles.decorator.js';
import {RolesGuard} from '../../../../guards/roles/roles.guard.js';
import {CommandStreamService} from '../../../../modules/transport/command-stream.service.js';

/**
 * 관리자 그룹(총관리자 · 관리자) 공개 API — 큐 경로(RabbitMQ + 요청 단위 SSE). 비밀번호 변경.
 * 동기 경로(로그인 · 재발급)는 같은 경로 접두의 admin.controller.ts(AdminController)에 둔다.
 */
@ApiTags('관리자')
@Controller('/api/v1/admin')
export class AdminQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 관리자 비밀번호 변경 — 총관리자 · 관리자만. done 의 data 는 null.
     */
    @Patch('/password')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles(AUTH_ID.SUPER_ADMIN, AUTH_ID.ADMIN)
    @ApiBearerAuth()
    @ApiOperation({summary: '관리자 비밀번호 변경'})
    @ApiBody({type: UserPasswordDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changePassword(@PassportActor() actor: Actor, @Body() dto: UserPasswordDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PASSWORD, actor, payload: dto, client_ip: ip});
    }
}
```

```typescript
// apps/gateway/src/api/v1/admin/admin.module.ts — 새 파일
import {Module} from '@nestjs/common';
import {AdminController} from './controllers/admin.controller.js';
import {AdminQueueController} from './controllers/admin.controller.queue.js';

/**
 * 게이트웨이 관리자 그룹(총관리자 · 관리자) 라우트 — `/api/v1/admin`. 전달 수단(TransportModule)은 전역이다.
 * - AdminController(controllers/admin.controller.ts): 동기 — 로그인 · 토큰 재발급
 * - AdminQueueController(controllers/admin.controller.queue.ts): 큐 — 비밀번호 변경
 */
@Module({controllers: [AdminController, AdminQueueController]})
export class AdminModule {}
```

매니저 그룹은 같은 모양이다. `/api/v1/manager` · `@ApiTags('매니저')` · 내부 경로 `MANAGER_LOGIN` · `MANAGER_TOKEN_REFRESH` · `@Roles(AUTH_ID.HEAD_MANAGER, AUTH_ID.MANAGER)` 를 쓰고, 큐 컨트롤러에 아이디 찾기 · 비밀번호 초기화 4개가 더해진다. 비로그인이라 `actor: null` 이고, 형제는 이용자 라우트(user.controller.queue.ts:173-231)다.

```typescript
// apps/gateway/src/api/v1/manager/controllers/manager.controller.queue.ts — 새 파일 (비밀번호 변경은 admin 과 같은 모양, 아래는 찾기 · 초기화)
@ApiTags('매니저')
@Controller('/api/v1/manager')
export class ManagerQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 매니저 비밀번호 변경 — 총매니저 · 매니저만. done 의 data 는 null.
     */
    @Patch('/password')
    @UseGuards(PassportJwtAuthGuard, RolesGuard)
    @Roles(AUTH_ID.HEAD_MANAGER, AUTH_ID.MANAGER)
    @ApiBearerAuth()
    @ApiOperation({summary: '매니저 비밀번호 변경'})
    @ApiBody({type: UserPasswordDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changePassword(@PassportActor() actor: Actor, @Body() dto: UserPasswordDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.PASSWORD, actor, payload: dto, client_ip: ip});
    }

    /**
     * 매니저 아이디 찾기 — 인증번호 발송. done 의 data 는 인증 ID · 만료 시각.
     */
    @Post('/find-login-id')
    @ApiOperation({summary: '매니저 아이디 찾기 — 인증번호 발송'})
    @ApiBody({type: UserFindLoginIdDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserFindLoginIdResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendFindLoginId(@Body() dto: UserFindLoginIdDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.MANAGER_FIND_LOGIN_ID, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 매니저 아이디 찾기 — 인증번호 확인. done 의 data 는 아이디 · 가입일시.
     */
    @Post('/find-login-id/confirm')
    @ApiOperation({summary: '매니저 아이디 찾기 — 인증번호 확인'})
    @ApiBody({type: UserFindLoginIdConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserFindLoginIdConfirmResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmFindLoginId(@Body() dto: UserFindLoginIdConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.MANAGER_FIND_LOGIN_ID_CONFIRM, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 매니저 비밀번호 초기화 — 인증번호 발송(아이디 + 휴대폰 번호). done 의 data 는 인증 ID · 만료 시각.
     */
    @Post('/password-reset')
    @ApiOperation({summary: '매니저 비밀번호 초기화 — 인증번호 발송'})
    @ApiBody({type: UserPasswordResetDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: UserPasswordResetResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiTooManyRequestsResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async sendPasswordReset(@Body() dto: UserPasswordResetDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.MANAGER_PASSWORD_RESET, actor: null, payload: dto, client_ip: ip});
    }

    /**
     * 매니저 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호를 SMS 로 보낸다. done 의 data 는 null.
     */
    @Post('/password-reset/confirm')
    @ApiOperation({summary: '매니저 비밀번호 초기화 — 인증번호 확인'})
    @ApiBody({type: UserPasswordResetConfirmDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async confirmPasswordReset(@Body() dto: UserPasswordResetConfirmDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_COMMAND.MANAGER_PASSWORD_RESET_CONFIRM, actor: null, payload: dto, client_ip: ip});
    }
}
```

```typescript
// apps/gateway/src/gateway.module.ts — 변경부
import {AdminModule} from './api/v1/admin/admin.module.js';
import {ManagerModule} from './api/v1/manager/manager.module.js';

@Module({imports: [MessagingModule.forGateway(), TransportModule, PassportJwtAuthModule, UserModule, ManagerModule, AdminModule]})
```

### 설정 · 규약 문서

```markdown
 # AGENTS.md
 - Architecture 트리: gateway api/v1/{user,manager,admin}/ — 로그인 그룹별 접두
 - 게이트웨이 폴더: 공개 라우트는 로그인 그룹 접두 /api/v1/{user,manager,admin}(폴더 api/v1/<group>/), 그룹 기능 라우트는 /api/v1/<group>/<domain>
 - 서비스 계층 규칙: "public 메서드 1개 = API 1개" 의 예외 — 로그인 그룹만 다른 API 는 메서드 하나 + login_scope 인자, controller 메서드는 API 마다
 - Auth: 미적용 규약 → 적용(RolesGuard + @Roles, AUTH_ID 상수), 로그인 그룹 3개 · login_scope · 그룹별 로그인 · 재발급 API · 다른 그룹은 404/401, 이용자 로그인 필요 API 는 @Roles(USER)
 - Data Layer: UK 를 그룹 단위로 거는 예(UK_User_LoginIdLoginScope · UK_User_PhoneLoginScope), jsonb 컬럼(store_detail — 항목이 바뀌는 상세정보)
 - Checklist: 관리자 · 매니저 라우트 RolesGuard + @Roles 한 세트
 # docs/api.md — 그룹별 접두 · @Roles 데코레이터 순서(큐: verb → @UseGuards → @Roles → @ApiBearerAuth) · @ApiForbiddenResponse
 # docs/architecture.md — 게이트웨이 트리 · 로그인 그룹 표 · 새 도메인 절차의 라우트 위치
 # docs/conventions.md — user.roles.ts · 그룹 인자 예외 · 성인 기준(isAdult)
 # docs/data-layer.md — login_scope · 그룹 UK · store_detail(jsonb, StoreDetail 타입)
 # docs/testing.md — RolesGuard 403 단언 · 그룹 조건 단언
 # README.md — user-service 기능(이용자 SNS 가입 · 로그인만, 매니저 · 관리자 로그인 · 비밀번호), 게이트웨이 경로 접두
```

로드맵 Phase 6 갱신
- #24: "로그인 그룹 3개(이용자 · 매니저 · 관리자) 분리 · 이용자 API USER 전용 · 매니저 미러"
- #25: "성인 기준(청소년보호법) · 일반 가입 폐지"
- 추가: #92 `login_scope` · 그룹 UK, #93 `store_detail`
- Open Decisions 의 "관리자 / 이용자 API 라우트 분리" · "성인 확인" 닫기
- 공통 규칙의 "페이지 구분" · "연령 제한" · "관리자 API 권한" 갱신
- Phase 8 #34 에 `store_detail` 메모

---

## Test Cases

**케이스 상태 — 합의함(2026-10-22).** build 는 `[CASES]` 부터 쓴다.

**`apps/user-service/src/user/test/user.util.spec.ts`**
```
[CASES:isAdult] 청소년보호법 — 한국 날짜의 올해 − 출생 연도 ≥ 19
 ① now 2026-10-22, birth 2007-12-31 → true (생일 전이어도 그해 19세)
 ② now 2026-10-22, birth 2008-01-01 → false
 ③ now 2026-10-22, birth 2007-01-01 → true
 ④ now 2026-10-22, birth 1970-01-01 → true
 ⑤ now 2026-12-31T15:00:00Z(한국 2027-01-01 00:00), birth 2008-06-01 → true (한국 날짜로 새해)
 ⑥ now 2026-12-31T14:59:59Z(한국 2026-12-31 23:59:59), birth 2008-06-01 → false
```

**user-service 기능 spec** (큐 · 동기 경로 부팅 — 기존 도우미)
```
[SUCCESS]  user-sign — insertUser 엔티티 auth_id 'USER' · login_scope 'USER' (기존 케이스에 단언 추가), 미성년 케이스는 새 기준 데이터로
[SUCCESS]  user-login — findUser where 에 login_scope 'USER'
[SUCCESS]  user-general-login → 매니저 · 관리자 로그인: POST /internal/v1/user/admin-login → findUser {login_id, login_scope: 'ADMIN', state_id In}, 결과 auth_id · store_id / manager-login → login_scope 'MANAGER'
[FAIL:auth] admin-login 에 다른 그룹 계정(조회 null) → 404 '잘못된 로그인 정보입니다.', 세션 · 토큰 미호출
[FAIL:route] POST /internal/v1/user/general-login → 404
[FAIL:auth] user-token-refresh — 회원 login_scope 가 API 그룹과 다름(manager-token-refresh 에 USER 회원) → 401 + updateSessionRefresh(expires_at 단축), insertSessionRefresh 미호출
[SUCCESS]  user-token-refresh — admin-token-refresh 에 ADMIN 회원 → 새 토큰
[SUCCESS]  user-find-login-id — user.member.find-login-id: findUser where login_scope 'USER' / user.manager.find-login-id: login_scope 'MANAGER', 확인 결과 {login_id, sns_id: null, created_at}
[FAIL:service] user-find-login-id — 매니저 확인에서 기록의 회원이 다른 그룹(조회 null) → 404
[SUCCESS]  user-password-reset — 명령 user.manager.password-reset(-confirm), findUser where login_scope 'MANAGER' (SNS 400 케이스는 삭제)
[SUCCESS]  user-phone-verification — 다른 계정 번호 확인 findUser {phone, login_scope: 'USER'}
[FAIL:duplicate] user.repository — insertUser UK_User_LoginIdLoginScope → 400 '이미 존재하는 로그인 ID입니다.' / updateUser UK_User_PhoneLoginScope → 400 '이미 가입된 번호입니다.'
[SUCCESS]  seeder — 첫 총관리자 login_scope 'ADMIN'
```
`user-general-sign.spec.ts` 는 삭제한다(일반 가입 폐지).

**게이트웨이 spec** (기존 방식 — 동기는 InternalHttpClient mock, 큐는 FakeBroker + 실제 HTTP)
```
[SUCCESS]  admin.controller — POST /api/v1/admin/login · /token-refresh → InternalHttpClient('user', 'POST', ADMIN_LOGIN · ADMIN_TOKEN_REFRESH, {body, client_ip})
[SUCCESS]  manager.controller — POST /api/v1/manager/login · /token-refresh → MANAGER_LOGIN · MANAGER_TOKEN_REFRESH
[FAIL:validation] /api/v1/admin/login · /api/v1/manager/login — login_id 없음 → 400 property 'login_id', 미호출
[SUCCESS]  admin.controller.queue — SUPER_ADMIN 토큰 PATCH /api/v1/admin/password → user.member.password 발행
[SECURITY] admin.controller.queue — MANAGER · USER 토큰 → 403 '접근 권한이 없습니다.', 발행 없음
[SUCCESS]  manager.controller.queue — HEAD_MANAGER 토큰 PATCH /password → user.member.password / 비로그인 find-login-id(+confirm) · password-reset(+confirm) → user.manager.* (actor null)
[SECURITY] manager.controller.queue — ADMIN 토큰 PATCH /password → 403
[SECURITY] user.controller.queue — MANAGER 토큰으로 DELETE /leave · POST /phone-verification → 403, 발행 없음 (USER 토큰은 기존대로 통과)
[FAIL:route] user 라우트 — POST /general-sign · /general-login · PATCH /password · POST /password-reset(+confirm) → 404
[FAIL:route] 그룹 간 — admin 컨트롤러에 /find-login-id 없음 → 404, 동기 · 큐 짝 404 단언(규약)
```

```
테스트 생략(위임형):
- AdminModule · ManagerModule · gateway.module 등록 — 배선. 라우트 spec 이 실제 HTTP 로 지난다.
- user.roles.ts 상수 · StoreDetail 타입 — 선언.
- store_detail 컬럼 · login_scope 컬럼 · UK — 엔티티 ↔ 마이그레이션 일치는 npm run db:check.
- UserGeneralLoginResultDto 의 auth_id · store_id — 로그인 spec 이 결과 전체를 단언한다.
```

검증(build 후 `/beaver:test`): `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run db:check`.

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | 로그인(이용자 SNS · 매니저 · 관리자) · 토큰 재발급 성공 |
| done | 비밀번호 변경 · 찾기 · 초기화 · 휴대폰 인증 성공 |
| 400 | 입력 형식 · 미성년자(SNS 가입, `validation_errors.birth`) · 인증번호 불일치/만료/사용함/횟수 초과 · 아이디/번호 중복(그룹 내) |
| 401 | 토큰 없음/무효 · 재발급 그룹 불일치 |
| 403 | 정지 계정 로그인(`block_comment`) · 권한 없음(`'접근 권한이 없습니다.'` — 이용자 API 에 관리자 토큰, 관리자 API 에 매니저 토큰 등) |
| 404 | 로그인 정보 불일치(다른 그룹 계정 포함) · 찾기/초기화 대상 없음 · 없어진 라우트 |
| 429 | 같은 번호 하루 SMS 한도 |
| 503 | 서비스 · 브로커 · SMS 접속 실패 |
