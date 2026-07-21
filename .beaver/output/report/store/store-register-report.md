# Report — store-register

## Feature Summary
- **Feature**: 가맹점 header 테이블(`t_store`) 신설 + 등록 API 1개, SUPER_ADMIN/ADMIN 전용 (RolesGuard 첫 실적용)
- **Entry point**: `POST /api/v1/store/register`
- **Domain**: store (신규)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `src/api/v1/store/entities/store.entity.ts` | created | `t_store` — PK_Store, UK_Store_BusinessNumber, 전 컬럼 comment, `@BeforeInsert`/`@BeforeUpdate` 타임스탬프 훅 |
| `src/api/v1/store/dto/store-register.dto.ts` | created | `StoreRegisterDto`(상호명/사업자번호10자리/대표자명/연락처/주소+상세) + `StoreRegisterResultDto`(store_id) |
| `src/api/v1/store/interfaces/store.repository.interface.ts` | created | `insertStore` 시그니처 |
| `src/api/v1/store/repositories/store.repository.ts` | created | try/catch + errno 1062(UK_Store_BusinessNumber) 분기 400, 그 외 통일 500 |
| `src/api/v1/store/store.symbols.ts` | created | `STORE_REPOSITORY` Symbol 토큰 |
| `src/api/v1/store/store.service.ts` | created | public 1개(`register`) = API 1개, `@Transactional()`, `new StoreEntity()`+할당 |
| `src/api/v1/store/store.controller.ts` | created | `@ApiTags('가맹점')`, `@UseGuards(PassportJwtAuthGuard, RolesGuard)` + `@Roles('SUPER_ADMIN','ADMIN')`, `@HttpCode(200)` |
| `src/api/v1/store/store.module.ts` | created | `@SetMetadata` 3종(Swagger 자동 등록) + `forFeature([StoreEntity])` + Symbol DI |
| `src/api/v1/store/test/store-register.spec.ts` | created | 13 케이스 — [SUCCESS]×3 / [FAIL:auth]×3 / [FAIL:validation]×5 / [FAIL:duplicate]×1 / [FAIL:repository]×1 |
| `src/guards/roles/roles.guard.ts` | modified | 거부 시 `ForbiddenException({message: '접근 권한이 없습니다.'})` throw — Nest 기본 영문 응답 노출 차단 |
| `src/app.module.ts` | modified | `StoreModule` import + imports 배열 등록 |

## Tests Written
- 지배적 스타일 ①(HTTP boot + repository Symbol 토큰 mock) — 상단 `typeorm-transactional` mock, 실제 controller+service+ValidationPipe(main.ts exceptionFactory 재현)+CustomErrorFilter 부팅.
- **RolesGuard 는 mock 하지 않고 실제 구현을 태움** — `PassportJwtAuthGuard` 만 override 해 `req.user = {user_id, auth_id}` 를 주입하고, 권한 분기(SUPER_ADMIN/ADMIN 통과, USER/MANAGER 403)를 진짜로 검증.
- 단언 강도: 응답 `store_id` 정규식(`/^[a-f0-9]{32}$/`) + entity `toBeInstanceOf(StoreEntity)` + 전 컬럼 값(is_delete=0, address_detail null 포함), 실패 케이스마다 `insertStore` 미호출, 한국어 리터럴 메시지 단언.
- `[SMOKE:data-access]` 해당 없음 — `insertStore` 는 criteria 없는 insert 전용(plan 대로).

## Verification
- build 규약대로 **테스트는 실행하지 않음**(워크트리에 의존성 없음) — 실행은 ship 후 `/beaver:test`.
- 읽기 검증: plan Design 코드와 구현 파일 1:1 대조 완료(엔티티 컬럼·DTO 검증식·서비스 할당·컨트롤러 데코레이터·모듈 메타데이터 전부 일치).
- 규약 대조: 파일/클래스 명명(`<domain>.<role>.ts`, kebab DTO, `ResultDto` 접미사), snake_case 전 레이어, 라우트 앞 `/`+kebab, DTO 데코레이터 순서(`@ApiProperty`→제약→`@IsNotEmpty`), 엔티티 제약명 PascalCase·`@Unique()` 데코레이터, repository 통일 500, Symbol DI, Swagger `type` 만 — 전부 준수.
- 흐름 검증(추론): RolesGuard 거부 → `ForbiddenException` → `CustomErrorFilter` 가 `exception['response']` 를 그대로 전달 → 403 `{message:'접근 권한이 없습니다.'}`. spec 의 403 단언과 일치.

## Remaining Issues
- **`@Roles` 데코레이터 위치는 신규 규약 요소** — `@UseGuards` 직후에 배치했다(가드 관련 그룹). CLAUDE.md/docs 의 메서드 데코레이터 순서 서술에는 아직 `@Roles` 항목이 없음.
- **§4.5 규약 문서 갱신 미승인** — CLAUDE.md/docs 의 "역할 기반 권한: 적용 0건 — 미적용/규약" 서술이 이번 적용으로 사실과 어긋나게 됨. 갱신 승인 시 ship 전에 반영 필요(현재는 plan/spec 문서에만 기록).
- DB 실스키마의 `t_store` 생성은 사용자 몫(`TYPEORM_SYNC=T` 환경은 부팅 시 자동 생성).
