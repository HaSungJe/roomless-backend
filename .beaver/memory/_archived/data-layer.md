# data-layer (archived)

## 영업시간은 휴무가 아니면 open_time · close_time 둘 다 있어야 한다(세트)
- Rule: `t_store_hour` 에서 휴무가 아닌 요일(`is_closed = 0`)은 `open_time` · `close_time` 을 **둘 다** 채운다 — 하나만 있는 행을 만들지 않는다. 휴무(`is_closed = 1`)면 둘 다 NULL 이다. DB 는 CHECK 제약 `CHK_StoreHour_OpenCloseTime` 으로 막고(사용자 결정 2026-10-24), 입력 DTO(Phase 11)는 짝 필드 패턴(`@ValidateIf(휴무 아님)` → 제약 → `@IsNotEmpty`)으로 두 필드를 함께 요구하며, service · 시드 · 테스트 데이터도 이 조합만 쓴다.
- Scope: store
- Rationale: User feedback 2026-10-24 — "휴무일이 아닐경우, 이거 두개 세트로 둘 다 있어야함. 기억해놔" (store-hour.entity.ts 의 open_time · close_time)
- AGENTS.md application: unapplied (code rule — store 도메인 규칙이라 docs/data-layer.md 의 `time` 타입 항목 · Phase 11 DTO 에 옮길 후보)
- Priority: takes precedence over AGENTS.md/defaults
- Archived: 2026-10-27 beaver ship(Phase 11 리뷰 261027-2) — AGENTS.md Data Layer 엔티티 줄 · docs/data-layer.md `time` 항목으로 이동 (대조 완료: 6개 조항 — 휴무 아님 → 둘 다 · 하나만 있는 행 금지 · 휴무 → 둘 다 NULL · CHECK · DTO 짝 필드 · service · 시드 · 테스트 데이터도 이 조합만)
