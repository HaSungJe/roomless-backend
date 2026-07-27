---
feature_goal: "관리자용 가맹점 목록·상세·수정·삭제 API (등록 이후의 생애주기)"

domain: "store"

api_method: "GET / GET / PATCH / DELETE"

api_path: "/api/v1/store/list, /api/v1/store/detail/:store_id, /api/v1/store/modify/:store_id, /api/v1/store/remove/:store_id"

affected_data:
  - "t_store (읽기: 목록·상세 / 쓰기: 수정·삭제)"
---

## Feature Description

가맹점은 현재 **등록만** 가능하다([store.controller.ts:29](../../../../src/api/v1/store/store.controller.ts)). 등록한 뒤 관리자가 무엇을 등록했는지 확인하거나, 상호·연락처를 고치거나, 폐점 처리를 할 수단이 전혀 없다.

이 기능은 가맹점의 **등록 이후 생애주기**를 채운다 — 목록으로 훑고, 상세로 확인하고, 정보를 고치고, 폐점을 처리한다. 네 API 모두 `SUPER_ADMIN`/`ADMIN` 전용이며, 매니저·이용자 동선은 이 범위에 없다.

삭제는 실제 행 삭제가 아니라 **soft delete + 사업자등록번호 마스킹**이다. 삭제 시점의 정보를 `delete_backup` 에 JSON 으로 남기고 `business_number` 를 `DELETE_<store_id>` 로 치환해 `UK_Store_BusinessNumber` 를 비운다. 그래야 폐점한 업체와 같은 사업자등록번호로 새 가맹점을 등록할 수 있다. 이 방식은 회원 탈퇴의 `t_user.leave_backup` 선례를 그대로 따른 것이다([user.entity.ts:72](../../../../src/api/v1/user/entities/user.entity.ts)).

## API Spec

### 1) 가맹점 목록 조회

- **Method**: GET
- **Path**: `/api/v1/store/list`
- **Request** (query, `StoreListDto`)

| 필드 | 필수 | 형식 | 설명 |
|---|---|---|---|
| `search_type` | 선택 | `ALL`\|`STORE_NAME`\|`BUSINESS_NUMBER`\|`OWNER_NAME` | 검색 대상. 생략 시 검색 없음 |
| `search_keyword` | 선택 | 최대 100자 | 검색어. 생략 시 검색 없음 |
| `all_search_yn` | 선택 | `Y`\|`N` | 전체검색 여부. 기본 `N` |
| `page` | 선택 | 숫자 | 기본 1 |
| `size` | 선택 | 숫자 | 기본 20 |
| `page_size` | 선택 | 숫자 | 기본 10 |

> 기본값은 **`PaginationDto` 무인자 생성자**가 대입한다(`StoreListDto` 는 `super()` 호출 후 `search_type`·`search_keyword` 를 `null` 로 초기화). `Pagination` 유틸의 NaN 폴백에 기대지 않는다 — [.beaver/memory/dto.md](../../../memory/dto.md).

- **Response** (200, `StoreListResultDto`)

```
{
  "list": [
    {
      "store_id": "…", "store_name": "…", "business_number": "…",
      "owner_name": "…", "phone": "…", "address": "…",
      "address_detail": null, "create_at": "…", "update_at": "…"
    }
  ],
  "pagination": { "all_search_yn": "N", "total_count": 0, "page": 1, "max_page": 1,
                  "page_range": {"start": 1, "end": 1},
                  "content_start_number": 0, "content_start_number_reverse": 1 }
}
```

### 2) 가맹점 상세 조회

- **Method**: GET
- **Path**: `/api/v1/store/detail/:store_id`
- **Request**: path param `store_id` (`StoreDetailDto`, 32자 hex)
- **Response** (200, `StoreDetailResultDto`) — 목록 항목과 동일한 필드 집합. `address_detail` 은 없으면 `null`

### 3) 가맹점 수정

- **Method**: PATCH
- **Path**: `/api/v1/store/modify/:store_id`
- **Request**: path param `store_id` + body (`StoreModifyDto`)

| 필드 | 필수 | 형식 |
|---|---|---|
| `store_name` | 필수 | 최대 100자 |
| `owner_name` | 필수 | 최대 50자 |
| `phone` | 필수 | `/^\d{2,4}-?\d{3,4}-?\d{4}$/` |
| `address` | 필수 | 최대 255자 |
| `address_detail` | 선택 | 최대 255자 |

