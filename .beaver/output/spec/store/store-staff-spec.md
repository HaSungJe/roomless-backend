---
feature_goal: "가맹점 인력 지정 — 총괄매니저·매니저 계정 생성, 인력 목록, 인력 삭제, 비밀번호 변경"

domain: "store"

api_method: "POST / POST / GET / DELETE / PATCH"

api_path: "/api/v1/store/head-manager/register, /api/v1/store/manager/register, /api/v1/store/staff/list, /api/v1/store/staff/remove/:user_id, /api/v1/user/password"

affected_data:
  - "t_user (쓰기: 인력 계정 생성·삭제·비밀번호 변경 / 읽기: 인력 목록·중복확인)"
  - "t_user_setting (쓰기: 인력 계정 생성 시 동반 생성 — 없으면 로그인 불가)"
  - "t_auth (시드: HEAD_MANAGER 추가)"
  - "t_store (읽기: 배정 대상 가맹점 존재 확인)"
---

## Feature Description

가맹점에는 지금 **운영 주체가 없다.** `t_auth` 에 `MANAGER` 가 시드돼 있을 뿐 계정을 만드는 경로가 아예 없고([seeder.targets.ts:16](../../../../src/modules/seeder/seeder.targets.ts)), `t_user` 와 `t_store` 사이에 연결도 없다.

이 기능은 **ADMIN → 총괄매니저 → 매니저** 의 2단 위임 구조를 만든다. ADMIN 은 업체당 총괄매니저 1명까지만 책임지고, 그 아래 매니저 충원은 총괄매니저가 자기 업체 안에서 직접 한다. 인력 계정은 **항상 업체와 함께 태어나며**(`store_id` 는 생성 시 확정), 별도 배정 API 가 없다.

계정은 **임시 비밀번호로 발급**되고 로그인 응답이 변경 필요 여부를 알린다. 그래서 비밀번호 변경 API 가 이 사이클에 함께 들어간다 — 없으면 발급받은 계정을 쓸 수 없다.

## API Spec

### 1) 총괄매니저 계정 생성 (#8)

- **Method**: POST · **Path**: `/api/v1/store/head-manager/register` · **권한**: `SUPER_ADMIN`/`ADMIN`
- **Request** (`StoreHeadManagerRegisterDto`)

| 필드 | 필수 | 형식 |
|---|---|---|
| `store_id` | 필수 | 32자 hex |
| `login_id` | 필수 | 4~30자 영문/숫자/`_` |
| `name` | 필수 | 최대 50자 |
| `gender` | 필수 | `M`\|`F` |
| `birth` | 필수 | `YYYY-MM-DD` |
| `nickname` | 필수 | 최대 12자, 특수문자 불가 |

- **Response** (200, `StoreHeadManagerRegisterResultDto`) — `{user_id, login_id, temporary_password}`

> `temporary_password` 는 **이 응답에서만 평문으로 노출된다.** 저장은 bcrypt 해시뿐이라 이후 어떤 경로로도 다시 볼 수 없다.

### 2) 매니저 계정 생성 (#9)

- **Method**: POST · **Path**: `/api/v1/store/manager/register` · **권한**: `HEAD_MANAGER`
- **Request** (`StoreManagerRegisterDto`) — 위와 동일하되 **`store_id` 없음**(요청자의 `store_id` 를 자동 사용)
- **Response** (200, `StoreManagerRegisterResultDto`) — `{user_id, login_id, temporary_password}`

### 3) 업체 인력 목록 (#10)

- **Method**: GET · **Path**: `/api/v1/store/staff/list` · **권한**: `SUPER_ADMIN`/`ADMIN`/`HEAD_MANAGER`
- **Request** (query, `StoreStaffListDto extends PaginationDto`)

| 필드 | 필수 | 형식 | 설명 |
|---|---|---|---|
| `store_id` | 선택 | 32자 hex | ADMIN 만 유효. 총괄매니저는 무시되고 자기 업체로 고정 |
| `auth_id` | 선택 | `HEAD_MANAGER`\|`MANAGER` | 역할 필터 |
| `search_keyword` | 선택 | 최대 100자 | `login_id`·`name`·`nickname` 통합 LIKE |
| 페이지 필드 | 선택 | — | `PaginationDto` 상속 |

