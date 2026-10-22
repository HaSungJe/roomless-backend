# AGENTS.md

roomless-backend — 무인 객실 대여 서비스 백엔드. 규칙은 지금 코드를 실측한 것이고(근거는 `docs/` 의 path:line), 코드가 없는 영역은 "미적용 규약" 으로 표시한다.

## 개발 로드맵

전체 개발 순서와 진척도는 Beaver 로드맵 [.beaver/output/roadmap/roomless-roadmap.md](.beaver/output/roadmap/roomless-roadmap.md) 에서 관리한다(화면은 같은 폴더의 `roomless-roadmap.html`). 역할(총관리자 = 입점 승인 · 업체 · 이용자 관리 / 업체 총관리자 · 업체 관리자 = 자기 업체의 객실 · 운영 관리 / 이용자 = 검색 · 예약 · 이용)과 횡단 결정사항의 기준점이다.

## ⚠️ 주의사항

- **서버 · 인프라 기동은 반드시 사용자가 직접 실행** — `npm run start:*` / `nest start` / `npm run docker:*`(network · postgres · rabbitmq · user-service · scheduler · gateway · infra · up — `docker compose up` · `docker network create`) 를 Claude 가 실행하지 않는다. `docker compose config` 검증 · `docker build` 는 해도 된다(컨테이너를 띄우지 않음).
- **DB 마이그레이션 적용 · 배포는 사용자 몫** — `npm run db:migrate` · `db:revert` 와 Docker 의 migrate 컨테이너는 실제 DB 를 바꾸므로 Claude 가 실행하지 않는다. 운영 반영도 사용자 몫이다. 엔티티(`libs/database/src/entities/**`)를 바꾸면 Claude 는 엔티티 수정 + 마이그레이션 파일 생성(`npm run db:generate -- <Name>` — DB 없이 PGlite 로 계산) + `npm run db:check` 까지만 한다([docs/data-layer.md](docs/data-layer.md) 마이그레이션 절).
- **스키마 반영을 구현 차단 조건으로 걸지 않는다** — 기획의 사전 조건(Prerequisites)에 "DB 스키마 반영" 을 build 를 막는 항목으로 두지 않는다. build · 테스트는 DB 없이 통과하므로 막을 이유가 없다.
- 예외 — Claude 가 Bash 로 직접 실행해 검증한다: `npm test` · `npm run typecheck` · `npm run build` · `npm run lint` · `npm run db:check` · `npm run db:generate`.
- **`.back/` 은 NestJS 11 + TypeORM 0.3 시절 코드 보관소** — 참고만 한다. 수정 · import 금지(tsconfig · Vitest 에서 제외돼 있다). git 에서도 제외(`.gitignore` 의 `.back`)된 로컬 전용 폴더라 다른 PC 에는 없다 — 원본은 커밋 e108425 까지의 기록에 남아 있다.
- **README.md 는 변경마다 같이 갱신한다** — 코드 · 설정 · 구조 · 명령 · 실행 방법 · 외부 연동이 바뀌는 작업은 README.md 도 같은 변경에서 고친다(같은 커밋). 기획 문서(plan 파일 목록 · report)에도 README.md 를 적는다.

## 커밋 메시지

- **형식(커밋 · 커밋+푸쉬 모두, 항상)**: `YYYY.MM.DD` 날짜 줄 → 빈 줄 1개 → `-작업내용` 목록.
- **트레일러(`Co-Authored-By: Claude ...` 등)는 절대 붙이지 않는다** — 메시지는 날짜 + 목록만.
  ```
  2026.07.20

  -작업내용 1
  -작업내용 2
  ```

## Architecture

NestJS 12 **모노레포**(ESM, `"type": "module"`) + TypeORM 1.x(PostgreSQL, pg) + RabbitMQ(amqplib 2) + nestjs-cls 트랜잭션 + passport-jwt + Swagger + `@nestjs/schedule` + Vitest 4. 다국어(i18n) 없음 — 모든 사용자 노출 메시지는 한국어 리터럴.

```
apps/
├── gateway/src/
│   ├── api/v1/<service>/<domain>/  # 공개 라우트 — user-service/user · admin-service/{manager,admin}. controllers/<domain>.controller.ts(동기 · 내부 HTTP) · controllers/<domain>.controller.queue.ts(큐 · RabbitMQ + 요청 단위 SSE)
│   ├── guards/               # passport.jwt.auth(로그인 그룹별 JWT 전략 · 가드 — jwt-user · jwt-manager · jwt-admin) · roles(그룹 안 권한 — 미적용)
│   ├── modules/transport/    # InternalHttpClient · CommandStreamService
│   └── config/               # cors.config.ts · trust-proxy.config.ts
├── user-service/src/        # 이용자 서버 — DB 소유(마이그레이션 · 시드)
│   ├── user/                 # 이용자 도메인: controllers/(user.controller.ts 내부 HTTP · user.controller.queue.ts RabbitMQ) → UserService
│   └── migrate.ts            # 마이그레이션 실행기
├── admin-service/src/       # 관리자 서버 — 공유 DB 직접(마이그레이션 · 시드 없음)
│   ├── manager/              # 매니저 도메인(총매니저 · 매니저): controllers/ → ManagerService
│   └── admin/                # 관리자 도메인(총관리자 · 관리자): controllers/ → AdminService
└── scheduler/src/            # crontab 전용 — 들어오는 연결 없음(listen · 큐 소비 · 컨트롤러 없음), DB 직접
    └── user/                 # crontabs/(탈퇴 자동처리) → repository 직접
libs/
├── account/      # 계정 공통(user-service · admin-service): 토큰 발급 · SMS 인증 · 임시 비밀번호 util, 계정 상수 · 메시지
├── common/       # 실패 응답 DTO · toFailResult · 예외 필터 · 반환된 예외 인터셉터 · ValidationPipe 팩토리 · 순수 util · 내부 요청 가드
├── contracts/    # 게이트웨이↔서비스 공유 규격: 요청/응답 DTO, 명령 type · 큐 · 바인딩 · 내부 HTTP 경로 상수, 메시지 봉투, Actor, 내부 헤더, SSE 이벤트
├── database/     # entities/<domain>/ · entities.ts · migrations/ · migrations.ts · DatabaseModule · JobLockService · typeorm-error · seeder
├── integration/  # 외부 연동 포트 — SMS 발송(SMS_SENDER · Amazon SNS) · 파일 저장(STORAGE_GATEWAY · S3) · SmsModule · StorageModule(전역)
└── messaging/    # RabbitMQ 연결 · 발행 · 소비 · @OnCommand · CommandDispatcher
scripts/          # db-schema.mjs(마이그레이션 생성 · 검사) · docker-network.mjs · check-broker-acl.mjs
```

