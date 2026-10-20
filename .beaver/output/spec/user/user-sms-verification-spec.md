---
# One-line feature summary
feature_goal: "회원 스키마 확장 + SMS 인증 — 컬럼 이름 정리(선행), 가입 후 휴대폰 SMS 인증, 아이디 찾기 · 비밀번호 초기화(SMS), 인증 기록 DB 보관 · 하루 발송 한도, 첫 총관리자 시드"

# Domain/module name
domain: "user"

# Entry-point — 게이트웨이 큐 경로(RabbitMQ 명령 + 요청 단위 SSE) 6개
api_method: "POST (큐 경로 6개)"

# Path/signature
api_path: "/api/v1/user/phone-verification · /phone-verification/confirm · /find-login-id · /find-login-id/confirm · /password-reset · /password-reset/confirm"

# Affected state
affected_data:
  - "컬럼 이름 정리 — t_api_log · t_store · t_user · t_user_setting · t_session · t_session_refresh · t_state (RENAME, 데이터 유지)"
  - "t_sms_verification (신규) — SMS 인증 발송 · 확인 기록"
  - "t_sms_purpose (신규 룩업) — PHONE_VERIFY · FIND_LOGIN_ID · PASSWORD_RESET"
  - "t_user — phone_verified_at 추가, UK_User_Phone, 인증 완료 시 phone · phone_verified_at, 비밀번호 초기화 시 login_pw · is_password_change_required"
  - "t_user · t_user_setting — 첫 총관리자 시드 1행"
---

## Feature Description

