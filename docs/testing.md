# Testing

Vitest 4 + `@nestjs/testing` + `supertest`. 설정 [vitest.config.ts](../vitest.config.ts), 전역 setup [vitest.setup.ts](../vitest.setup.ts).

- 수집: `include: apps/**/*.spec.ts · libs/**/*.spec.ts`, `exclude: .back/** · node_modules/** · dist/**` (vitest.config.ts:7). alias(`@app/<lib>/*`)는 `tsconfigPaths()` 플러그인이 tsconfig 경로로 해석한다(vitest.config.ts:6).
- `globals: true` + tsconfig `types: ["vitest/globals"]` — spec 은 `describe` · `it` · `expect` · `vi` 를 import 하지 않는다. vitest 에서 가져오는 것은 타입(`import type {Mock} from 'vitest'`)뿐.
- 실행: `npm test`(`vitest run`)
- 단일: `npm test -- <파일 경로 일부>`(예: `npm test -- user-sign`) — 경로 부분 문자열 필터라 여러 파일이 잡힐 수 있다(`user-leave` → leave · leave-cancel · leave-cleanup.crontab).
- 부가: `npm run test:watch` · `test:cov`(coverage-v8) · `test:debug`(`--inspect-brk --no-file-parallelism`)
- 타입: `npm run typecheck` — **Vitest 는 타입을 검사하지 않는다.** `FindOptionsWhere<X>` 필드명 오류, helper 의 repository mock 누락 등은 타입체크가 잡으므로 테스트와 함께 반드시 통과시킨다.
- 스키마: `npm run db:check` — 엔티티와 마이그레이션이 일치하는지(DB 없이 PGlite 로 계산).

## 위치 / 명명

모든 spec 은 **대상 코드 옆 `test/` 폴더**에 둔다.

| 대상 | 위치 · 이름 | 예 |
|---|---|---|
| 서비스 기능(큐 · 동기) | `apps/<app>/src/<domain>/test/<domain>-<feature>.spec.ts` | `user-sign.spec.ts` · `user-login.spec.ts` |
| 서비스 repository | 같은 폴더 `<domain>.repository.spec.ts` | `user.repository.spec.ts` |
| crontab (scheduler) | `apps/scheduler/src/<domain>/test/<domain>-<feature>.crontab.spec.ts` · repository smoke `user.repository.spec.ts` | `user-leave-cleanup.crontab.spec.ts` |
| 게이트웨이 라우트 | `apps/gateway/src/api/v1/<service>/<domain>/test/<domain>.controller.spec.ts` · `<domain>.controller.queue.spec.ts` (`controllers/` 의 controller 파일과 짝 — spec 은 도메인 폴더 `test/` 에 둔다) | `user.controller.queue.spec.ts` |
| 게이트웨이 인프라 · 가드 · 설정 | `apps/gateway/src/{modules/<module>,guards,config}/test/<소스 파일명>.spec.ts` | `command-stream.service.spec.ts` · `guards.spec.ts` · `cors.config.spec.ts` |
| 라이브러리 | `libs/<lib>/src/test/` 또는 `libs/<lib>/src/<폴더>/test/`, 이름은 소스 파일명 | `libs/messaging/src/test/command.dispatcher.spec.ts` · `libs/common/src/utils/test/retry.spec.ts` |

- 하위 폴더 소스의 spec 을 lib 의 `test/` 에 모으기도 한다 — `libs/database/src/test/job-lock.service.spec.ts` · `seeder.spec.ts`.
- 한 파일에 같은 영역의 클래스를 묶은 경우가 있다 — `guards.spec.ts`(전략 · 인증 가드 · 역할 가드), `rabbitmq-adapters.spec.ts`(연결 · 발행 · 결과 구독 · 명령 소비).
- import: 앱 spec 은 자기 앱 소스를 **상대경로**로, lib spec 은 자기 lib 도 **alias**(`@app/<lib>/...js`)로 가져온다.
- 도우미(수집 대상 아님 — `.spec.ts` 가 아니다): [user.test-helper.ts](../apps/user-service/src/user/test/user.test-helper.ts) · [manager.test-helper.ts](../apps/admin-service/src/manager/test/manager.test-helper.ts) · [admin.test-helper.ts](../apps/admin-service/src/admin/test/admin.test-helper.ts)(도메인마다 같은 모양 — repository mock 이름만 다르다), [fake-broker.ts](../apps/gateway/src/modules/transport/test/fake-broker.ts).
- 최상위 `describe` 제목: 큐 `'<type> — <한글> (큐 경로)'`, 동기 `'<METHOD> <경로> — <한글> (동기 경로)'`.

