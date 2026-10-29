# Review — store-operation 리비전 261029-1 (관리자 영업중 여부 · 정지 사유 · 예약 · 환불 규정) — 261029

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — direct 모드라 `<branch>-review-<YYMMDD>.md`.

## Target
- stick: 없음(direct 모드) — `main` 에 바로 커밋 · 푸쉬
- Included features: [store-operation-revision-261029-1](../revision/store/store-operation-revision-261029-1.md) — 관리자 영업중 여부 전환, 영업중지 정지 사유, 업체별 예약 가능 시작 · 100% 환불 기준
- Change scope: 수정 22 · 새 파일 6(DTO 2 · spec 2 · 마이그레이션 · 리비전) — +263 / −19(수정분)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 명령 `admin.store.open` · `admin.store.mine-reservation-policy`, DTO `store-open.dto.ts`(`StoreOpenParamDto` · `StoreOpenDto` — 내 업체 `StoreMineOpenDto` 와 모양이 같아도 독립 선언) · `store-mine-reservation-policy.dto.ts`, 컬럼 `booking_open_hours` · `refund_deadline_hours`(단위 접미 — `maintenance_minutes` 와 같은 꼴, docs 에 규칙 추가) · `suspend_comment`(`block_comment` · `reject_comment` 와 같은 꼴) |
| Structure & layering | pass | controller 위임 한 줄 · 큐 컨트롤러 providers, 게이트웨이 큐 라우트는 매니저 묶음(`/mine/reservation-policy`)과 관리자 묶음(`/:store_id/open` — `/:store_id/state` 다음, `/mine/open` 뒤)에 각각 |
| Shared logic extraction | pass | service private 헬퍼 0, 기본값은 `store.constants.ts` 상수, 응답 변환은 기존 `toStoreDetail` · `toMineDetail` 에 필드만 |
| Errors & responses | pass | 관리자 영업중 여부는 형제(`changeStoreState`) 그대로 — 없는 업체 404 · 탈퇴 400 · 같은 값 400(상수 메시지). 규정 설정은 소속 업체 없음 404. 응답 새 필드 null 포함(`suspend_comment ?? null`) |
| Test strength | pass | 새 spec 2(엔티티 `toBeInstanceOf` · 바꾼 컬럼만 · 잠금 인자 · 실패 뒤 미호출 · 범위 · 경계 · actor 없음), 기존 spec 4 에 사유 · 새 필드 · 승인 기본값 단언 |

memory 규칙: `git` — 리비전 · report · review 를 커밋에 포함. `cache` — 관리자 영업중 여부 · 정지 사유 · 규정 쓰기를 cache-spec discovery 무효화 지점 표에 더했다. `api-log` — 해당 없음.

## Intended Behavior Check (against plan/spec)
- 리비전 Spec Before → After 의 모든 줄이 구현돼 있다 — 관리자 영업중 여부(관리자가 바꾸는 운영 설정은 이것 하나), 정지 사유(영업중지일 때만 · 활성 · 탈퇴면 비움), 규정 두 값(범위 1 ~ 4,320 · 0 ~ 168, 기본 72 · 1, 승인 때도 같은 값), 응답 세 필드.
- 하지 않은 것도 리비전대로 — 관리자의 정비시간 · 영업시간 등 변경 없음, 규정의 실제 적용(예약 · 환불 신청 차단 · 스냅샷 · 토스페이먼츠 백그라운드 환불)은 Phase 17.
- Data-Access Smoke: 새 데이터 접근 메서드는 없다. 업체 엔티티에 컬럼이 늘어 `STORE_SELECT` 스냅샷을 dist 로 뽑은 실제 SQL 로 고쳤다(업체 목록 · 소속 업체 Smoke 가 같이 쓴다).
- 검증 명령: typecheck · lint · build(4개 앱) · db:check 종료 코드 0, Prettier 통과. PGlite — 직전 마이그레이션까지 적용한 업체 행이 `StoreReservationPolicy` 뒤 72 · 1 · NULL, 되돌리기 · 다시 적용 OK. 테스트 실행은 `/beaver:test` 몫.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Info | apps/admin-service/src/store/store.service.ts (`changeStoreState`) | 이미 영업중지인 업체의 정지 사유만 바꾸려면 활성으로 되돌린 뒤 다시 정지해야 한다(같은 상태 400 그대로). 리비전 Decisions 에 적은 동작이다. | 조치 없음. 사유만 바꾸는 요구가 생기면 별도 API 로. |
| 2 | Info | apps/admin-service/src/store/test/store-open.spec.ts · store-mine-reservation-policy.spec.ts | 새 spec 은 build 정책상 아직 실행하지 않았다. | `/beaver:test` 에서 처음 실행된다. |

## Memory Reconcile
- `cache` — 캐시 코드가 생길 때(Phase 23). 제안하지 않는다. `git` · `api-log` — 운영 결정(불필요). 보관 대상 없음.

## Verdict
Pass — no issues(High · Medium · Low 없음, Info 2건 조치 없음).
