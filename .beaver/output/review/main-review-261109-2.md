# Review — main — 261109-2

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: `main`(direct mode — worktree 없음) → origin: `main`
- Included features: 관리자 계정 관리(Phase 20 — #84 · #85) — [plan](../plan/user/user-manage-plan.md) · [spec](../spec/user/user-manage-spec.md) · [report](../report/user/user-manage-report.md)
- Change scope: 41 files changed(+753 · −75) + 새 파일 32 — contracts(DTO 7 새 + 1 수정 · 명령 · 내부 경로) · admin-service 새 `user` 도메인 · manager(업체 관리자 관리) · user-service user(이용 제한 로그인) · reservation(예약 · 연장 막기) · gateway 라우트 7 · 문서 · 로드맵 · spec 보드 · 메모리(architecture)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 새 도메인 `user`(admin-service — user-service `user` 와 같은 이름 따로), 규격 상수 `USER_ADMIN_COMMAND` · `USER_ADMIN_INTERNAL_PATH`(같은 대상 도메인 상수 이름으로 가름), 명령 `admin.user.state` · `admin.manager.account-password-reset`, DTO kebab 기능당 1개, 게이트웨이 별칭 `AdminUserModule` |
| Structure & layering | pass | 서버는 행위자(관리자 → admin-service), 서버 안 도메인은 기능 대상(이용자 → `user`, 매니저 계정 → `manager` — 메모리 architecture 규칙), controller 위임만, repository 만 TypeORM, 앱끼리 import 없음 |
| Shared logic extraction | pass | 판정 · 변환은 util(`judgeUserStateChange` · `toReservationSummary` · `toAccountFilter` · `judgeReservationMember`), service private 헬퍼 0, 반복 문구 상수(`USER_NOT_FOUND_MESSAGE` · `MANAGER_PHONE_NOT_REGISTERED_MESSAGE` — 업체 총관리자 초기화도 같은 상수로) |
| Errors & responses | pass | 404 · 400(같은 상태 · 탈퇴 대기 · 탈퇴 · 상태 바뀜 · 휴대폰 없음 · 탈퇴 업체) · SMS 마지막(503 재시도), 상태 조건 쓰기는 boolean → 400 롤백, 응답 필드 null 포함(`phone` · `phone_verified_at` · `sns_id` · `block_comment` · `leave_reserved_at` · `canceled_at` · `cancel_actor`) |
| Test strength | pass | 계산 표 2종(member-state 10 · reservation-summary 5)을 service spec 이 지난다, 쓰기 조건 · 엔티티 `toBeInstanceOf` · 호출 순서 · 미호출 단언, 새 매핑 민감 쿼리 전부 Smoke(이용자 목록 · 건수 GROUP BY · 이력 조인 · count `Not` · update 지금 상태 · 업체 관리자 동적 조립 · 이용자 인증 확인 상태 IN) |

memory: `git`(산출물 커밋 포함 — 지킴) · `api-log`(해당 없음) · `cache`(미반영 code rule — 캐시 코드가 아직 없어 무관, Phase 23 에 옮긴다) · **`architecture`(미반영 code rule — 서버 안 도메인은 기능 대상별) → AGENTS.md Architecture 에 정식 반영 제안**(docs/architecture.md 에는 build 때 적었다).

## Intended Behavior Check (against plan/spec)
- **이용자 관리(#84)** — 목록(이용자 그룹 · 상태 · SNS · 검색 OR 4 · 가입 최신순) · 상세(예약 건수 요약 — 결제 대기 만료 제외) · 예약 이력(조인 · 만료 제외 · 이용 시작 최신순) · 이용 제한 · 해제(ACTIVE ↔ BLOCK, 사유는 제한할 때만, 지금 상태 조건 쓰기). 맞음.
- **이용 제한의 뜻** — user-service 만 바꿨다: 로그인 BLOCK 도 200 + `state_id` · `block_comment`, 재발급 ACTIVE · BLOCK, 인증 확인 ACTIVE · BLOCK · LEAVE_WAIT(`is_login_allowed` 조건 대신 상태 목록), 예약 생성 · 연장 조회 · 신청은 정상만(BLOCK · LEAVE_WAIT 400 / 조회 reason). 매니저 · 관리자 로그인 쿼리(`is_login_allowed = 1`)는 그대로라 그 그룹의 BLOCK 은 로그인 불가. `t_state` 무변경. 결제 확인 · 취소 · QR · 휴대폰 인증 · 탈퇴 신청은 BLOCK 이용자도 그대로(상태 조건 없음 — 확인). 맞음.
- **업체 관리자 관리(#85)** — 전체 업체의 업체 총관리자 · 업체 관리자 목록(업체 · 권한 · 상태 · 검색) · 상세 · 비밀번호 초기화(휴대폰 없음 · 탈퇴 업체 400, 정지 계정도 초기화), 계정 정지 없음. 맞음.
- 빠진 것 · 잘못된 것 없음. 검증: typecheck · lint · build · db:check 통과, 전체 118파일 1298건 통과(build 단계 확인 실행).

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | apps/user-service/src/user/user.service.ts `login` · `tokenRefresh` (기존 동작) | 탈퇴 대기(LEAVE_WAIT) 이용자는 로그인 404 · 재발급 401 이라 access 토큰(20분)이 끝나면 다시 들어올 수 없다 — 탈퇴 철회(`user.member.leave-cancel`)는 로그인이 필요해 14일 대기 중 철회할 길이 사실상 없다. 이번 변경 전부터 있던 동작이고 Phase 20 범위 밖 | 그대로 두고 별도 작업으로 — 로그인 · 재발급 상태에 LEAVE_WAIT 를 넣을지(철회만 허용) 결정 필요 |
| 2 | Low | apps/admin-service/src/user/controllers/user.controller.queue.ts · manager.controller.queue.ts `resetAccountPassword` | 총관리자 명령 2개는 `requireActor()` 를 부르지 않는다(체크리스트 "로그인 필요 명령은 requireActor") — 형제인 업체 상태 변경 `admin.store.state` 와 같은 방식(관리자 가드는 게이트웨이, `roomless.cmd` 는 gateway 계정만 발행) | 그대로 둠 — 형제와 같게. 바꾸면 총관리자 명령 전체를 한 번에 |
| 3 | Low | apps/user-service/src/user/repositories/user.repository.ts `buildLoginUserQuery` | 이용 제한 이용자의 인증 확인(auth-user) 결과 `is_login_allowed` 는 0 으로 나간다(BLOCK 룩업 값) — 게이트웨이 전략은 이 값을 보지 않는다(결과가 있으면 통과) | 그대로 둠 — 응답 필드 설명만 "이용자 그룹은 상태 목록으로 판정" 으로 이해. 쓰는 곳이 생기면 그룹별 의미로 바꾼다 |
| 4 | Low | apps/admin-service/src/user/repositories/user.repository.ts `buildUserListQuery` | 목록이 `getMany` 로 회원 전체 컬럼(비밀번호 해시 · 탈퇴 백업 포함)을 읽는다 — 응답 매핑(`toUserListItem`)에서 빠지므로 밖으로 나가지 않는다. 업체 관리자 목록(`buildStaffListQuery`)과 같은 방식 | 그대로 둠 — 필요하면 select 를 좁힌다 |

## Verdict
Pass — 막는 문제 없음(Low 4건 — #1 은 기존 동작이라 별도 작업 권고, 나머지는 그대로 두는 권고). 커밋 단계로 진행한다. 메모리 `architecture` 규칙의 AGENTS.md 정식 반영을 함께 제안한다.
