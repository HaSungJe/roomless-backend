# Conventions

## ESM

프로젝트는 `"type": "module"` + `module/moduleResolution: nodenext` 다.

- **상대 · alias import 는 `.js` 확장자 필수** — `import {UserService} from './user.service.js'`, `import {sha256Hex} from '@app/common/utils/hash.js'`. 빌드 시 Nest CLI 가 alias 를 상대경로로 바꾼다. (확장자 누락 0건)
- 패키지 import 는 확장자 없음. 패키지 하위 경로가 exports 맵이 없는 CJS 면 확장자를 붙인다(`dayjs/plugin/customParseFormat.js`).
- **CJS 패키지는 default import** — `import bcrypt from 'bcrypt'`(libs/common/src/utils/bcrypt.ts:1), `import jsonwebtoken from 'jsonwebtoken'`, `import amqp from 'amqplib'`, `import passportJwt from 'passport-jwt'; const {Strategy} = passportJwt;`. named import 는 런타임에 실패할 수 있다.
- 타입만 쓰는 import 는 `import type` (`isolatedModules`). repository · 포트 인터페이스가 대표적이다.
- `__dirname` · `require` 없음 → `import.meta.url` / `import.meta.dirname`. `main.ts` 는 top-level `await bootstrap()`.
- 환경변수는 각 앱 `main.ts` 첫 줄 `import 'dotenv/config'` 로 읽는다. 모듈 데코레이터 안에서 env 를 읽을 때는 `registerAsync({useFactory})` 로 실행 시점에 읽는다.

## Import alias

| alias | 대상 |
|---|---|
| `@app/common/*` | `libs/common/src/*` |
| `@app/contracts/*` | `libs/contracts/src/*` |
| `@app/database/*` | `libs/database/src/*` |
| `@app/messaging/*` | `libs/messaging/src/*` |

- 앱 · 도메인 내부는 상대경로(`../user.symbols.js`). 다른 앱의 코드는 import 하지 않는다 — 공유가 필요하면 libs 로 옮긴다.
- 라이브러리 안의 import 는 현재 섞여 있다 — `libs/common` 은 같은 라이브러리도 alias 로(fail-result.ts:2, custom-error.filter.ts:3), `libs/messaging` · `database` · `contracts` 는 상대경로로(messaging.util.ts:6, entities.ts:1). 새 코드는 그 라이브러리에서 이미 쓰는 방식을 따른다. <!-- TODO: 한쪽으로 통일할지 결정 -->
- barrel(`index.ts`) 없음.

## 파일 · 클래스 명명

**도메인 레이어 파일** — `<domain>.<role>.ts`:
- `controllers/user.controller.ts`(내부 HTTP) · `controllers/user.controller.queue.ts`(RabbitMQ) · `user.service.ts` · `user.module.ts` · `user.constants.ts`(도메인 상수 · 공유 메시지) · `user.symbols.ts` · `user.util.ts`
- repository `repositories/user.repository.ts`, 포트 `interfaces/user.repository.interface.ts`
- crontab 은 scheduler 앱에만 — `apps/scheduler/src/<domain>/crontabs/<domain>-<feature>.crontab.ts` (예: `user-leave-cleanup.crontab.ts`, 클래스 `UserLeaveCleanupCrontab`), 데이터 접근은 같은 도메인의 `repositories/` · `interfaces/` · `<domain>.symbols.ts`. 잠금 키는 같은 파일에서 상수로 export(`USER_LEAVE_CLEANUP_LOCK = 'user.leave-cleanup'`).
- controller 는 게이트웨이 · 서비스 모두 도메인 폴더의 `controllers/` 에 두고, **전달 경로별로 파일을 나눈다(한 파일에 섞지 않는다)**:
  - 동기(내부 HTTP) `controllers/<domain>.controller.ts` · 클래스 `<Domain>Controller`
  - 큐(RabbitMQ) `controllers/<domain>.controller.queue.ts` · 클래스 `<Domain>QueueController`
  - 게이트웨이(`apps/gateway/src/api/v1/<service>/<domain>/controllers/`): 동기는 `InternalHttpClient` 만, 큐(요청 단위 SSE)는 `CommandStreamService` 만 주입. 둘 다 같은 `@ApiTags` · `@Controller('/api/v1/<service>/<domain>')`, 도메인 모듈 `controllers: [<Domain>Controller, <Domain>QueueController]`. controller 자체의 spec 은 두지 않는다 — spec 은 service 기능 · repository 만([testing.md](testing.md)).
  - 서비스(`apps/<app>/src/<domain>/controllers/`): 동기는 `@Controller('/internal/v1/<service>/<domain>')` → 모듈 `controllers`. 큐는 `@Injectable` + `@OnCommand` provider → 모듈 `providers`(HTTP 컨트롤러가 아니다 — `CommandHandlerRegistry` 가 provider 를 스캔한다).

