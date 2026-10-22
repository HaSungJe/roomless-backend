# Review — main — 261022

> ship 전 코드 리뷰. Phase 5 서버 분할(server-split)의 작업 트리 변경(`git diff HEAD` + 새 파일)을 memory 규칙 · AGENTS.md 규약 · plan/spec 의도와 대조한다.

## Target
- mode: direct (worktree 없음) — branch: `main` → origin: `origin/main`
- 포함 작업: server-split (로드맵 Phase 5 — #88 · #89 · #90 · #91)
- 변경 범위
  - 수정 31개 (+216 / −163), 이동 2개(crontab · crontab spec)
  - 새 파일: scheduler 앱 9개 · `compose.scheduler.yml` · libs/common 4개(interceptor · env + spec 2) · spec · plan · report

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | `ReturnedExceptionInterceptor`(인프라 `<kebab>.<role>.ts` — `returned-exception.interceptor.ts`) · `readPositiveInt`(`utils/env.ts`) · scheduler 도메인 `user.module.ts` · `user.symbols.ts` · `repositories/user.repository.ts` · `crontabs/user-leave-cleanup.crontab.ts` |
| Structure & layering | pass | scheduler 는 앱끼리 import 없이 libs 만 쓴다. crontab → repository 포트(service 없음). user-service 에서 `ScheduleModule` · crontab · `findUsers` · `Propagation` 이 빠졌다(§1.7) |
| Shared logic extraction | pass | 게이트웨이 전용이던 `readPositiveInt` 를 `libs/common/src/utils/env.ts` 로 옮겨 database 와 같이 쓴다(복제 없음). 반환된 예외 처리는 큐(`CommandDispatcher`) · HTTP(인터셉터) 한 곳씩이고, 컨트롤러는 위임 한 줄이다 |
| Errors & responses | pass | 반환된 예외도 `toFailResult()` 를 거쳐 실패 본문이 하나다. 불일치만 return(커밋 필요), 한도 초과 · 사용함 · 만료 · SMS 503 은 throw 그대로다. 반환된 실패는 재시도 없이 ack |
| Transaction | pass | `consumeSmsVerificationAttempt` 의 RequiresNew 를 제거해 확인 1건 = 연결 1개다. 풀 연결 대기 `DATABASE_CONNECTION_TIMEOUT_MS`(기본 30초) |
| Docker · `.env` | pass | `compose.scheduler.yml` 은 user-service 묶음과 같은 원칙이다 — 필수값 `${VAR:?}`, 쓰지 않는 비밀값 빈 값, `roomless-data` 만, 포트 · LB 없음. `docker compose config --quiet` 종료 코드 0. 사용자 `.env` 는 보지 않았다 |
| Test strength | pass | `[CASES:returned-exception]` 6개는 봉투 request_id · actor · attempt, 실패 본문 전체, 판정(ack)까지 단언한다. 인터셉터는 실제 HTTP(supertest)로 확인한다. 테스트는 build 규약상 실행하지 않았다 |
| README 갱신 | pass | scheduler 서버 · 실행 순서 · 인스턴스 수 · 연결 대기 env · 명령 표 · 구조 |
| memory(git · api-log) | pass | `.beaver/output` 문서(spec · plan · report · review · roadmap)를 함께 커밋한다 |

## Data-Access Smoke Coverage
- scheduler `findUsers`
  - FK 문자열 `state_id` where 는 매핑 민감 쿼리다.
  - `buildUsersQuery`(find 와 같은 `setFindOptions`)로 분리했고, `[SMOKE:data-access]` 가 WHERE · 파라미터 · JOIN 없음을 고정한다.
- user-service `consumeSmsVerificationAttempt` 쿼리는 그대로다. 기존 smoke 가 유지된다.

## Memory Reconcile
`.beaver/memory/` 에 `미반영` 항목 없음.

## Draft Conventions
draft 표식 문서 없음. 규약은 기존 문서(AGENTS.md · docs 6개)를 직접 고쳤고, 코드와 대조해 일치한다.

리뷰 중 고친 것
- AGENTS.md 스케줄러 문장의 어색한 연결("없다(…)하고")
- docs/architecture.md 의존 방향(`database` → `common`)에 env 파서 추가

## Intended Behavior Check (against plan/spec)
- **#88 scheduler 앱**
  - `createApplicationContext`(listen 없음) · `DatabaseModule` · `ScheduleModule.forRoot()` · `UserModule` 으로 구성했다.
  - `nest build scheduler` 산출물이 생성된다.
- **#89 crontab 이전**
  - `git mv` 로 옮겼다(본문 · 잠금 키 그대로). scheduler repository · test helper · smoke 를 만들었다.
  - user-service 에서 crontab · `ScheduleModule` · `findUsers`(인터페이스 · mock · spec 2곳)를 제거했다.
- **#90 Docker · 인스턴스 수**
  - `compose.scheduler.yml` · `SCHEDULER_REPLICAS`(기본 1) · 스크립트(build · start · start:prod · docker · logs)를 추가했다.
  - `docker:up` 순서는 user-service → scheduler → gateway, `docker:down` 은 그 역순이다. Dockerfile 주석도 갱신했다.
- **#91 교착 수정**
  - 확인 3개에서 불일치는 `return new BadRequestException(...)` 이고, 반환 타입 · 큐 컨트롤러 타입을 바꿨다.
  - dispatcher · 인터셉터를 추가하고(user-service 루트 모듈 · `bootHttpPath` 등록), RequiresNew 를 제거했다.
  - `connectTimeoutMS` 를 넣었다.
  - 기존 확인 spec 은 디스패처 결과(failed 400 · ack · 미호출)를 단언하므로 고치지 않아도 맞다.
- 검사 통과: `npm run typecheck` · `npm run lint` · Prettier · `npm run build`(세 앱) · `docker compose -f compose.scheduler.yml config --quiet`.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Info | 배포 | 기존 user-service 컨테이너를 새 이미지로 다시 띄우기 전까지는 user-service 와 scheduler 가 모두 crontab 을 돈다 | `JobLockService` 로 회차마다 1대만 실행되므로 데이터 문제는 없다. 배포 때 user-service 를 다시 띄운다(report Remaining Issues) |
| 2 | Info | `apps/scheduler/src/user/repositories/user.repository.ts` | 형제(user-service `updateUser`)와 달리 `UK_User_Phone` → 400 분기가 없다 | 의도 — 사용자 응답이 없고 crontab 이 건별 실패를 건너뛴다(plan 에 근거 기록) |

## Verdict
Pass — 커밋 → 푸쉬 → 로드맵 진척 커밋으로 진행한다. 리뷰 261020-3 #1(High, DB 연결 풀 교착)과 #2(Low)가 이번에 해소된다.
