# Report — store-staff

## Feature Summary
- **Feature**: 가맹점 인력 지정 — 총괄매니저·매니저 계정 생성, 인력 목록, 인력 삭제 + 비밀번호 변경(user 도메인). 전화번호 중복 허용 동반 정리
- **Entry point**: `POST /api/v1/store/head-manager/register` · `POST /api/v1/store/manager/register` · `GET /api/v1/store/staff/list` · `DELETE /api/v1/store/staff/remove/:user_id` · `PATCH /api/v1/user/password`
- **Domain**: store (+ user)

## Created/Modified/Deleted Files

| File | Change Type | Description |
|------|-----------|------|
| `src/modules/seeder/seeder.targets.ts` | modified | `AUTH_SEED_DATA` 에 `HEAD_MANAGER`(총괄매니저, level 102) 추가 — 권한 5종 |
| `src/api/v1/user/entities/user.entity.ts` | modified | `store_id` FK(`FK_User_Store`, nullable) + `is_password_change_required` 추가, **`@Unique('UK_User_Phone')` 제거** |
| `src/api/v1/user/repositories/user.repository.ts` | modified | **`UK_User_Phone` 1062 분기 삭제** — 제약 제거로 도달 불가능해진 죽은 코드 |
| `src/api/v1/user/user.leave-cleanup.service.ts` | modified | 주석만 — `phone` 마스킹 근거를 "UK 회피" → "PII 익명화"(동작 무변경) |
| `src/guards/passport.jwt.auth/passport.jwt.auth.dto.ts` | modified | `PassportUserResultDto.store_id` 추가 |
| `src/guards/passport.jwt.auth/passport.jwt.auth.service.ts` | modified | `getLoginUser` SELECT 에 `u.store_id` 1줄 |
| `src/api/v1/store/dto/store-head-manager-register.dto.ts` | created | 입력 6필드 + 응답(`user_id`/`login_id`/`temporary_password`) |
| `src/api/v1/store/dto/store-manager-register.dto.ts` | created | `store_id` 없는 입력 5필드 + 동일 형태 응답 |
| `src/api/v1/store/dto/store-staff-list.dto.ts` | created | `extends PaginationDto` + 생성자, 항목·응답 DTO |
| `src/api/v1/store/dto/store-staff-remove.dto.ts` | created | path param DTO |
| `src/api/v1/store/store.util.ts` | modified | `generateTemporaryPassword`(12자, `randomInt`) + `buildStaffSearchWhere` 추가 |
| `src/api/v1/store/interfaces/store.repository.interface.ts` | modified | `findStores` + 인력 6메서드 시그니처 |
| `src/api/v1/store/repositories/store.repository.ts` | modified | 생성자에 `UserEntity`·`UserSettingEntity` 주입, 메서드 7개 구현 |
| `src/api/v1/store/store.service.ts` | modified | public 4개 추가(총 9개) |
| `src/api/v1/store/store.controller.ts` | modified | 핸들러 4개 추가(총 9개) |
| `src/api/v1/store/store.module.ts` | modified | `forFeature([StoreEntity, UserEntity, UserSettingEntity])` |
| `src/api/v1/user/dto/user-password.dto.ts` | created | `current_password` / `new_password` |
| `src/api/v1/user/dto/user-general-login.dto.ts` | modified | 응답에 `is_password_change_required` |
| `src/api/v1/user/user.service.ts` | modified | `changePassword` 추가 + `generalLogin` 응답 확장 |
| `src/api/v1/user/user.controller.ts` | modified | `PATCH /api/v1/user/password` |
| `src/api/v1/store/test/store-head-manager-register.spec.ts` | created | 16 케이스 |
| `src/api/v1/store/test/store-manager-register.spec.ts` | created | 12 케이스 |
| `src/api/v1/store/test/store-staff-list.spec.ts` | created | 15 케이스 + DTO 생성자 2 + `[SMOKE:data-access]` 6 |
| `src/api/v1/store/test/store-staff-remove.spec.ts` | created | 11 케이스 |
| `src/api/v1/user/test/user-password.spec.ts` | created | 11 케이스 |
| `src/api/v1/user/test/user-general-login.spec.ts` | modified | 플래그 0/1 두 케이스 |
| `src/modules/seeder/test/seeder.spec.ts` | modified | `HEAD_MANAGER` 시드 + 권한 5종 순서 단언 |

## Tests Written

지배적 스타일 ① — 실제 controller+service+`ValidationPipe`(main.ts exceptionFactory 재현)+`CustomErrorFilter` 부팅, repository 만 Symbol 토큰 mock, `PassportJwtAuthGuard` 만 override 하고 **`RolesGuard` 는 실제 구현을 태움**. `getBcrypt`/`matchBcrypt` 는 `jest.spyOn`+`mockRestore`(기존 user spec 과 동일 형식).

