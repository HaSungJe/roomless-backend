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
| `apps/user-service` | 회원 도메인. DB(PostgreSQL) 소유, 룩업 시드, 탈퇴 자동처리 crontab | X (내부망, INTERNAL_API_TOKEN) |

- **모노레포 ≠ 모놀리스** — `nest build gateway` · `nest build user-service` 로 따로 빌드되고 독립 프로세스로 뜬다. 트래픽이 몰리는 앱만 인스턴스를 늘린다. 산출물: `dist/apps/<app>/apps/<app>/src/main.js`.
- 게이트웨이는 DB 를 쓰지 않는다. 로그인 회원의 상태도 user-service 에 내부 HTTP 로 묻는다.
- 공유 DB 단계다. 엔티티는 [libs/database/src/entities/](../libs/database/src/entities/) 에서 소유 도메인 폴더별로 관리하고, 서비스별 DB 분리는 서비스 경계가 안정된 뒤 검토한다(그때 도메인 폴더째 담당 앱으로 옮긴다 — [data-layer.md](data-layer.md)).

## 라이브러리

| lib | 내용 | 쓰는 곳 |
|---|---|---|
| `libs/common` | `ApiFailResultDto` · `toFailResult` · `CustomErrorFilter` · `validationExceptionFactory` · 순수 util(bcrypt/hash/cipher/jwt) · `InternalAuthGuard` · `@ClientIp`/`@InternalActor` | 모든 앱 |
| `libs/contracts` | 게이트웨이↔서비스 공유 규격: 요청/응답 DTO, 명령 type · 큐 이름 · 내부 경로 상수, 메시지 봉투, `Actor`, 내부 헤더, SSE 이벤트 이름 | 모든 앱 |
| `libs/database` | `entities/<domain>/` · `migrations/` · `DatabaseModule`(TypeORM + 트랜잭션) · `isUniqueViolation`/`isForeignKeyViolation` · seeder · `data-source`(마이그레이션 실행용) | DB 소유 서비스 |
| `libs/messaging` | `RabbitMqConnection` · 명령 발행 · 결과 구독 · 명령 소비 · `@OnCommand` · `CommandDispatcher` · `MessagingModule.forGateway()/forService()` | 게이트웨이 · 서비스 |

import 는 `@app/<lib>/<경로>.js` (barrel 없음). 앱 · 도메인 내부는 상대경로.

## 전달 경로 — 동기 vs 큐

모든 외부 요청은 예외 없이 게이트웨이를 거친다. 게이트웨이가 라우트마다 경로를 고르고, 경로별로 controller 파일을 나눈다 — 동기 `<domain>.controller.ts`, 큐 `<domain>.controller.queue.ts`.

| 경로 | 언제 | 게이트웨이 | 서비스 | 클라이언트가 받는 것 |
|---|---|---|---|---|
| **동기** | 즉시 결과가 필요하고 몰리지 않는 요청(조회 · 로그인 · 토큰 재발급) | `InternalHttpClient.request()` | 내부 controller (`/internal/v1/...`) | 일반 JSON 응답 |
| **큐** | 상태를 바꾸는 쓰기, 버스트 · 경합 · 후속 알림이 있는 작업(가입 · 탈퇴 · 비밀번호 변경 · 이후 예약 · 사물 제어) | `CommandStreamService.dispatch()` | `@OnCommand` handler | `text/event-stream`: accepted → done \| failed \| pending |

회원 도메인 현황:

| API | 경로 |
|---|---|
| `POST /api/v1/user/sign` · `/general-sign` | 큐 (`user.member.sign` · `user.member.general-sign`) |
| `DELETE /api/v1/user/leave` · `PATCH /leave` · `PATCH /password` | 큐 (`user.member.leave` · `leave-cancel` · `password`) |
| `POST /api/v1/user/login` · `/general-login` · `/token-refresh` | 동기 |

상세 흐름 · 토폴로지 · 실패 처리: [messaging.md](messaging.md)

## 헥사고날 경계 (포트 · 어댑터)

```
 인바운드 어댑터                         아웃바운드 포트 → 어댑터
 ┌─────────────────────────┐            ┌────────────────────────────────────────┐
 │ UserController (내부HTTP)│──┐      ┌─▶│ USER_REPOSITORY → UserRepository(TypeORM)│
 │ UserCommandHandler (MQ)  │──┼─▶ UserService                                      │
 │ crontabs/*.crontab (시간) │──┘      └─▶│ (게이트웨이) COMMAND_PUBLISHER → RabbitMQ │
 └─────────────────────────┘            └────────────────────────────────────────┘
```

