# Review — main — 261023-2

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: `main` (direct mode) → origin: `main`
- Included features: user-account-auth 리비전 261023-2 — 공개 · 내부 경로를 서비스 이름으로 시작하는 규칙(`/api/v1/<service>/<domain>` · `/internal/v1/<service>/<domain>`) + 로드맵 최신화(이후 Phase 경로 · 파일 집합 · 서버 분할 · 결정)
- Change scope: 50 파일(+375 / −239) — 게이트웨이 라우트 폴더 15개 이동(이름 바꿈 + 경로 · import 수정), contracts 내부 경로 상수 3파일, 서비스 컨트롤러 · JSDoc · spec, 규약 문서 · README, 로드맵 · beaver 문서

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 폴더 `api/v1/<service>/<domain>/` · 클래스 · 파일 이름은 그대로 |
| Structure & layering | pass | `controllers/` 2파일 · 도메인 모듈 `[동기, 큐]` 등록 그대로, 게이트웨이는 내부 경로를 contracts `*_INTERNAL_PATH` 로만 쓴다 |
| Shared logic extraction | pass | 변경 없음 |
| Errors & responses | pass | 변경 없음(경로만) |
| Test strength | pass | 기존 단언 유지 — 라우트 · 내부 호출 인자 · 없어진 라우트 404 · 다른 경로 404 · 가드 전략 조회 경로를 새 경로로 |
| memory rules | pass | `.beaver/output` 산출물(revision · report · review · roadmap) 함께 커밋 |
| README · docs | pass | AGENTS.md · docs 4개 · README 의 경로 규칙 · 게이트웨이 폴더 · 예시를 같은 변경에서 갱신 |

## Intended Behavior Check (against plan/spec)
- **공개 경로** — 게이트웨이 `@Controller` 6개가 모두 새 규칙이다.
  - `/api/v1/user-service/user`
  - `/api/v1/admin-service/manager`
  - `/api/v1/admin-service/admin`
- **내부 경로**
  - contracts 상수가 `/internal/v1/user-service/user/*` · `/internal/v1/admin-service/{manager,admin}/*` 다.
  - 서비스 `@Controller` 3개가 같은 접두다.
  - 게이트웨이 그룹 전략의 auth-user 조회 경로도 새 상수를 쓴다.
- **로그인 그룹** — 가드로 가르는 구조 그대로다(경로에 그룹 접두 없음).
- **옛 경로 0건** — `apps` · `libs` · 규약 문서 · README 에 `/api/v1/{user,manager,admin}` · `/internal/v1/{user,manager,admin}` 가 남지 않았다(로드맵 완료 Phase 표의 당시 경로는 메모와 함께 둠).
- **로드맵**
  - Phase 9 ~ 21 의 기대 API · 파일 집합을 새 규칙으로 바꿨다(그룹은 가드 표기).
  - Phase 10 · 20 · 21 은 도메인 · 서비스 위치를 고쳤다.
  - Cross-Cutting "서버 분할" · "경로 규칙", 결정 1건.
  - 진척 수치는 그대로다(37/93).
- **검증** — typecheck · lint · Prettier · build(앱 4개) 통과. 테스트 미실행(`/beaver:test` 몫).

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | apps/user-service/src/user/controllers/user.controller.ts:12 · apps/admin-service/src/{manager,admin}/controllers/*.controller.ts:12 · libs/contracts/src/*/\*.commands.ts | 서비스 내부 컨트롤러 경로는 문자열 리터럴이고, 게이트웨이는 contracts `*_INTERNAL_PATH` 상수를 쓴다. 두 쪽이 어긋나도 각자의 spec 은 통과한다(이번 변경처럼 경로를 바꿀 때 둘 다 손대야 한다) — 이전부터 있던 모양 | 지금은 같은 변경에서 둘 다 바꿨고 문자열을 대조했다. 경로가 더 늘어나면 서비스 `@Controller` · `@Post` 도 상수에서 가져오거나 대조 spec 을 둘지 정한다 |

## Verdict
Pass — Low 1건은 이전부터 있던 구조라 추적만 하고 커밋으로 진행한다.
