# Revision — user-account-auth — 261023-1

> Change plan for an existing feature. The original spec.md / plan.md are not modified, only referenced.

## Reason for Change Request

사용자가 그룹별로 나눈다는 것을 게이트웨이 라우트만이 아니라 **user · manager · admin 도메인 자체의 분리**로 정했다. 매니저 · 관리자 도메인은 Phase 7 의 **admin-service** 를 이번에 만들어 그 안에 둔다(사용자 결정 2026-10-23).

## Spec Before → After

| Item | Before (261022 build) | After |
|------|--------|-------|
| 매니저 · 관리자 도메인 위치 | user-service `user` 도메인 안(`generalLogin(…, login_scope)` 등) | **admin-service** `src/manager/` · `src/admin/` — 도메인마다 controller · service · repository |
| 서비스 규칙 예외 | "로그인 그룹만 다른 API 는 service 메서드 하나 + `login_scope` 인자" | **예외 삭제** — 도메인마다 자기 service 메서드. 공통 계정 로직은 새 lib `libs/account` |
| 공통 계정 로직 | `apps/user-service/src/user/user.util.ts` · `user.constants.ts` | `libs/account`(`@app/account/*`) — 토큰 발급 · SMS 인증 · 임시 비밀번호 util, 계정 상수 · 메시지. `generateId` · 한국 날짜 계산은 `libs/common/src/utils/{id,kst}.ts` |
| contracts | `libs/contracts/src/user/` 하나(`user.roles.ts` · 일반 로그인 · 비밀번호 DTO 포함) | `user/` · `manager/` · `admin/` 도메인별 commands · DTO, 권한 상수는 `libs/contracts/src/roles.ts` |
| 명령 type | `user.member.password` · `user.manager.*` | 매니저 `admin.manager.*`, 관리자 `admin.admin.password` → 큐 `q.admin.cmd`(바인딩 `admin.#`). 이용자 `user.member.password` 삭제(이용자는 비밀번호 없음) |
| 내부 HTTP 경로 | `/internal/v1/user/{manager-login, admin-login, manager-token-refresh, admin-token-refresh}` | `/internal/v1/manager/{login, token-refresh, auth-user/:user_id}` · `/internal/v1/admin/{login, token-refresh, auth-user/:user_id}` (admin-service) |
| 게이트웨이 인증 | 전략 1개(`jwt-user`) — 모든 토큰을 user-service auth-user 로, 그룹은 `RolesGuard` + `@Roles` | **그룹별 전략 · 가드 3쌍** — `jwt-user`(user-service) · `jwt-manager` · `jwt-admin`(admin-service). 각 auth-user 는 자기 그룹 계정만 돌려주므로 다른 그룹 토큰은 401. `RolesGuard` 는 그룹 안에서 권한을 더 좁힐 때만(다시 사용처 0) |
| 데이터 접근 | — | admin-service 는 공유 DB 를 직접 쓴다(같은 엔티티, scheduler 와 같은 방식). 마이그레이션 · 시드는 user-service 묶음 그대로 |
| 로그인 결과 | 매니저 · 관리자 공용 `UserGeneralLoginResultDto`(토큰 · 변경 필요 · 휴대폰 인증 · 권한 · 업체) | 매니저 `ManagerLoginResultDto`(토큰 · 변경 필요 · 권한 · 업체), 관리자 `AdminLoginResultDto`(토큰 · 변경 필요 · 권한). 휴대폰 인증 여부는 이용자 기능이라 뺀다 |
| 매니저 아이디 찾기 결과 | `{login_id, sns_id: null, created_at}` | `ManagerFindLoginIdConfirmResultDto {login_id, created_at}` |
| Phase 7 (admin-service 기반) | todo | 이번에 함께 — 앱 · Docker 묶음(`compose.admin-service.yml`, `ADMIN_SERVICE_REPLICAS` 기본 1) · 브로커 계정 `admin-service` · 게이트웨이 연결(`InternalService 'admin'`, `ADMIN_SERVICE_URL`) |

그대로인 것: `t_user.login_scope` · 그룹 UK · `store_detail` · 마이그레이션 `LoginScopeStoreDetail` · 성인 기준 · 일반 가입 폐지 · 공개 경로(`/api/v1/{user,manager,admin}/...`).

## Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `libs/account/src/account.constants.ts` · `utils/{token,sms-verification,password}.ts` · `utils/test/*.spec.ts` | add | 공통 계정 로직(user.util · user.constants 에서 이동) |
| `libs/common/src/utils/{id,kst}.ts` · `utils/test/kst.spec.ts` | add | `generateId` · `kstDayStart` · `kstYear` |
| `tsconfig.json` | modify | `@app/account/*` |
| `libs/contracts/src/roles.ts` (← `user/user.roles.ts`) | add · delete | 권한 · 로그인 그룹 상수 |
| `libs/contracts/src/user/user.commands.ts` | modify | `PASSWORD` · `MANAGER_*` 명령, 매니저 · 관리자 내부 경로 삭제 |
| `libs/contracts/src/user/dto/{user-general-login,user-password,user-password-reset,user-password-reset-confirm}.dto.ts` | delete | 매니저 · 관리자 도메인 DTO 로 |
| `libs/contracts/src/manager/manager.commands.ts` · `dto/manager-*.dto.ts`(7) | add | 매니저 도메인 규격 |
| `libs/contracts/src/admin/admin.commands.ts` · `dto/admin-*.dto.ts`(4) | add | 관리자 도메인 규격 + admin-service 큐 |
| `libs/messaging/src/messaging.constants.ts` | modify | `BROKER_USER.ADMIN_SERVICE` |
| `apps/admin-service/**` | add | 앱 — main · 루트 모듈 · manager · admin 도메인 · 테스트 |
| `apps/user-service/src/user/{user.service,user.util,user.constants}.ts` · `controllers/*` · `repositories/user.repository.ts` | modify | 이용자만 — 매니저 · 관리자 코드 삭제, auth-user 를 이용자 그룹으로 |
| `apps/user-service/src/user/test/*` | modify · delete | `user-general-login` · `user-password` · `user-password-reset` spec 삭제(admin-service 로) |
| `apps/gateway/src/guards/passport.jwt.auth/*` | modify · add | 그룹별 전략 · 가드, 공통 `passport.jwt.auth.util.ts` |
| `apps/gateway/src/api/v1/{user,manager,admin}/**` | modify | 그룹 가드 · 도메인 규격, `RolesGuard` 제거 |
| `apps/gateway/src/modules/transport/internal-http.client.ts` | modify | `InternalService = 'user' \| 'admin'` |
| `compose.admin-service.yml` · `docker/nginx/admin-service.conf` | add | admin-service × N + LB |
| `compose.{gateway,user-service,scheduler,rabbitmq}.yml` · `docker/rabbitmq/init.sh` · `scripts/check-broker-acl.mjs` · `Dockerfile` · `nest-cli.json` · `package.json` · `.env.example` | modify | admin-service 연결 · 계정 · 스크립트 |
| `README.md` · `AGENTS.md` · `docs/*.md` | modify | 도메인 분리 · admin-service · libs/account · 그룹별 인증 |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modify | Phase 7 을 이번에 함께, 결정 갱신 |

## Code Changes

### libs/account — 공통 계정 로직

```ts
// libs/account/src/utils/token.ts — after (user.util.ts 의 issueAccessAndRefresh · AccessRefreshSet 이동)
import type {JwtService} from '@nestjs/jwt';
import {extractJwtExpiresAt} from '@app/common/utils/jwt.js';

/** access / refresh 토큰 한 쌍과 만료 시각 */
export interface AccessRefreshSet {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: Date;
    refreshTokenExpiresAt: Date;
}

/**
 * access(20m) / refresh(365d) 토큰 한 쌍 발급 + 만료시각 추출 — 가입 · 로그인 · 재발급 공통(이용자 · 매니저 · 관리자).
 */
export function issueAccessAndRefresh(jwtService: JwtService, payload: {user_id: string; session_id: string}): AccessRefreshSet {
    const accessToken = jwtService.sign({type: 'access', ...payload}, {expiresIn: '20m'});
    const refreshToken = jwtService.sign({type: 'refresh', ...payload}, {expiresIn: '365d'});
    return {accessToken, refreshToken, accessTokenExpiresAt: extractJwtExpiresAt(accessToken), refreshTokenExpiresAt: extractJwtExpiresAt(refreshToken)};
}
```

