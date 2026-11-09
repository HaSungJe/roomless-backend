---
# One-line feature summary (e.g. "Admin user sign-up")
feature_goal: "통계(Phase 21) — 월 단위 기간(기본 이번 달 포함 최근 3개월, 최대 12개월)의 이용자 수(이용 완료한 서로 다른 이용자) · 이용 건수 · 결제액 · 환불액 · 수익(결제 − 환불)을 합계 · 월별 추이로 보여 준다. 총관리자 · 관리자는 전체 + 업체별 목록, 업체 관리자는 자기 업체만. 결제 환경(LIVE · TEST)을 고른다"

# Roadmap phase this spec belongs to (spec board focus)
roadmap_phase: 21

# Domain/module name (see AGENTS.md for the project directory structure)
domain: "stats — admin-service stats(새 도메인 — 총관리자 · 관리자 전체 통계, 업체 관리자 자기 업체 통계), gateway api/v1/admin-service/stats, libs/contracts/src/stats. 공유 DB 의 t_reservation · t_reservation_detail · t_payment · t_store 읽기만. 스키마 변경 없음"

# Entry-point method/endpoint. Record the entry-point identifier this project actually uses,
#   derived from code evidence (path:line), in the project's own naming. Do not assume a
#   particular position's syntax. (key name "api_method" stays as-is)
api_method: "동기 GET 전체 통계(관리자 가드) · 동기 GET 내 업체 통계(매니저 가드) — 조회만, 큐 없음"

# Path/signature (e.g. "/api/v1/user/admin/sign")
#   Record the path or signature this project actually uses, from code evidence (path:line),
#   in the project's own naming. (key name "api_path" stays as-is)
api_path: "GET /api/v1/admin-service/stats → /internal/v1/admin-service/stats · GET /api/v1/admin-service/stats/mine → /internal/v1/admin-service/stats/mine"

# Affected state — write/persist targets. Basis for sizing the test cases. (key name "affected_data" stays as-is)
#   Record the state this project actually writes/persists, derived from code evidence (path:line),
#   in the project's own naming. Read-only reads are not "write" but are still data. Leave empty if none.
affected_data:
  - "읽기만 — t_reservation(이용 완료 · 업체 · 이용자 · 끝) · t_reservation_detail(기본 구간 → 결제 환경, 결제 → 예약) · t_payment(금액 · 승인 시각 · 환불 금액 · 환불 신청 시각 · 결제 환경) · t_store(상호명 · 업체코드 · 상태) · t_user(업체 관리자의 소속 업체)"
---

## Feature Description

관리자 메인 화면의 통계 — 월 단위 기간(기본 이번 달 포함 최근 3개월)의 이용자 수 · 이용 건수 · 결제액 · 환불액 · 수익을 합계와 월별 추이로 보여 준다.
총관리자 · 관리자는 전체 합계 · 월별 + 업체별 목록(기본 기간 안 활동이 있는 업체만, 필터로 모든 업체 — 수익 내림차순 · 페이지)을, 업체 관리자는 자기 업체의 합계 · 월별을 본다.
이용자 수는 기간 안에 이용을 마친 서로 다른 이용자, 수익은 결제 기준(결제액 − 환불액)이고, 토스 결제 환경(LIVE · TEST)을 골라 본다(사용자 결정 2026-11-09).

## API Spec

### 1. 전체 통계 (동기 — 총관리자 · 관리자)
- Method: GET (`PassportJwtAdminAuthGuard` — `@Roles` 없음, 기존 업체 관리와 같다)
- Path: `/api/v1/admin-service/stats` → 내부 `/internal/v1/admin-service/stats`
- Request query:
  - `start_month` · `end_month` (선택, `YYYY-MM`) — 없으면 끝 = 이번 달(한국), 시작 = 끝 − 2개월(이번 달 포함 3개월). 하나만 오면 빠진 쪽: 끝이 없으면 이번 달, 시작이 없으면 끝 − 2개월
  - `environment` (선택, `LIVE` · `TEST`, 기본 `LIVE`) — 토스 결제 환경
  - `has_activity` (선택, `1` · `0`, 기본 `1`) — 업체별 목록: 1 = 기간 안 활동(이용 완료 · 결제 · 환불)이 있는 업체만, 0 = 지워지지 않은 모든 업체(활동 없으면 0)
  - `page` · `size` — 업체별 목록 페이지(PaginationDto 기본값)
