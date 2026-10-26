# datetime (archived)

## 날짜 · 시각은 dayjs 로 — 직접 만든 계산 util 을 두지 않는다
- Rule: 날짜 · 시각의 파싱 · 검증 · 비교 · 더하기 · 시간대(한국 시각) 변환은 dayjs(플러그인 `customParseFormat` · `utc` · `timezone`)로 한다. `getTime()` 비교 · `* 60 * 1000` 더하기 · `+9시간` 오프셋 계산 · `Date.UTC` 되돌려 맞추기 · 시각 문자열 자르기 같은 직접 구현을 새로 만들지 않고, 이미 있는 것은 dayjs 로 바꾸고 지운다. 더 넓게 — 이미 의존성에 있는 라이브러리로 되는 기능은 util 로 다시 만들지 않는다.
  - 플러그인은 `libs/common/src/utils/dayjs.ts` 한 곳에서 붙이고, 코드는 거기서 `dayjs` · `Dayjs` · `KST_TIMEZONE` 을 가져온다(Phase 11 plan 에서 도입).
  - 그대로 두는 것: 엔티티 훅 · 조건의 "지금" 값(`new Date()`), 메시지 봉투 `timestamp: Date.now()`.
- Scope: global
- Rationale: User feedback 2026-10-27 — "이런거 쓰지말고 그냥 dayjs같은거로 비교하면 안됨? 저런 기능 만들때마다 낭비인 것 같은데" / "이런 날짜/시간 비교하는 기능들 있으면 dayjs같은 라이브러리 기능으로 대체하고 제거해" (Phase 11 기획의 `parseKstMinute` 를 보고)
- AGENTS.md application: unapplied (code rule — Phase 11 plan 이 AGENTS.md 공통 로직 분리 · docs/conventions.md · docs/architecture.md 에 넣는다. ship 의 reconcile 에서 조항 단위로 확인한 뒤 보관)
- Priority: takes precedence over AGENTS.md/defaults
- Archived: 2026-10-27 beaver ship(Phase 11 리뷰 261027-2) — AGENTS.md 공통 로직 분리 · docs/conventions.md 순수 함수 절의 dayjs 항목으로 이동 (대조 완료: 6개 조항 — dayjs 로 파싱 · 비교 · 계산 · 시간대 · 직접 구현 금지 · 기존 것 교체 · 라이브러리 우선 · 공통 모듈 한 곳 import · 예외)