## 전역 setup

[vitest.setup.ts](../vitest.setup.ts) 가 모든 spec 에 적용한다 — spec 마다 반복하지 않는다.
- `vi.mock('@nestjs-cls/transactional', importOriginal)` 로 원본을 펼치고 `Transactional` 만 pass-through 로 바꾼다(repository 가 mock 이라 열 트랜잭션이 없다).
- `Logger.overrideLogger(false)` — 의도된 실패 경로의 에러 로그를 숨긴다.

## 도우미 — user.test-helper.ts

| export | 용도 |
|---|---|
| `createUserRepositoryMock()` | `{[K in keyof UserRepositoryInterface]: Mock}` — **인터페이스 전 메서드를 강제**한다. repository 메서드를 추가하면 여기에도 추가해야 typecheck 를 통과한다 |
| `createJwtServiceMock(access, refresh)` | `sign` 이 `payload.type` 으로 토큰을 고른다 |
| `createSmsSenderMock()` | `{send: vi.fn().mockResolvedValue(undefined)}` — `bootCommandPath` · `bootHttpPath` 의 세 번째 인자 기본값. 발송 인자 · 순서(`invocationCallOrder`) · 실패 후 미호출을 단언 |
| `bootCommandPath(repo, jwt, sms?)` · `runCommand(dispatcher, {...})` | 스타일 ① |
| `bootHttpPath(repo, jwt, sms?)` · `internalHeaders(ip)` | 스타일 ② |
| `FIXED_TIME` · `TEST_REPLY_TO` · `TEST_INTERNAL_TOKEN` · `ID_PATTERN` | 고정 시각(`new Date(2026, 0, 1)`) · reply_to(`gw-test`) · 내부 토큰 · 생성 ID 형식 |

## 스타일 ① — 큐 경로 (서비스)

실제 `UserQueueController` · `UserService` · `CommandHandlerRegistry` · `CommandDispatcher` 를 부팅하고, 게이트웨이가 발행하는 것과 같은 봉투를 디스패처에 넣는다. registry 가 `@OnCommand` 핸들러를 찾도록 **`imports: [DiscoveryModule]` + `module.init()` 이 필수**다.

```ts
({dispatcher, module} = await bootCommandPath(repo, jwt));          // user.test-helper.ts
const {decision, command, result} = await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: VALID_DTO, client_ip: '127.0.0.1'});

expect(decision.action).toBe('ack');                                // ack | requeue | dead
expect(decision.result?.type).toBe('user.member.sign.done');
expect(decision.result?.request_id).toBe(command.request_id);      // 회신이 같은 요청을 가리키는지
expect(result).toEqual({result: {...토큰}, error: null});
expect(repo.insertUser.mock.calls[0][0]).toEqual({...입력 데이터 전체});
```

- 실패: `result.error` 를 `{status_code, body: {message, validation_errors}}` 로 단언. 5xx 는 `delivery_count` 0 → `{action: 'requeue', result: null}`, 3 → dead + attempt 4 + failed(500).
- 로그인 필요 명령(`requireActor()`)은 `actor: null` 로 401 을 단언한다.
- 정리: `afterEach` 에서 `vi.clearAllMocks()` + `module.close()`.

## 스타일 ② — 동기 경로 (서비스 내부 HTTP)