- **인바운드 어댑터**(controller · handler · crontab)는 입력을 꺼내 service 로 위임만 한다. 로직 0.
- **service** 는 아웃바운드 포트(Symbol 토큰 + `import type` 인터페이스)만 안다. 전송 계층 객체(Request/Response/AMQP 채널)를 받지 않는다. 그래서 같은 `UserService.leave()` 를 HTTP · RabbitMQ 어느 쪽에서 불러도 된다.
- **아웃바운드 어댑터**(repository · publisher)만 TypeORM 쿼리 · amqplib 를 쓴다.
- 의도적으로 하지 않는 것: 순수 도메인 객체 ↔ TypeORM 엔티티 분리, DTO → 도메인 명령 재매핑, 도메인 예외 ↔ HTTP 예외 분리. service 는 TypeORM 엔티티 클래스와 Nest HTTP 예외를 직접 쓴다(매핑 코드가 두 배가 되는 비용에 비해 이 규모에서 얻는 것이 없다). HTTP 예외는 `toFailResult()` 가 전송 중립 실패로 바꾸므로 큐 경로에서도 그대로 쓸 수 있다.

## 레이어 경계 (adapter → service → repository, 단방향)

- **controller / handler / crontab** — 라우팅 · guard · Swagger(공개만) · 위임만.
- **service** — 비즈니스 로직 + 트랜잭션 경계(`@Transactional()`). 엔티티를 `new XEntity()` + 할당으로, WHERE 를 `FindOptionsWhere<XEntity>` 로 만들고, 규칙 위반 시 HTTP 예외 throw.
- **repository** — 유일하게 `txHost.tx`(TypeORM EntityManager)를 쓰는 곳. 모든 IO + DB 오류 변환.

## 도메인 간 데이터 접근

다른 도메인의 테이블이 필요하면 **소유 도메인의 repository 가 그 엔티티를 직접 다룬다**(service→service 호출 ❌).

- 소유 도메인은 API 경로가 정한다(`/api/v1/store/...` 면 store 도메인).
- 메서드명은 소유 도메인 어휘 — `t_user` 를 다뤄도 store 에서는 `insertStaff`.
- 앱 간에는 서로의 DB 에 기대지 않는 방향으로 간다: 다른 서비스의 데이터가 필요하면 내부 HTTP 또는 이벤트로 받는다(공유 DB 단계에서도 다른 앱의 repository 를 import 하지 않는다).

## 모듈 · 부트스트랩

**gateway** — `GatewayModule` = `MessagingModule.forGateway()` + `TransportModule`(`modules/transport`, 전역: InternalHttpClient · CommandStreamService) + `PassportJwtAuthModule`(`guards/passport.jwt.auth`, JWT 전략) + 도메인 라우트 모듈(`api/v1/<domain>`).

```
apps/gateway/src/
├── api/v1/user/            # 공개 라우트 — user.controller.ts(동기) · user.controller.queue.ts(큐) · user.module.ts · test/
├── guards/
│   ├── passport.jwt.auth/  # guard · strategy · decorator(@PassportUser · @PassportActor) · module
│   └── roles/              # roles.guard.ts · roles.decorator.ts(@Roles)
├── modules/transport/      # internal-http.client · command-stream.service · transport.util · test/
├── gateway.module.ts
└── main.ts
```
`main.ts`: `dotenv/config` → 전역 `CustomErrorFilter` → 전역 ValidationPipe → CORS → Swagger(`/swagger`) → 종료 훅 → listen.

**user-service** — `UserServiceModule` = `DatabaseModule`(TypeORM + ClsModule `TransactionalAdapterTypeOrm`) + `ScheduleModule.forRoot()` + `MessagingModule.forService({queue: 'q.user.cmd', binding_keys: ['user.#']})` + `UserModule` + `SeederService`. 별도 진입점 `migrate.ts` 는 마이그레이션 실행기다.
`main.ts`: `dotenv/config` → 전역 필터 → 전역 ValidationPipe → 종료 훅 → listen(내부망).

## 기본 데이터 시드

`SeederService`(libs/database, `OnApplicationBootstrap`)가 [seeder.targets.ts](../libs/database/src/seeder/seeder.targets.ts) 의 `SEED_TARGETS` 를 순서대로 처리한다 — PK 기준으로 없는 행만 insert(`pickMissingRows`). 대상별 실패는 경고 로그만 남기고 부팅을 막지 않는다. DB 를 소유한 서비스 한 곳에서만 등록한다.

## 스케줄러

