# Architecture

NestJS 12 모노레포(ESM) · TypeORM 1.x(PostgreSQL) · RabbitMQ · nestjs-cls 트랜잭션 · passport-jwt · Swagger · `@nestjs/schedule` · Vitest.
설계 배경(왜 게이트웨이 + RabbitMQ + 요청 단위 SSE 인가)은 구상 문서 [Roomless MSA 구상](https://claude.ai/artifact/JzyUD3QVHa4wb2rUBcDaDX) 에 있고, 이 문서는 **지금 코드가 따르는 규칙**을 적는다. 둘이 다르면 이 문서가 맞다.

## 앱 구성

```
클라이언트(Next.js)
      │  HTTPS
      ▼
┌──────────────┐  내부 HTTP (동기)      ┌────────────────┐
│   gateway    │ ─────────────────────▶ │  user-service  │ ──▶ PostgreSQL
│  :3000       │                        │  :4001 (내부)  │
│              │  roomless.cmd (명령)   │                │
│              │ ──▶ RabbitMQ ────────▶ │ q.user.cmd     │
│              │ ◀── q.gw.result.<id> ◀ │ roomless.event │
└──────────────┘  결과 → 요청 단위 SSE   └────────────────┘
```

| 앱 | 역할 | 외부 노출 |
|---|---|---|
| `apps/gateway` | 유일한 진입점. JWT · DTO 검증, 경로 선택(동기 / 큐), 요청 단위 SSE, Swagger | O (GATEWAY_PORT) |
| `apps/user-service` | 이용자 도메인(`user`). DB(PostgreSQL) 소유, 룩업 시드 · 마이그레이션 | X (내부망, INTERNAL_API_TOKEN) |
| `apps/admin-service` | 매니저(`manager`) · 관리자(`admin`) 도메인. 공유 DB 를 직접 쓴다(마이그레이션 · 시드는 user-service 묶음) | X (내부망, INTERNAL_API_TOKEN) |
| `apps/scheduler` | crontab 전용(탈퇴 자동처리). 들어오는 연결 없음 — listen · 큐 소비 · 컨트롤러가 없고 DB 에만 붙는다 | X (연결을 받지 않음) |

- **모노레포 ≠ 모놀리스** — `nest build gateway` · `nest build user-service` · `nest build admin-service` · `nest build scheduler` 로 따로 빌드되고 독립 프로세스로 뜬다. 트래픽이 몰리는 앱만 인스턴스를 늘린다. 산출물: `dist/apps/<app>/apps/<app>/src/main.js`.
- 게이트웨이는 DB 를 쓰지 않는다. 로그인 회원의 상태도 그 그룹의 서비스(이용자 → user-service, 매니저 · 관리자 → admin-service)에 내부 HTTP 로 묻는다.
- 공유 DB 단계다. 엔티티는 [libs/database/src/entities/](../libs/database/src/entities/) 에서 소유 도메인 폴더별로 관리하고, 서비스별 DB 분리는 서비스 경계가 안정된 뒤 검토한다(그때 도메인 폴더째 담당 앱으로 옮긴다 — [data-layer.md](data-layer.md)).

## 라이브러리

| lib | 내용 | 쓰는 곳 |
|---|---|---|
| `libs/account` | 계정 공통 — `issueAccessAndRefresh`(utils/token) · SMS 인증번호 생성 · 상태 검사 · 기록 엔티티 · 본문 · 하루 한도(utils/sms-verification) · 임시 비밀번호(utils/password) · `account.constants.ts`(SMS 용도 · 한도 · 공통 메시지) | user-service · admin-service |
| `libs/common` | `ApiFailResultDto` · `toFailResult` · `CustomErrorFilter` · `validationExceptionFactory` · `PaginationDto`/`PaginationResultDto` · 순수 util(bcrypt/hash/cipher/jwt/validation/fail-result/retry/pagination/env/id/kst) · `InternalAuthGuard` · `@ClientIp` · `@InternalActor`(정의만, 사용 0) | 모든 앱 |
| `libs/contracts` | 게이트웨이↔서비스 공유 규격: 요청/응답 DTO, 명령 type · 큐 이름 · 내부 경로 상수, 메시지 봉투, `Actor`, 내부 헤더, SSE 이벤트 이름 | 모든 앱 |
| `libs/database` | `entities/<domain>/` · `entities.ts`(ENTITIES) · `migrations/` · `migrations.ts`(MIGRATIONS) · `typeorm.config.ts` · `DatabaseModule`(TypeORM + 트랜잭션, 전역) · `JobLockService`(`job-lock/`) · `isUniqueViolation`/`isForeignKeyViolation` · seeder · `data-source`(마이그레이션 실행용) | DB 소유 서비스 |
| `libs/integration` | 외부 연동 포트 `SMS_SENDER`(Amazon SNS) · `STORAGE_GATEWAY`(Amazon S3, presigned URL) · `SmsModule` · `StorageModule`(전역) — [integration.md](integration.md) · [guides/aws-setup.md](guides/aws-setup.md) | 포트를 쓰는 서비스(SMS: user-service 휴대폰 인증 · 아이디 찾기, admin-service 매니저 아이디 찾기 · 비밀번호 초기화) |
| `libs/messaging` | `RabbitMqConnection` · 명령 발행 · 결과 구독 · 명령 소비 · `@OnCommand` · `CommandDispatcher` · `MessagingModule.forGateway()/forService()`(둘 다 전역) | 게이트웨이 · 서비스 |

- import 는 `@app/<lib>/<경로>.js` (barrel 없음). 앱 · 도메인 내부는 상대경로. 라이브러리 안의 import 방식은 [conventions.md](conventions.md).
- 라이브러리 의존 방향: `messaging` → `contracts` · `common`, `common` → `contracts`, `contracts` 는 외부 패키지만, `database` → `common`(시더의 bcrypt — 첫 총관리자 비밀번호 해시 · typeorm.config 의 env 파서 `readPositiveInt`), `integration` 은 다른 lib 를 쓰지 않는다, `account` → `common` · `database`(SMS 인증 기록 엔티티). 앱끼리는 서로 import 하지 않고(0건), 게이트웨이는 `@app/database` · `@app/account` 를 쓰지 않는다.

## 전달 경로 — 동기 vs 큐

모든 외부 요청은 예외 없이 게이트웨이를 거친다. 게이트웨이가 라우트마다 경로를 고르고, 경로별로 controller 파일을 나눈다 — 동기 `controllers/<domain>.controller.ts`, 큐 `controllers/<domain>.controller.queue.ts`(서비스도 같은 이름으로 나눈다).

| 경로 | 언제 | 게이트웨이 | 서비스 | 클라이언트가 받는 것 |
|---|---|---|---|---|
| **동기** | 즉시 결과가 필요하고 몰리지 않는 요청(조회 · 로그인 · 토큰 재발급) | `InternalHttpClient.request()` | 내부 controller (`/internal/v1/...`) | 일반 JSON 응답 |
| **큐** | 상태를 바꾸는 쓰기, 버스트 · 경합 · 후속 알림이 있는 작업(가입 · 탈퇴 · 비밀번호 변경 · 이후 예약 · 사물 제어) | `CommandStreamService.dispatch()` | 큐 컨트롤러 `@OnCommand` | `text/event-stream`: accepted → done \| failed \| pending |

공개 라우트는 로그인 그룹(`t_user.login_scope`)마다 도메인 · 서비스 · 접두가 따로다 — 이용자 `/api/v1/user`(user-service, SNS 가입 · 로그인만), 매니저 `/api/v1/manager`(admin-service, 총매니저 · 매니저), 관리자 `/api/v1/admin`(admin-service, 총관리자 · 관리자). 그룹의 기능 라우트는 `/api/v1/<group>/<domain>` 이다.

| API | 경로 |
|---|---|
| `POST /api/v1/{user,manager,admin}/login` · `/token-refresh` | 동기 (`/internal/v1/user/*` → user-service, `/internal/v1/{manager,admin}/*` → admin-service) |
| `POST /api/v1/user/sign` · `DELETE · PATCH /api/v1/user/leave` · `POST /api/v1/user/phone-verification(+/confirm)` · `/find-login-id(+/confirm)` | 큐 (`user.member.*` → `q.user.cmd`) |
| `PATCH /api/v1/manager/password` · `POST /api/v1/manager/find-login-id(+/confirm)` · `/password-reset(+/confirm)` | 큐 (`admin.manager.*` → `q.admin.cmd`) |
| `PATCH /api/v1/admin/password` | 큐 (`admin.admin.password` → `q.admin.cmd`) |

그룹 표 · 그룹별 인증 가드: [api.md](api.md) "로그인 그룹(도메인) · 인증 가드".

상세 흐름 · 토폴로지 · 실패 처리: [messaging.md](messaging.md)

## 헥사고날 경계 (포트 · 어댑터)

```
 인바운드 어댑터                         아웃바운드 포트 → 어댑터
 ┌─────────────────────────┐            ┌────────────────────────────────────────┐
 │ UserController (내부HTTP)│──┐      ┌─▶│ USER_REPOSITORY → UserRepository(TypeORM)│
 │ UserQueueController (MQ) │──┴─▶ UserService                                      │
 │ (scheduler) crontabs (시간)│──────────▶│ USER_REPOSITORY (scheduler 의 repository)  │
 └─────────────────────────┘            │ (게이트웨이) COMMAND_PUBLISHER → RabbitMQ │
                                        └────────────────────────────────────────┘
```

- **인바운드 어댑터** controller(내부 HTTP · 큐)는 입력을 꺼내 service 로 위임만 한다. 로직 0.
- **crontab 은 예외** — scheduler 앱에만 두고, API 가 아니므로 service 없이 scheduler 안의 repository 포트를 직접 주입해 배치를 처리한다(대상 조회 · 엔티티 조립 · 건별 update, apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts). `@Transactional()` 없이 건별로 처리하고 건별 실패는 건너뛴다. 운영 가드(`NODE_ENV === 'production'`)와 `JobLockService` 는 아래 스케줄러 절.
- **service** 는 아웃바운드 포트(Symbol 토큰 + `import type` 인터페이스)와 프레임워크 서비스(`JwtService` — user.service.ts:43)를 안다. 전송 계층 객체(Request/Response/AMQP 채널)를 받지 않는다. 그래서 같은 `UserService.leave()` 를 HTTP · RabbitMQ 어느 쪽에서 불러도 된다.
- **아웃바운드 어댑터**(repository · publisher)만 TypeORM 쿼리 · amqplib 를 쓴다.
- 의도적으로 하지 않는 것: 순수 도메인 객체 ↔ TypeORM 엔티티 분리, DTO → 도메인 명령 재매핑, 도메인 예외 ↔ HTTP 예외 분리. service 는 TypeORM 엔티티 클래스와 Nest HTTP 예외를 직접 쓴다(매핑 코드가 두 배가 되는 비용에 비해 이 규모에서 얻는 것이 없다). HTTP 예외는 `toFailResult()` 가 전송 중립 실패로 바꾸므로 큐 경로에서도 그대로 쓸 수 있다.

## 레이어 경계 (adapter → service → repository, 단방향)

- **controller** — 라우팅 · guard · Swagger(공개만) · 위임만.
- **crontab** — 시간 트리거 · 운영 가드 · `JobLockService` · repository 포트 직접 호출.
- **service** — 비즈니스 로직 + 트랜잭션 경계(`@Transactional()`). 엔티티를 `new XEntity()` + 할당으로, WHERE 를 `FindOptionsWhere<XEntity>` 로 만들고, 규칙 위반 시 HTTP 예외 throw.
- **repository** — 유일하게 `txHost.tx`(TypeORM EntityManager)를 쓰는 곳. 모든 IO + DB 오류 변환.

## 도메인 간 데이터 접근

다른 도메인의 테이블이 필요하면 **소유 도메인의 repository 가 그 엔티티를 직접 다룬다**(service→service 호출 ❌).

- 소유 도메인은 API 경로가 정한다(`/api/v1/store/...` 면 store 도메인).
- 메서드명은 소유 도메인 어휘 — 예: `t_user` 를 다뤄도 store 에서는 `insertStaff`(예시 — 아직 코드 없음).
- 앱 간에는 서로의 DB 에 기대지 않는 방향으로 간다: 다른 서비스의 데이터가 필요하면 내부 HTTP 또는 이벤트로 받는다(공유 DB 단계에서도 다른 앱의 repository 를 import 하지 않는다).

## 모듈 · 부트스트랩

전역 모듈 — `TransportModule`(`@Global`) · `DatabaseModule`(`@Global`, `JobLockService` export) · `SmsModule` · `StorageModule`(`@Global`, `SMS_SENDER` · `STORAGE_GATEWAY` export) · `MessagingModule.forGateway()/forService()`(`global: true`, forService 는 `exports: []`). 그래서 도메인 모듈은 이것들을 import 하지 않고 주입받는다.

**gateway** — `GatewayModule` = `MessagingModule.forGateway()`(`BROKER_ACCOUNT='gateway'` · `RabbitMqConnection` · `GATEWAY_INSTANCE_ID` · `COMMAND_PUBLISHER` · `RESULT_SUBSCRIBER`) + `TransportModule`(`modules/transport`: InternalHttpClient · CommandStreamService) + `PassportJwtAuthModule`(`guards/passport.jwt.auth`, 그룹별 JWT 전략 3개) + 로그인 그룹 라우트 모듈(`UserModule` · `ManagerModule` · `AdminModule` — `api/v1/<group>`). APP_GUARD 없음(인증은 핸들러의 그룹 가드).

```
apps/gateway/src/
├── api/v1/user/            # 이용자 그룹 라우트 — controllers/(user.controller.ts 동기 · user.controller.queue.ts 큐) · user.module.ts · test/
├── api/v1/manager/         # 매니저 그룹 라우트 — controllers/(manager.controller.ts · manager.controller.queue.ts) · manager.module.ts · test/
├── api/v1/admin/           # 관리자 그룹 라우트 — controllers/(admin.controller.ts · admin.controller.queue.ts) · admin.module.ts · test/
├── guards/
│   ├── passport.jwt.auth/  # 그룹별 strategy · guard(auth=이용자 · manager · admin) · util(공통 옵션 · 회원 조회 · 401) · decorator(@PassportUser · @PassportActor) · module
│   └── roles/              # roles.guard.ts · roles.decorator.ts(@Roles — 그룹 안 권한, 사용 0)
├── modules/transport/      # internal-http.client · command-stream.service · transport.util · test/
├── config/                 # cors.config.ts(buildCorsOptions) · trust-proxy.config.ts(parseTrustProxy) · test/
├── gateway.module.ts
└── main.ts
```
`main.ts`: `dotenv/config` → trust proxy(`TRUST_PROXY`, 값이 없으면 설정하지 않음) → 전역 `CustomErrorFilter` → 전역 ValidationPipe → CORS(`CORS_ORIGINS`) → Swagger(`SWAGGER_TITLE` · `SWAGGER_PATH` 기본 `swagger`, bearer) → 종료 훅 → `listen(GATEWAY_PORT ?? 3000)`.

**user-service** — `UserServiceModule` = `DatabaseModule`(TypeORM + ClsModule `TransactionalAdapterTypeOrm`) + `MessagingModule.forService({queue: USER_COMMAND_QUEUE, binding_keys: [USER_COMMAND_BINDING], broker_user: BROKER_USER.USER_SERVICE})`(`broker_user` 필수, 큐 · 바인딩은 contracts 상수) + `UserModule` + providers `{provide: APP_GUARD, useClass: InternalAuthGuard}` · `{provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}`(반환된 예외 → 실패 응답) · `SeederService`. crontab 이 없다(scheduler).

**admin-service** — `AdminServiceModule` = `DatabaseModule`(user-service 와 같은 DB · 엔티티) + `MessagingModule.forService({queue: ADMIN_COMMAND_QUEUE, binding_keys: [ADMIN_COMMAND_BINDING], broker_user: BROKER_USER.ADMIN_SERVICE})`(`q.admin.cmd` ← `admin.#`) + `SmsModule` + `ManagerModule` · `AdminModule` + providers `{provide: APP_GUARD, useClass: InternalAuthGuard}` · `{provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}`. migrate · `SeederService` 가 없다(user-service 몫). `main.ts` 는 user-service 와 같은 모양 — `listen(ADMIN_SERVICE_PORT ?? 4002, ADMIN_SERVICE_HOST || '127.0.0.1')`.

**scheduler** — `SchedulerModule` = `DatabaseModule` + `ScheduleModule.forRoot()` + `UserModule`(crontab + scheduler 의 회원 repository). APP_GUARD · MessagingModule · 컨트롤러 · 시드가 없다.
`main.ts`: `dotenv/config` → `NestFactory.createApplicationContext(SchedulerModule)`(listen 하지 않는다) → 종료 훅. 등록된 `@Cron` 타이머가 프로세스를 살려 둔다.
`main.ts`: `dotenv/config` → 전역 필터 → 전역 ValidationPipe → 종료 훅 → `listen(USER_SERVICE_PORT ?? 4001, USER_SERVICE_HOST || '127.0.0.1')`. CORS · Swagger 없음.
`migrate.ts`(별도 진입점): `retry` 로 DB 연결을 기다린 뒤(30회 × 2초) `runMigrations` 또는 `revert` 인자면 `undoLastMigration`, 둘 다 `{transaction: 'each'}`. DataSource 설정은 앱과 같다(`synchronize: false`, 목록 테이블 `t_migration`).

**수명주기 순서** — ① `onModuleInit`: 결과 수신기 · 명령 소비자가 `connection.register(setup)`, `CommandHandlerRegistry` 가 앱 전체 provider 를 스캔 ② `onApplicationBootstrap`: RabbitMQ 연결(등록된 setup 실행) · 시드 입력 ③ `onModuleDestroy`: 브로커 연결 종료, 게이트웨이는 남은 SSE 스트림에 pending 을 쓰고 닫는다.

## 기본 데이터 시드

`SeederService`(libs/database, `OnApplicationBootstrap`)가 [seeder.targets.ts](../libs/database/src/seeder/seeder.targets.ts) 의 `SEED_TARGETS` 를 순서대로 처리한다 — PK 기준으로 없는 행만 insert(`pickMissingRows`). 대상별 실패는 경고 로그만 남기고 부팅을 막지 않는다. DB 를 소유한 서비스 한 곳에서만 등록한다.

## 스케줄러

crontab 은 scheduler 앱(`apps/scheduler`)의 도메인 `crontabs/` 폴더에 `<domain>-<feature>.crontab.ts`(`@Cron`)로 두고 도메인 모듈 providers 에 등록한다. 서비스 앱에는 `ScheduleModule` · crontab 을 두지 않는다 — 요청 처리와 배치가 같은 프로세스 · DB 연결 풀을 나눠 쓰지 않게 한다. `ScheduleModule.forRoot()` 는 scheduler 루트 모듈에 1회.
- `apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts` — `@Cron(CronExpression.EVERY_HOUR)`, 운영(`NODE_ENV === 'production'`)이 아니면 바로 return, 탈퇴 예약 경과자를 LEAVE 로 전환. 잠금 키는 파일 상수 `USER_LEAVE_CLEANUP_LOCK`.
- scheduler 도 여러 대일 수 있고(`SCHEDULER_REPLICAS`, 기본 1) 배포 중 두 대가 겹칠 수 있어 crontab 이 인스턴스마다 깨어날 수 있다. 본문은 `JobLockService.runExclusive('<domain>.<작업>', ...)`(libs/database, PostgreSQL advisory lock)로 감싸 회차마다 1대만 실행한다. 잠금은 동시 실행만 막으므로, 대상은 상태 조건으로 골라 두 번 돌아도 결과가 같게 한다.

## 서비스(user-service · admin-service)는 게이트웨이를 거친 요청만 받는다

| 수신 경로 | 막는 방법 |
|---|---|
| 내부 HTTP | ① 서비스 루트 모듈의 전역 `InternalAuthGuard`(APP_GUARD) — `x-internal-token` 이 INTERNAL_API_TOKEN 과 같아야 한다(시간차 안전 비교, 미설정이면 전부 거부) ② 바인딩 `USER_SERVICE_HOST` · `ADMIN_SERVICE_HOST` 기본 127.0.0.1 ③ Docker 에서는 포트 미공개 + gateway · 서비스 LB · 서비스 인스턴스만 있는 internal 네트워크(`roomless-service`) |
| RabbitMQ 명령 | ① 앱별 브로커 계정 — `roomless.cmd` 에 쓸 수 있는 계정은 gateway 뿐(user-service · admin-service 계정은 쓸 수 없다) ② 모든 발행 메시지에 접속 계정을 `user_id` 로 붙이고 브로커가 대조 ③ 서비스는 `user_id` 가 gateway 가 아닌 명령을 처리 · 회신 없이 DLQ 로 보낸다 |

- 관리자 계정(관리 화면)도 `user_id` 를 gateway 로 위조할 수 없다 — RabbitMQ 는 impersonator 태그가 없는 계정의 위조를 거절한다. gateway 비밀번호만 지키면 된다.
- CORS 는 브라우저만 지키는 규칙이라 서버 간 호출을 막지 못한다. 서비스에는 CORS 를 두지 않고, 게이트웨이에만 `CORS_ORIGINS`(허용할 프론트 주소, 비우면 다른 출처를 모두 차단)로 건다 — [cors.config.ts](../apps/gateway/src/config/cors.config.ts).

## 실행 (Docker) — 묶음 6개를 따로 띄운다

postgres · rabbitmq · user-service · admin-service · scheduler · gateway 는 compose 파일이 하나씩 따로 있어 각자 띄우고 내린다. gateway · user-service · admin-service 는 여러 대로 뜰 수 있고 앞에 nginx 로드밸런서가 붙는다. scheduler 는 포트 · 로드밸런서가 없다. 이미지는 [Dockerfile](../Dockerfile) 하나를 `APP` 빌드 인자로 나눠 `roomless/gateway` · `roomless/user-service` · `roomless/admin-service` · `roomless/scheduler` 를 만든다.

```bash
npm run docker:up            # 아래 1~7 을 순서대로
npm run docker:network       # 1. 공용 네트워크 4개 (이미 있으면 건너뜀)
npm run docker:postgres      # 2. compose.postgres.yml — healthy 까지 기다림
npm run docker:rabbitmq      # 3. compose.rabbitmq.yml — healthy 후 브로커 계정 초기화 1회
npm run docker:user-service  # 4. compose.user-service.yml — 마이그레이션 → 인스턴스 N대 → LB
npm run docker:admin-service # 5. compose.admin-service.yml — 매니저 · 관리자 인스턴스 N대 → LB
npm run docker:scheduler     # 6. compose.scheduler.yml — crontab 전용 인스턴스 (포트 없음)
npm run docker:gateway       # 7. compose.gateway.yml — 인스턴스 N대 → LB (:3000)
npm run docker:down          # 모두 내림 (공용 네트워크 · 볼륨은 남는다)
npm run docker:logs:gateway · docker:logs:user-service · docker:logs:admin-service · docker:logs:scheduler
```

| compose 파일 | 서비스 | 하는 일 |
|---|---|---|
| `compose.postgres.yml` | postgres | 가상 운영용 PostgreSQL 17 (127.0.0.1:5432), 볼륨 `roomless-postgres-data` — 실제 운영(RDS 등)이면 띄우지 않는다 |
| `compose.rabbitmq.yml` | rabbitmq · rabbitmq-init | 가상 운영용 RabbitMQ 4 + 관리 화면 (127.0.0.1:5672 · :15672), 브로커 계정 gateway · user-service · admin-service 와 권한 생성 ([init.sh](../docker/rabbitmq/init.sh)) |
| `compose.user-service.yml` | migrate · user-service × `USER_SERVICE_REPLICAS` · user-service-lb | 마이그레이션 1회(DB 를 최대 1분 기다림) → 인스턴스 → 내부 HTTP 로드밸런서 ([user-service.conf](../docker/nginx/user-service.conf)) |
| `compose.admin-service.yml` | admin-service × `ADMIN_SERVICE_REPLICAS`(기본 1) · admin-service-lb | 매니저 · 관리자 도메인 인스턴스 → 내부 HTTP 로드밸런서 ([admin-service.conf](../docker/nginx/admin-service.conf)). 마이그레이션은 user-service 묶음이 먼저 적용한다 |
| `compose.scheduler.yml` | scheduler × `SCHEDULER_REPLICAS`(기본 1) | crontab 전용 — `roomless-data` 네트워크만, 포트 · LB 없음. 마이그레이션은 user-service 묶음이 먼저 적용한다 |
| `compose.gateway.yml` | gateway × `GATEWAY_REPLICAS` · gateway-lb | 인스턴스 → 외부 진입점 로드밸런서, 호스트 포트 `GATEWAY_PORT` · Swagger `/swagger` ([gateway.conf](../docker/nginx/gateway.conf)) |

- 묶음끼리는 depends_on 으로 묶을 수 없어 기다림을 앱이 맡는다 — migrate 는 DB 연결을 최대 1분 재시도, user-service 는 `@nestjs/typeorm` 기본 재시도(10회 · 3초 간격, 명시 설정 없음), 앱 모두 RabbitMQ 자동 재연결(로그인 거부도 재시도). 그래도 순서는 위 1~7 을 따른다.

### 설정 — `.env` 하나가 곧 서버 설정

개발에서 쓰던 compose 파일을 그대로 운영(AWS 등)에 올린다. 운영에 맞춰 compose 를 다시 세팅하지 않고, 환경 차이는 `.env` 로만 둔다.

| 구분 | 정하는 곳 | 항목 |
|---|---|---|
| 환경 값 | `.env` 그대로 — compose 는 바꾸지 않는다. 비밀값 · 접속정보는 기본값 없이 필수(`${VAR:?}`), 비밀이 아닌 구성값만 기본값이 있다(`TRUST_PROXY:-1` · `*_REPLICAS:-2`(admin-service · scheduler `:-1`) · `GATEWAY_PORT:-3000` · 호스트 포트) | `NODE_ENV` · `DATABASE_URL` · `RABBITMQ_HOST` · `RABBITMQ_PORT` · 비밀값 · `CORS_ORIGINS` · `TRUST_PROXY` · `*_REPLICAS` |
| 서버 구성 | compose 고정 — 어느 환경이든 같다 | 컨테이너 안 포트(gateway 3000 · user-service 4001 · admin-service 4002, nginx upstream 과 짝) · `USER_SERVICE_HOST` · `ADMIN_SERVICE_HOST=0.0.0.0` · `USER_SERVICE_URL=http://user-service-lb:4001` · `ADMIN_SERVICE_URL=http://admin-service-lb:4002` · `GATEWAY_INSTANCE_ID`(빈 값 → `gw-<컨테이너 호스트명>-<pid>`) · `TZ=Asia/Seoul` |
| 쓰지 않는 비밀값 | 빈 값으로 덮어 전달하지 않는다(앱 동작과 무관) | gateway · user-service · admin-service 공통: 다른 앱의 브로커 비밀번호 · 브로커 관리자 비밀번호. 게이트웨이만: DB 주소 · DB 비밀번호 · bcrypt pepper · 토큰 암호화 키. scheduler: DB 주소 외 비밀값 전부(브로커 · JWT · 토큰 암호화 · 내부 토큰 · bcrypt · AWS · DB 관리자) |

- **가상 운영 · 실제 운영은 `.env` 의 접속정보로 고른다.** 가상 운영은 같은 서버에 postgres · rabbitmq 묶음을 띄우고 주소를 컨테이너 이름(`postgres` · `rabbitmq`)으로 둔다. 실제 운영은 두 묶음을 띄우지 않고 주소를 RDS · Amazon MQ 같은 실제 주소로 둔다(브로커에는 [init.sh](../docker/rabbitmq/init.sh) 와 같은 계정 · 권한을 만들어 둔다). user-service · gateway 묶음과 compose 파일은 그대로다.
- 컨테이너 안에서 `localhost` 는 그 컨테이너 자신이다. `.env` 의 접속 주소를 `localhost` 로 두면 Docker 에서 DB · 브로커에 닿지 않는다.
- 로컬 실행(`npm run start:*` · `db:migrate`)에서도 같은 `.env` 를 쓰려면 hosts 파일에 `127.0.0.1 postgres rabbitmq` 를 넣는다(두 묶음의 포트가 127.0.0.1 에 열려 있다).
- 운영에 올리기 전 `.env` 확인: `NODE_ENV=production`(development 는 JWT 만료를 검사하지 않는다) · 비밀값 새로 생성 · `POSTGRES_PASSWORD` · `RABBITMQ_PASSWORD` 변경 · `CORS_ORIGINS` 를 실제 프론트 주소로 · ALB 뒤면 `TRUST_PROXY=2` · `BCRYPT_CODE` 확정(가입 시작 후 바꾸면 기존 비밀번호 검증 불가).

### 로드밸런싱

| 경로 | 나누는 방법 |
|---|---|
| 클라이언트 → gateway | gateway-lb(nginx) 라운드로빈. SSE 를 바로 흘려보내도록 버퍼링을 끈다 |
| gateway → user-service 내부 HTTP | user-service-lb(nginx) 라운드로빈 |
| gateway → admin-service 내부 HTTP | admin-service-lb(nginx) 라운드로빈 |
| gateway → 서비스 명령(큐) | 같은 앱의 인스턴스들이 자기 명령 큐(`q.user.cmd` · `q.admin.cmd`)를 경쟁 소비 — 브로커가 나눠 준다 |
| user-service → gateway 결과 | 명령의 `reply_to` 인스턴스 결과 큐로만 돌아가 요청을 받은 인스턴스가 SSE 로 돌려준다 — sticky session 불필요 |
| crontab | scheduler 인스턴스가 여러 대여도 `JobLockService`(PostgreSQL advisory lock)로 회차마다 1대만 실행 |

- 인스턴스 수: `.env` 의 `GATEWAY_REPLICAS` · `USER_SERVICE_REPLICAS`(기본 2) · `ADMIN_SERVICE_REPLICAS` · `SCHEDULER_REPLICAS`(기본 1). 실행 중 변경은 `docker compose -f compose.gateway.yml up -d --scale gateway=4` — LB 가 Docker DNS 를 10초마다 다시 읽어(nginx 1.27.3+ upstream `resolve`) 재시작 없이 따라간다.
- 게이트웨이 인스턴스 ID 는 `gw-<컨테이너 호스트명>-<pid>` 로 정해진다(compose 가 `GATEWAY_INSTANCE_ID` 를 비운다, 영숫자 · `-` 외 문자는 `-` 로 바꾼다 — messaging.util.ts:52-55) — 결과 큐가 겹치지 않는다.
- 실제 클라이언트 IP: gateway-lb 가 `X-Forwarded-For` 를 붙이고 게이트웨이는 `TRUST_PROXY=1`(앞단 1단)로 읽는다 — [trust-proxy.config.ts](../apps/gateway/src/config/trust-proxy.config.ts).
- 기본 데이터 시드는 인스턴스마다 부팅 때 돈다. 빈 DB 에 동시에 뜨면 늦은 쪽은 PK 충돌 경고만 남기고 계속 뜬다(행은 먼저 넣은 쪽이 넣는다).

### 네트워크 (공용 · external)

| 네트워크 | 붙는 컨테이너 |
|---|---|
| `roomless-edge` | gateway-lb · gateway (외부 포트는 gateway-lb 만) |
| `roomless-service` (internal) | gateway · user-service-lb · user-service · admin-service-lb · admin-service |
| `roomless-broker` | rabbitmq · rabbitmq-init · gateway · user-service · admin-service |
| `roomless-data` | postgres · migrate · user-service · admin-service · scheduler |

- [docker-network.mjs](../scripts/docker-network.mjs) 가 만든다. 묶음끼리는 이 네트워크에서 서비스 이름(`postgres` · `rabbitmq` · `user-service-lb`)으로 찾는다. 한 묶음을 내려도 네트워크는 남아 나머지가 계속 돈다.
- 서비스의 HTTP 에 닿는 컨테이너는 gateway · 그 서비스의 LB 뿐이고, 게이트웨이는 DB 에 닿지 않는다.
- 이미지: Node 24 slim(bcrypt 가 glibc prebuild 만 제공), 빌드 단계에서 `nest build <APP>`, 실행 단계는 운영 의존성 + `dist/apps/<APP>` 만. `node` 사용자로 실행.
- user-service · gateway 묶음은 같은 Docker 호스트의 공용 네트워크를 전제로 한다(게이트웨이 → user-service-lb). DB · 브로커는 `.env` 의 주소라 다른 서버(RDS · Amazon MQ)여도 된다. 앱 묶음까지 서로 다른 서버에 나누려면 Swarm overlay 네트워크 · Kubernetes 로 옮긴다.

앱 코드를 고치며 개발할 때는 인프라만 컨테이너로 띄우고 앱은 로컬에서 watch 로 실행해도 된다.

```bash
npm run docker:infra          # 공용 네트워크 + postgres + rabbitmq(+계정 초기화)
npm run db:migrate            # 마이그레이션 적용
npm run start:user-service    # :4001
npm run start:admin-service   # :4002
npm run start:gateway         # :3000
```

## 새 도메인 추가 절차

1. **엔티티** — `libs/database/src/entities/<domain>/<feature>.entity.ts` + `ENTITIES` 등록 → `npm run db:generate -- <Name>` → `npm run db:check`([data-layer.md](data-layer.md)).
2. **규격** — `libs/contracts/src/<domain>/dto/*.dto.ts`(요청 · 응답 DTO), 큐 경로가 있으면 `<domain>.commands.ts`(type · 큐 이름 · 바인딩 키 · 내부 경로). 로그인 그룹의 기능이면 그 그룹 도메인(user · manager · admin)의 규격에 더하고, 라우트는 `/api/v1/<group>/<domain>`.
3. **서비스** — 담당 앱(없으면 `apps/<x>-service` 를 nest-cli.json 프로젝트로 추가) 안에 `src/<domain>/`: `service` · `repositories/` + `interfaces/` + `<domain>.symbols.ts` · `controllers/<domain>.controller.ts`(내부, 동기 경로) · `controllers/<domain>.controller.queue.ts`(`@OnCommand`, 큐 경로) · `<domain>.constants.ts` · `test/`. crontab 은 서비스가 아니라 `apps/scheduler/src/<domain>/crontabs/`(+ scheduler 의 repository)에 둔다.
4. **게이트웨이** — `apps/gateway/src/api/v1/<domain>/controllers/` 에 동기 라우트 `<domain>.controller.ts` · 큐 라우트 `<domain>.controller.queue.ts`(한 파일에 섞지 않는다) + `<domain>.module.ts`(두 controller 등록), Swagger.
5. 새 서비스 앱이면 —
   - `nest-cli.json` 프로젝트 · `apps/<x>-service/tsconfig.app.json`
   - 루트 모듈 `MessagingModule.forService({queue, binding_keys, broker_user})` + `{provide: APP_GUARD, useClass: InternalAuthGuard}`
   - `BROKER_USER` 상수(messaging.constants.ts)에 계정 추가, `docker/rabbitmq/init.sh` 에 그 계정의 권한, `compose.rabbitmq.yml` 의 rabbitmq-init 에 비밀번호 env
   - 게이트웨이 `InternalHttpClient` 의 `InternalService` 유니온 · `SERVICE_URL` 표(internal-http.client.ts:7,10)
   - `compose.<x>-service.yml` · nginx LB 설정 · `.env.example` 키
6. 테스트 — [testing.md](testing.md).