- **모노레포 ≠ 모놀리스**: 앱마다 `nest build <app>` 으로 따로 빌드 · 배포 · 확장한다. 공유 코드는 libs 한 곳에서 import. 앱끼리는 서로 import 하지 않는다.
- **두 전달 경로**: 즉시 끝나는 요청(조회 · 로그인 · 토큰 재발급 · 게이트웨이 인증 조회)은 게이트웨이 → 서비스 **내부 HTTP**(동기), 상태를 바꾸는 쓰기는 **RabbitMQ 명령 → 결과 이벤트 → 요청 단위 SSE**. 어느 라우트가 어느 경로인지는 게이트웨이 controller 파일로 정한다.
- **헥사고날 경계(포트·어댑터)**: 인바운드 어댑터 controller(내부 HTTP · 큐 `@OnCommand`)는 service 로 위임만 하고, service 는 아웃바운드 포트(repository · 외부 연동 인터페이스 Symbol 토큰)와 프레임워크 서비스(`JwtService`)만 안다. 같은 service 를 HTTP 와 RabbitMQ 양쪽에서 부른다. **crontab 은 예외** — API 가 아니므로 service 를 거치지 않고 repository 포트를 직접 쓴다. crontab 은 **scheduler 앱에만** 두고(서비스 앱에는 `ScheduleModule` · `crontabs/` 없음), 그 데이터 접근은 scheduler 안의 도메인 repository 다(공유 DB — 같은 엔티티). 폴더 배치(api · guards · modules · config)는 헥사고날과 무관한 정리 기준이다. 순수 도메인 객체 분리(클린 아키텍처)는 하지 않는다.
- 레이어: **controller → service → repository**, **crontab → repository**, 단방향. repository 만 TypeORM(`txHost.tx`)을 쓴다.
- **엔티티는 `libs/database/src/entities/<domain>/`** — 공유 DB 단계라 여러 앱이 같은 엔티티를 쓰므로 앱이 아니라 공용 라이브러리 안의 소유 도메인 폴더에 둔다.
- **도메인 간 데이터 접근**: 다른 도메인 테이블이 필요하면 소유 도메인의 repository 가 그 엔티티를 직접 다룬다(service→service ❌). 메서드명은 소유 도메인 어휘(예: `t_user` 를 다뤄도 store 에서는 `insertStaff`).

→ 상세(앱 구성 · 경로 선택 · 모듈 · 부트스트랩 · 수명주기 · 새 도메인 절차): [docs/architecture.md](docs/architecture.md) · 메시징: [docs/messaging.md](docs/messaging.md)

## Conventions

- **ESM**: 상대 · alias import 는 **`.js` 확장자 필수**(`./user.service.js`, `@app/common/utils/jwt.js`). 패키지 import 는 확장자 없음 — 단, exports 맵 없는 패키지 하위 경로를 깊게 가져오면 `.js`(`dayjs/plugin/customParseFormat.js`). Node 내장은 `node:` 접두. 타입만 쓰는 import 는 `import type`. CJS 패키지는 default import(`import bcrypt from 'bcrypt'`). `__dirname`/`require` ❌.
- **Import alias**: 앱 간 공유는 `@app/<lib>/<경로>.js`(`@app/common` · `@app/contracts` · `@app/database` · `@app/integration` · `@app/messaging`). 앱 · 도메인 내부는 상대경로. 라이브러리 안은 현재 혼재(`libs/common` 만 자기 alias) — 그 라이브러리의 기존 방식을 따른다. barrel(`index.ts`) 없음.
- **게이트웨이 폴더**: 공개 라우트는 `src/api/v1/<service>/<domain>/`(경로와 같은 모양 — `api/v1/user-service/user/` · `api/v1/admin-service/manager/`, controller 는 `controllers/`). 가드 `src/guards/<guard>/`, 인프라 `src/modules/<module>/`, 부트스트랩 설정 함수 `src/config/`.
- **controller 는 `controllers/` 폴더 · 전달 경로별 2파일 (게이트웨이 · 서비스 공통)**: 동기(내부 HTTP) 라우트는 `controllers/<domain>.controller.ts` 의 `<Domain>Controller`, 큐(RabbitMQ) 라우트는 `controllers/<domain>.controller.queue.ts` 의 `<Domain>QueueController`. **한 파일에 두 경로를 섞지 않고, controller 를 `controllers/` 밖에 두지 않는다.**
  - 게이트웨이(`src/api/v1/<service>/<domain>/controllers/`): 동기는 `InternalHttpClient` 만, 큐(요청 단위 SSE)는 `CommandStreamService` 만 주입한다. 둘 다 같은 `@ApiTags` · `@Controller('/api/v1/<service>/<domain>')` 를 쓰고, 도메인 모듈 `controllers` 에 `[동기, 큐]` 순으로 등록한다. 테스트는 도메인 폴더 `test/<domain>.controller.spec.ts` · `test/<domain>.controller.queue.spec.ts` 로 나누고, 다른 경로의 라우트가 404 인지 단언한다.
  - 서비스(`src/<domain>/controllers/`): 동기는 `@Controller('/internal/v1/<service>/<domain>')`(도메인 모듈 `controllers` 에 등록), 큐는 `@Injectable` + `@OnCommand` 메서드를 가진 provider 다 — HTTP 컨트롤러가 아니므로 도메인 모듈 `providers` 에 등록한다(`CommandHandlerRegistry` 가 provider 를 스캔한다). 테스트는 도메인 폴더 `test/` 의 기능별 spec 이 두 경로를 부팅해 지난다.