실제 내부 controller + service + ValidationPipe(`validationExceptionFactory`) + `CustomErrorFilter` + 전역 `InternalAuthGuard`(APP_GUARD) + `ReturnedExceptionInterceptor`(APP_INTERCEPTOR) 를 부팅한다(user-service.module 과 같다). 요청에는 `internalHeaders(ip)` 로 내부 토큰 · 클라이언트 IP 헤더를 붙인다. 토큰 없는 요청이 403 인지도 단언한다. 정리는 `afterEach` 에서 `vi.clearAllMocks()` + `app.close()`.

## 스타일 ③ — 게이트웨이

**라우트** — spec 은 controller 파일과 같이 나눈다. 둘 다 필터 + 파이프를 실제로 부팅하고, mock 은 `beforeEach` 에서 새로 만든다(`afterEach` 는 `app.close()` 만).
- 동기 `test/<domain>.controller.spec.ts`: 실제 `UserController`, `InternalHttpClient` 는 `{request: vi.fn()}`. 호출 인자 `('user', 'POST', 내부경로, {body, client_ip})` 를 단언한다. 모듈이 두 controller 를 `[동기, 큐]` 순으로 등록하는지 `Reflect.getMetadata('controllers', XModule)` 로 단언한다.
- 큐 `test/<domain>.controller.queue.spec.ts`: 실제 `UserQueueController` + `CommandStreamService`, **`FakeBroker`** 를 `COMMAND_PUBLISHER` · `RESULT_SUBSCRIBER` 로, `GATEWAY_INSTANCE_ID` 는 `'gw-test'`. 인증 라우트가 있으므로 `.overrideGuard(PassportJwtAuthGuard)` 로 `request.user` 를 주입하고, 플래그(`authenticated = false`)로 401 을 만든다. 그룹 라우트는 **그 그룹의 가드**(`PassportJwtAuthGuard` · `PassportJwtManagerAuthGuard` · `PassportJwtAdminAuthGuard`)를 override 한다 — 컨트롤러가 다른 그룹 가드를 쓰면 override 가 적용되지 않아 테스트가 실패한다. 다른 그룹 토큰의 401 은 가드 단위(`guards.spec.ts` 의 그룹별 전략)에서 단언한다.
- 두 spec 모두 **다른 경로의 라우트가 404** 인지 단언한다(섞여 들어가지 않았는지). 없앤 라우트(이용자 `/general-sign` · `/password` 등)와 그 그룹에 없는 라우트(관리자 `/find-login-id`)도 404 로 고정한다.
- SSE: 헤더(`text/event-stream` · `no-cache`) → supertest 가 받은 본문을 `parseSse()` 로 읽어 이벤트 순서(accepted → done/failed)와 data 를 단언한다. failed 의 data 는 `{status_code, ...본문}`.
- 발행된 명령(`broker.published[0]`)의 type · actor · payload · `meta.reply_to` 를 단언한다. 검증 · 발행 실패는 스트림을 열지 않고 일반 JSON 400/503 — 발행 0건과 `pendingCount() === 0` 을 단언한다.
- `FakeBroker`: `published` · `reply` · `replyBeforeConfirm` · `publishError`, 결과는 `setImmediate` 로 다음 tick 에 넘긴다. 결과 생성은 `replyDone` · `replyFailed`.

**transport 단위**
- `CommandStreamService`: `new` + `onModuleInit()`, EventEmitter 기반 가짜 express 응답으로 경쟁(결과가 confirm 보다 먼저) · 타임아웃 · 클라이언트 끊김 · 종료(`onModuleDestroy`)를 단언.
- `InternalHttpClient`: `vi.spyOn(globalThis, 'fetch')` + `afterEach` 에서 `mockRestore()`. URL · method · body · 헤더 전체 · `AbortSignal`, 네트워크 실패 503.

