---
# One-line feature summary (e.g. "Admin user sign-up")
feature_goal: "API 로그(Phase 22) — 게이트웨이가 모든 HTTP 요청(성공 · 실패와 그 사유)을 응답이 끝난 뒤 로그 전용 DB 연결로 t_api_log 에 바로 넣고, t_api_log 를 한국 달 월 파티션으로 나눈다"

# Domain/module name (see AGENTS.md for the project directory structure)
domain: "api-log — gateway modules/api-log(기록 미들웨어 · 로그 전용 DB 적재 — 인프라), scheduler api-log(파티션 미리 만들기 crontab), libs/database(엔티티 · 로그 전용 연결 설정 · 파티션 마이그레이션 · 파티션 util), libs/common(예외 필터 stack)"

# Roadmap phase this feature belongs to (number), when a roadmap exists — the spec board uses it to show
#   "지금 작업 중" (in-progress / Next up phase) and to mark the feature 배포 once the phase is done. Empty if none.
roadmap_phase: 22

# Entry-point method/endpoint. Record the entry-point identifier this project actually uses,
#   derived from code evidence (path:line), in the project's own naming. Do not assume a
#   particular position's syntax. (key name "api_method" stays as-is)
api_method: "게이트웨이 전역 미들웨어(모든 HTTP 요청 — 응답이 끝나면 로그 전용 DB 연결로 insert) · scheduler crontab(매일 — 파티션 미리 만들기). 새 공개 라우트 · 큐 명령 없음"

# Path/signature (e.g. "/api/v1/user/admin/sign")
#   Record the path or signature this project actually uses, from code evidence (path:line),
#   in the project's own naming. (key name "api_path" stays as-is)
api_path: "gateway MiddlewareConsumer.apply(ApiLogMiddleware).forRoutes('*') → ApiLogWriter.write → t_api_log · scheduler crontab api-log.partition"

# Affected state — write/persist targets. Basis for sizing the test cases. (key name "affected_data" stays as-is)
#   Record the state this project actually writes/persists, derived from code evidence (path:line),
#   in the project's own naming. Read-only reads are not "write" but are still data. Leave empty if none.
affected_data:
  - "t_api_log — insert 만, 게이트웨이가 직접(libs/database/src/entities/api-log/api-log.entity.ts:12 — 지금은 쓰는 코드가 없다). 일반 테이블 → created_at RANGE 월 파티션 테이블로 바꾼다(마이그레이션), 파티션 t_api_log_YYYYMM(한국 달) + t_api_log_default"
  - "스키마 — 파티션 추가(CREATE TABLE … PARTITION OF, scheduler crontab). 지우는 동작 없음(보관 기간 없음)"
---

## Feature Description

게이트웨이로 들어온 모든 HTTP 요청을 응답이 끝난 뒤 한 행씩 남긴다 — 경로 · 입력 · 상태 · 응답(실패 사유) · 회원 · IP · 처리 시간.
게이트웨이가 로그 전용 DB 연결(t_api_log 만, 작은 풀)로 바로 넣는다 — 게이트웨이의 유일한 DB 사용이다(큐 · 서비스를 거치지 않는다).
t_api_log 는 한국 달 기준 월 파티션으로 바꾸고, scheduler 가 앞으로 3개월 파티션을 미리 만든다. 오래된 로그는 지우지 않는다.

## API Spec
- Method: 게이트웨이 전역 미들웨어 → 로그 전용 DB 연결 insert(기다리지 않음)
- Path:
  - 기록: 게이트웨이의 모든 HTTP 요청(`MiddlewareConsumer.apply(…).forRoutes('*')` — 없는 경로 404 · 가드 401 · 검증 400 · 브로커 503 도 지난다). 제외: Swagger 문서 경로(`SWAGGER_PATH`, 기본 `swagger`)
  - 파티션: scheduler `api-log` 도메인 crontab(매일 03:00, 운영 전용, `JobLockService` 잠금 `api-log.partition`)
