# Conventions

## 파일·클래스 명명

**레이어 파일** — `<domain>.<role>.ts` (전부 소문자, 역할 접미사):
- `user.controller.ts`, `user.service.ts`, `user.module.ts`, `user.symbols.ts`, `user.util.ts`
- repository 는 `repositories/user.repository.ts`, 인터페이스는 `interfaces/user.repository.interface.ts`
- 스케줄러 전용은 복합 역할명: `user.leave-cleanup.service.ts`

**DTO/엔티티 파일** — kebab-case `<domain>-<feature>.dto.ts` / `<feature>.entity.ts`:
- `dto/user-sign.dto.ts`, `dto/user-token-refresh.dto.ts`, `entities/user-setting.entity.ts`, `entities/session-refresh.entity.ts`

**클래스명** — `<Domain><Feature><Role>`:
- 입력 DTO: `UserSignDto`, `UserLoginDto`, `UserLeaveDto`
- 응답 DTO 는 항상 `ResultDto`: `UserSignResultDto`, `UserLoginResultDto` (❌ `ResponseDto` — 전혀 사용 안 함)
- path param 은 `ParamDto`, 목록 query 는 `QueryDto`(현재 적용 도메인 없음 — 신설 시 규약).

**DTO 독립 명명**: 기능당 DTO 파일 1개. 모양이 같아도(예: 토큰 응답 4종이 동일 4필드) **독립 재선언**하며 재사용/alias 하지 않는다. 요청 DTO 와 응답 `ResultDto` 짝은 **같은 파일에 동거 export**([user-sign.dto.ts](../src/api/v1/user/dto/user-sign.dto.ts:5) `UserSignDto`+`UserSignResultDto`; void 응답인 leave 는 Result 없음).

## snake_case 전 레이어 통일

DTO 필드·entity 컬럼·path/query param·JWT payload 키 모두 snake_case. camel↔snake 매핑 레이어 없음. camelCase 는 **지역 변수/util 함수명만**(`userEntity`, `isAdult`, `generateSnsLoginId`).

## 라우트

- `@Controller('/api/v1/<domain>')` — 앞 `/` 필수, 버전은 경로 문자열.
- 핸들러도 앞 `/` 필수, 다단어는 kebab: `@Post('/token-refresh')`.
- 동작에 맞는 HTTP verb. 같은 경로 다른 verb 가능: `@Delete('/leave')` / `@Patch('/leave')`.
- path param 은 snake_case.

## 컨트롤러 입력

- 입력은 항상 타입 DTO: `@Body() dto: UserSignDto` / `@Query() q: XQueryDto` / `@Param() p: XParamDto`. **`any` 금지, `@Param('key')` 키-arg 형 금지.**
- 인증 사용자는 **항상 첫 파라미터** `@PassportUser('user_id') user_id: string` (import: `@root/guards/passport.jwt.auth/passport.jwt.auth.decorator`).
- 프레임워크 추출(`@Ip() ip: string`)은 DTO 와 병기 허용.
- 파라미터는 한 줄. controller 본문은 service 단일 위임(로직 0).

## Validation (class-validator)

- **사용 데코레이터**: `@IsNotEmpty`, `@IsOptional`, `@IsIn`, `@Matches`, `@MaxLength` (+ 짝 필드 조건부 `@ValidateIf`).
- **미사용(금지)**: `@IsString`/`@IsNumber`/`@Type`/`@Transform` — 존재+형식/길이+enum 만 검증, 타입 강제 안 함.
- **모든 제약 데코레이터에 `message: '<한국어 문자열>'` 리터럴 필수**. `@IsOptional()` 만 `message` 없음.
- **데코레이터 순서**:
  - 필수 필드: `@ApiProperty` → 제약(`@IsIn`/`@MaxLength`/`@Matches`) → `@IsNotEmpty` **맨 마지막(필드 바로 위)**.
  - optional 필드: `@ApiProperty` → `@IsOptional()` → 제약.
  - `@ValidateIf` 짝 필드: `@ApiProperty` → `@ValidateIf` → 제약 → `@IsNotEmpty`.