**가드 · 설정**
- 가드: 그룹별 전략 `new PassportJwtAuthStrategy(mock).validate()`(서비스 `'user'`) · `PassportJwtManagerAuthStrategy` · `PassportJwtAdminAuthStrategy`(서비스 `'admin'`, 그룹 경로)를 `describe.each` 로, 그룹별 가드 `handleRequest()`, `new RolesGuard(Reflector mock)` + 손수 만든 `ExecutionContext`. 동기 throw 는 try/catch 안에서 `expect.unreachable()` 로 확인.
- 설정(CORS · trust proxy): 순수 함수는 별도 `describe` 에서 직접 호출하고, 동작은 spec 안에 둔 **프로브 controller**(`@Controller('/probe')`)를 테스트마다 `boot(값)` 으로 띄워 supertest 로 확인한다.

**로그인 그룹 조건(서비스)** — 도메인마다 조회 조건의 `login_scope` 를 단언하고(`findManager({..., login_scope: 'MANAGER'})`), 다른 그룹 계정은 그룹 조건 조회가 `null` 을 돌려주는 것으로 흉내 내 404(로그인) · 401(재발급 — 회원의 `login_scope` 가 다르면 refresh 만료 단축 · 새 refresh 없음)을 단언한다(manager-login.spec.ts · manager-token-refresh.spec.ts · admin-token-refresh.spec.ts).

## 스타일 ④ — 직접 인스턴스화 (controller 없는 대상)

부팅 없이 `new` 하거나 providers 만 띄운다.

| 대상 | 방법 |
|---|---|
| crontab | `Test.createTestingModule({providers: [Crontab, {provide: USER_REPOSITORY, useValue: repo}, {provide: JobLockService, useValue: jobLock}]})`. `jobLock.runExclusive` 는 기본 `(await job(), true)`, 다른 인스턴스가 잡은 경우는 `mockResolvedValueOnce(false)` 로 미실행을 단언. 잠금 키와 `NODE_ENV` 운영 가드(저장 · 토글 · 복원)를 단언 |
| `JobLockService` | `new JobLockService({createQueryRunner: () => runner})`, runner 의 connect · query · release mock — 실행한 SQL · 파라미터 전체를 단언 |
| `SeederService` | 가짜 DataSource(`getRepository` → 엔티티별 find · insert · `metadata.primaryColumns` · `tableName`), 입력 순서는 `invocationCallOrder` |
| repository | 가짜 `txHost = {tx: {getRepository}}`. 제약 위반은 `new QueryFailedError(..., Object.assign(new Error(), {code, constraint}))` 로 만들고 **제약명마다 `it.each`** 로 한국어 400, 그 밖은 통일 500. 엔티티 인스턴스를 그대로 넘기는지, `loadRelationIds` 를 쓰는지 단언 |
| `CommandDispatcher` | `new CommandHandlerRegistry({} as DiscoveryService, ...)` → `registry.add(...)` → `new CommandDispatcher(registry)` |
| `CommandHandlerRegistry` | spec 안 `@OnCommand` 샘플 핸들러 + `DiscoveryModule` + `module.init()`. 중복 등록이면 `init()` reject |
| RabbitMQ 어댑터 | `vi.mock('amqplib', ...)` + 가짜 channel · model · message, 연결 · 디스패처 mock 을 생성자에 주입 |
| AWS 어댑터 | `vi.hoisted` + `vi.mock('@aws-sdk/client-sns' · '@aws-sdk/client-s3' · '@aws-sdk/s3-request-presigner')` — 가짜 Client(`send`) · Command(`input` 보관). 보낸 명령의 input · 오류 → 503 · 404 → false 를 단언. env 는 저장 · 복원 |
| `CustomErrorFilter` · `InternalAuthGuard` | 필터는 spec 안 프로브 DTO · controller 로 부팅, 가드는 `new` + 헤더만 가진 컨텍스트 |
| 순수 util | 직접 호출(fail-result · validation · retry · messaging.util · typeorm-error). bcrypt util 은 mock 없이 실제로 해시한다(낮은 라운드) |

## mock 규칙

