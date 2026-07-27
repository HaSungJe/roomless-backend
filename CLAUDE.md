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

전체 개발 순서와 진척도는 [docs/roadmap.md](docs/roadmap.md) 에서 관리한다(살아있는 문서). 역할 정의(ADMIN=업체 관리 / MANAGER=객실·사물 관리 / USER=예약·제어)와 횡단 결정사항(매니저 1명=업체 1곳, 객실별 요금상품, 시간 기반 사전예약, Redis pub/sub 사물제어, PG 추상화)의 기준점이다. 기능 하나가 ship 될 때마다 해당 체크박스를 갱신한다.

---

## ⚠️ 주의사항

- `npm run start*` / `nest start` / 서버 기동 명령은 **반드시 사용자가 직접 실행** (Claude 실행 금지).
- DB 마이그레이션·배포(로컬 build 후 dist 업로드)도 사용자 몫. `t_user.phone` 등 nullable 변경·삭제된 테이블/컬럼 정리는 실제 스키마에서 사용자가 처리.
- 단 `npm test` 는 예외 — 구현 완료 후 Claude 가 Bash 도구로 직접 실행해 검증한다.

## 커밋 메시지

- **형식(항상)**: `YYYY.MM.DD` 날짜 줄 → 빈 줄 1개 → `-작업내용` 목록. **트레일러(`Co-Authored-By` 등) 금지 — 날짜+목록 외 아무것도 붙이지 않는다.** (출처: [.beaver/memory/git.md](.beaver/memory/git.md))
  ```
  2026.07.20

  -작업내용 1
  -작업내용 2
  ```

## Architecture

NestJS 11 + TypeORM 0.3(MySQL, `mysql2`) + passport-jwt + Swagger + `@nestjs/schedule` + typeorm-transactional. 도메인 **`user` · `store`** + 인프라 모듈(api-log·queue(미적용)·typeorm·seeder). 다국어(i18n) 없음 — 모든 사용자 노출 메시지는 한국어 리터럴.

```
src/
├── api/v1/user/   # 유일한 도메인: controller→service→repository + 스케줄러(leave-cleanup)
├── common/        # 비도메인 공통: dto, utils(순수함수)
├── config/        # typeorm.config.ts (기본 비즈니스 DataSource)
├── exception/     # CustomErrorFilter (전역 @Catch)
├── guards/        # passport.jwt.auth(적용), roles(적용)
├── modules/       # 인프라: api-log(@Global,별도 DataSource), queue(BullMQ,미적용), typeorm, seeder
├── app.module.ts  # 유일한 모듈 집합점
└── main.ts        # 부트스트랩
```

레이어: **controller → service → repository** 단방향. controller 는 라우팅·guard·swagger만(로직 0), service 는 비즈니스 로직 + 트랜잭션 경계, repository 는 모든 IO/SQL + DB 에러 변환. `@InjectRepository`(raw `Repository<T>`)는 repository 클래스 내부에만.

→ 상세(레이어/DI/시드/스케줄러/부트스트랩/새 도메인 절차): [docs/architecture.md](docs/architecture.md)

## Conventions

- **파일명**: 레이어 `<domain>.<role>.ts`(`user.controller.ts`, `user.symbols.ts`), DTO/엔티티 kebab `<domain>-<feature>.dto.ts`/`<feature>.entity.ts`. 클래스 `<Domain><Feature><Role>` — 응답은 항상 `ResultDto`(❌ `ResponseDto`).
- **DTO 독립 명명**: 기능당 DTO 1개, 모양 같아도 독립 선언(재사용/alias ❌).
- **snake_case 전 레이어 통일**: DTO 필드·entity 컬럼·path/query param·JWT payload 키 모두 snake_case. camelCase 는 지역 변수/util 함수명만.
- **라우트**: `@Controller('/api/v1/<domain>')`(앞 `/`), 핸들러도 앞 `/`+다단어 kebab, snake path param.
- **컨트롤러 입력은 항상 DTO 타입**(`any`·`@Param('key')` 금지). 인증은 `@PassportUser('user_id')` 첫 파라미터, 파라미터 한 줄.

→ 상세(명명/검증순서/금지형식): [docs/conventions.md](docs/conventions.md)

## 서비스(비즈니스) 계층 규칙