`utils/sms-verification.ts` 는 `generateVerificationCode` · `getSmsDailyLimit` · `checkSmsVerification` · `buildSmsVerification` · `smsVerificationText`(+ `SmsVerificationState` · `SmsVerificationInput`), `utils/password.ts` 는 `generateTemporaryPassword` · `temporaryPasswordText` — user.util.ts 의 본문을 그대로 옮기고 import 만 `../account.constants.js` · `@app/common/utils/id.js` 로 바꾼다. `account.constants.ts` 는 user.constants.ts 의 `SMS_PURPOSE` · `SMS_CODE_TTL_MINUTES` · `SMS_MAX_ATTEMPTS` · `DEFAULT_SMS_DAILY_LIMIT` · `TEMPORARY_PASSWORD_LENGTH` · `ACCOUNT_RECOVERY_STATES` 와 공통 메시지(`INVALID_LOGIN_MESSAGE` · `BLOCKED_ACCOUNT_MESSAGE` · `INVALID_TOKEN_MESSAGE` · `USER_NOT_FOUND_MESSAGE` · `USER_NOT_EXIST_MESSAGE` · `SMS_DAILY_LIMIT_MESSAGE` · `SMS_VERIFICATION_NOT_FOUND_MESSAGE` · `SMS_STATE_MESSAGE` · `SMS_ATTEMPTS_EXCEEDED_MESSAGE` · `SMS_CODE_MISMATCH_MESSAGE` · `ACCOUNT_NOT_FOUND_MESSAGE`)를 옮긴다. user.constants.ts 에는 이용자 전용(`ADULT_AGE` · `UNDERAGE_MESSAGE` · `NO_MATCHING_USER_MESSAGE` · `PHONE_ALREADY_VERIFIED_MESSAGE` · `PHONE_TAKEN_MESSAGE`)만 남는다.

```ts
// libs/common/src/utils/kst.ts — after
/** 한국 표준시 오프셋(ms) — 서머타임 없음 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 그 시각이 속한 한국 날짜의 0시(KST) */
export function kstDayStart(now: Date): Date {
    const kst = new Date(now.getTime() + KST_OFFSET_MS);
    kst.setUTCHours(0, 0, 0, 0);
    return new Date(kst.getTime() - KST_OFFSET_MS);
}

/** 그 시각의 한국 연도 */
export function kstYear(now: Date): number {
    return new Date(now.getTime() + KST_OFFSET_MS).getUTCFullYear();
}
```

```ts
// apps/user-service/src/user/user.util.ts — after (isAdult)
export function isAdult(birth: string, now: Date = new Date()): boolean {
    return kstYear(now) - Number(birth.slice(0, 4)) >= ADULT_AGE;
}
```

### contracts — 도메인별 규격

```ts
// libs/contracts/src/admin/admin.commands.ts — after
/** admin-service 명령 큐 — 매니저 · 관리자 도메인 명령(`admin.<도메인>.<action>`)을 받는다 */
export const ADMIN_COMMAND_QUEUE = 'q.admin.cmd';
/** admin-service 명령 큐 바인딩 키 */
export const ADMIN_COMMAND_BINDING = 'admin.#';

/** 관리자 도메인 명령 type */
export const ADMIN_COMMAND = {
    /** 관리자 비밀번호 변경 */
    PASSWORD: 'admin.admin.password',
} as const;

/** 관리자 도메인 내부 HTTP 경로 (게이트웨이 → admin-service) */
export const ADMIN_INTERNAL_PATH = {
    LOGIN: '/internal/v1/admin/login',
    TOKEN_REFRESH: '/internal/v1/admin/token-refresh',
    /** 로그인 관리자 조회 — 뒤에 `/<user_id>` */
    AUTH_USER: '/internal/v1/admin/auth-user',
} as const;
```

```ts
// libs/contracts/src/manager/manager.commands.ts — after
export const MANAGER_COMMAND = {
    PASSWORD: 'admin.manager.password',
    FIND_LOGIN_ID: 'admin.manager.find-login-id',
    FIND_LOGIN_ID_CONFIRM: 'admin.manager.find-login-id-confirm',
    PASSWORD_RESET: 'admin.manager.password-reset',
    PASSWORD_RESET_CONFIRM: 'admin.manager.password-reset-confirm',
} as const;

export const MANAGER_INTERNAL_PATH = {
    LOGIN: '/internal/v1/manager/login',
    TOKEN_REFRESH: '/internal/v1/manager/token-refresh',
    AUTH_USER: '/internal/v1/manager/auth-user',
} as const;
```