- **파일명**: 도메인 레이어 `<domain>.<role>.ts`(`controllers/user.controller.ts`, `controllers/user.controller.queue.ts`, `user.service.ts`, `user.constants.ts`, `user.symbols.ts`), 인프라 · 라이브러리 `<kebab-이름>.<role>.ts`(`internal-http.client.ts`, `command.dispatcher.ts`), 전역 util `utils/<이름>.ts`, DTO kebab `<domain>-<feature>.dto.ts`, 엔티티 kebab `<feature>.entity.ts`, crontab `<domain>-<feature>.crontab.ts`. 클래스 `<Domain><Feature><Role>`(큐 컨트롤러 `<Domain>QueueController` — 게이트웨이 · 서비스 공통) — 응답은 항상 `ResultDto`(❌ `ResponseDto`).
- **DTO 는 `libs/contracts/src/<domain>/dto/`** — 게이트웨이(검증)와 서비스(타입)가 같은 클래스를 쓴다. 기능당 DTO 1개, 모양 같아도 독립 선언. void 기능은 ResultDto 없음.
- **규격 상수는 `libs/contracts/src/<domain>/<domain>.commands.ts`** — 명령 type(`<server>.<resource>.<action-kebab>` — server 는 서비스 앱: user-service `user.*`, admin-service `admin.*`) · 큐 이름 · 바인딩 키 · 내부 HTTP 경로(`USER_INTERNAL_PATH` · `MANAGER_INTERNAL_PATH` · `ADMIN_INTERNAL_PATH`). 게이트웨이는 경로 문자열을 직접 쓰지 않는다. 권한 · 로그인 그룹 값은 도메인 공통이라 `libs/contracts/src/roles.ts` 의 `AUTH_ID` · `LOGIN_SCOPE`.
- **DI 토큰**: `<domain>.symbols.ts` 의 `Symbol('<Interface 이름>')`(`USER_REPOSITORY = Symbol('UserRepositoryInterface')`). 값 주입 토큰(`GATEWAY_INSTANCE_ID` · `BROKER_ACCOUNT` · `COMMAND_CONSUMER_OPTIONS`)도 Symbol.
- **snake_case 전 레이어 통일**: 밖(HTTP · 메시지 · DB · 토큰)으로 나가는 키 — DTO 필드 · entity 컬럼 · path/query param · JWT payload · 메시지 봉투 · 실패 본문(`validation_errors`) · util 옵션 객체 키 — 는 모두 snake_case. camelCase 는 코드 안 이름만: 함수 · util 함수명, repository private getter(`users`), 밖으로 나가지 않는 util 내부 반환 타입 필드(`AccessRefreshSet`).
- **라우트**: 공개 `/api/v1/<service>/<domain>/<action>` · 내부 `/internal/v1/<service>/<domain>/<action>` — service 는 서비스 앱(`user-service` · `admin-service`), domain 은 그 앱의 도메인 폴더. 로그인 그룹은 경로가 아니라 게이트웨이 가드로 가른다(예: `/api/v1/admin-service/manager/login` → `/internal/v1/admin-service/manager/login`, 객실 관리는 `/api/v1/admin-service/room` + 매니저 가드). 게이트웨이 `@Controller('/api/v1/<service>/<domain>')`, 서비스 `@Controller('/internal/v1/<service>/<domain>')`. 핸들러 앞 `/` + 다단어 kebab, snake path param.
- **컨트롤러 입력은 항상 DTO 타입**(`any`·`@Param('key')` 금지), 파라미터 한 줄, 본문 위임 한 줄. 큐 핸들러 시그니처 세 형태(인증 + 입력 / 비인증 `actor: null` / 입력 없음 `payload: {}`) · 서비스 내부 핸들러의 `@ClientIp()` — [docs/conventions.md](docs/conventions.md).
- 코드 스타일: Prettier(4칸, 200자, `bracketSpacing: false`) + oxlint.

→ 상세(명명 · 입력 · 메시지 상수 · 로깅 · 금지 형식): [docs/conventions.md](docs/conventions.md)

## 서비스(비즈니스) 계층 규칙

- **public 메서드 1개 = API(또는 명령) 1개**. crontab 은 service 가 아니라 인바운드 어댑터다(도메인 `crontabs/` 폴더) — service 에 배치용 메서드를 만들지 않는다.
- **로그인 그룹은 도메인이다** — 이용자(user) · 매니저(manager) · 관리자(admin)는 각자 controller · service · repository · DTO · 명령 · 내부 경로를 갖는다. 같은 일(로그인 · 재발급 · 비밀번호 변경)도 도메인마다 자기 service 메서드로 두고, 공통 순수 로직은 `libs/account` util 로 뺀다(service 끼리 · 앱끼리 부르지 않는다).
- **service 내부 private 헬퍼 금지**(0건) — 재사용 · 순수 변환은 `<domain>.util.ts`(도메인) 또는 `libs/common/src/utils/`(전역)로 추출.
- service 는 `new XEntity()`+필드 할당으로 엔티티를 만들고(객체 리터럴 ❌), WHERE 는 `FindOptionsWhere<XEntity>`(`In` · `LessThanOrEqual` 등)로 만들어 repository 를 인터페이스 토큰으로 호출하며, 규칙 위반 시 HTTP 예외 throw.
- **쓰기가 있는 메서드에 `@Transactional()`**(`@nestjs-cls/transactional`) — 세션을 insert 하는 로그인 · 토큰 재발급 포함. 큐 경로에서도 HTTP 예외를 그대로 던지면 failed 결과로 바뀐다.
- **커밋해야 하는 실패는 return**: 쓰기를 커밋한 채 실패를 알려야 할 때만(인증번호 불일치 — 시도 횟수를 남겨야 함) 예외를 throw 하지 않고 **return** 한다 — 큐 경로는 `CommandDispatcher`, 내부 HTTP 는 전역 `ReturnedExceptionInterceptor` 가 같은 실패 본문으로 바꾸고, 이미 커밋된 실패라 상태 코드와 무관하게 재시도하지 않는다. 그 밖의 실패는 throw → 롤백. 반환 타입은 `Promise<T | BadRequestException>`(user.service.ts `confirmPhoneVerification` 등).
- service 는 `Request`/`Response`/AMQP 채널 같은 전송 계층 객체를 받지 않고 값만 받는다.
- service 메서드 JSDoc 에 전송 경로를 적는다 — `(RabbitMQ: <type>)` / `(내부 HTTP: <METHOD> <path>)`.

## 공통 로직 분리

- **순수 함수(stateless) → util**: 전역 `libs/common/src/utils/*.ts`(`bcrypt` · `hash` · `cipher` · `jwt` · `validation` · `fail-result` · `retry` · `pagination` · `env` · `id` · `kst`), 서비스 앱 여러 개가 쓰는 계정 로직 `libs/account/src/utils/*.ts`(`token` · `sms-verification` · `password`, 상수 · 공통 메시지는 `account.constants.ts`), 도메인 전용 `apps/<app>/src/<domain>/<domain>.util.ts`, 인프라 모듈 전용 `<module>.util.ts`. `@Injectable` 없이 named `function` export — `pagination.ts` 의 `Pagination` 만 계산 결과를 들고 다니는 값 객체라 class 다. 파일 전용 헬퍼(export 안 함)는 인프라 · util 파일에만.
- **DI/lifecycle/외부연동 → `@Module`/`@Injectable`**: 여러 앱이 쓰는 인프라는 `libs/`, 앱 전용은 그 앱 안(`src/modules/`).
- **로깅**: 인프라 클래스만 `private readonly logger = new Logger(X.name)`. 도메인 계층(service · repository · crontab · controller)은 로그를 남기지 않는다. `console.*` 금지.

## Validation

