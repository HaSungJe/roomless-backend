# Review — main — 261020-3

> ship 전 코드 리뷰. Phase 4(회원 스키마 확장 + SMS 인증)의 작업 트리 변경(`git diff HEAD` + 새 파일)을 memory 규칙 · AGENTS.md 규약 · plan/spec 의도와 대조한다.

## Target
- mode: direct (worktree 없음) — branch: `main` → origin: `origin/main`
- 포함 작업: user-sms-verification (로드맵 Phase 4 — #21 · #22 · #23 · #26 · #27)
- 변경 범위
  - 수정 46개 (+1408 / −219)
  - 새 파일 17개: 마이그레이션 2 · 엔티티 2 · DTO 6 · spec 4 · spec/plan/report 3

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 엔티티 `t_sms_purpose` · `t_sms_verification`, 제약 `PK_` · `FK_SmsVerification_*` · `UK_User_Phone` · `IDX_SmsVerification_PhoneCreatedAt`. 명령 `user.member.<kebab>` 6개. DTO 는 kebab 6쌍. 새 컬럼 이름 규칙(`*_at` · `is_*` · `previous_*` · `<table>_id`)을 지킨다 |
| Structure & layering | pass | handler `@OnCommand` 6개는 위임만 한다. service 는 포트(`USER_REPOSITORY` · `SMS_SENDER`)만 쓰고 private 헬퍼가 0개다. 계산은 `user.util.ts` 로 뺐다. 게이트웨이 라우트는 큐 파일(`user.controller.queue.ts`)에만 있다 |
| Shared logic extraction | pass | 인증번호 · 임시 비밀번호 · KST 하루 시작 · 한도 env · 상태 판정 · 엔티티 조립 · SMS 본문은 util 순수 함수다. 하루 한도 확인 블록이 발송 3개에서 반복되지만, 규약(private 헬퍼 금지)상 허용되는 형태다 |
| Errors & responses | pass | 비즈니스 오류는 4xx(한도 429)다. `validation_errors` 는 입력 필드(phone · code)에만 담는다. repository 는 FK 2개 · `UK_User_Phone` 을 제약명으로 분기하고 나머지는 `SERVER_ERROR_MESSAGE` 500 이다. 응답 필드는 생략하지 않는다(`login_id: null`) |
| Entity · Migration | pass | 모든 컬럼에 comment 가 있고 타임스탬프는 훅으로 채운다. FK 는 문자열 속성 + `@ManyToOne` 이다. 이름 변경은 손으로 쓴 RENAME(데이터 유지)이다. 생성된 `UQ_<해시>` 는 `UK_User_Phone` 으로 고쳤다. `db:check` 일치 |
| Swagger | pass | 큐 핸들러는 `@ApiProduces('text/event-stream')` 를 쓰고, 응답 데코레이터는 `type` 만 쓴다. 발송 라우트에는 429 응답이 있다 |
| Test strength | pass | 큐 경로를 실제로 부팅해 검증한다(repository · JwtService · SMS 포트만 mock). 발송 순서 `invocationCallOrder`, 실패 후 `.not.toHaveBeenCalled()`, 엔티티 컬럼 값, 한국어 리터럴을 단언한다. 계산형은 `[CASES]` 로 검증한다 |
| memory: mock 어댑터 금지 · README 갱신 · `.beaver/output` 동반 커밋 | pass | SMS 는 실제 SNS 어댑터를 쓰고, AWS 세팅 전에는 503 이다. README · `.env.example` 에 `SMS_VERIFICATION_DAILY_LIMIT` 을 넣었다. spec · plan · report · 로드맵을 함께 커밋한다 |

## Data-Access Smoke Coverage
- `consumeSmsVerificationAttempt` (QueryBuilder 갱신 · 식 할당)
  - `buildConsumeSmsVerificationAttemptQuery` 로 분리했고, smoke 가 SQL · 파라미터를 고정한다.
- `findLoginUser`
  - 새 select `phone_verified_at` 과 이름 정리(`is_login_allowed`)를 smoke 스냅샷에 반영했다.
- 새 find · count 조건(`findSmsVerification` · `countSmsVerifications` · `findUser({login_id, phone, state_id: In})`)
  - 기존 `findUser({state_id: In(...)})` 와 같은 단일 테이블 FK 문자열 where 형태다.
  - 리뷰 때 접속 없는 DataSource 로 실제 SQL 을 만들어 확인했다(임시 spec, 확인 후 삭제).
  - 결과는 `"sms_purpose_id" = $2 AND "user_id" = $3` · `"created_at" >= $2` · `"state_id" IN ($3, $4)` 로, 조인 없이 정상이다.

## Memory Reconcile
`.beaver/memory/` 에 `미반영` 항목 없음.

## Draft Conventions
draft 표식 문서 없음. 규약 문서는 이번 작업으로 직접 갱신했고, 코드와 대조해 일치한다.
- AGENTS.md: 컬럼 이름 · RequiresNew 예외 · 외부 연동 첫 사용처 · `is_phone_verified`
- docs: data-layer · architecture · testing · integration

## Intended Behavior Check (against plan/spec)
- **#21 컬럼 이름 정리**
  - RENAME 15개 + 인덱스 · 시퀀스 이름 변경이다.
  - 소스 · spec · 문서의 식별자를 일괄 교체했다. `login_pw` 는 결정대로 그대로 두었다.
- **#22 SMS 인증 기록**
  - 발송 1건 = 1행이다. 인증번호는 SHA-256 해시로만 남긴다.
  - 시도 횟수 · 만료 · 완료 · IP 를 기록한다. 하루 한도는 `(phone, created_at)` 인덱스로 센다.
- **#23 첫 총관리자**
  - `admin` / `1234` 를 인라인으로 넣었다(ID 상수 없음).
  - `login_id` 기준으로 멱등하고, `is_password_change_required = 1` 이다.
- **#26 휴대폰 인증**
  - 발송 결과로 `sms_verification_id` · `expires_at` 을 돌려준다. 확인은 인증 ID + 인증번호로 한다.
  - 규칙: 6자리 · 5분 · 3회, 번호 1개 = 계정 1개, 하루 10번(env, 한국 날짜, 용도 합산).
  - 확인되면 기록의 번호를 `t_user.phone` · `phone_verified_at` 에 저장한다.
  - 인증 전 회원은 막지 않고 `is_phone_verified` 만 내린다(결정대로).
- **#27 아이디 찾기 · 비밀번호 초기화**
  - 아이디 찾기 결과: `{login_id(SNS 는 null), sns_id, created_at}`.
  - 비밀번호 초기화
    - 아이디 + 번호로 발송하고, SNS 계정은 400 이다.
    - 확인되면 영문 + 숫자 10자리 임시 비밀번호로 바꾸고, 변경 필요 표시를 남기고, SMS 를 보낸다(마지막 단계).
- SNS 가입 · 로그인은 NAVER · KAKAO 만 받는다. refresh 365일은 기존 그대로다.
- 리뷰 중 고친 것
  - 게이트웨이 라우트 주석의 `done 의 data` 설명이 인증 ID · 가입일시 추가 전 내용이었다.
  - `user.controller.queue.ts` 주석 4곳을 실제 결과 DTO 에 맞췄다.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | High | `apps/user-service/src/user/repositories/user.repository.ts` `consumeSmsVerificationAttempt` · `libs/database/src/typeorm.config.ts:20` | 확인 명령 3개(휴대폰 인증 · 아이디 찾기 · 비밀번호 초기화)에서 생기는 **DB 연결 풀 교착**. 상세는 표 아래 | 아래 선택지 중 결정 → `/beaver:build` 로 수정 → 재리뷰 |
| 2 | Low | `apps/user-service/src/user/user.service.ts` `confirmPasswordReset` | SMS 발송 실패(503)로 재시도될 때마다 시도 횟수가 1회씩 소비된다. 비밀번호 변경은 롤백되지만 소비는 독립 커밋이라 남는다. AWS 장애 뒤에는 인증번호를 다시 받아야 하고, 마지막 재전달은 503 대신 "입력 횟수 초과"(400)로 끝날 수 있다 | 지금은 그대로 둔다(AWS 세팅 전 503 은 알려진 상태). 발송 재시도 설계를 손볼 때 다시 본다 |
| 3 | Low | `apps/user-service/src/user/user.service.ts` 발송 3개의 하루 한도 확인 | 센 다음 넣는 방식이라 같은 번호로 동시에 요청하면 한도를 몇 건 넘길 수 있다(잠금 없음) | 지금은 그대로 둔다. 남용이 보이면 번호 단위 advisory lock 등을 검토한다 |

### Finding #1 상세 — DB 연결 풀 교착

**교착이 생기는 과정**
1. service 의 `@Transactional()` 이 메서드에 들어갈 때 연결 1개를 잡는다.
2. 그 안의 `@Transactional(Propagation.RequiresNew)` 는 같은 풀에서 연결을 **하나 더** 기다린다.
3. user-service 의 명령 prefetch 는 기본 10(`DEFAULT_PREFETCH`)이고, DB 풀도 기본 10이다.
4. 확인 명령 10개가 동시에 들어오면 바깥 트랜잭션 10개가 풀을 다 잡은 채 서로를 기다린다.
5. pg 풀에는 연결 대기 시간 제한(`connectionTimeoutMillis`)이 없어서, 이 대기는 영원히 끝나지 않는다.
6. 그 인스턴스는 DB 작업이 모두 멈춘다. 로그인 · 가입 · 조회도 같이 멈춘다.

**누가 일으킬 수 있나**
- `find-login-id/confirm` · `password-reset/confirm` 은 비로그인 라우트다.
- 유효한 인증 ID 하나로 틀린 인증번호를 동시에 10번 넘게 보내면 재현된다. 시도 한도에 닿은 뒤에도 소비 UPDATE 자체는 실행되기 때문이다.
- 테스트는 `@Transactional` 을 pass-through 로 mock 하므로 이 문제를 잡지 못한다.

## Verdict
**Changes needed** — Finding #1(High)은 커밋 전에 고친다. #2 · #3 은 기록만 하고 이번 ship 에서는 그대로 둔다. 고칠 방식은 사용자가 정한 뒤 `/beaver:build` 로 반영하고 재리뷰(`main-review-261020-4.md`)를 거쳐 커밋 → 푸쉬 → 로드맵 진척 커밋으로 진행한다.
