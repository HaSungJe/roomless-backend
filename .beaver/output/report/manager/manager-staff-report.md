# Report — manager-staff

## Feature Summary
- **Feature**: 업체 인력(Phase 10 #42 — #43 dropped)
  - A. 업체코드 `t_store.store_code`(PK 와 별개 UUID 32자) + 매니저 계정 유일성을 업체 단위로(부분 유니크 인덱스 4개) + 매니저 로그인 · 아이디 찾기 · 비밀번호 초기화에 업체코드
  - B. 입점 신청에 업체 총관리자 아이디 · 비밀번호(해시), 승인은 그 자격증명으로 계정 + 승인 알림 SMS, 내 신청에 승인 신청 · `store_code`
  - C. 업체 총관리자의 업체 관리자 계정 등록 · 목록 · 상세 · 수정 · 비밀번호 초기화 · 정지 · 해제 · 삭제(RolesGuard 첫 사용)
- **Entry point**: 게이트웨이 `/api/v1/admin-service/manager/staff`(동기 2 · 큐 5) → admin-service 매니저 도메인(`/internal/v1/admin-service/manager/staff` · `admin.manager.staff*`), 매니저 `login` · `find-login-id` · `password-reset` 입력에 `store_code`, 업체 `/api/v1/admin-service/store/…` 입력 · 응답
- **Domain**: manager (+ store 보정)
- **Plan**: [manager-staff-plan.md](../../plan/manager/manager-staff-plan.md) · **Spec**: [manager-staff-spec.md](../../spec/manager/manager-staff-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/database/src/entities/store/store.entity.ts` | modified | `store_code` + `UK_Store_StoreCode` |
| `libs/database/src/entities/store/store-application.entity.ts` | modified | `head_manager_login_id` · `head_manager_login_pw` |
| `libs/database/src/entities/user/user.entity.ts` | modified | 그룹 UK 2개 → 업체 유무로 나눈 부분 유니크 인덱스 4개 |
| `libs/database/src/migrations/1793027933626-StoreCodeManagerScope.ts` · `migrations.ts` | created · modified | 생성 + 손 보정(UK 이름 · 기존 행 채움 · 기본값 제거 · down) |
| `libs/common/src/utils/search.ts` | created | `toContainsPattern`(store.util.ts 에서 옮김) |
| `libs/contracts/src/manager/manager.commands.ts` | modified | `STAFF*` 명령 5 · `STAFF_LIST` · `staff(user_id)` |
| `libs/contracts/src/manager/dto/manager-{login,find-login-id,password-reset}.dto.ts` | modified | `store_code` |
| `libs/contracts/src/manager/dto/manager-staff{,-list,-detail,-update,-password-reset,-state,-delete}.dto.ts` (7) | created | 업체 관리자 DTO |
| `libs/contracts/src/store/dto/*` (7) | modified | 신청 자격증명 · `store_code` · 승인 결과 `{store_id, store_code}` |
| `apps/admin-service/src/manager/manager.constants.ts` | created | 인력 상태 · 메시지 |
| `apps/admin-service/src/manager/{manager.util,manager.service,manager.module}.ts` · `interfaces/` · `repositories/` · `controllers/` | modified | 업체코드 인증, 인력 7 메서드 · 동기 2 · 큐 5, repository 5 메서드(+ 빌더) |
| `apps/admin-service/src/store/{store.constants,store.util,store.service}.ts` · `interfaces/` · `repositories/` | modified | 무작위 아이디 · 보이는 상태 · `countManagers` · `insertHeadManager` UK 분기 제거, 자격증명 · 업체코드 · `findStores` |
| `apps/gateway/src/api/v1/admin-service/manager/{controllers/*,manager.module.ts}` | modified | 인력 라우트(매니저 가드 + RolesGuard · `@Roles(HEAD_MANAGER)`) |
| `apps/admin-service/src/manager/test/*` | created · modified | 도우미 · 로그인 · 아이디 찾기 · 비밀번호 초기화 수정, 인력 spec 7, repository spec |
| `apps/admin-service/src/store/test/*` | modified | 자격증명 · 업체코드 · 승인 신청 보임 · 승인 흐름 |
| `AGENTS.md` · `docs/{data-layer,conventions,api,architecture,testing}.md` · `README.md` | modified | 부분 유니크 인덱스 · 업체 단위 매니저 계정 · RolesGuard 적용 · `search.ts` · Smoke 목록 · Query DTO / Pagination 적용 목록 |
| `.beaver/output/spec/platform/cache-spec.md` | modified | 무효화 지점(업체 관리자 등록 · 수정 · 정지 · 해제 · 삭제) |

## Tests Written
- 매니저 service 기능 spec
  - 새로 7개 — `manager-staff`(등록) · `manager-staff-list` · `manager-staff-detail` · `manager-staff-update` · `manager-staff-password-reset` · `manager-staff-state` · `manager-staff-delete`
  - 고친 것 3개 — `manager-login` · `manager-find-login-id` · `manager-password-reset`
    - 업체코드 → 업체 → 그 업체 안 계정 조회
    - 업체코드가 없으면 같은 404 + 계정 조회 없음
    - 업체코드 검증 400
- 단언하는 범위
  - repository 호출 조건 — 업체 총관리자 조회 · 대상 조회(같은 업체 · MANAGER · ACTIVE/BLOCK) · 번호 중복(자신 제외 `Not`)
  - 엔티티(`toBeInstanceOf` · 컬럼)
  - SMS 본문 · 순서(쓰기 → SMS)
  - 실패 뒤 미호출
  - 판정(requeue)
  - 403 이 아닌 404(남의 업체 · 자신 · 삭제)
- store spec 보정
  - 신청 해시 · `getBcrypt` 호출
  - 내 신청 목록 · 상세의 `store_code`(승인만, 아니면 `findStores` · `findStore` 미호출)
  - 승인 신청의 파일 · 취소 400
  - 승인: 업체코드 · 자격증명 그대로 · `is_password_change_required = 0` · 승인 알림 SMS · `{store_id, store_code}`(아이디 겹침 · 5회 실패 케이스 삭제)
  - 총관리자 상세 · 업체 목록 · 상세의 `store_code`
- repository spec
  - 매니저 — `insertStaff` · `updateStaff` 의 업체 단위 UK → 400, 업체 없는 계정용 UK 는 500, `findManagerStore` 조건, 통일 500 추가
  - 매니저 `[SMOKE:data-access]` — `buildStaffListQuery` SQL 전체 고정(빌드한 dist 로 계산 — 관계 컬럼 `auth_id` 정렬 · ILike OR · IN)
  - store — `insertHeadManager` 는 제약과 무관하게 500, `findStores`
- build 단계라 실행하지 않았다(`/beaver:test` 몫). typecheck · lint · build · db:check · prettier(손댄 파일) 통과.

## Verification
- **마이그레이션 · 유일성 — PGlite 로 실제 동작 확인**
  - 기존 `t_store` 행에 `store_code`(32자)가 채워진다.
  - 업체가 다르면 같은 아이디 · 번호를 허용하고, 같은 업체에서는 `UK_User_LoginIdLoginScopeStoreId` · `UK_User_PhoneLoginScopeStoreId` 로 거부한다.
  - 미인증 이용자(번호 NULL) 여러 명을 허용하고, 이용자 아이디 · 번호는 그룹 단위로 거부한다.
  - 오류의 제약명이 인덱스 이름이라 `isUniqueViolation` 분기가 그대로 동작한다.
  - 되돌리기는 업체 간에 겹치는 값이 있으면 실패하고, 정리하면 성공한다(제약 · 컬럼 복원).
- `db:check` 일치. 부분 인덱스의 `where` 표기 차이로 남는 차이는 없었다(plan 의 위험 항목 — 발생하지 않음).
- 매니저 인증: 업체코드 → 업체 → 그 업체 안 계정 조회. 업체가 없으면 계정이 없는 것과 같은 404 라 업체 존재를 드러내지 않는다. 확인 단계(인증 ID + 인증번호) · 재발급 · auth-user 는 그대로다.
- 업체 관리자: 게이트웨이 RolesGuard 가 업체 관리자(MANAGER) 토큰을 403 으로 막는다. service 는 actor 로 업체 총관리자를 다시 찾아 그 `store_id` 만 다루고, 대상이 내 업체 MANAGER 가 아니면 404 다.
  - 정지(BLOCK) · 삭제(LEAVE)는 로그인 불가 상태라 다음 요청부터 401, 재발급도 ACTIVE 확인에서 막힌다.
  - 삭제는 아이디 `DEL_<user_id>` · 번호 NULL 마스킹 + 원본 백업이라 같은 아이디 · 번호로 다시 등록할 수 있다.
- plan 과 다른 점
  - 업체 관리자 상세에 `block_comment`(정지 사유)를 더했다 — 정지 · 해제가 생겨 화면에 필요하다.
  - 매니저 도우미 `internalHeaders(clientIp, actor?)` 에 actor 헤더를 더했다.
- Phase 9 테스트 오류 하나를 함께 고쳤다: `store-my-application-list` 의 내부 토큰 실패를 401 로 단언하고 있었는데, 전역 `InternalAuthGuard` 는 403 이다.

## Remaining Issues
- 사용자 작업(개발이 다 끝난 뒤 한꺼번에): 마이그레이션 `StoreCodeManagerScope` 적용(`StoreFile` 뒤).
  - 기존 입점 신청 행이 있으면 업체 총관리자 아이디 · 비밀번호가 빈 값이라, 승인해도 그 계정으로는 로그인할 수 없다 — 반려 후 다시 신청해야 한다.
- 프론트엔드: 매니저 화면 주소에 업체코드를 넣고 로그인 · 아이디 찾기 · 비밀번호 초기화 요청에 `store_code` 를 보내야 한다(기존 매니저 로그인 요청은 400).
- 로드맵 구조 반영(ship 때): Phase 10 에 업체코드 · 신청 자격증명 · 정지 · 해제를 적고, Phase 20 #85(총관리자의 업체 관리자 관리)와 범위를 맞춘다.