**인프라 · 라이브러리 파일** — `<kebab-이름>.<role>.ts`: `internal-http.client.ts` · `command-stream.service.ts` · `command.dispatcher.ts` · `command-handler.registry.ts` · `rabbitmq-command.publisher.ts` · `on-command.decorator.ts` · `custom-error.filter.ts` · `internal-auth.guard.ts` · `job-lock/job-lock.service.ts` · `cors.config.ts`. 모듈 전용 util 은 `<module>.util.ts`(transport.util.ts · messaging.util.ts · seeder.util.ts). 전역 util 은 role 접미사 없이 `utils/<이름>.ts`. 이름에 점이 들어간 예외: `passport.jwt.auth.*` · `global.result.dto.ts`.

**게이트웨이 폴더** — 공개 라우트는 경로와 같은 모양의 `api/v1/<service>/<domain>/`(`user-service/user` · `admin-service/manager` · `admin-service/admin`), 가드 `guards/<guard>/`, 인프라 `modules/<module>/`, 부트스트랩 설정 함수 `config/`(cors.config.ts · trust-proxy.config.ts).

**DTO 파일** — `libs/contracts/src/<domain>/dto/<domain>-<feature>.dto.ts` (kebab). 요청 DTO 와 응답 `ResultDto` 는 같은 파일에 함께 export. 결과가 없는(void) 기능은 ResultDto 를 두지 않는다(user-leave.dto.ts · user-password.dto.ts).

**규격 상수** — `libs/contracts/src/<domain>/<domain>.commands.ts` 에 명령 type · 큐 이름 · 바인딩 키 · **내부 HTTP 경로(`USER_INTERNAL_PATH`)** 를 둔다(user.commands.ts:8-34). 게이트웨이 동기 핸들러와 JWT 전략은 경로 문자열을 직접 쓰지 않고 이 상수만 쓴다. **파라미터가 있는 경로는 경로 함수**로 둔다 — `STORE_INTERNAL_PATH.myApplication(store_application_id)`(store.commands.ts, 값은 `encodeURIComponent`). 게이트웨이가 경로를 문자열로 이어 붙이지 않게 한다. 명령 type 은 `<server>.<resource>.<action-kebab>` — server 는 서비스 앱(`user.member.leave-cancel` → user-service, `admin.manager.find-login-id` · `admin.admin.password` → admin-service). 앱의 큐 · 바인딩 상수는 그 앱 이름의 commands 파일(`USER_COMMAND_QUEUE` · `ADMIN_COMMAND_QUEUE`)에 둔다.

**권한 · 로그인 그룹 상수** — 도메인 공통이라 `libs/contracts/src/roles.ts` 의 `AUTH_ID`(t_auth PK) · `LOGIN_SCOPE`(USER · MANAGER · ADMIN) · `type LoginScope`. 서비스(`userEntity.auth_id = AUTH_ID.USER`, `findManager({login_scope: LOGIN_SCOPE.MANAGER})`)와 게이트웨이 `@Roles(AUTH_ID.HEAD_MANAGER)`(미적용)가 같은 상수를 쓴다. libs/database 는 contracts 를 import 하지 않으므로 시드는 문자열 리터럴이다.

**엔티티 파일** — `libs/database/src/entities/<domain>/<feature>.entity.ts` (1엔티티 1파일, kebab), 클래스 `<Feature>Entity`. 테이블 이름은 [data-layer.md](data-layer.md).

**DI 토큰** — `<domain>.symbols.ts` 에 `Symbol('<Interface 이름>')`: `USER_REPOSITORY = Symbol('UserRepositoryInterface')`(user.symbols.ts:2), `COMMAND_PUBLISHER = Symbol('CommandPublisherInterface')`.

