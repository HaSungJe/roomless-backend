# Testing

Vitest 4 + `@nestjs/testing` + `supertest`. 설정 [vitest.config.ts](../vitest.config.ts), 전역 setup [vitest.setup.ts](../vitest.setup.ts).

## 무엇을 테스트하나 — service 기능 + repository

**spec 은 두 종류만 둔다**(사용자 결정 2026-10-23).

1. **service 기능 spec** — user-service · admin-service 의 API 가 부르는 service 기준, API(내부 HTTP · 큐 명령) 1개당 1개(`<domain>-<feature>.spec.ts`). 내부 controller · 큐 컨트롤러를 거쳐 service 를 부르고(스타일 ① · ②) 결과와 repository · 포트 호출을 단언한다. **repository 는 Symbol 토큰으로 mock 한다** — service 의 판단 · 흐름 · 넘기는 엔티티를 검증하고, repository 자체 코드는 실행하지 않는다.
2. **repository spec** — service spec 이 mock 으로 건너뛴 repository 자체 코드(`<domain>.repository.spec.ts`, 서비스 앱 · scheduler): DB 오류 → HTTP 예외 변환(제약명별 400 · 통일 500), 넘긴 조건 · 엔티티, **Data-Access Smoke**(QueryBuilder · raw select SQL 고정)(스타일 ③).

- 두지 않는다: controller 자체(게이트웨이 라우트 · 서비스 controller), util 단위(계산 표 `[CASES]`), 라이브러리(`libs/*`), 게이트웨이 인프라(가드 · 전송 · 설정), scheduler crontab.
- 스키마(엔티티 ↔ 마이그레이션)는 `npm run db:check`, 타입은 `npm run typecheck` 로 확인한다.

## 실행

- 수집: `include: apps/**/*.spec.ts · libs/**/*.spec.ts`, `exclude: .back/** · node_modules/** · dist/**` (vitest.config.ts:7). alias(`@app/<lib>/*`)는 `tsconfigPaths()` 플러그인이 tsconfig 경로로 해석한다(vitest.config.ts:6).
- `globals: true` + tsconfig `types: ["vitest/globals"]` — spec 은 `describe` · `it` · `expect` · `vi` 를 import 하지 않는다. vitest 에서 가져오는 것은 타입(`import type {Mock} from 'vitest'`)뿐.
- 실행: `npm test`(`vitest run`)
- 단일: `npm test -- <파일 경로 일부>`(예: `npm test -- user-sign`) — 경로 부분 문자열 필터라 여러 파일이 잡힐 수 있다(`user-leave` → leave · leave-cancel).
- 부가: `npm run test:watch` · `test:cov`(coverage-v8) · `test:debug`(`--inspect-brk --no-file-parallelism`)
- 타입: `npm run typecheck` — **Vitest 는 타입을 검사하지 않는다.** `FindOptionsWhere<X>` 필드명 오류, helper 의 repository mock 누락 등은 타입체크가 잡으므로 테스트와 함께 반드시 통과시킨다.
- 스키마: `npm run db:check` — 엔티티와 마이그레이션이 일치하는지(DB 없이 PGlite 로 계산).

## 위치 / 명명

| 대상 | 위치 · 이름 | 예 |
|---|---|---|
| 서비스 기능(큐 · 동기) | `apps/<app>/src/<domain>/test/<domain>-<feature>.spec.ts` | `user-sign.spec.ts` · `manager-password-reset.spec.ts` · `admin-login.spec.ts` |
| repository | 같은 폴더 `<domain>.repository.spec.ts` (서비스 앱 · scheduler) | `user.repository.spec.ts` · `manager.repository.spec.ts` |

- import: 자기 앱 소스는 **상대경로**, 라이브러리는 alias(`@app/<lib>/...js`).
- 도우미(수집 대상 아님 — `.spec.ts` 가 아니다): 도메인마다 하나 — [user.test-helper.ts](../apps/user-service/src/user/test/user.test-helper.ts) · [manager.test-helper.ts](../apps/admin-service/src/manager/test/manager.test-helper.ts) · [admin.test-helper.ts](../apps/admin-service/src/admin/test/admin.test-helper.ts)(같은 모양 — repository mock 이름만 다르다).
- 최상위 `describe` 제목: 큐 `'<type> — <한글> (큐 경로)'`, 동기 `'<METHOD> <경로> — <한글> (동기 경로)'`.