- Request(t_api_log 한 행 — 게이트웨이가 만든다):
  - `created_at` — 요청 시각(게이트웨이가 받은 때)
  - `method` · `path`(맞은 라우트 패턴 `/api/v1/admin-service/user/:user_id`, 없는 경로는 실제 경로 — 쿼리 제외, 500자)
  - `request_param` · `request_query` · `request_body`(빈 객체면 null)
  - `status_code` — HTTP 상태. 큐 경로(SSE)는 마지막 이벤트가 failed 면 그 `status_code`, 그 밖은 HTTP 상태(200)
  - `response_body` — JSON 응답은 객체, SSE 는 마지막 이벤트 `{event, data}`(done · failed · pending), 그 밖은 문자열 · 없으면 null
  - `error_stack` — 게이트웨이 안에서 예상 못 한 오류(HttpException 이 아닌 Error)의 stack, 아니면 null
  - `user_id`(가드를 지난 로그인 계정 — 이용자 · 매니저 · 관리자, 없으면 null) · `ip`(trust proxy 반영 클라이언트 IP) · `user_agent`(500자) · `duration_ms`(받은 때 → 응답 끝)
- Response: 없음 — 기존 응답에 영향 없음. 적재 실패(DB 없음 · 연결 실패 · insert 실패)는 게이트웨이 인프라 Logger 경고만, 그 로그만 빠진다

## Business Rules
- **게이트웨이가 만들고 바로 넣는다**(사용자 결정 2026-11-10) — 로그 내용도, t_api_log insert 도 게이트웨이다. 큐 명령 · 서비스 쪽 api-log 도메인은 없다. 서비스는 자기 내부 HTTP · 명령을 따로 남기지 않으므로, 서비스 안에서 터진 오류는 게이트웨이가 받은 실패 본문(`서버에서 오류가 발생했습니다…`)까지만 남는다.
- **게이트웨이 DB 사용은 API 로그 하나뿐** — 로그 전용 DataSource(엔티티 `ApiLogEntity` 하나 · 마이그레이션 없음 · 풀 5 · `DATABASE_URL`)로 비즈니스 쿼리와 섞이지 않는다. 그래서 게이트웨이에도 `DATABASE_URL` 이 필요하다(compose 필수값).
- **모든 요청 · 성공 · 실패와 그 사유**(사용자 결정 2026-11-10) — 조회 포함 모든 메서드, 실패 본문(`message` · `validation_errors`)이 곧 사유다. 마스킹 없음(beaver memory api-log — 비밀번호 포함 평문).
- **응답 속도 · 부팅에 영향 없음** — 응답이 끝난 뒤(`finish` · `close` — 한 번만) insert 하고 기다리지 않는다. 연결은 처음 쓸 때 열고(DB 가 없어도 게이트웨이는 뜬다), 실패하면 다음 로그 때 다시 연결한다.
- **월 파티션** — `created_at` RANGE, 경계는 한국 달 1일 00:00(`t_api_log_202611` = [2026-11-01 00:00 KST, 2026-12-01 00:00 KST)). 범위 밖 행은 `t_api_log_default` 로 — insert 가 실패하지 않는다.
- **파티션 미리 만들기** — scheduler crontab 이 매일 이번 달 + 앞으로 3개월(`API_LOG_AHEAD_MONTHS`)을 `IF NOT EXISTS` 로 만든다(두 번 돌아도 같다). 그 달의 행이 이미 default 에 있어 만들 수 없으면 그 달만 건너뛴다(crontab 건별 실패 규칙). 운영(`NODE_ENV=production`)에서만 돈다.
- **지우지 않는다**(사용자 결정 2026-11-10) — 보관 기간 · 파티션 DROP 없음. 소프트 삭제 규칙의 예외를 만들지 않는다(`is_deleted` 도 두지 않는다 — 지우는 동작이 없는 테이블).
- **기존 t_api_log 전환** — 마이그레이션이 기존 테이블을 옆으로 옮기고(이름 · PK · 인덱스 · 시퀀스 이름 변경) 파티션 테이블을 만든 뒤, 이번 달 + 3개월 파티션 · default 를 만들고 기존 행을 옮겨 담고 시퀀스를 이어 맞춘 다음 옮긴 옛 테이블을 지운다(행은 모두 새 테이블에 있다). down 은 반대로.

