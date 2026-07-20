# Architecture

NestJS 11 + TypeORM 0.3(MySQL, `mysql2`) + passport-jwt + Swagger(`@nestjs/swagger`) + nestjs-i18n + `@nestjs/schedule` + typeorm-transactional. 단일 도메인(`user`) + 인프라 모듈 구성.

```
src/
├── api/v1/user/        # 유일한 도메인: controller → service → repository + 스케줄러(leave-cleanup)
├── common/             # 비도메인 공통: decorators, dto, utils(순수함수), i18n, language
├── config/             # typeorm.config.ts (기본 비즈니스 DataSource)
├── exception/          # CustomErrorFilter (전역 @Catch(Error))
├── guards/             # passport.jwt.auth(JWT, 적용) · roles(정의만, 미적용)
├── i18n/<lang>/        # 언어팩 yaml — ko/en/ja 3개
├── modules/            # 인프라 @Module: api-log(@Global,별도 DataSource) · queue(BullMQ,미적용) · typeorm · seeder
├── app.module.ts       # 유일한 모듈 집합점
└── main.ts             # 부트스트랩
```

## 레이어 경계 (controller → service → repository, 단방향)

- **controller** — 라우팅·guard·Swagger만, 로직 0. 핸들러는 service public 메서드를 1:1 위임([user.controller.ts](../src/api/v1/user/user.controller.ts)).
- **service** — 비즈니스 로직 + 트랜잭션 경계. 엔티티는 `new XEntity()`+필드할당으로 생성, repository 는 인터페이스 토큰으로 호출, 규칙 위반 시 HTTP 예외 throw([user.service.ts](../src/api/v1/user/user.service.ts)).
- **repository** — 유일하게 `@InjectRepository`(raw `Repository<T>`)를 쓰는 곳. 모든 IO/SQL + DB 에러 변환([user.repository.ts](../src/api/v1/user/repositories/user.repository.ts:14)).

controller 는 repository 를 직접 호출하지 않고, service 는 raw `Repository<T>` 를 직접 쓰지 않는다.

## Repository DI (Symbol 토큰 패턴)

```ts
// user.symbols.ts
export const USER_REPOSITORY = Symbol('UserRepositoryInterface');

// user.module.ts  providers
{ provide: USER_REPOSITORY, useClass: UserRepository }

// user.service.ts (consumer)
constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepositoryInterface,  // 인터페이스는 import type
) {}
```

인터페이스([interfaces/user.repository.interface.ts](../src/api/v1/user/interfaces/user.repository.interface.ts))는 `import type` 로 가져온다. api-log 도 동일 패턴(`API_LOG_REPOSITORY` + `useClass`).

## 모듈 등록 + Swagger 자동 등록

도메인 모듈에 메타데이터를 붙이면 `main.ts` 가 `Reflector` 로 읽어 Swagger 를 자동 생성한다.

```ts
@SetMetadata('type', 'API')
@SetMetadata('description', '회원')
@SetMetadata('path', 'user')
@Module({ ... })
export class UserModule {}
```

`app.module.ts` `imports` 에 모듈을 추가하면 `main.ts:81~` 의 reflector 루프가 `type==='API'` 모듈을 골라 `path`/`description` 으로 문서를 만든다.

## 인프라 모듈 현황

| 모듈 | 상태 | 비고 |
|---|---|---|
| `modules/typeorm` | 적용 | `TypeOrmModule.forRoot(typeOrmConfig)`, `autoLoadEntities:true`. UserModule·SeederModule·PassportJwtAuthModule 이 import |
| `modules/api-log` | 적용 | `@Global` + 전역 `ApiLogInterceptor`(main.ts) + **별도 DataSource `name:'apiLog'`** 로 로그 격리 + 월별 `@Cron` 파티션 유지 |
| `modules/seeder` | 적용 | 부팅 시 기본 데이터 멱등 시드(아래) |
| `modules/queue` | **미적용/규약** | BullMQ 인프라 완비(`@UseQueue`/`WriteQueueRegistry`)이나 **소비자 0건**. Redis 미기동 시 빈 모듈로 graceful. 신규 적용 시 규약 정립 필요 |

## 기본 데이터 시드 (seeder)

`SeederService implements OnApplicationBootstrap` 가 부팅 시 `SEED_TARGETS` 의 각 엔티티 기본 데이터 중 **PK 기준 미존재 행만** insert(멱등). 건별 실패는 warn 로그만 남기고 부팅을 막지 않는다.
- 기본 데이터는 [seeder.targets.ts](../src/modules/seeder/seeder.targets.ts) 에 `<X>_SEED_DATA` 배열 + `SEED_TARGETS` 레지스트리로 **단일 관리**(엔티티는 시드 데이터 보유 ❌). FK 의존 시 부모를 먼저 배치.
- 누락 계산은 순수함수 [seeder.util.ts `pickMissingRows`](../src/modules/seeder/seeder.util.ts).
- 신규 기본 데이터 추가: 엔티티는 그대로 두고 `seeder.targets.ts` 에 `<X>_SEED_DATA` 정의 + `SEED_TARGETS` 에 `{entity, data}` 한 줄 추가.

## 스케줄러 (@nestjs/schedule)

`ScheduleModule.forRoot()` 는 [app.module.ts](../src/app.module.ts) 에 **1회만** 등록(중복 금지). `@Cron` 사용처:
- [user.leave-cleanup.service.ts](../src/api/v1/user/user.leave-cleanup.service.ts) — `@Cron(EVERY_HOUR)` 탈퇴 예약 경과자 LEAVE 전환(운영 전용 `NODE_ENV==='production'` 가드). controller 없는 `@Cron` 전용 service.
- api-log 파티션 — `@Cron(EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)`.

## Transaction

`@Transactional()`(typeorm-transactional)을 쓰기 service 메서드에 부착(현재 user 의 5개 public 메서드 전부). 부트스트랩에서 `initializeTransactionalContext()`(main.ts 처음) + `addTransactionalDataSource(app.get(DataSource))`(main.ts 마지막).

## 부트스트랩 (main.ts)

- `initializeTransactionalContext()` → `bodyParser:false` + 수동 `bodyParser.json({verify})`(raw body 보존) → 전역 `CustomErrorFilter` → 전역 `ApiLogInterceptor` → `setI18nService` → Swagger 자동 등록 → 전역 `ValidationPipe`(custom exceptionFactory) → CORS → `addTransactionalDataSource` → `listen`.

## 새 도메인 추가 절차

1. `src/api/v1/<domain>/` 에 `controller`/`service`/`repository`(+`interfaces`,`<domain>.symbols.ts`,`<domain>.util.ts`)/`entities`/`dto`/`test` 생성.
2. repository 인터페이스 + Symbol 토큰 정의, 모듈에서 `{provide: TOKEN, useClass: XRepository}`.
3. 엔티티를 `TypeOrmModule.forFeature([...])` 에 등록, 모듈에 `@SetMetadata('type','API'|'description'|'path')`.
4. `app.module.ts` `imports` 에 모듈 추가.
5. i18n 키(ko/en/ja) 추가, 테스트 작성.

→ 레이어별 상세 규약: [conventions.md](conventions.md) · [data-layer.md](data-layer.md) · [error-handling.md](error-handling.md) · [api.md](api.md) · [testing.md](testing.md)