- **Response** (200, `StoreStaffListResultDto`) — `{list: [{user_id, login_id, name, nickname, auth_id, state_id, store_id, store_name, create_at}], pagination}`

### 4) 인력 계정 삭제 (#11)

- **Method**: DELETE · **Path**: `/api/v1/store/staff/remove/:user_id` · **권한**: `SUPER_ADMIN`/`ADMIN`/`HEAD_MANAGER`
- **Response**: 204

### 5) 비밀번호 변경 (신규 — user 도메인)

- **Method**: PATCH · **Path**: `/api/v1/user/password` · **권한**: 로그인 회원 전체
- **Request** (`UserPasswordDto`) — `{current_password, new_password}`
- **Response**: 204

## Business Rules

**공통**

1. 권한 세트는 `@UseGuards(PassportJwtAuthGuard, RolesGuard)` + `@Roles(...)` 한 세트. 5)는 `RolesGuard` 없이 인증만.
2. **`RolesGuard` 에는 역할 계층이 없다** — `auth_id` 문자열 정확 일치([roles.guard.ts:21](../../../../src/guards/roles/roles.guard.ts)). 총괄매니저와 ADMIN 이 함께 접근하는 #10·#11 은 세 역할을 모두 나열한다.
3. **"내 업체" 판정은 service 몫** — 가드는 역할까지만 본다. #9·#10·#11 의 service 가 `store_id` 대조를 직접 하고, 불일치 시 `ForbiddenException({message: '접근 권한이 없습니다.'})`.