- **public 메서드 1개 = controller 핸들러 1개 = API 1개**. 실측 예외: controller 없는 스케줄러 전용 service([user.leave-cleanup.service.ts](src/api/v1/user/user.leave-cleanup.service.ts)).
- **service 내부 private 헬퍼 금지** — 재사용·순수 변환은 `<domain>.util.ts`(도메인) 또는 `src/common/utils/`(전역)로 추출.
- service 는 `new XEntity()`+필드 할당으로 엔티티를 만들고(객체 리터럴 ❌), repository 를 인터페이스 토큰으로 호출하며, 규칙 위반 시 HTTP 예외 throw.

## 공통 로직 분리

- **순수 함수(stateless) → util**: 전역 `src/common/utils/*.ts`(`bcrypt`/`hash`/`cipher`/`jwt`/`validation` 등), 도메인 전용 `src/api/v1/<domain>/<domain>.util.ts`. util 은 `@Injectable` 없이 named `function` export.
- **DI/lifecycle/외부연동 → `@Module`/`@Injectable`**: 인프라성은 `src/modules/`.
- barrel(`index.ts`) 없음 — 모든 import 직접 경로. 용어: "공통 모듈"=`@Module`, "공통 로직/범용 함수"=util.

## Validation

- `class-validator` 데코레이터. 사용: `@IsNotEmpty`/`@IsOptional`/`@IsIn`/`@Matches`/`@MaxLength`(+`@ValidateIf`). **`@IsString`/`@IsNumber`/`@Type`/`@Transform` 미사용**(존재+형식/길이+enum 만).
- **모든 검증 데코레이터에 `message: '<한국어 문자열>'` 리터럴 필수**. `@IsOptional()` 만 `message` 없음.
- **데코레이터 순서**: `@ApiProperty` → 제약 → `@IsNotEmpty`(맨 마지막). optional 은 `@ApiProperty` → `@IsOptional()` → 제약.
- **`@Query()` DTO 는 생성자를 세트로 갖고, 컨트롤러가 `const dto = new 클래스명(query);` 로 만들어 service 에 넘긴다**(호출부 `new` 인라인 ❌) — 쿼리는 키가 통째로 빠질 수 있고 그 누락은 정상 요청이라 잡아줄 검증기가 없다. `ValidationPipe` 설정은 그대로 두고 기본값 책임만 생성자로 옮긴다(검증=파이프, 기본값=생성자). **생성자 파라미터는 반드시 선택(`data?: Partial<T>`)** — 파이프가 내부적으로 `new targetType()` 을 인자 없이 호출하므로 필수로 두면 매 요청 500. 기본값을 `Pagination` 의 NaN 폴백에 맡기지 않는다. 페이지 기본값은 `PaginationDto` 생성자가 담당하고 기능별 Query DTO 는 `super(data)` 후 자기 필드만 추가(부모 필드 재선언 ❌ — `useDefineForClassFields` 로 값이 덮인다). `@Body()`/`@Param()` 은 해당 없음(누락이 곧 검증 실패).

→ 상세: [docs/conventions.md](docs/conventions.md)

## Error & Response

- **repository**: 모든 메서드 try/catch, 최종 실패는 통일 `InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'})`. insert/update errno 1062(UK)/1452(FK)를 제약명별 if 분기로 `BadRequestException` 매핑.
- **service**: 규칙 위반을 `BadRequestException`/`NotFoundException`/`UnauthorizedException`/`HttpException(…, HttpStatus.X)` 로 throw, body `{message: '<한국어 문자열>'}`. controller 는 throw 안 함.
- **`validationErrors` 기준**: 사용자 입력 필드 오류만 포함, 비즈니스·내부값 오류는 `{message}` 단독.
- 상태코드는 핸들러마다 `@HttpCode(200|204)` 명시. **응답 필드 생략 금지 — 없으면 `null` 포함**(`x: T | null`).

→ 상세: [docs/error-handling.md](docs/error-handling.md)

## API & Docs

- **모든 함수/메서드에 주석 필수**(레이어 무관 JSDoc/한 줄), controller 핸들러에 Swagger 데코레이터 필수.
- 클래스: `@ApiTags('<한글>')` → `@Controller(...)`.
- 메서드: HTTP verb → `@UseGuards`(인증 시) → `@Roles`(권한 제한 시) → `@HttpCode` → `@ApiOperation({summary})` → `@ApiBody` → `@ApiOkResponse`/`@ApiNoContentResponse` → 에러 응답들. 응답 데코레이터는 `type` 만(❌ `description`), `@ApiOperation` 은 `summary` 만.