도메인 안 `crontabs/` 폴더에 `<domain>-<feature>.crontab.ts`(`@Cron`)를 두고 도메인 모듈 providers 에 등록한다. `ScheduleModule.forRoot()` 는 앱 루트 모듈에 1회.
- `user/crontabs/user-leave-cleanup.crontab.ts` — 매시간, 운영(`NODE_ENV=production`)에서만 탈퇴 예약 경과자를 LEAVE 로 전환.
- user-service 는 여러 대로 뜨므로 crontab 도 인스턴스마다 깨어난다. 본문은 `JobLockService.runExclusive('<domain>.<작업>', ...)`(libs/database, PostgreSQL advisory lock)로 감싸 회차마다 1대만 실행한다. 잠금은 동시 실행만 막으므로, 대상은 상태 조건으로 골라 두 번 돌아도 결과가 같게 한다.

## user-service 는 게이트웨이를 거친 요청만 받는다

| 수신 경로 | 막는 방법 |
|---|---|
| 내부 HTTP | ① 서비스 루트 모듈의 전역 `InternalAuthGuard`(APP_GUARD) — `x-internal-token` 이 INTERNAL_API_TOKEN 과 같아야 한다(시간차 안전 비교, 미설정이면 전부 거부) ② 바인딩 `USER_SERVICE_HOST` 기본 127.0.0.1 ③ Docker 에서는 포트 미공개 + gateway · user-service-lb 만 있는 internal 네트워크(`roomless-service`) |
| RabbitMQ 명령 | ① 앱별 브로커 계정 — `roomless.cmd` 에 쓸 수 있는 계정은 gateway 뿐(user-service 계정은 쓸 수 없다) ② 모든 발행 메시지에 접속 계정을 `user_id` 로 붙이고 브로커가 대조 ③ 서비스는 `user_id` 가 gateway 가 아닌 명령을 처리 · 회신 없이 DLQ 로 보낸다 |

- 관리자 계정(관리 화면)도 `user_id` 를 gateway 로 위조할 수 없다 — RabbitMQ 는 impersonator 태그가 없는 계정의 위조를 거절한다. gateway 비밀번호만 지키면 된다.
- CORS 는 브라우저만 지키는 규칙이라 서버 간 호출을 막지 못한다. 서비스에는 CORS 를 두지 않고, 게이트웨이에만 `CORS_ORIGINS`(허용할 프론트 주소, 비우면 다른 출처를 모두 차단)로 건다 — [cors.config.ts](../apps/gateway/src/config/cors.config.ts).

## 실행 (Docker) — 묶음 4개를 따로 띄운다

postgres · rabbitmq · user-service · gateway 는 compose 파일이 하나씩 따로 있어 각자 띄우고 내린다. gateway · user-service 는 여러 대로 뜨고 앞에 nginx 로드밸런서가 붙는다. 이미지는 [Dockerfile](../Dockerfile) 하나를 `APP` 빌드 인자로 나눠 `roomless/gateway` · `roomless/user-service` 를 만든다.

```bash
npm run docker:up            # 아래 1~5 를 순서대로
npm run docker:network       # 1. 공용 네트워크 4개 (이미 있으면 건너뜀)
npm run docker:postgres      # 2. compose.postgres.yml — healthy 까지 기다림
npm run docker:rabbitmq      # 3. compose.rabbitmq.yml — healthy 후 브로커 계정 초기화 1회
npm run docker:user-service  # 4. compose.user-service.yml — 마이그레이션 → 인스턴스 N대 → LB
npm run docker:gateway       # 5. compose.gateway.yml — 인스턴스 N대 → LB (:3000)
npm run docker:down          # 모두 내림 (공용 네트워크 · 볼륨은 남는다)
npm run docker:logs:gateway · docker:logs:user-service
```

| compose 파일 | 서비스 | 하는 일 |
|---|---|---|
| `compose.postgres.yml` | postgres | 가상 운영용 PostgreSQL 17 (127.0.0.1:5432), 볼륨 `roomless-postgres-data` — 실제 운영(RDS 등)이면 띄우지 않는다 |
| `compose.rabbitmq.yml` | rabbitmq · rabbitmq-init | 가상 운영용 RabbitMQ 4 + 관리 화면 (127.0.0.1:5672 · :15672), 브로커 계정 gateway · user-service 와 권한 생성 ([init.sh](../docker/rabbitmq/init.sh)) |
| `compose.user-service.yml` | migrate · user-service × `USER_SERVICE_REPLICAS` · user-service-lb | 마이그레이션 1회(DB 를 최대 1분 기다림) → 인스턴스 → 내부 HTTP 로드밸런서 ([user-service.conf](../docker/nginx/user-service.conf)) |
| `compose.gateway.yml` | gateway × `GATEWAY_REPLICAS` · gateway-lb | 인스턴스 → 외부 진입점 로드밸런서, 호스트 포트 `GATEWAY_PORT` · Swagger `/swagger` ([gateway.conf](../docker/nginx/gateway.conf)) |