**계정 생성 (#8·#9)**

4. **`t_user_setting` 을 반드시 함께 생성한다.** `getLoginUser` 가 `t_user_setting` 을 INNER JOIN 하므로([passport.jwt.auth.service.ts:35](../../../../src/guards/passport.jwt.auth/passport.jwt.auth.service.ts)), 이 행이 없으면 계정은 **영원히 로그인되지 않는다**(조용한 401). `generalSign` 과 동일한 순서로 만든다.
5. 임시 비밀번호는 서버가 생성하며 기존 비밀번호 정규식(`/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/`)을 만족해야 한다 — 발급 직후 그 값으로 로그인해야 하기 때문. `getBcrypt` 로 해싱해 저장한다.
6. 생성되는 계정은 `state_id='ACTIVE'`, `sns_id=null`, `phone=null`, `is_password_change_required=1`.
7. **#8** — `store_id` 의 가맹점이 존재하고 `is_delete=0` 이어야 한다(아니면 404). 그 업체에 이미 `HEAD_MANAGER`(`state_id != 'LEAVE'`)가 있으면 400 `{message: '이미 총괄매니저가 지정된 가맹점입니다.'}` — **업체당 총괄매니저 1명 고정**.
8. **#9** — 요청자의 `store_id` 를 사용한다. 총괄매니저인데 `store_id` 가 없으면(데이터 이상) 400 `{message: '소속된 가맹점이 없습니다.'}`. 매니저 수에는 상한을 두지 않는다.
9. `login_id` 중복은 `UK_User_LoginId` 분기로 400 (기존 repository 계약 그대로).

**목록 (#10)**

10. 스코프는 역할이 정한다 — ADMIN 은 전 업체(`store_id` 파라미터로 좁힐 수 있음), 총괄매니저는 **자기 업체로 강제 고정**(파라미터를 보내도 무시).
11. 대상은 `auth_id IN ('HEAD_MANAGER','MANAGER')` 이고 `state_id != 'LEAVE'` 인 계정. `USER`·`ADMIN` 은 인력이 아니므로 나오지 않는다.
12. 정렬은 `auth_id ASC, create_at DESC` — 총괄매니저가 위로 온다.
13. 페이지네이션은 store 목록과 동일 계약(`{list, pagination}`, count → `Pagination` → 목록).

**삭제 (#11)**

14. 삭제는 **`state_id`를 `LEAVE` 로 전이**하는 soft delete 다. `t_state` 의 `LEAVE` 는 `is_login_able=0` 이라([seeder.targets.ts:25](../../../../src/modules/seeder/seeder.targets.ts)) `getLoginUser` 의 `s.is_login_able = 1` 조건에서 걸러져 **즉시 로그인이 차단**된다.
15. **`store_id` 는 지우지 않는다** — "어느 업체 소속이었는지" 이력이 보존돼야 하고, `store_id` 를 null 로 되돌리는 순간 미배정 계정이 생겨 배정 API 가 되살아난다(불변식 위반).
16. 대상 판정 — ADMIN 은 `HEAD_MANAGER`/`MANAGER` 를, 총괄매니저는 **자기 업체의 `MANAGER` 만** 삭제할 수 있다. 총괄매니저가 자기 자신이나 다른 총괄매니저를 삭제하려 하면 403.
17. **총괄매니저를 삭제해도 소속 매니저는 그대로 둔다.** 총괄 자리만 비고, ADMIN 이 새 총괄매니저를 생성해 이어받는다. 그 사이 매니저들은 자기 업무를 계속한다.
18. 이미 `LEAVE` 인 계정은 404.

**비밀번호 변경 (#5)**

19. `current_password` 를 `matchBcrypt` 로 검증하고 불일치 시 400 `{message: '현재 비밀번호가 일치하지 않습니다.'}`.
20. `new_password` 가 현재와 같으면 400 `{message: '기존 비밀번호와 다른 비밀번호를 입력해주세요.'}`.
21. 변경 성공 시 `is_password_change_required=0` 으로 함께 내린다.
22. **세션은 무효화하지 않는다** — 이번 범위 밖. 별도 건으로 남긴다.

**전화번호 중복 허용 (동반 변경)**

25. `t_user` 의 `UK_User_Phone` 유니크 제약을 **제거한다.** 한 사람이 개인 이용자 계정과 인력 계정을 함께 가질 수 있어야 하고, 업체 대표번호를 여러 인력이 공유하는 것도 정상이기 때문이다.
26. **오늘 기준 동작 변화는 없다** — 현재 회원가입 두 경로(`sign`·`generalSign`)가 모두 `phone = null` 로만 저장하므로([user.service.ts:68](../../../../src/api/v1/user/user.service.ts) · [:145](../../../../src/api/v1/user/user.service.ts)) 이 제약이 실제로 걸린 적이 없다. 앞으로 전화번호를 받는 흐름이 생길 때를 위한 선제 정리다.
27. **죽은 코드를 함께 지운다** — `insertUser` 의 errno 1062 `UK_User_Phone` 분기([user.repository.ts:36](../../../../src/api/v1/user/repositories/user.repository.ts))는 제약이 사라지면 **도달 불가능**해진다. 남겨두면 존재하지 않는 제약을 참조하는 유령 분기가 된다.
28. **탈퇴 익명화의 `phone` 마스킹은 유지한다** — [user.leave-cleanup.service.ts:42](../../../../src/api/v1/user/user.leave-cleanup.service.ts) 의 마스킹 명분이 "UK 회피"로 적혀 있으나, 실제 목적은 **PII 익명화**다(UK 가 없는 `name`·`birth` 도 똑같이 마스킹한다). 동작은 그대로 두고 주석의 근거만 정정한다.

> **감수하는 것**: 이후 "전화번호로 계정 찾기" 같은 기능을 만들면 한 번호에 계정이 여럿일 수 있음을 전제해야 한다. 단일 계정을 가정한 설계는 불가능해진다.

**변경 강제 노출**

23. `POST /api/v1/user/general-login` 응답에 `is_password_change_required` 를 싣는다. **서버는 차단하지 않는다** — 클라이언트가 변경 화면으로 유도한다.
24. SNS 로그인(`/api/v1/user/login`) 응답에는 넣지 않는다 — SNS 계정은 비밀번호 자체가 없어 임시 발급 경로가 존재하지 않는다.

## Notes

- **스키마 확장** — `t_user.store_id`(nullable, FK `FK_User_Store` → `t_store`), `t_user.is_password_change_required`(tinyint NOT NULL default 0). 로컬은 `TYPEORM_SYNC=T` 로 자동 반영([.beaver/memory/db.md](../../../memory/db.md)).
- **`t_auth` 시드 추가** — `{auth_id: 'HEAD_MANAGER', auth_name: '총괄매니저', level: 102}`. `SeederService` 가 PK 기준 멱등 입력하므로 DB 수작업 불요. 기본 데이터는 [seeder.targets.ts](../../../../src/modules/seeder/seeder.targets.ts) 한 곳에만 정의한다.
- **인증 컨텍스트 확장** — `getLoginUser` 의 SELECT 에 `u.store_id` 를 추가하고 `PassportUserResultDto` 에 `store_id: string | null` 을 넣는다. 그러면 `@PassportUser('store_id')` 로 꺼낼 수 있다([decorator:7](../../../../src/guards/passport.jwt.auth/passport.jwt.auth.decorator.ts)).
- **JWT 스테일 문제는 존재하지 않는다** — 로드맵의 Open Decision "JWT 에 `store_id` 를 실을 것인가"는 **무의미**하다. `validate()` 가 토큰에서 `user_id` 만 꺼내 매 요청 `getLoginUser()` 로 DB 를 다시 읽으므로([strategy:31](../../../../src/guards/passport.jwt.auth/passport.jwt.auth.strategy.ts)), `req.user` 는 항상 최신이다. 배정이 바뀌든 계정이 정지되든 다음 요청에 즉시 반영된다.
- **sibling 계약**([user.service.ts:115](../../../../src/api/v1/user/user.service.ts) `generalSign`) — 계정 생성은 `v4().replace(/-/g,'')` 로 ID 생성 → `getBcrypt` 해싱 → `new UserEntity()`+할당 → `insertUser` → `insertUserSetting` 순서. 인력 계정은 **세션·토큰을 만들지 않는다**(생성자가 대신 로그인하는 게 아니므로).
- **도메인 경계 결정** — store repository 가 `t_user`/`t_user_setting` 을 직접 다룬다. `store.module` 의 `forFeature` 에 `UserEntity`·`UserSettingEntity` 를 추가한다. service→service 호출은 이 프로젝트에 선례가 없어 새 패턴이 되므로 피했다.
- **로드맵 대응** — [store-roadmap.md](../../roadmap/store-roadmap.md) 의 #8·#9·#10·#11 네 유닛 + 그에 필요한 비밀번호 변경 API. Phase 3(#6 운영상태·#7 위치정보)은 건너뛴다.

## Proposals (Codebase-Based)

- [x] **`t_user_setting` 동반 생성** — 코드 근거로 발견한 필수 제약(규칙 4). 빠뜨리면 계정이 조용히 로그인 불가가 된다.
- [x] **`getLoginUser` 에 `store_id` 추가** — 매 요청 DB 조회 구조를 그대로 활용. 별도 캐시·토큰 확장 불요.
- [x] **store repository 가 `t_user` 를 직접 처리** — 단방향 레이어 규약 유지.
- [ ] **§4.5 규약 문서 갱신** — 도메인 간 데이터 접근(한 도메인의 repository 가 다른 도메인 테이블을 다루는 형태)은 현재 docs 에 없는 규약 영역이다. plan 확정 후 별도 승인 절차로 처리.

## Decisions

- [x] **스코프** — #8~#11 네 유닛 + 비밀번호 변경 API 를 한 사이클로. (사용자 답변 2026-07-28)
- [x] **인력 계정 필수 정보** — 생성자가 `name`·`gender`·`birth`·`nickname` 을 전부 입력. `t_user` 스키마는 건드리지 않는다. (동일)
- [x] **자격증명 전달** — 임시 비밀번호 자동 발급, 생성 응답에 1회 평문 노출. (동일)
- [x] **변경 강제 수위** — 로그인 응답에 플래그만 노출, 서버 차단 없음. (동일)
- [x] **비밀번호 변경 API 범위** — user 도메인에 두고 전체 회원 공용. (동일)
- [x] **도메인 경계** — store repository 가 `t_user` 를 직접 처리. (동일)
- [x] **인력 삭제의 의미** — `state_id` 를 `LEAVE` 로 전이하는 soft delete, `store_id` 는 보존. (동일)
- [x] **총괄매니저 삭제 시 매니저 처리** — 매니저는 그대로 둔다. (동일)
- [x] **`HEAD_MANAGER` 권한값** — `auth_id='HEAD_MANAGER'`, `auth_name='총괄매니저'`, `level=102`(기존 `MANAGER`=101 바로 위). 로드맵 제안값 그대로 채택.
- [x] **전화번호 중복 허용** — `UK_User_Phone` 제거. 같은 사이클에 `t_user` 를 이미 건드리므로 마이그레이션을 한 번에 처리한다. 죽은 코드(1062 분기) 삭제 포함. (사용자 요청 2026-07-28)