로드맵 Phase 4(회원 스키마 확장 — #21 · #22 · #23)와, 그 스키마를 쓰는 Phase 5 의 #26 휴대폰 SMS 인증 · #27 아이디 찾기 · 비밀번호 초기화를 한 기획으로 만든다(사용자 결정 2026-10-20 — 스키마와 API 규칙이 맞물려 있다).

0. **컬럼 이름 정리 (선행)** (사용자 결정 2026-10-20) — 어색한 이름을 먼저 바꾸고, 엔티티 속성 · 코드 변수 · 파라미터 · DTO 필드를 같은 이름으로 맞춘다.
   - `create_at` · `update_at` → `created_at` · `updated_at` (모든 테이블)
   - refresh 만료 `end_at` → `expires_at`
   - `is_delete` → `is_deleted`
   - `is_login_able` → `is_login_allowed`
   - `before_refresh_hash` → `previous_refresh_hash`
   - `leave_prev_state_id` → `leave_previous_state_id`
   - `t_api_log.id` → `api_log_id`
   - `login_pw` 는 그대로 둔다(API 입력 필드).
   - 마이그레이션은 데이터가 남도록 RENAME 으로 손으로 쓴다.
1. **가입 후 휴대폰 SMS 인증** — SNS(네이버 · 카카오) · 일반 가입 모두, 가입 뒤에 따로 인증한다.
   - 흐름: 발송 → 인증번호 확인 → 완료되면 그 번호를 회원정보(`t_user.phone`)에 저장한다.
   - 발송 · 확인 정보는 `t_sms_verification` 에 남긴다.
2. **아이디 찾기** — 휴대폰 번호로 인증하면 아이디를 알려준다.
3. **비밀번호 초기화** — 아이디 + 휴대폰 번호로 인증하면, 영문 + 숫자 10자리 임시 비밀번호로 바꾸고 그 번호로 SMS 를 보낸다.
4. **하루 발송 한도** — 같은 번호로 하루(한국 날짜) 10번까지 보낸다. 10 은 env `SMS_VERIFICATION_DAILY_LIMIT` 이다.
5. **첫 총관리자 시드** — `admin` / `1234`. 첫 로그인 때 비밀번호 변경이 필요하다는 표시(`is_password_change_required = 1`)를 한다.
6. **SNS 가입 · 로그인은 네이버 · 카카오만** 받는다.

refreshToken 유효기간 1년은 이미 그렇다(`issueAccessAndRefresh` 의 `expiresIn: '365d'`, apps/user-service/src/user/user.util.ts:54). 바꿀 것이 없다.

## API Spec

모두 게이트웨이 큐 경로다(`user.controller.queue.ts` → RabbitMQ → `UserCommandHandler` → `UserService`). 상태를 바꾸는 쓰기라서 큐 경로를 쓴다(AGENTS.md "두 전달 경로"). 응답은 SSE `accepted` → `done | failed | pending`.

| Method | Path | 인증 | Request | done data | 명령 type |
|---|---|---|---|---|---|
| POST | `/api/v1/user/phone-verification` | 필요 | `{phone}` | `{sms_verification_id, expires_at}` | `user.member.phone-verification` |
| POST | `/api/v1/user/phone-verification/confirm` | 필요 | `{sms_verification_id, code}` | null | `user.member.phone-verification-confirm` |
| POST | `/api/v1/user/find-login-id` | — | `{phone}` | `{sms_verification_id, expires_at}` | `user.member.find-login-id` |
| POST | `/api/v1/user/find-login-id/confirm` | — | `{sms_verification_id, code}` | `{login_id, sns_id, created_at}` | `user.member.find-login-id-confirm` |
| POST | `/api/v1/user/password-reset` | — | `{login_id, phone}` | `{sms_verification_id, expires_at}` | `user.member.password-reset` |
| POST | `/api/v1/user/password-reset/confirm` | — | `{sms_verification_id, code}` | null | `user.member.password-reset-confirm` |

- Method: POST (큐 경로)
- Path: 위 표
- Request
  - `phone` — 숫자만 `^01[016789]\d{7,8}$`
  - `sms_verification_id` — 발송 결과로 받은 인증 ID, `^[a-f0-9]{32}$`
  - `code` — `^\d{6}$`
  - `login_id` — 최대 30자
- Response
  - 발송 3개는 `sms_verification_id`(인증 ID)와 `expires_at`(ISO 8601, 발송 + 5분)을 돌려준다. 확인은 이 인증 ID + 인증번호로 한다 (사용자 결정 2026-10-20).
  - 아이디 찾기 확인은 `login_id`(SNS 계정이면 null) · `sns_id`(일반 계정이면 null) · `created_at`(가입일시, ISO 8601)를 돌려준다.
  - 나머지는 null 이다.
- 기존 응답 변경: SNS · 일반 가입 결과와 SNS · 일반 로그인 결과, 게이트웨이 인증 회원(`auth-user`)에 `is_phone_verified`(0 | 1)를 더한다.

## Business Rules

**인증번호** (사용자 결정 2026-10-20)
- 숫자 6자리, 발송 후 5분 동안 유효하다.
- 확인은 한 번호당 3번까지다. 3번을 넘기면 그 번호는 쓸 수 없고 다시 요청해야 한다.
- 확인은 발송 결과로 내려준 **인증 ID + 인증번호**로 한다 (사용자 결정 2026-10-20).
  - 인증 ID 의 기록이 그 용도가 아니거나, 휴대폰 인증에서 본인 기록이 아니면 찾을 수 없음(404)이다.
  - 다시 요청하면 새 인증 ID 가 나간다. 기록마다 만료 · 시도 횟수를 따로 센다.
  - 번호 · 회원은 기록에서 읽는다. 확인 입력으로 다시 받지 않는다.
- 인증번호는 SHA-256 해시로만 저장한다(`code_hash`). 원문은 SMS 로만 나간다.
- 확인할 때마다 시도 횟수를 **먼저** 1 올린다. 이 증가는 원자적이고 `attempt_count < 3` 인 행만 올린다. 그래서 동시에 여러 번 시도해도 비교는 최대 3번이다.
- 시도 증가는 독립 트랜잭션(`Propagation.RequiresNew`)으로 바로 커밋한다. 확인이 실패해 바깥 트랜잭션이 롤백돼도 횟수는 남는다.

**하루 발송 한도** (사용자 결정 2026-10-20)
- 같은 번호로 보낸 인증 SMS 를 한국 날짜(자정 KST 기준)로 센다. 세 용도를 합쳐 센다.
- 그날 보낸 수가 `SMS_VERIFICATION_DAILY_LIMIT`(기본 10) 이상이면 거부한다(429).
- 값이 비어 있거나 숫자가 아니거나 0 이하면 10 을 쓴다.
- 임시 비밀번호 SMS 는 인증 요청이 아니므로 세지 않는다.

**휴대폰 인증 (가입 후)**
- 로그인 회원만 할 수 있다.
- 이미 인증한 회원(`phone_verified_at` 있음)은 다시 할 수 없다(400).
- **번호 1개 = 계정 1개** (사용자 결정 2026-10-20) — 다른 계정이 이미 인증한 번호면 발송 단계에서 거부한다. `t_user.phone` 의 UNIQUE(`UK_User_Phone`)가 경쟁 상황을 막는다.
- 완료하면 `t_user.phone` · `phone_verified_at` 을 저장하고, 그 인증 기록에 `verified_at` 을 남긴다.
- 인증 전 회원을 서버에서 막지는 않는다 (사용자 결정 2026-10-20).
  - 결과에 `is_phone_verified` 를 내려, 프론트가 인증 화면으로 보낸다.
  - 막는 가드는 회원 전용 기능(예약 등)이 처음 생길 때 붙인다.
  - 탈퇴 · 비밀번호 변경은 인증 전에도 할 수 있다.

**아이디 찾기**
- 그 번호로 가입한 회원이 있을 때만 보낸다. 대상은 ACTIVE · BLOCK · LEAVE_WAIT 이고, 없으면 404 다.
- 확인되면 결과를 돌려준다 (사용자 결정 2026-10-20 — 본인 휴대폰을 인증했으므로 가리지 않는다).
  - 일반 계정은 `login_id` 를 그대로 돌려준다.
  - SNS 계정은 자동 생성 아이디 대신 `sns_id`(NAVER · KAKAO)를 돌려준다.
  - 두 경우 모두 가입일시(`created_at`)를 함께 돌려준다 (사용자 요청 2026-10-20).

**비밀번호 초기화**
- 아이디 + 휴대폰 번호가 같은 계정일 때만 보낸다(대상 상태는 위와 같다). 없으면 404 다 (사용자 결정 2026-10-20).
- SNS 계정은 거부한다(400). 비밀번호가 없는 계정이라 SNS 로 로그인해야 한다.
- 확인되면 다음 순서로 처리한다.
  1. 영문 + 숫자 10자리 임시 비밀번호를 만든다. 영문과 숫자가 각각 1자 이상 들어가 비밀번호 변경 규칙을 통과한다. 암호학적 난수(`node:crypto` `randomInt`)를 쓴다.
  2. bcrypt 로 저장하고 `is_password_change_required = 1` 로 둔다.
  3. 그 번호로 임시 비밀번호 SMS 를 보낸다. **발송은 마지막 단계다** (docs/integration.md "재시도되면 다시 나가므로").
- 기존 비밀번호는 알려주지 않는다.

**첫 총관리자 시드** (#23)
- 값: `login_id = 'admin'`, 비밀번호 `1234`, `auth_id = SUPER_ADMIN`, `is_password_change_required = 1`.
- 해시는 시드 시점에 bcrypt + pepper(`getBcrypt`)로 만든다.
- `admin` / `1234` 는 시드 안에 값 그대로 넣는다. 고정 ID 상수는 두지 않는다(사용자 결정 2026-10-20). PK 는 생성한 ID 이고, 이미 있는지는 `login_id` 로 확인한다(멱등). 비밀번호를 바꾼 뒤에는 시드가 덮지 않는다.
- 로그인에 회원 설정 행이 필요해서(`findLoginUser` 의 inner join) `t_user_setting` 1행도 함께 시드한다.

**SNS 가입 · 로그인** (사용자 결정 2026-10-20) — `sns_id` 허용값을 `NAVER` · `KAKAO` 로 줄인다. 시드(`t_sns`)는 그대로 둔다.

## Notes

- **회원 엔티티 · 시드 근거**
  - `t_user.phone` 은 이미 있다(nullable, libs/database/src/entities/user/user.entity.ts:57). 가입할 때 항상 null 로 넣는다(user.service.ts:78 · 153).
  - 탈퇴 처리 crontab 은 phone 을 `DEL_<시각>_<순번>`(전역 유일)로 바꾼다(user-leave-cleanup.crontab.ts:33 · 55). 그래서 UNIQUE 를 걸어도 탈퇴 회원 번호가 새 인증을 막지 않는다.
  - `is_password_change_required` 는 이미 있고(user.entity.ts:69) 일반 로그인 결과로 나간다(user.service.ts:324).
- **형제 계약**
  - 큐 핸들러는 인증 명령이면 `requireActor(command).user_id`, 비인증 명령이면 payload 와 `client_ip` 를 넘긴다(user.handler.ts — leave · sign).
  - 서비스 쓰기 메서드에 `@Transactional()`, 규칙 위반은 HTTP 예외를 던진다(user.service.ts:462 changePassword).
  - repository 제약 위반은 제약명별로 분기한다(user.repository.ts insertUser).
  - 게이트웨이 큐 라우트는 `commandStream.dispatch(res, {type, actor, payload, client_ip})` 한 줄이다(user.controller.queue.ts:87).
- **트랜잭션 예외** — 시도 횟수 증가만 repository 메서드에 `@Transactional(Propagation.RequiresNew)` 를 단다(`@nestjs-cls/transactional` 의 Propagation 지원 확인).
  - 형제 repository 메서드는 모두 서비스 트랜잭션에 합류하는데, 이것만 다른 이유가 있다. 실패한 확인도 횟수가 남아야 하기 때문이다.
  - 이 증가는 QueryBuilder 갱신(`attempt_count + 1` · 조건)이라 Data-Access Smoke 대상이다.
- **SMS 포트** — Phase 3 의 `SMS_SENDER`(Amazon SNS)를 처음 쓴다. user-service 루트 모듈이 `SmsModule` 을 import 한다. AWS 세팅 전에는 발송이 503 으로 실패한다(docs/guides/aws-setup.md).
- **라이브러리 의존** — 총관리자 비밀번호 해시 때문에 `libs/database`(시더)가 `libs/common`(bcrypt util)을 처음 쓴다. `common` 은 `database` 를 쓰지 않으므로 순환은 없다. docs/architecture.md 의 의존 방향을 고친다.
- **라우트 위치** — 관리자 · 이용자 페이지 라우트 분리(#24, Phase 5)는 이번 범위가 아니다. 아이디 찾기 · 비밀번호 초기화는 `/api/v1/user/...` 에 두고, 관리자 페이지 라우트가 생기면 같은 명령을 다시 쓴다.
- **범위 밖**
  - 비밀번호 초기화 시 다른 기기 로그인(세션)을 끊는 것.
  - 인증한 번호를 바꾸는 기능.
  - 인증 전 회원을 막는 가드.

## Proposals (Codebase-Based)

- [x] 인증 상태를 `phone` 의 null 여부 대신 `t_user.phone_verified_at` 으로 따로 둔다. 업체 총관리자처럼 관리자가 번호를 넣는 계정(Phase 8)과 SMS 로 인증한 계정을 구분할 수 있다.
- [x] 인증 용도를 룩업 테이블(`t_sms_purpose` + 시드)로 둔다 — 형제 `t_auth` · `t_state` · `t_sns` 와 같은 방식이다.
- [x] 인증번호 상태 판정(없음 · 사용함 · 만료 · 사용 가능), 한국 날짜 시작 시각, 한도 env 읽기, 인증번호 · 임시 비밀번호 생성은 순수 함수로 `user.util.ts` 에 둔다(service private 헬퍼 금지). 계산형이라 TDD 대상이다.
- [x] 테스트 도우미 `bootCommandPath` · `bootHttpPath` 에 SMS 포트 mock 을 기본값으로 넣는다. 기존 spec 호출부를 고치지 않아도 된다(AGENTS.md "공유 service 생성자에 DI 를 추가하면 …").

## Decisions

- [x] **컬럼 이름 정리를 먼저** (selected: user, 2026-10-20) — 시각 · 여부 플래그 · 직전 값 참조 · PK 이름. 파라미터 · 변수 · DTO 필드도 함께 바꾼다. `login_pw` 는 그대로 둔다. 새 `t_sms_verification` 은 처음부터 새 규칙(`created_at` · `updated_at` · `expires_at`)을 따른다. 이름 규칙을 AGENTS.md · docs/data-layer.md 에 남긴다.
- [x] **범위 = Phase 4 + #26 · #27** (selected: user, 2026-10-20) — 로드맵에서 #26 · #27 을 Phase 4 로 옮긴다. Phase 5 에는 #24 · #25 가 남는다.
- [x] **인증번호 = 6자리 · 5분 · 3회** (selected: user, 2026-10-20).
- [x] **하루 한도 = 한국 날짜 기준 최대 10번, 세 용도 합산, env `SMS_VERIFICATION_DAILY_LIMIT`** (selected: user, 2026-10-20).
- [x] **번호 1개 = 계정 1개** (selected: user, 2026-10-20) — `UK_User_Phone`.
- [x] **인증 전 회원은 여부만 내리고 막는 건 이후** (selected: user, 2026-10-20) — `is_phone_verified` 를 가입 · 로그인 · auth-user 결과에 넣는다.
- [x] **아이디 찾기 결과 = 일반 계정은 login_id 전체, SNS 는 sns_id** (selected: user, 2026-10-20).
- [x] **비밀번호 초기화 입력 = 아이디 + 휴대폰 번호** (selected: user, 2026-10-20) — 임시 비밀번호는 영문 + 숫자 10자리, SMS 로 보낸다(사용자 요청).
- [x] **SNS 는 네이버 · 카카오만** (selected: user, 2026-10-20).
- [x] **확인 = 인증 ID + 인증번호** (selected: user, 2026-10-20) — 발송 결과에 `sms_verification_id` 를 내리고, 확인 3개의 입력은 `{sms_verification_id, code}` 다. 비밀번호 초기화 확인도 아이디 · 번호를 다시 받지 않는다(기록의 회원 · 번호를 쓴다).
- [x] **SMS 인증은 가입 후 별도 단계** (사용자 요청 2026-10-20) — SNS · 일반 모두 같다. 완료 후에만 번호를 회원정보에 저장한다(일반 가입 입력에 번호를 넣지 않는다).
- [x] **refreshToken 1년** — 이미 365일, 변경 없음.
- [x] **시도 횟수는 독립 트랜잭션으로 먼저 소비** (추천안 채택 — 근거: 실패한 확인도 횟수가 남아야 하고, 동시 시도에도 비교가 최대 3번이어야 한다) — 형제 repository 와 다른 점은 Notes 에 적었다.
- [x] **총관리자 시드** — `'admin'` / `'1234'` 를 시드 안에 값 그대로 넣고 고정 ID 상수는 두지 않는다 (selected: user, 2026-10-20). 이미 있는지는 `login_id`, 회원 설정은 `user_id` 로 확인한다(시드 대상의 `key`). 필수 컬럼은 `name` · `nickname` '총관리자', `gender` 'M', `birth` '1970-01-01' (추천안 채택).
