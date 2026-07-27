# Review — worktree-stick+store-9c4msb — 260727

대상: `main`(dfc7e8d) 대비 워킹트리 전체 — 신규 4 API(목록·상세·수정·삭제) + 등록 revision + 규약 문서.

## 결과 요약

| 항목 | 판정 |
|---|---|
| memory 규칙 준수 | 통과 |
| 명명·구조·공통로직 분리 | 통과 |
| 에러/응답 규약 | 통과 |
| 테스트 강도 | 통과 |
| Data-Access Smoke 커버리지 | 통과 |
| 기획 의도 일치 | 통과 |
| 초안 규약 확정 | 처리 완료 |
| **findings** | **1건 (low)** |

## memory 규칙 대조 (최우선)

| 규칙 | 대조 결과 |
|---|---|
| [dto.md](../../memory/dto.md) — Query DTO 는 생성자 세트, 컨트롤러가 `const dto = new XXX(query);` 로 생성, ValidationPipe 불변 | `StoreListDto`/`PaginationDto` 둘 다 `data?: Partial<T>` 선택 파라미터 생성자. [store.controller.ts](../../../src/api/v1/store/store.controller.ts) `list` 가 `const dto = new StoreListDto(query);` 후 위임(인라인 `new` 없음). `main.ts` 무변경 — **준수** |
| dto.md 함정 ① 무인자 호출 내성 | `data?.x ?? 기본값` 형태. `new StoreListDto()` 단위 테스트로 회귀 방지 — **준수** |
| dto.md 함정 ② 쿼리 값은 문자열 | service 가 산술하지 않고 `Pagination` 에 넘겨 `parseInt` 를 태움 — **준수** |
| dto.md 함정 ③ 부모 필드 재선언 금지 | `StoreListDto` 는 `search_type`/`search_keyword` 만 선언, 부모 4필드 재선언 없음 — **준수** |
| dto.md 인접 함정 — 수정 API 선택 필드 `?? null` | `modify` 가 `dto.address_detail ?? null` — **준수**(전용 테스트 있음) |
| [db.md](../../memory/db.md) — 로컬은 자동 싱크, 스키마를 build 차단 항목으로 걸지 않음 | plan 의 Prerequisites 를 "스키마 변경(로컬 자동 반영)"으로 재분류 — **준수** |
| [git.md](../../memory/git.md) — 커밋 메시지 `YYYY.MM.DD` + 빈 줄 + `-목록`, 트레일러 금지 | §2 커밋에서 적용 예정 |
| git.md — `.beaver/output/` 은 커밋 포함 | spec/plan/report/revision/roadmap/review 전부 스테이징 대상 — **준수** |

**memory reconcile**: `미반영` 상태 항목 없음. dto.md 는 `applied`(CLAUDE.md + docs/conventions.md), db.md 는 `not needed`, git.md 는 기존 `applied`. 추가 조치 불필요.

## CLAUDE.md 규약 대조

- **명명** — 레이어 `<domain>.<role>.ts`(`store.util.ts` 신규), DTO kebab `store-<feature>.dto.ts`, 클래스 `<Domain><Feature><Role>`, 응답 `ResultDto` 접미사. path param DTO 는 `<Domain><Feature>ParamDto` 로 통일. **통과**
- **DTO 독립 선언** — `StoreListItemDto` 와 `StoreDetailResultDto` 는 필드 구성이 같지만 독립 선언(재사용/alias 없음). 규약대로. **통과**
- **컨트롤러** — 입력 전부 DTO 타입, `@Param('key')` 없음, 파라미터 한 줄, 로직은 `list` 의 DTO 생성 1줄뿐(규약이 명시적으로 허용). 데코레이터 순서 verb → `@UseGuards` → `@Roles` → `@HttpCode` → `@ApiOperation` → `@ApiBody` → 성공 → 에러. 응답 데코레이터 `type` 만. **통과**
- **Validation** — 사용 데코레이터가 허용 집합(`@IsNotEmpty`/`@IsOptional`/`@IsIn`/`@Matches`/`@MaxLength`)뿐이고 `@IsString`/`@Type`/`@Transform` 없음. 전 제약에 한국어 `message` 리터럴, `@IsNotEmpty` 맨 마지막, optional 은 `@IsOptional()` 선행. **통과**
- **Entity** — `delete_backup` 에 comment 부착, `business_number` comment 갱신, 제약명·타임스탬프 훅 무변경. **통과**
- **Repository** — 신규 4메서드 전부 try/catch + 통일 500, where 타입 `FindOptionsWhere<StoreEntity>`(OR 은 배열), 조회 `loadRelationIds: true`, `update` 는 `new StoreEntity()` 전달. **통과**
- **Service** — public 5개 = API 5개, private 헬퍼 0(순수함수는 `store.util.ts` 로 분리), 쓰기 2개에 `@Transactional()`, 엔티티는 `new`+할당. throw 는 `NotFoundException({message})`. **통과**
- **응답 필드 생략 금지** — `address_detail: string | null` 로 항상 포함. 전용 테스트 있음. **통과**

