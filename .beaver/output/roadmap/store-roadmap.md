# Roadmap — store (관리자가 가맹점을 등록부터 폐점까지 관리한다)

## Direction

관리자(`SUPER_ADMIN`/`ADMIN`)가 가맹점을 **등록 → 확인 → 유지 → 운영주체 지정**까지 끌고 가는 관리 콘솔 쪽 트랙.
가맹점이 "예약 가능한 대상"이 되기 위한 **관리자 측 준비**(사업자 정보·운영상태·위치·담당 인력)까지가 이 트랙의 몫이다.
인력 관리의 마지막 한 칸은 **총괄매니저에게 위임**한다 — ADMIN 은 업체당 총괄매니저 1명까지만 책임지고,
그 아래 매니저 충원은 총괄매니저가 자기 업체 안에서 직접 한다.
매니저가 업체를 **운영**하는 동선(영업시간·브레이크타임·객실·사물)은 별도 트랙으로 뺀다.

> 방향은 느슨하게 잡는다. 아래 유닛은 전부 "있으면 좋겠다"는 **추천**이지 약속이 아니다 — 순서 변경·드롭은 언제든 정상이다.

## Scope & Actors

| 행위자 (`t_auth`) | 이 트랙에서 하는 일 |
|---|---|
| `SUPER_ADMIN` / `ADMIN` | 가맹점 등록·목록·상세·수정·삭제, 운영상태 전이, 위치정보 관리, **총괄매니저** 계정 생성·삭제 |
| `HEAD_MANAGER` (총괄매니저, 신규) | **제한 행위자** — 자기 업체 안에서 `MANAGER` 계정 생성·삭제, 자기 업체 인력 목록 조회. 그 외에는 관리 대상 |
| `MANAGER` (매니저) | **행위자 아님 — 관리 대상**. 매니저 자신의 운영 API 는 매니저 트랙 |
| `USER` | 이 트랙에 등장하지 않음 |

**역할 분리** — 기존 `MANAGER` 한 줄을 둘로 쪼갠다. `t_auth` 시드에 `HEAD_MANAGER`(총괄매니저) 를 추가하고
기존 `MANAGER`(매니저, level 101) 는 그대로 둔다. 아직 `MANAGER` 계정을 만드는 경로 자체가 없어 마이그레이션 대상 데이터는 없다.

**가맹점별 가변 축** (유닛마다 반복되고 데이터 모델을 결정하는 것들)

- 사업자 정보(상호명·사업자등록번호·대표자·연락처·주소) — 이미 `t_store` 보유
- 운영상태(영업중 / 일시중지) — #6 에서 추가
- 위치(위도·경도) — #7 에서 추가
- **인력 — 총괄매니저 1명 + 매니저 N명**. 둘 다 `t_user.store_id` 로 업체 1곳에 묶인다
  ([docs/roadmap.md:45](../../../docs/roadmap.md) "매니저 1명 = 업체 1곳" 을 "인력 1명 = 업체 1곳" 으로 확장) — #8·#9 에서 추가

## Non-Goals / External Boundaries