## 전역 setup

[vitest.setup.ts](../vitest.setup.ts) 가 모든 spec 에 적용한다 — spec 마다 반복하지 않는다.
- `vi.mock('@nestjs-cls/transactional', importOriginal)` 로 원본을 펼치고 `Transactional` 만 pass-through 로 바꾼다(repository 가 mock 이라 열 트랜잭션이 없다).
- `Logger.overrideLogger(false)` — 의도된 실패 경로의 에러 로그를 숨긴다.

## 도우미 — `<domain>.test-helper.ts`

| export | 용도 |
|---|---|
| `create<Domain>RepositoryMock()` | `{[K in keyof <Domain>RepositoryInterface]: Mock}` — **인터페이스 전 메서드를 강제**한다. repository 메서드를 추가하면 여기에도 추가해야 typecheck 를 통과한다 |
| `createJwtServiceMock(access, refresh)` | `sign` 이 `payload.type` 으로 토큰을 고른다 |
| `createSmsSenderMock()` | `{send: vi.fn().mockResolvedValue(undefined)}` — SMS 를 쓰는 도메인(user · manager)의 `bootCommandPath` · `bootHttpPath` 세 번째 인자 기본값. 발송 인자 · 순서(`invocationCallOrder`) · 실패 후 미호출을 단언 |
| `bootCommandPath(repo, jwt, sms?)` · `runCommand(dispatcher, {...})` | 스타일 ① |
| `bootHttpPath(repo, jwt, sms?)` · `internalHeaders(ip)` | 스타일 ② |
| `FIXED_TIME` · `TEST_REPLY_TO` · `TEST_INTERNAL_TOKEN` · `ID_PATTERN` | 고정 시각(`new Date(2026, 0, 1)`) · reply_to(`gw-test`) · 내부 토큰 · 생성 ID 형식(user 도우미) |

## 스타일 ① — 큐 경로

실제 큐 컨트롤러 · service · `CommandHandlerRegistry` · `CommandDispatcher` 를 부팅하고, 게이트웨이가 발행하는 것과 같은 봉투를 디스패처에 넣는다. registry 가 `@OnCommand` 핸들러를 찾도록 **`imports: [DiscoveryModule]` + `module.init()` 이 필수**다.

```ts
({dispatcher, module} = await bootCommandPath(repo, jwt));          // user.test-helper.ts
const {decision, command, result} = await runCommand(dispatcher, {type: USER_COMMAND.SIGN, payload: VALID_DTO, client_ip: '127.0.0.1'});

expect(decision.action).toBe('ack');                                // ack | requeue | dead
expect(decision.result?.type).toBe('user.member.sign.done');
expect(decision.result?.request_id).toBe(command.request_id);      // 회신이 같은 요청을 가리키는지
expect(result).toEqual({result: {...토큰}, error: null});
expect(repo.insertUser.mock.calls[0][0]).toEqual({...입력 데이터 전체});
```

- 실패: `result.error` 를 `{status_code, body: {message, validation_errors}}` 로 단언. 5xx 는 `delivery_count` 0 → `{action: 'requeue', result: null}`, 3 → dead + attempt 4 + failed(500). 커밋해야 하는 실패(반환된 예외)는 상태 코드와 무관하게 `ack` + failed.
- 로그인 필요 명령(`requireActor()`)은 `actor: null` 로 401 을 단언한다.
- 정리: `afterEach` 에서 `vi.clearAllMocks()` + `module.close()`.

## 스타일 ② — 동기 경로 (서비스 내부 HTTP)

실제 내부 controller + service + ValidationPipe(`validationExceptionFactory`) + `CustomErrorFilter` + 전역 `InternalAuthGuard`(APP_GUARD) + `ReturnedExceptionInterceptor`(APP_INTERCEPTOR) 를 부팅한다(서비스 루트 모듈과 같다). 요청에는 `internalHeaders(ip)` 로 내부 토큰 · 클라이언트 IP 헤더를 붙인다. 토큰 없는 요청이 403 인지도 단언한다. 정리는 `afterEach` 에서 `vi.clearAllMocks()` + `app.close()`.

