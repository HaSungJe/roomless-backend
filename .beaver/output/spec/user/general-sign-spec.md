---
# One-line feature summary
feature_goal: "일반 회원가입 + 일반 로그인 — 아이디(login_id)/비밀번호 기반, SNS 가입과 병존"

# Domain/module name
domain: "user"

# Entry-point method/endpoint
api_method: "POST"

# Path/signature
api_path: "/api/v1/user/general-sign · /api/v1/user/general-login (신규 2개)"

# Affected state — write/persist targets
affected_data:
  - "t_user (insert — sns_id/sns_user_id=null, login_id=사용자 입력, login_pw=bcrypt)"
  - "t_user_setting (insert)"
  - "t_session (insert)"
  - "t_session_refresh (insert)"
  - "t_user.device_os/device_token (일반 로그인 시 동기화 update — 기존 SNS 로그인과 동일 규칙)"
---

## Feature Description

SNS 가입/로그인만 있는 현재 구조에 **아이디+비밀번호 기반 일반 회원가입·로그인**을 추가한다. 스키마 변경 없음 — `t_user.sns_id`/`sns_user_id` 는 이미 nullable([user.entity.ts:26-31](../../../src/api/v1/user/entities/user.entity.ts))이라 일반 회원은 이 두 컬럼을 null 로 둔다. `login_id`(30자)·`login_pw` 컬럼과 UK(`UK_User_LoginId`)·repository 중복 매핑("이미 존재하는 로그인 ID입니다.", [user.repository.ts:31-33](../../../src/api/v1/user/repositories/user.repository.ts))도 그대로 활용한다.

## API Spec

- Method: POST × 2 (공개 — guard 없음, SNS sign/login 과 동일)
- Path: `/api/v1/user/general-sign`, `/api/v1/user/general-login` (다단어 kebab 규약)
- Request:
  - general-sign: `login_id`, `login_pw`, `gender`, `birth`, `nickname` (필수) + `device_os`, `device_token` (선택)
  - general-login: `login_id`, `login_pw` (필수) + `device_os`/`device_token` (선택 — 한 세트 규칙, SNS login 과 동일 `@ValidateIf`)
- Response: 둘 다 토큰 4종(`access_token`/`refresh_token`/만료 2종) — 기존 Result 형태와 동일 모양이지만 **독립 재선언**(`UserGeneralSignResultDto`/`UserGeneralLoginResultDto`, DTO 독립 명명 규약)

## Business Rules

- **아이디**: 4~30자, 영문/숫자/밑줄(`_`)만 (`@Matches`). DB 컬럼 30자와 일치. 유니크 위반은 repository UK 분기 400 (사전 조회 없음 — SNS sign 의 sibling 계약과 동일하게 UK 에 위임).
- **비밀번호**: 8~20자, **영문+숫자 각 1자 이상 필수**, 특수문자는 `!@#$%^&*` 만 허용 (`@Matches`). 저장은 `getBcrypt` 해시.
- **만 18세 이하 가입 제한** — SNS sign 과 동일(`isAdult`, validationErrors 'birth' 귀속).
- 일반 가입 회원: `auth_id='USER'`, `state_id='ACTIVE'`, `sns_id=null`, `sns_user_id=null`, `name=nickname`, `phone=null` — SNS sign 흐름과 동일 골격.
- **일반 로그인 판정 순서**: ① `findUser({login_id, state_id IN(ACTIVE,BLOCK)})` 미존재 → 404 "잘못된 로그인 정보입니다." ② `matchBcrypt` 비밀번호 불일치 → **동일 404 메시지**(아이디/비밀번호 구분 비노출) ③ BLOCK → 403 "이용이 제한된 계정입니다." + `block_comment` — **비밀번호 검증 후에 BLOCK 판정**(비밀번호 없이 정지 여부 탐지 방지). ④ ACTIVE → device 동기화(둘 다 입력 시만 update)·세션·refresh 발급 — SNS login([user.service.ts:119-179](../../../src/api/v1/user/user.service.ts))과 동일.
- LEAVE_WAIT/LEAVE 는 조회 조건에서 제외되어 404 — SNS login 과 동일.

## Notes

- 재사용: `isAdult`·`issueAccessAndRefresh`(user.util), `getBcrypt`·`matchBcrypt`([bcrypt.ts:9,19](../../../src/common/utils/bcrypt.ts)), `sha256Hex`·`encryptAesGcm`, repository 범용 메서드 전부(insertUser/insertUserSetting/insertSession/insertSessionRefresh/findUser/updateUser) — **repository·entity 변경 없음**.
- sibling 계약: generalSign ↔ sign(에러 처리·엔티티 생성·트랜잭션 경계 동일), generalLogin ↔ login(404/403 분기·device 동기화·세션 발급 동일). 비밀번호 불일치 404 는 미존재와 동일 메시지 — 신규 분기지만 미존재 분기의 계약을 그대로 따름.
- UK_User_SnsSnsUserId 는 sns_id null 복수 행 허용(MySQL UK null 규칙) — 일반 회원 다수 가입에 문제 없음.
- data-access 메서드 신규/변경 없음 → `[SMOKE:data-access]` 해당 없음 (기존 findUser 재사용, where 구성은 service).

## Decisions

- [x] **식별자 = 아이디(login_id 그대로), 이메일 전환 없음** (selected: user, 2026-07-20)
- [x] **범위 = 가입 + 일반 로그인 모두** (selected: user)
- [x] **비밀번호 정책 = 8~20자, 영문+숫자 필수, 특수문자 `!@#$%^&*` 만 허용** (selected: user — "자주 쓰는 !@# 이런것들만")
- [x] **아이디 형식 = 4~30자 영문/숫자/`_`** (default: 컬럼 길이 30 정합 + 통상 규칙 — 리뷰에서 변경 가능)
- [x] **라우트 = `/general-sign`·`/general-login`** (default: 기존 flat kebab 핸들러 규약 — 리뷰에서 변경 가능)
- [x] **비밀번호 불일치 = 404 동일 메시지** (default: 계정 존재 여부 비노출 보안 관행 + 기존 invalid_login 계약 재사용)