근거: [user-sign.dto.ts](../src/api/v1/user/dto/user-sign.dto.ts), [user-login.dto.ts](../src/api/v1/user/dto/user-login.dto.ts).

## Query DTO 는 생성자를 갖고, 컨트롤러가 `new` 로 만들어 넘긴다

**규칙**

1. **`@Query()` 로 받는 DTO 는 생성자를 세트로 갖는다.** 쿼리스트링은 키가 통째로 빠질 수 있어, 기본값이 없으면 `undefined` 가 그대로 service 로 흘러간다.
2. **컨트롤러가 `new 클래스명({...})` 으로 만들어 service 에 넘긴다.** 핸들러가 받은 쿼리 객체를 그대로 service 로 흘리지 않는다 — 컨트롤러에서 한 번 생성자를 태워 기본값이 확정된 인스턴스를 만든다. 필드를 하나씩 대입하는 형태 ❌.
3. **`ValidationPipe` 설정은 건드리지 않는다.** [main.ts](../src/main.ts) 의 `transform`·`forbidNonWhitelisted`·`exceptionFactory` 는 그대로 두고, 기본값 책임만 DTO 생성자로 옮긴다. 검증은 파이프가, 기본값은 생성자가 담당하는 분리다.

```typescript
// dto — 생성자가 기본값의 단일 소재지
export class StoreListDto extends PaginationDto {
    // …필드 + 제약 데코레이터…

    constructor(data?: Partial<StoreListDto>) {
        super(data);
        this.search_type = data?.search_type ?? null;
        this.search_keyword = data?.search_keyword ?? null;
    }
}

// controller — 받은 쿼리를 생성자에 태워 지역변수 dto 로 만든 뒤 넘긴다
async list(@Query() query: StoreListDto): Promise<StoreListResultDto> {
    const dto = new StoreListDto(query);
    return this.storeService.list(dto);
}
```

- 생성 결과는 **지역변수 `dto` 에 담고** service 에 넘긴다 — 호출부에 `new` 를 인라인으로 끼워넣지 않는다. 인증 사용자 등 앞선 인자가 있으면 `this.xService.list(user_id, dto)` 처럼 `dto` 를 마지막에 둔다.

**⚠️ 입력 DTO 의 모든 필드는 class-validator 데코레이터를 최소 1개 갖는다**

`@Query()`/`@Body()`/`@Param()` 으로 들어오는 DTO 는 제약이 없는 필드라도 **`@IsOptional()` 을 반드시 붙인다.** `@ApiProperty` 는 Swagger 메타데이터라 class-validator 의 계산에 들어가지 않으므로, 검증 데코레이터가 **하나도 없는 필드**는 `whitelist: true` 인 순간 `delete object[property]` 로 **조용히 사라진다**(`class-validator` `ValidationExecutor.js:84-105` — 메타데이터 0건인 프로퍼티를 `notAllowedProperties` 로 모아 `forbidNonWhitelisted` 면 400, 아니면 스트립). 페이지 파라미터가 소리 없이 증발하는 버그는 추적이 매우 어렵다.

현재 [main.ts](../src/main.ts) 는 `whitelist` 를 켜지 않아 발동하지 않지만(NestJS 는 `whitelist` 기본값을 넣지 않는다 — `validation.pipe.js:30`), 켜는 순간 무장식 필드가 전부 무너지므로 **선제적으로 붙여둔다**. `PaginationDto.page`/`size`/`page_size` 가 그 예다.

**응답 DTO(`ResultDto`)는 대상이 아니다** — `ValidationPipe` 를 타지 않으므로 데코레이터가 동작할 일이 없다. `PaginationResultDto`/`PageRangeResultDto` 에는 붙이지 않는다.

