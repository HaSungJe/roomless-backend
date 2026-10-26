# Review — store-operation (Phase 11 업체 운영 설정) — 261027-2

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — direct 모드라 `<branch>-review-<YYMMDD>.md`, 같은 날 두 번째 리뷰라 `-2`.

## Target
- stick: 없음(direct 모드) — `main` 에 바로 커밋 · 푸쉬
- Included features: Phase 11 업체 운영 설정(#44 · #45 · #46 · #47 · #94 + 일시 예약불가), 날짜 · 시각 dayjs 통일(사용자 결정 2026-10-27), 검증 규약 확장(중첩 · 배열 · 숫자 범위), 기준선 테스트 실패 4건 보정
- Change scope: 수정 41 · 삭제 1(`kst.ts`) · 새 파일 30(DTO 13 · spec 11 · 엔티티 · 마이그레이션 · dayjs.ts · memory · spec · plan · report) — +1817 / −137(수정분) · 새 파일 4760줄

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | DTO `store-mine*.dto.ts` · 클래스 `StoreMine…Dto` / `…ResultDto` · 명령 `admin.store.mine-*` · 내부 경로 `MINE*` · 엔티티 `t_store_unavailable_period` · 제약 `PK_/FK_/IDX_/CHK_StoreUnavailablePeriod_…` · 컬럼 `starts_at` · `ends_at`(앞으로 올 시각 — `expires_at` 꼴, docs 에 규칙 추가) |
| Structure & layering | pass | controller 위임 한 줄 · 큐 컨트롤러 providers · 게이트웨이 동기 · 큐 2파일, `/mine…` 을 `/:store_id` 앞에. store repository 가 t_user 를 조인해 소속 업체를 찾는다(store 어휘 `findStoreByManager`). 조인 · 정렬 쿼리는 public 빌더 4개 |
| Shared logic extraction | pass | service private 헬퍼 0 — 키 발급(신청 · 업체 공통 파일 전용 헬퍼) · 업체 사진 · 겹침 · 변환은 `store.util.ts`, 날짜 · 시각은 `libs/common/src/utils/dayjs.ts`. 반복 메시지 5개를 상수로 올리고 기존 인라인 4곳을 바꿨다 |
| Errors & responses | pass | 규칙 위반 400 · 404(소속 업체 · 파일 · 일시 예약불가), 입력 귀속 오류만 `validation_errors`(점 경로 — `hours.2.close_time` · `breaks.0.end_time`), 제약은 service 가 먼저 막아 repository 는 통일 500, 저장소 삭제는 행 삭제 뒤 마지막, 응답 null 필드 포함 |
| Test strength | pass | API 1개당 spec(위임형 2개 생략 — plan 대로), 브레이크 겹침 합의 11케이스, 잠금 인자 · 엔티티 `toBeInstanceOf` · 컬럼 · 호출 순서 · 미호출 · Date 고정. Smoke 6(소속 업체 잠금 없음 · 있음, 영업시간, 브레이크, 일시 예약불가 목록 · 겹침) |

memory 규칙: `git` — spec · plan · report · review 를 커밋에 포함. `cache` — 업체 · 영업 설정을 바꾸는 쓰기를 cache-spec discovery 무효화 지점 표에 더했다. `api-log` — 해당 없음. `data-layer`(영업시간 세트) — DTO 짝 필드 · service(휴무면 NULL) · CHECK 로 지켰다. `datetime`(날짜 · 시각은 dayjs) — 새 코드 · 기존 코드 모두 dayjs, 직접 계산 grep 0건.

## Intended Behavior Check (against plan/spec)
- spec API 표 13개가 모두 있다 — 동기 3(상세 · 업로드 주소 · 일시 예약불가 목록) · 큐 10. 쓰기 10개는 `@Transactional()` + 업체 행 잠금, 조회 3개는 잠그지 않는다.
- 영업시간: 연중무휴 1 ↔ 빈 배열, 0 ↔ 일 ~ 토 7개, 휴무면 시각 NULL, 시작 = 마감 400(24시간은 연중무휴). 브레이크: 매일 · 겹침 금지(맞닿음 허용 · 자정 넘김) · 시작 = 마감 400. 일시 예약불가: 없는 날짜 · 시작 ≥ 종료 · 이미 끝남 400, 겹침 400, 메모 30자, 삭제는 그 업체 것만.
- 사진: 키 `store/<store_id>/…`(용도 룩업 is_private), 한도 5장(승인 사진 포함), 순서 = 가장 큰 순서 + 1, 순서 변경은 업체 사진 전부 한 번씩, 사업자등록증은 삭제 · 순서 대상 아님.
- plan 과 다른 점: `buildStoreByManagerQuery` 의 `loadAllRelationIds({disableMixedMap: true})` 가 관계 ID 를 객체로 채워 옵션 없는 호출로 고쳤다(PGlite 로 발견 · 확인, SQL 같음 — plan 도 고침). 생성된 마이그레이션 down 의 예전 인덱스 컬럼 순서 · 요일 COMMENT 를 고쳤다.
- 쓸모없어진 코드 삭제 확인: `kst.ts`(`kstDayStart` · `kstYear`) 참조 0건, 브레이크 `day_of_week` 참조 0건(마이그레이션 제외), 키 모양 확인 로직은 공통 헬퍼로 합쳤다.
- Data-Access Smoke: 새 빌더 4개 모두 SQL 고정(실제 SQL 을 dist 로 뽑아 고정). `countUnavailablePeriods` 는 같은 FindOptions where 경로라 목록 빌더 Smoke 가 겹침 조건까지 고정한다.
- 검증 명령: typecheck · lint · build(4개 앱) · db:check · Prettier 통과. PGlite 14항목 OK(마이그레이션 up → down(브레이크 행 있음) → up, 소속 업체 · 탈퇴 제외 · 잠금(트랜잭션 밖 500 · 안 정상), 영업시간 · 브레이크 조회, CHECK, 겹침 1 · 맞닿음 0, 남의 업체 삭제 false). 테스트 실행은 `/beaver:test` 몫.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | docs/api.md:75 | 큐 핸들러 데코레이터 순서의 `@Roles`(그룹 안 권한 시 — **사례 없음**)이 Phase 10 이후 사실과 다르다 — 업체 관리자 큐 라우트(manager.controller.queue.ts staff)가 이미 `@Roles(HEAD_MANAGER)` 를 쓴다. 이번 diff 가 만든 것은 아니다. | 문서 한 줄만 지금 고친다("사례 — 업체 관리자 staff 라우트"). |
| 2 | Low | .beaver/memory/datetime.md · docs/conventions.md | memory reconcile — `datetime` 의 조항 중 "이미 있는 직접 계산은 바꾸고 지운다" 와 예외("엔티티 훅 · 조건의 지금 값 · 봉투 timestamp 는 그대로")가 docs 에 아직 없다. 이대로 보관하면 부분 이관이다. | 두 조항을 docs/conventions.md 의 dayjs 항목에 더한 뒤 보관한다. |
| 3 | Info | apps/admin-service/src/store/store.service.ts (`removeMyStoreFile` · `createMyStoreFileUploadUrl`) | 기존 `findStoreFile` · `countStoreFiles` 에 새 조건 모양(`store_id` · `store_file_purpose_id` 관계 필드)을 넘긴다. 메서드 자체는 바뀌지 않았고 같은 FindOptions 관계 필드 where 는 다른 Smoke(목록 · 영업시간)가 덮는다. | 조치 없음. |
| 4 | Info | apps/admin-service/src/store/test/store-mine*.spec.ts | 새 spec 11개는 build 정책상 아직 실행하지 않았다. 기준선 실패 4건은 고쳤다. | `/beaver:test` 에서 처음 실행된다. |

## Memory Reconcile
- `data-layer`(영업시간 세트 규칙) — 모든 조항(휴무 아님 → 둘 다 · 하나만 있는 행 금지 · 휴무 → 둘 다 NULL · CHECK · DTO 짝 필드 · service · 시드 · 테스트 데이터도 이 조합만)이 AGENTS.md Data Layer · docs/data-layer.md `time` 항목에 들어갔다 → `_archived/data-layer.md` 로 보관 제안.
- `datetime`(날짜 · 시각은 dayjs) — Finding 2 의 두 조항을 더하면 전부 이관 → 보관 제안.
- `cache` — 캐시 코드가 생길 때(Phase 23). 제안하지 않는다. `git` · `api-log` — 운영 결정(불필요).

## Verdict
Pass — High · Medium 없음. Low 2건은 사용자 승인으로 커밋 전에 고쳤다(문서만, 코드 변경 없음) — docs/api.md:75 문구, docs/conventions.md · AGENTS.md dayjs 항목에 "기존 계산은 바꾸고 지운다" · 예외 조항. memory `data-layer` · `datetime` 은 조항 단위로 다시 대조한 뒤 `_archived/` 로 보관했다(사용자 승인). Info 2건은 조치 없음.
