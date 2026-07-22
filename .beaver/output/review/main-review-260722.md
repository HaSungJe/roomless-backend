# Review — main — 260722

> ship 전 코드리뷰. 누적 변경을 memory 규칙 · CLAUDE.md 규약 · 기획 의도에 대조한다.

## Target
- mode: direct (worktree 없음) — branch: `main` → origin: `origin/main`
- 포함 작업: 전체 개발 로드맵 수립 (brainstorming 산출물)
- 변경 범위: 2개 파일 — `docs/roadmap.md`(신규 216줄), `CLAUDE.md`(+6줄)
- 코드 변경 없음 — 엔티티 · 서비스 · 리포지토리 · 테스트 미변경

## Convention Check (against CLAUDE.md)
| 항목 | 결과 | 비고 |
|------|------|------|
| Naming | N/A | 소스 변경 없음. 로드맵이 제안한 테이블명(`t_store_hour` · `t_room` · `t_room_plan` · `t_device` · `t_reservation` · `t_payment`)은 `t_<domain>` 규약 준수 |
| Structure & layering | pass | 로드맵의 단계별 산출물이 `controller → service → repository` 구조를 전제. 가용성 판정을 `reservation.util.ts` 순수함수로 분리한 것은 "service 내부 private 헬퍼 금지" 규약과 일치 |
| Shared logic extraction | pass | `DeviceGateway` · `PaymentGateway` 를 `src/modules/` 인프라 모듈로 배치 — "DI/lifecycle/외부연동 → @Module" 규약과 일치 |
| Errors & responses | N/A | 소스 변경 없음 |
| Test strength | N/A | 소스 변경 없음. 4단계 가용성 순수함수에 단위 테스트를 명시해 둠 |
| 문서 구조 | pass | CLAUDE.md 섹션 배치(Beaver 설정 → 개발 로드맵 → 주의사항)와 상대경로 마크다운 링크 형식이 기존 문서와 동일 |

## Data-Access Smoke Coverage
N/A — 데이터 접근 메서드 추가·수정 없음.

## Memory Reconcile
`.beaver/memory/` 2건 모두 반영 상태 확인 — `미반영` 항목 없음.
- `beaver 산출물 문서는 커밋에 포함` → `not needed` (기본 동작과 동일)
- `커밋 메시지 형식` → `applied` (CLAUDE.md "커밋 메시지" 절)

## Draft Conventions
N/A — plan §4.5 draft 문서(`beaver:draft` 마커) 없음.

## Intended Behavior Check (against plan/spec)
brainstorming 대화에서 확정한 사항이 모두 문서에 반영됐는지 대조:

| 확정 사항 | 반영 |
|---|---|
| 매니저 1명 = 업체 1곳 (`t_user.store_id`) | ✅ 횡단 결정사항 + 1단계 |
| 이용상품은 객실별 개별 설정 | ✅ `t_room_plan` (2단계). `t_store_plan` 은 제거됨 |
| 항상 시간 기반(대실 n분), 숙박 별도 개념 없음 | ✅ 횡단 결정사항 |
| 사전예약 가능 + 브레이크타임 계산 | ✅ 재고 판정 ①②, `t_store_break` (1단계) |
| 청소 → 스탠바이 후 예약 가능 | ✅ `t_room_state` 4종 (2단계), 6단계 체크아웃 전이 |
| Redis pub/sub 사물제어, 하드웨어 제외 | ✅ 3단계 `DeviceGateway` |
| 토스는 나중에 어댑터로 | ✅ `PaymentGateway` + mock (4단계), 토스 실연동은 후순위 |
| 로드맵은 살아있는 문서 + 진척도 표시 | ✅ 뱃지 · 체크박스 · 갱신 규칙 |

누락·오반영 없음.

## Findings
| # | Severity | 위치 | 설명 | 권고 |
|---|--------|-----------------|------|------|
| 1 | Low | docs/roadmap.md — 2·3·4단계 | 룩업 엔티티(`t_room_state` · `t_device_type` · `t_reservation_state`)를 "룩업 + 시드"로만 적어, 기본 데이터를 `seeder.targets.ts` 한 곳에서 관리한다는 CLAUDE.md 규약(엔티티가 시드 데이터 보유 ❌)이 문서에 드러나지 않음 | 횡단 결정사항에 "룩업 기본 데이터는 `seeder.targets.ts` 에만 정의" 한 줄 추가 |
| 2 | Low | docs/roadmap.md — 1·2·5단계 vs 후순위 | 목록 조회 API 가 1단계부터 등장하는데 `PaginationDto` 실적용은 후순위에 있어, 목록 API 를 페이지네이션 없이 만들지 나중에 소급 적용할지 모호 | 횡단 결정사항에 목록 API 의 페이지네이션 방침을 명시 |
| 3 | Low | docs/roadmap.md — 1단계 | `t_store_hour` · `t_store_break` 가 어느 도메인 디렉터리에 속하는지 미명시 | 1단계에 "store 도메인 하위(`src/api/v1/store/entities/`)" 명시 |

High/Medium 없음. 세 건 모두 문서 명확성 이슈이며 한 줄 수정으로 해소 가능.

### 조치 결과 (2026-07-22, 커밋 전 인라인 반영)
- #1 → 횡단 결정사항에 "룩업 기본 데이터는 `seeder.targets.ts` 에만 정의" 행 추가.
- #2 → 사용자 결정: **모든 목록 조회 API 에 1단계부터 `PaginationDto` 적용**. 횡단 결정사항에 명시하고, 후순위의 "PaginationDto 실적용" 항목은 제거(대신 "특정 날짜 임시휴무"를 후순위로 승격).
- #3 → 1단계 엔티티 절에 `src/api/v1/store/entities/` 소속 명시.

## Verdict
**Pass** — 지적 3건을 커밋 전 인라인 반영 완료. 코드 변경이 없어 회귀 위험 0. ship 진행 가능.
