# Testing

jest 30 + ts-jest + `@nestjs/testing` + `supertest`. 설정 [jest.config.ts](../jest.config.ts)(`roots: ['<rootDir>/src']`, `testMatch: ['**/*.spec.ts']`, `passWithNoTests: true`, `@root/*` 매핑).

- 실행: `npm test`
- 단일: `npm test -- --testPathPatterns=<패턴>` (jest 30 `--testPathPatterns`).
- ⚠️ `npm run test:e2e` 는 참조 파일(`test/jest-e2e.json`)이 없는 **죽은 스크립트 — 사용 금지**(정리 대상).

## 위치 / 명명

- 도메인 HTTP spec: `src/api/v1/<domain>/test/<feature>.spec.ts` (kebab, 핸들러명 대응) — `user-sign.spec.ts`, `user-login.spec.ts`, `user-leave.spec.ts` 등.
- 인프라/모듈 spec: `src/modules/<module>/test/<name>.spec.ts` — `seeder.spec.ts`, api-log 의 interceptor/partition/repository spec(실측 예외: api-log spec 파일명은 camelCase `apiLogRepository.spec.ts` 등 — 도메인 spec 의 kebab 규칙과 다름).
- 순수 util spec: `src/common/utils/test/*.spec.ts`.
- 모두 코드 옆 `test/` 하위에 위치(상단 통합 `test/` 트리 ❌).

## 지배적 스타일 ① — HTTP boot + repository-only mock

controller 가 있는 기능:

```ts
jest.mock('typeorm-transactional', () => ({          // 최상단 — @Transactional pass-through
    Transactional: () => (_t, _k, d) => d,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));
// …
const module = await Test.createTestingModule({
    controllers: [UserController],
    providers: [
        UserService,
        { provide: USER_REPOSITORY, useValue: userRepository },   // repository 만 mock(Symbol 토큰)
        { provide: JwtService, useValue: { sign: jest.fn() } },
    ],
}).overrideGuard(PassportJwtAuthGuard).useValue({ canActivate: ... }).compile();

app = module.createNestApplication();
app.useGlobalFilters(new CustomErrorFilter());
app.useGlobalPipes(new ValidationPipe({ transform: true, forbidNonWhitelisted: true, exceptionFactory }));  // main.ts 재현
```

- 실제 controller + service + ValidationPipe + 필터를 부팅하고 **repository 만 Symbol 토큰으로 `jest.fn()` 주입**.
- 외부 순수 util(`isAdult`/`getBcrypt`/`sha256Hex`/`encryptAesGcm`/`extractJwtExpiresAt` 등)은 `jest.spyOn` + `mockRestore`.
- guard 는 `.overrideGuard(...).useValue({canActivate})` + `req.user={user_id}` 주입.
- 결정적 시간은 `jest.useFakeTimers()` + `jest.setSystemTime(FIXED_TIME)`, `afterEach` 복원 + `app.close()`.

## 지배적 스타일 ② — 직접 인스턴스화 (스케줄러·인프라)

controller 없는 service 는 HTTP boot 없이 mock 으로 직접 `new`:
- 스케줄러([user-leave-cleanup.spec.ts](../src/api/v1/user/test/user-leave-cleanup.spec.ts)): controller 없는 `Test.createTestingModule({providers})` 로 service 만 띄워 `processLeaveWait()` 직접 호출, `NODE_ENV` 토글로 운영 가드 검증.
- 인프라([seeder.spec.ts](../src/modules/seeder/test/seeder.spec.ts)): (a) 순수함수 `pickMissingRows` 블록 + (b) `new SeederService(dataSource)` 에 손수 만든 mock `DataSource`(`getRepository` → `metadata.primaryColumns`+`find`/`insert`) 주입. Nest 모듈 없음.

## 단언 강도

상태코드만 검사 금지. 호출된 mock 의 **횟수·인자(write 는 entity 컬럼 값)·실패 이후 `.not.toHaveBeenCalled()`** 까지 단언:
- 응답 body 필드 전부(토큰 4종, `null` 필드 등).
- `toHaveBeenCalledTimes`, 생성 엔티티 `toBeInstanceOf(XEntity)` + 컬럼별 값(생성 id 는 `/^[a-f0-9]{32}$/` 정규식), 순서 `toHaveBeenNthCalledWith`.
- 실패 분기 후 하위 write 전부 미호출(`expectNoWrites()` 헬퍼 패턴).
- **에러/검증 메시지는 한국어 리터럴 문자열로 단언**(소스의 메시지 리터럴과 동일 값).
- `describe` 는 분기 분류 태그: `[SUCCESS]` / `[FAIL:validation]` / `[FAIL:service]` / `[FAIL:duplicate]` / `[FAIL:repository]`.

## Data-Access Smoke (No-DB통합) — 미적용/규약

**mock 경계 = 검증 경계의 사각지대**: 이 프로젝트의 unit spec 은 repository(또는 raw `Repository<T>`)를 전부 mock 하므로, **쿼리 매핑 통합면 — where 필드→컬럼 해석, 쿼리 생성, 제약 에러 매핑, `@BeforeInsert/@BeforeUpdate` 훅, `loadRelationIds` — 를 실행하는 spec 이 0건**이다. 이 클래스의 버그(존재하지 않는 매핑 필드로 where 구성 등)는 현 테스트를 구조적으로 전부 통과한다.

- **매핑 민감 쿼리 구성**(다른 단계가 이 정의를 참조): 관계/조인 필드나 컬럼명이 프로퍼티명과 다른 필드에 대한 where 조건, 또는 동적으로 조립되는 쿼리(QueryBuilder, 문자열 조립). 현재 user 도메인은 프로퍼티=컬럼명 일치(snake_case 통일)라 위험 매핑이 없지만, 관계 필드 where(`state_id` 등 FK)·QueryBuilder 도입 시부터 해당된다.
- **smoke 규약(신규 해당 메서드부터 적용)**: TypeORM 은 무연결로 쿼리 빌드가 가능하다 — `new DataSource(opts)` 후 `buildMetadatas()` + `createQueryBuilder(...).getSql()`. 매핑 민감 쿼리를 쓰는 data-access 메서드는 ① 그 실제 where/criteria 가 throw 없이 SQL 문자열로 빌드되는지 spec 으로 확인하고, ② 프로퍼티명≠컬럼명인 위험 매핑 목록을 메타데이터에서 추출해 스냅샷 단언한다(새 위험 매핑 = 리뷰 강제). DB·외부 서비스 불요, `npm test` 에 포함.
- **강제 규칙**: 매핑 민감 쿼리 구성을 쓰는 메서드를 **repository-mock spec 만으로 커버하는 것은 금지** — smoke 케이스 필수(plan 의 `[SMOKE:data-access]` 항목).

## 규칙

- **실DB·외부 IO 금지**(모든 spec 상단 `typeorm-transactional` mock, repository/DataSource 는 mock). 예외: 위 Data-Access Smoke 는 무연결 쿼리 빌드라 실DB 아님.
- repository 는 항상 mock(Symbol 토큰), 메서드별 `mockResolvedValueOnce`/`mockRejectedValueOnce`.
- **공유 service 생성자에 DI 의존성 추가 시**: 그 service 를 `Test.createTestingModule` 로 부팅하는 **기존 모든 spec** 의 providers 에도 mock 추가(grep 전수). 누락 시 `Nest can't resolve dependencies` 로 fail.
