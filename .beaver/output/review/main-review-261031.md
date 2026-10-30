# Review — room 스키마 (Phase 12) · 편의시설 이동 · 소프트 삭제 전환 — 261031

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — direct 모드라 `<branch>-review-<YYMMDD>.md`.

## Target
- stick: 없음(direct 모드) — `main` 에 바로 커밋 · 푸쉬
- Included features: [room-schema](../plan/room/room-schema-plan.md) — 로드맵 Phase 12(#48 ~ #52) + 업체 상품 설정 · 편의시설 이동 · 기존 store 테이블 소프트 삭제 전환
- Change scope: 수정 41 · 새 파일 10(room 엔티티 8 · soft-delete util · 마이그레이션) + 문서(spec · plan · report · review) — +507 / −292(수정분)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 테이블 `t_room_*` · PK `<테이블>_id` · 제약 `PK_/UK_/FK_/IDX_/CHK_/EXC_` · 컬럼 `is_used` · `days_of_week` · `usage_hours` · `start_date` · `end_date`. 종류별 컬럼(`<종류>_<설정>`) 없음 — naming 메모리. 상품 종류 이름 시간 이용 · 1박 · 연박(음역 없음) |
| Structure & layering | pass | 엔티티는 `libs/database/src/entities/room/`, 다른 도메인 테이블 쓰기는 store 어휘(`insertStorePlans` — 형제 `insertHeadManager`), service 는 상수 + `new RoomPlanEntity()` 할당(private 헬퍼 없음) |
| Shared logic extraction | pass | 소프트 삭제 조건은 `libs/database/src/soft-delete.ts` `notDeleted` 한 곳(형제 typeorm-error.ts), 기본값은 `store.constants.ts` `STORE_PLAN_DEFAULTS` · 엔티티 파일 `ROOM_GROUP_DETAIL_DEFAULTS` |
| Errors & responses | pass | repository 새 메서드 try/catch + 통일 500, 상태 조건 삭제는 `affected === 1` 그대로, 응답에서 `store_detail` 만 빠진다(필드 골라 담기) |
| Test strength | pass | 조건 인자(`is_deleted: 0`, OR 배열 조건마다) · `delete` 미호출 · `update(조건, is_deleted = 1 엔티티 — toBeInstanceOf)` · 업체 상품 설정 3행 값 · 실패 3건 뒤 미호출 · 예전 클라이언트 `store_detail` 무시 단언 |

**Data-Access Smoke**: 바뀐 QueryBuilder 빌더 전부(신청 목록 2 · 업체 목록 · 파일 행 2 · 파일 업체 지정 · 신청 파일 삭제(DELETE → UPDATE) · 소속 업체 잠금 2 · 영업시간 · 브레이크타임 · 일시 예약불가 목록 · 겹침)의 스냅샷을 dist 로 뽑은 실제 SQL 로 고쳤다 — `is_deleted = 0` · `is_deleted` select 컬럼 · `store_detail` 삭제. 새 빌더는 없다.

**memory**
- `git` — spec · plan · report · review 를 커밋에 포함한다.
- `cache` — 무효화 지점 표(cache-spec)의 내 업체 소개 수정 행을 고쳤다(편의시설 삭제).
- `api-log` — 해당 없음.
- `naming`(2) · `data-layer`(2) — 이번 build 에서 규약 문서에 모두 옮겼다(아래 Memory Reconcile).

## Intended Behavior Check (against plan/spec)
- **room 테이블 8개**: plan 엔티티 코드 그대로다.
  - 객실 그룹 상세정보에 기본값 상수와 `@AfterLoad` 를 둔다.
  - 업체 상품 설정은 업체 × 종류 UK + CHECK, 그룹 상품은 `is_used` · `price` 기본 0 + 일반 UK다.
  - 기간 가격은 배타 제약(`WHERE is_deleted = 0`) + CHECK 다.
- **입점 승인**: 업체 등록 다음 단계에서 업체 상품 설정 3행을 넣는다(기본값 · PK `generateId`).
- **편의시설 이동**: 입력 · 응답 · 도우미 · 컬럼이 모두 빠졌다. 기존 클라이언트가 보내는 `store_detail` 은 무시된다(whitelist 꺼짐 — spec 대로).
- **소프트 삭제**
  - 실제 `DELETE` 0건(store.repository.ts 6곳 전환)이다.
  - `is_deleted` 테이블(t_store · t_session · store 5개)의 조회 · 개수 · 수정은 모두 `notDeleted` 또는 QueryBuilder 조건을 쓴다.
  - 파일 삭제는 S3 `remove` 를 그대로 유지한다(service 335 · 369 · 810 근처).
  - 새 행은 `is_deleted = 0` 을 명시한다.
- **마이그레이션 `RoomSchema`**: 생성 + 손질(확장 · 파일 수정일 채움 · 기존 업체 3행 · down 정리)이다.
  - `db:check` 일치, PGlite 25/25 통과 — 기존 업체 3행 · CHECK · UK · 배타 제약 · `@AfterLoad` · 영업시간 교체 · down → up.
- **검증 명령**: typecheck · lint · build(4개 앱) · db:check 가 종료 코드 0, 바꾼 TS 파일 Prettier 통과. 테스트 실행은 `/beaver:test` 몫이다.
- **plan 과 다른 점**
  - plan 이 따로 두겠다던 "repository 소프트 삭제" 메서드별 절은 실제로 만들지 않았다. 문장을 고쳐 모양 · 대상 목록만 남기고, 메서드별 결과는 report 와 코드로 돌렸다.
  - 서브에이전트 초안의 일관성 제안(새 행 `is_deleted = 0` 명시 · 소프트 삭제 주석)은 반영했다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Info | libs/database/src/entities/store/store.entity.ts (`UK_Store_BusinessNumber`) · store.service.ts(입점 신청 중복 확인 `countStores`) | UK 는 지운 업체까지 걸리는데 중복 확인은 지운 업체를 세지 않는다. 지금은 업체를 소프트 삭제하는 코드가 없어(탈퇴 = LEAVE + `DELETE_<store_id>` 마스킹) 차이가 없다. | 업체 소프트 삭제 기능을 만들 때 사업자등록번호도 마스킹한다. 조치 없음 |
| 2 | Info | libs/database/src/entities/room/room-plan.entity.ts (`CHK_RoomPlan_UsageHoursCheckInOutTime`) | CHECK 식이 종류 ID `'HOURLY'` 를 직접 쓴다. 시간 단위 상품 종류가 늘면 식과 이름을 함께 바꾼다. | 조치 없음(규약 — 식을 바꾸면 이름도) |
| 3 | Info | TypeORM PostgresDriver(연결 시 `CREATE EXTENSION IF NOT EXISTS "btree_gist"`) | 배타 제약이 있는 엔티티가 생겨 앱이 연결 때 확장 생성을 시도한다. 권한이 없으면 경고만 남고 부팅은 된다. 마이그레이션은 권한이 없으면 실패한다. | 배포 때 적용 계정 권한 확인(README · 지금 할 일 사용자 줄) |
| 4 | Info | spec 전반 | build 정책상 테스트는 아직 실행하지 않았다. | `/beaver:test` 에서 처음 실행된다 |

## Memory Reconcile
코드 규칙 4개를 규약 문서에 모두 옮겼다(build 에서, 조항 단위로 다시 읽어 확인했다). 보관을 제안한다.
- `naming` — 종류마다 반복되는 설정은 (주체 × 종류) 1행. data-layer.md jsonb 절 다음 · AGENTS.md Data Layer 에 옮겼다(종류별 컬럼 금지 · 룩업 FK · 무관한 이름 · NULL + CHECK · 반드시 1행 · 지우지 않음 · `is_used`).
- `naming` — 이름은 뜻이 드러나는 말(음역 금지). conventions.md 파일 · 클래스 명명 절 · AGENTS.md Conventions 에 옮겼다(룩업 이름 · 주석 · 노출 문구 · 우리말 · 코드 ID 영어 대문자).
- `data-layer` — 삭제는 항상 소프트 삭제. data-layer.md repository 절 · AGENTS.md Data Layer · Checklist 에 옮겼다(DB 만 · S3 실제 삭제 · repository 가 `notDeleted` · QueryBuilder · 조인 테이블 · service 는 넣지 않음 · 삭제 메서드 모양 · affected · 교체 · 유일성 · 배타 제약 · 지우는 테이블에만 · 종류별 행은 안 지움).
- `data-layer` — jsonb 상세정보 기본값 + `@AfterLoad`. data-layer.md jsonb 절 · AGENTS.md Data Layer 에 옮겼다(기본값 상수 · `{...기본값, ...저장된 값}` · 인터페이스 필수 · 마이그레이션 없음 · raw select 는 같은 상수 · 로그 jsonb 는 대상 아님).
- `cache` — 캐시 코드가 생길 때(Phase 23). 제안하지 않는다. `git` · `api-log` — 운영 결정(불필요).

## Verdict
Pass — no issues(High · Medium · Low 없음, Info 4건 조치 없음).
