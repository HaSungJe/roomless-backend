# Revision — user-account-auth — 261023-2

> Change plan for an existing feature. The original spec.md / plan.md are not modified, only referenced.

## Reason for Change Request

공개 · 내부 경로를 **서비스 이름으로 시작**하도록 바꾼다(사용자 결정 2026-10-23). 경로만 보고 어느 서비스로 가는지 알 수 있게 한다. 로그인 그룹은 지금처럼 게이트웨이 가드가 가른다.

## Spec Before → After

| Item | Before (261023-1) | After |
|------|--------|-------|
| 공개 경로 | `/api/v1/<group>/<action>` — `/api/v1/user/login` · `/api/v1/manager/login` · `/api/v1/admin/password` | `/api/v1/<service>/<domain>/<action>` — `/api/v1/user-service/user/login` · `/api/v1/admin-service/manager/login` · `/api/v1/admin-service/admin/password` |
| 그룹 기능 라우트 규칙 | `/api/v1/<group>/<domain>` | `/api/v1/<service>/<domain>` — 그룹은 경로가 아니라 가드로 가른다(예: 객실 관리 `/api/v1/admin-service/room` + 매니저 가드) |
| 내부 HTTP 경로 | `/internal/v1/<domain>/<action>` — `/internal/v1/user/login` · `/internal/v1/manager/auth-user/:user_id` | `/internal/v1/<service>/<domain>/<action>` — `/internal/v1/user-service/user/login` · `/internal/v1/admin-service/manager/auth-user/:user_id` |
| 게이트웨이 폴더 | `api/v1/{user,manager,admin}/` | `api/v1/user-service/user/` · `api/v1/admin-service/manager/` · `api/v1/admin-service/admin/` (`api/v1/<service>/<domain>/`) |

그대로인 것: 명령 type(`user.member.*` · `admin.manager.*` · `admin.admin.*`) · 큐 · 도메인 · 가드 · DTO.

## Affected Files

| File | Change Type | Description |
|------|-------------|-------------|
| `apps/gateway/src/api/v1/{user,manager,admin}/**` → `apps/gateway/src/api/v1/{user-service/user,admin-service/manager,admin-service/admin}/**` | move · modify | 폴더 이동, `@Controller` 경로, 상대 import 한 단계 깊게 |
| `apps/gateway/src/gateway.module.ts` | modify | 도메인 모듈 import 경로 |
| `libs/contracts/src/{user/user,manager/manager,admin/admin}.commands.ts` | modify | `*_INTERNAL_PATH` 값 |
| `apps/user-service/src/user/controllers/user.controller.ts` · `apps/admin-service/src/{manager,admin}/controllers/*.controller.ts` | modify | `@Controller('/internal/v1/<service>/<domain>')` |
| 서비스 JSDoc · spec(경로 문자열) · `apps/gateway/src/guards/test/guards.spec.ts` | modify | 새 경로 |
| `AGENTS.md` · `README.md` · `docs/*.md` | modify | 경로 규칙 |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modify | 이후 Phase 경로 · 파일 집합, 서버 분할 · 관리자 계정 관리 · 통계 위치, 결정 기록 |

## Code Changes

```ts
// apps/gateway/src/api/v1/admin-service/manager/controllers/manager.controller.ts — before
@Controller('/api/v1/manager')
// after
@Controller('/api/v1/admin-service/manager')
```

```ts
// libs/contracts/src/manager/manager.commands.ts — before
LOGIN: '/internal/v1/manager/login',
// after
LOGIN: '/internal/v1/admin-service/manager/login',
```

```ts
// apps/admin-service/src/manager/controllers/manager.controller.ts — before
@Controller('/internal/v1/manager')
// after
@Controller('/internal/v1/admin-service/manager')
```

이용자 · 관리자도 같은 방식이다(`/api/v1/user-service/user` · `/internal/v1/user-service/user`, `/api/v1/admin-service/admin` · `/internal/v1/admin-service/admin`). 이동한 게이트웨이 파일의 상대 import 는 `../../../../guards/…` → `../../../../../guards/…` 다.

## Decisions

- [x] 버전 — 두 서비스 모두 `/api/v1/…`. (사용자 결정 2026-10-23)
- [x] 경로 모양 — `서비스/도메인/기능`, 그룹은 가드로만 가른다. (사용자 결정 2026-10-23)
- [x] 내부 경로도 같은 규칙(`/internal/v1/<service>/<domain>`). (사용자 결정 2026-10-23)

## Test Cases

경로 문자열만 바뀐다 — 기존 spec 의 단언을 그대로 두고 경로를 새 규칙으로 바꾼다(게이트웨이 라우트 · 내부 경로 호출 인자 · 서비스 내부 경로 · 가드 전략의 auth-user 경로). 없어진 라우트 404 단언도 새 접두로 둔다.

```
테스트 생략(위임형):
- 폴더 이동 · import 경로 — typecheck · build 로 확인
```