강도 있게 잡은 지점:
- **권한 우회 방지가 핵심** — 매니저 생성 시 body 에 `store_id` 를 끼워보내도 요청자 것이 쓰이는지, 목록에서 총괄매니저가 남의 `store_id` 를 파라미터로 보내도 자기 업체로 고정되는지를 각각 단언.
- **총괄매니저 삭제 경계** — 다른 업체 매니저 403, 총괄매니저(자신 포함) 403, 각각 `updateStaff` 미호출까지.
- **`t_user_setting` 동반 생성** — `insertStaffSetting` 호출 횟수와 `user_id` 일치를 단언. 빠지면 계정이 조용히 로그인 불가가 되는 지점이라 전용 케이스로 고정.
- **임시 비밀번호** — 정규식(`/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/`) 만족 + 저장값이 해시이고 평문과 다름 + `getBcrypt` 인자가 응답의 평문과 동일함까지.
- **삭제는 `state_id` 만 건드림** — `entity.store_id`/`auth_id`/`login_id` 가 `undefined` 임을 단언해 "소속 이력 보존" 규칙을 고정.

**`[SMOKE:data-access]`** — `buildStaffSearchWhere` 가 `auth_id`·`state_id`·`store_id`(전부 `@ManyToOne` 관계 필드)에 `In`/`Not`/스칼라를 섞고 where 배열 OR 까지 쓰는 매핑 민감 구성이라 필수. 무연결 `DataSource` 로 4가지 분기 + 관계 필드 정렬(`auth_id ASC`) + 위험 매핑 스냅샷(`[]`)을 검증.

전화번호 중복 허용은 **신규 단언을 만들지 않았다** — 근거를 plan 에 남겼다: `UK_User_Phone` 분기를 단언하는 기존 spec 이 0건이고(grep 확인), 전화번호를 저장하는 흐름이 아직 없어 "중복 저장이 성공한다"를 실행할 진입점이 없다.

## Verification

- build 규약대로 **테스트는 실행하지 않음**(worktree 에 의존성 없음). 실행은 ship 후 `/beaver:test`.
- plan Design 코드와 구현 파일 1:1 대조 완료.
- **1:1 대응 확인** — store service public 9개 = controller 핸들러 9개, user service public 8개 = 핸들러 8개.
- **구현 중 발견해 고친 결함 1건** — smoke 스펙의 `DataSource` 에 `[UserEntity, StoreEntity]` 만 넣었는데, `UserEntity` 는 `auth_id`·`state_id`·`sns_id`·`store_id` **4개 FK** 를 갖고 있어 관계 대상 엔티티가 빠지면 메타데이터 빌드가 실패한다. `AuthEntity`·`StateEntity`·`SnsEntity` 를 추가했다(지난 사이클의 `database` 옵션 누락과 같은 계열의 하니스 함정).
- **순환 import 없음 확인** — `user.entity.ts` → `store.entity.ts` 단방향이고 `store.entity.ts` 는 user 를 import 하지 않는다(grep 확인).
- **기존 spec 영향 없음** — `StoreService`/`UserService` 생성자는 변경되지 않았고(`StoreRepository` 생성자만 변경), 기존 spec 은 repository 를 `useValue` mock 으로 주입하므로 `StoreRepository` 를 인스턴스화하지 않는다.
- 규약 대조: 명명·snake_case·라우트 앞 `/`·DTO 데코레이터 순서·허용 데코레이터 집합·repository 통일 500·`FindOptionsWhere`·`loadRelationIds`·service public=API 1:1·private 헬퍼 0·쓰기 `@Transactional()`·엔티티 `new`+할당·Swagger `type` 만·`@HttpCode` 명시 — 전부 준수.

## Remaining Issues

- **§4.5 규약 문서 미승인** — 한 도메인의 repository 가 다른 도메인 테이블을 다루는 형태(`StoreRepository` 가 `t_user`/`t_user_setting` 처리)가 이번이 첫 사례인데, `docs/architecture.md` 는 도메인별 단일 repository 전제로 서술돼 있다. 사용자 승인 대기 중이라 문서를 쓰지 않았다. ship 전에 결정 필요.
- **`is_password_change_required` 는 서버가 강제하지 않는다** — 결정대로 로그인 응답에 플래그만 싣는다. 클라이언트가 무시하면 임시 비밀번호로 계속 사용할 수 있다. 강제가 필요해지면 가드 레벨 차단을 별도 건으로 다룬다.
- **비밀번호 변경 시 기존 세션을 무효화하지 않는다** — spec 규칙 22 대로 범위 밖. 탈취된 세션이 비밀번호 변경 후에도 살아있다.
- **`temporary_password` 가 API 로그에 남을 수 있다** — 전역 `ApiLogInterceptor` 가 응답을 `t_api_log` 에 적재한다. 임시 비밀번호가 평문으로 로그 테이블에 저장될 가능성이 있으므로, 민감 필드 마스킹이 필요한지 확인이 필요하다(이번 범위 밖, ship 리뷰에서 판단 권장).
- **인력 계정에 `isAdult` 검사를 적용하지 않았다** — 회원가입과 달리 관리자가 만드는 계정이라 연령 제한 대상이 아니라고 판단했다. spec 에 명시적 규칙은 없다.