## Data-Access Smoke 커버리지

`buildStoreSearchWhere` 가 `Like()` + `FindOptionsWhere[]`(OR)을 만드는 **매핑 민감 구성**이라 해당됨. [store-list.spec.ts](../../../src/api/v1/store/test/store-list.spec.ts) 의 `[SMOKE:data-access]` describe 가 `new DataSource` + `buildMetadatas()` + `setFindOptions().getSql()` 로 무연결 SQL 빌드를 검증(검색 5분기 각각의 대상 컬럼명 + `LIKE`/`OR`, 정렬·페이지 조합). 위험 매핑 스냅샷(`[]`) 단언 포함. **mock-only 커버 아님 — 통과.**

## 기획 의도 일치

spec 의 Business Rules 12개 항목을 구현과 1:1 대조 — 전부 일치. 특히:
- 규칙 3(`search_type`/`search_keyword` 한쪽만 오면 400 이 아니라 전체 목록) — util 의 `if (!search_type || !search_keyword)` + 전용 테스트로 확인
- 규칙 9~10(삭제는 `is_delete`·`business_number`·`delete_backup` 3개만 건드리고 나머지 컬럼은 손대지 않음) — remove 가 `new StoreEntity()` 에 3필드만 할당, "나머지 컬럼 `undefined`" 테스트로 고정
- 규칙 12(복구 API 없음) — 엔드포인트 미생성 확인

## 초안 규약 확정 + 문서 사실 정합성

- [docs/conventions.md](../../../docs/conventions.md) "Query DTO …" 절: 문서의 예시 코드(생성자 시그니처·`super(data)`·컨트롤러 `const dto =`)와 실제 구현이 일치함을 확인 후 **`beaver:draft` 마커 제거 — 정식 규약으로 확정**.
- 이번 변경으로 **거짓이 된 서술을 정정**:
  - `CLAUDE.md` "Pagination: 적용 0건 — 미적용/규약" → 최초 적용 사실 + 형태 규약으로 교체
  - `CLAUDE.md` "Data-Access Smoke(미적용/규약)" → 최초 적용 링크 추가
  - `CLAUDE.md` "현재 단일 도메인 `user`" → `user`·`store`(store-register ship 이후 남아 있던 드리프트)
  - `docs/data-layer.md` "Pagination / 목록 조회 — 미적용/규약" → 목록 API 규약 절로 교체(`{list, pagination}` 래핑, count → Pagination → 목록 순서, `findAndCount` 금지 근거)
  - `docs/testing.md` "Data-Access Smoke — 미적용/규약" → 최초 적용 사례 명시
- [docs/roadmap.md](../../../docs/roadmap.md) 1단계 ADMIN API 4개 체크 + 단계 뱃지 ⬜ → 🟡.

## Findings

### F-1 (low) — `all_search_yn` 에 검증기가 없어 잘못된 값이 조용히 'N' 으로 강등된다 → **기각(사용자 판단)**