→ 상세: [docs/api.md](docs/api.md)

## Data Layer

- **엔티티**: 테이블 `t_<domain>`, 제약 PascalCase(`PK_`/`UK_`/`FK_`), 모든 컬럼 `comment`, `@Unique()` 데코레이터(❌ `@Column({unique})`), FK 는 `@ManyToOne`+`@JoinColumn({foreignKeyConstraintName})`, 타임스탬프 `@BeforeInsert`/`@BeforeUpdate` 훅(❌ `@CreateDateColumn`). 룩업 엔티티(auth/state/sns)는 구조 컬럼만(시드 데이터·타임스탬프 없음).
- **repository**: 범용 메서드 우선, WHERE 는 service 가 구성·repository 는 실행만, where 타입 `FindOptionsWhere<XEntity>`(❌ `Partial`), 조회 시 `loadRelationIds: true`, `update(where, entity)` 는 `new XEntity()`+할당으로 호출.
- **Pagination**: 최초 적용은 가맹점 목록([store.service.ts](src/api/v1/store/store.service.ts) `list`). 응답은 `{list, pagination}` 래핑, 호출 순서는 **count → `Pagination` → 목록**(생성자가 `total_count` 를 받아 `limit`/`offset` 을 산출하므로 순서 강제), repository 는 개수·목록 두 메서드로 분리(`findAndCount` ❌). Query DTO 는 `extends PaginationDto`.

→ 상세: [docs/data-layer.md](docs/data-layer.md)

## Auth

- 인증은 **핸들러 단위** `@UseGuards(PassportJwtAuthGuard)`(컨트롤러 전체 아님). 공개 엔드포인트(sign/login/token-refresh)는 guard 생략, 보호 엔드포인트(leave/cancelLeave)는 부착.
- 로그인 회원은 반드시 `@PassportUser('user_id') user_id: string`(raw `@Req()` ❌). import: `@root/guards/passport.jwt.auth/passport.jwt.auth.decorator`.
- **역할 기반 권한**(`@Roles`+`RolesGuard`, `src/guards/roles/`): 관리자 전용 API 는 `@UseGuards(PassportJwtAuthGuard, RolesGuard)` + `@Roles('SUPER_ADMIN', 'ADMIN')` 를 **한 세트로** 부착(가드 순서 = 인증 → 권한). 권한값은 `t_auth` PK 문자열(SUPER_ADMIN/ADMIN/MANAGER/USER, [seeder.targets.ts](src/modules/seeder/seeder.targets.ts)). `RolesGuard` 는 불일치 시 `ForbiddenException({message: '접근 권한이 없습니다.'})` 로 403. 적용 예: [store.controller.ts](src/api/v1/store/store.controller.ts).

## 비동기 / 스케줄러

- **스케줄러**: `@nestjs/schedule`. `ScheduleModule.forRoot()` 는 `app.module.ts` 에 **1회만**. 실사용: leave 자동처리 `@Cron(EVERY_HOUR)`(운영 가드), api-log 파티션 월별 `@Cron`.
- **BullMQ 큐**(`src/modules/queue/`): 인프라 완비(`@UseQueue`/`WriteQueueRegistry`)이나 **적용 service 0건 — 미적용/규약**. Redis 미기동 시 빈 모듈로 graceful.

## Key Patterns

- **Repository DI**: Symbol 토큰(`<domain>.symbols.ts`) + 모듈 `{provide: TOKEN, useClass: XRepository}` + service `@Inject(TOKEN) … : XRepositoryInterface`(인터페이스는 `import type`).
- **모듈 등록**: 도메인 모듈에 `@SetMetadata('type','API')`/`description`/`path` → `main.ts` 가 reflector 로 Swagger 자동 생성. `app.module.ts` imports 에 추가.
- **Transaction**: `@Transactional()`(typeorm-transactional)을 쓰기 메서드에 부착. 부트스트랩 `initializeTransactionalContext()` + `addTransactionalDataSource()`.
- **Import alias**: `@root/*` → `src/*`. 도메인 내부는 상대경로.
- **api-log**: `@Global` 모듈 + 전역 `ApiLogInterceptor`, **별도 `apiLog` DataSource** 로 로그 격리.
- **기본 데이터 시드**: `OnApplicationBootstrap` 의 `SeederService` 가 [seeder.targets.ts](src/modules/seeder/seeder.targets.ts) `SEED_TARGETS` 의 기본 데이터(`<X>_SEED_DATA`)를 PK 기준 멱등 입력. 기본 데이터는 seeder 한 곳에서 관리(엔티티는 보유 ❌), 시드 행은 객체 리터럴 허용(유일 예외).

