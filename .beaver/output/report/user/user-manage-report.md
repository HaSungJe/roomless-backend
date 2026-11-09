# Report — user-manage

## Feature Summary
- **Feature**: 관리자 계정 관리(Phase 20) — 총관리자 · 관리자가 이용자를 찾아 보고(상세 · 예약 이력) 이용 제한 · 해제하고, 전체 업체의 업체 총관리자 · 업체 관리자를 찾아 보고 비밀번호를 초기화한다.
  - 이용 제한(BLOCK) 이용자는 로그인 · 토큰 재발급 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다(탈퇴 대기도 예약 불가). 매니저 · 관리자의 BLOCK 은 로그인 불가 그대로 — `t_state` 는 바꾸지 않았다
  - 업체 관리자 계정 정지는 두지 않는다 — 정지는 업체 단위(기존 업체 상태 변경)
  - 서버 안 도메인은 기능 대상별(사용자 결정 2026-11-09) — 이용자 관리는 admin-service 새 `user` 도메인, 업체 관리자 관리는 `manager` 도메인
- **Entry point**:
  - 관리자 가드 동기: `GET /api/v1/admin-service/user` · `/user/:user_id` · `/user/:user_id/reservation` · `GET /api/v1/admin-service/manager/account` · `/manager/account/:user_id`
  - 관리자 가드 큐: `PATCH /api/v1/admin-service/user/:user_id/state`(`admin.user.state`) · `PATCH /api/v1/admin-service/manager/account/:user_id/password-reset`(`admin.manager.account-password-reset`)
  - 기존 변경: 이용자 로그인(결과 `state_id` · `block_comment`, BLOCK 도 200) · 토큰 재발급(ACTIVE · BLOCK) · 인증 확인 auth-user(ACTIVE · BLOCK · LEAVE_WAIT) · 예약 생성 · 연장 조회 · 신청(정상 회원만)