**클래스명** — `<Domain><Feature><Role>`:
- 요청 `UserSignDto` · path param `UserAuthUserParamDto` · 목록 query `XListDto`(PaginationDto 상속 — `StoreListDto`)
- 응답은 항상 `ResultDto`: `UserSignResultDto` (❌ `ResponseDto`)
- 게이트웨이 controller `UserController`(동기) · `UserQueueController`(큐), 서비스 큐 컨트롤러 `UserQueueController`(내부 HTTP 는 `UserController`), crontab `UserLeaveCleanupCrontab`

**DTO 독립 명명**: 기능당 DTO 1개. 모양이 같아도(토큰 응답 4종 등) 독립 재선언하고 재사용 · alias 하지 않는다.

## snake_case 전 레이어 통일

DTO 필드 · entity 컬럼 · path/query param · JWT payload(`{type, user_id, session_id}`) · 메시지 봉투 · 실패 본문(`validation_errors`) · 내부 HTTP 응답 키 · util 옵션 객체 키(`RetryOptions.delay_ms`, `InternalRequestOptions.client_ip`)가 모두 snake_case. 밖(HTTP · 메시지 · DB · 토큰)으로 나가는 키는 예외 없이 snake_case 다.

camelCase 는 코드 안에서만 쓰는 이름에 한한다 — 함수 · util 함수명, repository 의 엔티티별 private getter(`users` · `sessionRefreshes`), 밖으로 나가지 않는 util 내부 반환 타입의 필드(`AccessRefreshSet.accessToken` — user.util.ts:9-14). 지역 변수는 ID 값은 snake(`user_id` · `session_id`), 엔티티 객체는 camel(`userEntity`)로 섞여 있다.

## 라우트

- 공개 `/api/v1/<service>/<domain>/<action>` · 내부 `/internal/v1/<service>/<domain>/<action>` — service 는 서비스 앱(`user-service` · `admin-service`), domain 은 그 앱의 도메인 폴더. 로그인 그룹은 경로가 아니라 게이트웨이 가드로 가른다.
- 공개(게이트웨이): `@Controller('/api/v1/<service>/<domain>')`(`/api/v1/user-service/user` · `/api/v1/admin-service/manager` · `/api/v1/admin-service/admin`). 내부(서비스): `@Controller('/internal/v1/<service>/<domain>')`(`/internal/v1/admin-service/manager/login`). 내부 경로 문자열은 contracts 의 `*_INTERNAL_PATH` 상수로만 쓴다.
- 이후 기능도 같은 규칙이다 — 객실 관리(매니저)는 `/api/v1/admin-service/room`, 입점 승인(관리자)은 `/api/v1/admin-service/store`, 예약(이용자)은 `/api/v1/user-service/reservation`. 같은 도메인 안에서 그룹이 다른 라우트는 가드로 가른다.
- 앞 `/` 필수, 다단어 kebab(`/token-refresh`), path param 은 snake_case(`/auth-user/:user_id`).
- 같은 경로 다른 verb 가능(`DELETE /leave` · `PATCH /leave`).

## 컨트롤러 · 핸들러 입력

- 입력은 항상 DTO 타입: `@Body() dto: UserSignDto` / `@Param() param: XParamDto` / `@Query() query: XListDto`(사용처 0 — 규약). **`any` · `@Param('key')` 금지.**
- 파라미터는 한 줄, 본문은 위임 한 줄(로직 0).

**게이트웨이 큐 핸들러** — 세 형태다. 마지막은 항상 `@Res() res: Response` 이고 본문은 `commandStream.dispatch(res, {...})` 한 줄.

| 형태 | 시그니처 | dispatch |
|---|---|---|
| 인증 + 입력 | `(@PassportActor() actor: Actor, @Body() dto: XDto, @Ip() ip: string, @Res() res: Response)` | `{type, actor, payload: dto, client_ip: ip}` |
| 비인증 | `(@Body() dto: XDto, @Ip() ip: string, @Res() res: Response)` | `actor: null` 을 명시 |
| 입력 없음 | `(@PassportActor() actor: Actor, @Ip() ip: string, @Res() res: Response)` | `payload: {}` — 서비스 큐 컨트롤러는 `MessageEnvelope<Record<string, never>>` |

**게이트웨이 동기 핸들러** — `(@Body() dto, @Ip() ip)` → `internalHttp.request<XResultDto>('user', 'POST', USER_INTERNAL_PATH.X, {body: dto, client_ip: ip})`.

