# Review — main — 261024

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: `main` (direct mode) → origin: `main`
- Included features
  - store-schema(로드맵 Phase 8 #32 ~ #36)
  - 캐싱 전략 초안(`.beaver/output/spec/platform/cache-spec.md` — 문서만, build 대상 아님) · 무효화 원칙 메모(`.beaver/memory/cache.md`)
- Change scope: 22 파일(+1523 / −19)
  - 엔티티 6개 추가 · 1개 수정, ENTITIES · 시드 · 마이그레이션 1개
  - 규약 문서 2개
  - beaver 문서(spec 2 · plan · report · 메모리 2 · 로드맵)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 파일 `entities/store/<feature>.entity.ts` · 클래스 `<Feature>Entity` · 테이블 `t_<feature snake>` · 제약 `PK_` · `UK_` · `FK_` · `IDX_` · 새 `CHK_`(규약에 같은 변경으로 추가) · 컬럼 `<과거분사>_at` · `is_<형용사>` · PK `<테이블>_id` |
| Structure & layering | pass | 엔티티는 소유 도메인 폴더(store). 관계 속성을 엔티티 타입으로 두지 않고 문자열 + `@ManyToOne`/`@JoinColumn` 으로 둔다. NOT NULL → CASCADE · NULL → RESTRICT. 다른 서비스 소유 t_user 로 가는 새 FK 없음(`t_store_application.user_id` 는 ID + 인덱스 — data-layer.md:31) |
| Shared logic extraction | pass | 해당 없음(코드 로직 없음). 룩업 기본 데이터는 seeder.targets.ts 한 곳 |
| Errors & responses | n/a | API · repository 없음 |
| Test strength | pass | 정책대로 spec 없음 — service · repository 가 없는 스키마 단계(docs/testing.md). `db:check` · PGlite 실행 확인 · typecheck · build 로 대신했다 |
| Data-access smoke | n/a | 새 · 변경 data-access 메서드 없음 |
| memory rules | pass | `data-layer`: 휴무가 아니면 open_time · close_time 세트 → `CHK_StoreHour_OpenCloseTime` 으로 반영. `git`: `.beaver/output` 산출물 함께 커밋. `cache`: 문서만(코드 없음) |
| README · docs | pass | AGENTS.md Data Layer · docs/data-layer.md(트리 · `CHK_` · `time` · `double precision` · 룩업 목록 · 서비스 간 FK 예) 갱신. README 는 테이블 목록이 없어 변경 없음(확인) |

## Intended Behavior Check (against plan/spec)
- **결정 반영**
  - 신청 상태 룩업 `t_store_application_state`(WAIT · APPROVED · REJECTED) + 시드
  - 편의시설은 `store_detail` 유지
  - 위경도 `double precision NOT NULL`(신청 · 업체)
  - 업체 단위 `is_always_open`
  - `is_open`(0 영업중 아님 / 1 영업중, 기본 1)
  - 영업시간 · 브레이크 `time`(다음 날 마감 규칙은 주석 · 문서)
  - 휴무 `is_closed` + CHECK 세트
  - 신청 추가 항목 3개(총관리자 이름 · 사업자등록증 키 · 메모)
- **마이그레이션** — `db:generate` 결과 + plan 대로 손으로 고친 부분 3곳(`latitude` · `longitude` · `store_state_id` 임시 기본값 → DROP DEFAULT, `SUSPEND` 룩업 선입력). `db:check` 일치.
- **PGlite 직접 실행**(report)
  - 기존 행 → 영업중지 · 좌표 0 · 영업중 · 정비 0분
  - CHECK 가 시각 하나만 있는 행 · 휴무인데 시각 있는 행을 거부
  - down 원복
- **빠진 것 · 잘못 만든 것 없음** — plan File List 와 실제 변경이 같다. 생성기가 덧붙인 `FK_User_Store` DROP → ADD(아래 #1)만 plan 에 없던 생성 결과다.
- **검증** — `db:check` · typecheck · lint · Prettier · build(앱 4개) 통과. 테스트는 ship 이 돌리지 않는다.

## Memory Reconcile
| Entry | 분류 | 제안 |
|---|---|---|
| `data-layer` — 영업시간 open_time · close_time 세트 | code rule · unapplied | DB 부분(CHECK)은 docs/data-layer.md 에 이미 들어갔다. DTO 짝 필드 · service 조항은 Phase 11 코드가 생길 때 docs 로 옮기고 아카이브한다 — 지금은 메모리 유지(조항 일부만 옮기면 적용이 아니다) |
| `cache` — 캐시 무효화 원칙 | code rule · unapplied | 캐시 코드가 아직 없다. Phase 23 첫 캐시 도입 때 규약으로 옮긴다 — 지금은 메모리 유지 |
| `git` · `api-log` | not needed | 해당 없음 |

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | libs/database/src/migrations/1792780576432-StoreSchema.ts (up `FK_User_Store` DROP · ADD) | `t_store.store_id` 주석이 바뀌어 생성기가 `t_user` 의 `FK_User_Store` 를 지웠다가 다시 건다. 제약 내용은 같지만 다시 걸 때 t_user 전체를 검사하며 잠근다 — 회원이 많으면 적용이 잠깐 길어진다 | 지금 규모에서는 그대로 둔다. 큰 테이블에서 주석만 바꿀 때는 FK 재생성 문장을 걸러 낼지 기획 때 본다 |
| 2 | Low | libs/database/src/entities/store/store-application.entity.ts (`business_number` length 10) | 신청은 10자리, 업체는 45(삭제 마스킹 `DELETE_<store_id>`)로 길이가 다르다 — 의도(신청은 마스킹 없음) | 승인 때 신청 → 업체로 그대로 옮기므로 문제없다. Phase 9 에서 같은 사업자번호 대기 신청 중복은 service 검사로 막는다(report Remaining) |

## Verdict
Pass — Low 2건은 의도 · 규모상 추적만 하고 커밋으로 진행한다.
