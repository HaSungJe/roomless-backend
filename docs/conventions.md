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
- **모든 제약 데코레이터에 `message: i18nMsg('<key>')` 필수**(문자열 리터럴 ❌). `@IsOptional()` 만 `message` 없음.
- **데코레이터 순서**:
  - 필수 필드: `@ApiProperty` → 제약(`@IsIn`/`@MaxLength`/`@Matches`) → `@IsNotEmpty` **맨 마지막(필드 바로 위)**.
  - optional 필드: `@ApiProperty` → `@IsOptional()` → 제약.
  - `@ValidateIf` 짝 필드: `@ApiProperty` → `@ValidateIf` → 제약 → `@IsNotEmpty`.
- **i18n 키 = `<domain>.dto.<feature>.<field>_<rule>`** (예: `user.dto.sign.sns_id_invalid`). 호출 줄에 ko 메시지 한글 주석 병기.
- `i18nMsg` 는 lazy(`() => translate(key) ?? ''`)라 검증 시점에 언어가 해석된다.

근거: [user-sign.dto.ts](../src/api/v1/user/dto/user-sign.dto.ts), [user-login.dto.ts](../src/api/v1/user/dto/user-login.dto.ts).

## 서비스(비즈니스) 계층 규칙

- **public 메서드 1개 = controller 핸들러 1개 = API 1개**. 실측 예외: controller 없는 스케줄러 전용 service(`UserLeaveCleanupService.processLeaveWait`).
- **엔티티는 `new XEntity()` + 필드 할당으로 생성**(insert/update 모두) — 객체 리터럴 ❌. update 도 `new`+할당으로 `@BeforeUpdate` 트리거.
- 비즈니스 규칙 위반은 `BadRequestException`/`NotFoundException`/`UnauthorizedException`/`HttpException(…, HttpStatus.X)` 로 throw. body 는 `{message: translate('<key>')}`.
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