**게이트웨이 인증 값** — 서비스로 넘기면 `@PassportActor() actor: Actor`(첫 파라미터). 게이트웨이 안에서만 쓰는 `@PassportUser('user_id')` 는 정의만 있고 사용처 0(미적용 규약).

**서비스 내부 HTTP 핸들러** — `@Ip()` 대신 `@ClientIp() ip`(게이트웨이가 넘긴 원래 클라이언트 IP). service 에는 DTO 또는 원시값(`param.user_id`)을 넘긴다. 로그인 회원은 `@InternalActor('user_id') user_id: string` — 게이트웨이가 넘긴 actor 헤더에서 꺼낸다(store.controller.ts 내 신청 라우트).

**서비스 RabbitMQ 핸들러** — `(command: MessageEnvelope<XDto>)` 하나만 받는다. IP 는 `command.meta.client_ip ?? ''`, 로그인 필요 명령은 `requireActor(command).user_id`.

## Validation (class-validator)

- **사용**: `@IsNotEmpty` · `@IsOptional` · `@IsIn` · `@Matches` · `@MaxLength` (+ 짝 필드 조건부 `@ValidateIf`) · 위경도 `@IsLatitude` · `@IsLongitude`(숫자 좌표는 위 데코레이터로 검증할 수 없다 — store-application.dto.ts · store-update.dto.ts, 문자열 · 숫자 모두 받으므로 service 가 `Number()` 로 바꾼다).
- **미사용**(grep 0건): `@IsString` · `@IsNumber` · `@IsInt` · `@IsBoolean` · `@IsEnum` · `@MinLength` · `@Length` · `@Min` · `@Max` · `@Type` · `@Transform` — 존재 + 형식/길이 + enum 만 검증.
- **모든 제약에 `message: '<한국어 문자열>'` 리터럴 필수**. message 를 받지 않는 것은 `@IsOptional()` 과 `@ValidateIf(...)` 뿐.
- **순서**:
  - 필수 `@ApiProperty` → 제약 → `@IsNotEmpty`(맨 마지막)
  - 선택 `@ApiProperty` → `@IsOptional()` → 제약
  - 짝 필드 `@ApiProperty` → `@ValidateIf` → 제약 → `@IsNotEmpty` (user-login.dto.ts:17-20)
- **입력 DTO(`@Query`/`@Body`/`@Param`)의 모든 필드는 검증 데코레이터를 최소 1개** — 제약이 없어도 `@IsOptional()`. `@ApiProperty` 는 Swagger 메타데이터라 계산에 안 들어가고, 검증 데코레이터가 0개인 필드는 `whitelist: true` 를 켜는 순간 조용히 사라진다(class-validator `ValidationExecutor`). 현재 whitelist 는 꺼져 있지만 선제적으로 붙인다. 응답 `ResultDto` 는 파이프를 타지 않으므로 대상이 아니다(검증 데코레이터 0개, `@ApiProperty({description})` 만).
- **`@ApiProperty`** — 요청 DTO 는 `{description}`, 선택 필드는 `required: false`, enum 은 `@IsIn` 과 같은 배열을 인라인으로 반복. 응답 DTO 의 nullable 필드는 `{nullable: true, type: String}`.
- **ValidationPipe 설정은 바꾸지 않는다** — 각 앱 main.ts 의 `{transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}` 그대로. `whitelist` 는 켜지 않는다(선언 안 된 필드는 걸러지지 않는다).
- **검증 위치**: 공개 입력은 게이트웨이 ValidationPipe 에서. 서비스 큐 컨트롤러는 재검증하지 않는다. 내부 HTTP 는 서비스 전역 파이프가 같은 DTO 로 한 번 더 검증한다(방어).
- 근거: [user-sign.dto.ts](../libs/contracts/src/user/dto/user-sign.dto.ts), [user-login.dto.ts](../libs/contracts/src/user/dto/user-login.dto.ts).

## Query DTO 는 생성자를 갖고, 컨트롤러가 `new` 로 만들어 넘긴다

