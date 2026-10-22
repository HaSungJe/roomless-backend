# Report — server-split

## Feature Summary
- **Feature**: 서버 분할 — crontab 전용 scheduler 서버 · 서버별 인스턴스 수(env) · 인증번호 확인의 DB 연결 풀 교착 수정(실패를 return)
- **Entry point**: `@Cron · @OnCommand · 내부 HTTP` — `apps/scheduler/src/main.ts(NestFactory.createApplicationContext) · user.member.phone-verification-confirm · user.member.find-login-id-confirm · user.member.password-reset-confirm`
- **Domain**: platform (로드맵 Phase 5 — #88 · #89 · #90 · #91)
- **Plan**: [server-split-plan.md](../../plan/platform/server-split-plan.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `apps/scheduler/tsconfig.app.json` · `src/main.ts` · `src/scheduler.module.ts` | created | crontab 전용 앱 — `createApplicationContext`(listen 없음), `DatabaseModule` · `ScheduleModule.forRoot()` · `UserModule` |
| `apps/scheduler/src/user/user.module.ts` · `user.symbols.ts` · `interfaces/user.repository.interface.ts` · `repositories/user.repository.ts` | created | crontab + scheduler 의 회원 repository(`findUsers` = `buildUsersQuery().getMany()` · `updateUser`) |
| `apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts` | moved (user-service → scheduler) | 클래스 주석만 수정 — 본문 · 잠금 키 그대로 |
| `apps/scheduler/src/user/test/user-leave-cleanup.crontab.spec.ts` | moved | 제목 한 곳("다른 scheduler 인스턴스") |
| `apps/scheduler/src/user/test/user.test-helper.ts` · `user.repository.spec.ts` | created | repository mock · `[SMOKE:data-access]` |
| `compose.scheduler.yml` | created | scheduler × `SCHEDULER_REPLICAS`(기본 1), `roomless-data` 만, 쓰지 않는 비밀값 빈 값 |
| `nest-cli.json` · `package.json` · `Dockerfile` · `.env.example` | modified | scheduler 프로젝트 · 스크립트(build · start · docker · logs, docker:up/down 순서) · 주석 · `SCHEDULER_REPLICAS` · `DATABASE_CONNECTION_TIMEOUT_MS` |
| `libs/common/src/exception/returned-exception.interceptor.ts` | created | 내부 HTTP 에서 반환된 `HttpException` 을 다시 throw → `CustomErrorFilter` |
| `libs/common/src/utils/env.ts` | created | `readPositiveInt`(gateway `transport.util.ts` 에서 이동) |
| `libs/messaging/src/command.dispatcher.ts` | modified | 핸들러가 반환한 `HttpException` → failed + ack(재시도 없음) |
| `libs/database/src/typeorm.config.ts` | modified | `connectTimeoutMS: readPositiveInt(DATABASE_CONNECTION_TIMEOUT_MS, 30000)` |
| `apps/user-service/src/user-service.module.ts` · `user/user.module.ts` | modified | `ScheduleModule` · crontab 제거, `APP_INTERCEPTOR` 등록 |
| `apps/user-service/src/user/user.service.ts` · `controllers/user.controller.queue.ts` | modified | 확인 3개 — 불일치는 `return new BadRequestException(...)`, 반환 타입 · JSDoc |
| `apps/user-service/src/user/repositories/user.repository.ts` · `interfaces/user.repository.interface.ts` | modified | `findUsers` 제거, `@Transactional(Propagation.RequiresNew)` 제거 · 주석 |
| `apps/user-service/src/user/test/user.test-helper.ts` · `user.repository.spec.ts` | modified | `findUsers` mock · 케이스 제거, `bootHttpPath` 에 `APP_INTERCEPTOR` |
| `apps/gateway/src/modules/transport/transport.util.ts` · `command-stream.service.ts` · `internal-http.client.ts` · `test/internal-http.client.spec.ts` | modified | `readPositiveInt` 를 `@app/common/utils/env.js` 에서 가져온다, 케이스는 env.spec.ts 로 이동 |
| `README.md` · `AGENTS.md` · `docs/{architecture,messaging,error-handling,data-layer,testing,conventions}.md` | modified | scheduler 서버 · 묶음 5개 · crontab 은 scheduler 에만 · 커밋해야 하는 실패는 return(RequiresNew 예외 삭제) · 연결 대기 env · smoke 적용처 |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified | Phase 5 진행 중 · build 완료 메모 |

## Tests Written
build 규약상 실행하지 않았다 — `/beaver:test` 에서 실행한다.

- `libs/messaging/src/test/command.dispatcher.spec.ts` — `[CASES:returned-exception]`
  - ① 400 반환 → failed(400 · validation_errors) + ack, 봉투 request_id · actor · attempt
  - ② 500 반환 → 재시도 없이 failed + ack
  - ③ reply_to 없음 → ack · 회신 없음
  - ④ 일반 값은 기존 `[SUCCESS]` 가 덮는다
- `libs/common/src/exception/test/returned-exception.interceptor.spec.ts` — `[CASES:returned-exception]`
  - ⑤ 컨트롤러가 400 반환 → 400 + `{message, validation_errors}`
  - ⑥ 일반 값 → 200 그대로
- `libs/common/src/utils/test/env.spec.ts` — `[CASES:readPositiveInt]` 5개(이동)
- `apps/scheduler/src/user/test/user.repository.spec.ts` — `[SMOKE:data-access]` `buildUsersQuery`
  - 파라미터 `['LEAVE_WAIT', '2026-01-15 09:30:00']`
  - `FROM "t_user" "u" WHERE (("u"."state_id" = $1) AND ("u"."leave_reserved_at" <= $2))`, JOIN 없음
- `apps/scheduler/src/user/test/user-leave-cleanup.crontab.spec.ts` — 이동(운영 가드 · 잠금 건너뜀 · 백업 + 익명화 · 건별 실패)
- 기존 확인 spec(phone-verification · find-login-id · password-reset)은 고치지 않았다 — 디스패처까지 부팅해 결과(failed 400 · ack · 미호출)를 단언하므로 throw → return 이어도 같다.

## Verification
- **통과**
  - `npm run typecheck`(spec 포함) · `npm run lint` · Prettier(`apps/**/*.ts` · `libs/**/*.ts`)
  - `npm run build`(gateway · user-service · scheduler — `dist/apps/scheduler/apps/scheduler/src/main.js` 생성)
  - `docker compose -f compose.scheduler.yml config --quiet`(종료 코드 0, 값 출력 없이 검증)
- **plan 대조** — 새 파일 · 변경부는 plan 블록을 그대로 옮겼다. user-service 에 `findUsers` · `ScheduleModule` · `crontab` · `Propagation` 이 남아 있지 않다.
- **기획 때 확인한 SQL** — smoke 의 WHERE 는 기획 때 접속 없는 DataSource 로 실제 생성해 본 값이다.
- **줄바꿈** — `git checkout` 으로 되돌렸던 파일 몇 개(typeorm.config.ts · messaging.md 등)가 CRLF 라 LF 로 맞췄다. `libs/messaging` 의 세 파일은 `git status` 에 M 으로 보이지만 `git diff` 는 비어 있다(내용 변경 없음).

## Remaining Issues
- **테스트 미실행** — `/beaver:test` 에서 `npm test` 를 돌린다.
- **배포 순서(사용자)** — scheduler 는 user-service 묶음(마이그레이션) 뒤에 띄운다.
  - `docker:up` 은 이미 이 순서다.
  - 운영에서 묶음을 따로 올릴 때도 user-service → scheduler 순으로 띄운다.
  - 기존 user-service 컨테이너는 새 이미지로 다시 띄워야 crontab 이 user-service 에서 빠진다. 그 전까지는 두 앱 모두 crontab 을 돌리지만, `JobLockService` 로 회차마다 1대만 실행한다.
- **admin-service(Phase 7)** — `ADMIN_SERVICE_REPLICAS` 와 루트 모듈의 `APP_INTERCEPTOR` 등록은 그 Phase 에서 한다.
- **리뷰 261020-3 #2(Low)도 해소** — 비밀번호 초기화의 SMS 503 재시도 때 시도 소비가 같은 트랜잭션이라 함께 롤백된다.
