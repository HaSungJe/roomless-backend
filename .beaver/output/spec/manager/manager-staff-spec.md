---
# One-line feature summary
feature_goal: "업체 인력(Phase 10) — 업체코드(store_code)로 매니저 계정을 업체 단위로 나누고(아이디 · 휴대폰 번호는 업체 안에서만 유일, 매니저 로그인 · 아이디 찾기 · 비밀번호 초기화에 업체코드), 입점 신청 때 업체 총관리자 아이디 · 비밀번호를 받으며, 업체 총관리자가 자기 업체의 업체 관리자 계정을 등록 · 목록 · 상세 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제한다"

# Domain/module name
domain: "manager"

# Entry-point method/endpoint
api_method: "게이트웨이 /api/v1/admin-service/manager/staff (동기 2 · 큐 5, 매니저 가드 + RolesGuard · @Roles(HEAD_MANAGER)) · 매니저 로그인 · 아이디 찾기 · 비밀번호 초기화 입력 변경 · /api/v1/admin-service/store 신청 · 승인 · 내 신청 · 업체 응답 변경"

# Path/signature
api_path: "/api/v1/admin-service/manager/staff(/:user_id)(/password-reset · /state) · /api/v1/admin-service/manager/{login,find-login-id,password-reset} · /api/v1/admin-service/store/application(…) · /api/v1/admin-service/store(/:store_id)"

# Affected state
affected_data: ["t_store (store_code 추가 — UUID 32자, UK_Store_StoreCode, 승인 때 생성 · 기존 행 채움)", "t_store_application (head_manager_login_id · head_manager_login_pw(bcrypt) 추가)", "t_user (UK_User_LoginIdLoginScope · UK_User_PhoneLoginScope 를 업체 없는 계정용 부분 유니크 인덱스로, 업체 소속 계정용 UK_User_LoginIdLoginScopeStoreId · UK_User_PhoneLoginScopeStoreId 추가)", "t_user (업체 관리자 등록 · 수정 · 비밀번호 초기화 · 정지 · 해제(BLOCK ↔ ACTIVE) · 삭제(LEAVE + 아이디 · 번호 마스킹))", "SMS (업체 관리자 등록 · 비밀번호 초기화 임시 비밀번호, 입점 승인 알림)"]
---

## Feature Description

