# dto (archived)

## Query DTO 는 생성자를 갖고, 컨트롤러가 new 로 만들어 넘긴다

- Rule:
  1. `@Query()` 로 받는 DTO 는 **생성자를 세트로** 갖는다.
  2. **컨트롤러가 `const dto = new 클래스명(query);` 로 지역변수를 만든 뒤 service 에 넘긴다** — 받은 쿼리 객체를 그대로 흘리지 않고 컨트롤러에서 한 번 생성자를 태워 기본값이 확정된 인스턴스를 만든다. 호출부에 `new` 인라인 ❌, 필드 하나씩 대입 ❌. 앞선 인자가 있으면 `this.xService.list(user_id, dto)` 처럼 `dto` 를 마지막에 둔다.
  3. **`ValidationPipe` 설정은 그대로 둔다**(각 앱 main.ts 의 transform·forbidNonWhitelisted·exceptionFactory=validationExceptionFactory 불변). 검증은 파이프, 기본값은 생성자로 책임을 나눈다.
  - 기본값을 `Pagination` 같은 하위 유틸의 NaN 폴백에 맡기지 않는다 — 유틸의 방어 로직은 안전망이지 사양이 아니다. 페이지 기본값(`all_search_yn='N'`, `page=1`, `size=20`, `page_size=10`)은 공통 `PaginationDto` 생성자가 책임지고, 기능별 Query DTO 는 `extends PaginationDto` 후 `super(data)` 호출 + 자기 필드만 추가. `@Body()`/`@Param()` DTO 에는 적용하지 않는다.
- **⚠️ 생성자 파라미터는 반드시 선택(`data?: Partial<T>`)** — `ValidationPipe({transform: true})`(apps/*/src/main.ts) → `classTransformer.plainToInstance(...)`(@nestjs/common pipes/validation.pipe — 11.1.28 에서 확인, 12 에서도 같은 경로) → `newValue = new targetType()`(class-transformer@0.5.1 cjs/TransformOperationExecutor.js:147)로 **인자 없이** 호출된다. 파라미터를 필수로 두면 `data` 가 undefined 라 `data.page` 접근에서 **매 요청 500**. TypeScript 는 파이프의 리플렉션 호출을 못 보므로 컴파일에서 안 잡힌다. `data?.x ?? 기본값` 형태여야 파이프 경로와 컨트롤러 `new` 경로가 모두 산다.
- 참고: 파이프 경로에서는 생성자 실행 후 `keys = Object.keys(object)`(같은 파일 384행)로 **요청에 들어온 키만** 덮어쓴다. 쿼리가 비어도 `toEmptyIfNil` 이 `{}` 로 넘겨 생성자는 동일하게 실행된다.
- **⚠️ 입력 DTO(`@Query`/`@Body`/`@Param`)의 모든 필드에 class-validator 데코레이터 최소 1개 — 제약이 없으면 `@IsOptional()` 이라도 붙인다.** (응답 `ResultDto` 는 파이프를 타지 않으므로 대상 아님.) `@ApiProperty` 는 Swagger 메타데이터라 계산에 안 들어가고, 검증 데코레이터가 0건인 필드는 `whitelist: true` 인 순간 `delete object[property]` 로 조용히 스트립된다(class-validator `ValidationExecutor.js:84-105`). 현재 main.ts 는 `whitelist` 미설정이라 발동하지 않지만(NestJS 기본값 없음 — `validation.pipe.js:30`), 켜는 순간 페이지 파라미터가 소리 없이 증발하므로 선제적으로 붙인다. 출처: User feedback 2026-07-27 — "여기에 isoptional 안붙이면 pipe 에서 못읽는경우 있길래 넣은거임."
- 그 밖의 함정:
  1. **쿼리 값은 문자열로 들어온다** — `@Type`/`@Transform` 미사용 + `enableImplicitConversion` 미설정이라 `page: number` 로 선언해도 런타임 값은 `'2'`. service 에서 직접 산술 금지, `Pagination` 에 넘겨 `parseInt` 를 태운다.
  2. **상속 시 부모 필드 재선언 금지** — tsconfig `target: ES2023` → `useDefineForClassFields` 기본 true. 하위 클래스 필드 선언은 `super()` 종료 후 `Object.defineProperty` 로 실행되므로, 부모 생성자가 넣은 기본값이 `undefined` 로 덮인다.
- Body/Param 이 예외인 이유: 생성자 없이도 `new` 는 동일하게 실행된다. 다른 건 누락 시 처리다 — Body 필수 필드는 누락이 곧 `@IsNotEmpty` 검증 실패(400)라 기본값이 낄 자리가 없고, Path param 은 라우트가 성립하는 한 항상 존재한다. Query 의 `page`/`size` 만 **누락이 정상 요청**이라 잡아줄 검증기가 없다.
- 인접 함정(Body 쪽): **수정 API 의 선택 필드는 `?? null` 필수**. TypeORM `update()` 는 `undefined` 필드를 무시하므로, `entity.x = dto.x` 로 두면 사용자가 값을 비워 보내도 기존 컬럼이 그대로 남는다.
- Scope: global
- Rationale: User feedback 2026-07-27 — "get형태의 Query로 받는 Dto는, 생성자가 필요해. 그래야 기본값 설정이 가능함. 페이지가 null인데 생성자가 없어 new XX()를 못하니 페이지가 없어서 오류날거야. 이 부분은 코드베이스 명시해야함" (store-crud 기획 중, `Pagination` 최초 적용 시점)
- CLAUDE.md application: applied(CLAUDE.md "Validation" 절 + docs/conventions.md "Query DTO 는 생성자에서 기본값을 설정한다" 절 — 초안 마커 부착, ship 에서 확정)
- Priority: takes precedence over CLAUDE.md/defaults
- Archived: 2026-10-19 beaver analyze — docs/conventions.md "Query DTO" · "Validation" 절 + AGENTS.md "Validation" 요약으로 이동 (대조 완료: 20개 조항)
