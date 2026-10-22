# Report — user-account-auth

## Feature Summary
- **Feature**: 계정·인증 — 로그인 그룹 3개(이용자 · 매니저 · 관리자) 분리, 그룹별 아이디 · 번호 UK, 매니저 아이디 찾기 · 비밀번호 초기화(이용자 미러), 성인 기준(청소년보호법) · 일반 가입 폐지, 업체 상세 JSON
- **Entry point**: `POST · PATCH (게이트웨이 동기 · 큐)` — `/api/v1/user/login · /api/v1/manager/login · /api/v1/admin/login · /api/v1/{user,manager,admin}/token-refresh · /api/v1/{manager,admin}/password · /api/v1/manager/find-login-id(+/confirm) · /password-reset(+/confirm)`
- **Domain**: user (로드맵 Phase 6 — #24 · #25 · #92 · #93)
- **Plan**: [user-account-auth-plan.md](../../plan/user/user-account-auth-plan.md) · **Spec**: [user-account-auth-spec.md](../../spec/user/user-account-auth-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `libs/contracts/src/user/user.roles.ts` | created | `AUTH_ID` · `LOGIN_SCOPE` · `type LoginScope` |
| `libs/contracts/src/user/user.commands.ts` | modified | `GENERAL_SIGN` 제거, `MANAGER_FIND_LOGIN_ID(_CONFIRM)` 추가, 비밀번호 초기화 → `user.manager.password-reset(-confirm)`, 내부 경로 `GENERAL_LOGIN` 제거 · `MANAGER_LOGIN` · `MANAGER_TOKEN_REFRESH` · `ADMIN_LOGIN` · `ADMIN_TOKEN_REFRESH` 추가 |
| `libs/contracts/src/user/dto/user-general-login.dto.ts` | modified | 결과에 `auth_id` · `store_id` |
| `libs/contracts/src/user/dto/user-general-sign.dto.ts` | deleted | 일반 가입 폐지 |
| `libs/database/src/entities/user/user.entity.ts` | modified | `login_scope` 컬럼, `UK_User_LoginIdLoginScope` · `UK_User_PhoneLoginScope`(기존 `UK_User_LoginId` · `UK_User_Phone` 대체), 번호 주석 |
| `libs/database/src/entities/store/store.entity.ts` | modified | `store_detail`(jsonb, 기본 `'{}'`) · `StoreDetail` 인터페이스 |
| `libs/database/src/migrations/1792682222497-LoginScopeStoreDetail.ts` · `migrations.ts` | created · modified | `db:generate` 결과 + 손으로 고친 부분: `login_scope` 를 임시 기본값 `'USER'` 로 추가 → 권한으로 채우는 `UPDATE` → `DROP DEFAULT` · JSDoc |
| `libs/database/src/seeder/seeder.targets.ts` | modified | 첫 총관리자 `login_scope = 'ADMIN'` |
| `apps/user-service/src/user/user.constants.ts` · `user.util.ts` | modified | `ADULT_AGE = 19`, `isAdult(birth, now)` — 한국 날짜의 올해 − 출생 연도 ≥ 19 |
| `apps/user-service/src/user/user.service.ts` | modified | `generalSign` 삭제. `sign` 에 `AUTH_ID.USER` · `LOGIN_SCOPE.USER`. `login` 에 그룹 USER. `generalLogin(…, login_scope)` 결과에 권한 · 업체. `tokenRefresh(…, login_scope)` 그룹 불일치 401. 휴대폰 인증 번호 확인은 같은 그룹 안. `sendFindLoginId` · `confirmFindLoginId` 에 `login_scope`. 비밀번호 초기화는 `LOGIN_SCOPE.MANAGER` 만(SNS 분기 삭제) |
| `apps/user-service/src/user/controllers/user.controller.ts` | modified | `/general-login` 삭제, `/token-refresh` 는 USER, `/manager-login` · `/manager-token-refresh` · `/admin-login` · `/admin-token-refresh` |
| `apps/user-service/src/user/controllers/user.controller.queue.ts` | modified | 일반 가입 삭제, 이용자 아이디 찾기에 USER, 매니저 아이디 찾기 2개, 비밀번호 초기화 명령 이름 |
| `apps/user-service/src/user/repositories/user.repository.ts` | modified | UK 분기 이름 `UK_User_LoginIdLoginScope` · `UK_User_PhoneLoginScope` |
| `apps/gateway/src/api/v1/user/controllers/user.controller.ts` · `user.controller.queue.ts` · `user.module.ts` | modified | `/general-login` · `/general-sign` · `/password` · `/password-reset(+/confirm)` 삭제. 탈퇴 · 철회 · 휴대폰 인증 2개에 `RolesGuard` + `@Roles(AUTH_ID.USER)` + `@ApiForbiddenResponse` |
| `apps/gateway/src/api/v1/admin/{admin.module.ts, controllers/admin.controller.ts, controllers/admin.controller.queue.ts}` | created | 관리자 그룹 — 로그인 · 재발급(동기), 비밀번호 변경(`@Roles(SUPER_ADMIN, ADMIN)`) |
| `apps/gateway/src/api/v1/manager/{manager.module.ts, controllers/manager.controller.ts, controllers/manager.controller.queue.ts}` | created | 매니저 그룹 — 로그인 · 재발급(동기), 비밀번호 변경(`@Roles(HEAD_MANAGER, MANAGER)`) · 아이디 찾기 · 비밀번호 초기화(비로그인) |
| `apps/gateway/src/gateway.module.ts` | modified | `ManagerModule` · `AdminModule` |
| `README.md` · `AGENTS.md` · `docs/{api,architecture,conventions,data-layer,testing,error-handling,messaging}.md` | modified | 로그인 그룹 표 · 경로 접두 · RolesGuard 적용(큐 핸들러 데코레이터 순서) · service 예외(로그인 그룹 인자) · `user.roles.ts` · 성인 기준 · 그룹 UK · jsonb · NOT NULL 컬럼 추가 마이그레이션 · RolesGuard 403 단언 |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified | #24 · #25 문구, #92 · #93 추가, 결정 2개 닫기, 공통 규칙 · 행위자 표 · Phase 8 #34 메모, build 완료 |

## Tests Written
build 규약상 실행하지 않았다 — `/beaver:test` 에서 실행한다.

- `apps/user-service/src/user/test/user.util.spec.ts` — `[CASES:isAdult]` 합의한 6개(새해 경계 ⑤ · ⑥ 포함)
- `user-sign.spec.ts` — insert 엔티티에 `login_scope: 'USER'`, 미성년 케이스 데이터 2008-01-01
- `user-login.spec.ts` — `findUser` 조건에 `login_scope: 'USER'`
- `user-general-login.spec.ts` — 매니저 · 관리자 로그인으로 다시 씀
  - admin-login: 그룹 ADMIN 조회, 결과 전체(`auth_id` · `store_id`)
  - manager-login: 그룹 MANAGER, `store_id`
  - 다른 그룹(조회 null) 404 · 비밀번호 · 토큰 · 세션 미호출
  - 정지 403 · 비밀번호 불일치 404 · 검증 400
  - `/general-login` 404
- `user-token-refresh.spec.ts`
  - `admin-token-refresh` 에 ADMIN 회원 → 새 토큰
  - `manager-token-refresh` 에 USER 회원 → 401 + 만료 단축 · 새 refresh · 토큰 없음
  - `token-refresh` 에 ADMIN 회원 → 401
- `user-find-login-id.spec.ts`
  - 이용자 발송 · 확인 조건 `login_scope: 'USER'`(결과는 가입한 SNS)
  - 매니저 발송 · 확인 `login_scope: 'MANAGER'`(결과는 아이디)
  - 매니저 발송 404 · 확인에서 다른 그룹 404(시도 소비 없음)
- `user-password-reset.spec.ts` — 명령 `user.manager.*`, 조건 `login_scope: 'MANAGER'`, SNS 400 케이스 삭제
- `user-phone-verification.spec.ts` — 번호 확인 `findUser({phone, login_scope: 'USER'})`
- `user.repository.spec.ts` — `UK_User_LoginIdLoginScope` → 400 '이미 존재하는 로그인 ID입니다.', `UK_User_PhoneLoginScope` → 400 '이미 가입된 번호입니다.'
- `libs/database/src/test/seeder.spec.ts` — 첫 총관리자 `login_scope: 'ADMIN'`
- `user-general-sign.spec.ts` — 삭제
- 게이트웨이
  - `user.controller.spec.ts`: `/general-login` 404
  - `user.controller.queue.spec.ts`
    - `[SECURITY]` 탈퇴 · 철회 · 휴대폰 인증 2개 × 매니저 · 관리자 권한 4개 → 403 · 발행 없음
    - 없어진 라우트 4개 404
    - 이용자 아이디 찾기 결과 SNS
  - `admin/test/admin.controller.spec.ts`
    - 로그인 · 재발급 내부 경로 · 결과
    - 검증 400
    - `/find-login-id` · `/password-reset` 404
    - 큐 라우트 404 · 모듈 등록 순서
  - `admin/test/admin.controller.queue.spec.ts`
    - SUPER_ADMIN · ADMIN 비밀번호 변경 발행 · SSE
    - HEAD_MANAGER · MANAGER · USER 403
    - 401 · 검증 400 · 동기 라우트 404
  - `manager/test/manager.controller.spec.ts` — 로그인 · 재발급 · 검증 400 · 큐 라우트 404 · 모듈 등록 순서
  - `manager/test/manager.controller.queue.spec.ts`
    - HEAD_MANAGER · MANAGER 비밀번호 변경
    - SUPER_ADMIN · ADMIN · USER 403
    - 비로그인 찾기 · 초기화 4개 → `user.manager.*`(actor null)
    - 검증 400 3개 · 동기 라우트 404
- plan 의 `테스트 생략(위임형)` 항목(모듈 배선 · 상수 · 타입 · 컬럼)은 따로 쓰지 않았다.
  - 단, 기존 게이트웨이 spec 의 규약(모듈 `[동기, 큐]` 등록 단언)은 새 모듈에도 맞췄다.

## Verification
- **통과**
  - `npm run typecheck`(spec 포함)
  - `npm run lint`
  - Prettier(`apps/**/*.ts` · `libs/**/*.ts`)
  - `npm run build`(gateway · user-service · scheduler)
  - `npm run db:check`('엔티티와 마이그레이션이 일치합니다.')
- **마이그레이션 손질** — 생성된 `ADD "login_scope" ... NOT NULL` 은 기존 행이 있으면 실패한다.
  - 그래서 임시 기본값 → 권한으로 채우기 → 기본값 제거로 고쳤다.
  - 생성된 제약명은 `UK_User_LoginIdLoginScope` · `UK_User_PhoneLoginScope` 그대로다(UQ 해시 이름 아님).
- **plan 대조**
  - 남은 `generalSign` · `GENERAL_SIGN` · `PASSWORD_RESET` 명령 · `general-login` 참조 없음(`.back/` 제외). 일부러 남긴 것:
    - `SMS_PURPOSE.PASSWORD_RESET` 용도 값
    - 라우트 404 단언
  - 매니저 · 관리자 로그인 결과의 `auth_id` · `store_id` 는 로그인 spec 이 결과 전체로 단언한다.
- **권한 가드** — `RolesGuard` 는 `request.user.auth_id`(user-service auth-user 결과 — `UserAuthUserResultDto.auth_id`)를 본다. 게이트웨이 큐 spec 은 이 가드를 override 하지 않고 실제로 돌린다.

## Remaining Issues
- **테스트 미실행** — `/beaver:test` 에서 `npm test` 를 돌린다.
- **마이그레이션 적용(사용자)**
  - `LoginScopeStoreDetail` 적용 — `npm run db:migrate` 또는 Docker migrate 컨테이너.
  - 개발 DB 에 남은 일반 가입 이용자 계정은 로그인할 API 가 없어진다(서비스 오픈 전, spec Notes).
  - 되돌리기(`db:revert`)는 그룹이 다른 계정끼리 아이디 · 번호가 겹치면 옛 UK 를 다시 걸지 못해 실패한다(마이그레이션 JSDoc 에 적음).
- **매니저 계정** — 매니저 아이디 찾기 · 비밀번호 초기화는 계정 · 휴대폰 번호가 생기는 Phase 9 · 10 부터 실제로 쓰인다.
- **메시지 상수** — `UNDERAGE_MESSAGE` 는 일반 가입이 빠져 한 곳(sign)에서만 쓴다. 테스트 리터럴과 짝이라 `user.constants.ts` 에 그대로 두었다.

## Modification - 261023-1

리비전: [user-account-auth-revision-261023-1.md](../../revision/user/user-account-auth-revision-261023-1.md)

### Change summary
- **로그인 그룹을 도메인으로 분리했다.** 이용자는 `user`(user-service)다. 매니저 `manager` · 관리자 `admin` 은 새로 만든 **admin-service** 에 둔다(Phase 7 을 함께 진행).
  - 도메인마다 controller · service · repository · DTO · 명령 · 내부 경로가 따로다.
  - "service 메서드 하나 + `login_scope` 인자" 예외는 없앴다.
- **공통 계정 로직**은 새 lib `libs/account`(`@app/account/*`)로 옮겼다.
  - 토큰 발급 · SMS 인증번호 · 임시 비밀번호 util
  - 계정 상수 · 공통 메시지
  - `generateId` · 한국 날짜 계산은 `libs/common/src/utils/{id,kst}.ts`로 갔다.
- **명령**은 매니저 `admin.manager.*`, 관리자 `admin.admin.password` 이고 큐 `q.admin.cmd`(바인딩 `admin.#`)가 받는다.
  - 이용자 `user.member.password` 는 삭제했다(이용자는 비밀번호가 없다).
- **내부 HTTP**는 `/internal/v1/manager/{login,token-refresh,auth-user/:user_id}` · `/internal/v1/admin/...`(admin-service)다.
- **게이트웨이 인증**은 그룹별 전략 · 가드 3쌍이다.
  - `jwt-user` → user-service
  - `jwt-manager` · `jwt-admin` → admin-service
  - 각 auth-user 는 자기 그룹 계정만 돌려주므로 다른 그룹 토큰은 401 이다.
  - `RolesGuard` · `@Roles` 는 라우트에서 뺐다. 그룹 안에서 권한을 좁힐 때만 쓰는 미적용 규약으로 돌아갔다.
- **admin-service 는 공유 DB 를 직접 쓴다**(같은 엔티티). 마이그레이션 · 시드는 user-service 묶음이 맡는다.
- **로그인 결과**
  - 매니저: 토큰 4종 · `is_password_change_required` · `auth_id` · `store_id`
  - 관리자: 토큰 4종 · `is_password_change_required` · `auth_id`
  - 휴대폰 인증 여부는 이용자 기능이라 뺐다.
  - 매니저 아이디 찾기 결과는 `{login_id, created_at}` 이다.
- **Phase 7 인프라**
  - `compose.admin-service.yml` + `docker/nginx/admin-service.conf`
  - `ADMIN_SERVICE_REPLICAS`(기본 1)
  - 브로커 계정 `admin-service`(init.sh · `broker:check`)
  - 게이트웨이 `ADMIN_SERVICE_URL`
  - `docker:up` 순서: user-service → admin-service → scheduler → gateway

### Changed files
| File | Change Type | Description |
|------|-----------|------|
| `libs/account/src/account.constants.ts` · `utils/{token,sms-verification,password}.ts` · `utils/test/{sms-verification,password}.spec.ts` | created | 공통 계정 로직(user.util · user.constants 에서 이동) |
| `libs/common/src/utils/{id,kst}.ts` · `utils/test/kst.spec.ts` | created | `generateId` · `kstDayStart` · `kstYear` |
| `tsconfig.json` | modified | `@app/account/*` |
| `libs/contracts/src/roles.ts` (← `user/user.roles.ts`) | moved | 도메인 공통 권한 · 로그인 그룹 상수 |
| `libs/contracts/src/user/user.commands.ts` | modified | 이용자 명령 · 경로만 |
| `libs/contracts/src/user/dto/{user-general-login,user-password,user-password-reset,user-password-reset-confirm}.dto.ts` | deleted | 매니저 · 관리자 도메인 DTO 로 |
| `libs/contracts/src/manager/manager.commands.ts` · `dto/manager-*.dto.ts`(8) | created | 매니저 도메인 규격 |
| `libs/contracts/src/admin/admin.commands.ts` · `dto/admin-*.dto.ts`(4) | created | 관리자 도메인 규격 + admin-service 큐 |
| `libs/contracts/src/user/dto/user-auth-user.dto.ts` · `libs/messaging/src/messaging.constants.ts` | modified | 주석 · `BROKER_USER.ADMIN_SERVICE` |
| `apps/admin-service/**` | created | `tsconfig.app.json` · `main.ts` · `admin-service.module.ts` · `manager/` · `admin/`(controllers · service · repository · interfaces · symbols · util · test) |
| `apps/user-service/src/user/{user.service,user.util,user.constants}.ts` · `controllers/*` · `repositories/user.repository.ts` | modified | 이용자 전용 — `generalLogin` · `changePassword` · 비밀번호 초기화 삭제, 재발급 · 아이디 찾기는 USER 고정, auth-user 쿼리에 `login_scope = USER` |
| `apps/user-service/src/user/test/*` | modified · moved | `user-general-login` · `user-password` · `user-password-reset` spec 을 admin-service 매니저 spec 으로 옮김, util spec 은 성인 판정만 |
| `apps/gateway/src/guards/passport.jwt.auth/*` | modified · created | `passport.jwt.auth.util.ts` · 매니저 · 관리자 전략 · 가드, 모듈에 3개 등록 |
| `apps/gateway/src/api/v1/{user,manager,admin}/**` | modified | 그룹 가드 · 도메인 DTO · 명령 · 내부 경로(`'admin'` 서비스), `RolesGuard` 제거 |
| `apps/gateway/src/modules/transport/internal-http.client.ts` | modified | `InternalService = 'user' \| 'admin'` · `ADMIN_SERVICE_URL` |
| `compose.admin-service.yml` · `docker/nginx/admin-service.conf` | created | admin-service × N + LB |
| `compose.{gateway,user-service,scheduler,rabbitmq}.yml` · `docker/rabbitmq/init.sh` · `scripts/check-broker-acl.mjs` · `Dockerfile` · `nest-cli.json` · `package.json` · `.env.example` | modified | admin-service 연결 · 계정 · 스크립트 |
| `README.md` · `AGENTS.md` · `docs/{api,architecture,conventions,data-layer,testing,messaging,error-handling,integration}.md` | modified | 도메인 분리 · admin-service · libs/account · 그룹별 인증 |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified | Phase 7 진행 중(Phase 6 과 한 기획) · 결정 2개 추가 · 미결 "업체 계정 생성 위치" 닫음 |

### Tests written
build 규약상 실행하지 않았다.

- **libs**: `account/utils/test/sms-verification.spec.ts` · `password.spec.ts`, `common/utils/test/kst.spec.ts`. user.util.spec.ts 의 `[CASES]` 를 옮기고 `kstYear` 경계 2개를 더했다.
- **admin-service manager**
  - `manager-login`: 그룹 조건 · 결과 · 기기 갱신 · 다른 그룹 404 · 정지 403 · 검증 · 내부 토큰
  - `manager-token-refresh`: 다른 그룹 · 정지 · 미존재 401 + 만료 단축 · ip 불일치 · 검증
  - `manager-auth-user`
  - `manager-password`: 그룹 조건 · actor 없음 401
  - `manager-find-login-id`
  - `manager-password-reset`
  - `manager.repository`: 오류 매핑, `[SMOKE]` `buildLoginManagerQuery` · 시도 소비
- **admin-service admin**
  - `admin-login` · `admin-token-refresh` · `admin-auth-user` · `admin-password`
  - `admin.repository`: `[SMOKE]` `buildLoginAdminQuery`
- **user-service**
  - 매니저 · 관리자 케이스를 삭제했다.
  - `user-token-refresh` 의 다른 그룹 회원 401 + 만료 단축을 단언한다.
  - `[SMOKE]` `buildLoginUserQuery` 에 `login_scope = $2` 를 넣었다.
- **게이트웨이**
  - `guards.spec.ts`: 매니저 · 관리자 전략(서비스 `'admin'` · 그룹 경로 · 401), 그룹별 가드 `handleRequest`
  - 그룹 라우트 spec: 그 그룹의 가드를 override 하고 내부 경로 · 명령을 단언한다.
  - 이용자 403 케이스는 가드 단계 401 로 옮겨서 삭제했다.

### Verification
- **통과**
  - `npm run typecheck`(spec 포함)
  - `npm run lint`
  - Prettier(`apps` · `libs` · `scripts`)
  - `npm run build`(gateway · user-service · admin-service · scheduler — dist 에서 `@app/account` 가 상대경로로 바뀐 것까지 확인)
  - `npm run db:check`
- **compose 검증**: compose 파일 5개를 `.env.example` 기반 더미 값으로 `docker compose config --quiet` 했다(종료 코드 0). `.env` 는 읽지 않았다.
- **남은 참조 없음**: `user.roles` · `user-general-login` · 이용자 비밀번호 DTO · `USER_COMMAND.PASSWORD` · 그룹별 user 내부 경로.

### Remaining issues
- **테스트 미실행** — `/beaver:test` 에서 `npm test` 를 돌린다.
- **사용자 몫**
  - `.env` 에 `RABBITMQ_ADMIN_SERVICE_PASSWORD` 를 추가한다(필수 — 비면 rabbitmq-init · admin-service 가 뜨지 않는다).
  - `npm run docker:rabbitmq` 로 계정을 만든다.
  - `npm run docker:admin-service` 를 user-service 묶음 뒤에 띄운다. 로컬 실행은 `ADMIN_SERVICE_URL` 기본값 `http://localhost:4002` 이다.
- **마이그레이션** `LoginScopeStoreDetail` 적용(앞 회차와 같다).

## Modification - 261023-2

리비전: [user-account-auth-revision-261023-2.md](../../revision/user/user-account-auth-revision-261023-2.md)

### Change summary
- **경로를 서비스 이름으로 시작하게 바꿨다.**
  - 공개 경로는 `/api/v1/<service>/<domain>/<action>` 이다.
    - `/api/v1/user-service/user/login`
    - `/api/v1/admin-service/manager/login`
    - `/api/v1/admin-service/admin/password`
  - 내부 경로는 `/internal/v1/<service>/<domain>/<action>` 이다.
    - `/internal/v1/admin-service/manager/auth-user/:user_id`
  - 로그인 그룹은 지금처럼 게이트웨이 가드가 가른다.
- **게이트웨이 폴더**를 `api/v1/user-service/user/` · `api/v1/admin-service/manager/` · `api/v1/admin-service/admin/` 로 옮겼다. 상대 import 는 한 단계 깊어졌다.
- 명령 · 큐 · 도메인 · 가드 · DTO 는 그대로다.
- **로드맵 정리**
  - 이후 Phase 9 ~ 21 의 기대 API · 파일 집합을 새 규칙으로 바꿨다.
  - Phase 20 관리자 계정 관리 → admin-service `admin` 도메인
  - Phase 21 통계 → admin-service `stats`
  - Phase 10 업체 관리자 계정 → `manager` 도메인 + `@Roles(HEAD_MANAGER)`
  - Cross-Cutting "서버 분할"(그룹 가드) · "경로 규칙" 을 고쳤다.
  - 결정 1건을 추가했다.

### Changed files
| File | Change Type | Description |
|------|-----------|------|
| `apps/gateway/src/api/v1/{user,manager,admin}/**` → `apps/gateway/src/api/v1/{user-service/user,admin-service/manager,admin-service/admin}/**` | moved · modified | `@Controller('/api/v1/<service>/<domain>')`, import 깊이, spec 경로 |
| `apps/gateway/src/gateway.module.ts` · `guards/passport.jwt.auth/*.guard.ts` · `guards/test/guards.spec.ts` · `modules/transport/internal-http.client.ts` · `test/internal-http.client.spec.ts` | modified | 모듈 import · 주석 · 경로 |
| `libs/contracts/src/{user/user,manager/manager,admin/admin}.commands.ts` | modified | `*_INTERNAL_PATH` 값 |
| `apps/user-service/src/user/{controllers/user.controller,user.service}.ts` · `test/*` | modified | 내부 경로 · JSDoc · spec |
| `apps/admin-service/src/{manager,admin}/{controllers/*.controller,*.service}.ts` · `test/*` | modified | 내부 경로 · JSDoc · spec |
| `AGENTS.md` · `README.md` · `docs/{api,architecture,conventions,testing}.md` | modified | 경로 규칙 · 게이트웨이 폴더 · 예시 |
| `.beaver/output/roadmap/roomless-roadmap.md` · `.html` | modified | 경로 · 파일 집합 · 규칙 · 결정 |

### Tests written
build 규약상 실행하지 않았다.

기존 spec 의 단언은 그대로 두고 경로 문자열만 새 규칙으로 바꿨다.
- 게이트웨이 라우트 · 없어진 라우트 404
- 내부 HTTP 호출 인자
- 서비스 내부 경로 · auth-user
- 가드 전략의 조회 경로

### Verification
- 통과:
  - `npm run typecheck`
  - `npm run lint`
  - Prettier
  - `npm run build`(앱 4개)
- 소스의 `@Controller` 를 확인했다. 게이트웨이는 모두 `/api/v1/{user-service,admin-service}/…`, 서비스는 모두 `/internal/v1/{user-service,admin-service}/…` 다.
- `apps` · `libs` 와 규약 문서에 옛 경로(`/api/v1/{user,manager,admin}` · `/internal/v1/{user,manager,admin}`)가 남아 있지 않다. 로드맵의 완료 Phase 표에는 당시 경로가 메모와 함께 남아 있다.

### Remaining issues
- **테스트 미실행** — `/beaver:test` 에서 돌린다.