> `business_number` 는 **수정 대상이 아니다** — DTO 에 아예 넣지 않는다.

- **Response**: 204 No Content

### 4) 가맹점 삭제

- **Method**: DELETE
- **Path**: `/api/v1/store/remove/:store_id`
- **Request**: path param `store_id` (`StoreRemoveDto`)
- **Response**: 204 No Content

## Business Rules

**공통**

1. 네 API 모두 `@UseGuards(PassportJwtAuthGuard, RolesGuard)` + `@Roles('SUPER_ADMIN','ADMIN')`. 미인증 401, 권한 불일치 403 `{message: '접근 권한이 없습니다.'}`([roles.guard.ts:23](../../../../src/guards/roles/roles.guard.ts)).
2. 조회·수정·삭제 대상은 **항상 `is_delete = 0`** 인 행뿐이다. 삭제된 가맹점은 목록에 나오지 않고, 상세·수정·삭제로 접근하면 404 `{message: '가맹점을 찾을 수 없습니다.'}`.

**목록**

3. `search_type` 과 `search_keyword` 는 **둘 다 있을 때만** 검색이 걸린다. 한쪽만 오면 검색 없이 전체 목록으로 처리한다(400 이 아니다 — 관리자 화면에서 검색어만 지우는 동작이 흔하다).
4. 검색은 `LIKE %keyword%`. `ALL` 은 `store_name` · `business_number` · `owner_name` 세 컬럼의 **OR**.
5. 정렬은 `create_at DESC` 고정(최근 등록 우선).
6. 페이지네이션은 `Pagination` 클래스([pagination.ts:14](../../../../src/common/utils/pagination.ts))로 계산한다. **총 개수를 먼저 세고**(`countStore`) `Pagination` 이 산출한 `limit`/`offset` 으로 목록을 가져온다 — `Pagination` 생성자가 `total_count` 를 입력으로 받는 구조라 순서가 강제된다.

**수정**

7. `business_number` 는 변경할 수 없다. 잘못 등록했으면 삭제 후 재등록한다.
8. 수정은 전달된 5개 필드를 모두 덮어쓴다(부분 수정 아님). `address_detail` 미전달 시 `null` 로 덮어쓴다.

**삭제**

9. 삭제는 다음 세 가지를 한 번의 `update` 로 처리한다.
   - `is_delete = 1`
   - `business_number = 'DELETE_' + store_id` (39자) — `UK_Store_BusinessNumber` 를 비워 같은 번호의 재등록을 허용
   - `delete_backup = JSON.stringify(삭제 직전 스냅샷)` — 원본 `business_number` 포함
10. `store_name`·`owner_name`·`phone`·`address` 등 나머지 컬럼은 그대로 둔다. 마스킹 대상은 UK 가 걸린 `business_number` 뿐이다.
11. 삭제 시각은 별도 컬럼을 두지 않고 `update_at` 으로 갈음한다 — 삭제된 행은 규칙 2에 의해 이후 수정 경로로 들어올 수 없으므로 `update_at` 이 곧 삭제 시각이다.
12. **복구 API 는 이번 범위에 없다.** `delete_backup` 은 감사·이력 용도이며, 되살릴 일이 생기면 DB 에서 직접 처리한다.

## Notes