- `class-validator` 데코레이터. 사용: `@IsNotEmpty`/`@IsOptional`/`@IsIn`/`@Matches`/`@MaxLength`(+`@ValidateIf`). **`@IsString`/`@IsNumber`/`@Type`/`@Transform` 등 미사용**(존재+형식/길이+enum 만).
- **모든 제약 데코레이터에 `message: '<한국어 문자열>'` 리터럴 필수**. message 를 받지 않는 것은 `@IsOptional()` 과 `@ValidateIf()` 뿐.
- **데코레이터 순서**: 필수 `@ApiProperty` → 제약 → `@IsNotEmpty`(맨 마지막) / 선택 `@ApiProperty` → `@IsOptional()` → 제약 / 짝 필드 `@ApiProperty` → `@ValidateIf` → 제약 → `@IsNotEmpty`.
- **입력 DTO 의 모든 필드에 검증 데코레이터 최소 1개**(없으면 `@IsOptional()`) — whitelist 를 켜면 무장식 필드가 조용히 사라진다. 응답 ResultDto 는 대상 아님.
- **검증 위치**: 공개 입력은 게이트웨이의 ValidationPipe 에서 1회. 서비스 큐 컨트롤러는 다시 검증하지 않는다(내부 HTTP 컨트롤러는 같은 DTO 로 한 번 더 검증 — 방어).
- 전역 ValidationPipe 는 `transform: true` + `forbidNonWhitelisted: true` + `exceptionFactory: validationExceptionFactory`(main.ts · spec 공용) — **설정을 바꾸지 않는다**. `whitelist` 는 켜지 않는다 — 그래서 선언 안 된 필드는 걸러지지 않는다.
- **`@Query()` DTO (미적용 규약 — 첫 목록 API 에서 적용)**: 생성자를 세트로 갖고, 컨트롤러가 `const dto = new 클래스명(query);` 로 지역변수를 만들어 넘긴다(호출부 `new` 인라인 ❌ · 필드 하나씩 대입 ❌ · 앞선 인자가 있으면 dto 는 마지막). **생성자 파라미터는 반드시 선택(`data?: Partial<T>`)** — 파이프가 `new targetType()` 을 인자 없이 호출해 필수면 매 요청 500, 컴파일에서 안 잡힌다. 페이지 기본값은 `PaginationDto` 생성자(`libs/common/src/dto/pagination.dto.ts` 의 `PAGINATION_DEFAULTS` — 하위 util 의 NaN 폴백에 맡기지 않는다), 기능별 Query DTO 는 `super(data)` 후 자기 필드만(부모 필드 재선언 ❌). 쿼리 값은 문자열이다. `@Body()`/`@Param()` 은 해당 없음. 전체 조항 → [docs/conventions.md](docs/conventions.md).

→ 상세: [docs/conventions.md](docs/conventions.md)

## Error & Response

- **실패 본문은 전송 경로와 무관하게 하나**: `ApiFailResultDto {message, validation_errors: ValidationErrorResultDto[] | null, ...기능별 추가 필드}`. 모든 예외는 `toFailResult()` 를 거친다 — HTTP 는 `CustomErrorFilter` 가 상태 코드 + 본문으로, 큐 경로는 `CommandDispatcher` 가 failed 결과로, 게이트웨이가 SSE `failed` 이벤트(`{status_code, ...본문}`)로 내보낸다.
- **repository**: DB 를 실행하는 메서드는 모두 try/catch, 최종 실패는 통일 `InternalServerErrorException({message: SERVER_ERROR_MESSAGE})`('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'). 제약 위반은 그 제약이 걸리는 쓰기에서 `isUniqueViolation(error, 'UK_…')` · `isForeignKeyViolation(error, 'FK_…')`(PostgreSQL 23505/23503)로 **제약명별 if 분기** → `BadRequestException`. QueryBuilder 빌더 메서드는 실행하지 않으므로 try/catch 없음.
- **service**: 규칙 위반을 `BadRequestException`/`NotFoundException`/`UnauthorizedException`/`HttpException(…, HttpStatus.X)` 로 throw, body `{message: '<한국어 문자열>'}`(+필요 시 추가 필드). controller 는 throw 안 함. 쓰기를 커밋한 채 알리는 실패만 예외를 return 한다(서비스 계층 규칙). crontab 은 건별 실패를 catch 하고 건너뛴다.
- **메시지 상수**: 인프라 · 공통 실패 메시지는 export 되는 `*_MESSAGE` 상수. 비즈니스 메시지는 한 곳에서만 쓰면 throw 옆 인라인 리터럴, 반복되거나 여러 파일(service · repository)이 쓰면 도메인 `<domain>.constants.ts` 의 export `*_MESSAGE`. 도메인 값 상수(용도 · 한도 · 상태 목록)도 같은 파일에 둔다.
- **4xx 는 비즈니스, 5xx 는 인프라**: 큐 경로에서 4xx 는 즉시 failed 회신, 5xx 는 재시도(최대 3회) 후 failed + DLQ. 반환된(return) 예외는 이미 커밋된 실패라 상태 코드와 무관하게 재시도 없이 failed + ack.
- **`validation_errors` 기준**: 사용자 입력 필드 오류만, 비즈니스 · 내부값 오류는 `null`. 입력 필드에 귀속되는 비즈니스 오류는 `createValidationError(property, message)` 로 담는다.
- 상태코드는 동기 핸들러마다 `@HttpCode(200|204)` 명시(현재 200 만, 204 는 미적용). **응답 필드 생략 금지 — 없으면 `null` 포함**(`x: T | null`).

→ 상세: [docs/error-handling.md](docs/error-handling.md)

## API & Docs

- **모든 함수/메서드에 주석 필수**(JSDoc/한 줄, export 여부 무관). 공개 controller(게이트웨이) 핸들러에 Swagger 데코레이터 필수. 내부 controller(`/internal/...`)는 Swagger 없음.
- 클래스: `@ApiTags('<한글>')` → `@Controller(...)`.
- 동기 핸들러(`controllers/<domain>.controller.ts`): HTTP verb → `@HttpCode(200)` → `@ApiOperation({summary})` → `@ApiBody` → `@ApiOkResponse` → 에러 응답들(`type: ApiFailResultDto`). 인증이 붙으면 verb 뒤에 `@UseGuards` → `@Roles`(그룹 안 권한 시) → `@HttpCode` → `@ApiBearerAuth()`(규약 — 사례 없음).
- **큐 핸들러**(`controllers/<domain>.controller.queue.ts`): HTTP verb → `@UseGuards`(인증 시, 그 그룹의 가드) → `@Roles`(그룹 안 권한 시) → `@ApiBearerAuth`(인증 시) → `@ApiOperation` → `@ApiBody`(입력 시) → `@ApiProduces('text/event-stream')` → `@ApiOkResponse({type: done 의 data DTO})`(void 면 생략) → 에러 응답들(권한 시 `@ApiUnauthorizedResponse` 뒤에 `@ApiForbiddenResponse`). `@HttpCode` 없음. 본문 `commandStream.dispatch(res, {...})` 한 줄.
- 응답 데코레이터는 `{type}` 만(❌ `description`), `@ApiOperation` 은 `summary` 만.

→ 상세: [docs/api.md](docs/api.md)

## Data Layer

