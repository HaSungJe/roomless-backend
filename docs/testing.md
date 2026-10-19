# Testing

Vitest 4 + `@nestjs/testing` + `supertest`. 설정 [vitest.config.ts](../vitest.config.ts)(`include: apps/** · libs/** *.spec.ts`, tsconfig alias 해석), 전역 setup [vitest.setup.ts](../vitest.setup.ts).

- 실행: `npm test`
- 단일: `npm test -- <파일명 일부>` (예: `npm test -- user-sign`)
- 타입: `npm run typecheck` — **Vitest 는 타입을 검사하지 않는다.** `FindOptionsWhere<X>` 필드명 오류 등은 타입체크가 잡으므로 테스트와 함께 반드시 통과시킨다.
- 스키마: `npm run db:check` — 엔티티와 마이그레이션이 일치하는지(DB 없이 PGlite 로 계산).

## 위치 / 명명

- 기능 spec: `apps/<app>/src/<domain>/test/<domain>-<feature>.spec.ts` (예: `user-sign.spec.ts`, `user-leave-cleanup.crontab.spec.ts`, `user.repository.spec.ts`)
- 라이브러리 spec: `libs/<lib>/src/**/test/*.spec.ts`
- 도우미(수집 대상 아님): `<domain>/test/<domain>.test-helper.ts`, 게이트웨이 `modules/transport/test/fake-broker.ts`
- 모두 코드 옆 `test/` 하위.

## 전역 setup

[vitest.setup.ts](../vitest.setup.ts) 가 모든 spec 에 적용한다 — spec 마다 반복하지 않는다.
- `@nestjs-cls/transactional` 의 `@Transactional()` 을 pass-through 로 mock (repository 가 mock 이라 열 트랜잭션이 없다).
- `Logger.overrideLogger(false)` — 의도된 실패 경로의 에러 로그를 숨긴다.

## 스타일 ① — 큐 경로 (서비스)

실제 `UserCommandHandler` · `UserService` · `CommandHandlerRegistry` · `CommandDispatcher` 를 부팅하고 **repository 만 Symbol 토큰으로 `vi.fn()` 주입**, 게이트웨이가 발행하는 것과 같은 봉투를 디스패처에 넣는다.

```ts
({dispatcher, module} = await bootCommandPath(repo, jwt));          // user.test-helper.ts
const {decision, result} = await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: VALID_DTO, client_ip: '127.0.0.1'});

expect(decision.action).toBe('ack');                                // ack | requeue | dead
expect(decision.result?.type).toBe('user.member.sign.done');
expect(result).toEqual({result: {...토큰}, error: null});
expect(repo.insertUser.mock.calls[0][0]).toEqual({...입력 데이터 전체});
```

- 실패: `result.error` 를 `{status_code, body: {message, validation_errors}}` 로 단언. 5xx 는 `delivery_count` 0 → requeue, 3 → dead + failed(500).
- 로그인 필요 명령은 `actor: null` 로 401 을 단언한다.

## 스타일 ② — 동기 경로 (서비스 내부 HTTP)

실제 내부 controller + service + ValidationPipe(`validationExceptionFactory`) + `CustomErrorFilter` + `InternalAuthGuard` 를 부팅, repository 만 mock. 요청에는 `internalHeaders(ip)` 로 내부 토큰 · 클라이언트 IP 헤더를 붙인다. 토큰 없는 요청이 403 인지도 단언한다.

## 스타일 ③ — 게이트웨이

- 라우트 spec 은 controller 파일과 같이 나눈다. 둘 다 필터 + 파이프를 실제로 부팅한다.
  - 동기 `test/<domain>.controller.spec.ts`: 실제 `UserController`, `InternalHttpClient` 는 `useValue` mock.
  - 큐 `test/<domain>.controller.queue.spec.ts`: 실제 `UserQueueController` + `CommandStreamService`, **`FakeBroker`** 를 `COMMAND_PUBLISHER` · `RESULT_SUBSCRIBER` 로.
  - 인증 가드는 `.overrideGuard(PassportJwtAuthGuard)` 로 `request.user` 주입. 다른 경로의 라우트는 404 인지도 단언한다(섞여 들어가지 않았는지).
- SSE 는 supertest 가 스트림 종료까지 받은 본문을 `parseSse()` 로 읽어 이벤트 순서(accepted → done/failed)와 data 를 단언한다.
- 발행된 명령(`broker.published[0]`)의 type · actor · payload · `meta.reply_to` 를 단언한다.
- `CommandStreamService` 단위: 가짜 express 응답으로 경쟁(결과가 confirm 보다 먼저) · 타임아웃(`vi.useFakeTimers()`) · 클라이언트 끊김 · 종료를 단언.
- `InternalHttpClient`: `vi.spyOn(globalThis, 'fetch')` + `mockRestore`.

