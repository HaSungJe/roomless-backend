# naming

## 종류마다 반복되는 설정은 컬럼 이름에 종류를 붙이지 않는다
- Rule: 같은 설정 묶음이 종류(상품 종류 등)마다 반복되면 `<종류>_<설정>` 컬럼(`day_use_hours` · `night_stay_check_in_time` …)을 늘어놓지 않는다. (주체 × 종류) 1행 테이블로 두고, 종류는 룩업 FK, 컬럼은 종류와 무관한 이름(`is_used` · `days_of_week` · `usage_hours` · `check_in_time`)으로 한다. 종류별로 쓰지 않는 컬럼은 NULL 이고 CHECK 로 조합을 막는다.
  - 예: 업체 상품 설정 `t_room_plan`(업체 × 상품 종류) · 그룹 상품 `t_room_group_plan`(그룹 × 상품 종류) — 모두 종류별 반드시 1행, 판매 여부는 `is_used` 0/1.
- Scope: global (data layer)
- Rationale: User feedback 2026-10-31 — "컬럼에 데이유즈, 나이트 이런식으로 하니까 존나 없어보이는데" → JSON 도 아니고 "상품별로 반드시 1행씩 설정하자"
- AGENTS.md application: unapplied (code rule — Phase 12 room 스키마 build 에서 docs/data-layer.md · AGENTS.md Data Layer 에 옮길 후보)
- Priority: takes precedence over AGENTS.md/defaults
- Archived: 2026-10-31 — Phase 12 room 스키마 ship(main-review-261031.md)에서 규약 문서에 옮겼다(조항 단위 확인).

## 이름은 뜻이 바로 드러나는 말로 — 음역 금지
- Rule: 룩업 이름 · 주석 · 사용자 노출 문구에 영어를 한글로 옮겨 적은 말(데이유즈 · 나이트 · 롱스테이)을 쓰지 않는다. 뜻이 바로 드러나는 우리말을 쓴다(시간 이용 · 1박 · 연박). 코드 ID 는 뜻이 드러나는 영어 대문자다(`HOURLY` · `NIGHT` · `LONG`).
- Scope: global
- Rationale: User feedback 2026-10-31 — "그래서 데이유즈 나이트 이게 뭔데 라고 말이 나올 수 있잖아. 심지어 한글로 저렇게 박아두니 더 이상함" → ID `HOURLY` · `NIGHT` · `LONG`, 이름 시간 이용 · 1박 · 연박
- AGENTS.md application: unapplied (code rule — Phase 12 build 에서 docs/conventions.md 명명 절에 옮길 후보)
- Priority: takes precedence over AGENTS.md/defaults
- Archived: 2026-10-31 — Phase 12 room 스키마 ship(main-review-261031.md)에서 규약 문서에 옮겼다(조항 단위 확인).
