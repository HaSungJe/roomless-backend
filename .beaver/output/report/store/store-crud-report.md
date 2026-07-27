# Report — store-crud

## Feature Summary
- **Feature**: 관리자용 가맹점 목록·상세·수정·삭제 API 4개 + 등록 점검(revision 260727-1 동시 적용). `Pagination` 인프라 첫 실적용, Query DTO 생성자 규약 신설
- **Entry point**: `GET /api/v1/store/list` · `GET /api/v1/store/detail/:store_id` · `PATCH /api/v1/store/modify/:store_id` · `DELETE /api/v1/store/remove/:store_id`
- **Domain**: store

## Created/Modified/Deleted Files

| File | Change Type | Description |
|------|-----------|------|
| `src/common/dto/pagination.dto.ts` | modified | `PaginationDto` 에 기본값 생성자 추가(`data?: Partial<PaginationDto>` — 파이프가 인자 없이 `new` 하므로 선택). `size` 기본값 문서화를 20 으로 정정, `all_search_yn` 을 `required: false` 로 |
| `src/api/v1/store/entities/store.entity.ts` | modified | `business_number` 길이 20 → 45 + comment 갱신, `delete_backup` mediumtext NULL 추가 |
| `src/api/v1/store/dto/store-list.dto.ts` | created | `StoreListDto`(extends `PaginationDto`, 생성자 세트) + `StoreListItemDto` + `StoreListResultDto` |
| `src/api/v1/store/dto/store-detail.dto.ts` | created | `StoreDetailParamDto` + `StoreDetailResultDto` |
| `src/api/v1/store/dto/store-modify.dto.ts` | created | `StoreModifyParamDto` + `StoreModifyDto`(사업자등록번호 필드 없음) |
| `src/api/v1/store/dto/store-remove.dto.ts` | created | `StoreRemoveParamDto` |
| `src/api/v1/store/store.util.ts` | created | `buildStoreSearchWhere`(검색 WHERE 조립, ALL 은 where 배열 OR) + `buildStoreDeleteBackup`(삭제 스냅샷 직렬화) |
| `src/api/v1/store/interfaces/store.repository.interface.ts` | modified | `countStore`/`findStoreList`/`findStore`/`updateStore` 시그니처 추가 |
| `src/api/v1/store/repositories/store.repository.ts` | modified | 위 4개 메서드 구현 — 전부 try/catch + 통일 500. 조회는 `loadRelationIds: true` |
| `src/api/v1/store/store.service.ts` | modified | public 4개 추가(`list`/`detail`/`modify`/`remove`), 쓰기 2개에 `@Transactional()`. `register` 에 `delete_backup = null` 초기화(revision) |
| `src/api/v1/store/store.controller.ts` | modified | 핸들러 4개 추가. `list` 는 `const dto = new StoreListDto(query);` 로 생성 후 위임 |
| `src/api/v1/store/test/store-list.spec.ts` | created | 17 케이스 + `[SMOKE:data-access]` 7 케이스 + DTO 생성자 단위 2 케이스 |
| `src/api/v1/store/test/store-detail.spec.ts` | created | 9 케이스 |
| `src/api/v1/store/test/store-modify.spec.ts` | created | 12 케이스 |
| `src/api/v1/store/test/store-remove.spec.ts` | created | 10 케이스 |
| `src/api/v1/store/test/store-register.spec.ts` | modified | 전 컬럼 단언에 `delete_backup: null` 추가 |
| `CLAUDE.md` | modified | Validation 절에 Query DTO 생성자 규약 |
| `docs/conventions.md` | modified | "Query DTO 는 생성자를 갖고, 컨트롤러가 `new` 로 만들어 넘긴다" 절 신설 (초안 마커 부착 — ship 에서 확정) |
| `src/api/v1/store/store.module.ts` | unchanged | 신규 provider/entity 없음 |

## Tests Written

지배적 스타일 ① — 실제 controller+service+`ValidationPipe`(main.ts exceptionFactory 재현)+`CustomErrorFilter` 부팅, **repository 만 Symbol 토큰으로 `jest.fn()` 주입**. `PassportJwtAuthGuard` 만 `.overrideGuard`, **`RolesGuard` 는 실제 구현을 태워** 권한 분기를 진짜로 검증. 상단 `typeorm-transactional` mock.

단언 강도:
- **write 는 entity 컬럼 값까지** — modify 는 `toBeInstanceOf(StoreEntity)` + 5개 필드 + `business_number` 가 `undefined`(수정 대상 아님)임을, remove 는 `is_delete===1` / `business_number === 'DELETE_'+store_id` / `delete_backup` JSON 파싱 결과 전 필드를 단언.
- **실패 케이스마다 `.not.toHaveBeenCalled()`** — 검증 실패 시 `findStore` 미호출, `findStore` null 시 `updateStore` 미호출, `countStore` throw 시 `findStoreList` 미호출.
- 메시지는 한국어 리터럴 단언. 단 **필드 미전송 케이스는 `property` 만** 단언 — `@MaxLength`+`@IsNotEmpty` 가 함께 걸려 `constraints` 키 순서가 보장되지 않기 때문(기존 [store-register.spec.ts](../../../../src/api/v1/store/test/store-register.spec.ts) 와 동일한 처리).
- **Query DTO 규약 회귀 방지** — 쿼리 파라미터 전무 시 `findStoreList(…, 20, 0)`, `page` 만 전달 시 `size` 기본값 20 유지를 단언하고, `new StoreListDto()` 를 **인자 없이** 호출해도 전 필드 기본값이 채워지는지 단위로 확인(파이프의 인자 없는 `new` 경로 보호).

