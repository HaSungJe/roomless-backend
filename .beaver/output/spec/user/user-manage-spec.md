---
# One-line feature summary (e.g. "Admin user sign-up")
feature_goal: "관리자 계정 관리(Phase 20) — 총관리자 · 관리자가 이용자를 찾아 보고(상세 · 예약 이력) 이용 제한 · 해제하고, 전체 업체의 업체 총관리자 · 업체 관리자를 찾아 보고 비밀번호를 초기화한다. 이용 제한(BLOCK) 이용자는 로그인 · 재발급 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다"

# Domain/module name (see AGENTS.md for the project directory structure)
domain: "user — admin-service user(새 — 총관리자의 이용자 관리) · user-service user(이용 제한 이용자 로그인 · 재발급 · 인증 확인) · user-service reservation(이용 제한 · 탈퇴 대기 이용자의 예약 · 연장 막기), manager — admin-service manager(총관리자의 업체 관리자 목록 · 상세 · 비밀번호 초기화). 스키마 변경 없음"

# Entry-point method/endpoint. Record the entry-point identifier this project actually uses,
#   derived from code evidence (path:line), in the project's own naming. Do not assume a
#   particular position's syntax. (key name "api_method" stays as-is)
api_method: "동기 GET 이용자 목록 · 상세 · 예약 이력 · 업체 관리자 목록 · 상세, 큐 admin.user.state(이용 제한 · 해제) · admin.manager.account-password-reset(비밀번호 초기화), 기존 변경(이용자 로그인 · 토큰 재발급 · 인증 확인 auth-user · 예약 user.reservation.create · 연장 조회 · 신청 user.reservation.extend)"

# Path/signature (e.g. "/api/v1/user/admin/sign")
#   Record the path or signature this project actually uses, from code evidence (path:line),
#   in the project's own naming. (key name "api_path" stays as-is)
api_path: "GET /api/v1/admin-service/user · GET /api/v1/admin-service/user/:user_id · GET /api/v1/admin-service/user/:user_id/reservation · PATCH /api/v1/admin-service/user/:user_id/state · GET /api/v1/admin-service/manager/account · GET /api/v1/admin-service/manager/account/:user_id · PATCH /api/v1/admin-service/manager/account/:user_id/password-reset · (변경) POST /api/v1/user-service/user/login · token-refresh · POST /api/v1/user-service/reservation · GET · POST …/reservation/:reservation_id/extension"

# Affected state — write/persist targets. Basis for sizing the test cases. (key name "affected_data" stays as-is)
#   Record the state this project actually writes/persists, derived from code evidence (path:line),
#   in the project's own naming. Read-only reads are not "write" but are still data. Leave empty if none.
affected_data:
  - "t_user — 이용자 state_id(ACTIVE ↔ BLOCK) · block_comment(제한할 때만, 해제하면 null)"
  - "t_user — 업체 관리자 · 업체 총관리자 login_pw(임시 비밀번호 bcrypt) · is_password_change_required = 1"
  - "SMS — 비밀번호 초기화 임시 비밀번호(SMS_SENDER, 마지막 단계)"
  - "t_session · t_session_refresh — 이용 제한 이용자도 로그인 · 재발급으로 쌓인다(기존과 같은 쓰기)"
---

## Feature Description

총관리자 · 관리자가 이용자를 검색해 상세와 예약 이력을 보고, 이용 제한(정지) · 해제를 한다. 이용 제한은 로그인을 막지 않고 새 예약 · 연장만 막는다 — 제한 전에 결제한 예약은 그대로 이용한다.
전체 업체의 업체 총관리자 · 업체 관리자를 업체 · 권한 · 상태로 찾아 보고 비밀번호를 초기화한다(임시 비밀번호 SMS). 업체 관리자 계정 정지는 두지 않는다 — 정지는 업체 단위(기존 업체 상태 변경)로 한다.
admin-service 안의 도메인은 기능 대상으로 나눈다 — 이용자 관리는 새 `user` 도메인, 업체 관리자 관리는 `manager` 도메인(사용자 결정 2026-11-09).

## API Spec