## 스타일 ④ — 직접 인스턴스화

controller 가 없는 대상은 부팅 없이 `new` 또는 providers 만 띄운다.
- crontab: `Test.createTestingModule({providers: [Crontab, {provide: USER_REPOSITORY, useValue: repo}, {provide: JobLockService, useValue: jobLock}]})` — `jobLock.runExclusive` 는 기본으로 작업을 실행하고 true, 다른 인스턴스가 잡은 경우는 `mockResolvedValueOnce(false)` 로 미실행을 단언. `NODE_ENV` 토글로 운영 가드 단언.
- seeder · repository · 메시징 어댑터: 손수 만든 가짜(`txHost.tx` · 채널 · 연결)를 생성자에 주입.

## mock 규칙

- **ESM 이라 `vi.spyOn(모듈, 'fn')` 은 쓸 수 없다.** 외부 util 은 spec 상단에서 모듈째 mock 한다.
  ```ts
  vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));
  vi.mock(import('../user.util.js'), async (importOriginal) => ({...(await importOriginal()), isAdult: vi.fn()}));  // 일부만
  // beforeEach
  vi.mocked(getBcrypt).mockResolvedValue(MOCK_HASH);
  // afterEach
  vi.clearAllMocks();
  ```
- 시간: `vi.useFakeTimers({toFake: ['Date']})` + `vi.setSystemTime(FIXED_TIME)` — Date 만 가짜로 두어야 supertest · setImmediate 가 멈추지 않는다. `afterEach` 에서 `vi.useRealTimers()`.
- repository 는 항상 mock, 메서드별 `mockResolvedValueOnce`/`mockRejectedValueOnce`.
- 공유 service 생성자에 DI 를 추가하면 그 service 를 부팅하는 모든 spec · 도우미(`bootCommandPath` · `bootHttpPath`)의 providers 에 mock 을 추가한다.

## 단언 강도

상태코드만 검사 금지. mock 의 **횟수 · 인자(쓰기는 엔티티 컬럼 값 전체) · 순서 · 실패 이후 `.not.toHaveBeenCalled()`** 까지.
- 응답 · 결과 본문 전체(`null` 필드 포함). 생성 엔티티는 `toBeInstanceOf(XEntity)` + 컬럼별 값, 생성 ID 는 `ID_PATTERN`(`/^[a-f0-9]{32}$/`).
- WHERE 의 TypeORM 연산자도 그대로 단언한다 — `expect(repo.findUser).toHaveBeenCalledWith({state_id: In(['ACTIVE', 'BLOCK'])})`.
- 순서는 `mock.invocationCallOrder` 비교.
- **메시지는 한국어 리터럴로 단언**(소스와 같은 값).
- `describe` 분류: `[SUCCESS]` / `[FAIL:validation]` / `[FAIL:service]` / `[FAIL:duplicate]` / `[FAIL:repository]` / `[FAIL:internal]` / `[FAIL:broker]` 등.

## Data-Access Smoke (DB 연결 없는 SQL 빌드)

repository 를 mock 하는 spec 은 **쿼리 매핑 자체**(조인 조건, raw select 별칭, 관계 필드 where, 동적 조립)를 실행하지 않는다. 이 종류의 버그는 mock spec 을 전부 통과한다.

- **대상(매핑 민감 쿼리)**: QueryBuilder, raw select, 관계 필드 where, `Like()` · 배열 OR 같은 동적 조립을 쓰는 repository 메서드.
- **규칙**: 대상 메서드는 쿼리를 빌더 메서드로 분리(`buildLoginUserQuery`)하고, smoke 케이스로 **실제 SQL 과 파라미터를 고정**한다. repository-mock spec 만으로 커버하는 것은 금지.
- **방법**: 접속하지 않는 DataSource 로 메타데이터만 만든다.
  ```ts
  const dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
  (dataSource as unknown as {buildMetadatas: () => void}).buildMetadatas();
  const repository = new UserRepository({tx: dataSource.manager} as never);
  const [sql, parameters] = repository.buildLoginUserQuery('u1').getQueryAndParameters();
  ```
- 최초 적용: [user.repository.spec.ts](../apps/user-service/src/user/test/user.repository.spec.ts) `[SMOKE:data-access]`.
- 스키마 자체(엔티티 ↔ 마이그레이션)는 테스트가 아니라 `npm run db:check` 로 확인한다.

## 금지

- **실 DB · 실 브로커 · 외부 IO 금지.** 브로커는 FakeBroker · 가짜 채널, DB 는 repository mock 또는 가짜 `txHost.tx`. (Data-Access Smoke 는 접속 없이 SQL 만 빌드하므로 예외가 아니다. `db:check` 의 PGlite 는 테스트 밖의 개발 도구다)
- 서버 기동(`app.listen`)은 하지 않는다 — `createNestApplication()` + `init()` + supertest.