- **엔티티** `libs/database/src/entities/<domain>/<feature>.entity.ts`, `ENTITIES`(entities.ts)에 등록: 테이블 **`t_<feature snake>`**(`t_user_setting`), `@Entity({name, comment})`, 제약 PascalCase(`primaryKeyConstraintName: 'PK_<Model>'` · `@Unique('UK_<Model>_<Cols>')`(그룹 단위 UK 는 컬럼을 이어 붙인다 — `UK_User_LoginIdLoginScope`) · `@JoinColumn({foreignKeyConstraintName: 'FK_<Model>_<Target>'})` · `@Index('IDX_…')`), 컬럼 이름 명시(`@Column({name})`), **모든 컬럼 `comment`**(→ DB COMMENT), 타임스탬프 `@BeforeInsert`/`@BeforeUpdate` 훅 `insertTimestamp()`/`updateTimestamp()`(❌ `@CreateDateColumn`), 시각 `timestamptz`(기존 예외 `leave_reserved_at` 문자열), 플래그 `smallint`. FK 는 문자열 속성 + `@ManyToOne(() => X, {nullable, onUpdate: 'CASCADE', onDelete: nullable ? 'RESTRICT' : 'CASCADE'})` + `@JoinColumn`(관계 속성을 엔티티 타입으로 두지 않는다 — ESM 순환 import 회피, 역방향 관계 없음). 룩업 엔티티는 구조 컬럼만. 항목이 자주 바뀌는 상세정보는 `jsonb` 컬럼 하나 + 같은 파일의 TS 인터페이스(`t_store.store_detail` · `StoreDetail`, 기본 `'{}'`).
- **컬럼 이름**: 시각은 `<과거분사>_at`(`created_at` · `updated_at` · `verified_at`) · 만료는 `expires_at`, 여부 플래그는 `is_<형용사 · 과거분사>`(`is_deleted` · `is_login_allowed`), 직전 값은 `previous_<이름>`, PK 는 `<테이블>_id`(FK 는 가리키는 PK 와 같은 이름). 이름을 바꿀 때는 `db:generate`(DROP + ADD — 데이터가 사라진다) 대신 손으로 쓴 RENAME 마이그레이션(`1792477492198-RenameColumns.ts`). 단일 컬럼 `@Unique` 는 생성기가 `UQ_<해시>` 이름을 만들 수 있어 생성된 마이그레이션의 제약명을 확인한다.
- **repository**: `TransactionHost<TransactionalAdapterTypeOrm>` 주입, `this.txHost.tx.getRepository(XEntity)` 를 private getter 로 감싸 접근. 조회 `findOne`/`find` + `loadRelationIds: true`, 쓰기 `insert(entity)` · `update(where, entity)`(엔티티 인스턴스라야 훅이 돈다). where 타입 `FindOptionsWhere<XEntity>`(❌ `Partial`). 조인 · raw select 는 QueryBuilder 빌더 메서드(public, 포트 인터페이스 밖)로 분리하고 Data-Access Smoke spec 으로 SQL 고정.
- **마이그레이션**: 스키마는 마이그레이션으로만 바꾼다(`synchronize` 항상 off, 목록 테이블 `t_migration`). 엔티티 수정 → `npm run db:generate -- <Name>`(DB 없이 PGlite 로 계산해 `libs/database/src/migrations/<ts>-<Name>.ts` 생성 + `MIGRATIONS` 등록, COMMENT 변경 포함) → `npm run db:check` 로 일치 확인 → 적용은 사용자(`db:migrate` 또는 Docker migrate 컨테이너).
- **Pagination (미적용 규약 — 자산은 있음, 사용처 0)**: 응답 `{list, pagination}`, 순서 **count → `Pagination` → 목록**, repository 는 개수 · 목록 두 메서드(`findAndCount` ❌). Query DTO 는 `extends PaginationDto`. 공통 `PaginationDto`(`libs/common/src/dto/pagination.dto.ts`) · `Pagination`(`libs/common/src/utils/pagination.ts` — `limit` · `offset` · `getPagination()`)을 쓴다: `new Pagination({...dto, total_count})`.

→ 상세: [docs/data-layer.md](docs/data-layer.md)

## Auth

- **access 토큰 인증 · 권한은 게이트웨이에서만**(`apps/gateway/src/guards/`). user-service · admin-service 는 자기 그룹의 토큰을 발급(JwtModule, 같은 `JWT_SECRET`)하고 refresh 토큰을 검증할 뿐, 요청 인증은 하지 않는다. 서비스는 외부에 열리지 않으며 actor(내부 헤더 · 메시지 봉투)를 신뢰한다.
- 게이트웨이: 핸들러 단위 `@UseGuards(<그룹 가드>)`(클래스 단위 0건). 서비스로 넘기는 핸들러는 `@PassportActor() actor: Actor` 를 첫 파라미터로. **로그인 그룹마다 JWT 전략 · 가드가 따로다** — 전략은 `type === 'access'` 를 확인한 뒤 그 그룹의 서비스에 로그인 회원을 묻고(그 그룹 · 로그인 가능 회원만 돌려준다), 실패는 모두 401(다른 그룹 토큰 포함). 공통 로직은 `passport.jwt.auth.util.ts`. **`NODE_ENV=development` 면 만료를 검사하지 않는다** — 서버는 production.
  | 그룹 | 전략(이름) · 가드 | 확인 |
  |---|---|---|
  | 이용자 | `PassportJwtAuthStrategy`(`jwt-user`) · `PassportJwtAuthGuard` | user-service `GET /internal/v1/user-service/user/auth-user/:user_id` |
  | 매니저 | `PassportJwtManagerAuthStrategy`(`jwt-manager`) · `PassportJwtManagerAuthGuard` | admin-service `GET /internal/v1/admin-service/manager/auth-user/:user_id` |
  | 관리자 | `PassportJwtAdminAuthStrategy`(`jwt-admin`) · `PassportJwtAdminAuthGuard` | admin-service `GET /internal/v1/admin-service/admin/auth-user/:user_id` |
- **로그인 그룹 3개(`t_user.login_scope`) = 도메인 3개** — 그룹마다 경로 접두 · 서비스 · 로그인 · 토큰 재발급 API 가 따로다.
  | 그룹 `LOGIN_SCOPE` | 권한(`AUTH_ID`, `t_auth` PK) | 경로 접두 · 서비스 | 로그인 |
  |---|---|---|---|
  | `USER` | `USER`(이용자) | `/api/v1/user-service/user` · user-service | SNS 만(`/login`) — 이용자는 SNS 로만 가입하고 비밀번호가 없다 |
  | `MANAGER` | `HEAD_MANAGER` · `MANAGER`(총매니저 · 매니저) | `/api/v1/admin-service/manager` · admin-service | 아이디 · 비밀번호 — 비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화(등록된 휴대폰) |
  | `ADMIN` | `SUPER_ADMIN` · `ADMIN`(총관리자 · 관리자) | `/api/v1/admin-service/admin` · admin-service | 아이디 · 비밀번호 — 비밀번호 변경만 |
  - 다른 그룹 계정은 로그인에서 없는 계정과 같은 404, 재발급에서 401(refresh 만료 단축). 각 도메인 service 가 자기 그룹 조건으로 찾는다(`findManager({..., login_scope: LOGIN_SCOPE.MANAGER})`).
  - `login_scope` 는 계정을 만들 때 권한에 맞춰 넣는다(가입 · 시드 · 이후 입점 승인 · 매니저 등록). 아이디 · 휴대폰 번호 UK 도 그룹 단위다.
