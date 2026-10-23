# Report — store-schema

## Feature Summary
- **Feature**: store 스키마 — 입점 신청 · 신청 상태 · 업체 상태 룩업(+시드) · t_store 재설계(상태 · 위경도 · 소개 · 연중무휴 · 영업중 여부 · 정비시간) · 업체 사진 · 요일별 영업시간(CHECK) · 브레이크타임
- **Entry point**: 진입점 없음 — 엔티티 · 시드 · 마이그레이션 `StoreSchema1792780576432`
- **Domain**: store (로드맵 Phase 8 — #32 ~ #36)
- **Spec · Plan**: [store-schema-spec.md](../../spec/store/store-schema-spec.md) · [store-schema-plan.md](../../plan/store/store-schema-plan.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/store/store-state.entity.ts` | created | 업체 상태 룩업 `t_store_state` |
| `libs/database/src/entities/store/store-application-state.entity.ts` | created | 입점 신청 상태 룩업 `t_store_application_state` |
| `libs/database/src/entities/store/store.entity.ts` | modified | `store_state_id`(FK) · `latitude` · `longitude` · `introduction` · `is_always_open` · `is_open` · `maintenance_minutes`, `IDX_Store_LatitudeLongitude`, 주석 "가맹점" → "업체" |
| `libs/database/src/entities/store/store-application.entity.ts` | created | 입점 신청 `t_store_application` — 신청자 `user_id` 는 FK 없이 ID + `IDX_StoreApplication_UserId` |
| `libs/database/src/entities/store/store-image.entity.ts` | created | 업체 사진 `t_store_image`(S3 키 · 정렬 순서) |
| `libs/database/src/entities/store/store-hour.entity.ts` | created | 요일별 영업시간 `t_store_hour` — `UK_StoreHour_StoreIdDayOfWeek` · `CHK_StoreHour_OpenCloseTime` |
| `libs/database/src/entities/store/store-break.entity.ts` | created | 요일별 브레이크타임 `t_store_break`(하루 여러 개) |
| `libs/database/src/entities.ts` | modified | ENTITIES 6개 추가(줄 단위 목록으로) |
| `libs/database/src/seeder/seeder.targets.ts` | modified | `STORE_STATE_SEED_DATA`(ACTIVE · SUSPEND · LEAVE) · `STORE_APPLICATION_STATE_SEED_DATA`(WAIT · APPROVED · REJECTED) + SEED_TARGETS |
| `libs/database/src/migrations/1792780576432-StoreSchema.ts` | created | `db:generate` 생성 + 손으로 고친 부분: t_store 의 `latitude` · `longitude` · `store_state_id` 를 임시 기본값 → DROP DEFAULT, `SUSPEND` 룩업 행 선입력(`ON CONFLICT DO NOTHING`), 머리 · down 주석 |
| `libs/database/src/migrations.ts` | modified | 생성기가 MIGRATIONS 에 등록 |
| `docs/data-layer.md` | modified | 엔티티 트리 · 제약명 `CHK_<Model>_<내용>` · 타입(하루 안 시각 `time` · 좌표 `double precision`) · 룩업 목록 · 서비스 간 FK 예(`t_store_application.user_id`) |
| `AGENTS.md` | modified | Data Layer 엔티티 줄 — `@Check('CHK_…')` · `time` · `double precision` |
| `.beaver/memory/data-layer.md` · `MEMORY.md` | created · modified | 영업시간은 휴무가 아니면 open_time · close_time 세트(사용자 결정 2026-10-24) |
| `.beaver/output/roadmap/roomless-roadmap.md` (+ html) | modified | Phase 8 유닛 상태 |
| `README.md` | 변경 없음(확인) | 테이블 목록을 두지 않는다(README.md:69 은 `entities/<domain>/` 경로만) |

## Tests Written
없음 — plan 의 테스트 정책대로다. spec 은 service 기능 · repository 두 종류만 두는데(docs/testing.md), 이번 단계에는 둘 다 없다. 아래 검증으로 대신했다.

## Verification
- `npm run db:check` — **엔티티와 마이그레이션이 일치**한다. 마이그레이션을 손으로 고친 뒤에도 통과했고, CHECK 제약도 이름으로 맞춰졌다.
- **PGlite 직접 실행**(실제 DB 아님, 테스트 밖의 확인): 기존 마이그레이션 4개를 적용하고 `t_store` 에 기존 행 1건을 넣은 뒤 `StoreSchema` 를 up · down 했다.
  - 기존 행 → `store_state_id = 'SUSPEND'` · 좌표 0 · `is_always_open = 0` · `is_open = 1` · `maintenance_minutes = 0`. `store_state_id` · `latitude` · `longitude` 에 기본값이 남지 않았다(엔티티와 같다).
  - `t_store_state` 에는 up 이 넣은 `SUSPEND` 1건만 있다. 나머지는 부팅 시 seeder 가 넣는다(PK 기준 — SUSPEND 는 건너뛴다).
  - `CHK_StoreHour_OpenCloseTime` 은 영업(18:00 ~ 06:00 둘 다)과 휴무(둘 다 NULL)를 통과시켰다. 영업인데 하나만 있는 행과 휴무인데 시각이 있는 행은 거부했다.
  - `time` 값은 문자열 `'18:00:00'` 로 온다(엔티티 타입 `string`).
  - down → `t_store` 가 원래 컬럼 12개로 돌아가고, 새 store 테이블 6개가 사라진다.
- `npm run typecheck` · `npm run lint` · Prettier(`libs/database`) · `npm run build`(앱 4개) 통과.
- 플랜 대조
  - 결정 그대로 반영: 룩업 신청 상태 · `store_detail` 유지 · 신청 좌표 NOT NULL · `time` 다음 날 규칙 · 업체 단위 `is_always_open` · `is_open`(0 영업중 아님 / 1 영업중) · 신청 추가 항목 3개 · CHECK.
  - 생성기가 `FK_User_Store` 를 지웠다가 다시 건다. `t_store.store_id` 주석 변경 때문이며 제약 내용은 같다(plan 에 없던 생성 결과 — 그대로 둠).
- 테스트(`npm test`)는 build 에서 돌리지 않는다.

## Remaining Issues
- 마이그레이션 `StoreSchema1792780576432` 적용은 사용자 몫이다(로드맵 "지금 할 일" 에 쌓는다).
- Phase 9 · 11 · 18 로 넘기는 것
  - 입점 신청 · 승인 · 반려 API
  - 같은 사업자번호의 대기 중 중복 신청 막기(service 검사)
  - `LEAVE` 상태와 `is_deleted` 의 관계(#40 삭제 방식)
  - 영업시간 · 브레이크 · `is_open` 전환 API — DTO 짝 필드 검증 · 시작 = 마감 금지
  - `is_open` 전환 · 영업중지 때 기존 예약 처리(Open Decisions)
  - 영업중 판정 · 필터
- 로드맵 구조
  - 영업중 여부 전환 API 를 Phase 11 유닛으로 넣는 일은 `/beaver:roadmap` 에서 한다.
  - Phase 8 Key decision 2개(신청 상태 표현 · 편의시설)가 이번에 정해졌다.