DTO 는 도메인마다 독립 선언(규약: 기능당 DTO 1개, 모양이 같아도 따로) — 검증 데코레이터 · 메시지는 지금 user DTO 와 같다.
- manager: `ManagerLoginDto/ResultDto`(결과: 토큰 4종 · `is_password_change_required` · `auth_id` · `store_id`) · `ManagerTokenRefreshDto/ResultDto` · `ManagerPasswordDto` · `ManagerFindLoginIdDto/ResultDto` · `ManagerFindLoginIdConfirmDto/ResultDto {login_id, created_at}` · `ManagerPasswordResetDto/ResultDto` · `ManagerPasswordResetConfirmDto` · `ManagerAuthUserParamDto/ResultDto {user_id, login_id, name, auth_id, store_id, state_id, is_login_allowed}`
- admin: `AdminLoginDto/ResultDto`(토큰 4종 · `is_password_change_required` · `auth_id`) · `AdminTokenRefreshDto/ResultDto` · `AdminPasswordDto` · `AdminAuthUserParamDto/ResultDto {user_id, login_id, name, auth_id, state_id, is_login_allowed}`

### admin-service

```ts
// apps/admin-service/src/admin-service.module.ts — after
@Module({
    imports: [
        DatabaseModule,
        MessagingModule.forService({queue: ADMIN_COMMAND_QUEUE, binding_keys: [ADMIN_COMMAND_BINDING], broker_user: BROKER_USER.ADMIN_SERVICE}),
        SmsModule,
        ManagerModule,
        AdminModule,
    ],
    providers: [{provide: APP_GUARD, useClass: InternalAuthGuard}, {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}],
})
export class AdminServiceModule {}
```

`main.ts` 는 user-service 와 같은 모양 — `listen(ADMIN_SERVICE_PORT ?? 4002, ADMIN_SERVICE_HOST || '127.0.0.1')`. 시드 · migrate 진입점은 없다(user-service 묶음 몫).

```ts
// apps/admin-service/src/manager/manager.service.ts — after (요지 — 로그인)
@Transactional()
async login(dto: ManagerLoginDto, ip: string): Promise<ManagerLoginResultDto> {
    // 1. 매니저 그룹 회원 조회 (ACTIVE / BLOCK 만) — 다른 그룹 계정은 없는 계정과 같다
    const manager = await this.managerRepository.findManager({login_id: dto.login_id, login_scope: LOGIN_SCOPE.MANAGER, state_id: In(['ACTIVE', 'BLOCK'])});
    if (!manager) {
        throw new NotFoundException({message: INVALID_LOGIN_MESSAGE});
    }
    // 2~7. 비밀번호 → 정지 → 기기 → 세션 → 토큰 → refresh (user-service generalLogin 과 같은 흐름)
    ...
    return {access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, is_password_change_required: manager.is_password_change_required, auth_id: manager.auth_id, store_id: manager.store_id ?? null};
}
```

메서드(1 메서드 = 1 API, 예외 없음)
- `ManagerService`: `login` · `tokenRefresh`(회원 `login_scope` 가 MANAGER 가 아니면 401 + 만료 단축) · `getLoginManager`(auth-user) · `changePassword`(`admin.manager.password`, `findManager({user_id, login_scope: MANAGER})`) · `sendFindLoginId` · `confirmFindLoginId` · `sendPasswordReset` · `confirmPasswordReset` — 본문은 261022 의 user.service.ts 해당 메서드를 매니저 그룹 고정으로 옮긴다.
- `AdminService`: `login` · `tokenRefresh` · `getLoginAdmin` · `changePassword`(`admin.admin.password`).
- repository(소유 도메인 어휘): manager `findManager` · `findLoginManager`(QueryBuilder — 상태 조인 · 매니저 그룹 · 로그인 가능) · `updateManager` · 세션 3종 · SMS 인증 5종, admin `findAdmin` · `findLoginAdmin` · `updateAdmin` · 세션 3종. 오류 변환은 user.repository.ts 와 같다(UK_User_PhoneLoginScope → 400 등).

```ts
// apps/admin-service/src/manager/repositories/manager.repository.ts — after (로그인 매니저 조회 쿼리 — smoke 대상)
buildLoginManagerQuery(user_id: string): SelectQueryBuilder<UserEntity> {
    return this.users
        .createQueryBuilder('u')
        .select('u.user_id', 'user_id')
        .addSelect('u.login_id', 'login_id')
        .addSelect('u.name', 'name')
        .addSelect('u.auth_id', 'auth_id')
        .addSelect('u.store_id', 'store_id')
        .addSelect('u.state_id', 'state_id')
        .addSelect('s.is_login_allowed', 'is_login_allowed')
        .innerJoin(StateEntity, 's', 's.state_id = u.state_id')
        .where('u.user_id = :user_id', {user_id})
        .andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.MANAGER})
        .andWhere('s.is_login_allowed = 1');
}
```