## TDD Cases
- 테스트 생략(규칙): 게이트웨이 미들웨어 · 로그 전용 DB 적재 · util(응답 본문 · SSE 마지막 이벤트 · 경로), libs/database 파티션 util(달 목록), scheduler crontab — AGENTS Testing 이 util · 게이트웨이 인프라 · crontab spec 을 두지 않는다(사용자 결정 2026-11-10 — 규칙대로)
- [SMOKE:data-access] scheduler 파티션 만들기 — 받은 달의 DDL(`CREATE TABLE IF NOT EXISTS "t_api_log_202611" PARTITION OF "t_api_log" FOR VALUES FROM ('2026-11-01T00:00:00+09:00') TO ('2026-12-01T00:00:00+09:00')`)을 그대로 실행
- [FAIL:repository] scheduler 파티션 DDL 실패는 통일 500

## Notes
- 엔티티는 이미 있다 — `libs/database/src/entities/api-log/api-log.entity.ts:12`(PK `(api_log_id, created_at)` — 파티션 키를 PK 에 넣으려고 처음부터 복합). 컬럼은 바꾸지 않고 `path` 의 COMMENT 와 클래스 JSDoc 만 고친다. 예전 사용처에서 쓰던 엔티티(MySQL — `id` · `create_at`)와 같은 컬럼이다(1792477492198-RenameColumns 로 이름을 맞춤).
- 예전 코드(`.back/src/modules/api-log/` — 참고만): 인터셉터 + `res.send` 가로채기 + `finish` · `close` 1번 저장, 로그 전용 DataSource(`API_LOG_DATASOURCE_NAME` · 풀 5)로 비즈니스 풀과 분리. 지금은 가드 실패 · 없는 경로도 남겨야 해 인터셉터 대신 미들웨어(가드보다 먼저 돈다), SSE 는 `res.write` 도 가로챈다. `TypeOrmModule` 은 DB 가 없으면 부팅을 막으므로 DataSource 를 직접 두고 처음 쓸 때 연다.
- 게이트웨이는 지금 DB 를 쓰지 않는다(`apps/gateway/src/gateway.module.ts:21` · `docs/architecture.md:31` · `compose.gateway.yml:21` — `DATABASE_URL: ''` 로 막아 둠) — 이 규칙을 "API 로그 적재만 예외" 로 바꾼다. 게이트웨이는 이미 `roomless-data` 네트워크에 있어(Redis) postgres 에 닿는다.
- 파티션 테이블 읽기 — TypeORM 이 파티션 부모(`relkind 'p'`)를 테이블로 읽고 자식 파티션은 뺀다(`node_modules/typeorm/driver/postgres/PostgresQueryRunner.js:2070` · `:2090` — `relkind IN ('r', 'p')` · 인덱스는 `relispartition = 'f'`) — `db:check` 로 build 때 확인한다.
- 연결 수 — 게이트웨이 인스턴스마다 로그 전용 연결 최대 5개(`GATEWAY_REPLICAS` × 5)가 비즈니스 풀에 더해진다.

## Proposals (Codebase-Based)
- [x] 로그 전용 DataSource 설정은 `libs/database/src/typeorm.config.ts` 한 곳(`buildApiLogDataSourceOptions` — 같은 `DATABASE_URL` · 연결 대기 시간, 엔티티 하나 · 풀 5)
- [x] 파티션 달 계산은 libs/database 한 곳 — 마이그레이션(초기 파티션) · scheduler(미리 만들기)가 같은 util 을 쓴다(AGENTS "여러 앱이 쓰는 인프라는 libs")
- [x] 게이트웨이 예상 못 한 오류의 stack — 공통 `CustomErrorFilter`(libs/common/src/exception/custom-error.filter.ts) 가 HttpException 이 아닌 Error 면 `res.locals` 에 stack 을 남기고 미들웨어가 읽는다(서비스에서는 읽는 곳이 없어 영향 없음)

## Decisions
- [x] 적재 위치 — 게이트웨이가 로그 전용 DB 연결로 직접 넣는다(사용자 결정 2026-11-10, 로드맵 Open Decision — 처음의 "큐 → 경로의 서비스" 를 바꿈)
- [x] 기록 대상 — 게이트웨이만(서비스 내부 기록 없음)(사용자 결정 2026-11-10)
- [x] 범위 — 모든 요청 · 성공 · 실패와 사유(Swagger 문서만 제외)(사용자 결정 2026-11-10)
- [x] 보관 — 지우지 않음(사용자 결정 2026-11-10)
- [x] 테스트 — 규칙대로(util · 게이트웨이 인프라 · crontab spec 없음)(사용자 결정 2026-11-10)