모두 관리자 가드(`PassportJwtAdminAuthGuard` — 총관리자 · 관리자, `@Roles` 없음 — 기존 업체 관리와 같다, store.controller.ts:101).

### 1. 이용자 목록 (동기)
- Method: GET
- Path: `/api/v1/admin-service/user` → 내부 `/internal/v1/admin-service/user`
- Request query: `page` · `size`(PaginationDto 기본값), `keyword`(선택, 100자 — 이름 · 닉네임 · 휴대폰 번호 · 회원 식별 코드 부분 일치), `state_id`(선택 — ACTIVE · BLOCK · LEAVE_WAIT · LEAVE), `sns_id`(선택 — GOOGLE · FACEBOOK · APPLE · KAKAO · LINE · NAVER)
- Response 200: `{list: [{user_id, user_search_code, nickname, name, phone | null, sns_id | null, state_id, is_phone_verified, created_at}], pagination}` — 이용자 그룹(`login_scope = USER`)만, 가입 최신순
- 실패: 400 검증 · 401 · 500

### 2. 이용자 상세 (동기)
- Method: GET
- Path: `/api/v1/admin-service/user/:user_id`
- Response 200: `{user_id, user_search_code, nickname, name, gender, birth, phone | null, phone_verified_at | null, sns_id | null, state_id, block_comment | null, leave_reserved_at | null, created_at, reservation_summary: {total, in_progress, completed, canceled}}`
  - `reservation_summary` — 그 이용자 예약의 상태별 건수: 전체(결제 대기 만료 제외) · 진행 중(결제 대기 · 확정 · 이용 중) · 이용 완료 · 취소
- 실패: 400 검증(user_id 32자 hex) · 401 · 404 이용자 아님 · 500

### 3. 이용자 예약 이력 (동기)
- Method: GET
- Path: `/api/v1/admin-service/user/:user_id/reservation`
- Request query: `page` · `size`
- Response 200: `{list: [{reservation_id, store_id, store_name, room_name, room_group_name, room_plan_type_id, room_plan_type_name, reservation_state_id, reservation_state_name, start_at, end_at, total_price, canceled_at | null, cancel_actor | null, created_at}], pagination}` — 결제 대기 만료 제외, 이용 시작 최신순
- 실패: 400 검증 · 401 · 404 이용자 아님 · 500

### 4. 이용자 이용 제한 · 해제 (큐 — `admin.user.state`, SSE)
- Method: PATCH
- Path: `/api/v1/admin-service/user/:user_id/state`
- Request body: `{state_id: 'ACTIVE' | 'BLOCK', block_comment?: string(≤255 — 제한 사유, 선택)}`
- Response done: data 없음(void)
- 실패: 400 검증 · 같은 상태 · 탈퇴 대기 · 탈퇴 회원 · 401 · 404 이용자 아님 · 500

### 5. 업체 관리자 목록 (동기)
- Method: GET
- Path: `/api/v1/admin-service/manager/account` → 내부 `/internal/v1/admin-service/manager/account`
- Request query: `page` · `size`, `keyword`(선택, 100자 — 상호명 · 업체코드 · 아이디 · 이름 · 휴대폰 번호 부분 일치), `store_id`(선택, 32자 hex), `auth_id`(선택 — HEAD_MANAGER · MANAGER), `state_id`(선택 — ACTIVE · BLOCK)
- Response 200: `{list: [{user_id, store_id, store_name, store_code, store_state_id, login_id, name, phone | null, auth_id, state_id, is_password_change_required, created_at}], pagination}` — 매니저 그룹 · 상태 ACTIVE · BLOCK(삭제한 계정 LEAVE 는 빠진다), 등록 최신순
- 실패: 400 검증 · 401 · 500

### 6. 업체 관리자 상세 (동기)
- Method: GET
- Path: `/api/v1/admin-service/manager/account/:user_id`
- Response 200: 목록 항목 + `{gender, birth, block_comment | null}`
- 실패: 400 검증 · 401 · 404 업체 관리자 아님 · 500