- Response 200:
  - `period: {start_month, end_month, environment}`
  - `total: {user_count, completed_count, paid_amount, refund_amount, profit}`
  - `monthly: [{month, user_count, completed_count, paid_amount, refund_amount, profit}]` — 기간의 모든 달(활동 없는 달 0), 오래된 달부터
  - `stores: {list: [{store_id, store_name, store_code, store_state_id, user_count, completed_count, paid_amount, refund_amount, profit}], pagination}` — 수익 내림차순, 같으면 상호명 순
- 실패: 400 검증(월 형식 · 환경 · has_activity · 시작 > 끝 · 12개월 초과) · 401 · 500

### 2. 내 업체 통계 (동기 — 업체 총관리자 · 업체 관리자)
- Method: GET (`PassportJwtManagerAuthGuard` — 그룹 전체)
- Path: `/api/v1/admin-service/stats/mine` → 내부 `/internal/v1/admin-service/stats/mine`
- Request query: `start_month` · `end_month` · `environment`(위와 같다)
- Response 200: `{period, store: {store_id, store_name}, total, monthly}` — 그 업체만
- 실패: 400 검증 · 401 · 404 소속 업체 없음(탈퇴 · 지운 업체) · 500

## Business Rules

- **도메인** — admin-service 새 `stats` 도메인(사용자 결정 2026-11-09 — 통계를 한 곳에 모은다). 한 도메인에 관리자 가드(전체) · 매니저 가드(내 업체) 라우트를 함께 둔다(AGENTS.md "서버 안 도메인은 기능 대상으로"). 조회만이라 내부 HTTP 동기 경로만(큐 없음). 규격 상수 `libs/contracts/src/stats/stats.commands.ts` 의 `STATS_INTERNAL_PATH`.
- **기간** — 월 단위, 한국 시각 [시작 월 1일 00:00, 끝 월 다음 달 1일 00:00). 기본 이번 달 포함 최근 3개월. 시작 > 끝 400 `시작 월이 끝 월보다 늦습니다.`, 12개월 초과 400 `기간은 최대 12개월입니다.`(입력 필드 오류 — `validation_errors.start_month`). 미래 달도 받는다(0).
- **결제 환경** — `environment`(기본 LIVE)의 결제만 센다. 이용자 수 · 이용 건수는 기본 구간(BASE) 결제의 환경으로 가른다.
- **이용자 수 · 이용 건수**(사용자 결정 2026-11-09) — 이용 완료(COMPLETED) 예약 중 이용 끝(`end_at`)이 기간 안인 것. 이용 건수 = 예약 수, 이용자 수 = 서로 다른 이용자 수. 월별은 이용 끝의 한국 달로. 합계 · 업체별 · 월별 이용자 수는 각각 그 범위에서 중복을 뺀 값이다(합계는 업체별 합이 아니다 — 한 사람이 두 업체를 이용하면 합계 1).
- **결제액 · 환불액 · 수익**(사용자 결정 2026-11-09 — 결제 기준) — 결제액 = 승인 시각(`approved_at`)이 기간 안이고 승인된 결제(DONE · REFUND_REQUESTED · REFUNDED · REFUND_FAILED)의 금액 합(기본 · 연장 구간 모두). 환불액 = 환불 신청 시각(`refund_requested_at`)이 기간 안인 환불 신청(REFUND_REQUESTED · REFUNDED · REFUND_FAILED)의 환불 금액 합. 수익 = 결제액 − 환불액(기간 밖 결제의 환불이 기간 안이면 음수일 수 있다 — 그대로). 결제는 구간 → 예약의 업체로 묶는다. 월별은 각 시각의 한국 달로.
- **업체별 목록(전체 통계)**(사용자 결정 2026-11-09) — 기본(`has_activity=1`) 기간 안 활동(이용 완료 · 결제 · 환불)이 있는 지워지지 않은 업체, `has_activity=0` 이면 지워지지 않은 모든 업체(활동 없으면 0). 수익 내림차순 → 상호명 순, 계산한 목록을 페이지로 자른다(`Pagination` — total_count = 업체 수).
- **내 업체 통계** — 로그인 매니저의 소속 업체(탈퇴 · 지운 업체면 404 `소속 업체를 찾을 수 없습니다.`)만 같은 규칙으로.

## TDD Cases