- 묶음끼리는 depends_on 으로 묶을 수 없어 기다림을 앱이 맡는다 — migrate 는 DB 연결을 최대 1분 재시도, user-service 는 TypeORM 연결 재시도, 두 앱 모두 RabbitMQ 자동 재연결(로그인 거부도 재시도). 그래도 순서는 위 1~5 를 따른다.

### 설정 — `.env` 하나가 곧 서버 설정

개발에서 쓰던 compose 파일을 그대로 운영(AWS 등)에 올린다. 운영에 맞춰 compose 를 다시 세팅하지 않고, 환경 차이는 `.env` 로만 둔다.

| 구분 | 정하는 곳 | 항목 |
|---|---|---|
| 환경 값 | `.env` 그대로 — compose 는 바꾸지 않고, 필수값이 비면 띄우지 않는다(`${VAR:?}`) | `NODE_ENV` · `DATABASE_URL` · `RABBITMQ_HOST` · `RABBITMQ_PORT` · 비밀값 · `CORS_ORIGINS` · `TRUST_PROXY` · `*_REPLICAS` |
| 서버 구성 | compose 고정 — 어느 환경이든 같다 | 컨테이너 안 포트(gateway 3000 · user-service 4001, nginx upstream 과 짝) · `USER_SERVICE_HOST=0.0.0.0` · `USER_SERVICE_URL=http://user-service-lb:4001` · `GATEWAY_INSTANCE_ID`(빈 값 → 컨테이너 호스트명) · `TZ=Asia/Seoul` |
| 쓰지 않는 비밀값 | 빈 값으로 덮어 전달하지 않는다(앱 동작과 무관) | 게이트웨이의 DB 주소 · 암호화 키, 다른 앱의 브로커 비밀번호, 브로커 관리자 비밀번호 |

- **가상 운영 · 실제 운영은 `.env` 의 접속정보로 고른다.** 가상 운영은 같은 서버에 postgres · rabbitmq 묶음을 띄우고 주소를 컨테이너 이름(`postgres` · `rabbitmq`)으로 둔다. 실제 운영은 두 묶음을 띄우지 않고 주소를 RDS · Amazon MQ 같은 실제 주소로 둔다(브로커에는 [init.sh](../docker/rabbitmq/init.sh) 와 같은 계정 · 권한을 만들어 둔다). user-service · gateway 묶음과 compose 파일은 그대로다.
- 컨테이너 안에서 `localhost` 는 그 컨테이너 자신이다. `.env` 의 접속 주소를 `localhost` 로 두면 Docker 에서 DB · 브로커에 닿지 않는다.
- 로컬 실행(`npm run start:*` · `db:migrate`)에서도 같은 `.env` 를 쓰려면 hosts 파일에 `127.0.0.1 postgres rabbitmq` 를 넣는다(두 묶음의 포트가 127.0.0.1 에 열려 있다).
- 운영에 올리기 전 `.env` 확인: `NODE_ENV=production`(development 는 JWT 만료를 검사하지 않는다) · 비밀값 새로 생성 · `POSTGRES_PASSWORD` · `RABBITMQ_PASSWORD` 변경 · `CORS_ORIGINS` 를 실제 프론트 주소로 · ALB 뒤면 `TRUST_PROXY=2` · `BCRYPT_CODE` 확정(가입 시작 후 바꾸면 기존 비밀번호 검증 불가).

### 로드밸런싱

| 경로 | 나누는 방법 |
|---|---|
| 클라이언트 → gateway | gateway-lb(nginx) 라운드로빈. SSE 를 바로 흘려보내도록 버퍼링을 끈다 |
| gateway → user-service 내부 HTTP | user-service-lb(nginx) 라운드로빈 |
| gateway → user-service 명령(큐) | 모든 user-service 가 `q.user.cmd` 를 경쟁 소비 — 브로커가 나눠 준다 |
| user-service → gateway 결과 | 명령의 `reply_to` 인스턴스 결과 큐로만 돌아가 요청을 받은 인스턴스가 SSE 로 돌려준다 — sticky session 불필요 |
| crontab | 모든 인스턴스가 깨어나지만 `JobLockService`(PostgreSQL advisory lock)로 회차마다 1대만 실행 |

