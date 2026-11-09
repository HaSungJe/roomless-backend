# Review — main — 261110-2

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: 없음(direct 모드) → origin: `main`
- Included features: API 로그(Phase 22 #87) — 게이트웨이 모든 HTTP 요청 → 로그 전용 DB 연결로 `t_api_log` 적재, `t_api_log` 한국 달 월 파티션 · scheduler 파티션 미리 만들기
- Change scope: 새 파일 — gateway `modules/api-log/` 4 · scheduler `api-log/` 6(spec 포함) · `libs/database/src/api-log-partition.ts` · 마이그레이션 `1794253561123-ApiLogPartition.ts` · 기획 문서 3(spec · plan · report). 수정 — 게이트웨이 · scheduler 루트 모듈 · `typeorm.config.ts` · `migrations.ts` · 엔티티 주석 · 예외 필터 · `compose.gateway.yml` · `.env.example` · README · AGENTS · docs 3 · 로드맵 · spec 보드

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 인프라 `api-log.<role>.ts`(middleware · writer · util · module), 도메인 `api-log.symbols.ts` · `crontabs/api-log-partition.crontab.ts` · `API_LOG_REPOSITORY = Symbol('ApiLogRepositoryInterface')`, 잠금 키 `api-log.partition`, 마이그레이션 `<ts>-ApiLogPartition` |
| Structure & layering | pass | 게이트웨이 적재는 인프라(`modules/api-log`) — 도메인 계층 없음. "게이트웨이는 DB 를 쓰지 않는다 · repository 만 TypeORM" 의 예외를 사용자 결정(2026-11-10)대로 하나만 두고 AGENTS 레이어 조항 · docs/architecture.md · 게이트웨이 루트 주석 · compose 주석에 적었다. crontab 은 scheduler 에만 · 운영 가드 · `JobLockService.runExclusive` · 건별 실패 건너뜀. 날짜는 `@app/common/utils/dayjs.js` 만 |
| Shared logic extraction | pass | 파티션 달 · DDL 은 `libs/database/src/api-log-partition.ts` 하나를 마이그레이션 · scheduler 가 같이 쓴다. 로그 전용 연결 설정은 `typeorm.config.ts` 한 곳. 게이트웨이 util 의 파일 전용 헬퍼는 util 파일 안(허용). 로깅은 인프라 클래스(`ApiLogWriter`)만 |
| Errors & responses | pass | 기록 · 적재는 응답에 영향 없음(끝난 뒤 · 기다리지 않음 · 실패는 경고). scheduler repository DDL 실패 → 통일 500, crontab 이 건별로 잡는다. 공통 예외 필터는 응답 본문 · 상태를 바꾸지 않고 `res.locals` 에만 남긴다 |
| Test strength | pass | plan 의 정책대로 — scheduler repository spec(`[SMOKE:data-access]` DDL 전체 고정 2 · 통일 500 1, 호출 횟수 · 인자). 게이트웨이 인프라 · util · crontab 은 AGENTS Testing 규칙상 spec 없음(사용자 결정 — 규칙대로). 대신 build 때 임시 검증(PGlite 마이그레이션 up/down · 메모리 안 Nest 앱 미들웨어 흐름)을 돌리고 지웠다(report Verification) |

**Data-access smoke**: 새 데이터 접근은 scheduler `createPartition`(raw DDL) — Smoke 로 `tx.query` 에 넘긴 SQL 을 고정했다. 게이트웨이 `ApiLogWriter.insert` 는 엔티티 인스턴스 그대로의 단순 insert(매핑 민감 구성 없음). 스키마는 `npm run db:check` 통과(파티션 부모를 TypeORM 이 엔티티와 같게 읽음). Smoke 목록(AGENTS · docs/testing.md) 갱신됨.

**memory reconcile**: `.beaver/memory/` 에 `AGENTS.md 반영: 미반영` 항목 없음 — 제안할 이전 없음. api-log memory(마스킹 없음)는 그대로 지켰다(로그에 본문 그대로).

**draft 문서**: `beaver:draft` 표시 문서 없음 — 새 규약(월 파티션 테이블 · 게이트웨이 DB 예외)은 build 에서 AGENTS · docs/data-layer.md · docs/architecture.md 에 바로 확정 문구로 적었다.

## Intended Behavior Check (against plan/spec)
- 기록 범위: 모든 HTTP 요청(가드보다 먼저 거는 미들웨어 — 404 · 401 · 400 · 500 포함), Swagger 문서 제외 — 임시 흐름 검증으로 확인(report).
- 내용: 라우트 패턴(없는 경로는 실제 경로) · param · query · body(빈 객체 null) · 상태(SSE 는 마지막 failed 의 status_code) · 응답(JSON 객체 · SSE 마지막 이벤트 · 문자열) · 예상 못 한 오류 stack · 회원 · IP · UA · 처리 시간, 길이 제한 컬럼 자르기 — spec 그대로.
- 적재: 게이트웨이가 로그 전용 DataSource(엔티티 하나 · 풀 5 · 처음 쓸 때 연결)로 바로 — 큐 · 서비스 도메인 없음(사용자 결정 2026-11-10 — 기획 중 "경로의 서비스" 에서 바꿈). DB 없음 · 실패는 그 로그만 빠짐.
- 파티션: 한국 달 경계 · 이번 달 + 3개월 · default · IF NOT EXISTS · 지우지 않음 · 기존 행 옮겨 담기 · down — PGlite 로 up/down/행 이동/default 충돌 거부까지 확인.
- 누락 · 오구현 없음. plan 대비 차이(insert 타입 좁히기 · AGENTS 레이어 예외 문구)는 report 에 기록.

참고(설계상 감수 — finding 아님): DB 가 내려가 있으면 요청마다 연결을 다시 시도하고 경고 로그를 남긴다(spec "다음 로그 때 다시 연결"). 게이트웨이 인스턴스마다 DB 연결이 최대 5개 늘어난다 — 배포 안내에 DB 최대 연결 수 확인을 적는다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| — | — | — | 없음 | — |

## Verdict
Pass — no issues.
