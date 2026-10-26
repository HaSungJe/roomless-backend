# Review — manager-staff (Phase 10 업체 인력) — 261027

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — direct 모드라 `<branch>-review-<YYMMDD>.md`.

## Target
- stick: 없음(direct 모드) — `main` 에 바로 커밋 · 푸쉬
- Included features: Phase 10 업체 인력(#42, #43 dropped) — 업체코드 · 업체 단위 매니저 계정, 입점 신청 자격증명 · 승인 보정(Phase 9), 업체 관리자 계정 관리(+ 정지 · 해제)
- Change scope: 수정 57 · 새 파일(DTO 7 · spec 7 · constants · search util · 마이그레이션 · spec · plan · report) — +1346 / −290

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | DTO `manager-staff{,-list,-detail,-update,-password-reset,-state,-delete}.dto.ts` · 클래스 `ManagerStaff…Dto` · 명령 `admin.manager.staff*` · 인덱스 `UK_User_…StoreId` · `UK_Store_StoreCode` |
| Structure & layering | pass | 매니저 도메인이 `t_user`(매니저 그룹)를 소유, `t_store` 는 매니저 어휘 `findManagerStore` 로 읽는다. controller 위임 한 줄, 큐 컨트롤러 providers, 게이트웨이 동기 · 큐 2파일, 내부 경로 함수 `staff(user_id)` |
| Shared logic extraction | pass | service private 헬퍼 0 — WHERE · 변환 · SMS 문구는 `manager.util.ts`, 검색어 이스케이프는 `libs/common/src/utils/search.ts` 로 옮겨 store · manager 가 같이 쓴다, 반복 메시지는 `manager.constants.ts` |
| Errors & responses | pass | 업체 단위 UK → 400(`insertStaff` · `updateStaff`), 그 밖 통일 500, 입력 귀속 오류만 `validation_errors`(login_id · phone), 남의 업체 · 자신 · 삭제 대상은 404(존재 비노출), 업체코드 없음은 계정 없음과 같은 404, SMS 는 쓰기 뒤 마지막 |
| Test strength | pass | API 1개당 spec(인력 7 + 인증 3 수정), 엔티티 `toBeInstanceOf` · 컬럼 · 호출 조건(`Not` · `In`) · SMS 본문 · 순서 · 미호출 · requeue. Smoke `buildStaffListQuery`(관계 컬럼 정렬 · ILike OR) |

memory 규칙: `git` — 산출물 커밋 포함. `api-log` — 임시 비밀번호는 응답에 싣지 않고 SMS 로만(해당 없음). `cache` — 업체 관리자 등록 · 수정 · 정지 · 해제 · 삭제를 cache-spec 무효화 지점 표에 더했다. `data-layer`(영업시간 세트) — 이번 변경과 무관.

## Intended Behavior Check (against plan/spec)
- spec C #1 ~ #7 이 모두 있다 — 동기 2(목록 · 상세) · 큐 5(등록 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제), 전부 매니저 가드 + RolesGuard · `@Roles(HEAD_MANAGER)`.
- 업체 단위 유일성: 부분 유니크 인덱스 4개. PGlite 로 허용 · 거부 · 미인증 NULL · 되돌리기를 실제로 확인했다(report).
- 매니저 인증 3종에 `store_code` — 업체코드 → 업체 → 그 업체 안 계정. 확인 단계 · 재발급 · auth-user 는 그대로.
- 입점: 신청 자격증명(해시) → 승인 때 계정에 그대로 · `is_password_change_required = 0` · 승인 알림 SMS · `{store_id, store_code}`. 내 신청은 모든 상태 + 승인이면 `store_code`.
- plan 과 다른 점: 업체 관리자 상세에 `block_comment` 추가(정지 · 해제 화면), 매니저 도우미 `internalHeaders(clientIp, actor?)`.
- 쓸모없어진 코드 삭제 확인: `generateHeadManagerLoginId` · `HEAD_MANAGER_LOGIN_ID_ATTEMPTS` · `countManagers` · `HEAD_MANAGER_PHONE_TAKEN_MESSAGE` · `STORE_APPLICATION_VISIBLE_STATES` 참조 0건.
- Data-Access Smoke: 새 매핑 민감 메서드 `findStaffList` → `buildStaffListQuery` SQL 고정. `countStaff` 는 같은 FindOptions where 경로라(Repository.count → setFindOptions) 목록 Smoke 가 같은 매핑을 덮는다.
- 검증 명령: typecheck · lint · build · db:check 통과. 테스트 실행은 `/beaver:test` 몫.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | apps/gateway/src/api/v1/admin-service/store/controllers/store.controller.ts:43 · :61, store.controller.queue.ts:123, apps/admin-service/src/store/controllers/store.controller.queue.ts:74, libs/contracts/src/store/dto/store-my-application-list.dto.ts:5, store-my-application.dto.ts:41 | 주석 6곳이 Phase 9 동작을 설명한다 — "승인 신청은 보이지 않는다 · 404", 승인 결과 "업체 ID · 아이디". 이번 변경으로 승인 신청도 보이고(store_code 포함) 승인 결과는 `{store_id, store_code}` 다. 코드 동작 · Swagger 응답 타입에는 영향이 없다. | 주석만 지금 고친다(코드 변경 없음). |
| 2 | Info | `roadmap-status.js --phase N --status …` (beaver 0.37.0) | dropped 로 둔 유닛(#43)까지 같은 상태로 덮어쓴다 — direct 의 in-progress 표시 때 #43 이 되돌아가 `--units 43` 으로 다시 dropped 로 돌렸다. | 이번 ship 의 done 표시는 `--units 42` 로 한다. 플러그인 쪽 수정 후보. |

## Memory Reconcile
- `data-layer`(영업시간 세트 규칙) — Phase 11 때 옮기기로 결정됨(261026 리뷰). 이번에는 제안하지 않는다.
- `cache` — 캐시 코드가 생길 때(Phase 23) 옮긴다. 제안하지 않는다.
- `git` · `api-log` — 운영 결정(불필요).

## Verdict
Pass — High · Medium 없음. Low 1건(주석 6곳)은 사용자 승인으로 커밋 전에 고쳤다(주석만, 코드 변경 없음). Info 1건은 ship 절차(`--units 42`)로 피한다.
