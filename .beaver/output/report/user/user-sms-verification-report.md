# Report — user-sms-verification

## Feature Summary
- **Feature**: 회원 스키마 확장 + SMS 인증 — 컬럼 이름 정리(선행), 가입 후 휴대폰 SMS 인증, 아이디 찾기 · 비밀번호 초기화(SMS), 인증 기록 DB 보관 · 하루 발송 한도, 첫 총관리자 시드
- **Entry point**: `POST (큐 경로 6개) /api/v1/user/phone-verification · /phone-verification/confirm · /find-login-id · /find-login-id/confirm · /password-reset · /password-reset/confirm`
- **Domain**: user (로드맵 Phase 4 — #21 · #22 · #23 + Phase 5 에서 옮겨 온 #26 · #27)
- **Plan**: [user-sms-verification-plan.md](../../plan/user/user-sms-verification-plan.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/migrations/1792477492198-RenameColumns.ts` | created | 손으로 쓴 RENAME 15개 + 인덱스 · 시퀀스 이름 (데이터 유지) |
| `libs/database/src/migrations/1792477679219-SmsVerification.ts` | created | `db:generate` 결과 — `t_sms_purpose` · `t_sms_verification` · `phone_verified_at` · `UK_User_Phone`(생성기가 만든 `UQ_<해시>` 를 고침) |
| `libs/database/src/migrations.ts` | modified | 마이그레이션 2개 등록 |
| `libs/database/src/entities/user/sms-purpose.entity.ts` · `sms-verification.entity.ts` | created | 용도 룩업 · 발송 · 확인 기록 |
| `libs/database/src/entities/user/user.entity.ts` | modified | 컬럼 이름 정리 · `phone_verified_at` · `UK_User_Phone` · phone 주석 |
| `libs/database/src/entities/api-log/api-log.entity.ts` · `store/store.entity.ts` · `user/{session,session-refresh,state,user-setting}.entity.ts` | modified | 컬럼 이름 정리 |
| `libs/database/src/entities.ts` | modified | `SmsPurposeEntity` · `SmsVerificationEntity` |
| `libs/database/src/seeder/seeder.targets.ts` · `seeder.service.ts` · `seeder.util.ts` | modified | 만드는 함수 시드 · 확인 컬럼(`key`) · SMS 용도 · 첫 총관리자 · 회원 설정, `is_login_allowed` |
| `libs/contracts/src/user/dto/user-{phone-verification,phone-verification-confirm,find-login-id,find-login-id-confirm,password-reset,password-reset-confirm}.dto.ts` | created | 입력 · 결과 DTO 6쌍 |
| `libs/contracts/src/user/dto/user-{sign,login,general-sign,general-login,auth-user}.dto.ts` | modified | SNS NAVER · KAKAO 만, 결과에 `is_phone_verified`, `is_login_allowed` |
| `libs/contracts/src/user/user.commands.ts` | modified | 명령 6개 |
| `apps/user-service/src/user/interfaces/user.repository.interface.ts` · `repositories/user.repository.ts` | modified | SMS 인증 메서드 5개(시도 소비 RequiresNew + QueryBuilder) · `UK_User_Phone` 분기 · `phone_verified_at` select · 이름 정리 |
| `apps/user-service/src/user/user.util.ts` | modified | 인증 상수 · `generateVerificationCode` · `generateTemporaryPassword` · `kstDayStart` · `getSmsDailyLimit` · `checkSmsVerification` · `buildSmsVerification` · SMS 본문 2개 · auth-user `is_phone_verified` |
| `apps/user-service/src/user/user.service.ts` | modified | SMS 포트 주입 · 메서드 6개 · 가입 · 로그인 결과 `is_phone_verified` · 이름 정리 |
| `apps/user-service/src/user/user.handler.ts` | modified | `@OnCommand` 6개 |
| `apps/user-service/src/user-service.module.ts` | modified | `SmsModule` import (외부 연동 포트 첫 사용처) |
| `apps/gateway/src/api/v1/user/user.controller.queue.ts` | modified | 큐 라우트 6개 |
| `apps/user-service/src/user/test/user.test-helper.ts` | modified | `createSmsSenderMock` · 부팅 도우미 세 번째 인자 · repository mock 5개 |
| `.env.example` · `README.md` · `AGENTS.md` · `docs/{data-layer,architecture,testing,integration}.md` | modified | `SMS_VERIFICATION_DAILY_LIMIT` · user-service 기능 · 컬럼 이름 규칙 · RequiresNew 예외 · `database → common` · 도우미 · 첫 사용처 |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified | #26 · #27 을 Phase 4 로 이동, 결정 · 상태 반영 |

## Tests Written
build 규약상 실행하지 않았다 — `/beaver:test` 에서 실행한다.

- `apps/user-service/src/user/test/user.util.spec.ts` — `[CASES]` 묶음 6개:
  - `kstDayStart` 4
  - `getSmsDailyLimit` 5
  - `checkSmsVerification` 4
  - `generateVerificationCode` 2 (200회 형식 · 앞자리 0)
  - `generateTemporaryPassword` 2 (200회 규칙 · 숫자만 나오면 다시 뽑기)
  - `buildSmsVerification` 1
- `user-phone-verification.spec.ts` (큐 경로)
  - 발송: `[SUCCESS]` 기록 → 발송 순서 · 결과 / `[FAIL:service]` 이미 인증 / `[FAIL:duplicate]` 다른 계정 번호 / `[FAIL:business]` 한도 env 없음 · '3' / `[FAIL:service]` 회원 없음 / `[FAIL:infra]` 503 → requeue · 마지막은 dead / `[FAIL:auth]` actor 없음
  - 확인: `[SUCCESS]` 소비 → 일치 → 인증 · 번호 저장 / 기록 없음 404 / 사용함 · 만료 400 / 소진 400 / 불일치 400(code) / 이미 인증 400
- `user-find-login-id.spec.ts`
  - 발송: `[SUCCESS]` / 회원 없음 404 / 한도 429
  - 확인: 일반 계정(아이디 · 가입일시) / SNS(sns_id · 가입일시) / 기록 없음 404 / 탈퇴 회원 404 / 불일치 400
- `user-password-reset.spec.ts`
  - 발송: `[SUCCESS]` / 회원 없음 404 / SNS 400 / 한도 429
  - 확인: 임시 비밀번호 · 변경 필요 · 마지막 발송 순서 / 기록 없음 404 / 탈퇴 회원 404 / 불일치 400
- `user.repository.spec.ts`
  - `insertSmsVerification` FK 2 + 500
  - `updateUser` `UK_User_Phone` 400
  - `consumeSmsVerificationAttempt` affected 1 · 0 · 실패 500
  - `findSmsVerification` 조회 형태
  - 500 표에 3개 추가
  - `[SMOKE:data-access]` 로그인 회원 SQL(`phone_verified_at` · `is_login_allowed`) · 별칭, 시도 소비 SQL 고정(기획 때 TypeORM 으로 실제 생성해 본 값)
- `libs/database/src/test/seeder.spec.ts`
  - 빈 DB 순서 · 총관리자 · 회원 설정
  - login_id · user_id 확인 컬럼
  - 총관리자 없음
  - PK 기준 룩업
  - 만드는 함수 실패 격리
  - 시드 정합성: NAVER · KAKAO, 용도 3개, 대상 · key 순서
- 기존 spec
  - 결과 `is_phone_verified`: sign · general-sign · login · general-login · auth-user. 인증 회원 1 케이스 추가.
  - SNS 'GOOGLE' 거부.
  - 이름 정리는 식별자 일괄 교체(token-refresh · leave · leave-cancel 등).
- 게이트웨이 `user.controller.queue.spec.ts`
  - 6 라우트 발행(로그인 2 · 비로그인 4)
  - 인증 401 2
  - 형식 400 4
  - 429 relay
  - GOOGLE 400

## Verification
- **통과**: `npm run typecheck`(spec 포함) · `npm run lint` · `npm run build`(두 앱) · `npm run db:check`("엔티티와 마이그레이션이 일치합니다") · Prettier(변경 파일).
- **컬럼 이름 정리 검증**
  - RENAME 마이그레이션만 등록한 상태에서 `db:check` 가 먼저 일치했다. 이름 변경이 엔티티와 1:1 이다.
  - 그 뒤 `db:generate` 는 신규 테이블 · phone 컬럼만 만들었다(DROP 없음).
- **plan 대조**
  - 엔티티 · repository · service 메서드 6개 · DTO 6개는 plan 블록을 그대로 옮겼다.
  - 핸들러 6개 · 게이트웨이 라우트 6개도 plan 블록을 그대로 옮겼다.
  - util 은 plan 코드를 이름 정리(`expires_at` · `created_at`)까지 반영해 넣었다.
- **plan 과 다른 점 하나** — 생성된 마이그레이션의 UNIQUE 이름이 `UQ_a8daa…` 였다. repository 의 `isUniqueViolation(error, 'UK_User_Phone')` 분기가 동작하도록 `UK_User_Phone` 으로 고쳤다.
  - `db:check` 는 이 이름 차이를 잡지 못한다(고치기 전에도 "일치").
  - 규칙을 AGENTS.md · docs/data-layer.md 에 남겼다.
- **SMS 발송은 각 메서드의 마지막 단계**다. 발송 3개는 insert 뒤 send, 비밀번호 초기화 확인은 updateUser 뒤 send 다. spec 이 `invocationCallOrder` 로 고정한다.

## Remaining Issues
- **테스트 미실행** — `/beaver:test` 에서 `npm test` 를 돌린다.
- **DB 연결 풀 교착(리뷰 #1, High) — 다음 단계로 미룸** — 확인 명령 10건이 동시에 들어오면 user-service 인스턴스가 멈출 수 있다. 서버 분할 단계에서 "동시 명령 수 < 풀" · 연결 대기 제한으로 고친다(운영 배포 전).
- **DB 적용은 사용자 몫** — 마이그레이션 2개는 `npm run db:migrate` 또는 Docker migrate 컨테이너로 적용한다.
  - `RenameColumns` 는 운영 데이터가 있어도 안전하다(RENAME).
  - 순서는 Init → RenameColumns → SmsVerification 이다.
- **AWS SMS 세팅 전에는 발송이 503** — 인증번호 발송 3개와 임시 비밀번호 발송이 이에 해당한다(docs/guides/aws-setup.md). 큐 경로에서 재시도 3회 후 failed 가 된다.
- **첫 총관리자 `admin` / `1234`** — 시드는 부팅 때 들어간다. 첫 로그인 결과의 `is_password_change_required = 1` 로 변경을 유도하지만, 강제로 막지는 않는다. 운영 배포 전에 비밀번호를 바꾼다.
- **범위 밖(spec Notes)** — 비밀번호 초기화 시 다른 기기 세션 끊기, 인증한 번호 바꾸기, 인증 전 회원 가드, 관리자 페이지 라우트(#24).

## Change - 261020-1
리뷰 [main-review-261020-3.md](../../review/main-review-261020-3.md) 후속 — 재리뷰 [main-review-261020-4.md](../../review/main-review-261020-4.md).

- 게이트웨이 라우트 주석 4곳의 `done 의 data` 설명을 실제 결과(인증 ID · 가입일시)에 맞췄다.
- **#1(High, DB 연결 풀 교착)은 사용자 결정으로 다음 단계(서버 분할)로 미뤘다.**
  - 한 번 넣었던 풀 · 동시 명령 수 코드 · env · 문서 · spec 은 모두 되돌렸다.
  - 다음 단계에서 함께 다룬다.
    - crontab 을 scheduler 서버로 옮긴다.
    - 인스턴스당 동시 명령 수를 env 로 두고, 항상 DB 연결 풀보다 작게(≤ 풀 − 1) 묶는다.
    - 풀 연결 대기 시간을 제한한다.
  - 그 전까지는 확인 명령이 한 인스턴스에 동시에 10건 들어오면 교착될 수 있다(기본 동시 명령 수 10 = 풀 10, 대기 제한 없음). 다음 단계는 운영 배포 전에 끝낸다.