- **미적용 규약(정의만 있고 사용 0)**: 그룹 안에서 권한을 더 좁히는 API(예: 총매니저만)는 그룹 가드 뒤에 `RolesGuard` + `@Roles(AUTH_ID.HEAD_MANAGER)`(`guards/roles/roles.decorator.ts`)를 **한 세트로** 붙이고 `@ApiForbiddenResponse` 를 명시한다 — 불일치 403 `{message: '접근 권한이 없습니다.'}`. 그룹 자체는 그룹 가드가 가르므로 그룹 전체에 열린 라우트에는 `@Roles` 를 붙이지 않는다. 게이트웨이 안에서만 쓰는 회원 값은 `@PassportUser('user_id')`, 서비스 내부 HTTP 의 로그인 회원은 `@InternalActor('user_id')`.
- 서비스 내부 HTTP 의 클라이언트 IP 는 `@ClientIp()`.
- 휴대폰 SMS 인증 여부는 `is_phone_verified`(가입 · 로그인 결과, auth-user) — 인증 전 회원을 막는 가드는 회원 전용 기능이 처음 생길 때 붙인다(지금은 막지 않는다).

### 서비스는 게이트웨이를 거친 요청만 받는다

- **내부 HTTP**: 서비스 루트 모듈(user-service · admin-service)에 `{provide: APP_GUARD, useClass: InternalAuthGuard}` — 모든 HTTP 요청에 게이트웨이의 `x-internal-token`(INTERNAL_API_TOKEN, 시간차 안전 비교, 미설정이면 전부 거부)을 요구한다. 컨트롤러마다 붙이지 않는다. 같은 자리에 `{provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}` 도 둔다(반환된 예외 → 실패 응답). 바인딩 주소는 `USER_SERVICE_HOST` · `ADMIN_SERVICE_HOST`(기본 127.0.0.1), Docker 에서는 `roomless-service` 네트워크(internal — gateway · 서비스 LB · 서비스 인스턴스만)로 닿는다. 서비스에는 CORS 를 두지 않는다.
- **큐(명령)**: 앱마다 다른 브로커 계정(`BROKER_USER`: gateway · user-service · admin-service, 비밀번호 `RABBITMQ_<계정>_PASSWORD`). `roomless.cmd` 에 쓸 수 있는 계정은 gateway 뿐이다(권한: [docker/rabbitmq/init.sh](docker/rabbitmq/init.sh)). 연결 모듈은 발행하는 모든 메시지에 자기 계정을 `user_id` 로 붙이고, 브로커가 접속 계정과 대조한다. 서비스 소비자는 `user_id` 가 신뢰 발행자(`trusted_publisher`, 기본 `'gateway'`)가 아닌 명령을 처리 · 회신 없이 DLQ 로 보낸다.
- **CORS** 는 브라우저 규칙이라 서버 간 호출을 막지 못한다 — 게이트웨이에만 `CORS_ORIGINS`(프론트 주소, 비우면 모두 차단)로 건다.

## 메시징 / 스케줄러

- **RabbitMQ**(`libs/messaging`): exchange `roomless.cmd`(명령 — gateway 계정만 발행) · `roomless.event`(결과 회신 — 서비스 계정만 발행, 도메인 이벤트는 아직 없음) · `roomless.dlx`. 서비스 명령 큐는 앱마다 하나(user-service `q.user.cmd` ← `user.#`, admin-service `q.admin.cmd` ← `admin.#` — 매니저 · 관리자 도메인 명령을 함께 받는다), quorum(`x-delivery-limit: 3`, prefetch 기본 10), 게이트웨이 결과 큐는 인스턴스별 exclusive(`q.gw.result.<인스턴스>`, 인스턴스 ID `GATEWAY_INSTANCE_ID` 또는 `gw-<호스트>-<pid>`). 라우팅 키 `<server>.<resource>.<action>`, 결과는 `result.<인스턴스>.<type>.<done|failed>`.
- `MessagingModule.forGateway()/forService()` 는 전역 모듈이다. 연결 준비 작업은 provider 의 `onModuleInit` 에서 `connection.register(setup)` 하고, 연결은 `onApplicationBootstrap` 에서 연다. 브로커가 없어도 부팅은 막지 않고 발행만 503.
- 명령 추가: `libs/contracts/src/<domain>/<domain>.commands.ts` 에 type 상수 → 서비스 `controllers/<domain>.controller.queue.ts` 에 `@OnCommand(TYPE)` 메서드(service 위임만, **같은 type 이 두 번 등록되면 부팅 실패**) → 게이트웨이 `controllers/<domain>.controller.queue.ts` 에서 `commandStream.dispatch`.
- **요청 단위 SSE**: 큐 경로 응답 = `event: accepted` → `done | failed | pending` → 종료. 상태 저장소 · 상시 연결 없음. 대기 시간 초과(`COMMAND_STREAM_TIMEOUT_MS`, 기본 30초)나 게이트웨이 종료면 pending, 클라이언트는 리소스를 재조회한다.
- **스케줄러**: crontab 은 **scheduler 앱(`apps/scheduler`)** 의 도메인 `crontabs/` 폴더에 `<domain>-<feature>.crontab.ts`(`@Cron`)로 두고 도메인 모듈 providers 에 등록한다. 서비스 앱에는 `ScheduleModule` · crontab 을 두지 않는다. scheduler 는 들어오는 연결이 없고(`NestFactory.createApplicationContext` — listen · 큐 소비 · 컨트롤러 없음) DB 에만 붙으며, crontab 이 쓰는 데이터 접근은 scheduler 안의 도메인 repository 로 둔다. `ScheduleModule.forRoot()` 는 scheduler 루트 모듈에 1회. 운영 데이터를 바꾸는 crontab 은 `NODE_ENV !== 'production'` 이면 바로 return 한다. **scheduler 도 여러 대일 수 있고(`SCHEDULER_REPLICAS`) 배포 중 겹칠 수 있으므로 crontab 본문은 `JobLockService.runExclusive('<domain>.<작업>', async () => {...})`(libs/database, PostgreSQL advisory lock — DatabaseModule 이 전역 제공, 잠금 키는 crontab 파일 상수)로 감싸 회차마다 1대만 실행**하고, 대상은 상태 조건으로 골라 두 번 돌아도 같은 결과가 나게 한다.

→ 상세: [docs/messaging.md](docs/messaging.md)

## Key Patterns