- **엔티티 확장** — `t_store` 에 `delete_backup`(mediumtext, nullable) 추가, `business_number` 길이 **20 → 45**(`DELETE_`(7) + `store_id`(32) = 39자 수용). 실제 DB 반영은 사용자 몫([CLAUDE.md](../../../../CLAUDE.md) 주의사항).
- **마스킹 값 충돌 없음** — 접미사가 PK 인 `store_id` 라 마스킹 값 자체가 유일하다. 같은 사업자번호를 여러 번 삭제해도 충돌하지 않는다.
- **sibling 계약 준수**([user.repository.ts:102](../../../../src/api/v1/user/repositories/user.repository.ts)) — 단건 조회 repository 는 `findOne({where, loadRelationIds: true})` 로 `entity | null` 을 반환하고 500 만 던진다. **404 판단은 service 몫**. 수정 repository 는 `update(where, entity)` 에 `new XEntity()` + 필드 할당을 넘긴다([user.repository.ts:159](../../../../src/api/v1/user/repositories/user.repository.ts)).
- **`Pagination` 첫 적용** — `src/common/utils/pagination.ts` · `src/common/dto/pagination.dto.ts` 는 존재하지만 사용처가 0건이었다(CLAUDE.md "Pagination: 적용 0건 — 미적용/규약"). 이번이 첫 적용이라 여기서 정한 형태(`{list, pagination}` 래핑, `StoreListDto extends PaginationDto`)가 이후 모든 목록 API 의 기준이 된다.
- **Query DTO 생성자 규약 신설** — 사용자 지적(2026-07-27)으로 "`@Query()` DTO 는 무인자 생성자에서 기본값을 대입한다"를 규약화했다. `PaginationDto` 에 생성자를 추가하고 CLAUDE.md Validation 절 + [docs/conventions.md](../../../../docs/conventions.md) 에 반영(초안 마커 부착, ship 에서 확정). 근거는 `ValidationPipe({transform: true})`([main.ts:180](../../../../src/main.ts))가 `plainToInstance` 로 무인자 생성자를 먼저 호출한 뒤 요청에 들어온 키만 덮어쓴다는 점. 기록: [.beaver/memory/dto.md](../../../memory/dto.md).
- **`@BeforeUpdate` 확인 필요** — `update_at` 자동 갱신은 `@BeforeUpdate` 훅에 의존한다([store.entity.ts:43](../../../../src/api/v1/store/entities/store.entity.ts)). 프로젝트가 이미 `updateUser`/`updateSessionRefresh` 를 같은 방식으로 쓰고 있어 동일 계약을 따르지만, repository mock 스펙으로는 검증되지 않는 지점이다. 규칙 11(삭제 시각 = `update_at`)이 여기 걸려 있으므로 `/beaver:test` 에서 실제 동작을 확인할 것.
- **등록 API 동시 점검** — 별도 revision 문서로 분리: `.beaver/output/revision/store/store-register-revision-260727-1.md`.
- **로드맵 대응** — 이 spec 은 [store-roadmap.md](../../roadmap/store-roadmap.md) 의 #2·#3·#4·#5 네 유닛을 한 사이클로 묶은 것이다.

## Proposals (Codebase-Based)

- [x] **삭제 설계를 `t_user` 탈퇴 선례에 맞춤** — `leave_backup`(mediumtext JSON) 과 같은 모양으로 `delete_backup` 을 둔다. 사용자 확정.
- [x] **`delete_at` 컬럼은 두지 않음** — `update_at` 이 삭제 시각 역할을 하므로 중복. 규칙 11.
- [x] **`store.util.ts` 신설** — 검색 WHERE 조립과 엔티티→응답 변환을 담는다. CLAUDE.md "service 내부 private 헬퍼 금지" 에 따라 순수 함수는 도메인 util 로 분리([user.util.ts](../../../../src/api/v1/user/user.util.ts) 와 동일한 named function export 형식).
- [ ] **§4.5 규약 문서 갱신** — `Pagination` 최초 적용이라 CLAUDE.md 의 "Pagination: 적용 0건 — 미적용/규약" 서술이 사실과 어긋나게 된다. plan 확정 후 별도 승인 절차로 처리.

## Decisions

- [x] **등록 API 처리** — 점검하고 고칠 부분이 있으면 고친다. → 별도 revision 문서. (사용자 답변 2026-07-27)
- [x] **soft delete 와 `UK_Store_BusinessNumber` 충돌** — `delete_backup` 컬럼 추가 + 삭제 시 `business_number` 를 `DELETE_xxx` 로 마스킹해 재사용 가능하게 한다. (사용자 답변 2026-07-27)
- [x] **사업자등록번호 수정 허용 여부** — 불가. 수정 DTO 에 넣지 않는다. (사용자 답변 2026-07-27)
- [x] **복구 API 포함 여부** — 넣지 않는다. (사용자 답변 2026-07-27)
- [x] **목록 검색조건** — `search_type`(전체/사업자명/사업자번호/대표자명) + `search_keyword` 2개. (사용자 답변 2026-07-27)
- [x] **삭제된 가맹점 조회** — 목록·상세 둘 다 노출하지 않는다. (사용자 답변 2026-07-27)
