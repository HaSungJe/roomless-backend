# Review — main — 261023

> Pre-merge code review. Check the accumulated changes against the memory rules, AGENTS.md conventions, and the plan/spec intent.
> Location: `.beaver/output/review/` — `<stick>-review-<YYMMDD>.md` (stick = branch name with `/`→`-`, one per ship unit). For a re-review on the same day, append `-<N>`.

## Target
- stick: `main` (direct mode) → origin: `main`
- Included features: 로드맵 Phase 6 계정·인증(#24 · #25 · #92 · #93) + Phase 7 admin-service 기반(#28 ~ #31) — plan `user-account-auth-plan.md` + revision `user-account-auth-revision-261023-1.md`
- Change scope: 수정 66 파일(+701 / −1514), 새 파일 · 폴더 약 37개(apps/admin-service · libs/account · contracts manager/admin · 게이트웨이 manager/admin · 그룹별 전략 · 가드 · compose.admin-service.yml · nginx · 마이그레이션 · beaver 문서)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | 도메인 레이어 `<domain>.<role>.ts`(manager.service.ts · admin.symbols.ts …), 큐 컨트롤러 `<Domain>QueueController`, DTO `<domain>-<feature>.dto.ts` · `ResultDto`, repository 메서드는 소유 도메인 어휘(`findManager` · `updateAdmin`), 제약명 `UK_User_LoginIdLoginScope` · `UK_User_PhoneLoginScope` |
| Structure & layering | pass | controller → service → repository, controller 는 `controllers/` 2파일(동기 · 큐), 큐 컨트롤러는 providers, 앱끼리 import 0, 게이트웨이는 `@app/database` · `@app/account` 미사용. admin-service 루트 모듈에 `InternalAuthGuard` · `ReturnedExceptionInterceptor` |
| Shared logic extraction | pass | 앱 사이 공통 순수 로직은 `libs/account`(token · sms-verification · password · account.constants), 범용은 `libs/common/src/utils/{id,kst}`. service private 헬퍼 0 |
| Errors & responses | pass | 실패 본문 하나(`{message, validation_errors}`), 다른 그룹 계정 404 · 재발급 401 + 만료 단축, 커밋해야 하는 실패(인증번호 불일치)는 return 유지, repository 제약명 분기 + 통일 500 |
| Test strength | pass | 그룹 조건(`login_scope`) 인자 · 호출 횟수 · 미호출 단언, 한국어 리터럴, 분류 태그. 새 QueryBuilder 메서드 3개 모두 `[SMOKE:data-access]`(`buildLoginManagerQuery` · `buildLoginAdminQuery` · 매니저 `buildConsumeSmsVerificationAttemptQuery`), `buildLoginUserQuery` 스냅샷에 `login_scope = $2` 반영 |
| memory rules | pass | `.beaver/output` 산출물(spec · plan · revision · report · review) 커밋 포함(git.md). api-log 정책은 이번 변경과 무관 |
| README · docs | pass | README · AGENTS.md · docs 8개 같은 변경에서 갱신 |

## Intended Behavior Check (against plan/spec)
- **로그인 그룹 = 도메인(리비전 261023-1)**:
  - 이용자 `user` 는 user-service 에 둔다.
    - SNS 가입 · 로그인 · 재발급
    - 휴대폰 인증 · 아이디 찾기 · 탈퇴
    - auth-user 는 이용자 그룹만 돌려준다.
  - 매니저 `manager` 는 admin-service 에 둔다.
    - 로그인 · 재발급 · auth-user
    - 비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화
  - 관리자 `admin` 은 admin-service 에 둔다.
    - 로그인 · 재발급 · auth-user · 비밀번호 변경
  - 도메인마다 DTO · 명령(`admin.manager.*` · `admin.admin.password`) · 내부 경로가 따로다.
  - service 메서드 하나에 `login_scope` 를 넘기던 예외는 코드 · 문서에서 모두 없앴다.
- **게이트웨이 인증**: 전략 · 가드 3쌍(`jwt-user` → user-service, `jwt-manager` · `jwt-admin` → admin-service)이다. 그룹 라우트는 자기 그룹의 가드를 쓰고, 이용자 라우트의 `RolesGuard` 는 뺐다(리비전 결정).
- **admin-service 데이터 접근**: 공유 DB 를 직접 쓰고 마이그레이션 · 시드는 하지 않는다. Phase 7 인프라:
  - compose · nginx · `ADMIN_SERVICE_REPLICAS`
  - 브로커 계정 · 권한 · broker:check
  - `InternalService 'admin'` · `ADMIN_SERVICE_URL`
  - `docker:up` 순서
- **261022 build 에서 그대로인 것**:
  - `t_user.login_scope` · 그룹 UK
  - `store_detail`
  - 마이그레이션 `LoginScopeStoreDetail`(기존 행 채우기 포함, db:check 일치)
  - 청소년보호법 성인 기준(`kstYear`), 일반 가입 폐지
- **빠진 것 없음**: plan · revision 의 파일 목록과 diff 를 대조했다. `user.roles` · `user-general-login` · 이용자 비밀번호 DTO · `USER_COMMAND.PASSWORD` · `/internal/v1/user/{manager,admin}-*` 참조는 0건이다.
- **검증**:
  - 통과: typecheck · lint · Prettier · build(앱 4개, dist 의 `@app/account` 경로 치환 확인) · db:check
  - compose 5개는 `.env.example` 기반 더미 값으로 `config --quiet` 를 통과했다(`.env` 는 읽지 않음).
  - 테스트는 실행하지 않았다(`/beaver:test` 몫).

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | compose.rabbitmq.yml (rabbitmq-init) · compose.admin-service.yml | `RABBITMQ_ADMIN_SERVICE_PASSWORD` 를 필수값(`${VAR:?}`)으로 추가했다. 운영 `.env` 에 이 값이 없으면 `docker:rabbitmq` · `docker:infra` · `docker:up` 이 바로 멈춘다(기존 묶음 포함) | 의도된 필수 비밀값 규칙이다. 배포 전에 `.env` 에 추가하도록 report · 최종 안내에 적었다 — 코드 변경 없음 |
| 2 | Low | apps/admin-service/src/manager/manager.service.ts · admin/admin.service.ts · apps/user-service/src/user/user.service.ts | 로그인 · 토큰 재발급 흐름(세션 · refresh 생성, 재발급 체인)이 세 도메인 service 에 같은 모양으로 있다 | 도메인 분리 결정(2026-10-23)의 결과다. 엔티티 조립까지 util 로 빼면 "service 는 new + 할당" 규약과 부딪쳐서 지금은 그대로 둔다. 네 번째 그룹이 생기거나 흐름이 바뀔 때 `libs/account` 로 모을지 다시 본다 |
| 3 | Low | libs/contracts/src/user/dto/user-find-login-id-confirm.dto.ts | 이용자는 SNS 가입만 남아 결과의 `login_id` 가 늘 null 이다(필드 모양은 그대로 둠) | 프론트 계약 변경이라 이번에는 두었다. 이용자 화면 작업 때 `sns_id` · `created_at` 만 남길지 정한다 |

## Verdict
Pass — Low 3건은 의도된 결정이거나 추적만 할 항목이라 코드 수정 없이 커밋으로 진행한다.
