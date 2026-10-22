---
# One-line feature summary
feature_goal: "계정·인증 — 로그인 그룹 3개(이용자 · 매니저 · 관리자) 분리, 그룹별 아이디 · 번호 UK, 매니저 아이디 찾기 · 비밀번호 초기화(이용자 미러), 성인 기준(청소년보호법) · 일반 가입 폐지, 업체 상세 JSON"

# Domain/module name
domain: "user"

# Entry-point method/endpoint
api_method: "POST · PATCH (게이트웨이 동기 · 큐) — 이용자 /api/v1/user/*, 관리자 /api/v1/admin/*, 매니저 /api/v1/manager/*"

# Path/signature
api_path: "/api/v1/user/login · /api/v1/admin/login · /api/v1/manager/login · /token-refresh(그룹별) · /password(관리자 · 매니저) · /api/v1/manager/find-login-id · /password-reset"

# Affected state
affected_data: ["t_user.login_scope (new) · UK_User_LoginIdLoginScope · UK_User_PhoneLoginScope (UK_User_LoginId · UK_User_Phone 대체)", "t_store.store_detail (new, jsonb)", "t_session · t_session_refresh (로그인 · 재발급)", "t_sms_verification (매니저 아이디 찾기 · 비밀번호 초기화)"]
---

## Feature Description