**⚠️ 생성자 파라미터는 반드시 선택(`data?`)이어야 한다**

`ValidationPipe` 는 내부적으로 `new targetType()` 을 **인자 없이** 호출한다 — `ValidationPipe({transform: true})` → `classTransformer.plainToInstance(...)`(`@nestjs/common@11.1.28` `pipes/validation.pipe.js`) → `newValue = new targetType()`(`class-transformer@0.5.1` `cjs/TransformOperationExecutor.js:147`). 파라미터를 필수로 선언하면 이 경로에서 `data` 가 `undefined` 가 되어 `data.page` 접근이 **매 요청 500** 을 낸다. 그래서 `data?: Partial<T>` + `?? 기본값` 형태여야 파이프 경유 경로와 컨트롤러의 `new` 경로가 모두 산다. (TypeScript 는 파이프의 리플렉션 호출을 못 보므로 컴파일 단계에서 안 잡힌다.)

**그 밖의 함정**

- **쿼리 값은 문자열로 들어온다** — `@Type`/`@Transform` 미사용 + `transformOptions`(`enableImplicitConversion`) 미설정. `page: number` 로 선언해도 `?page=2` 의 런타임 값은 `'2'` 다. service 에서 직접 산술하지 말고 `Pagination` 에 넘겨 `parseInt` 를 태운다.
- **상속 시 부모 필드를 재선언하지 말 것** — `tsconfig.json` `target: ES2023` → `useDefineForClassFields` 기본 `true`. 하위 클래스의 필드 선언은 `super()` 가 **끝난 뒤** `Object.defineProperty` 로 실행되므로, `StoreListDto` 에서 `page` 를 다시 선언하면(초기화 없이) `PaginationDto` 생성자가 넣은 값이 `undefined` 로 덮인다. Swagger 설명을 바꾸고 싶어도 부모 쪽 `@ApiProperty` 를 고친다.
- **기본값을 하위 유틸의 방어 로직에 맡기지 않는다** — `Pagination` 이 `parseInt(undefined) → NaN` 을 흡수하더라도([pagination.ts:27](../src/common/utils/pagination.ts)), 기본값의 소재지는 DTO 다. 유틸의 폴백은 안전망이지 사양이 아니다.
- 페이지 기본값은 공통 `PaginationDto` 생성자가 책임진다(`all_search_yn='N'`, `page=1`, `size=20`, `page_size=10` — `Pagination` 유틸 기본값과 동일). 기능별 Query DTO 는 `extends PaginationDto` 후 `super(data)` 를 호출하고 자기 필드만 추가한다.

**`@Body()` / `@Param()` 은 이 규칙에서 제외**

생성자가 없어도 `new` 는 동일하게 실행된다. 다른 것은 "값이 빠졌을 때 무슨 일이 벌어지느냐"다.

- Body 필수 필드: 누락 → `@IsNotEmpty` 가 잡아 400. **누락이 곧 검증 실패**라 기본값이 낄 자리가 없다.
- Body 선택 필드: 누락은 사용처에서 `?? null` 로 처리한다(아래).
- Path param: 라우트가 성립하는 한 항상 존재한다.
- 반면 Query 의 `page`/`size` 는 **누락이 정상 요청**이라 잡아줄 검증기가 없다 — 그래서 Query 만 DTO 가 기본값을 든다.

**⚠️ 수정 API 의 선택 필드는 `?? null` 필수** — TypeORM `update()` 는 값이 `undefined` 인 필드를 **무시**한다. `entity.address_detail = dto.address_detail` 로 두면 사용자가 값을 비워 보내도 기존 컬럼이 그대로 남는다. `dto.address_detail ?? null` 로 명시해 컬럼을 실제로 비운다.

## 서비스(비즈니스) 계층 규칙

