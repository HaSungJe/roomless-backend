# CLAUDE.md

## Beaver 설정

이 프로젝트는 [Beaver](https://github.com/HaSungJe/beaver)로 관리된다. 각 단계는 슬래시/자연어로 발동(동일 동작):

| 단계 | 슬래시 | 자연어 |
|---|---|---|
| 분석(1회) | `/beaver:analyze` | "코드베이스 분석" |
| 기획 | `/beaver:plan <기능명>` | "<기능명> 기획", "기능 생성/수정" |
| 구현 | `/beaver:build` | "작업 시작", "구현" |
| 배포 | `/beaver:ship` | "커밋하고 배포", "작업 마무리" |
| 테스트 | `/beaver:test` | "전체 테스트", "회귀 테스트" |
| 리팩토링 | `/beaver:refactor` | "비슷한 기능 묶기", "중복 정리" |

**흐름**: `plan`(작업 브랜치에서 `.claude/worktrees/` 하위 `stick` 격리 생성) → `build`(기획 테스트 작성 + 구현, 커밋·테스트 실행 안 함, stick 에 누적) → `ship`(코드리뷰 → 커밋 → stick 에 원본 병합 → 원본 브랜치로 복귀·푸쉬 → worktree 제거; 충돌은 ship 이 인라인 해결) → `test`(원격 있는 실제 브랜치에서 전체 회귀, stick 밖). stick·worktree 는 로컬 전용, 푸쉬는 ship 에서 원본 브랜치로만.
**위치**: 설정 `.beaver/config.json` · 산출물 `.beaver/output/{spec,plan,revision,report,review,refactor}/` · 메모리 `.beaver/memory/`(인덱스 MEMORY.md, 코드로 알 수 있는 내용은 저장 안 함) · 상태 `.beaver/.auto-branch-state.json`(stick→원본 매핑) · stick worktree `.claude/worktrees/`.
**우선순위**: `.beaver/memory/` 의 사용자 규칙이 이 문서(CLAUDE.md)보다 **우선**한다. 작업 중 사용자 지적은 확인 후 memory 에 누적되고, 필요 시 이 문서에도 반영된다(충돌 시 memory 가 이김).

---

## 개발 로드맵

전체 개발 순서와 진척도는 [docs/roadmap.md](docs/roadmap.md) 에서 관리한다(살아있는 문서). 역할 정의(ADMIN=업체 관리 / MANAGER=객실·사물 관리 / USER=예약·제어)와 횡단 결정사항의 기준점이다. 기능 하나가 ship 될 때마다 해당 체크박스를 갱신한다.

---

## ⚠️ 주의사항

- **서버 · 인프라 기동은 반드시 사용자가 직접 실행** — `npm run start:*` / `nest start` / `npm run docker:*`(network · postgres · rabbitmq · user-service · gateway · infra · up — `docker compose up` · `docker network create`) 를 Claude 가 실행하지 않는다. `docker compose config` 검증 · `docker build` 는 해도 된다(컨테이너를 띄우지 않음).
- **DB 마이그레이션 적용 · 배포는 사용자 몫** — `npm run db:migrate` · `db:revert` 와 Docker 의 migrate 컨테이너는 실제 DB 를 바꾸므로 Claude 가 실행하지 않는다. Claude 는 엔티티 수정과 마이그레이션 파일 생성(`npm run db:generate -- <Name>` — DB 없이 PGlite 로 계산)까지만 한다([docs/data-layer.md](docs/data-layer.md) 마이그레이션 절).
- 예외 — Claude 가 Bash 로 직접 실행해 검증한다: `npm test` · `npm run typecheck` · `npm run build` · `npm run lint` · `npm run db:check` · `npm run db:generate`.
- **`.back/` 은 NestJS 11 + TypeORM 0.3 시절 코드 보관소** — 이식할 때 참고만 한다. 수정 · import 금지(tsconfig · Vitest 에서 제외돼 있다). git 에서도 제외(`.gitignore` 의 `/.back`)된 로컬 전용 폴더라 다른 PC 에는 없다 — 원본은 커밋 e108425 까지의 기록에 남아 있다.

## 커밋 메시지

- **형식(항상)**: `YYYY.MM.DD` 날짜 줄 → 빈 줄 1개 → `-작업내용` 목록. **트레일러(`Co-Authored-By` 등) 금지 — 날짜+목록 외 아무것도 붙이지 않는다.** (출처: [.beaver/memory/git.md](.beaver/memory/git.md))
  ```
  2026.07.20

  -작업내용 1
  -작업내용 2
  ```

## Architecture

NestJS 12 **모노레포**(ESM, `"type": "module"`) + TypeORM 1.x(PostgreSQL, pg) + RabbitMQ(amqplib 2) + nestjs-cls 트랜잭션 + passport-jwt + Swagger + `@nestjs/schedule` + Vitest. 다국어(i18n) 없음 — 모든 사용자 노출 메시지는 한국어 리터럴.

```
apps/
├── gateway/src/
│   ├── api/v1/<domain>/      # 공개 라우트 — <domain>.controller.ts(동기 · 내부 HTTP) · <domain>.controller.queue.ts(큐 · RabbitMQ + 요청 단위 SSE)
│   ├── guards/               # passport.jwt.auth(JWT) · roles(권한)
│   └── modules/transport/    # InternalHttpClient · CommandStreamService
└── user-service/src/
    ├── user/                 # 회원 도메인: controller(내부 HTTP) · handler(RabbitMQ) · crontabs/ → 같은 UserService
    └── migrate.ts            # 마이그레이션 실행기
libs/
├── common/       # 실패 응답 DTO · toFailResult · 예외 필터 · ValidationPipe 팩토리 · 순수 util · 내부 요청 가드
├── contracts/    # 게이트웨이↔서비스 공유 규격: 요청/응답 DTO, 명령 type, 메시지 봉투, 내부 헤더
├── database/     # entities/<domain>/ · migrations/ · DatabaseModule · typeorm-error · seeder
└── messaging/    # RabbitMQ 연결 · 발행 · 소비 · @OnCommand · CommandDispatcher
scripts/db-schema.mjs   # 오프라인 마이그레이션 생성 · 검사 (PGlite)
```

- **모노레포 ≠ 모놀리스**: 앱마다 `nest build <app>` 으로 따로 빌드 · 배포 · 확장한다. 공유 코드는 libs 한 곳에서 import.
- **두 전달 경로**: 즉시 끝나는 요청(조회 · 로그인 · 토큰 재발급 · 게이트웨이 인증 조회)은 게이트웨이 → 서비스 **내부 HTTP**(동기), 상태를 바꾸는 쓰기는 **RabbitMQ 명령 → 결과 이벤트 → 요청 단위 SSE**. 어느 라우트가 어느 경로인지는 게이트웨이 controller 파일로 정한다(`<domain>.controller.ts` = 동기, `<domain>.controller.queue.ts` = 큐).
- **헥사고날 경계(포트·어댑터)**: 인바운드 어댑터(controller · `@OnCommand` handler · crontab)는 service 로 위임만 하고, service 는 아웃바운드 포트(repository 인터페이스 Symbol 토큰)만 안다. 같은 service 를 HTTP 와 RabbitMQ 양쪽에서 부른다. 폴더 배치(api · guards · modules)는 헥사고날과 무관한 정리 기준이다. 순수 도메인 객체 분리(클린 아키텍처)는 하지 않는다.
- 레이어: **adapter(controller/handler/crontab) → service → repository** 단방향. repository 만 TypeORM(`txHost.tx`)을 쓴다.
- **엔티티는 `libs/database/src/entities/<domain>/`** — 공유 DB 단계라 여러 앱이 같은 엔티티를 쓰므로 앱이 아니라 공용 라이브러리 안의 소유 도메인 폴더에 둔다.
- **도메인 간 데이터 접근**: 다른 도메인 테이블이 필요하면 소유 도메인의 repository 가 그 엔티티를 직접 다룬다(service→service ❌). 메서드명은 소유 도메인 어휘(`t_user` 를 다뤄도 `insertStaff`).

→ 상세(앱 구성 · 경로 선택 · 모듈 · 부트스트랩 · 새 도메인 절차): [docs/architecture.md](docs/architecture.md) · 메시징: [docs/messaging.md](docs/messaging.md)

## Conventions

- **ESM**: 상대 · alias import 는 **`.js` 확장자 필수**(`./user.service.js`, `@app/common/utils/jwt.js`), 패키지 import 는 확장자 없음. 타입만 쓰는 import 는 `import type`. CJS 패키지는 default import(`import bcrypt from 'bcrypt'`). `__dirname`/`require` ❌.
- **Import alias**: 앱 간 공유는 `@app/<lib>/<경로>.js`(`@app/common` · `@app/contracts` · `@app/database` · `@app/messaging`). 앱 · 도메인 내부는 상대경로. barrel(`index.ts`) 없음.
- **게이트웨이 폴더**: 공개 라우트 `src/api/v1/<domain>/`, 가드 `src/guards/<guard>/`, 인프라 `src/modules/<module>/` (기존 `.back` 구조와 같다).
- **게이트웨이 공개 controller 는 전달 경로별 2파일**: 동기(내부 HTTP) 라우트는 `<domain>.controller.ts` 의 `<Domain>Controller`, 큐(RabbitMQ + 요청 단위 SSE) 라우트는 `<domain>.controller.queue.ts` 의 `<Domain>QueueController`. **한 파일에 두 경로를 섞지 않는다.** 둘 다 같은 `@ApiTags` · `@Controller('/api/v1/<domain>')` 를 쓰고, 도메인 모듈 `controllers` 에 `[동기, 큐]` 순으로 등록한다. 테스트도 `test/<domain>.controller.spec.ts` · `test/<domain>.controller.queue.spec.ts` 로 나눈다. (user-service 는 이미 controller(내부 HTTP) · handler(RabbitMQ) 로 나뉜다)
- **파일명**: 레이어 `<domain>.<role>.ts`(`user.controller.ts`, `user.handler.ts`, `user.symbols.ts`), DTO kebab `<domain>-<feature>.dto.ts`, 엔티티 kebab `<feature>.entity.ts`, crontab `<domain>-<feature>.crontab.ts`. 클래스 `<Domain><Feature><Role>` — 응답은 항상 `ResultDto`(❌ `ResponseDto`).
- **DTO 는 `libs/contracts/src/<domain>/dto/`** — 게이트웨이(검증)와 서비스(타입)가 같은 클래스를 쓴다. 기능당 DTO 1개, 모양 같아도 독립 선언.
- **snake_case 전 레이어 통일**: DTO 필드 · entity 컬럼 · path/query param · JWT payload · 메시지 봉투 · 실패 본문(`validation_errors`) 키 모두 snake_case. camelCase 는 지역 변수 · util 함수명만.
- **라우트**: 공개 `@Controller('/api/v1/<domain>')`(게이트웨이), 내부 `@Controller('/internal/v1/<domain>')`(서비스). 핸들러 앞 `/` + 다단어 kebab, snake path param.
- **컨트롤러 입력은 항상 DTO 타입**(`any`·`@Param('key')` 금지), 파라미터 한 줄.
- 코드 스타일: Prettier(4칸, 200자, `bracketSpacing: false`) + oxlint.

→ 상세: [docs/conventions.md](docs/conventions.md)

## 서비스(비즈니스) 계층 규칙

- **public 메서드 1개 = API(또는 명령) 1개**. crontab 은 service 가 아니라 인바운드 어댑터다(도메인 `crontabs/` 폴더).
- **service 내부 private 헬퍼 금지** — 재사용 · 순수 변환은 `<domain>.util.ts`(도메인) 또는 `libs/common/src/utils/`(전역)로 추출.
- service 는 `new XEntity()`+필드 할당으로 엔티티를 만들고(객체 리터럴 ❌), WHERE 는 `FindOptionsWhere<XEntity>`(`In` · `LessThanOrEqual` 등)로 만들어 repository 를 인터페이스 토큰으로 호출하며, 규칙 위반 시 HTTP 예외 throw.
- 쓰기 메서드에 `@Transactional()`(`@nestjs-cls/transactional`). 큐 경로에서도 HTTP 예외를 그대로 던지면 failed 결과로 바뀐다.
- service 는 `Request`/`Response`/AMQP 채널 같은 전송 계층 객체를 받지 않고 값만 받는다.

## 공통 로직 분리

- **순수 함수(stateless) → util**: 전역 `libs/common/src/utils/*.ts`(`bcrypt` · `hash` · `cipher` · `jwt` · `validation` · `fail-result`), 도메인 전용 `apps/<app>/src/<domain>/<domain>.util.ts`. `@Injectable` 없이 named `function` export.
- **DI/lifecycle/외부연동 → `@Module`/`@Injectable`**: 여러 앱이 쓰는 인프라는 `libs/`, 앱 전용은 그 앱 안(`src/modules/`).

## Validation

- `class-validator` 데코레이터. 사용: `@IsNotEmpty`/`@IsOptional`/`@IsIn`/`@Matches`/`@MaxLength`(+`@ValidateIf`). **`@IsString`/`@IsNumber`/`@Type`/`@Transform` 미사용**(존재+형식/길이+enum 만).
- **모든 검증 데코레이터에 `message: '<한국어 문자열>'` 리터럴 필수**. `@IsOptional()` 만 `message` 없음.
- **데코레이터 순서**: `@ApiProperty` → 제약 → `@IsNotEmpty`(맨 마지막). optional 은 `@ApiProperty` → `@IsOptional()` → 제약.
- **검증 위치**: 공개 입력은 게이트웨이의 ValidationPipe 에서 1회. 큐 경로 서비스 핸들러는 다시 검증하지 않는다(내부 HTTP 컨트롤러는 같은 DTO 로 한 번 더 검증 — 방어).
- **`@Query()` DTO 는 생성자를 세트로 갖고, 컨트롤러가 `const dto = new 클래스명(query);` 로 만들어 넘긴다**(호출부 `new` 인라인 ❌). **생성자 파라미터는 반드시 선택(`data?: Partial<T>`)** — 파이프가 `new targetType()` 을 인자 없이 호출한다. 페이지 기본값은 `PaginationDto` 생성자, 기능별 Query DTO 는 `super(data)` 후 자기 필드만(부모 필드 재선언 ❌). `@Body()`/`@Param()` 은 해당 없음.
- 전역 ValidationPipe 는 `transform: true` + `forbidNonWhitelisted: true` + `exceptionFactory: validationExceptionFactory`(main.ts · spec 공용). `whitelist` 는 켜지 않는다 — 그래서 선언 안 된 필드는 걸러지지 않는다.

→ 상세: [docs/conventions.md](docs/conventions.md)

## Error & Response

- **실패 본문은 전송 경로와 무관하게 하나**: `ApiFailResultDto {message, validation_errors: ValidationErrorResultDto[] | null, ...기능별 추가 필드}`. 모든 예외는 `toFailResult()` 를 거친다 — HTTP 는 `CustomErrorFilter` 가 상태 코드 + 본문으로, 큐 경로는 `CommandDispatcher` 가 failed 결과로, 게이트웨이가 SSE `failed` 이벤트(`{status_code, ...본문}`)로 내보낸다.
- **repository**: 모든 메서드 try/catch, 최종 실패는 통일 `InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'})`. 제약 위반은 `isUniqueViolation(error, 'UK_…')` · `isForeignKeyViolation(error, 'FK_…')`(PostgreSQL 23505/23503)로 **제약명별 if 분기** → `BadRequestException`.
- **service**: 규칙 위반을 `BadRequestException`/`NotFoundException`/`UnauthorizedException`/`HttpException(…, HttpStatus.X)` 로 throw, body `{message: '<한국어 문자열>'}`(+필요 시 추가 필드). controller · handler 는 throw 안 함.
- **4xx 는 비즈니스, 5xx 는 인프라**: 큐 경로에서 4xx 는 즉시 failed 회신, 5xx 는 재시도(최대 3회) 후 failed + DLQ.
- **`validation_errors` 기준**: 사용자 입력 필드 오류만, 비즈니스 · 내부값 오류는 `null`.
- 상태코드는 동기 핸들러마다 `@HttpCode(200|204)` 명시. **응답 필드 생략 금지 — 없으면 `null` 포함**(`x: T | null`).

→ 상세: [docs/error-handling.md](docs/error-handling.md)

## API & Docs

- **모든 함수/메서드에 주석 필수**(JSDoc/한 줄). 공개 controller(게이트웨이) 핸들러에 Swagger 데코레이터 필수. 내부 controller(`/internal/...`)는 Swagger 없음.
- 클래스: `@ApiTags('<한글>')` → `@Controller(...)`.
- 동기 핸들러(`<domain>.controller.ts`): HTTP verb → `@UseGuards` → `@Roles` → `@HttpCode` → `@ApiOperation({summary})` → `@ApiBody` → `@ApiOkResponse` → 에러 응답들(`type: ApiFailResultDto`).
- **큐 핸들러**(`<domain>.controller.queue.ts`): HTTP verb → `@UseGuards` → `@ApiBearerAuth`(인증 시) → `@ApiOperation` → `@ApiBody` → `@ApiProduces('text/event-stream')` → `@ApiOkResponse({type: done 의 data DTO})`(void 면 생략) → 에러 응답들. `@HttpCode` 없음. 시그니처 `(@PassportActor() actor, @Body() dto, @Ip() ip, @Res() res)` + `commandStream.dispatch(res, {...})`.

→ 상세: [docs/api.md](docs/api.md)

## Data Layer

- **엔티티** `libs/database/src/entities/<domain>/<feature>.entity.ts`, `ENTITIES`(entities.ts)에 등록: 테이블 `t_<domain>`, `@Entity({name, comment})`, 제약 PascalCase(`primaryKeyConstraintName: 'PK_…'` · `@Unique('UK_…')` · `@JoinColumn({foreignKeyConstraintName: 'FK_…'})` · `@Index('IDX_…')`), **모든 컬럼 `comment`**(→ DB COMMENT), 타임스탬프 `@BeforeInsert`/`@BeforeUpdate` 훅(❌ `@CreateDateColumn`), 시각 `timestamptz`, 플래그 `smallint`. FK 는 문자열 속성 + `@ManyToOne(() => X)` + `@JoinColumn`(관계 속성을 엔티티 타입으로 두지 않는다 — ESM 순환 import 회피). 룩업 엔티티는 구조 컬럼만.
- **repository**: `TransactionHost<TransactionalAdapterTypeOrm>` 주입, `this.txHost.tx.getRepository(XEntity)` 로만 접근. 조회 `findOne`/`find` + `loadRelationIds: true`, 쓰기 `insert(entity)` · `update(where, entity)`(엔티티 인스턴스라야 훅이 돈다). where 타입 `FindOptionsWhere<XEntity>`(❌ `Partial`). 조인 · raw select 는 QueryBuilder 빌더 메서드로 분리하고 Data-Access Smoke spec 으로 SQL 고정.
- **마이그레이션**: 스키마는 마이그레이션으로만 바꾼다(`synchronize` 항상 off). 엔티티 수정 → `npm run db:generate -- <Name>`(DB 없이 PGlite 로 계산해 `libs/database/src/migrations/<ts>-<Name>.ts` 생성 + `MIGRATIONS` 등록, COMMENT 변경 포함) → `npm run db:check` 로 일치 확인 → 적용은 사용자(`db:migrate` 또는 Docker migrate 컨테이너).
- **Pagination**: 응답 `{list, pagination}`, 순서 **count → `Pagination` → 목록**, repository 는 개수 · 목록 두 메서드(`findAndCount` ❌). Query DTO 는 `extends PaginationDto`. (공통 Pagination 은 첫 목록 API 이식 시 `.back/src/common` 에서 옮긴다)

→ 상세: [docs/data-layer.md](docs/data-layer.md)

## Auth

- **JWT 검증 · 권한은 게이트웨이에서만**(`apps/gateway/src/guards/`). 서비스는 외부에 열리지 않으며 actor(내부 헤더 · 메시지 봉투)를 신뢰한다.
- 게이트웨이: 핸들러 단위 `@UseGuards(PassportJwtAuthGuard)`. 서비스로 넘기는 핸들러는 `@PassportActor() actor: Actor` 를 첫 파라미터로, 게이트웨이 안에서만 쓰면 `@PassportUser('user_id')`. JWT 전략은 회원 상태를 user-service `GET /internal/v1/user/auth-user/:user_id` 로 확인한다.
- **역할 기반 권한**: 관리자 전용 API 는 `@UseGuards(PassportJwtAuthGuard, RolesGuard)` + `@Roles('SUPER_ADMIN', 'ADMIN')`(`guards/roles/roles.decorator.ts`)를 **한 세트로**(인증 → 권한). 권한값은 `t_auth` PK(SUPER_ADMIN/ADMIN/HEAD_MANAGER/MANAGER/USER). 불일치 403 `{message: '접근 권한이 없습니다.'}`.
- 서비스 내부 HTTP: 로그인 회원은 `@InternalActor('user_id')`, IP 는 `@ClientIp()`.

### 서비스는 게이트웨이를 거친 요청만 받는다

- **내부 HTTP**: 서비스 루트 모듈에 `{provide: APP_GUARD, useClass: InternalAuthGuard}` — 모든 HTTP 요청에 게이트웨이의 `x-internal-token`(INTERNAL_API_TOKEN, 시간차 안전 비교)을 요구한다. 컨트롤러마다 붙이지 않는다. 바인딩 주소는 `USER_SERVICE_HOST`(기본 127.0.0.1), Docker 에서는 `roomless-service` 네트워크(internal — gateway · user-service-lb · user-service 만)로 닿는다. 서비스에는 CORS 를 두지 않는다.
- **큐(명령)**: 앱마다 다른 브로커 계정(`BROKER_USER`: gateway · user-service, 비밀번호 `RABBITMQ_<계정>_PASSWORD`). `roomless.cmd` 에 쓸 수 있는 계정은 gateway 뿐이다(권한: [docker/rabbitmq/init.sh](docker/rabbitmq/init.sh)). 연결 모듈은 발행하는 모든 메시지에 자기 계정을 `user_id` 로 붙이고, 브로커가 접속 계정과 대조한다. 서비스 소비자는 `user_id !== 'gateway'` 인 명령을 처리 · 회신 없이 DLQ 로 보낸다.
- **CORS** 는 브라우저 규칙이라 서버 간 호출을 막지 못한다 — 게이트웨이에만 `CORS_ORIGINS`(프론트 주소, 비우면 모두 차단)로 건다.

## 메시징 / 스케줄러

- **RabbitMQ**(`libs/messaging`): exchange `roomless.cmd`(명령 — gateway 계정만 발행) · `roomless.event`(결과 · 도메인 이벤트 — 서비스 계정만 발행) · `roomless.dlx`. 서비스 명령 큐는 quorum(`x-delivery-limit: 3`), 게이트웨이 결과 큐는 인스턴스별 exclusive(`q.gw.result.<인스턴스>`). 라우팅 키 `<server>.<resource>.<action>`, 결과는 `result.<인스턴스>.<type>.<done|failed>`.
- 명령 추가: `libs/contracts/src/<domain>/<domain>.commands.ts` 에 type 상수 → 서비스 `<domain>.handler.ts` 에 `@OnCommand(TYPE)` 메서드(service 위임만) → 게이트웨이 `<domain>.controller.queue.ts` 에서 `commandStream.dispatch`.
- **요청 단위 SSE**: 큐 경로 응답 = `event: accepted` → `done | failed | pending` → 종료. 상태 저장소 · 상시 연결 없음. 대기 시간 초과(30초)면 pending, 클라이언트는 리소스를 재조회한다.
- **스케줄러**: 도메인 안 `crontabs/` 폴더에 `<domain>-<feature>.crontab.ts`(`@Cron`), 도메인 모듈 providers 에 등록. `ScheduleModule.forRoot()` 는 앱 루트 모듈에 1회. **서비스는 여러 대로 뜨므로 crontab 본문은 `JobLockService.runExclusive('<domain>.<작업>', async () => {...})`(libs/database, PostgreSQL advisory lock — DatabaseModule 이 전역 제공)로 감싸 회차마다 1대만 실행**하고, 대상은 상태 조건으로 골라 두 번 돌아도 같은 결과가 나게 한다.

→ 상세: [docs/messaging.md](docs/messaging.md)

## Key Patterns

- **Repository DI**: Symbol 토큰(`<domain>.symbols.ts`) + 모듈 `{provide: TOKEN, useClass: XRepository}` + service `@Inject(TOKEN) … : XRepositoryInterface`(인터페이스는 `import type`). 메시징 포트(`COMMAND_PUBLISHER` · `RESULT_SUBSCRIBER`)도 같은 패턴.
- **Transaction**: service 쓰기 메서드에 `@Transactional()`, repository 는 `txHost.tx`. DB 를 쓰는 앱 루트 모듈은 `DatabaseModule`(TypeOrmModule + ClsModule `TransactionalAdapterTypeOrm`)을 import 한다.
- **기본 데이터 시드**: `libs/database/src/seeder/seeder.targets.ts` 의 `<X>_SEED_DATA` + `SEED_TARGETS` 를 DB 소유 서비스(user-service)의 `SeederService` 가 부팅 시 PK 기준 멱등 입력. 시드 행은 객체 리터럴 허용(유일 예외).
- **Docker 실행 — 묶음 4개를 따로**: `compose.postgres.yml` · `compose.rabbitmq.yml`(+rabbitmq-init 브로커 계정 · 권한) · `compose.user-service.yml`(migrate 1회 → user-service × `USER_SERVICE_REPLICAS` → user-service-lb) · `compose.gateway.yml`(gateway × `GATEWAY_REPLICAS` → gateway-lb, 호스트 :3000). 각자 띄우고 내리며(`npm run docker:<묶음>`, 전체는 `docker:up`), 묶음끼리는 `npm run docker:network` 가 만든 공용 external 네트워크(`roomless-edge` · `roomless-service`(internal) · `roomless-broker` · `roomless-data`)에서 서비스 이름으로 만난다. gateway · user-service 는 **로드밸런싱 전제** — 앞단 nginx(1.28, upstream `resolve` 로 `--scale` 을 재시작 없이 따라감), 큐 명령은 경쟁 소비, 결과는 `reply_to` 인스턴스로(sticky session 불필요), crontab 은 JobLockService. 그래서 앱 코드는 인스턴스 로컬 상태(메모리 캐시 · 세션 등)에 기대지 않는다. **`.env` 하나가 곧 서버 설정** — compose 는 환경 값(NODE_ENV · DB/RabbitMQ 접속정보 · 비밀값 · CORS · TRUST_PROXY · 인스턴스 수)을 바꾸지 않고 그대로 쓰며, 필수값이 비면 `${VAR:?}` 로 띄우지 않는다. compose 가 고정하는 것은 서버 구성(컨테이너 안 포트 · 바인딩 0.0.0.0 · user-service-lb 주소 · 인스턴스 ID · TZ)뿐이다. 가상 운영(같은 서버의 postgres · rabbitmq 묶음, 주소 = 컨테이너 이름)과 실제 운영(RDS · Amazon MQ)은 `.env` 의 접속정보로 사용자가 고르고, 운영으로 옮길 때 compose 를 다시 세팅하지 않는다 — compose 에 환경별 값 · 약한 기본값을 넣지 않는다. 게이트웨이는 `TRUST_PROXY=1` 로 X-Forwarded-For 의 실제 클라이언트 IP 를 읽고, 인스턴스 ID 는 컨테이너 호스트명. 이미지는 `Dockerfile` 하나를 `APP` 빌드 인자로(Node 24 slim, 운영 의존성만), 각 앱에는 쓰지 않는 비밀값을 빈 값으로 덮어 전달하지 않는다. 앱 코드 개발 중에는 `npm run docker:infra` 로 인프라만 띄우고 `npm run start:*` 로 로컬 실행해도 된다.

## Testing

- **Vitest 4** + `@nestjs/testing` + `supertest`. 위치 `<app|lib>/src/<domain>/test/<feature>.spec.ts`. 실행 `npm test`, 단일 `npm test -- <파일명 일부>`.
- 전역 setup([vitest.setup.ts](vitest.setup.ts)): `@Transactional()` pass-through mock + Nest 로거 끔. spec 마다 반복하지 않는다.
- **큐 경로**: 실제 handler · service · `CommandHandlerRegistry` · `CommandDispatcher` 를 부팅하고 **repository 만 Symbol 토큰으로 `vi.fn()` 주입**, 봉투를 `dispatcher.dispatch()` 에 넣어 판정(ack/requeue/dead)과 done/failed 결과를 단언.
- **동기 경로**: 실제 controller + service + ValidationPipe + 필터 + InternalAuthGuard 부팅, repository 만 mock.
- **게이트웨이**: 가짜 브로커(FakeBroker)로 SSE 이벤트 순서를 실제 HTTP 로 단언, InternalHttpClient 는 mock.
- 외부 util 은 `vi.mock('<alias 경로>.js', ...)` + `vi.mocked(fn).mockReturnValue`(ESM 이라 `spyOn(모듈)` 불가). 시간은 `vi.useFakeTimers({toFake: ['Date']})`.
- 강도: 상태코드만 검사 금지 — mock 호출 횟수 · 인자(쓰기는 엔티티 컬럼 값, `toBeInstanceOf(XEntity)`) · 실패 후 `.not.toHaveBeenCalled()` 까지. 메시지는 한국어 리터럴. `[SUCCESS]`/`[FAIL:*]` describe 분류. **실 DB · 브로커 · 외부 IO 금지.**
- **Data-Access Smoke**: 매핑 민감 쿼리(관계 필드 where · QueryBuilder · raw select · 동적 조립) 메서드는 repository-mock spec 만으로 커버 금지 — DB 연결 없이 `new DataSource(...)` + `buildMetadatas()` 로 SQL 을 빌드해 고정하는 smoke 케이스 필수. 최초 적용 [user.repository.spec.ts](apps/user-service/src/user/test/user.repository.spec.ts) `findLoginUser`.
- 엔티티 ↔ 마이그레이션 일치는 `npm run db:check` 로 확인한다(테스트와 별도).

→ 상세: [docs/testing.md](docs/testing.md)

## Checklist

- [ ] ESM: 상대 · alias import `.js` 확장자, 타입 전용 `import type`, alias 는 `@app/<lib>/...`
- [ ] 파일/클래스명: 레이어 `<domain>.<role>.ts`, DTO kebab(`libs/contracts`), 엔티티 `libs/database/src/entities/<domain>/<feature>.entity.ts`, crontab `crontabs/<domain>-<feature>.crontab.ts`, 응답 `ResultDto`
- [ ] 게이트웨이: 라우트 `api/v1/<domain>/`, 가드 `guards/`, 인프라 `modules/`
- [ ] 경로 선택: 큐(쓰기 · 상태 변경) vs 동기(즉시 응답 · 조회)를 게이트웨이에서 결정하고, 파일을 `<domain>.controller.ts`(동기) · `<domain>.controller.queue.ts`(큐)로 나눈다
- [ ] 컨트롤러 입력 DTO 타입, 파라미터 한 줄, 인증은 `@PassportActor()`/`@PassportUser()` 첫 파라미터
- [ ] DTO 검증: `message: '<한국어 문자열>'` 필수, `@IsNotEmpty` 맨 마지막, `@IsString` 미사용
- [ ] Entity: `@Entity({name:'t_…', comment})`, 제약명 `PK_/UK_/FK_/IDX_`, 모든 컬럼 comment, `@BeforeInsert/@BeforeUpdate`, `ENTITIES` 등록, 마이그레이션 생성 + `db:check` 통과
- [ ] Repository: `txHost.tx.getRepository`, try/catch + 통일 500, `isUniqueViolation`/`isForeignKeyViolation` 제약명 분기, `FindOptionsWhere`, `loadRelationIds:true`, `update` 는 엔티티 인스턴스 전달
- [ ] Service: public=API/명령 1:1, private 헬퍼 없이 util, 쓰기 `@Transactional()`, 엔티티는 `new`+할당
- [ ] Error: 실패 본문 `{message, validation_errors}` 하나, `validation_errors` 는 입력 필드 오류만
- [ ] Swagger: 공개 핸들러 필수, 큐 핸들러는 `@ApiProduces('text/event-stream')`, 응답 데코레이터는 `type` 만
- [ ] 메시징: 명령 type 은 contracts, 서비스 handler 는 `@OnCommand` + 위임만, 로그인 필요 명령은 `requireActor()`
- [ ] 여러 인스턴스 전제: crontab 은 `JobLockService.runExclusive` 로 감싸고, 인스턴스 메모리에 상태를 두지 않는다
- [ ] 응답 필드 생략 금지 — 없으면 `null`
- [ ] 테스트: repository mock, 호출 횟수 · 인자 · 미호출 단언, 한국어 리터럴, 매핑 민감 쿼리는 Smoke, `npm test` + `npm run typecheck` 통과