로드맵 Phase 6(#24 · #25)에 리뷰 중 정한 #92 · #93 을 더한다.

1. **로그인 그룹 3개 (#24)** — 회원을 로그인 그룹으로 나누고, 그룹마다 따로 API 를 둔다. 같은 그룹 안에서는 로그인 기능을 공유한다.
   | 그룹 `login_scope` | 권한(`t_auth`) | 경로 접두 | 로그인 |
   |---|---|---|---|
   | `USER` | 이용자 `USER` | `/api/v1/user` | SNS 만(`/login`) |
   | `MANAGER` | 총매니저 `HEAD_MANAGER` · 매니저 `MANAGER` | `/api/v1/manager` | 아이디 · 비밀번호(`/login`) |
   | `ADMIN` | 총관리자 `SUPER_ADMIN` · 관리자 `ADMIN` | `/api/v1/admin` | 아이디 · 비밀번호(`/login`) |
   - **로그인 · 토큰 재발급은 그룹별 API** — 다른 그룹 계정이면 없는 계정처럼 404(로그인) · 401(재발급)이다.
   - **이용자 페이지의 로그인 필요 API는 USER 전용** — 탈퇴 · 탈퇴 철회 · 휴대폰 인증(발송 · 확인)에 `RolesGuard` + `@Roles('USER')`. 정의만 있던 RolesGuard 를 처음 쓴다.
   - **비밀번호 변경** — 관리자(`/api/v1/admin/password`) · 매니저(`/api/v1/manager/password`)만. 같은 명령(`user.member.password`)을 쓰고, 그룹은 게이트웨이 `@Roles` 로 가른다.
   - **매니저 아이디 찾기 · 비밀번호 초기화(이용자 미러)** — 등록된 휴대폰 번호로. 총관리자 · 관리자는 찾기 · 초기화가 없다.
2. **그룹별 UK (#92)**
   - `t_user.login_scope` 컬럼을 두고 `UK(login_id, login_scope)` · `UK(phone, login_scope)` 를 건다(기존 `UK_User_LoginId` · `UK_User_Phone` 대체).
   - 관리자끼리 · 매니저끼리 · 이용자끼리는 아이디 · 번호가 겹치지 않고, 그룹이 다르면 같아도 된다.
3. **가입 규칙 (#25)**
   - **성인 기준은 청소년보호법**이다 — 만 19세가 되는 해의 1월 1일부터 성인(한국 날짜의 올해 − 출생 연도 ≥ 19). 생일은 보지 않는다.
   - **일반 가입 폐지** — 이용자는 SNS(네이버 · 카카오)로만 가입한다. 그래서 이용자의 일반 가입 · 일반 로그인 · 비밀번호 변경 · 비밀번호 초기화 API 를 없앤다.
4. **업체 상세 JSON (#93)** — 기존 `t_store` 에 `store_detail`(jsonb)를 더한다.
   - 항목은 언제든 바뀔 수 있다. 초기 항목은 `room_count`(방 칸수) · `has_shower` · `has_tv` · `has_pc`(0/1)다.
   - 매니저 FK(`t_user.store_id → t_store`)는 이미 있다. 이번 Phase 에는 쓰는 API 가 없다(입점 · 업체 관리 Phase 9).

## API Spec

- Method: POST (동기)
- Path
  - `/api/v1/user/login`(SNS, 변경 없음) · `/api/v1/user/token-refresh`(이용자만)
  - `/api/v1/admin/login` · `/api/v1/admin/token-refresh`
  - `/api/v1/manager/login` · `/api/v1/manager/token-refresh`
- Request
  - 관리자 · 매니저 로그인 `UserGeneralLoginDto {login_id, login_pw, device_os?, device_token?}`
  - 재발급 `{refresh_token}`
- Response
  - 관리자 · 매니저 로그인 `UserGeneralLoginResultDto` = 토큰 4종 · `is_password_change_required` · `is_phone_verified` + **`auth_id` · `store_id`(new — 관리자 페이지 메뉴 · 매니저의 업체)**
  - 재발급은 변경 없음

- Method: PATCH (큐, SSE)
- Path: `/api/v1/admin/password`(@Roles SUPER_ADMIN · ADMIN) · `/api/v1/manager/password`(@Roles HEAD_MANAGER · MANAGER)
- Request: `UserPasswordDto`(변경 없음)
- Response: done null

- Method: POST (큐, SSE)
- Path: `/api/v1/manager/find-login-id` · `/find-login-id/confirm` · `/password-reset` · `/password-reset/confirm`
- Request: 이용자 쪽과 같은 DTO(`UserFindLoginId*` · `UserPasswordReset*`)
- Response: 이용자 쪽과 같다. 아이디 찾기 결과는 `{login_id, sns_id: null, created_at}`

- **없어지는 API**: `/api/v1/user/general-sign` · `/general-login` · `/password` · `/password-reset` · `/password-reset/confirm`
  - 명령 `user.member.general-sign`
  - 비밀번호 초기화 명령은 `user.member.password-reset(-confirm)` → `user.manager.password-reset(-confirm)` 로 바뀐다
  - 내부 경로 `/internal/v1/user/general-login`

## Business Rules

- **그룹 판정은 `t_user.login_scope`** — 가입 · 시드 · (Phase 9 · 10) 계정 생성 때 권한에 맞춰 넣는다.
  - USER → `USER`
  - HEAD_MANAGER · MANAGER → `MANAGER`
  - SUPER_ADMIN · ADMIN → `ADMIN`
- **로그인**
  - 이용자 SNS 로그인은 `login_scope = USER` 로 찾는다.
  - 관리자 · 매니저 로그인은 `login_id` + 그 그룹의 `login_scope` 로 찾는다. 없으면(다른 그룹 포함) 404 `'잘못된 로그인 정보입니다.'`.
  - 비밀번호 · 정지 처리는 지금 일반 로그인과 같다.
- **토큰 재발급** — 회원의 `login_scope` 가 그 API 의 그룹과 다르면 401(상태 이상과 같은 처리 — refresh 만료 단축).
- **휴대폰 인증(이용자)** — 다른 계정 번호 확인을 같은 그룹 안에서 한다(`UK_User_PhoneLoginScope`).
- **아이디 찾기**
  - 이용자: `login_scope = USER`(결과는 SNS 종류).
  - 매니저: `login_scope = MANAGER`(결과는 아이디).
  - 확인 때도 그 기록의 회원이 그 그룹인지 본다.
- **비밀번호 초기화** — 매니저 그룹만. 아이디 + 번호 + `login_scope = MANAGER`. 이용자는 비밀번호가 없다.
- **service 규칙의 예외** — 같은 기능을 로그인 그룹만 달리해 여러 API 로 열 때는, service 메서드 하나가 `login_scope` 를 인자로 받는다. API 마다 controller 메서드를 따로 둔다(`generalLogin` · `tokenRefresh` · `sendFindLoginId` · `confirmFindLoginId`).
- **성인** — `isAdult(birth, now)`: 한국 날짜의 올해 − 출생 연도 ≥ 19. 미성년자는 400 `UNDERAGE_MESSAGE` 다(`validation_errors.birth`, 변경 없음).

## Notes

- 매니저 계정 · 휴대폰 번호는 계정을 만드는 Phase 9(입점 승인 — 총매니저, 휴대폰 필수) · Phase 10(매니저)에서 등록된다. 이번 Phase 의 매니저 찾기 · 초기화는 그 계정이 생기면 바로 동작한다.
- 관리자 그룹(총관리자 · 관리자)은 휴대폰 인증 · 찾기 · 초기화가 없다. 첫 총관리자 `admin` / `1234` 는 `/api/v1/admin/login` → `/api/v1/admin/password` 로 바꾼다(변경 필요 표시가 0 이 된다 — 기존 동작).
- **기존 데이터** — 마이그레이션은 `login_scope` 를 권한으로 채운 뒤 NOT NULL 로 둔다. 개발 DB 에 남은 일반 가입 이용자 계정은 로그인할 API 가 없어진다(서비스 오픈 전).
- 로드맵 Phase 8 #34(`t_store` 재설계)의 "편의시설" 은 이번 `store_detail` 로 먼저 자리를 잡는다.
- 관리자 · 매니저 그룹의 이후 기능 라우트는 `/api/v1/admin/<domain>` · `/api/v1/manager/<domain>`(게이트웨이 폴더 `api/v1/admin/<domain>/` · `api/v1/manager/<domain>/`)로 둔다.

## Proposals (Codebase-Based)

- [x] 권한 · 로그인 그룹 상수를 `libs/contracts/src/user/user.roles.ts` 에 둔다(`AUTH_ID` · `LOGIN_SCOPE`). 게이트웨이 `@Roles(...)` 와 user-service 가 같은 값을 쓴다. 지금은 문자열 리터럴이 흩어져 있다(user.service.ts `'USER'` · seeder `'SUPER_ADMIN'`).
- [x] 관리자 · 매니저 로그인 결과에 `auth_id` · `store_id` 를 넣는다. 관리자 페이지가 메뉴(총관리자 / 관리자, 총매니저 / 매니저)와 매니저의 업체를 알아야 한다. 지금은 토큰에 `user_id` · `session_id` 만 있다(user.util.ts `issueAccessAndRefresh`).

## Decisions

- [x] 라우트 — 그룹별 접두 `/api/v1/user` · `/api/v1/admin` · `/api/v1/manager`. 로그인 API 3개(이용자 SNS · 관리자 · 매니저). (사용자 결정 2026-10-22)
- [x] UK — `login_scope`(USER · MANAGER · ADMIN) 단위로 아이디 · 번호. (사용자 결정 2026-10-22)
- [x] 이용자 로그인 필요 API 는 USER 전용, 다른 그룹 로그인은 없는 계정처럼 404. (사용자 결정 2026-10-22)
- [x] 총관리자 · 관리자는 비밀번호 변경만, 총매니저 · 매니저는 비밀번호 변경 + 아이디 찾기 · 비밀번호 초기화(이용자 미러). (사용자 결정 2026-10-22)
- [x] 미러는 service 메서드 하나 + `login_scope` 인자. (사용자 결정 2026-10-22)
- [x] 업체 — 기존 `t_store` 에 `store_detail`(jsonb) 추가, 초기 항목 room_count · has_shower · has_tv · has_pc. (사용자 결정 2026-10-22)
- [x] 성인 — 청소년보호법 기준, TDD 케이스 6개. (사용자 결정 2026-10-22)
- [x] 일반 가입 폐지 + 이용자 일반 로그인 · 비밀번호 변경 · 초기화 제거. (사용자 결정 2026-10-22)