- 인스턴스 수: `.env` 의 `GATEWAY_REPLICAS` · `USER_SERVICE_REPLICAS`(기본 2). 실행 중 변경은 `docker compose -f compose.gateway.yml up -d --scale gateway=4` — LB 가 Docker DNS 를 10초마다 다시 읽어(nginx 1.27.3+ upstream `resolve`) 재시작 없이 따라간다.
- 게이트웨이 인스턴스 ID 는 컨테이너 호스트명으로 정해진다(compose 가 `GATEWAY_INSTANCE_ID` 를 비운다) — 결과 큐가 겹치지 않는다.
- 실제 클라이언트 IP: gateway-lb 가 `X-Forwarded-For` 를 붙이고 게이트웨이는 `TRUST_PROXY=1`(앞단 1단)로 읽는다 — [trust-proxy.config.ts](../apps/gateway/src/config/trust-proxy.config.ts).
- 기본 데이터 시드는 인스턴스마다 부팅 때 돈다. 빈 DB 에 동시에 뜨면 늦은 쪽은 PK 충돌 경고만 남기고 계속 뜬다(행은 먼저 넣은 쪽이 넣는다).

### 네트워크 (공용 · external)

| 네트워크 | 붙는 컨테이너 |
|---|---|
| `roomless-edge` | gateway-lb · gateway (외부 포트는 gateway-lb 만) |
| `roomless-service` (internal) | gateway · user-service-lb · user-service |
| `roomless-broker` | rabbitmq · rabbitmq-init · gateway · user-service |
| `roomless-data` | postgres · migrate · user-service |

- [docker-network.mjs](../scripts/docker-network.mjs) 가 만든다. 묶음끼리는 이 네트워크에서 서비스 이름(`postgres` · `rabbitmq` · `user-service-lb`)으로 찾는다. 한 묶음을 내려도 네트워크는 남아 나머지가 계속 돈다.
- user-service 의 HTTP 에 닿는 컨테이너는 gateway · user-service-lb 뿐이고, 게이트웨이는 DB 에 닿지 않는다.
- 이미지: Node 24 slim(bcrypt 가 glibc prebuild 만 제공), 빌드 단계에서 `nest build <APP>`, 실행 단계는 운영 의존성 + `dist/apps/<APP>` 만. `node` 사용자로 실행.
- user-service · gateway 묶음은 같은 Docker 호스트의 공용 네트워크를 전제로 한다(게이트웨이 → user-service-lb). DB · 브로커는 `.env` 의 주소라 다른 서버(RDS · Amazon MQ)여도 된다. 앱 묶음까지 서로 다른 서버에 나누려면 Swarm overlay 네트워크 · Kubernetes 로 옮긴다.

앱 코드를 고치며 개발할 때는 인프라만 컨테이너로 띄우고 앱은 로컬에서 watch 로 실행해도 된다.

```bash
npm run docker:infra          # 공용 네트워크 + postgres + rabbitmq(+계정 초기화)
npm run db:migrate            # 마이그레이션 적용
npm run start:user-service    # :4001
npm run start:gateway         # :3000
```

## 새 도메인 추가 절차

1. **엔티티** — `libs/database/src/entities/<domain>/<feature>.entity.ts` + `ENTITIES` 등록 → `npm run db:generate -- <Name>` → `npm run db:check`([data-layer.md](data-layer.md)).
2. **규격** — `libs/contracts/src/<domain>/dto/*.dto.ts`(요청 · 응답 DTO), 큐 경로가 있으면 `<domain>.commands.ts`(type · 큐 이름 · 바인딩 키 · 내부 경로).
3. **서비스** — 담당 앱(없으면 `apps/<x>-service` 를 nest-cli.json 프로젝트로 추가) 안에 `src/<domain>/`: `service` · `repositories/` + `interfaces/` + `<domain>.symbols.ts` · `controller`(내부, 동기 경로) · `handler`(`@OnCommand`, 큐 경로) · `crontabs/` · `test/`.
4. **게이트웨이** — `apps/gateway/src/api/v1/<domain>/` 에 동기 라우트 `<domain>.controller.ts` · 큐 라우트 `<domain>.controller.queue.ts`(한 파일에 섞지 않는다) + `<domain>.module.ts`(두 controller 등록), Swagger.
5. 새 서비스 앱이면 `MessagingModule.forService({queue, binding_keys})` 와 InternalHttpClient 의 `SERVICE_URL` 표에 추가.
6. 테스트 — [testing.md](testing.md).