로드맵 Phase 10(#42 — #43 은 사용자 결정으로 dropped). 세 덩어리를 한 번에 만든다 — 앞의 둘이 업체 관리자 계정의 토대다.

- **A. 매니저 계정을 업체 단위로 (업체코드)**
  - 업체에 **업체코드 `t_store.store_code`**(UUID 32자, PK 와 별개, UK)를 둔다. 승인 때 만든다. 프론트엔드는 주소에 업체코드를 받아 매니저 화면을 연다(사용자 결정 2026-10-26).
  - `t_user.store_id` 는 지금처럼 `t_store` PK 를 가리키는 nullable FK 다. **유일성에 `store_id` 를 더해** 업체가 다르면 같은 아이디 · 휴대폰 번호를 쓸 수 있게 하고, 업체가 없는 계정(이용자 · 총관리자 · 관리자)은 지금처럼 그룹 안에서 유일하다(사용자 결정 2026-10-26).
  - 매니저 로그인 · 아이디 찾기 · 비밀번호 초기화는 **업체코드를 함께 받는다** — 업체코드로 업체를 찾고, 그 업체 안에서 계정을 찾는다.
- **B. 입점 신청 · 승인 변경 (Phase 9 보정)**
  - 신청 때 **업체 총관리자 아이디 · 비밀번호를 함께 받는다**(비밀번호는 bcrypt 해시만 저장). 승인하면 그 아이디 · 비밀번호로 업체 총관리자 계정을 만든다 — 무작위 아이디 · 임시 비밀번호는 없어진다(사용자 결정 2026-10-26).
  - 승인 SMS 는 **승인 알림만** 보낸다(자격증명 · 코드 없음 — 사용자 결정 2026-10-26).
  - **승인된 신청도 신청자 목록 · 상세에 보이고, `store_code` 를 함께 돌려준다** — 업체 총관리자가 로그인에 쓸 업체코드를 여기서 안다(사용자 결정 2026-10-26, Phase 9 "승인되면 안 보임" 을 바꾼다).
- **C. 업체 관리자 계정 관리 (#42)** — 업체 총관리자(`HEAD_MANAGER`)가 자기 업체의 업체 관리자(`MANAGER`) 계정을 다룬다.
  - 등록(아이디는 업체 총관리자가 입력 — 업체 안에서 유일), 목록 · 상세, 수정, 비밀번호 초기화, **정지 · 해제**, 삭제(사용자 결정 2026-10-27 — 정지 · 해제를 더하고 나머지는 그대로).
  - 게이트웨이 `RolesGuard` + `@Roles(AUTH_ID.HEAD_MANAGER)` 의 첫 사용처다(지금까지 미적용 규약).

## API Spec

게이트웨이 `@Controller('/api/v1/admin-service/manager')` · `@Controller('/api/v1/admin-service/store')` — 동기는 `controllers/*.controller.ts`(InternalHttpClient), 큐는 `controllers/*.controller.queue.ts`(CommandStreamService + 요청 단위 SSE).

### C. 업체 관리자 계정 (새 — 매니저 가드 + RolesGuard · `@Roles(HEAD_MANAGER)`)

| # | Method | Path | 경로 | 결과(done data · 응답) |
|---|---|---|---|---|
| 1 | POST | `/api/v1/admin-service/manager/staff` | 큐 `admin.manager.staff` | `{user_id}` |
| 2 | GET | `/api/v1/admin-service/manager/staff` | 동기 | `{list, pagination}` — 내 업체의 업체 총관리자 · 업체 관리자 |
| 3 | GET | `/api/v1/admin-service/manager/staff/:user_id` | 동기 | 업체 관리자 상세 |
| 4 | PATCH | `/api/v1/admin-service/manager/staff/:user_id` | 큐 `admin.manager.staff-update` | null |
| 5 | PATCH | `/api/v1/admin-service/manager/staff/:user_id/password-reset` | 큐 `admin.manager.staff-password-reset` | null |
| 6 | DELETE | `/api/v1/admin-service/manager/staff/:user_id` | 큐 `admin.manager.staff-delete` | null |
| 7 | PATCH | `/api/v1/admin-service/manager/staff/:user_id/state` | 큐 `admin.manager.staff-state` | null — 정지 · 해제 |

- 내부 경로는 `/internal/v1/admin-service/manager/staff…`(`MANAGER_INTERNAL_PATH.STAFF_LIST` · `staff(user_id)`).
- Request
  - #1: `login_id`(영문 · 숫자 · `_` 4~30자) · `name` · `phone`(휴대폰 숫자만) · `gender`(M · F) · `birth`(YYYY-MM-DD)
  - #2: `PaginationDto` + `keyword?`(아이디 · 이름 · 휴대폰 번호 부분 일치)
  - #4: `name` · `phone` · `gender` · `birth`(아이디는 바꾸지 않는다)
  - #7: `state_id`(ACTIVE: 해제 · BLOCK: 정지) · `block_comment?`(정지 사유, 255자)
  - #3 ~ #7 path: `user_id`(32자 hex)
- Response
  - #2 항목: `user_id` · `login_id` · `name` · `phone` · `auth_id` · `state_id` · `is_password_change_required` · `created_at`
  - #3: 위 + `gender` · `birth` · `updated_at`
- 403: 업체 관리자(`MANAGER`) 토큰 — `RolesGuard` `{message: '접근 권한이 없습니다.'}`

### A. 매니저 인증 입력 변경

| Method | Path | 변경 |
|---|---|---|
| POST | `/api/v1/admin-service/manager/login` | 본문에 `store_code`(32자 hex) 추가 |
| POST | `/api/v1/admin-service/manager/find-login-id` | 본문에 `store_code` 추가 |
| POST | `/api/v1/admin-service/manager/password-reset` | 본문에 `store_code` 추가 |

### B. 입점 신청 · 업체 응답 변경

| Method | Path | 변경 |
|---|---|---|
| POST | `/api/v1/admin-service/store/application` | 본문에 `head_manager_login_id`(영문 · 숫자 · `_` 4~30자) · `head_manager_login_pw`(8~20자, 영문 + 숫자 필수) 추가 |
| GET | `/api/v1/admin-service/store/application/mine` | 승인 신청도 나온다. 항목에 `store_code`(승인 전 null) |
| GET | `/api/v1/admin-service/store/application/mine/:id` | 승인 신청도 보인다. `head_manager_login_id` · `store_code` 추가 |
| GET | `/api/v1/admin-service/store/application/:id` | `head_manager_login_id` · `store_code` 추가 |
| PATCH | `/api/v1/admin-service/store/application/:id/approve` | done data `{store_id, store_code}`(아이디 대신 업체코드) |
| GET | `/api/v1/admin-service/store` · `/:store_id` | 항목 · 상세에 `store_code` 추가 |

## Business Rules

- **업체코드(A)**
  - `t_store.store_code` — `generateId()`(하이픈 없는 UUID v4 32자), `UK_Store_StoreCode`. 승인 때 만든다. 기존 `t_store` 행은 마이그레이션이 채운다(`replace(gen_random_uuid()::text, '-', '')`).
  - 업체코드는 바꾸지 않는다(바꾸는 API 없음).
- **계정 유일성(A)** — `t_user` 의 두 UK 를 부분 유니크 인덱스 4개로 바꾼다(TypeORM 1.1.2 는 `NULLS NOT DISTINCT` 가 없고, 휴대폰 미인증 이용자는 `phone` 이 NULL 이라 세 컬럼 UK 하나로는 이용자 유일성이 깨진다).

  | 인덱스 | 컬럼 | 조건 | 대상 |
  |---|---|---|---|
  | `UK_User_LoginIdLoginScope` | login_id · login_scope | `store_id IS NULL` | 이용자 · 총관리자 · 관리자(지금과 같음) |
  | `UK_User_PhoneLoginScope` | phone · login_scope | `store_id IS NULL` | 이용자 · 총관리자 · 관리자(지금과 같음) |
  | `UK_User_LoginIdLoginScopeStoreId` | login_id · login_scope · store_id | `store_id IS NOT NULL` | 매니저 그룹 — 업체 안에서 유일 |
  | `UK_User_PhoneLoginScopeStoreId` | phone · login_scope · store_id | `store_id IS NOT NULL` | 매니저 그룹 — 업체 안에서 유일 |

  - 업체 없는 계정용 인덱스는 기존 UK 이름을 그대로 쓴다 — user-service 의 제약명 분기(`UK_User_LoginIdLoginScope` · `UK_User_PhoneLoginScope`)는 바뀌지 않는다.
- **매니저 인증(A)** — 업체코드로 업체를 찾고(없으면 계정이 없는 것과 같은 404 — 업체 존재를 드러내지 않는다), 그 업체(`store_id`) 안에서 계정을 찾는다.
  - 로그인: 업체코드 + 아이디 + 매니저 그룹 + ACTIVE · BLOCK. 나머지(비밀번호 · BLOCK 403 · 세션 · 토큰)는 지금과 같다.
  - 아이디 찾기: 업체코드 + 휴대폰 번호. 비밀번호 초기화: 업체코드 + 아이디 + 휴대폰 번호. 확인 단계(인증 ID + 인증번호)는 바뀌지 않는다.
  - 영업중지 업체의 매니저도 로그인한다(Phase 9 결정 — 탈퇴 업체 매니저는 정지라 막힌다).
- **입점 신청(B)**
  - `head_manager_login_id` · `head_manager_login_pw` 필수. 비밀번호는 신청 때 bcrypt(`getBcrypt`)로 바꿔 `t_store_application.head_manager_login_pw` 에 저장하고, 평문은 어디에도 두지 않는다.
  - 아이디 중복은 확인하지 않는다 — 승인 때 새 업체가 생기므로 그 업체 안에서 겹칠 계정이 없다.
  - 응답(목록 · 상세)에 비밀번호 해시는 싣지 않는다.
- **승인(B)** — Phase 9 순서에서 바뀌는 것만.
  - 업체 등록 때 `store_code = generateId()`.
  - 업체 총관리자 계정: `login_id = head_manager_login_id`, `login_pw = head_manager_login_pw`(이미 해시), `is_password_change_required = 0`. 무작위 아이디 · 겹침 확인 · 임시 비밀번호를 없앤다.
  - SMS(대표자 번호, 마지막): `[roomless] <상호명> 입점이 승인되었습니다.` — 자격증명 · 업체코드 없음.
  - 결과 `{store_id, store_code}`.
- **내 신청(B)** — 대기 · 반려 · 승인 모두 보인다(남의 신청만 404). 항목 · 상세의 `store_code` 는 승인 신청이면 그 업체의 코드, 아니면 null.
  - 파일 업로드 주소 · 등록 · 삭제 · 신청 취소는 지금처럼 **대기 중일 때만**(반려 · 승인 400).
- **업체 관리자 계정(C)** — 모든 API 는 업체 총관리자만(게이트웨이 RolesGuard). service 는 actor 의 `user_id` 로 업체 총관리자를 다시 찾아 그 `store_id` 를 쓴다(업체를 입력으로 받지 않는다).
  - **대상**은 같은 업체 · 매니저 그룹 · `auth_id = MANAGER` · 삭제되지 않은(ACTIVE · BLOCK) 계정이다. 아니면(다른 업체 · 업체 총관리자 자신 · 삭제됨) 404 `업체 관리자를 찾을 수 없습니다.`.
  - **등록(#1)**: 같은 업체에 같은 아이디 · 휴대폰 번호가 있으면 400(`validation_errors.login_id` · `phone`). 경쟁 등록은 repository 가 `UK_User_LoginIdLoginScopeStoreId` · `UK_User_PhoneLoginScopeStoreId` → 400.
    - 계정: `auth_id = MANAGER` · `login_scope = MANAGER` · `store_id` · `state_id = ACTIVE` · `nickname = name` · 임시 비밀번호(bcrypt) · `is_password_change_required = 1`.
    - SMS(업체 관리자 번호, 마지막): 상호명 · 업체코드 · 아이디 · 임시 비밀번호.
  - **목록(#2)**: 내 업체의 매니저 그룹(업체 총관리자 포함) 중 ACTIVE · BLOCK. 정렬 `auth_id ASC`(업체 총관리자가 위) → `created_at DESC`. 검색어는 아이디 · 이름 · 휴대폰 번호 부분 일치(ILike 이스케이프, OR). count → `Pagination` → 목록.
  - **상세(#3)**: 대상 규칙 그대로(업체 총관리자 자신은 404 — 자기 정보는 이 API 대상이 아니다).
  - **수정(#4)**: 이름 · 휴대폰 번호 · 성별 · 생년월일(전체 교체). 같은 업체의 다른 계정과 번호가 겹치면 400(`validation_errors.phone`). 이름이 바뀌면 닉네임도 같이 바꾼다.
  - **비밀번호 초기화(#5)**: 임시 비밀번호(영문 + 숫자 10자리, `generateTemporaryPassword`) + `is_password_change_required = 1`, SMS(업체 관리자 번호, `temporaryPasswordText`, 마지막).
  - **정지 · 해제(#7)**: 업체 상태 변경(`changeStoreState`)과 같은 모양 — `state_id` 를 ACTIVE ↔ BLOCK 으로 바꾼다. 같은 상태면 400 `이미 같은 상태입니다.`.
    - 정지(BLOCK)는 로그인 불가 상태라 접근 토큰은 다음 요청부터 401, 재발급도 막힌다(ACTIVE 확인). 로그인은 403 + `block_comment`.
    - 정지 사유 `block_comment` 는 정지할 때만 남기고(없으면 null), 해제하면 지운다.
    - 아이디 · 번호는 그대로 둔다 — 정지한 계정의 아이디로는 새로 등록할 수 없다(삭제와 다르다).
    - 정지한 업체 관리자도 상세 · 수정 · 비밀번호 초기화 · 삭제 대상이다(대상 상태 ACTIVE · BLOCK).
  - **삭제(#6)**: `state_id = LEAVE` + `leave_backup`(원본 JSON) + **아이디 `DEL_<user_id>` · 휴대폰 번호 NULL 로 마스킹** — 같은 업체에서 같은 아이디 · 번호로 다시 등록할 수 있다. 기기 정보는 지운다. 접근 토큰은 다음 요청부터 401(LEAVE 는 로그인 불가 상태), 재발급도 막힌다(ACTIVE 확인).
- **응답 필드 생략 금지** — 없으면 null.

## Notes

- 형제 근거
  - 매니저 도메인 구성 · 인증 흐름: apps/admin-service/src/manager/manager.service.ts:79 `login` · :274 `sendFindLoginId` · :346 `sendPasswordReset`
  - 계정 만들기 · 임시 비밀번호 · SMS 마지막: apps/admin-service/src/store/store.service.ts `approveApplication`(업체 총관리자 계정) · manager.service.ts `confirmPasswordReset`(temporaryPasswordText)
  - 탈퇴 마스킹 · 백업: apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts(leave_backup JSON + PII 마스킹), 업체 탈퇴 사업자번호 마스킹(store.service.ts `changeStoreState`)
  - 목록 · 검색: store.service.ts `getStoreList` · store.util.ts `buildStoreListWhere` · `toContainsPattern`, Smoke `buildStoreListQuery`
  - 그룹 안 권한: apps/gateway/src/guards/roles/roles.guard.ts:18 — `request.user.auth_id` 로 판정, jwt-manager 전략의 `request.user` 는 `ManagerAuthUserResultDto`(auth_id 포함)
  - 다른 도메인 테이블: 매니저 repository 가 t_store 를 매니저 어휘(`findManagerStore`)로 읽는다(AGENTS.md 도메인 간 데이터 접근)
- Phase 9(store-application)를 함께 고친다 — 같은 배치(한 plan)로 만든다. 로드맵 Phase 10 에 업체코드 · 신청 자격증명 유닛을 더한다(ship 때 roadmap 갱신).
- 이번 Phase 는 마이그레이션을 더한다 — 다른 마이그레이션 Phase(12 · 14 · 16 · 22)와 동시에 돌리지 않는다.
- 캐시(Phase 23, .beaver/memory/cache.md): 업체 관리자 수정 · 비밀번호 초기화 · 삭제는 그 회원을 바꾸는 쓰기다 → `cache-spec.md` 무효화 지점 표에 더한다.

## Proposals (Codebase-Based)

- [x] 업체 관리자 API 는 매니저 도메인에 둔다 — `t_user` 매니저 그룹은 매니저 도메인 소유이고, 로드맵 #42 의 예상 경로(`/api/v1/admin-service/manager/staff`)와 같다
- [x] 업체 없는 계정용 부분 유니크 인덱스는 기존 UK 이름을 그대로 쓴다 — user-service 코드(user.repository.ts:65 · :246)를 건드리지 않는다
- [x] 부분 유니크 인덱스는 `@Index('UK_…', [...], {unique: true, where})` 로 둔다(이름은 UK_ 접두 — 유일성 규칙이므로). docs/data-layer.md 제약명 규칙에 "nullable 컬럼에 따라 갈리는 유일성은 부분 유니크 인덱스" 를 더한다
- [x] 입점 승인의 무작위 아이디 생성(`generateHeadManagerLoginId` · `HEAD_MANAGER_LOGIN_ID_ATTEMPTS` · `countManagers`)과 `insertHeadManager` 의 UK 분기 · `HEAD_MANAGER_PHONE_TAKEN_MESSAGE` 를 지운다 — 새 업체라 그 업체 안에서 겹칠 계정이 없다(§1.7 쓸모없어지는 코드)
- [x] `STORE_APPLICATION_VISIBLE_STATES` 를 지운다 — 내 신청이 모든 상태를 보인다

## Decisions

- [x] #43 매니저 업체 배정 — **뺀다**(dropped). 업체 관리자는 업체 총관리자가 자기 업체로 만들어 처음부터 소속이 정해진다 (사용자 결정 2026-10-26)
- [x] 업체코드 — **PK 와 별개의 `t_store.store_code`(UUID 32자)**, 승인 때 생성. 업체코드 = 업체ID(프론트 주소) (사용자 결정 2026-10-26)
- [x] 업체 총관리자 아이디 · 비밀번호 — **입점 신청 때 받는다**. 업체 관리자 아이디는 업체 총관리자가 입력한다 (사용자 결정 2026-10-26)
- [x] `t_user.store_id` — **지금처럼 nullable FK(t_store PK)**. 유일성에 store_id 를 더해 업체가 다르면 같은 아이디 사용 가능, 업체 없는 계정(이용자 · 총관리자 · 관리자)은 해당 없음 (사용자 결정 2026-10-26)
- [x] 매니저 그룹 휴대폰 번호 — **업체 안에서만 유일**, 매니저 아이디 찾기 · 비밀번호 초기화도 업체코드를 받는다 (사용자 결정 2026-10-26)
- [x] 승인 안내 — **승인된 신청도 내 신청 목록 · 상세에 보이고 store_code 를 돌려준다**. 승인 SMS 는 **승인 알림만** (사용자 결정 2026-10-26)
- [x] 업체 총관리자의 권한 — **지금 plan(등록 · 목록 · 상세 · 수정 · 비밀번호 초기화 · 삭제) 그대로 + 정지 · 해제 추가**. 정지 · 해제와 삭제를 둘 다 둔다 (사용자 결정 2026-10-27)
- [x] 정지 · 해제 입력 — `state_id`(ACTIVE · BLOCK) + 선택 `block_comment`(정지 사유), 같은 상태 400 — 업체 상태 변경과 같은 모양 (Claude 제안 — 검토)
- [x] 임시 비밀번호 전달 — 업체 관리자 휴대폰으로 SMS(응답에 싣지 않음) (사용자 선호 없음 → Claude 제안 — 검토)
- [x] 업체 관리자 등록 입력 — 아이디 · 이름 · 휴대폰 번호 · 성별 · 생년월일, 닉네임 = 이름 (Claude 제안 — 검토)
- [x] 업체 관리자 목록에 업체 총관리자도 함께(위에) 보이고, 상세 · 수정 · 초기화 · 삭제 대상은 업체 관리자(MANAGER)만 (Claude 제안 — 검토)
- [x] 업체 관리자 삭제 — LEAVE + 백업 + 아이디 `DEL_<user_id>` · 번호 NULL 마스킹(같은 아이디 · 번호 재등록 가능) (Claude 제안 — 검토)
- [x] 업체 관리자 등록 SMS 에 업체코드를 함께 싣는다 — 로그인에 필요하다 (Claude 제안 — 검토)
