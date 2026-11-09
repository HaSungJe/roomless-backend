# Report — stats

## Feature Summary
- **Feature**: 통계(Phase 21) — 월 단위 기간(기본 이번 달 포함 최근 3개월, 최대 12개월)의 이용자 수 · 이용 건수 · 결제액 · 환불액 · 수익을 합계 · 월별로 보여 준다.
  - 총관리자 · 관리자: 전체 + 업체별 목록(기본 기간 안 활동이 있는 업체만, `has_activity=0` 이면 모든 업체 — 수익 내림차순 → 상호명 순, 페이지)
  - 업체 총관리자 · 업체 관리자: 자기 업체만
  - 결제 환경 LIVE(기본) · TEST 를 입력으로 고른다
  - 기준: 이용자 수 · 이용 건수는 이용 끝이 기간 안인 이용 완료 예약(이용자 수는 범위마다 중복 제거), 결제액은 승인 시각, 환불액은 환불 신청 시각 — 모두 한국 달
- **Entry point**: `GET /api/v1/admin-service/stats`(관리자 가드) · `GET /api/v1/admin-service/stats/mine`(매니저 가드) — 동기(내부 HTTP)만, 큐 없음
- **Domain**: stats(admin-service 새 도메인) — 로드맵 Phase 21 #86. 읽기만, 스키마 변경 없음
- **Plan**: [stats-plan.md](../../plan/stats/stats-plan.md) · **Spec**: [stats-spec.md](../../spec/stats/stats-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/contracts/src/stats/stats.commands.ts` | created | `STATS_INTERNAL_PATH`(`ALL` · `MINE` — 조회만이라 명령 없음) |
| `libs/contracts/src/stats/dto/stats.dto.ts` · `stats-mine.dto.ts` | created | 전체 통계 query(월 · 환경 · 업체 범위 · 페이지) · 결과(기간 · 합계 · 월별 · 업체별), 내 업체 통계 query(월 · 환경) · 결과(기간 · 업체 · 합계 · 월별) |
| `apps/admin-service/src/stats/stats.constants.ts` · `stats.symbols.ts` | created | 기본 3개월 · 최대 12개월 · 결제액 상태 4종 · 환불액 상태 3종(`PAYMENT_STATE` 상수로) · 업체 범위 · 탈퇴 업체, `STATS_REPOSITORY` |
| `apps/admin-service/src/stats/stats.util.ts` | created | `resolveStatsPeriod`(한국 이번 달 · 기본 기간 · 시작 > 끝 · 12개월 초과 사유) · `collectStatsStoreIds` · `toStats`(GROUPING 행 가르기 · 금액 합 · 빈 달 0 · 수익 순 정렬), 파일 전용 헬퍼 4 |
| `apps/admin-service/src/stats/interfaces/stats.repository.interface.ts` · `repositories/stats.repository.ts` | created | `buildUsageQuery`(기본 구간 결제 조인 · GROUPING SETS) · `buildPaymentQuery` · `buildRefundQuery`(한국 달 · 업체 조건 동적) · `buildManagerStoreQuery`(t_user 조인 · 탈퇴 제외 · 잠금 없음) · `findStatsStores`(`notDeleted`) |
| `apps/admin-service/src/stats/stats.service.ts` | created | `getStats`(기간 → 집계 3 → 업체 → 모으기 → 업체 목록 페이지 자르기) · `getMyStats`(소속 업체 404 → 기간 → 그 업체 집계) |
| `apps/admin-service/src/stats/controllers/stats.controller.ts` · `stats.module.ts` | created | 내부 HTTP 2(`/`, `/mine` — `@InternalActor('user_id')`) |
| `apps/admin-service/src/admin-service.module.ts` | modified | `StatsModule` 등록 · 주석 |
| `apps/gateway/src/api/v1/admin-service/stats/` (module · controllers/stats.controller.ts) | created | 공개 라우트 2(전체 — 관리자 가드, `/mine` — 매니저 가드) |
| `apps/gateway/src/gateway.module.ts` | modified | `StatsModule` · 주석 |
| `apps/admin-service/src/stats/test/` (test-helper · spec 3) | created | 아래 Tests Written |
| `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/testing.md` | modified | 통계 라우트 · 도메인 트리 · 라우트 표 · admin-service 모듈 목록(빠져 있던 `UserModule` 도 같이) · Smoke 목록 · 조회만 도메인의 테스트 도우미 |

## Tests Written
- `stats.spec.ts`(동기 `GET /internal/v1/admin-service/stats`, 지금 2026-11-09 12:00 한국 고정)
  - `[CASES:stats-period]` 6 + 한국 시각 경계 1(2026-10-31 16:00 UTC → 끝 월 2026-11) — 세 집계에 넘긴 필터(from · to · LIVE · store_id null) · 응답 `period` · 월 목록. 13개월 · 시작 > 끝 400(`validation_errors.start_month`, 집계 · 업체 조회 없음).
  - `[CASES:stats-aggregate]` 7 — 빈 집계(모든 달 0 · 업체 조회 없음) · 결제 − 환불 · 이용자 수 중복 제거(합계 3 · 업체 2 · 2) · 빈 달 채움 순서 · 수익 순(같으면 상호명) · 환불만(음수) · 문자열 집계 값 → 숫자.
  - `[SUCCESS]` 4 — 활동 업체 ID `In`(중복 없이) · `has_activity=0` 이면 `findStatsStores({})` + 활동 없는 업체 0 · 환경 TEST · 업체 목록 페이지(size 1 · page 2).
  - `[FAIL:validation]` 5(월 형식 3 · 환경 · 범위) · 내부 토큰 없음 403.
- `stats-mine.spec.ts`(동기 `GET …/stats/mine`) — 소속 업체로만 집계(필터 store_id · 업체 목록 없음 · 응답 전체 모양) · 기간 · 환경 입력, 소속 업체 없음 404(집계 없음) · 기간 400 2 · 검증 3.
- `stats.repository.spec.ts` — `findStatsStores` 조건(`is_deleted: 0`) · 통일 500 5, `[SMOKE:data-access]` 7: 이용 집계(전체 · 내 업체 — 별칭 = `StatsUsageRow` 키 · `GROUPING SETS` · `COUNT(DISTINCT)`) · 결제 집계(전체 · 내 업체) · 환불 집계 · 매니저 소속 업체(잠금 없음) · 업체 find(`In` · 지워지지 않은 업체).
- 게이트웨이 라우트 · 모듈 등록 · contracts 경로 상수는 plan 대로 spec 없음(위임형).

## Verification
- `npm run typecheck` · `npm run lint` · `npm run build`(4개 앱) 통과, 새 파일 Prettier 적용. 스키마 변경 없음.
- 테스트(AGENTS 허용 범위의 확인 실행): 통계 3파일 47건, 전체 121파일 1346건 통과. Smoke SQL 은 빌드 출력으로 채웠다 — `GROUPING(...)` 인자와 `GROUPING SETS` 의 달 식이 같은 문자열로 나와 PostgreSQL 이 묶음 식으로 알아본다.
- 게이트웨이는 DTO 의 `start_month` · `end_month` null 을 쿼리에서 뺀다(`toQueryString` — null 제외)라 내부 검증에 `'null'` 문자열이 가지 않는다.
- plan 대비 차이
  - 결제 · 환불 상태 목록을 문자열 대신 `PAYMENT_STATE` 상수로 만든다(값 같음).
  - 기간 테스트에 한국 시각 월 경계 1건을 더했다(UTC 로는 10월 · 한국은 11월).
  - 내 업체 통계 검증 케이스는 끝 월 형식을 더하고, 선언 안 된 필드(`has_activity`) 거부는 라이브러리 영어 문구라 단언하지 않았다.
- 알려 둘 동작: 지워진 업체(`is_deleted = 1`)의 활동은 합계 · 월별에는 들어가고 업체별 목록에는 나오지 않는다(목록은 지워지지 않은 업체만 — spec 의 업체 목록 조건).

## Remaining Issues
- 사용자(배포 — ship 때 로드맵 사용자 할 일에 정리): admin-service · gateway 이미지 다시 빌드 · 배포(마이그레이션 없음).