- **mock 경계**: 서비스 spec 은 repository(Symbol 토큰 `USER_REPOSITORY`) · 외부 연동 포트(Symbol 토큰 `SMS_SENDER` · `STORAGE_GATEWAY` — [integration.md](integration.md))와 `JwtService`(class 토큰)를 mock 하고, crypto · jwt util(`bcrypt` · `hash` · `cipher` · `jwt`)은 `vi.mock` 으로 막는다. service · controller(내부 HTTP · 큐) · 파이프 · 필터 · 가드는 실제 코드다.
- **ESM 이라 `vi.spyOn(모듈, 'fn')` 은 쓸 수 없다.** 외부 util 은 spec 상단에서 모듈째 mock 한다.
  ```ts
  vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));
  vi.mock(import('../user.util.js'), async (importOriginal) => ({...(await importOriginal()), isAdult: vi.fn()}));  // 일부만
  // beforeEach — 기본값
  vi.mocked(getBcrypt).mockResolvedValue(MOCK_HASH);
  // 케이스별 — mockResolvedValueOnce / mockRejectedValueOnce
  // afterEach
  vi.clearAllMocks();
  ```
- **외부 패키지**는 `vi.hoisted` 로 만든 mock 을 팩토리에서 쓴다(`vi.mock` 은 파일 맨 위로 올라가므로 바깥 변수를 그대로 못 쓴다). CJS 패키지는 `default` 로 감싼다.
  ```ts
  const amqpConnect = vi.hoisted(() => vi.fn());
  vi.mock('amqplib', () => ({default: {connect: amqpConnect}}));
  ```
- **시간** — 두 가지를 구분한다.
  - 날짜만 필요: `vi.useFakeTimers({toFake: ['Date']})` + `vi.setSystemTime(FIXED_TIME)` — Date 만 가짜로 두어야 supertest · setImmediate 가 멈추지 않는다. `afterEach` 에서 `vi.useRealTimers()`.
  - 타이머에 의존하는 로직(SSE 타임아웃 · retry 대기): 전체 `vi.useFakeTimers()` + `advanceTimersByTime`(비동기 대기는 `advanceTimersByTimeAsync`), `try/finally` 또는 `afterEach` 로 `useRealTimers()`.
- **환경변수**는 원래 값을 저장했다가 `afterEach` 에서 복원한다.
- 공유 service 생성자에 DI 를 추가하면 그 service 를 부팅하는 모든 spec · 도우미(`bootCommandPath` · `bootHttpPath`)의 providers 에 mock 을 추가한다.

## 단언 강도

상태코드만 검사 금지. mock 의 **횟수 · 인자(쓰기는 엔티티 컬럼 값 전체) · 순서 · 실패 이후 `.not.toHaveBeenCalled()`** 까지.
- 응답 · 결과 본문 전체(`null` 필드 포함)를 `toEqual` 로. 생성 엔티티는 `toBeInstanceOf(XEntity)` + 컬럼별 값, 생성 ID 는 `ID_PATTERN`(`/^[a-f0-9]{32}$/`).
- WHERE 의 TypeORM 연산자도 그대로 단언한다 — `expect(repo.findUser).toHaveBeenCalledWith({state_id: In(['ACTIVE', 'BLOCK'])})`.
- 순서는 `mock.invocationCallOrder` 비교. 같은 메서드 여러 번은 `toHaveBeenNthCalledWith`.
- 실패 후 쓰기가 없었음은 개별 `.not.toHaveBeenCalled()` 또는 spec 안 묶음 헬퍼(`expectNoWrites()`).
- 예외는 `.catch((e: unknown) => e)` 로 받아 `toBeInstanceOf` + `getResponse()`, 또는 `.rejects`.
- 노출되면 안 되는 값도 단언한다 — 500 본문에 내부 메시지가 없는지, 차단 사유가 정해진 경우에만 실리는지.
- **메시지는 한국어 리터럴로 단언**(소스와 같은 값). 여러 번 쓰면 spec 상단 상수로.
- 매개변수화는 `it.each` + `as const` 튜플 + 제목의 `%s`.

## 분류 태그

`describe` 또는 `it` 제목 앞에 붙인다(서비스 기능 · dispatcher · seeder 는 `describe`, 게이트웨이 · 단위 spec 은 주로 `it`). 뒤에 부연을 붙여도 된다(`'[FAIL:service] 401'`).