- **Repository DI**: Symbol 토큰(`<domain>.symbols.ts`) + 모듈 `{provide: TOKEN, useClass: XRepository}` + service `@Inject(TOKEN) … : XRepositoryInterface`(인터페이스는 `import type`). 메시징 포트(`COMMAND_PUBLISHER` · `RESULT_SUBSCRIBER`) · 외부 연동 포트(`SMS_SENDER` · `STORAGE_GATEWAY`)도 같은 패턴.
- **전역 모듈**: `TransportModule`(게이트웨이) · `DatabaseModule` · `MessagingModule` · `SmsModule` · `StorageModule` 은 전역이라 도메인 모듈은 import 없이 주입받는다.
- **외부 연동** (첫 사용처: user-service 휴대폰 SMS 인증 · 아이디 찾기 · 비밀번호 초기화 — `SmsModule`):
  - **mock · 가짜 어댑터를 두지 않는다.** 실제 서비스 어댑터 + 세팅 가이드(`docs/guides/`)로 만들고, 세팅 전에는 `.env` 값이 비어 요청만 실패한다(부팅은 된다).
  - 발송은 SMS 하나다 — `SMS_SENDER.send({to, text})`(Amazon SNS). 이메일 · 알림톡 · 푸시는 쓰지 않는다.
  - 사진은 `STORAGE_GATEWAY`(S3)의 presigned URL 로 올린다. 파일 본문은 게이트웨이 · 브로커를 거치지 않는다.
  - 포트를 쓰는 앱 루트 모듈이 `SmsModule` · `StorageModule` 중 필요한 것을 import 한다.
  - 외부 실패는 어댑터가 503(`SMS_UNAVAILABLE_MESSAGE` · `STORAGE_UNAVAILABLE_MESSAGE`)으로 던지고, service 는 잡지 않는다. 재시도되면 다시 나가므로 발송은 명령의 마지막 단계에 둔다.
  - → 상세: [docs/integration.md](docs/integration.md) · AWS 세팅: [docs/guides/aws-setup.md](docs/guides/aws-setup.md)
- **Transaction**: service 쓰기 메서드에 `@Transactional()`, repository 는 `txHost.tx`. 커밋해야 하는 실패는 예외를 return 한다(서비스 계층 규칙) — 시도 횟수 소비도 확인과 같은 트랜잭션이라 요청 1건이 DB 연결 1개만 쓴다. 풀에서 연결을 기다리는 시간은 `DATABASE_CONNECTION_TIMEOUT_MS`(기본 30초)로 제한한다(typeorm.config.ts). DB 를 쓰는 앱 루트 모듈은 `DatabaseModule`(TypeOrmModule + ClsModule `TransactionalAdapterTypeOrm` + `JobLockService`)을 import 한다.
- **기본 데이터 시드**: `libs/database/src/seeder/seeder.targets.ts` 의 `<X>_SEED_DATA` + `SEED_TARGETS` 를 DB 소유 서비스(user-service)의 `SeederService` 가 부팅 시 PK 기준 멱등 입력. 시드 행은 객체 리터럴 허용(유일 예외). DTO 허용값(`@IsIn`)은 모두 시드에 있어야 한다.
- **Docker 실행 — 묶음 6개를 따로**: `compose.postgres.yml` · `compose.rabbitmq.yml`(+rabbitmq-init 브로커 계정 · 권한) · `compose.user-service.yml`(migrate 1회 → user-service × `USER_SERVICE_REPLICAS` → user-service-lb) · `compose.admin-service.yml`(admin-service × `ADMIN_SERVICE_REPLICAS`(기본 1) → admin-service-lb, 마이그레이션 없음) · `compose.scheduler.yml`(scheduler × `SCHEDULER_REPLICAS`, `roomless-data` 만 — 포트 · LB 없음) · `compose.gateway.yml`(gateway × `GATEWAY_REPLICAS` → gateway-lb, 호스트 `GATEWAY_PORT`). `docker:up` 순서는 user-service(마이그레이션) → admin-service → scheduler → gateway. 각자 띄우고 내리며(`npm run docker:<묶음>`, 전체는 `docker:up`), 묶음끼리는 `npm run docker:network` 가 만든 공용 external 네트워크(`roomless-edge` · `roomless-service`(internal) · `roomless-broker` · `roomless-data`)에서 서비스 이름으로 만난다. gateway · user-service · admin-service 는 **로드밸런싱 전제** — 앞단 nginx(1.28, upstream `resolve` 로 `--scale` 을 재시작 없이 따라감), 큐 명령은 경쟁 소비, 결과는 `reply_to` 인스턴스로(sticky session 불필요), crontab 은 JobLockService. 그래서 앱 코드는 인스턴스 로컬 상태(메모리 캐시 · 세션 등)에 기대지 않는다.
- **`.env` 하나가 곧 서버 설정** — compose 는 환경 값(NODE_ENV · DB/RabbitMQ 접속정보 · 비밀값 · CORS · TRUST_PROXY · 인스턴스 수)을 바꾸지 않고 그대로 쓴다. 비밀값 · 접속정보는 기본값 없이 필수(`${VAR:?}` — 비면 띄우지 않음), 비밀이 아닌 구성값만 기본값(`TRUST_PROXY:-1` · `*_REPLICAS:-2`(admin-service · scheduler `:-1`) · 호스트 포트). compose 가 고정하는 것은 서버 구성(컨테이너 안 포트 · 바인딩 0.0.0.0 · user-service-lb · admin-service-lb 주소 · 인스턴스 ID 비움 · TZ)뿐이다. 가상 운영(같은 서버의 postgres · rabbitmq 묶음, 주소 = 컨테이너 이름)과 실제 운영(RDS · Amazon MQ)은 `.env` 의 접속정보로 사용자가 고르고, 운영으로 옮길 때 compose 를 다시 세팅하지 않는다 — compose 에 환경별 값 · 약한 기본 비밀번호를 넣지 않는다. 각 앱에는 쓰지 않는 다른 앱 · 관리자 비밀값을 빈 값으로 덮어 전달하지 않는다. 이미지는 `Dockerfile` 하나를 `APP` 빌드 인자로(Node 24 slim, 운영 의존성만, `node` 사용자). 앱 코드 개발 중에는 `npm run docker:infra` 로 인프라만 띄우고 `npm run start:*` 로 로컬 실행해도 된다.

## Testing

