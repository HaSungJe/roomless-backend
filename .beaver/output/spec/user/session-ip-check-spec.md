---
# One-line feature summary
feature_goal: "로그인/가입 시 ip 저장(기존 확인) + 토큰 refresh 시 세션 ip 체크 — 불일치 401 거부"

# Domain/module name
domain: "user"

# Entry-point method/endpoint
api_method: "POST"

# Path/signature
api_path: "/api/v1/user/token-refresh (기존 API 동작 확장 — 신규 엔드포인트 없음)"

# Affected state
affected_data:
  - "t_session (read — findSession 신설, 쓰기 변경 없음)"
  - "t_session_refresh (기존 흐름 그대로 — ip 불일치 시 신규 발급 없음)"
---

## Feature Description

요청하신 4개 지점(회원가입·SNS 회원가입·로그인·SNS 로그인)의 **ip 수집·저장은 이미 구현돼 있음을 실측 확인** — 4개 핸들러 모두 `@Ip() ip` 를 받아 `t_session.ip`(100자, nullable, [session.entity.ts:13](../../../src/api/v1/user/entities/session.entity.ts))에 저장한다([user.service.ts](../../../src/api/v1/user/user.service.ts) sign/generalSign/login/generalLogin 의 `sessionEntity.ip = ip ?? null`). 이 부분은 **변경 없음**.

신규 구현은 **토큰 refresh 시 ip 체크**: `POST /token-refresh` 가 요청 ip 를 받아, JWT payload 의 `session_id` 로 세션을 조회해 **로그인 시점에 저장된 `t_session.ip` 와 비교**하고, 불일치하면 401 로 거부한다.

## API Spec

- Method: POST (기존)
- Path: `/api/v1/user/token-refresh` (기존)
- Request: body 변경 없음(`refresh_token`) — 서버가 `@Ip()` 로 요청 ip 추가 수집
- Response: 변경 없음 — 성공 시 토큰 4종, 실패 시 401 `{message}`

## Business Rules

- **검증 순서**(기존 흐름에 삽입): JWT verify → `findSessionRefresh`(hash) → DB `end_at` 만료 확인 → **[신규] `findSession(session_id)` 조회 + ip 비교** → 회원 state 재검증 → old refresh 단축 → 신규 발급.
- **ip 불일치 → 401 "유효하지 않은 토큰입니다."** (기존 refresh 실패 메시지와 동일 — 실패 사유 비노출). **거부만** — end_at 단축/세션 무효화 없음, 올바른 ip 에서 재시도 가능 (확정 결정).
- **세션 미존재 → 동일 401** (session_id 로 세션을 찾지 못하면 유효한 컨텍스트가 아님).
- **체크 생략 조건**: 저장된 `session.ip` 가 null 이거나 요청 ip 를 얻지 못한 경우 — 비교 기준이 없으므로 통과 (기존 로그인이 ip 를 null 로 저장했을 수 있는 하위호환).
- ip 불일치/세션 미존재 시 후속 단계(findUser·updateSessionRefresh·insertSessionRefresh) 미실행.

## Notes

- **repository `findSession` 신설** — sibling: `findSessionRefresh`([user.repository.ts](../../../src/api/v1/user/repositories/user.repository.ts) — try/catch, `findOne({where, loadRelationIds: true})`, 통일 500). 동일 계약으로 작성, 인터페이스([user.repository.interface.ts](../../../src/api/v1/user/interfaces/user.repository.interface.ts))에 추가.
- controller `tokenRefresh` 에 `@Ip() ip: string` 추가 — sibling: sign/login 핸들러의 `(@Body() dto, @Ip() ip)` 파라미터 형태.
- `@Ip()` 는 express `req.ip` — 프록시 뒤 실클라이언트 ip 는 trust proxy 설정 사안으로 기존 저장 로직과 동일한 전제(범위 밖).
- 매핑 민감 쿼리 없음 — `findSession` where 는 PK(`session_id`) 단일 조건, service 가 구성 → `[SMOKE:data-access]` 해당 없음(docs/testing.md 정의 기준).

## Decisions

- [x] **불일치 시 401 거부만** (selected: user, 2026-07-20) — end_at 단축·세션 무효화 없음.
- [x] **불일치 메시지 = "유효하지 않은 토큰입니다."** (default: 기존 refresh 실패 4분기와 동일 문구로 사유 비노출 일관성)
- [x] **저장 ip 또는 요청 ip 부재 시 체크 생략** (default: 비교 기준 부재 — 하위호환)
- [x] **ip 체크 위치 = end_at 확인 직후, 회원 state 재검증 이전** (default: 불필요한 회원 조회 전에 조기 차단)
- [x] **refresh 성공 시 세션 ip 갱신 안 함** (default: 거부 정책과 일관 — 기준 ip 는 로그인 시점 고정)