| 태그 | 뜻 |
|---|---|
| `[SUCCESS]` | 정상 |
| `[FAIL]` · `[FAIL:<원인>]` | 실패 — validation · service · duplicate · repository · internal · broker · auth · route · network · item · target · business · infra · message · unhandled · empty |
| `[SKIP]` | 조건이 맞지 않아 아무것도 하지 않음(운영 가드 · 잠금 실패) |
| `[SECURITY]` | 보안 경계(발행자 검증 · user_id 덮어쓰기) |
| `[RACE]` · `[TIMEOUT]` · `[DISCONNECT]` · `[SHUTDOWN]` | 경쟁 · 시간 초과 · 연결 끊김 · 종료 |
| `[COMPAT]` | 기존 데이터와의 호환 |
| `[SMOKE:data-access]` | 아래 Data-Access Smoke |
| `[CASES:<unit>]` | 계산형 유닛의 입력→출력 표 — 기획(plan)에서 합의한 케이스만 (`pagination.spec.ts` · `integration.util.spec.ts`) |

## Data-Access Smoke (DB 연결 없는 SQL 빌드)

repository 를 mock 하는 spec 은 **쿼리 매핑 자체**(조인 조건, raw select 별칭, 관계 필드 where, 동적 조립)를 실행하지 않는다. 이 종류의 버그는 mock spec 을 전부 통과한다.

- **대상(매핑 민감 쿼리)**: QueryBuilder, raw select, 관계 필드 where, `Like()` · 배열 OR 같은 동적 조립을 쓰는 repository 메서드.
- **규칙**: 대상 메서드는 쿼리를 빌더 메서드로 분리(`buildLoginUserQuery` · scheduler `buildUsersQuery` — find 와 같은 `setFindOptions` 빌더)하고, smoke 케이스로 **실제 SQL 과 파라미터를 고정**한다. repository-mock spec 만으로 커버하는 것은 금지.
- **방법**: `beforeAll` 에서 접속하지 않는 DataSource 로 메타데이터만 만든다.
  ```ts
  const dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
  (dataSource as unknown as {buildMetadatas: () => void}).buildMetadatas();
  const repository = new UserRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
  const [sql, parameters] = repository.buildLoginUserQuery('u1').getQueryAndParameters();
  expect(parameters).toEqual(['u1']);
  expect(sql.replace(/\s+/g, ' ')).toBe('SELECT ...');               // SQL 전체 고정
  ```
  raw select 는 select 별칭 목록이 결과 행 타입의 키와 같은지도 비교한다.
- 현재 적용: [user.repository.spec.ts](../apps/user-service/src/user/test/user.repository.spec.ts) `buildLoginUserQuery` · `buildConsumeSmsVerificationAttemptQuery`, [manager.repository.spec.ts](../apps/admin-service/src/manager/test/manager.repository.spec.ts) `buildLoginManagerQuery` · `buildConsumeSmsVerificationAttemptQuery`, [admin.repository.spec.ts](../apps/admin-service/src/admin/test/admin.repository.spec.ts) `buildLoginAdminQuery` — 세 도메인의 로그인 회원 조회는 그룹 조건(`login_scope = $2`)까지 SQL 로 고정한다.
- 스키마 자체(엔티티 ↔ 마이그레이션)는 테스트가 아니라 `npm run db:check` 로 확인한다.

## 금지

- **실 DB · 실 브로커 · 외부 IO 금지.** 브로커는 FakeBroker · 가짜 채널, DB 는 repository mock 또는 가짜 `txHost.tx` · DataSource. (Data-Access Smoke 는 접속 없이 SQL 만 빌드하므로 예외가 아니다. `db:check` 의 PGlite 는 테스트 밖의 개발 도구다)
- 서버 기동(`app.listen`)은 하지 않는다 — `createNestApplication()` + `init()` + supertest.
- `.only` · `.skip` · `.todo` 를 커밋하지 않는다.