- **Vitest 4** + `@nestjs/testing` + `supertest`. `globals: true` — spec 은 describe · it · expect · vi 를 import 하지 않는다. 위치는 **대상 코드 옆 `test/` 폴더**(`apps/<app>/src/<domain>/test/<domain>-<feature>.spec.ts`, 게이트웨이 `api/v1/<service>/<domain>/test/` · `guards/test/` · `config/test/` · `modules/<m>/test/`, 라이브러리 `libs/<lib>/src/**/test/`). 실행 `npm test`, 단일 `npm test -- <파일 경로 일부>`.
- 전역 setup([vitest.setup.ts](vitest.setup.ts)): `@Transactional()` pass-through mock + Nest 로거 끔. spec 마다 반복하지 않는다.
- **큐 경로**: 실제 큐 컨트롤러 · service · `CommandHandlerRegistry` · `CommandDispatcher` 를 부팅(`DiscoveryModule` + `module.init()` 필수)하고 **repository · 외부 연동 포트(Symbol 토큰) · `JwtService` 만 mock** 주입, 봉투를 `dispatcher.dispatch()` 에 넣어 판정(ack/requeue/dead)과 done/failed 결과를 단언.
- **동기 경로**: 실제 controller + service + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor 부팅, repository · 외부 연동 포트 · JwtService 만 mock.
- **게이트웨이**: controller 2파일과 짝인 spec 2개 — 동기는 InternalHttpClient mock, 큐는 가짜 브로커(FakeBroker)로 SSE 이벤트 순서를 실제 HTTP 로 단언. 다른 경로 라우트 404 단언.
- 외부 util 은 `vi.mock('<alias 경로>.js', ...)` + `vi.mocked(fn).mockReturnValue`(ESM 이라 `spyOn(모듈)` 불가), 외부 패키지는 `vi.hoisted` + `vi.mock`. 시간은 날짜만 필요하면 `vi.useFakeTimers({toFake: ['Date']})`, 타이머 의존 로직은 전체 `vi.useFakeTimers()`.
- 강도: 상태코드만 검사 금지 — mock 호출 횟수 · 인자(쓰기는 엔티티 컬럼 값, `toBeInstanceOf(XEntity)`) · 실패 후 `.not.toHaveBeenCalled()` 까지. 메시지는 한국어 리터럴. `[SUCCESS]`/`[FAIL:*]`/`[SKIP]`/`[SECURITY]` 등 분류 태그를 describe 또는 it 제목에. **실 DB · 브로커 · 외부 IO 금지.**
- **Data-Access Smoke**: 매핑 민감 쿼리(관계 필드 where · QueryBuilder · raw select · 동적 조립) 메서드는 repository-mock spec 만으로 커버 금지 — repository mock 은 쿼리 매핑을 실행하지 않는다. DB 연결 없이 `new DataSource(...)` + `buildMetadatas()` 로 SQL 을 빌드해 고정하는 smoke 케이스 필수. 현재 적용 [user.repository.spec.ts](apps/user-service/src/user/test/user.repository.spec.ts) `findLoginUser` · `consumeSmsVerificationAttempt`, [manager.repository.spec.ts](apps/admin-service/src/manager/test/manager.repository.spec.ts) `findLoginManager` · `consumeSmsVerificationAttempt`, [admin.repository.spec.ts](apps/admin-service/src/admin/test/admin.repository.spec.ts) `findLoginAdmin`, [scheduler user.repository.spec.ts](apps/scheduler/src/user/test/user.repository.spec.ts) `buildUsersQuery`.
- 공유 service 생성자에 DI 를 추가하면 그 service 를 부팅하는 모든 spec · 도우미의 providers 에 mock 을 추가한다. repository 메서드를 추가하면 `createUserRepositoryMock()` 에도 추가해야 typecheck 를 통과한다.
- 엔티티 ↔ 마이그레이션 일치는 `npm run db:check` 로 확인한다(테스트와 별도). 타입은 Vitest 가 검사하지 않으므로 `npm run typecheck` 도 함께 통과시킨다.

→ 상세: [docs/testing.md](docs/testing.md)

## Checklist

- [ ] ESM: 상대 · alias import `.js` 확장자, 타입 전용 `import type`, alias 는 `@app/<lib>/...`, 앱끼리 import 없음
- [ ] 파일/클래스명: 도메인 레이어 `<domain>.<role>.ts`, 인프라 `<kebab>.<role>.ts`, DTO kebab(`libs/contracts`), 엔티티 `libs/database/src/entities/<domain>/<feature>.entity.ts`, crontab `crontabs/<domain>-<feature>.crontab.ts`, 응답 `ResultDto`
- [ ] 게이트웨이: 라우트 `api/v1/<service>/<domain>/controllers/`(경로 `/api/v1/<service>/<domain>`, 내부 `/internal/v1/<service>/<domain>`), 가드 `guards/`, 인프라 `modules/`, 설정 함수 `config/`
- [ ] 경로 선택: 큐(쓰기 · 상태 변경) vs 동기(즉시 응답 · 조회)를 게이트웨이에서 결정하고, 파일을 `controllers/<domain>.controller.ts`(동기) · `controllers/<domain>.controller.queue.ts`(큐)로 나눈다(게이트웨이 · 서비스 공통)
- [ ] 규격 상수(명령 type · 큐 · 바인딩 · 내부 경로)는 `libs/contracts/src/<domain>/<domain>.commands.ts`
- [ ] 컨트롤러 입력 DTO 타입, 파라미터 한 줄, 인증은 `@PassportActor()` 첫 파라미터, 비인증 명령은 `actor: null`
- [ ] DTO 검증: `message: '<한국어 문자열>'` 필수, `@IsNotEmpty` 맨 마지막, `@IsString` 미사용, 입력 필드마다 검증 데코레이터 1개 이상
- [ ] Entity: `@Entity({name:'t_<feature>', comment})`, 제약명 `PK_/UK_/FK_/IDX_`, 컬럼 이름 · comment 명시, FK `onDelete` 규칙, `@BeforeInsert/@BeforeUpdate`, `ENTITIES` 등록, 마이그레이션 생성 + `db:check` 통과
- [ ] Repository: `txHost.tx.getRepository`, DB 실행 메서드 try/catch + `SERVER_ERROR_MESSAGE` 500, `isUniqueViolation`/`isForeignKeyViolation` 제약명 분기, `FindOptionsWhere`, `loadRelationIds:true`, `update` 는 엔티티 인스턴스 전달
- [ ] Service: public=API/명령 1:1, private 헬퍼 없이 util, 쓰기 `@Transactional()`, 커밋해야 하는 실패만 예외 return, 엔티티는 `new`+할당, JSDoc 에 전송 경로
- [ ] Error: 실패 본문 `{message, validation_errors}` 하나, `validation_errors` 는 입력 필드 오류만, 공통 메시지는 `*_MESSAGE` 상수
- [ ] Swagger: 공개 핸들러 필수, 큐 핸들러는 `@ApiProduces('text/event-stream')`, 응답 데코레이터는 `type` 만
- [ ] 메시징: 명령 type 은 contracts, 서비스 큐 컨트롤러는 `@OnCommand` + 위임만, 로그인 필요 명령은 `requireActor()`
- [ ] 로그인 그룹 = 도메인: 로그인 필요 라우트는 그 그룹의 가드(`PassportJwtAuthGuard` · `PassportJwtManagerAuthGuard` · `PassportJwtAdminAuthGuard`), 그룹마다 자기 service · DTO · 명령, 공통 계정 로직은 `libs/account`
- [ ] 여러 인스턴스 전제: crontab 은 scheduler 앱에만 · 운영 가드 + `JobLockService.runExclusive`, 인스턴스 메모리에 상태를 두지 않는다
- [ ] 외부 연동: mock · 가짜 어댑터 없음(실제 어댑터 + `docs/guides/` 가이드), 발송은 `SMS_SENDER` 하나(이메일 · 알림톡 · 푸시 ❌), 파일은 `STORAGE_GATEWAY` presigned URL(파일 본문을 게이트웨이 · 브로커로 보내지 않음), 발송은 명령의 마지막 단계
- [ ] README.md: 코드 · 설정 · 구조 · 명령 · 실행 방법이 바뀌었으면 같은 변경에서 갱신
- [ ] 응답 필드 생략 금지 — 없으면 `null`
- [ ] 테스트: repository · JwtService mock, 호출 횟수 · 인자 · 미호출 단언, 한국어 리터럴, 매핑 민감 쿼리는 Smoke, `npm test` + `npm run typecheck` 통과