### 7. 업체 관리자 비밀번호 초기화 (큐 — `admin.manager.account-password-reset`, SSE)
- Method: PATCH
- Path: `/api/v1/admin-service/manager/account/:user_id/password-reset`
- Request: path `user_id`(본문 없음)
- Response done: data 없음(void)
- 하는 일: 임시 비밀번호(영문 + 숫자 10자리) bcrypt + `is_password_change_required = 1` → 그 휴대폰으로 SMS(마지막) — 업체 총관리자의 업체 관리자 비밀번호 초기화(manager.service.ts:583)와 같은 순서
- 실패: 400 검증 · 휴대폰 번호 없음 · 탈퇴 업체 계정 · 401 · 404 업체 관리자 아님 · 503 SMS · 500

### 8. 이용자 쪽 변경 (user-service)
- 로그인 `POST /api/v1/user-service/user/login`: 이용 제한(BLOCK)이어도 토큰을 준다(지금은 403). 결과에 `state_id` · `block_comment`(제한 사유, 없으면 null) 추가 — 앱이 '이용 제한 중' 을 띄운다.
- 토큰 재발급 `POST /api/v1/user-service/user/token-refresh`: ACTIVE · BLOCK 이면 재발급(지금은 ACTIVE 만).
- 인증 확인(게이트웨이 jwt-user 전략의 auth-user): ACTIVE · BLOCK · LEAVE_WAIT 를 받는다(지금은 `is_login_allowed = 1` — ACTIVE · LEAVE_WAIT).
- 예약 `user.reservation.create` · 연장 신청 `user.reservation.extend` · 연장 조회: 정상(ACTIVE) 이용자만. BLOCK → 400 `이용이 제한된 계정입니다.`, LEAVE_WAIT → 400 `탈퇴 신청 중에는 예약할 수 없습니다.`(연장 조회는 같은 문구를 `reason` 으로).
- 그대로: 결제 확인(제한 전에 만든 결제 대기 예약 포함) · 취소 · 내 예약 · QR · 이용 중 취소 요청 응답 · 휴대폰 인증 · 탈퇴 신청.

## Business Rules

- **도메인 위치** — 서버 안 도메인은 기능 대상별(사용자 결정 2026-11-09 · `.beaver/memory/architecture.md`): 이용자 대상 → admin-service `user`(새 — user-service `user` 와 같은 이름 따로), 매니저 계정 대상 → admin-service `manager`, 관리자 계정 대상 → `admin`. 규격 상수는 `libs/contracts/src/user/user.commands.ts` 의 `USER_ADMIN_COMMAND` · `USER_ADMIN_INTERNAL_PATH`(admin-service), manager 는 기존 `MANAGER_COMMAND` · `MANAGER_INTERNAL_PATH` 에 더한다. 게이트웨이 루트 모듈은 `UserModule as AdminUserModule`.
- **이용 제한 = BLOCK 그대로, 그룹마다 뜻이 다르다**(사용자 결정 2026-11-09 — "t_state 에 새로운 상태 추가는 불필요") — 이용자 그룹은 BLOCK 이어도 로그인 · 재발급 · 기존 예약 이용, 새 예약 · 연장만 불가. 매니저 · 관리자 그룹은 BLOCK 이면 로그인 불가(지금 그대로 — 그룹마다 로그인 API 가 따로라 user-service 만 바꾼다). `t_state.is_login_allowed` 는 매니저 · 관리자 그룹 판정에만 쓰고, 이용자 그룹은 user-service 상수 상태 목록으로 판정한다.
- **이용자 상태 판정**(user-service · admin-service user) — 로그인 · 재발급: ACTIVE · BLOCK, 인증 확인: ACTIVE · BLOCK · LEAVE_WAIT, 예약 · 연장: ACTIVE 만. 탈퇴 대기(LEAVE_WAIT)까지 예약을 막아 정지 회원이 탈퇴 신청으로 제한을 피하지 못하게 한다(탈퇴 신청은 직전 상태 BLOCK 을 남기고 철회하면 BLOCK 으로 돌아온다 — user.service.ts:308 · 331).
- **이용 제한 · 해제**(관리자) — ACTIVE ↔ BLOCK 만(사용자 결정 2026-11-09). 같은 상태 400 `이미 같은 상태입니다.`, 탈퇴 대기 · 탈퇴 회원 400 `탈퇴 대기 · 탈퇴 회원은 상태를 바꿀 수 없습니다.`. 사유는 제한할 때만 남기고 해제하면 지운다(업체 관리자 정지 manager.service.ts:621 과 같다). 제한해도 남은 예약은 그대로(사용자 결정 2026-11-09 — 정지 전에 결제 완료한 예약은 정상 이용).
- **이용자 목록 · 상세 · 예약 이력** — 이용자 그룹(`login_scope = USER`)만, 다른 그룹 회원 ID 는 404. 목록은 모든 상태(탈퇴는 마스킹된 값 그대로). 예약 이력 · 요약은 결제 대기 만료(EXPIRED)를 뺀다(내 예약 목록과 같다 — reservation.service.ts:609).
- **업체 관리자 관리 범위**(사용자 결정 2026-11-09) — 대상은 업체 총관리자 + 업체 관리자, 기능은 목록 · 상세 · 비밀번호 초기화. 계정 정지 · 정보 수정 · 삭제는 두지 않는다 — 정지는 업체 단위(기존 `PATCH /api/v1/admin-service/store/:store_id/state` 영업중지 · 탈퇴), 수정 · 삭제는 업체 총관리자의 업체 관리자 관리.
- **업체 관리자 목록 · 상세** — 매니저 그룹 · ACTIVE · BLOCK(삭제 LEAVE 제외), 지워지지 않은 업체 조인(상호명 · 업체코드 · 업체 상태 — 탈퇴 업체 계정도 BLOCK 으로 보인다, store.service.ts:397).
- **비밀번호 초기화**(관리자) — 휴대폰 번호 없으면 400 `휴대폰 번호가 등록되지 않은 계정입니다.`, 탈퇴 업체(store LEAVE) 계정은 400 `탈퇴한 업체의 계정입니다.`. 정지(BLOCK) 계정도 초기화할 수 있다(로그인은 여전히 막힘). SMS 문구는 기존 `temporaryPasswordText`.
- **경로** — 조회는 내부 HTTP(동기), 쓰기는 RabbitMQ + 요청 단위 SSE. path param `user_id` 는 32자 hex 검증.