- **Domain**: user(admin-service user 새 · user-service user · reservation) · manager(admin-service manager) — 로드맵 Phase 20 의 #84 · #85
- **Plan**: [user-manage-plan.md](../../plan/user/user-manage-plan.md) · **Spec**: [user-manage-spec.md](../../spec/user/user-manage-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/contracts/src/user/user.commands.ts` | modified | `USER_ADMIN_COMMAND`(`admin.user.state`) · `USER_ADMIN_INTERNAL_PATH`(목록 · `detail()` · `reservations()`) |
| `libs/contracts/src/user/dto/user-list.dto.ts` · `user-detail.dto.ts` · `user-reservation-list.dto.ts` · `user-state.dto.ts` | created | 이용자 목록(검색어 · 상태 · SNS) · 상세(예약 건수 요약) · 예약 이력 · 이용 제한 |
| `libs/contracts/src/user/dto/user-login.dto.ts` | modified | 결과 `state_id` · `block_comment` |
| `libs/contracts/src/manager/manager.commands.ts` | modified | `ACCOUNT_PASSWORD_RESET` · `ACCOUNT_LIST` · `account()` |
| `libs/contracts/src/manager/dto/manager-account-list.dto.ts` · `manager-account-detail.dto.ts` · `manager-account-password-reset.dto.ts` | created | 업체 관리자 목록(검색어 · 업체 · 권한 · 상태) · 상세 · 비밀번호 초기화 |
| `apps/admin-service/src/user/` (module · symbols · constants · util · service · interfaces · repositories · controllers 2) | created | 이용자 관리 도메인 — 목록(WHERE 배열 OR) · 상세(상태별 건수 GROUP BY → 요약) · 예약 이력(조인) · 이용 제한 · 해제(`judgeUserStateChange` · 지금 상태 조건 쓰기) |
| `apps/admin-service/src/admin-service.module.ts` | modified | `UserModule` 등록 · 주석 |
| `apps/admin-service/src/manager/` (constants · util · service · interfaces · repositories · controllers 2 · module) | modified | `buildAccountQuery`(업체 조인 · 동적 조립 · 검색 괄호 OR) · `countAccounts` · `findAccountRows` · `findAccountRow`, service `getAccountList` · `getAccount` · `resetAccountPassword`, 문구 상수 `MANAGER_PHONE_NOT_REGISTERED_MESSAGE`(업체 총관리자 초기화도 같이) · `MANAGER_STORE_STATE_LEAVE` |
| `apps/user-service/src/user/` (constants · service · repositories) | modified | `USER_LOGIN_STATES` · `USER_AUTH_STATES`, 로그인 BLOCK 403 삭제 · 결과 필드, 재발급 ACTIVE · BLOCK, auth-user 상태 목록(`is_login_allowed` 조건 삭제) |
| `apps/user-service/src/reservation/` (constants · util · service · interfaces · repositories) | modified | `judgeReservationMember`, `findReservationUser`, 예약 생성 0단계 · `judgeExtension` 맨 앞 회원 판정(`member_state_id`) |
| `apps/gateway/src/api/v1/admin-service/user/` (module · controllers 2) | created | 공개 라우트 4(관리자 가드) |
| `apps/gateway/src/gateway.module.ts` · `api/v1/admin-service/manager/` (controllers 2 · module) | modified | `AdminUserModule` · 업체 관리자 관리 라우트 3(관리자 가드) |
| 테스트 — 아래 Tests Written | created · modified | |
| `README.md` · `AGENTS.md` · `docs/architecture.md` · `docs/testing.md` | modified | 이용자 관리 · 업체 관리자 관리 · 이용 제한 로그인 · 서버 안 도메인 기능 대상별 · Smoke 목록 |

## Tests Written
- user-service
  - `user-login.spec.ts` — `[CASES:member-state]` ACTIVE 결과(`state_id` · `block_comment` null) · BLOCK 200(403 케이스를 바꿈 — 기기 동기화 · 세션 · refresh 그대로) · 탈퇴 대기 · 탈퇴 404(조회 조건 `In(['ACTIVE', 'BLOCK'])`).
  - `user-token-refresh.spec.ts` — BLOCK 재발급 성공(정지 401 케이스를 바꿈), LEAVE_WAIT · LEAVE · 다른 그룹 401 + 만료 단축.
  - `user.repository.spec.ts` — Smoke `buildLoginUserQuery`(상태 IN 3 · `is_login_allowed` 조건 없음).
  - `reservation-create.spec.ts` — `[CASES:member-state]` ACTIVE(회원을 먼저 읽음) · BLOCK · LEAVE_WAIT 400(호실 조회 · 쓰기 없음).
  - `reservation-extension.spec.ts` — 회원 판정 3(BLOCK · LEAVE_WAIT · 시작 전이 겹쳐도 회원 사유가 먼저), `reservation-extend.spec.ts` — BLOCK 400 · 쓰기 없음. 도우미 `findReservationUser` 기본 ACTIVE.
- admin-service user(새)
  - `user-state.spec.ts`(큐) — `[CASES:member-state]` 전환 3 · 거부 4(같은 상태 · 탈퇴 대기 · 탈퇴), 404, 상태 조건 0행 400, 검증 3.
  - `user-detail.spec.ts`(동기) — `[CASES:reservation-summary]` 5, 응답 모양 · 탈퇴 대기, 404(건수 조회 없음), 검증, 내부 토큰 403.
  - `user-list.spec.ts` · `user-reservation-list.spec.ts`(동기) — WHERE(필터 없음 · 상태 · SNS · 검색어 OR 4 · 이스케이프) · 페이지 인자 · 항목 매핑, 404, 검증.
  - `user.repository.spec.ts` — 조건 그대로 · `updateUser` boolean · 통일 500, Smoke 5(목록 · 건수 GROUP BY · 이력 조인 · count `Not` · update 지금 상태).
- admin-service manager
  - `manager-account-list.spec.ts` · `manager-account-detail.spec.ts`(동기) — 필터 매핑(빈 값 null) · 페이지 · 항목(업체 필드 · 문자열 플래그 숫자로) · 404 · 검증 4.
  - `manager-account-password-reset.spec.ts`(큐) — 업체 관리자 · 정지된 업체 총관리자 · 영업중지 업체 계정 초기화(쓰기 → SMS 마지막), 404 · 탈퇴 업체 400 · 휴대폰 없음 400(쓰기 · SMS 없음), SMS 503 requeue, 검증.
  - `manager.repository.spec.ts` — 통일 500 3 · `findAccountRow` 필터, Smoke `buildAccountQuery`(필터 없음 · 모든 필터 + 검색어 괄호 OR — 같은 파라미터 `$8` 재사용).
- 게이트웨이 · 모듈 등록 · contracts 상수는 plan 대로 spec 없음.

## Verification
- `npm run typecheck` · `npm run lint` · `npm run build`(4개 앱) · `npm run db:check`(스키마 변경 없음 — 일치) 통과, 바뀐 파일 Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): 전체 118파일 1298건 통과. 첫 실행 실패는 테스트 쪽 실수뿐 — 회원 ID 상수가 hex 가 아니었음(`'u'.repeat(32)` → `'c'.repeat(32)`), 총 개수 0 이면 페이지가 1로 맞춰져 offset 0(Pagination 동작 — 개수를 넣음), 성공 결과의 `error` 는 null. Smoke SQL 은 실행 출력으로 채웠다.
- plan 대비 차이
  - 업체 관리자 관리 테스트용 `validateBody` 를 매니저 테스트 도우미에도 둔다(다른 도메인 도우미를 가져다 쓰지 않는다).
  - 업체 관리자 목록 항목의 `is_password_change_required` 는 raw 값이 문자열일 수 있어 `Number()` 로 바꾼다(plan 코드 그대로 — 테스트로 확인).
  - 총관리자 큐 핸들러(`admin.user.state` · `admin.manager.account-password-reset`)는 업체 상태 변경(`admin.store.state`)처럼 actor 를 service 에 넘기지 않는다 — 관리자 가드는 게이트웨이.

## Remaining Issues
- 사용자(배포 — ship 때 로드맵 사용자 할 일에 정리)
  - 마이그레이션 없음. admin-service · user-service · gateway 새 이미지(gateway 는 마지막 — 새 명령 `admin.user.state` · `admin.manager.account-password-reset` 을 admin-service 가 먼저 받게).
  - 프론트: 관리자 화면의 이용자 관리(목록 · 상세 · 예약 이력 · 이용 제한 · 해제) · 업체 관리자 관리(목록 · 상세 · 비밀번호 초기화), 이용자 앱은 로그인 결과 `state_id` 가 BLOCK 이면 이용 제한 안내(사유 `block_comment`) · 예약 · 연장 버튼 막기(서버도 400).
- 기존 동작 그대로: 탈퇴 대기 이용자는 로그인 404 · 재발급 401(이번에 바꾸지 않음).