- **public 메서드 1개 = controller 핸들러 1개 = API 1개**. 실측 예외: controller 없는 스케줄러 전용 service(`UserLeaveCleanupService.processLeaveWait`).
- **엔티티는 `new XEntity()` + 필드 할당으로 생성**(insert/update 모두) — 객체 리터럴 ❌. update 도 `new`+할당으로 `@BeforeUpdate` 트리거.
- 비즈니스 규칙 위반은 `BadRequestException`/`NotFoundException`/`UnauthorizedException`/`HttpException(…, HttpStatus.X)` 로 throw. body 는 `{message: '<한국어 문자열>'}`.
- **다중 쓰기 메서드에 `@Transactional()`** (단건 쓰기에도 부착 가능).
- **service 내부 private 헬퍼 금지** — 재사용·순수 변환은 util 로 추출.

## 공통 로직 분리

- **순수 함수(stateless) → util**, named `function` export(`@Injectable` 없음).
  - 도메인 전용: `src/api/v1/<domain>/<domain>.util.ts` (예: `isAdult`/`generateSnsLoginId`/`issueAccessAndRefresh`).
  - 전역(도메인 무관): `src/common/utils/*.ts` (`bcrypt`, `hash`, `cipher`, `jwt`, `validation` 등).
- **DI/lifecycle/외부연동 → `@Module`/`@Injectable`** (repository, seeder, scheduler 등).
- `@InjectRepository` 는 **repository 클래스 내부에만**. service 는 인터페이스 토큰만 쓰고 raw `Repository<T>` 직접 사용 ❌.
- barrel(`index.ts`) 파일 없음 — 모든 import 는 직접 경로.

## Import alias

- `@root/*` → `src/*`([tsconfig.json](../tsconfig.json)). cross-cutting import 에 사용(`@root/guards/...`, `@root/common/...`, `@root/modules/...`).
- **도메인 내부는 상대경로**(`./user.service`, `../entities/user.entity`).
- ⚠️ `@util/*` alias 는 tsconfig 에 선언만 있고 **대상 폴더(`src/util`)·사용처 0건 — 죽은 선언, 사용 금지**(정리 대상).

## 기본 데이터(시드) 명명

- 기본/룩업 데이터는 [seeder.targets.ts](../src/modules/seeder/seeder.targets.ts) 에 `<X>_SEED_DATA` 배열로만 정의(`AUTH_SEED_DATA`/`STATE_SEED_DATA`/`SNS_SEED_DATA`) + `SEED_TARGETS` 레지스트리. **엔티티는 시드 데이터 보유 ❌.**
- **`new XEntity()` 규칙의 의도적 예외**: 시드 행은 엔티티 타입의 **객체 리터럴**로 작성한다(`{auth_id:'USER', auth_name:'사용자', level:1}`). 정적 시드 *정의 데이터*라 `@BeforeInsert` 트리거·명료성 목적의 "객체 리터럴 금지" 규칙이 적용되지 않으며, 해당 룩업 엔티티는 타임스탬프 훅도 없다.

## 금지 형식 요약 (grep 으로 부재 확인)

| 회피 | 대신 |
|---|---|
| `@IsString`/`@IsNumber`/`@Type`/`@Transform` | 존재+형식/길이+enum 검증만 |
| `@CreateDateColumn`/`@UpdateDateColumn` | `@BeforeInsert`/`@BeforeUpdate` 훅 |
| `@Param('key')` 키-arg, `any` 입력 | 타입 DTO + `@PassportUser('user_id')` 첫 파라미터 |
| `ResponseDto` 접미사 | `ResultDto` |
| `index.ts` barrel | 직접 import 경로 |
| `@Column({unique:true})` | `@Unique('UK_...')` 데코레이터 |
| service 쓰기에서 객체 리터럴 엔티티 | `new XEntity()`+할당 (객체 리터럴은 `seeder.targets.ts` 에서만 허용) |
| service private 헬퍼 / service 의 raw `Repository<T>` | util 추출 / Symbol 토큰 인터페이스 |
| Swagger 응답 데코레이터의 `description` | `type` 만 |
