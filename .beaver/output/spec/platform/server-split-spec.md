---
# One-line feature summary
feature_goal: "서버 분할 — crontab 전용 scheduler 서버 · 서버별 인스턴스 수(env) · 인증번호 확인의 DB 연결 풀 교착 수정(실패를 return)"

# Domain/module name
domain: "platform"

# Entry-point method/endpoint
api_method: "@Cron(scheduler) · @OnCommand(user.member.*-confirm) · 내부 HTTP(user-service)"

# Path/signature
api_path: "apps/scheduler/src/main.ts(NestFactory.createApplicationContext) · user.member.phone-verification-confirm · user.member.find-login-id-confirm · user.member.password-reset-confirm"

# Affected state
affected_data: ["t_user (탈퇴 자동처리 — scheduler 로 이전)", "t_sms_verification.attempt_count (확인 시도 — 같은 트랜잭션에서 커밋)"]
---

## Feature Description

로드맵 Phase 5(#88 · #89 · #90 · #91). 세 가지를 한 번에 한다.

1. **scheduler 서버(#88 · #89 · #90)**
   - crontab 만 도는 새 앱 `apps/scheduler` 를 만든다.
   - 들어오는 연결이 없다. HTTP 리스너 · 큐 소비 · 컨트롤러가 없다(`NestFactory.createApplicationContext`).
   - DB 에 직접 붙어 작업한다. 탈퇴 자동처리 crontab 을 user-service 에서 옮겨 오고, user-service 에는 crontab 을 두지 않는다.
   - Docker 묶음 `compose.scheduler.yml` 은 `roomless-data` 네트워크 하나에만 붙는다. 인스턴스 수는 `.env` 의 `SCHEDULER_REPLICAS`(기본 1)로 정한다.
2. **인스턴스 수는 서버마다 `.env`** — `GATEWAY_REPLICAS`(기본 2) · `USER_SERVICE_REPLICAS`(기본 2) · `SCHEDULER_REPLICAS`(기본 1). admin-service 의 `ADMIN_SERVICE_REPLICAS` 는 Phase 7 에서 앱과 함께 넣는다.
3. **인증번호 확인 교착 수정(#91, 리뷰 261020-3 #1)**
   - **지금의 문제**
     - 인증번호 확인 3개는 `@Transactional()` 연결을 잡은 채, 시도 횟수 소비(`@Transactional(Propagation.RequiresNew)`)용 연결을 하나 더 기다린다.
     - 한 인스턴스에 확인 명령이 풀 크기(10)만큼 동시에 오면 서로를 기다리며 멈춘다. pg 풀에는 대기 제한도 없다.
   - **고치는 방법**
     - 불일치는 예외를 throw 하지 않고 **return** 한다. 트랜잭션이 커밋돼 시도 횟수가 남는다.
     - 시도 소비는 같은 트랜잭션에서 한다. RequiresNew 를 없애 연결 1개로 끝난다.
     - 반환된 예외는 큐 경로에서는 `CommandDispatcher` 가, 내부 HTTP 에서는 새 전역 인터셉터 `ReturnedExceptionInterceptor` 가 실패 응답으로 바꾼다. 클라이언트가 받는 결과(400 · `validation_errors.code`)는 지금과 같다.
   - **안전망**: 풀에서 연결을 기다리는 시간을 `.env` 의 `DATABASE_CONNECTION_TIMEOUT_MS`(기본 30초)로 제한한다.

## API Spec

새 공개 API 는 없다. 바뀌는 진입점은 아래와 같다.

- Method: `@Cron(CronExpression.EVERY_HOUR)` — `UserLeaveCleanupCrontab.processLeaveWait()`
- Path: `apps/user-service/src/user/crontabs/user-leave-cleanup.crontab.ts` → `apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts`. 동작 · 잠금 키(`user.leave-cleanup`)는 그대로다.
- Request: 없음 (시간 트리거)
- Response: 없음

- Method: `@OnCommand` — `user.member.phone-verification-confirm` · `user.member.find-login-id-confirm` · `user.member.password-reset-confirm`
- Path: `apps/user-service/src/user/controllers/user.controller.queue.ts`
- Request: `{sms_verification_id, code}` (변경 없음)
- Response
  - 성공: 변경 없음
  - 불일치: 지금처럼 failed `{status_code: 400, message: '인증번호가 일치하지 않습니다.', validation_errors: [{property: 'code', ...}]}`. 내부적으로는 throw 대신 return 이고, 판정은 ack 이다(재시도 없음).

## Business Rules

- **scheduler 는 들어오는 연결을 받지 않는다.** 포트 · 로드밸런서 · `InternalAuthGuard` · `MessagingModule` 이 없다. DB(`DatabaseModule`)와 `ScheduleModule` 만 쓴다.
- **crontab 은 scheduler 앱에만 둔다.**
  - 서비스 앱(user-service · 이후 admin-service)에는 `ScheduleModule` · `crontabs/` 를 두지 않는다.
  - crontab 이 쓰는 데이터 접근은 scheduler 안의 도메인 repository 로 둔다. 공유 DB 단계라 user-service 와 같은 엔티티를 쓴다.
- **scheduler 도 여러 대일 수 있다.** `SCHEDULER_REPLICAS` 를 늘리거나 배포 중 두 대가 겹칠 수 있으므로, 지금처럼 `JobLockService.runExclusive` 로 회차마다 1대만 실행하고, 운영(`NODE_ENV === 'production'`)에서만 돈다.
- **마이그레이션은 user-service 묶음의 migrate 가 적용한다.** scheduler 묶음은 user-service 묶음 뒤에 띄운다(`docker:up` 순서).
- **커밋해야 하는 실패는 return**
  - 쓰기를 커밋한 채 실패를 알려야 할 때만 service 가 예외를 return 한다. 지금은 인증번호 불일치로 시도 횟수를 남겨야 하는 경우 하나다.
  - 그 밖의 실패는 지금처럼 throw → 롤백이다. 시도 한도 초과는 쓰기가 없어 throw 그대로, SMS 503 은 throw → 롤백 → 재시도다.
  - 반환된 실패는 이미 커밋된 결과라 **상태 코드와 무관하게 재시도하지 않는다**(failed + ack).
  - 내부 HTTP 에서는 `ReturnedExceptionInterceptor` 가 반환된 `HttpException` 을 다시 throw 해 `CustomErrorFilter` 가 상태 코드 + 실패 본문으로 응답한다.
- **연결 대기 제한**
  - `DATABASE_CONNECTION_TIMEOUT_MS`(기본 30000)를 넘기면 그 요청은 500 이다(큐 경로는 재시도).
  - env 숫자 파서 `readPositiveInt` 를 게이트웨이 전용(`transport.util.ts`)에서 `libs/common/src/utils/env.ts` 로 옮겨 게이트웨이 · database 가 같이 쓴다.

## Notes

- **부수 효과(좋은 쪽)** — 리뷰 261020-3 #2(Low)가 같이 풀린다.
  - 지금은 비밀번호 초기화의 SMS 503 재시도마다 시도 횟수가 독립 커밋으로 1회씩 줄어든다.
  - 바꾸면 시도 소비가 같은 트랜잭션이라, SMS 실패 롤백 때 함께 취소된다.
- **휴대폰 인증 확인의 `UK_User_Phone` 경합(400)**: throw 그대로라 시도 소비도 롤백된다. 맞는 인증번호였으므로 다시 시도하면 된다.
- **알려진 범위 밖**
  - admin-service(Phase 7)의 `ADMIN_SERVICE_REPLICAS` · 인터셉터 등록은 그 Phase 에서 한다.
  - 입장 QR 발송 · 이용 종료 crontab(Phase 19)은 처음부터 scheduler 에 만든다.
- **user-service 에서 빠지는 코드(§1.7)**
  - `ScheduleModule.forRoot()` · `crontabs/` · crontab spec(scheduler 로 이동)
  - `findUsers`(crontab 만 썼다 — repository · 인터페이스 · 테스트 mock · repository spec 케이스)
  - repository 의 `Propagation` · `Transactional` import
  - AGENTS.md · data-layer.md 의 "RequiresNew 예외" 문단

## Proposals (Codebase-Based)

- [x] scheduler 의 회원 조회는 QueryBuilder 빌더(`buildUsersQuery`) + `[SMOKE:data-access]` 로 SQL 을 고정한다. `state_id` FK 문자열 where 는 docs/testing.md 기준 매핑 민감이다. 지금 user-service `findUsers` 는 mock 만으로 커버돼 있다(user.repository.spec.ts:203) — 옮기면서 규칙대로 맞춘다.
- [x] `readPositiveInt`(apps/gateway/src/modules/transport/transport.util.ts:31)를 `libs/common/src/utils/env.ts` 로 옮겨 공유한다. database 의 연결 대기 env 가 같은 파서를 쓴다.
- [x] Dockerfile 은 `APP` 빌드 인자 하나로 앱을 고르는 구조라(Dockerfile:2,21) 바꾸지 않는다. 주석의 앱 목록만 갱신한다.

## Decisions

- [x] 서버 분할 — gateway · user-service(이용자) · admin-service(총관리자 + 업체 관리자) · scheduler(crontab 만, 들어오는 연결 없음, DB 직접). 인스턴스 수는 서버마다 `.env` 의 `*_REPLICAS`. (사용자 결정 2026-10-20)
- [x] 교착 수정 방식 — 틀린 인증번호는 예외를 return, RequiresNew 제거. (사용자 결정 2026-10-20)
- [x] 반환된 예외 처리 범위 — 큐 경로(`CommandDispatcher`) + 내부 HTTP(`ReturnedExceptionInterceptor` 전역 등록)까지 미리 지원. (사용자 결정 2026-10-21)
- [x] 연결 대기 제한 — `.env` 의 `DATABASE_CONNECTION_TIMEOUT_MS`, 기본 30초. (사용자 결정 2026-10-21)
- [x] 반환된 예외 판정 · 인터셉터의 TDD 케이스 6개 — plan Test Cases. (사용자 결정 2026-10-21)
