# data-layer (archived)

## 영업시간은 휴무가 아니면 open_time · close_time 둘 다 있어야 한다(세트)
- Rule: `t_store_hour` 에서 휴무가 아닌 요일(`is_closed = 0`)은 `open_time` · `close_time` 을 **둘 다** 채운다 — 하나만 있는 행을 만들지 않는다. 휴무(`is_closed = 1`)면 둘 다 NULL 이다. DB 는 CHECK 제약 `CHK_StoreHour_OpenCloseTime` 으로 막고(사용자 결정 2026-10-24), 입력 DTO(Phase 11)는 짝 필드 패턴(`@ValidateIf(휴무 아님)` → 제약 → `@IsNotEmpty`)으로 두 필드를 함께 요구하며, service · 시드 · 테스트 데이터도 이 조합만 쓴다.
- Scope: store
- Rationale: User feedback 2026-10-24 — "휴무일이 아닐경우, 이거 두개 세트로 둘 다 있어야함. 기억해놔" (store-hour.entity.ts 의 open_time · close_time)
- AGENTS.md application: unapplied (code rule — store 도메인 규칙이라 docs/data-layer.md 의 `time` 타입 항목 · Phase 11 DTO 에 옮길 후보)
- Priority: takes precedence over AGENTS.md/defaults
- Archived: 2026-10-27 beaver ship(Phase 11 리뷰 261027-2) — AGENTS.md Data Layer 엔티티 줄 · docs/data-layer.md `time` 항목으로 이동 (대조 완료: 6개 조항 — 휴무 아님 → 둘 다 · 하나만 있는 행 금지 · 휴무 → 둘 다 NULL · CHECK · DTO 짝 필드 · service · 시드 · 테스트 데이터도 이 조합만)

## 삭제는 항상 소프트 삭제
- Rule: 행을 지우는 동작은 모두 소프트 삭제다 — `is_deleted`(smallint 0/1, 기본 0) 를 1 로 바꾸고 행을 남긴다(`DELETE` ❌). 조회 · 개수 · 겹침 검사는 `is_deleted = 0` 만 본다. 유일성 · 배타 제약도 지워지지 않은 행끼리만(부분 유니크 인덱스 · 배타 제약 `WHERE "is_deleted" = 0`). 통째로 교체(영업시간 · 브레이크타임 등)도 기존 행을 삭제 표시한 뒤 새 행을 넣는다. 룩업과 종류마다 반드시 있어야 하는 행(업체 상품 설정 `t_room_plan` · 그룹 상품 `t_room_group_plan`)은 지우지 않고 `is_used` 0/1 로 판매 여부를 바꾼다.
  - **DB 데이터만 소프트 삭제** — 파일을 지울 때 S3 객체는 실제로 지우고(`storageGateway.remove`), DB 행만 `is_deleted = 1` 로 바꾼다.
  - **`is_deleted = 0` 은 repository 가 항상 붙인다** — 조회 · 개수 · 수정 메서드가 받은 조건을 공통 util `notDeleted(where)`(libs/database — 배열 OR 조건이면 각 조건에)로 감싸고, QueryBuilder 는 `"<별칭>"."is_deleted" = 0`(조인 테이블 포함)을 더한다. service 는 조건에 넣지 않는다(규약 "WHERE 는 service" 의 예외). 삭제 메서드는 `update(notDeleted(where), is_deleted = 1 엔티티)`.
  - 지우는 동작이 있는 테이블에만 `is_deleted` 를 둔다 — 지우지 않는 테이블(t_user — 탈퇴는 상태 + 정보 가리기, 세션 갱신 · SMS 기록 · 룩업 · API 로그)은 그대로.
- Scope: global (data layer — 모든 도메인 테이블)
- Rationale: User feedback 2026-10-31 — "우리는 항상 소프트삭제야. 알고있지?" → "db 데이터 자체만 소프트삭제인거임. 파일삭제인 경우, s3의 파일은 실제 삭제지만, 데이터는 is_deleted = 1로 변경하는 형태. 검색에도 is_deleted = 0 조건이 항상 붙는 형태이고. 전부 점검해줘" (그 전까지 규약에 없었고, Phase 9 · 11 store 코드에 실제 삭제 6곳 — store.repository.ts 165 · 293 · 333 · 585 · 635 · 718, t_store · t_session 조회에 조건 없음). 붙이는 위치는 repository(사용자 결정 2026-10-31)
- AGENTS.md application: unapplied (code rule — Phase 12 room 스키마 build 에서 docs/data-layer.md · AGENTS.md Data Layer 에 옮길 후보)
- Priority: takes precedence over AGENTS.md/defaults
- Archived: 2026-10-31 — Phase 12 room 스키마 ship(main-review-261031.md)에서 규약 문서에 옮겼다(조항 단위 확인).

## jsonb 상세정보는 기본값 상수를 두고, 조회 뒤 빈 항목을 기본값으로 채운다
- Rule: 항목이 바뀌는 jsonb 상세정보(`t_room_group.room_group_detail` 등)는 같은 엔티티 파일에 인터페이스(항목 타입 — 플래그는 `0 | 1`)와 **기본값 상수**(`ROOM_GROUP_DETAIL_DEFAULTS`)를 둔다. 조회 뒤 엔티티의 `@AfterLoad` 훅이 `{...기본값, ...저장된 값}` 으로 저장된 JSON 에 없는 항목을 채운다. 나중에 항목을 더해도 기존 행을 고치는 마이그레이션 없이 기본값으로 보인다. 엔티티로 읽지 않는 곳(raw select)은 같은 상수로 채운다.
- Scope: global (data layer — jsonb 상세정보)
- Rationale: User feedback 2026-10-31 — "이거는 나중에 값이 추가될 때, 기존 정보는 못바꾸잖아. 여기에 기본값도 같이 넣는게 좋을듯 … 검색 후 빈 데이터는 저 기본값으로 채우기."
- AGENTS.md application: unapplied (code rule — Phase 12 room 스키마 build 에서 docs/data-layer.md jsonb 절 · AGENTS.md Data Layer 에 옮길 후보)
- Priority: takes precedence over AGENTS.md/defaults
- Archived: 2026-10-31 — Phase 12 room 스키마 ship(main-review-261031.md)에서 규약 문서에 옮겼다(조항 단위 확인).