## Testing

- jest + ts-jest + `@nestjs/testing` + `supertest`. 위치 `<domain>/test/<feature>.spec.ts`(kebab), 인프라는 `src/modules/<m>/test/`. 실행 `npm test`, 단일 `npm test -- --testPathPatterns=<패턴>`.
- 지배적 스타일: ① controller 기능은 실제 controller+service+ValidationPipe+필터 부팅 후 **repository 만 Symbol 토큰으로 `jest.fn()` 주입**(외부 util 은 `jest.spyOn`+`mockRestore`, guard 는 `.overrideGuard`, 상단 `typeorm-transactional` mock). ② controller 없는 service(스케줄러·seeder)는 mock DataSource/repository 로 직접 `new`.
- 강도: 상태코드만 검사 금지 — mock 호출 횟수·인자(write 는 entity 컬럼 값)·실패 후 `.not.toHaveBeenCalled()` 까지 단언. 메시지는 한국어 리터럴로 단언. `[SUCCESS]`/`[FAIL:*]` describe 분류. **실DB·외부 IO 금지.**
- **Data-Access Smoke**: 매핑 민감 쿼리(관계 필드 where·`Like`/QueryBuilder·동적 조립) 메서드는 repository-mock spec 만으로 커버 금지 — TypeORM 무연결 쿼리 빌드 smoke 케이스 필수. 최초 적용 [store-list.spec.ts](src/api/v1/store/test/store-list.spec.ts)(정의·방법: [docs/testing.md](docs/testing.md)).
- 공유 service 생성자에 DI 추가 시 그 service 를 부팅하는 기존 모든 spec 의 providers 에 mock 추가(grep 전수).

→ 상세: [docs/testing.md](docs/testing.md)

## Checklist

- [ ] 파일/클래스명: 레이어 `<domain>.<role>.ts`, DTO/엔티티 kebab, 클래스 `<Domain><Feature><Role>Dto`(응답 `ResultDto`)
- [ ] 컨트롤러 입력 DTO 타입(`any`·`@Param('key')` 금지), 파라미터 한 줄, 인증 `@PassportUser('user_id')` 첫 파라미터
- [ ] 라우트 `@Controller('/api/v1/<domain>')` + 핸들러 앞 `/`, snake path param
- [ ] DTO 검증: `message: '<한국어 문자열>'` 리터럴 필수, `@IsNotEmpty` 맨 마지막, `@IsString` 미사용
- [ ] Entity: `@Entity({name:'t_…', comment})`, 제약명 `PK_/UK_/FK_`, `@Unique()`/`@JoinColumn({foreignKeyConstraintName})`, `@BeforeInsert/@BeforeUpdate` 타임스탬프, 모든 컬럼 comment
- [ ] Repository: try/catch + 통일 500, errno 1062/1452 분기, `FindOptionsWhere`, `loadRelationIds:true`, `update` 는 `new XEntity()` 전달
- [ ] Service: public=API 1:1, private 헬퍼 없이 util 분리, 쓰기 `@Transactional()`, 엔티티는 `new`+할당
- [ ] Error: repository 통일/매핑, service throw 는 `{message: '<한국어 문자열>'}`, `validationErrors` 는 입력 필드 오류만
- [ ] Swagger: 클래스 `@ApiTags`, 메서드 순서·`type`만, `@HttpCode(200|204)`, void 는 `@ApiNoContentResponse`
- [ ] Repository DI: Symbol 토큰 + `useClass`/`@Inject`, 모듈 `@SetMetadata('type','API')` + `app.module.ts` 등록
- [ ] 응답 필드 생략 금지 — 없으면 `null` 포함(`x: T | null`)
- [ ] 기본 데이터 추가 시 seeder.targets.ts(`<X>_SEED_DATA`+`SEED_TARGETS`)에만 정의(엔티티 보유 ❌)
- [ ] 테스트: repository mock 주입, 호출 횟수·인자·미호출 단언, 한국어 리터럴 메시지 단언, `npm test` 통과