> 적용: store 목록 3종 `StoreMyApplicationListDto` · `StoreApplicationListDto` · `StoreListDto`(libs/contracts/src/store/dto/), 컨트롤러는 게이트웨이 · admin-service 의 store.controller.ts. `PaginationDto` 는 `libs/common/src/dto/pagination.dto.ts`(기본값 상수 `PAGINATION_DEFAULTS`). 출처: 사용자 결정(2026-07-27).

1. `@Query()` 로 받는 DTO 는 **생성자를 세트로** 갖는다 — 쿼리는 키가 통째로 빠질 수 있고 그 누락은 정상 요청이라 잡아줄 검증기가 없다.
2. **컨트롤러가 `const dto = new XListDto(query);` 로 지역변수를 만든 뒤 service 에 넘긴다** — 받은 쿼리 객체를 그대로 흘리지 않고, 생성자를 한 번 태워 기본값이 확정된 인스턴스를 만든다. 호출부 `new` 인라인 ❌, 필드 하나씩 대입 ❌. 앞선 인자가 있으면 dto 를 마지막에 둔다 — `this.xService.list(user_id, dto)`.
3. **ValidationPipe 설정은 그대로** — 검증은 파이프, 기본값은 생성자로 책임을 나눈다.
4. **기본값을 `Pagination` 같은 하위 util 의 NaN 폴백에 맡기지 않는다** — util 의 방어 로직은 안전망이지 사양이 아니다. 페이지 기본값(`all_search_yn = 'N'`, `page = 1`, `size = 20`, `page_size = 10`)은 공통 `PaginationDto` 생성자가 책임지고, 기능별 Query DTO 는 `extends PaginationDto` 후 `super(data)` 호출 + 자기 필드만 추가한다.

```ts
export class StoreListDto extends PaginationDto {
    constructor(data?: Partial<StoreListDto>) {
        super(data);
        this.store_state_id = data?.store_state_id ?? null;
        this.keyword = data?.keyword ?? null;
    }
}

// controller
const dto = new StoreListDto(query);
return this.storeService.getStoreList(dto);
```

- **⚠️ 생성자 파라미터는 반드시 선택(`data?: Partial<T>`)** — `ValidationPipe({transform: true})` → class-transformer `plainToInstance` → `new targetType()` 을 **인자 없이** 호출한다. 파라미터를 필수로 두면 `data` 가 undefined 라 `data.page` 접근에서 **매 요청 500**. TypeScript 는 파이프의 리플렉션 호출을 못 보므로 컴파일에서 잡히지 않는다. 그래서 `data?.x ?? 기본값` 형태여야 파이프 경로와 컨트롤러 `new` 경로가 모두 산다.
- 참고: 파이프 경로에서는 생성자 실행 뒤 **요청에 들어온 키만** 덮어쓴다. 쿼리가 비어도 `{}` 로 넘어와 생성자는 똑같이 실행된다.
- **쿼리 값은 문자열로 들어온다** — `@Type`/`@Transform` 미사용 + `enableImplicitConversion` 미설정이라 `page: number` 로 선언해도 런타임 값은 `'2'`. service 에서 직접 산술하지 말고 `Pagination` 에 넘겨 `parseInt` 를 태운다.
- **상속 시 부모 필드 재선언 금지** — tsconfig `target: ES2023` → `useDefineForClassFields` 기본 true. 하위 클래스 필드 선언은 `super()` 뒤 `Object.defineProperty` 로 실행되므로 부모 생성자가 넣은 기본값이 `undefined` 로 덮인다.
- **`@Body()` · `@Param()` 에는 적용하지 않는다** — 생성자가 없어도 `new` 는 똑같이 실행되고, 다른 건 누락 처리다. Body 필수 필드는 누락이 곧 `@IsNotEmpty` 검증 실패(400)라 기본값이 낄 자리가 없고, path param 은 라우트가 성립하는 한 항상 존재한다. Query 의 `page`/`size` 만 누락이 정상 요청이다.
- 인접 함정(Body 쪽): **수정 API 의 선택 필드는 `?? null`** — TypeORM `update()` 는 `undefined` 필드를 무시하므로 `entity.x = dto.x` 로 두면 사용자가 값을 비워 보내도 기존 컬럼이 그대로 남는다.

## 서비스(비즈니스) 계층