**로그인 그룹 조건** — 도메인마다 조회 조건의 `login_scope` 를 단언하고(`findManager({..., login_scope: 'MANAGER'})`), 다른 그룹 계정은 그룹 조건 조회가 `null` 을 돌려주는 것으로 흉내 내 404(로그인) · 401(재발급 — 회원의 `login_scope` 가 다르면 refresh 만료 단축 · 새 refresh 없음)을 단언한다(manager-login.spec.ts · manager-token-refresh.spec.ts · admin-token-refresh.spec.ts).

## 스타일 ③ — repository

가짜 `txHost = {tx: {getRepository}}` 로 엔티티별 가짜 TypeORM repository(insert · findOne · update · count · createQueryBuilder)를 넘겨 `new XRepository(txHost)` 한다.
- 제약 위반은 `new QueryFailedError(..., Object.assign(new Error(), {code, constraint}))` 로 만들고 **제약명마다 `it.each`** 로 한국어 400, 그 밖의 오류는 통일 500 을 단언한다.
- 엔티티 인스턴스를 그대로 `insert` · `update` 에 넘기는지(`@BeforeInsert` · `@BeforeUpdate` 트리거), 조회가 `loadRelationIds: true` 인지 단언한다.

### Data-Access Smoke (DB 연결 없는 SQL 빌드)

repository 를 mock 하는 service spec 은 **쿼리 매핑 자체**(조인 조건, raw select 별칭, 관계 필드 where, 동적 조립)를 실행하지 않는다 — 이 종류의 버그는 service spec 을 전부 통과한다.
- **대상(매핑 민감 쿼리)**: QueryBuilder, raw select, 관계 필드 where, `Like()` · 배열 OR 같은 동적 조립을 쓰는 repository 메서드. 쿼리를 public 빌더 메서드로 분리하고(포트 인터페이스 밖) smoke 케이스로 **실제 SQL 과 파라미터를 고정**한다.
- **방법**: `beforeAll` 에서 접속하지 않는 DataSource 로 메타데이터만 만든다.
  ```ts
  const dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
  await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
  const repository = new UserRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
  const [sql, parameters] = repository.buildLoginUserQuery('u1').getQueryAndParameters();
  expect(parameters).toEqual(['u1', 'USER']);
  expect(sql.replace(/\s+/g, ' ')).toBe('SELECT ...');               // SQL 전체 고정
  ```
  raw select 는 select 별칭 목록이 결과 행 타입의 키와 같은지도 비교한다.
- 현재 적용: [user.repository.spec.ts](../apps/user-service/src/user/test/user.repository.spec.ts) `buildLoginUserQuery` · `buildConsumeSmsVerificationAttemptQuery`, [manager.repository.spec.ts](../apps/admin-service/src/manager/test/manager.repository.spec.ts) `buildLoginManagerQuery` · `buildConsumeSmsVerificationAttemptQuery`, [admin.repository.spec.ts](../apps/admin-service/src/admin/test/admin.repository.spec.ts) `buildLoginAdminQuery`, [store.repository.spec.ts](../apps/admin-service/src/store/test/store.repository.spec.ts) `buildApplicationListQuery` · `buildStoreListQuery`(ILike · 배열 OR) · `buildStoreFileRowsQuery`(용도 조인 · raw 별칭) · `buildAssignStoreFilesQuery` · `buildDeleteApplicationFilesQuery` · `buildUpdateStoreManagersQuery`, [scheduler user.repository.spec.ts](../apps/scheduler/src/user/test/user.repository.spec.ts) `buildUsersQuery`.

## mock 규칙

