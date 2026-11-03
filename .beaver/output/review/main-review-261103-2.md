# Review — main — 261103-2

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: 해당 없음(direct mode) → origin: `main`
- Included features: 예약·결제(로드맵 Phase 17 — #67 ~ #73 · #113) — 첫 리뷰(`main-review-261103.md`) 지적 3건 반영분 재리뷰
- Change scope: 첫 리뷰 범위 + `apps/user-service/src/reservation/test/reservation.repository.spec.ts`(find 조건 Smoke 7) · `apps/admin-service/src/room/test/room.repository.spec.ts`(1) · `apps/user-service/src/reservation/reservation.util.ts`(정렬 1줄) · `docs/testing.md` · `AGENTS.md` · plan · report

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 새 도우미 `buildFindQuery`(spec 파일 전용 · JSDoc), describe `[SMOKE:data-access]` 태그 |
| Structure & layering | pass | 제품 코드 구조 변경 없음 — repository 에 빌더를 새로 만들지 않고 spec 에서 넘긴 옵션을 가로챈다 |
| Shared logic extraction | pass | `mergeWindows` 가 dayjs `diff` 로 정렬 — 날짜 · 시각 직접 계산 0 |
| Errors & responses | pass | 변경 없음 |
| Test strength | pass | 점유 판정 · 기간 · 상품 · 영업시간 · 브레이크 · 개수의 find 조건을 실제 메타데이터로 빌드해 WHERE 문자열 · 파라미터 · 전체 SQL 고정, 호출 횟수 단언. 조건은 service 가 넘기는 모양 그대로(`In(RESERVATION_OCCUPYING_STATES)` · `Not(RESERVATION_STATE.EXPIRED)`) |
| memory | pass | 변경 없음 |
| 기타 규약 | pass | docs/testing.md · AGENTS.md Smoke 목록 · 방법 갱신, plan 블록 동기화(validate-plan 통과), report 에 Modification 기록 |

## Intended Behavior Check (against plan/spec)
- 동작 변경 없음 — 정렬 비교만 같은 결과의 dayjs API 로 바꿨고(가용성 표 14건 그대로 통과), 나머지는 테스트 · 문서.
- 고정한 SQL 이 의도와 같다: 점유 `room_id IN · reservation_state_id IN · start_at < 끝 · blocked_until > 시작`, 일시 예약불가 `starts_at < 끝 · ends_at > 시작 · is_deleted = 0`, 내 예약 수 `reservation_state_id != EXPIRED`, admin 호실 점유 `room_id = · reservation_state_id IN`.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Info | `libs/integration/src/payment/toss-payment.gateway.ts` · scheduler crontab | (첫 리뷰 4 그대로) 토스 실제 호출은 확인하지 않았고, crontab 은 운영에서만 돈다 | 테스트 키로 가이드 6절 순서대로 확인 — scheduler 는 production 으로 |

첫 리뷰 1(Medium) · 2(Low) · 3(Low) 해결.

## Verdict
통과 — typecheck · lint(경고 0) · build(4개 앱) · db:check 통과, 전체 94파일 873건 통과. 커밋 승인으로 넘어간다.