- [CASES:stats-period] 입력 없음 · 지금 2026-11-09(한국) → 2026-09 ~ 2026-11, 월 [2026-09, 2026-10, 2026-11], 기간 [2026-09-01 00:00, 2026-12-01 00:00) 한국
- [CASES:stats-period] 끝만 2026-06 → 2026-04 ~ 2026-06
- [CASES:stats-period] 시작만 2026-01 · 지금 2026-11 → 2026-01 ~ 2026-11(11개월)
- [CASES:stats-period] 2025-11 ~ 2026-02(연도 넘김) → 월 4개 [2025-11, 2025-12, 2026-01, 2026-02]
- [CASES:stats-period] 2025-12 ~ 2026-11(12개월 — 경계) → 통과
- [CASES:stats-period] 2025-11 ~ 2026-11(13개월) → 400 `기간은 최대 12개월입니다.`
- [CASES:stats-period] 2026-03 ~ 2026-01(시작 > 끝) → 400 `시작 월이 끝 월보다 늦습니다.`
- [CASES:stats-period] 같은 달 2026-11 ~ 2026-11 → 월 1개
- [CASES:stats-aggregate] 집계 행 없음 → 합계 0, 월별은 기간의 모든 달 0, 업체 목록 빈 배열
- [CASES:stats-aggregate] 한 업체 결제 30,000 · 환불 15,000 → 결제액 30,000 · 환불액 15,000 · 수익 15,000
- [CASES:stats-aggregate] 업체 A 이용자 2 · 업체 B 이용자 2 · 전체(중복 제거) 3 → 합계 이용자 수 3, 업체별 2 · 2
- [CASES:stats-aggregate] 10월만 활동 · 기간 9 ~ 11월 → 월별 9월 · 11월 0 채움, 오래된 달부터
- [CASES:stats-aggregate] 업체 수익 다업체 10,000 · 나업체 30,000 · 가업체 30,000 → 가업체 · 나업체(같은 수익은 상호명 순) · 다업체
- [CASES:stats-aggregate] 환불만 있는 업체(결제는 기간 밖) → 수익 음수 그대로
- [CASES:stats-aggregate] 집계 값이 문자열('3' · '30000' — PostgreSQL count · sum) → 숫자로
- [FAIL:validation] `start_month` 형식(2026-13 · 2026-1 · 202611) · `environment` 허용값 밖(REAL) · `has_activity` 허용값 밖(2) → 각 필드 오류
- 테스트 생략(위임형): 게이트웨이 라우트 · 모듈 등록 · contracts 경로 상수 — 프로젝트 규칙상 gateway · controller spec 을 두지 않는다

## Notes

- 스키마 변경 없음 — 읽기만. 인덱스는 지금 그대로(예약 `end_at` · 결제 `approved_at` 범위 조회 — 데이터가 커지면 Phase 23 캐시 · 인덱스와 같이 본다).
- 이용자 수의 중복 제거는 범위마다 따로 세야 해서 이용 집계는 PostgreSQL `GROUPING SETS ((업체), (달), ())` 한 쿼리로 업체별 · 월별 · 합계를 같이 낸다(`GROUPING()` 으로 행을 가른다). 결제 · 환불은 더할 수 있는 합이라 (업체, 달) 집계 한 쿼리씩 받아 util 이 합계 · 월별 · 업체별로 모은다.
- 월 묶음은 `to_char(<시각> AT TIME ZONE 'Asia/Seoul', 'YYYY-MM')`.
- 매니저 소속 업체는 업체 예약 현황(admin-service reservation `buildManagerStoreQuery`)과 같은 조인 · 조건(잠금 없음)으로 stats repository 가 따로 읽는다(도메인끼리 service · repository 를 부르지 않는다).

## Proposals (Codebase-Based)

- [x] 통계는 새 `stats` 도메인(사용자 결정 2026-11-09)
- [x] 업체 목록 필터 `has_activity`(기본 활동 있는 업체만 — 사용자 결정 2026-11-09)

## Decisions

- [x] 도메인 — admin-service 새 `stats`(사용자 결정 2026-11-09)
- [x] 이용자 수 — 기간 안 이용 완료한 서로 다른 이용자 + 이용 건수(사용자 결정 2026-11-09)
- [x] 수익 — 결제 기준: 승인 결제액 − 환불 신청액(사용자 결정 2026-11-09)
- [x] 기간 — 월 단위, 기본 이번 달 포함 최근 3개월(사용자 결정 2026-11-09), 최대 12개월
- [x] 응답 — 합계 + 업체별(수익 내림차순 · 페이지) + 월별 추이, 업체 관리자는 자기 업체 합계 + 월별(사용자 결정 2026-11-09)
- [x] 결제 환경 — 입력(LIVE · TEST, 기본 LIVE)(사용자 결정 2026-11-09)
- [x] 업체 목록 — 기본 기간 안 활동 있는 업체, 필터로 모든 업체(사용자 결정 2026-11-09)
- [x] TDD — 기간 계산 · 통계 모으기(사용자 결정 2026-11-09)