- **mock 경계**: repository(Symbol 토큰 `USER_REPOSITORY` · `MANAGER_REPOSITORY` · `ADMIN_REPOSITORY` · `STORE_REPOSITORY`) · 외부 연동 포트(Symbol 토큰 `SMS_SENDER` · `STORAGE_GATEWAY` — [integration.md](integration.md))와 `JwtService`(class 토큰)를 mock 하고, crypto · jwt util(`bcrypt` · `hash` · `cipher` · `jwt`)은 `vi.mock` 으로 막는다. service · controller(내부 HTTP · 큐) · 파이프 · 필터 · 가드 · 그 밖의 util(`libs/account` · 도메인 util)은 실제 코드다.
- **ESM 이라 `vi.spyOn(모듈, 'fn')` 은 쓸 수 없다.** 외부 util 은 spec 상단에서 모듈째 mock 한다.
  ```ts
  vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));
  vi.mock(import('@app/account/utils/sms-verification.js'), async (importOriginal) => ({...(await importOriginal()), generateVerificationCode: vi.fn(() => '123456')}));  // 일부만
  // beforeEach — 기본값
  vi.mocked(getBcrypt).mockResolvedValue(MOCK_HASH);
  // 케이스별 — mockResolvedValueOnce / mockRejectedValueOnce
  // afterEach
  vi.clearAllMocks();
  ```
- **외부 패키지**는 `vi.hoisted` 로 만든 mock 을 팩토리에서 쓴다(`vi.mock` 은 파일 맨 위로 올라가므로 바깥 변수를 그대로 못 쓴다). CJS 패키지는 `default` 로 감싼다.
- **시간**: 날짜만 필요하면 `vi.useFakeTimers({toFake: ['Date']})` + `vi.setSystemTime(FIXED_TIME)` — Date 만 가짜로 두어야 supertest 가 멈추지 않는다. `afterEach` 에서 `vi.useRealTimers()`. 타이머에 의존하는 로직은 전체 `vi.useFakeTimers()` + `advanceTimersByTimeAsync`.
- **환경변수**는 원래 값을 저장했다가 `afterEach` 에서 복원한다.
- 공유 service 생성자에 DI 를 추가하면 그 service 를 부팅하는 도우미(`bootCommandPath` · `bootHttpPath`)의 providers 에 mock 을 추가한다.

## 단언 강도

상태코드만 검사 금지. mock 의 **횟수 · 인자(쓰기는 엔티티 컬럼 값 전체) · 순서 · 실패 이후 `.not.toHaveBeenCalled()`** 까지.
- 응답 · 결과 본문 전체(`null` 필드 포함)를 `toEqual` 로. 생성 엔티티는 `toBeInstanceOf(XEntity)` + 컬럼별 값, 생성 ID 는 `ID_PATTERN`(`/^[a-f0-9]{32}$/`).
- WHERE 의 TypeORM 연산자도 그대로 단언한다 — `expect(repo.findUser).toHaveBeenCalledWith({state_id: In(['ACTIVE', 'BLOCK'])})`.
- 순서는 `mock.invocationCallOrder` 비교. 같은 메서드 여러 번은 `toHaveBeenNthCalledWith`.
- 실패 후 쓰기가 없었음은 개별 `.not.toHaveBeenCalled()` 또는 spec 안 묶음 헬퍼(`expectNoWrites()`).
- 노출되면 안 되는 값도 단언한다 — 500 본문에 내부 메시지가 없는지, 차단 사유가 정해진 경우에만 실리는지.
- **메시지는 한국어 리터럴로 단언**(소스와 같은 값). 여러 번 쓰면 spec 상단 상수로.
- 매개변수화는 `it.each` + `as const` 튜플 + 제목의 `%s`.

## 분류 태그

`describe` 또는 `it` 제목 앞에 붙인다. 뒤에 부연을 붙여도 된다(`'[FAIL:service] 401'`).

| 태그 | 뜻 |
|---|---|
| `[SUCCESS]` | 정상 |
| `[FAIL]` · `[FAIL:<원인>]` | 실패 — validation · service · duplicate · repository · internal · auth · route · business · infra |
| `[SECURITY]` | 보안 경계 |
| `[SMOKE:data-access]` | repository 의 Data-Access Smoke |

## 금지

- **실 DB · 실 브로커 · 외부 IO 금지.** service spec 은 repository mock, repository spec 은 가짜 `txHost.tx` · 접속 없는 DataSource, 브로커는 디스패처에 봉투를 직접 넣는다. (Data-Access Smoke 는 SQL 만 빌드하므로 예외가 아니다. `db:check` 의 PGlite 는 테스트 밖의 개발 도구다)
- 서버 기동(`app.listen`)은 하지 않는다 — `createNestApplication()` + `init()` + supertest.
- `.only` · `.skip` · `.todo` 를 커밋하지 않는다.