**`[SMOKE:data-access]`** — `buildStoreSearchWhere` 가 `Like()` 와 where 배열(OR)을 쓰는 매핑 민감 구성이라 필수. `new DataSource({type:'mysql', entities:[StoreEntity]})` + `buildMetadatas()` 후 `createQueryBuilder(...).setFindOptions({where, order, skip, take}).getSql()` 로 **DB 연결 없이** 실제 SQL 을 빌드해, 5가지 검색 분기가 각각 대상 컬럼명과 `LIKE`/`OR` 를 포함하는지, 정렬·페이지 조합이 매핑 오류 없이 빌드되는지 확인. 여기에 프로퍼티명≠컬럼명 위험 매핑 스냅샷(`[]`) 단언을 더해 신규 위험 매핑이 리뷰를 강제하도록 함([docs/testing.md](../../../../docs/testing.md) 규약).

## Verification

- build 규약대로 **테스트는 실행하지 않음** — worktree 에 의존성이 없다. 실행은 ship 후 `/beaver:test`.
- 읽기 검증: plan Design 코드와 구현 파일 1:1 대조 완료(엔티티 컬럼·DTO 데코레이터·util 분기·repository try/catch·service 흐름·컨트롤러 데코레이터 전부 일치).
- 규약 대조: 파일/클래스 명명, snake_case 전 레이어, 라우트 앞 `/`+kebab, DTO 데코레이터 순서(`@ApiProperty`→제약→`@IsNotEmpty` / optional 은 `@IsOptional` 먼저), 사용 데코레이터 집합(`@IsIn`/`@Matches`/`@MaxLength`/`@IsOptional`/`@IsNotEmpty` 만), repository 통일 500, `FindOptionsWhere` 타입, `loadRelationIds:true`, service public=API 1:1 + private 헬퍼 0(순수함수는 `store.util.ts`), 쓰기 `@Transactional()`, 엔티티 `new`+할당, Swagger `type` 만 + `@HttpCode` 명시, 응답 필드 생략 금지(`address_detail: null` 포함) — 전부 준수.
- 소스 확인으로 근거를 잡은 것:
  - `ValidationPipe` → `plainToInstance` → `new targetType()`(인자 없음) — `class-transformer@0.5.1` `cjs/TransformOperationExecutor.js:147`. 생성자 파라미터를 선택으로 둔 이유.
  - `forbidNonWhitelisted` 는 `whitelist: true` 없이는 무효 — `class-validator` `ValidationExecutor.js:66`. 그래서 modify 에 `business_number` 를 끼워보내도 400 이 아니라 무시되며, 테스트를 그 실제 동작으로 작성.
  - `SelectQueryBuilder.setFindOptions` 는 public 이며 즉시 `applyFindOptions()` 를 호출(`SelectQueryBuilder.js:69-71`) — smoke 가 `getSql()` 만으로 성립하는 근거.
- 페이지 계산은 `Pagination` 구현을 따라 손으로 검산해 단언값을 확정(total_count 2/12/50/0 각 케이스의 `max_page`·`page_range`·`limit`/`offset`).

## Remaining Issues

- ~~DB 스키마 미반영~~ — **해소(2026-07-27)**. 로컬 DB 는 `TYPEORM_SYNC=T` 로 부팅 시 자동 반영되므로 수동 ALTER 가 필요 없다(사용자 확인). 운영 배포 시에는 별도 반영이 필요하다.
- **`@BeforeUpdate` 실제 동작 미확인** — `update_at` 자동 갱신은 `@BeforeUpdate` 훅에 의존하고, spec 은 repository 를 mock 하므로 이 지점을 검증하지 못한다. **삭제 시각을 `update_at` 으로 갈음한다는 spec 규칙 11 이 여기 걸려 있으므로** `/beaver:test` 에서 확인이 필요하다. 기존 `updateUser`/`updateSessionRefresh` 도 같은 가정 위에 있어 프로젝트 전반의 미검증 지점이다.
- **smoke spec 의 무연결 API 사용은 첫 사례** — `buildMetadatas()` 가 `.d.ts` 상 protected 라 `(dataSource as any)` 캐스트로 호출했다([docs/testing.md](../../../../docs/testing.md) 규약이 지시하는 방식). API 존재는 소스로 확인했으나 실제 실행은 `/beaver:test` 가 처음이다.
- **§4.5 규약 문서 초안 상태** — [docs/conventions.md](../../../../docs/conventions.md) 의 Query DTO 절에 `beaver:draft` 마커가 붙어 있다. ship §1 에서 실제 코드와 대조해 확정(마커 제거)해야 한다.
- **미결 질문 2건** — ① `docs/data-layer.md` 에 목록 API 규약(`{list, pagination}` 래핑, count → Pagination → limit/offset 순서) 추가 여부 ② main 체크아웃의 untracked `.beaver/output/roadmap/` 사본 정리(ship 병합 시 충돌).