## TDD Cases

- [CASES:member-state] 로그인 ACTIVE → 토큰 발급, 결과 `state_id: 'ACTIVE'` · `block_comment: null`
- [CASES:member-state] 로그인 BLOCK(사유 '부정 이용') → 토큰 발급(403 아님), 결과 `state_id: 'BLOCK'` · `block_comment: '부정 이용'`
- [CASES:member-state] 로그인 LEAVE_WAIT · LEAVE → 404(조회 조건 `state_id IN (ACTIVE, BLOCK)` — 지금 그대로)
- [CASES:member-state] 재발급 ACTIVE · BLOCK → 새 토큰
- [CASES:member-state] 재발급 LEAVE_WAIT · LEAVE → 401 + refresh 만료 1분 단축
- [CASES:member-state] 인증 확인 조건 = `state_id IN (ACTIVE, BLOCK, LEAVE_WAIT)`(Smoke — BLOCK 포함 · LEAVE 제외, `is_login_allowed` 조건 없음)
- [CASES:member-state] 예약 ACTIVE → 진행 / BLOCK → 400 `이용이 제한된 계정입니다.` · 쓰기 없음 / LEAVE_WAIT → 400 `탈퇴 신청 중에는 예약할 수 없습니다.` · 쓰기 없음
- [CASES:member-state] 연장 신청 BLOCK → 400 `이용이 제한된 계정입니다.` · 쓰기 없음, 연장 조회 BLOCK → `is_extendable: 0` · `reason: '이용이 제한된 계정입니다.'`
- [CASES:member-state] 관리자 이용 제한 ACTIVE → BLOCK(사유 저장) / 해제 BLOCK → ACTIVE(사유 null)
- [CASES:member-state] 관리자 같은 상태 → 400 `이미 같은 상태입니다.` / LEAVE_WAIT · LEAVE → 400 `탈퇴 대기 · 탈퇴 회원은 상태를 바꿀 수 없습니다.` · 쓰기 없음
- [CASES:reservation-summary] 행 없음 → `{total: 0, in_progress: 0, completed: 0, canceled: 0}`
- [CASES:reservation-summary] EXPIRED 3건만 → 모두 0
- [CASES:reservation-summary] PENDING 1 · CONFIRMED 2 · CHECKED_IN 1 → `{total: 4, in_progress: 4, completed: 0, canceled: 0}`
- [CASES:reservation-summary] COMPLETED 5 · CANCELED 2 · EXPIRED 4 · CONFIRMED 1 → `{total: 8, in_progress: 1, completed: 5, canceled: 2}`
- [CASES:reservation-summary] 건수가 문자열('3' — PostgreSQL count) → 숫자 3 으로
- [FAIL:validation] 이용자 목록 `state_id` 허용값 밖 · `sns_id` 허용값 밖 · `keyword` 100자 초과 → 각 필드 오류
- [FAIL:validation] 이용 제한 `state_id` 허용값 밖(LEAVE) · `block_comment` 255자 초과 · `user_id` 32자 hex 아님 → 각 필드 오류
- [FAIL:validation] 업체 관리자 목록 `auth_id` 허용값 밖 · `state_id` 허용값 밖 · `store_id` 32자 hex 아님 → 각 필드 오류
- 테스트 생략(위임형): 업체 관리자 상세 · 이용자 상세의 회원 정보 매핑 — 조회 결과를 그대로 옮긴다(404 · 응답 모양은 service spec 이 함께 본다)