user-service `buildLoginUserQuery` 에도 `.andWhere('u.login_scope = :login_scope', {login_scope: LOGIN_SCOPE.USER})` 를 더한다(이용자 토큰만 통과).

### 게이트웨이 — 그룹별 인증

```ts
// apps/gateway/src/guards/passport.jwt.auth/passport.jwt.auth.util.ts — after
/** 인증 실패 메시지 (토큰 없음 · 서명 오류 · 만료 · 로그인 불가 · 다른 그룹 회원) */
export const AUTH_INVALID_MESSAGE = '로그인 정보가 유효하지 않습니다.';

/** passport-jwt 공통 옵션 — Bearer 토큰, JWT_SECRET, development 면 만료 무시 */
export function jwtStrategyOptions() {
    return {jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_SECRET || '', ignoreExpiration: process.env.NODE_ENV === 'development'};
}

/** access 토큰이면 그 그룹의 서비스에 로그인 회원을 묻는다 — 실패는 모두 401 */
export async function fetchLoginUser<T>(internalHttp: InternalHttpClient, service: InternalService, path: string, payload: AccessPayload): Promise<T> {
    if (payload?.type !== 'access' || !payload.user_id) {
        throw new UnauthorizedException({message: AUTH_INVALID_MESSAGE});
    }
    try {
        return await internalHttp.request<T>(service, 'GET', `${path}/${encodeURIComponent(payload.user_id)}`);
    } catch {
        throw new UnauthorizedException({message: AUTH_INVALID_MESSAGE});
    }
}

/** 가드 공통 — 회원이 없거나 전략 오류면 한국어 401 */
export function passLoginUser<TUser>(error: unknown, user: TUser | false): TUser { ... }
```

| 그룹 | 전략(이름) | 가드 | 확인 |
|---|---|---|---|
| 이용자 | `PassportJwtAuthStrategy`(`jwt-user`) | `PassportJwtAuthGuard` | user-service `GET /internal/v1/user/auth-user/:user_id`(이용자 그룹만) |
| 매니저 | `PassportJwtManagerAuthStrategy`(`jwt-manager`) | `PassportJwtManagerAuthGuard` | admin-service `GET /internal/v1/manager/auth-user/:user_id` |
| 관리자 | `PassportJwtAdminAuthStrategy`(`jwt-admin`) | `PassportJwtAdminAuthGuard` | admin-service `GET /internal/v1/admin/auth-user/:user_id` |

```ts
// apps/gateway/src/api/v1/manager/controllers/manager.controller.queue.ts — after (비밀번호 변경)
@Patch('/password')
@UseGuards(PassportJwtManagerAuthGuard)
@ApiBearerAuth()
@ApiOperation({summary: '매니저 비밀번호 변경'})
@ApiBody({type: ManagerPasswordDto})
@ApiProduces('text/event-stream')
@ApiBadRequestResponse({type: ApiFailResultDto})
@ApiUnauthorizedResponse({type: ApiFailResultDto})
@ApiNotFoundResponse({type: ApiFailResultDto})
@ApiServiceUnavailableResponse({type: ApiFailResultDto})
@ApiInternalServerErrorResponse({type: ApiFailResultDto})
async changePassword(@PassportActor() actor: Actor, @Body() dto: ManagerPasswordDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
    await this.commandStream.dispatch(res, {type: MANAGER_COMMAND.PASSWORD, actor, payload: dto, client_ip: ip});
}
```

이용자 큐 라우트(탈퇴 · 철회 · 휴대폰 인증)는 `@UseGuards(PassportJwtAuthGuard)` 로 되돌리고 `@Roles` · `@ApiForbiddenResponse` 를 뺀다 — 매니저 · 관리자 토큰은 이용자 auth-user 에서 걸러져 401.

### Docker · 브로커