> **결론**: 지적 자체는 성립하지만 **의도된 동작**이다. `Y` 가 아니면 전부 `N` 으로 처리하는 것이 사양이며, 이는 `Pagination` 유틸의 기존 의미론(`['Y','N'].includes(...) ? ... : 'N'`, [pagination.ts:26](../../../src/common/utils/pagination.ts))과 일치한다. `@IsIn` 을 붙이면 오히려 유틸과 계약이 어긋난다.
>
> 경과: 승인받아 `@IsIn` 을 넣었다가 사용자 판단으로 되돌렸다(2026-07-27). `@IsOptional()` 은 아래 별도 사유로 유지. 테스트는 400 케이스 대신 **`?all_search_yn=X` 가 200 + `pagination.all_search_yn === 'N'`** 으로 처리되는지 단언하도록 바꿨다 — 의도된 동작을 고정한다.
>
> `page`/`size`/`page_size` 형식 검증(`@Matches(/^\d+$/)`)은 여전히 미도입 — 별도 건.
>
> **사용자 추가 수정(2026-07-27)**: `page`/`size`/`page_size` 와 `PageRangeResultDto.start`/`end` 에 `@IsOptional()` 추가, `page_rangeResultDto` → `PageRangeResultDto` 로 클래스명 PascalCase 정정, `PaginationResultDto.page_range` 타입을 `any` → `PageRangeResultDto` 로 구체화. 클래스명 정정은 규약 위반 해소이며 참조 3곳이 모두 동일 파일 내라 파급 없음.
>
> **`@IsOptional()` 추가의 진짜 근거(사용자 지적으로 정정)**: 리뷰 초안은 이를 "형태 일관성"으로만 적었으나 틀렸다. 검증 데코레이터가 **하나도 없는 필드**는 `whitelist: true` 인 순간 `delete object[property]` 로 **조용히 스트립된다**(`class-validator` `ValidationExecutor.js:84-105` — 메타데이터 0건 프로퍼티를 `notAllowedProperties` 로 모아 `forbidNonWhitelisted` 면 400, 아니면 삭제). `@ApiProperty` 는 Swagger 메타데이터라 이 계산에 들어가지 않는다. 현재 [main.ts](../../../src/main.ts) 는 `whitelist` 미설정이라(NestJS 도 기본값을 넣지 않음 — `validation.pipe.js:30`) 발동하지 않지만, 켜는 순간 페이지 파라미터가 소리 없이 증발한다. **선제 방어로 정당하며 규약으로 승격**([conventions.md](../../../docs/conventions.md) "DTO 의 모든 필드는 class-validator 데코레이터를 최소 1개 갖는다", [dto.md](../../memory/dto.md)).
>
> 남은 관련 지점(이번 범위 밖): `page`/`size`/`page_size` 는 여전히 **형식 검증이 없다** — `?page=abc` 는 400 이 아니라 `Pagination` 의 `parseInt → NaN → 기본값` 폴백으로 흡수된다(`@IsIn` 은 숫자 문자열에 안 맞고 `@IsNumber` 는 규약상 금지). 형식까지 막으려면 `@Matches(/^\d+$/)` 도입을 별도 건으로 다룬다. `PageRangeResultDto` 는 응답 DTO 라 `ValidationPipe` 를 타지 않지만, 위 규약을 응답 DTO 에도 일관 적용한 형태다(무해).

- **위치**: [src/common/dto/pagination.dto.ts](../../../src/common/dto/pagination.dto.ts) `PaginationDto.all_search_yn`
- **내용**: `@IsIn(['Y','N'])` 이 없어 `?all_search_yn=X` 같은 오입력이 400 이 아니라 `Pagination` 생성자의 폴백으로 `'N'` 이 된다. 동작상 안전하지만, "enum 은 `@IsIn` 으로 검증" 규약과 "기본값을 하위 유틸 폴백에 맡기지 않는다"는 이번 신설 규약의 취지에서 벗어난다.
- **범위 판단**: `PaginationDto` 는 공용 인프라라 지금 검증기를 붙이면 **앞으로 만들 모든 목록 API 의 계약이 바뀐다**(현재는 이 트랙이 유일한 사용처라 부담은 최소). 이번 기획 범위 밖의 변경이므로 사용자 판단에 맡긴다.
- **제안**: `@ApiProperty` → `@IsOptional()` → `@IsIn(['Y','N'], {message: '전체검색 여부가 올바르지 않습니다.'})` 2줄 추가 + `store-list.spec.ts` 에 400 케이스 1건.

## 후속 (이번 ship 범위 밖)

- [docs/roadmap.md](../../../docs/roadmap.md) 의 역할 정의·횡단 결정사항이 [store-roadmap.md](../roadmap/store-roadmap.md) 의 결정(총괄매니저 분리, 배정 개념 제거, 인력의 `store_id` 불변식)과 어긋난다. 해당 유닛(#8~#11) 착수 시점에 `/beaver:roadmap` 으로 정리 대상.
- `@BeforeUpdate` 훅의 `update_at` 자동 갱신은 repository-mock 구조상 검증 불가. "삭제 시각 = `update_at`" 규칙이 여기 걸려 있어 `/beaver:test` 확인 필요.
- 이 리뷰는 **테스트를 실행하지 않았다**(worktree 에 의존성 없음). 48케이스의 최초 실행은 ship 후 `/beaver:test`.