- **public 메서드 1개 = API(또는 명령) 1개.** private 메서드 0건 — **service 내부 private 헬퍼 금지**, util 로 추출.
- **로그인 그룹 = 도메인** — 이용자 · 매니저 · 관리자는 각자 service(`UserService` · `ManagerService` · `AdminService`)에 자기 메서드를 둔다(로그인 · 재발급 · 비밀번호 변경이 도메인마다 있다). 조회 조건에 자기 그룹(`login_scope: LOGIN_SCOPE.MANAGER`)을 넣어 다른 그룹 계정은 없는 계정처럼 다룬다. 겹치는 순수 로직은 `libs/account` util 로 빼고, service 끼리 · 앱끼리 부르지 않는다.
- **엔티티는 `new XEntity()` + 필드 할당으로 생성**(insert · update 모두) — 객체 리터럴 ❌. 엔티티 인스턴스라야 `@BeforeInsert`/`@BeforeUpdate` 훅이 돌아 타임스탬프가 채워진다. 타임스탬프는 직접 넣지 않는다.
- **WHERE 는 service 가 `FindOptionsWhere<XEntity>` 로**(`In` · `LessThanOrEqual` 등 연산자 포함) 호출 인자 자리에서 만들고 repository 는 실행만.
- 규칙 위반은 HTTP 예외 throw, body `{message: '<한국어 문자열>'}`.
- **쓰기가 있는 메서드에 `@Transactional()`** — 세션을 insert 하는 login · tokenRefresh(세 도메인 모두)도 포함. 읽기만 하는 메서드(`getLoginUser` · `getLoginManager` · `getLoginAdmin`)에는 없다.
- service 는 `Request` · `Response` · AMQP 채널 같은 전송 계층 객체를 받지 않고 값만 받는다.
- **JSDoc 에 전송 경로를 표시한다** — `(RabbitMQ: user.member.sign)` / `(내부 HTTP: POST /internal/v1/user-service/user/login)` (user.service.ts 전 메서드 — 그룹별 API 가 함께 쓰는 메서드는 그 경로를 모두 적는다).
- 성공 결과는 현재 두 방식이 섞여 있다 — service 는 `XResultDto` 모양의 객체 리터럴을 반환하고(user.service.ts:114), util 은 `new XResultDto()` + 할당(user.util.ts:65). <!-- TODO: 결과 DTO 생성 방식 통일 여부 -->
- **crontab 은 service 가 아니다.** 시간이 트리거인 인바운드 어댑터로, API 가 아니므로 service 에 public 메서드를 만들지 않고 **repository 포트를 직접 주입**해 처리한다(apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts). 서비스 앱에는 두지 않는다. 본문은 `JobLockService.runExclusive` 로 감싼다([architecture.md](architecture.md)).

- **성인 기준(이용자 SNS 가입)** — 청소년보호법: 만 19세가 되는 해의 1월 1일부터 성인. `isAdult(birth, now)`(user.util.ts)는 한국 날짜의 올해 − 출생 연도 ≥ `ADULT_AGE`(19)로 판단하고 생일은 보지 않는다. 미성년자는 400 `UNDERAGE_MESSAGE` + `validation_errors.birth`.

## 공통 로직 분리

- **순수 함수 → util** (named `function`, `@Injectable` 없음): 전역 `libs/common/src/utils/`(bcrypt · hash · cipher · jwt · validation · fail-result · retry · pagination · env · id · kst), 서비스 앱 여러 개가 쓰는 계정 로직 `libs/account/src/utils/`(token · sms-verification · password — 엔티티를 만드는 `buildSmsVerification` 도 여기라 `account` 는 `database` 를 import 한다), 도메인 `apps/<app>/src/<domain>/<domain>.util.ts`, 인프라 모듈 전용 `<module>.util.ts`. 예외 — `Pagination` 은 계산 결과(`limit` · `offset` · `getPagination()`)를 들고 다니는 값 객체라 class 다.
- **DI · lifecycle · 외부연동 → `@Injectable`/`@Module`**: 여러 앱이 쓰면 libs, 한 앱만 쓰면 그 앱 안.
- 파일 안에서만 쓰는 헬퍼 함수는 export 하지 않고 둘 수 있다 — 인프라 · util 파일에 한한다(cipher.ts `getKey`, internal-auth.guard.ts `safeEqual`, typeorm-error.ts `driverErrorOf`). service 에는 두지 않는다.
- ID 는 하이픈 없는 UUID v4 32자 — 도메인은 `generateId()`(libs/common/src/utils/id.ts), 메시지는 `newMessageId()`(libs/messaging/src/messaging.util.ts:16). 구현이 같은 두 벌이다. <!-- TODO: newMessageId 를 generateId 로 합칠지 -->

