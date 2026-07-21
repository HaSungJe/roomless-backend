---
# One-line feature summary
feature_goal: "가맹점(숙박업소) 등록 — 신규 store 도메인 + SUPER_ADMIN/ADMIN 전용 권한 API"

# Domain/module name
domain: "store"

# Entry-point method/endpoint
api_method: "POST"

# Path/signature
api_path: "/api/v1/store/register"

# Affected state — write/persist targets
affected_data:
  - "t_store (insert — 신규 테이블)"
---

## Feature Description

가맹점(호텔/모텔 등 숙박업소)의 **header 정보 테이블 `t_store` 를 신설**하고, 가맹점을 등록하는 API 1개를 신규 `store` 도메인에 만든다. **SUPER_ADMIN / ADMIN 권한만 호출 가능** — 프로젝트에 정의만 되어 있던 `RolesGuard`([roles.guard.ts:7](../../../../src/guards/roles/roles.guard.ts))의 **첫 실적용**이다.

향후 이 도메인이 가맹점 관리(객실·예약·정산 등)의 뿌리가 된다.

## API Spec

- Method: POST
- Path: `/api/v1/store/register`
- Request: `store_name`, `business_number`, `owner_name`, `phone`, `address` (필수) + `address_detail` (선택)
- Response: `{store_id}` — 생성된 가맹점 ID (200)

## Business Rules

- **권한**: `@UseGuards(PassportJwtAuthGuard, RolesGuard)` + `@Roles('SUPER_ADMIN', 'ADMIN')`. 그 외 권한(MANAGER/USER)은 403, 미인증은 401.
- **사업자등록번호 유니크**: `UK_Store_BusinessNumber` — 중복 등록 시 400 "이미 등록된 사업자등록번호입니다." (repository errno 1062 분기, sibling: [user.repository.ts insertUser](../../../../src/api/v1/user/repositories/user.repository.ts)).
- `store_id` 는 서버 생성(`v4().replace(/-/g,'')` 32자) — 기존 user 도메인 ID 생성 패턴과 동일.
- 검증: 사업자등록번호 10자리 숫자, 전화번호 숫자/하이픈, 상호명 100자·대표자명 50자·주소 255자 이내.

## Notes

- **RolesGuard 메시지 한국어화 필요**: 현재 `canActivate` 가 `false` 를 반환해 Nest 기본 403 `{message:'Forbidden resource', error, statusCode}` 이 그대로 응답된다([exception.ts:27](../../../../src/exception/exception.ts) 이 `exception['response']` 를 그대로 전달). 프로젝트 규약(한국어 리터럴 + `{message}` 단독)에 맞추려면 `throw new ForbiddenException({message: '접근 권한이 없습니다.'})` 로 변경해야 한다 — 첫 적용 시점에 함께 처리.
- **`MANAGER` 권한 데이터는 이미 존재**([seeder.targets.ts:16](../../../../src/modules/seeder/seeder.targets.ts) `AUTH_SEED_DATA`) — 시드 변경 불필요.
- **RolesGuard 는 `user.auth_id` 를 읽고**, passport 가 이미 `auth_id` 를 반환하므로([passport.jwt.auth.dto.ts](../../../../src/guards/passport.jwt.auth/passport.jwt.auth.dto.ts)) 인증 연동은 추가 작업 없음.
- sibling 계약: service/repository/controller 전부 user 도메인 구조를 그대로 따른다 — Symbol 토큰 DI, `new XEntity()`+할당, try/catch + 통일 500, `@SetMetadata` Swagger 자동 등록.
- 데이터 접근은 `insertStore` 1개(insert 전용, criteria 없음) → 매핑 민감 쿼리 구성 아님, `[SMOKE:data-access]` 해당 없음([docs/testing.md](../../../../docs/testing.md) 정의).

## Decisions

- [x] **도메인명 = `store`** (selected: user, 2026-07-20) — 가맹점=점포, 추후 객실·예약이 store 하위로 자연스럽게 확장.
- [x] **이번 범위 = 가맹점 등록만** (selected: user — "일단 이 기획을 매니저 등록이 아닌 가맹점 등록으로 하자"). 매니저 등록은 별도 기획.
- [x] **t_user 무변경** — 매니저 등록을 미뤘으므로 `t_user.store_id` FK·`login_id` 확장·NOT NULL 컬럼 완화는 **매니저 등록 기획 때 한 번에** 처리(스키마 변경 분산 방지). 사용자가 앞서 지시한 "회원↔가맹점 FK"는 그 시점에 반영 예정.
- [x] **RolesGuard 를 한국어 403 으로 수정** (default: 규약 정합 — 영문 기본 메시지가 응답에 그대로 노출되는 것을 방지)
- [x] **라우트 = `/register`** (default: '가입(sign)'이 아닌 관리자에 의한 '등록'이므로. 매니저 등록 시 `/manager-register` 로 대칭 확장 가능)
- [x] **상태 컬럼 = `is_delete`(0/1)** (default: SessionEntity 와 동일 패턴 — 운영상태 세분화는 필요 시 추후)