## Notes

- 스키마 변경 없음 — `t_state` 의 BLOCK · `t_user.block_comment` 를 그대로 쓴다. 마이그레이션 없음.
- 기존 동작 참고: 탈퇴 대기(LEAVE_WAIT) 이용자는 지금도 로그인이 404 · 재발급이 401 이다(인증 확인만 통과 — 남은 access 토큰 20분). 이번 변경에서 바꾸지 않는다.
- 업체 관리자 관리 쿼리는 업체 조인 · 상호명 · 업체코드 검색이라 QueryBuilder(매핑 민감 — Smoke). 이용자 목록은 기존 업체 관리자 목록(`buildStaffListWhere` — manager.util.ts:37)처럼 WHERE 배열(OR) + `ILike(toContainsPattern())`.
- 비밀번호 초기화는 업체 총관리자의 `resetStaffPassword`(manager.service.ts:583)와 같은 단계(임시 비밀번호 → bcrypt → 변경 필요 → SMS 마지막)를 관리자 대상 조건으로 다시 둔다(service private 헬퍼 금지 — 공통 순수 로직은 이미 `libs/account` `generateTemporaryPassword` · `temporaryPasswordText`).

## Proposals (Codebase-Based)

- [x] 이용자 쪽 이용 제한 표시 — 로그인 결과에 `state_id` · `block_comment`(사용자 결정 2026-11-09)
- [x] 업체 관리자 계정 정지 대신 업체 단위 정지 — 기존 업체 상태 변경(store.service.ts:378) 재사용(사용자 결정 2026-11-09)

## Decisions

- [x] 도메인 위치 — 기능 대상별: 이용자 관리 admin-service `user`(새), 업체 관리자 관리 `manager`(사용자 결정 2026-11-09)
- [x] 이용 제한의 뜻 — 이용자 BLOCK 은 로그인 · 재발급 · 기존 예약 이용 가능, 새 예약 · 연장 불가. 매니저 · 관리자 BLOCK 은 로그인 불가 그대로. `t_state` 에 상태를 더하지 않는다(사용자 결정 2026-11-09)
- [x] 정지 전 예약 — 그대로 이용(사용자 결정 2026-11-09)
- [x] 이용자 관리 범위 — 목록 · 상세(예약 건수 요약) · 예약 이력 · 이용 제한 · 해제(사용자 결정 2026-11-09)
- [x] 이용 제한 전환 — ACTIVE ↔ BLOCK 만(사용자 결정 2026-11-09)
- [x] 업체 관리자 관리 범위 — 업체 총관리자 · 업체 관리자의 목록 · 상세 · 비밀번호 초기화, 계정 정지 없음(업체 단위 정지는 기존 기능)(사용자 결정 2026-11-09)
- [x] TDD — 회원 상태 판정 · 예약 건수 요약(사용자 결정 2026-11-09)
