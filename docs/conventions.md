# Conventions

## ESM

프로젝트는 `"type": "module"` + `module/moduleResolution: nodenext` 다.

- **상대 · alias import 는 `.js` 확장자 필수** — `import {UserService} from './user.service.js'`, `import {sha256Hex} from '@app/common/utils/hash.js'`. 빌드 시 Nest CLI 가 alias 를 상대경로로 바꾼다.
- 패키지 import 는 확장자 없음. 패키지 하위 경로가 exports 맵이 없는 CJS 면 확장자를 붙인다(`dayjs/plugin/customParseFormat.js`).
- **CJS 패키지는 default import** — `import bcrypt from 'bcrypt'`, `import jsonwebtoken from 'jsonwebtoken'`, `import amqp from 'amqplib'`, `import passportJwt from 'passport-jwt'; const {Strategy} = passportJwt;`. named import 는 런타임에 실패할 수 있다.
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
- barrel(`index.ts`) 없음.

## 파일 · 클래스 명명

**레이어 파일** — `<domain>.<role>.ts`:
- `user.controller.ts`(내부 HTTP) · `user.handler.ts`(RabbitMQ) · `user.service.ts` · `user.module.ts` · `user.symbols.ts` · `user.util.ts`
- repository `repositories/user.repository.ts`, 포트 `interfaces/user.repository.interface.ts`
- crontab `crontabs/<domain>-<feature>.crontab.ts` (예: `user-leave-cleanup.crontab.ts`, 클래스 `UserLeaveCleanupCrontab`)
- 게이트웨이 공개 라우트 `apps/gateway/src/api/v1/<domain>/` — **전달 경로별로 파일을 나눈다(한 파일에 섞지 않는다)**:
  - 동기(내부 HTTP) `<domain>.controller.ts` · 클래스 `<Domain>Controller` — `InternalHttpClient` 만 주입
  - 큐(RabbitMQ + 요청 단위 SSE) `<domain>.controller.queue.ts` · 클래스 `<Domain>QueueController` — `CommandStreamService` 만 주입
  - 둘 다 같은 `@ApiTags` · `@Controller('/api/v1/<domain>')`, 도메인 모듈 `controllers: [<Domain>Controller, <Domain>QueueController]`. 테스트도 `test/<domain>.controller.spec.ts` · `test/<domain>.controller.queue.spec.ts` 로 나눈다.

**DTO 파일** — `libs/contracts/src/<domain>/dto/<domain>-<feature>.dto.ts` (kebab). 요청 DTO 와 응답 `ResultDto` 는 같은 파일에 함께 export.

**엔티티 파일** — `libs/database/src/entities/<domain>/<feature>.entity.ts` (1엔티티 1파일, kebab), 클래스 `<Feature>Entity`.

**클래스명** — `<Domain><Feature><Role>`:
- 요청 `UserSignDto` · path param `UserAuthUserParamDto` · 목록 query `XListDto`(PaginationDto 상속)
- 응답은 항상 `ResultDto`: `UserSignResultDto` (❌ `ResponseDto`)
- 게이트웨이 controller `UserController`(동기) · `UserQueueController`(큐), 서비스 핸들러 `UserCommandHandler`, crontab `UserLeaveCleanupCrontab`

**DTO 독립 명명**: 기능당 DTO 1개. 모양이 같아도(토큰 응답 4종 등) 독립 재선언하고 재사용 · alias 하지 않는다.

## snake_case 전 레이어 통일

DTO 필드 · entity 컬럼 · path/query param · JWT payload · 메시지 봉투 · 실패 본문(`validation_errors`) · 내부 HTTP 응답 키가 모두 snake_case. camelCase 는 지역 변수 · util 함수명 · repository 의 엔티티별 getter(`users`, `sessionRefreshes`)만.

## 라우트

- 공개(게이트웨이): `@Controller('/api/v1/<domain>')`. 내부(서비스): `@Controller('/internal/v1/<domain>')`.
- 앞 `/` 필수, 다단어 kebab(`/token-refresh`), path param 은 snake_case.
- 같은 경로 다른 verb 가능(`DELETE /leave` · `PATCH /leave`).

## 컨트롤러 · 핸들러 입력

- 입력은 항상 DTO 타입: `@Body() dto: UserSignDto` / `@Query() query: XListDto` / `@Param() param: XParamDto`. **`any` · `@Param('key')` 금지.**
- 게이트웨이 인증 핸들러: 서비스로 넘기면 `@PassportActor() actor: Actor`, 게이트웨이 안에서만 쓰면 `@PassportUser('user_id') user_id: string` — 항상 첫 파라미터.
- 큐 경로 게이트웨이 핸들러는 마지막에 `@Res() res: Response` 를 받고 `commandStream.dispatch(res, ...)` 만 호출한다.
- 서비스 내부 HTTP 핸들러: `@ClientIp() ip`, 로그인 회원은 `@InternalActor('user_id')`.
- 서비스 RabbitMQ 핸들러: `(command: MessageEnvelope<XDto>)` 하나만 받는다. 로그인 필요 명령은 `requireActor(command).user_id`.
- 파라미터는 한 줄, 본문은 위임 한 줄(로직 0).

## Validation (class-validator)