```yaml
# compose.admin-service.yml — after (요지)
services:
    admin-service:
        image: roomless/admin-service
        build: {context: ., args: {APP: admin-service}}
        environment:
            NODE_ENV: '${NODE_ENV:?…}'
            DATABASE_URL: '${DATABASE_URL:?…}'
            RABBITMQ_HOST: '${RABBITMQ_HOST:?…}'
            RABBITMQ_ADMIN_SERVICE_PASSWORD: '${RABBITMQ_ADMIN_SERVICE_PASSWORD:?…}'
            JWT_SECRET: '${JWT_SECRET:?…}'
            TOKEN_CIPHER_KEY: '${TOKEN_CIPHER_KEY:?…}'
            INTERNAL_API_TOKEN: '${INTERNAL_API_TOKEN:?…}'
            ADMIN_SERVICE_PORT: 4002
            ADMIN_SERVICE_HOST: 0.0.0.0
            TZ: Asia/Seoul
            RABBITMQ_GATEWAY_PASSWORD: ''
            RABBITMQ_USER_SERVICE_PASSWORD: ''
            RABBITMQ_PASSWORD: ''
        deploy: {replicas: '${ADMIN_SERVICE_REPLICAS:-1}'}
        networks: [service, broker, data]
    admin-service-lb:   # nginx 1.28 — docker/nginx/admin-service.conf (listen 4002, upstream admin-service:4002 resolve)
```

```sh
# docker/rabbitmq/init.sh — after (추가)
put "users/admin-service" "{\"password\":\"${RABBITMQ_ADMIN_SERVICE_PASSWORD}\",\"tags\":\"\"}"
put "permissions/%2F/admin-service" '{"configure":"^(roomless\\.(cmd|event|dlx)|q\\.dead|q\\.admin\\.cmd)$","write":"^(roomless\\.(event|dlx)|q\\.dead|q\\.admin\\.cmd)$","read":"^(roomless\\.(cmd|dlx)|q\\.admin\\.cmd)$"}'
```

`docker:up` 순서: infra → user-service(마이그레이션) → admin-service → scheduler → gateway. 게이트웨이 compose 에 `ADMIN_SERVICE_URL: http://admin-service-lb:4002`.

## Decisions

- [x] 도메인 분리 범위 — user · manager · admin 을 게이트웨이 · contracts · 서비스 전 레이어에서 나누고, 매니저 · 관리자는 admin-service(Phase 7 을 이번에). (사용자 결정 2026-10-23)
- [x] 공통 계정 로직 — 새 lib `libs/account`. (사용자 결정 2026-10-23)
- [x] 명령 type — `admin.manager.*` · `admin.admin.*`, 큐 `q.admin.cmd` 바인딩 `admin.#`. (사용자 결정 2026-10-23)
- [x] admin-service 데이터 접근 — 공유 DB 직접(같은 엔티티). 로드맵 미결 "업체 계정 생성 위치" 도 이 방식으로 닫는다. (사용자 결정 2026-10-23)
- [x] 게이트웨이 토큰 확인 — 그룹별 서비스에(전략 · 가드 3쌍). (사용자 결정 2026-10-23)

## Test Cases

옮기는 기존 spec 의 단언은 그대로 두고 대상 · 경로 · 명령만 바꾼다.
- `libs/account/src/utils/test/sms-verification.spec.ts` · `password.spec.ts`, `libs/common/src/utils/test/kst.spec.ts` — user.util.spec.ts 의 `[CASES]`(kstDayStart · getSmsDailyLimit · checkSmsVerification · generateVerificationCode · generateTemporaryPassword · buildSmsVerification) 이동. `[CASES:isAdult]` 6개는 user.util.spec.ts 에 남는다.
- admin-service manager: `manager-login`(매니저 그룹 조회 · 결과 · 다른 그룹 404 · 정지 403 · 검증 400) · `manager-token-refresh`(다른 그룹 401 + 만료 단축) · `manager-auth-user` · `manager-password` · `manager-find-login-id` · `manager-password-reset` · `manager.repository`(UK · FK 400, `[SMOKE:data-access]` `buildLoginManagerQuery` · `buildConsumeSmsVerificationAttemptQuery`)
- admin-service admin: `admin-login` · `admin-token-refresh` · `admin-auth-user` · `admin-password` · `admin.repository`(`[SMOKE:data-access]` `buildLoginAdminQuery`)
- user-service: 매니저 · 관리자 케이스 삭제, `[SMOKE]` `buildLoginUserQuery` 에 `login_scope = $2`
- 게이트웨이: 가드 spec 에 매니저 · 관리자 전략(서비스 `'admin'` · 경로) · 가드 401, 그룹 라우트 spec 은 그룹 가드를 override 하고 내부 경로 · 명령을 단언(다른 경로 404 유지). 이용자 403 케이스는 삭제(가드 단계 401).

```
테스트 생략(위임형):
- admin-service 루트 모듈 · main · 도메인 모듈 배선, compose · nginx · init.sh — `docker compose config` 와 `npm run build` 로 확인
- libs/account 상수 · DTO 선언
```