- **영업시간·브레이크타임 설정** — 매니저 전용으로 확정, 이 트랙 제외 (`t_store_hour`·`t_store_break` 포함). 매니저 트랙 소관
- **매니저·총괄매니저의 "내 업체" 운영 API** (내 업체 상세 조회, 객실 관리 등) — 매니저 트랙.
  총괄매니저 API 중 **인력 관리(#9·#10·#11)만** 이 트랙에 남는다 — 가맹점에 누가 붙어 있는지는 가맹점 관리의 일부이기 때문
- **총괄매니저와 매니저의 운영 권한 차등** (누가 객실을 지울 수 있는가 등) — 매니저 트랙에서 각 API 별로 정한다
- **인력의 업체 이동** — 별도 배정 API 를 두지 않는다 (아래 Cross-Cutting Rules 의 `store_id` 불변식). 이동은 삭제 후 재생성
- **객실(room)·사물(device)** — [docs/roadmap.md](../../../docs/roadmap.md) 2·3단계
- **주변 업체 검색 / 이용자용 업체 상세** — 5단계 discovery. 단 좌표 컬럼(#7)은 그 선행조건이라 여기서 준비한다
- **정산·수수료·리뷰** — 후순위
- **실제 DB 스키마 반영**(컬럼 추가·FK 생성)은 사용자 몫 ([CLAUDE.md](../../../CLAUDE.md) 주의사항). 이 트랙은 엔티티 코드까지만 책임진다

## Phases & Units

### Phase 1 — 가맹점 조회 동선 (등록한 가맹점을 관리자가 볼 수 있게)

| # | Unit | Goal | Key decision | Depends | Status |
|---|------|------|--------------|---------|--------|
| 1 | 가맹점 등록 | `t_store` 신설 + ADMIN 전용 등록 API. `RolesGuard` 첫 실적용 | — | — | done |
| 2 | 가맹점 목록 조회 | 등록된 가맹점을 검색·페이지네이션으로 훑는다. `PaginationDto` **최초 실적용** — 이후 모든 목록 API 의 형태가 여기서 굳는다 | ~~검색조건 집합과 페이지네이션 응답 래핑 구조~~ → `search_type`(ALL/STORE_NAME/BUSINESS_NUMBER/OWNER_NAME) + `search_keyword`, 응답은 `{list, pagination}` | 1 | in-progress |
| 3 | 가맹점 상세 조회 | 단건 상세. 수정·삭제·인력 관리의 공통 진입점 | ~~삭제된 가맹점의 상세 조회 허용 여부~~ → 불허(404) | 1 | in-progress |

**Expected APIs** (이름은 잠정 — 각 유닛 spec 에서 확정되면 이 표를 갱신한다)

| Unit | Method | Path | Purpose |
|------|--------|------|---------|
| #1 | POST | `/api/v1/store/register` | 가맹점 등록 (구현됨 — [store.controller.ts:29](../../../src/api/v1/store/store.controller.ts)) |
| #2 | GET | `/api/v1/store/list` | 가맹점 목록 (검색 + 페이지네이션) |
| #3 | GET | `/api/v1/store/detail/:store_id` | 가맹점 상세 |

### Phase 2 — 가맹점 정보 유지 (등록 이후의 생애주기)

| # | Unit | Goal | Key decision | Depends | Status |
|---|------|------|--------------|---------|--------|
| 4 | 가맹점 수정 | 상호명·대표자·연락처·주소 갱신 | ~~사업자등록번호 수정 허용 여부~~ → 불가(DTO 에 필드 없음) | 3 | in-progress |
| 5 | 가맹점 삭제 | `is_delete` soft delete + `business_number` 를 `DELETE_<store_id>` 로 마스킹해 UK 를 비우고, 삭제 직전 스냅샷을 `delete_backup` 에 남긴다 | ~~사업자번호 점유 문제~~ → 마스킹+백업으로 해소. **복구 API 는 범위에서 제외** | 3 | in-progress |

**Expected APIs**

| Unit | Method | Path | Purpose |
|------|--------|------|---------|
| #4 | PATCH | `/api/v1/store/modify/:store_id` | 가맹점 정보 수정 |
| #5 | DELETE | `/api/v1/store/remove/:store_id` | 가맹점 삭제 (soft + 사업자번호 마스킹) |

### Phase 3 — 가맹점 속성 확장 (예약 가능 대상이 되기 위한 필드)

| # | Unit | Goal | Key decision | Depends | Status |
|---|------|------|--------------|---------|--------|
| 6 | 가맹점 운영상태 관리 | `t_store_state` 룩업 + 시드, `t_store.store_state_id` FK, 상태 전이 API. **일시 영업중지를 삭제와 분리** | 상태값 집합(OPEN/SUSPENDED/…)과 예약 재고 판정에 끼어드는 지점 | 4 | todo |
| 7 | 가맹점 위치정보 | `latitude`·`longitude` 컬럼 + 등록·수정 반영. 5단계 주변검색(`haversineKm`)의 **선행조건** | 좌표 필수 여부 / 주소→좌표 변환 주체 (클라이언트 vs 서버 지오코딩) | 4 | todo |

**Expected APIs**

| Unit | Method | Path | Purpose |
|------|--------|------|---------|
| #6 | PATCH | `/api/v1/store/state/:store_id` | 운영상태 전이 |
| #7 | — | (#1·#4 의 DTO·응답에 좌표 필드 추가) | 신규 엔드포인트 없음 |

### Phase 4 — 인력 지정 (운영 주체 확정, ADMIN → 총괄매니저 위임)

인력 계정은 **항상 업체와 함께 태어난다** — 생성 API 가 곧 배정이라 별도 배정 API 가 없다.

| # | Unit | Goal | Key decision | Depends | Status |
|---|------|------|--------------|---------|--------|
| 8 | 총괄매니저 계정 생성 | ADMIN 이 업체를 지정해 `HEAD_MANAGER` 계정을 만든다 — `store_id` 는 생성 시 확정. `t_auth` 에 `HEAD_MANAGER` 시드 추가 + `t_user.store_id` nullable FK 추가를 함께 가져간다. **업체당 총괄매니저 1명 고정** — 이미 있으면 400 | 초기 비밀번호 전달 방식(관리자 지정 vs 임시발급) — #9 가 그대로 따라감 | 1 | todo |
| 9 | 매니저 계정 생성 (총괄매니저) | 총괄매니저가 자기 업체에 `MANAGER` 계정을 만든다 — `store_id` 는 자기 것으로 자동 확정. **위임의 핵심 유닛** | "내 업체" 판정을 JWT `store_id` 로 할지 매 요청 DB 조회로 할지 (아래 Open Decisions) | 8 | todo |
| 10 | 업체 인력 목록 조회 | 업체별 총괄매니저·매니저 목록. ADMIN 은 전 업체, 총괄매니저는 자기 업체만 | 하나의 API 를 역할별로 스코프 분기할지, 엔드포인트를 나눌지 | 9 | todo |
| 11 | 인력 계정 삭제 | ADMIN 은 총괄매니저를, 총괄매니저는 자기 업체 매니저를 삭제한다. 충원만 있고 삭제가 없으면 인력이 쌓이기만 한다 | soft(`state_id` → `LEAVE`) vs hard delete, 그리고 **총괄매니저 삭제 시 그 업체 매니저들의 처리** (권장: soft — `t_user` 의 기존 탈퇴 기계장치 재사용) | 9 | todo |

**Expected APIs**

| Unit | Method | Path | Purpose |
|------|--------|------|---------|
| #8 | POST | `/api/v1/store/head-manager/register` | 총괄매니저 계정 생성 (ADMIN, 업체 지정) |
| #9 | POST | `/api/v1/store/manager/register` | 매니저 계정 생성 (총괄매니저, 자기 업체 자동) |
| #10 | GET | `/api/v1/store/staff/list` | 업체 인력 목록 (ADMIN 전체 / 총괄매니저 자기 업체) |
| #11 | DELETE | `/api/v1/store/staff/remove/:user_id` | 인력 계정 삭제 (ADMIN→총괄매니저, 총괄매니저→매니저) |

**Progress**: 1/11 done · **진행 중**: #2·#3·#4·#5 (한 사이클로 묶어 기획 완료 — [store-crud-spec.md](../spec/store/store-crud-spec.md) · [store-crud-plan.md](../plan/store/store-crud-plan.md), 등록 점검은 [store-register-revision-260727-1.md](../revision/store/store-register-revision-260727-1.md))
**Next up**: #6 가맹점 운영상태 관리 — #2~#5 가 ship 되면 의존(#4)이 풀린다. #7(위치정보)과 같은 Phase 지만 #6 을 먼저 두는 이유는 `t_store_state` 룩업이 예약 재고 판정에 걸려 4단계 reservation 까지 영향이 번지기 때문

## Cross-Cutting Rules

- **인력 계정은 업체에 귀속된다 — `store_id` 는 생성 시 확정되고 계정이 사라질 때까지 유지된다** — 총괄매니저·매니저는 업체 없이 존재할 수 없다. 따라서 이 트랙에 **배정·배정해제·소속해제 API 가 전부 없다**. 떼어내는 동작은 계정 삭제(#11)뿐이고, 업체 이동은 삭제 후 재생성이다. `t_user.store_id` 가 nullable 인 것은 `ADMIN`·`USER` 계정이 업체를 갖지 않기 때문이지, 인력 계정이 업체를 잃을 수 있다는 뜻이 아니다 — **인력 계정의 `store_id` 를 null 로 되돌리는 코드는 이 불변식 위반**
- **권한 세트 고정** — 모든 API 는 `@UseGuards(PassportJwtAuthGuard, RolesGuard)` + `@Roles(...)` 를 한 세트로 부착 ([store.controller.ts:19](../../../src/api/v1/store/store.controller.ts)). #1~#8 은 `@Roles('SUPER_ADMIN','ADMIN')`, #9 는 `@Roles('HEAD_MANAGER')`, #10·#11 은 `@Roles('SUPER_ADMIN','ADMIN','HEAD_MANAGER')`
- **`RolesGuard` 에는 역할 계층이 없다** — `auth_id` **문자열 정확 일치**로만 판정하고 `level` 은 인가에 쓰이지 않는다 ([roles.guard.ts:21](../../../src/guards/roles/roles.guard.ts)). 상위 역할이 하위 역할 API 를 자동 통과하지 않으므로, 총괄매니저와 매니저가 함께 접근하는 API 는 `@Roles('HEAD_MANAGER','MANAGER')` 로 **매번 둘 다 나열**한다
- **역할만으로는 부족하다 — "내 업체" 판정은 service 몫** — `RolesGuard` 는 "총괄매니저인가"까지만 본다. "그 업체가 **내** 업체인가"는 #9·#10·#11 의 service 가 `store_id` 대조로 직접 검증하고, 불일치 시 `ForbiddenException({message: '접근 권한이 없습니다.'})` 로 통일한다
- **목록은 전부 페이지네이션** — `PaginationDto`/`PaginationResultDto` 적용. #2 에서 정한 응답 형태를 #10 이 그대로 재사용한다
- **기본 조회는 `is_delete=0` 필터** — 삭제 포함 조회가 필요하면 명시적 파라미터로만
- **응답 필드 생략 금지** — 값이 없으면 `null` 로 포함 (`x: T | null`)
- **룩업 기본 데이터는 seeder 한 곳** — #6 의 `t_store_state`, #8 의 `HEAD_MANAGER` 권한 행 모두 [seeder.targets.ts](../../../src/modules/seeder/seeder.targets.ts) 에만 정의, 엔티티는 구조 컬럼만
- **Data-Access Smoke** — 관계 필드 where·QueryBuilder 를 쓰는 repository 메서드(#2 검색, #8~#11 의 `store_id`·`auth_id` 조인)는 repository-mock spec 만으로 덮지 말고 무연결 쿼리 빌드 smoke 케이스를 붙인다
- **스키마 변경은 코드까지** — 컬럼 추가·FK 생성의 실제 DB 반영은 사용자 몫

## Open Decisions (roadmap-level)

- [x] **soft delete 와 `UK_Store_BusinessNumber` 충돌** (#4, #5) — **해결(2026-07-27)**: `delete_backup`(mediumtext) 컬럼을 추가하고, 삭제 시 삭제 직전 스냅샷을 거기에 남긴 뒤 `business_number` 를 `DELETE_<store_id>` 로 마스킹해 UK 를 비운다. `business_number` 길이를 20 → 45 로 확장한다. `t_user.leave_backup` 선례와 같은 모양
- [x] **목록 응답 래핑 구조** (#2, #10) — **해결(2026-07-27)**: `{list, pagination}`. `StoreListDto extends PaginationDto`, 응답 `pagination` 은 `Pagination.getPagination()` 결과(`PaginationResultDto`). 이후 전 목록 API 가 이 형태를 따른다
- [ ] **JWT 에 `store_id` 를 실을 것인가** (#9, #10, #11 + 매니저 트랙 전체) — 매 요청 DB 조회를 피하려면 토큰에 담는 게 편하지만, 계정이 정지되거나 업체가 삭제돼도 기존 토큰이 옛 `store_id` 를 들고 다니는 스테일 문제가 생긴다. 토큰에 담고 변경 시 세션 무효화 / 매 요청 조회 둘 중 하나를 Phase 4 착수 전에 정해야 한다. 이 트랙에서 처음 정하지만 매니저 트랙의 모든 API 가 이 결정을 상속한다
- [ ] **인력 자격증명 전달 방식** (#8, #9) — 비밀번호를 생성자가 직접 지정할지, 임시 비밀번호를 발급하고 최초 로그인 시 변경을 강제할지. #8(ADMIN→총괄) 에서 정한 방식을 #9(총괄→매니저) 가 그대로 따른다
- [ ] **`HEAD_MANAGER` 권한 문자열과 level 값** (#8 이후 전 유닛) — 제안: `auth_id='HEAD_MANAGER'` / `auth_name='총괄매니저'` / `level=102` (기존 `MANAGER`=101 바로 위). `level` 은 현재 인가에 쓰이지 않으므로 순서 표기 용도
- [ ] **가맹점 삭제(#5)와 소속 인력의 관계** (#5, #11) — 업체를 soft delete 하면 귀속된 총괄매니저·매니저도 함께 삭제할지, 업체만 지우고 계정은 남길지. 귀속이 필수라는 전제상 "업체는 없는데 계정은 살아있는" 상태를 허용할지가 쟁점이다

## Notes / Risks

- **NOT NULL 컬럼 추가 불가** — `t_store` 에 실데이터가 있으면 #6 `store_state_id`·#7 좌표는 nullable 로 추가하거나 기본값 백필 전략이 필요하다
- **#7 이 밀리면 discovery 도 밀린다** — 좌표 없이는 5단계 주변 업체 검색이 착수 불가
- **이 트랙만으로는 가맹점이 예약 가능 상태에 도달하지 못한다** — 영업시간·브레이크타임을 매니저 트랙으로 뺀 결정의 대가. [docs/roadmap.md](../../../docs/roadmap.md) 1단계 완료 판정은 매니저 트랙까지 끝나야 성립한다
- **인력 유닛(#8·#9·#11)은 user 도메인을 건드린다** — `t_user` 에 쓰는 API 인데 위치는 store 도메인. 도메인 경계를 #8 spec 에서 한 번 정리하면 #9·#11 이 그대로 따라간다 (store 하위 경로 vs user 도메인의 권한 제한 API)
- **`t_auth` 시드 추가는 DB 수작업이 필요 없다** — `SeederService` 가 부팅 시 PK 기준 멱등 입력하므로 `HEAD_MANAGER` 행은 자동 반영된다. 반면 `t_user.store_id` 컬럼 추가(#8)와 `t_store` 컬럼 추가(#6·#7)는 실제 스키마 반영이 사용자 몫
- **역할을 쪼갠 비용은 매니저 트랙에서 청구된다** — 계층 상속이 없으므로 앞으로 만들 매니저용 API 마다 "총괄만인가, 둘 다인가"를 매번 판단해 `@Roles` 에 나열해야 한다. 판단 기준을 매니저 트랙 시작 시 한 번 정해두는 편이 낫다
- **[docs/roadmap.md:33](../../../docs/roadmap.md) 과 어긋난다** — 그 문서는 "매니저 계정의 업체 배정"을 ADMIN 의 일로 적어뒀는데, 이 트랙은 배정 개념 자체를 없앴다. docs/roadmap.md 1단계를 갱신할 때 함께 고쳐야 한다