- **사용**: `@IsNotEmpty` · `@IsOptional` · `@IsIn` · `@Matches` · `@MaxLength` (+ 짝 필드 조건부 `@ValidateIf`).
- **미사용**: `@IsString` · `@IsNumber` · `@Type` · `@Transform` — 존재 + 형식/길이 + enum 만 검증.
- **모든 제약에 `message: '<한국어 문자열>'` 리터럴 필수**. `@IsOptional()` 만 message 없음.
- **순서**: 필수 `@ApiProperty` → 제약 → `@IsNotEmpty`(맨 마지막) / optional `@ApiProperty` → `@IsOptional()` → 제약 / 짝 필드 `@ApiProperty` → `@ValidateIf` → 제약 → `@IsNotEmpty`.
- **입력 DTO 의 모든 필드는 검증 데코레이터를 최소 1개** — 제약이 없어도 `@IsOptional()`. `whitelist: true` 를 켜는 순간 무장식 필드가 조용히 사라지기 때문이다(현재 whitelist 는 꺼져 있다).
- **검증 위치**: 공개 입력은 게이트웨이 ValidationPipe 에서. 큐 경로 서비스 핸들러는 재검증하지 않는다.
- 근거: [user-sign.dto.ts](../libs/contracts/src/user/dto/user-sign.dto.ts), [user-login.dto.ts](../libs/contracts/src/user/dto/user-login.dto.ts).

## Query DTO 는 생성자를 갖고, 컨트롤러가 `new` 로 만들어 넘긴다

1. `@Query()` DTO 는 생성자를 세트로 갖는다 — 쿼리는 키가 통째로 빠질 수 있고 그 누락은 정상 요청이라 검증기가 잡지 못한다.
2. 컨트롤러가 `const dto = new XListDto(query);` 로 만든 지역변수를 넘긴다(호출부 `new` 인라인 ❌). 앞선 인자가 있으면 dto 를 마지막에.
3. ValidationPipe 설정은 그대로 — 검증은 파이프, 기본값은 생성자.

```ts
export class StoreListDto extends PaginationDto {
    constructor(data?: Partial<StoreListDto>) {
        super(data);
        this.search_type = data?.search_type ?? null;
    }
}
```

- **생성자 파라미터는 반드시 선택(`data?`)** — 파이프의 class-transformer 가 `new targetType()` 을 인자 없이 호출한다. 필수로 두면 매 요청 500.
- **쿼리 값은 문자열** — `page: number` 로 선언해도 `'2'`. service 에서 산술하지 말고 `Pagination` 에 넘긴다.
- **상속 시 부모 필드 재선언 금지** — `target: ES2023` → `useDefineForClassFields` 로 부모 생성자가 넣은 값이 덮인다.
- `@Body()` · `@Param()` 은 해당 없음(누락이 곧 검증 실패이거나 항상 존재).
- 수정 API 의 선택 필드는 `?? null` — TypeORM `update()` 는 `undefined` 필드를 건드리지 않는다.

## 서비스(비즈니스) 계층

- **public 메서드 1개 = API(또는 명령) 1개.** crontab 은 service 가 아니다.
- **엔티티는 `new XEntity()` + 필드 할당으로 생성**(insert · update 모두) — 객체 리터럴 ❌. 엔티티 인스턴스라야 `@BeforeInsert`/`@BeforeUpdate` 훅이 돌아 타임스탬프가 채워진다. 타임스탬프는 직접 넣지 않는다.
- **WHERE 는 service 가 `FindOptionsWhere<XEntity>` 로**(`In` · `LessThanOrEqual` 등 연산자 포함) 만들고 repository 는 실행만.
- 규칙 위반은 HTTP 예외 throw, body `{message: '<한국어 문자열>'}`.
- 쓰기 메서드에 `@Transactional()`.
- **service 내부 private 헬퍼 금지** — util 로 추출.

## 공통 로직 분리

- **순수 함수 → util** (named `function`, `@Injectable` 없음): 전역 `libs/common/src/utils/`, 도메인 `apps/<app>/src/<domain>/<domain>.util.ts`.
- **DI · lifecycle · 외부연동 → `@Injectable`/`@Module`**: 여러 앱이 쓰면 libs, 한 앱만 쓰면 그 앱 안.
- ID 는 `generateId()`(하이픈 없는 UUID v4 32자).

## 기본 데이터(시드)

- 룩업 기본 데이터는 [seeder.targets.ts](../libs/database/src/seeder/seeder.targets.ts) 에 `<X>_SEED_DATA: XEntity[]` + `SEED_TARGETS` 한 줄로만 정의한다. 객체 리터럴 허용(정적 정의 데이터).
- 시드 값과 DTO 허용값(`@IsIn`)을 맞춘다 — 예: SNS 유형은 가입 DTO 가 허용하는 GOOGLE · FACEBOOK · APPLE · KAKAO · LINE 을 모두 시드한다(어긋나면 FK 위반 400).

## 금지 형식 요약

| 회피 | 대신 |
|---|---|
| 확장자 없는 상대 import, `require` | `.js` 확장자 ESM import |
| `@IsString`/`@IsNumber`/`@Type`/`@Transform` | 존재 + 형식/길이 + enum |
| `@Param('key')`, `any` 입력 | DTO + `@PassportActor()`/`@PassportUser()` |
| `ResponseDto` | `ResultDto` |
| `index.ts` barrel, 다른 앱 코드 import | 직접 경로, libs 로 이동 |
| service 의 DataSource · `txHost` · `Repository<T>` 직접 사용 | repository 포트 |
| service private 헬퍼 | util |
| controller · handler 의 로직 · throw | service 위임 |
| Swagger 응답 데코레이터의 `description` | `type` 만 |
| 타임스탬프 직접 할당, `@CreateDateColumn`/`@UpdateDateColumn` | `@BeforeInsert`/`@BeforeUpdate` 훅 |
| `@Column({unique: true})` | `@Unique('UK_…', [...])` |
| service 쓰기에서 객체 리터럴 엔티티 | `new XEntity()` + 할당 (객체 리터럴은 seeder.targets.ts 에서만) |
