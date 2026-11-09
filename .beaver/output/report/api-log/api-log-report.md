# Report — api-log

## Feature Summary
- **Feature**: API 로그(Phase 22) — 게이트웨이가 모든 HTTP 요청(성공 · 실패와 그 사유 — 경로 · 입력 · 상태 · 응답 · 회원 · IP · 처리 시간)을 응답이 끝난 뒤 로그 전용 DB 연결로 `t_api_log` 에 바로 넣는다. `t_api_log` 는 한국 달 RANGE 월 파티션 테이블로 바꾸고, scheduler 가 이번 달 + 3개월 파티션을 미리 만든다(지우지 않음)
  - 게이트웨이의 유일한 DB 사용 — 로그 전용 DataSource(엔티티 하나 · 풀 5 · 처음 쓸 때 연결), DB 가 없거나 실패하면 그 로그만 빠진다(부팅 · 응답 영향 없음)
  - 서비스는 자기 내부 처리를 따로 남기지 않는다(사용자 결정 2026-11-10 — 게이트웨이가 만들고 바로 넣는다)
- **Entry point**: 게이트웨이 전역 미들웨어(`GatewayModule.configure` → `ApiLogMiddleware` · `forRoutes('*')`, Swagger 문서 제외) → `ApiLogWriter` · scheduler crontab `api-log.partition`(매일 03:00, 운영 전용). 새 공개 라우트 · 큐 명령 없음
- **Domain**: api-log — gateway `modules/api-log`, scheduler `api-log`, libs/database · libs/common. 로드맵 Phase 22 #87
- **Plan**: [api-log-plan.md](../../plan/api-log/api-log-plan.md) · **Spec**: [api-log-spec.md](../../spec/api-log/api-log-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/api-log-partition.ts` | created | `API_LOG_AHEAD_MONTHS`(3) · `API_LOG_DEFAULT_PARTITION` · `buildApiLogPartitions`(한국 달 경계) · `toCreateApiLogPartitionSql`(IF NOT EXISTS) |
| `libs/database/src/typeorm.config.ts` | modified | `API_LOG_POOL_SIZE`(5) · `buildApiLogDataSourceOptions`(엔티티 하나 · 마이그레이션 없음) |
| `libs/database/src/entities/api-log/api-log.entity.ts` | modified | 클래스 JSDoc · `path` COMMENT(라우트 패턴) — 컬럼 그대로 |
| `libs/database/src/migrations/1794253561123-ApiLogPartition.ts` · `migrations.ts` | created · modified | 손으로 쓴 마이그레이션 — 옛 테이블 옆으로 → 파티션 테이블 + 주석 · 인덱스 → 이번 달 + 3개월 · default → 행 옮기기 · `setval` → 옛 테이블 DROP, down 은 반대로 |
| `libs/common/src/exception/custom-error.filter.ts` | modified | HttpException 이 아닌 Error 의 stack 을 `res.locals.error_stack`(`ERROR_STACK_LOCAL`) 에 |
| `apps/gateway/src/modules/api-log/` (util · writer · middleware · module) | created | 응답 조각 모으기(`res.write` · `res.end`) · `finish` / `close` 1번 · 라우트 패턴 · 응답 본문(JSON · SSE 마지막 이벤트 — failed 면 그 상태) · 길이 자르기 · 로그 전용 연결 insert |
| `apps/gateway/src/gateway.module.ts` | modified | `ApiLogModule` · `NestModule.configure` · 주석(DB 는 API 로그만) |
| `apps/scheduler/src/api-log/` (module · symbols · interfaces · repositories · crontabs) · `apps/scheduler/src/scheduler.module.ts` | created · modified | 파티션 미리 만들기 crontab(`JobLockService` · 건별 실패 건너뜀) · DDL repository |
| `compose.gateway.yml` · `.env.example` | modified | 게이트웨이에 `DATABASE_URL` 필수 전달(빈 값 덮기 삭제) · 주석 |
| `apps/scheduler/src/api-log/test/api-log.repository.spec.ts` | created | 아래 Tests Written |
| `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/data-layer.md` · `docs/testing.md` | modified | 게이트웨이 API 로그(DB 예외) · scheduler crontab · 월 파티션 테이블 규칙 · Smoke 목록 · 트리 |

## Tests Written
- `apps/scheduler/src/api-log/test/api-log.repository.spec.ts`
  - `[SMOKE:data-access]` `createPartition` 이 `tx.query` 에 넘긴 DDL 전체 고정 — 2026-11 · 연도 넘김 2026-12 → 2027-01, 호출 1번.
  - `[FAIL:repository]` 실행 실패(default 에 그 달 행 있음 등) → 통일 500.
- 게이트웨이 미들웨어 · writer · util, 파티션 util, crontab 은 plan 대로 spec 없음(AGENTS Testing — util · 게이트웨이 인프라 · crontab spec 을 두지 않는다, 사용자 결정 2026-11-10).

## Verification
- `npm run typecheck` · `npm run lint` · `npm run build`(4개 앱) · `npm run db:check`(파티션 테이블 — 엔티티와 일치) 통과, 새 파일 Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): 전체 122파일 1349건 통과(새 spec 3건 포함, 예외 필터를 바꿨지만 기존 서비스 spec 그대로 통과).
- 마이그레이션 실제 동작(임시 스크립트 — PGlite, 지움):
  - up: `relkind p`, 파티션 202611 ~ 202702 + default, 옛 테이블 행 2개가 제 달 · default 로 옮겨지고 옛 테이블 없음, 새 insert ID 가 이어짐(1, 2, 3).
  - default 에 행이 있는 달(2030-01) 만들기 → PostgreSQL 거부("default partition … would be violated") — crontab 이 그 달만 건너뛰는 근거. 없는 달은 두 번 만들어도 그대로.
  - down: 일반 테이블(`relkind r`) · 행 3개 그대로 · 파티션 없음. 다시 up 후 엔티티 차이 0건.
- 미들웨어 실제 흐름(임시 spec — 메모리 안 Nest 앱 + supertest, 서버 기동 없음, 지움): 맞은 라우트는 패턴 `/api/v1/user-service/thing/:thing_id` · param · query · 응답 객체, 없는 경로는 실제 경로 · 404 · 실패 본문, 가드 실패 401 · 사유, 예상 못 한 오류 500 · `error_stack`, SSE 는 마지막 이벤트 `{event: 'failed', data}` · 상태 400, `/swagger-json` 은 남지 않음, `created_at` Date · `duration_ms` 숫자.
- compose: 가짜 값 폴더에서 `docker compose -f compose.gateway.yml config -q` 통과, `DATABASE_URL` 을 빼면 "required variable DATABASE_URL is missing" 으로 막힘(실제 `.env` 는 읽지 않음).
- plan 대비 차이
  - `ApiLogWriter` 의 insert 에 `QueryDeepPartialEntity<ApiLogEntity>` 로 타입만 좁힌다 — jsonb 컬럼이 `unknown` 이라 insert 의 부분 엔티티 타입과 맞지 않는다(엔티티 인스턴스 그대로라 훅은 돈다).
  - AGENTS 레이어 조항에 "repository 만 TypeORM" 의 예외(게이트웨이 `ApiLogWriter`)를 적었다.

## Remaining Issues
- 사용자(배포 — ship 때 로드맵 사용자 할 일에 정리): `.env` 의 `DATABASE_URL` 이 게이트웨이에도 전달된다(compose 필수값), 마이그레이션 `ApiLogPartition` 적용, gateway · scheduler 새 이미지.
- 게이트웨이 인스턴스마다 DB 연결이 최대 5개 늘어난다(`GATEWAY_REPLICAS` × 5) — DB 최대 연결 수 여유 확인.
