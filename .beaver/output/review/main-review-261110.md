# Review — main — 261110

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: 없음(direct 모드) → origin: `main`
- Included features: 통계(Phase 21 #86) — `GET /api/v1/admin-service/stats`(관리자 가드) · `/stats/mine`(매니저 가드)
- Change scope: 새 파일 — contracts 3(`stats.commands.ts` · `dto/stats.dto.ts` · `dto/stats-mine.dto.ts`) · admin-service `stats/` 12(module · symbols · constants · util · service · interface · repository · controller · test 4) · gateway `api/v1/admin-service/stats/` 2 · 기획 문서 3(spec · plan · report). 수정 — 루트 모듈 2 · README · AGENTS · docs 2 · 로드맵 · spec 보드. 스키마 변경 없음.

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | `stats.<role>.ts` · `controllers/stats.controller.ts`(동기만) · DTO `stats.dto.ts`(선례 `reservation.dto.ts` · `room.dto.ts`) · `stats-mine.dto.ts` · `STATS_REPOSITORY = Symbol('StatsRepositoryInterface')` · `STATS_INTERNAL_PATH` |
| Structure & layering | pass | 서버는 행위자(관리자 · 업체 관리자 → admin-service), 도메인은 기능 대상(통계 `stats`). controller → service → repository 단방향, 조회만이라 큐 컨트롤러 · `@Transactional` 없음. 게이트웨이는 `InternalHttpClient` 만, 핸들러마다 그룹 가드(`PassportJwtAdminAuthGuard` · `PassportJwtManagerAuthGuard`) + `@PassportActor()` 첫 파라미터 |
| Shared logic extraction | pass | service private 헬퍼 0 — 기간 · 업체 ID · 모으기는 `stats.util.ts`(파일 전용 헬퍼 4는 util 파일 안). 날짜는 `@app/common/utils/dayjs.js` 만(`dayjs.tz` · `KST_TIMEZONE`). 상태 목록은 `PAYMENT_STATE` 로 만든 도메인 상수 |
| Errors & responses | pass | 기간 오류는 입력 필드 귀속이라 `createValidationError('start_month', …)` 400, 소속 업체 없음 404 `{message}`. repository 실행 메서드 5개 try/catch → 통일 500. 응답 필드 생략 없음(빈 달 · 빈 업체도 0). `@Query()` DTO 생성자 선택 파라미터 · `super(data)` · 컨트롤러 `const dto = new X(query)` |
| Test strength | pass | service 기능 spec 2(동기 경로 부팅 — 실제 controller · service · ValidationPipe · 필터 · InternalAuthGuard · ReturnedExceptionInterceptor, repository 만 mock) — 필터 인자 · 호출 횟수 · 미호출 · 응답 전체 모양 단언, 한국어 리터럴, 분류 태그. repository spec — 통일 500 · `notDeleted` 조건 · `[SMOKE:data-access]` 7(QueryBuilder 4 + find 조건 1, SQL 전체 고정) |

**Data-access smoke**: 새 매핑 민감 메서드 5개(`buildUsageQuery` — GROUPING SETS · raw 별칭 · 동적 조립, `buildPaymentQuery` · `buildRefundQuery` — 시간대 달 · 동적 조립, `buildManagerStoreQuery` — t_user 조인, `findStatsStores` — `In` find)가 모두 Smoke 로 SQL 을 고정한다. mock 만으로 덮인 데이터 접근 메서드 없음. Smoke 목록(AGENTS Testing · docs/testing.md) 갱신됨.

**memory reconcile**: `.beaver/memory/` 에 `AGENTS.md 반영: 미반영` 항목 없음(git · api-log · cache 는 방향 · 선호 — 대상 아님). 제안할 이전 없음.

## Intended Behavior Check (against plan/spec)
- 기간: 끝 없으면 이번 달(한국 — UTC 월 경계 테스트 포함), 시작 없으면 끝 − 2개월, 시작 > 끝 · 12개월 초과 400 — spec 규칙 그대로.
- 집계: 이용자 수 · 이용 건수 = 이용 끝이 기간 안인 이용 완료 예약(기본 구간 결제의 환경으로 거름), 이용자 수는 GROUPING SETS 로 업체 · 달 · 전체 범위마다 COUNT(DISTINCT) — 합계를 업체별에서 더하지 않는다. 결제액 = 승인 시각 · 승인 상태 4종, 환불액 = 환불 신청 시각 · 신청 이후 상태 3종, 수익 = 결제 − 환불(음수 가능).
- 업체별 목록: 기본 활동 있는 지워지지 않은 업체, `has_activity=0` 이면 지워지지 않은 모든 업체(활동 없으면 0), 수익 내림차순 → 상호명 순, 페이지 — spec "업체별 목록" 그대로. 지워진 업체의 활동은 합계 · 월별에만 남는다(spec 조건의 결과 — report 에 기록).
- 내 업체: 매니저 그룹 · 탈퇴 아닌 · 지워지지 않은 소속 업체만, 없으면 404 — spec 그대로(업체 예약 현황과 같은 조건, 잠금 없음).
- 누락 · 오구현 없음. plan 대비 차이(상태 목록을 상수로 · 월 경계 테스트 추가 · 내 업체 검증 케이스 조정)는 report 에 기록.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | AGENTS.md:126 · AGENTS.md:184 | `@Query()` DTO 적용 목록에 `StatsDto` · `StatsMineDto` 가 없고, `@InternalActor('user_id')` 적용 목록에 admin-service stats `/mine` 이 없다. 같은 목록에 Phase 20 의 `UserListDto` · `UserReservationListDto` · `ManagerAccountListDto` · manager `/account` 와 store `StoreMineUnavailablePeriodListDto` 도 빠져 있다(문서만 — 코드 영향 없음) | 두 목록을 실제 코드 기준으로 보완 — 이번 커밋에 함께 |

## Verdict
Pass — 코드 수정 사항 없음. Finding #1 은 사용자 승인으로 같은 커밋에서 보완했다 — AGENTS.md `@Query()` DTO · `@InternalActor` 적용 목록, docs/conventions.md 적용 목록을 실제 코드(`@Query() query:` 17종 · `@InternalActor('user_id')` 사용 컨트롤러) 기준으로 채움.