## 메시지 상수

- 인프라 · 공통 실패 메시지는 export 되는 `UPPER_SNAKE_MESSAGE` 상수다 — `AUTH_INVALID_MESSAGE` · `FORBIDDEN_MESSAGE` · `INTERNAL_ONLY_MESSAGE` · `ACTOR_REQUIRED_MESSAGE` · `SERVICE_UNAVAILABLE_MESSAGE` · `COMMAND_PENDING_MESSAGE` · `BROKER_UNAVAILABLE_MESSAGE` · `UNHANDLED_FAIL_MESSAGE` · `PAYLOAD_TOO_LARGE_MESSAGE` · `VALIDATION_FALLBACK_MESSAGE`.
- repository 의 통일 500 문구는 파일 상수 `SERVER_ERROR_MESSAGE`(user.repository.ts:14).
- 비즈니스 메시지는 한 곳에서만 쓰면 throw 옆 인라인 한국어 리터럴. 반복되거나 여러 파일(service · repository)이 쓰면 도메인 `<domain>.constants.ts` 의 export `*_MESSAGE`(user.constants.ts — `UNDERAGE_MESSAGE` · `PHONE_TAKEN_MESSAGE` 등). 여러 도메인 · 앱이 함께 쓰는 계정 메시지 · 값 상수(`INVALID_LOGIN_MESSAGE` · `SMS_PURPOSE` · 한도 · `ACCOUNT_RECOVERY_STATES`)는 `libs/account/src/account.constants.ts` 다.

## 로깅

- 인프라 클래스만 `private readonly logger = new Logger(X.name)` 로 남긴다(command.dispatcher.ts · rabbitmq-*.ts · seeder.service.ts). 실행 스크립트는 `new Logger('Migration')`.
- 도메인 계층(service · repository · crontab · controller)은 로그를 남기지 않는다. `console.*` 0건.

## 기본 데이터(시드)

- 룩업 기본 데이터는 [seeder.targets.ts](../libs/database/src/seeder/seeder.targets.ts) 에 `<X>_SEED_DATA: XEntity[]` + `SEED_TARGETS` 한 줄로만 정의한다. 객체 리터럴 허용(정적 정의 데이터).
- **DTO 허용값(`@IsIn`)은 모두 시드에 있어야 한다**(없으면 FK 위반 400). SNS 시드는 가입 DTO 가 허용하는 GOOGLE · FACEBOOK · APPLE · KAKAO · LINE 에 NAVER 를 더 가진다(seeder.targets.ts:36).

## 금지 형식 요약

| 회피 | 대신 |
|---|---|
| 확장자 없는 상대 import, `require` | `.js` 확장자 ESM import |
| `@IsString`/`@IsNumber`/`@Type`/`@Transform` | 존재 + 형식/길이 + enum |
| `@Param('key')`, `any` 입력 | DTO + `@PassportActor()` |
| `ResponseDto` | `ResultDto` |
| `index.ts` barrel, 다른 앱 코드 import | 직접 경로, libs 로 이동 |
| service 의 DataSource · `txHost` · `Repository<T>` 직접 사용 | repository 포트 |
| service private 헬퍼 | util |
| controller 의 로직 · throw | service 위임 |
| 한 controller 파일에 동기 · 큐 혼합, `controllers/` 밖의 controller, `<domain>.handler.ts` | `controllers/<domain>.controller.ts` · `controllers/<domain>.controller.queue.ts` |
| 내부 HTTP 경로 문자열 직접 사용 | `<domain>.commands.ts` 의 경로 상수 |
| Swagger 응답 데코레이터의 `description` | `type` 만 |
| 타임스탬프 직접 할당, `@CreateDateColumn`/`@UpdateDateColumn` | `@BeforeInsert`/`@BeforeUpdate` 훅 |
| `@Column({unique: true})` | `@Unique('UK_…', [...])` |
| service 쓰기에서 객체 리터럴 엔티티 | `new XEntity()` + 할당 (객체 리터럴은 seeder.targets.ts 에서만) |
| 도메인 계층의 로그 · `console.*` | 인프라 클래스의 `Logger` |
