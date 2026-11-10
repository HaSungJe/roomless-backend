# Review — main(direct) — 261111

> 머지 전 코드 리뷰. 쌓인 변경을 메모리 규칙 · AGENTS.md 규약 · plan/spec 의도에 대어 본다.

## Target
- stick: `main`(direct 모드) → origin: `main`
- 포함 기능: Phase 27 프론트 인계 자료(#125 ~ #130 — 지침서 · 화면 설계 아티팩트 3개, Phase 28 을 합침) + 이용자 내 정보 API(#131)
- 변경 범위: 코드 7개 파일(contracts DTO 1 · 경로 상수 · user-service service · util · 내부 controller · 게이트웨이 controller · spec 1), 문서(`.beaver/output/frontend/` 지침서 · DTO 사본 · 아티팩트 원본 HTML 3개 · changes, AGENTS.md "프론트 연계", README · docs/api.md, beaver 메모리 frontend, 로드맵 · spec · plan · report)

## Convention Check (against AGENTS.md)
| Item | Result | Notes |
|------|------|------|
| Naming | pass | DTO `user-me.dto.ts` · `UserMeResultDto`, 경로 상수 `USER_INTERNAL_PATH.ME`, util `toUserMeResult`, spec `user-me.spec.ts` |
| Structure & layering | pass | 게이트웨이 동기 controller(`InternalHttpClient` 만) → 서비스 내부 controller(`@InternalActor('user_id')`, 위임 한 줄) → service → 기존 repository `findUser`(새 repository 메서드 없음 — Smoke 대상 아님). 조회만이라 `@Transactional()` 없음 |
| Shared logic extraction | pass | 응답 변환은 `user.util.ts` 의 `toUserMeResult`(service private 헬퍼 없음), 날짜는 `toISOString()` 만(계산 없음) |
| Errors & responses | pass | 없음 → 404 `USER_NOT_FOUND_MESSAGE`(공통 상수), 응답 필드 생략 없음(`sns_id` · `phone` · `block_comment` · `leave_reserved_at` 은 null) |
| Swagger · 주석 | pass | 게이트웨이 핸들러 verb → `@UseGuards` → `@HttpCode(200)` → `@ApiBearerAuth` → `@ApiOperation({summary})` → `@ApiOkResponse({type})` → 실패 응답들, 모든 함수 JSDoc, service JSDoc 에 전송 경로 |
| Test strength | pass | 동기 경로 부팅(전역 InternalAuthGuard 포함), 응답 전체 값 · `findUser` 호출 횟수 · 인자, 404 본문, 내부 토큰 없음 403 + `not.toHaveBeenCalled()`, 한국어 리터럴 · 분류 태그 |
| README · docs | pass | README(user-service 내 정보 · 프론트 인계 줄 · 구조 줄), docs/api.md(이용자 그룹 동기 경로에 `GET /me`) |
| 프론트 연계(새 규칙) | pass | 이번 변경은 처음 인계에 포함(changes/README 목록 첫 줄) — 별도 수정 요청 문서 대상 아님 |

## Intended Behavior Check (against plan/spec)
- 지침서: README(목차 · 아티팩트 링크) · screens.md(화면 25개 — 구성 · 들어올 때 · 동작 · 화면 주의, API 108개를 모두 쓴다) · api.md(호출 방식 + 108개 표) · dto/(공개 DTO 107개 파일 + 공통) · changes/(목록 · 틀) — plan 대로. 서버 구성 · 환경 설정은 싣지 않음(사용자 결정).
- 아티팩트: plan 은 Design 캔버스였으나 사용자 결정으로 **영역별 한 페이지(일반 HTML)** 로 바꿨다 — spec · plan · report 를 그에 맞게 고침. 시안 이름 60개가 세 페이지에 모두 있음(대조 스크립트). 처음 Design 캔버스 3개는 사용자 요청으로 지움.
- 업체 관리자 로그인 주소를 `/manager/[store_code]/…` 로(사용자 결정 — 업체코드 32자 ID) — screens.md M1 · M7 · U11 · A3 와 세 페이지 반영.
- U3 예약: 날짜 달력(기본 오늘) · 객실 그룹 한 장씩 넘기는 카드 + 아래 가운데 `‹ 1 / 3 ›`(사용자 요청) — 페이지 · screens.md 반영.
- 내 정보 API: spec 의 응답 필드 · 404 · 이용자 그룹 조건 그대로.

## Memory reconcile
- `frontend.md`(수정 요청 문서 규칙) — AGENTS.md "프론트 연계" 절에 모든 조항 반영됨(applied). 규칙 위치를 "AGENTS.md + beaver 메모리" 둘 다로 정한 사용자 결정이 있어 보관(archive)하지 않고 둔다.
- 그 밖의 메모리(git · api-log · cache)는 이번 변경과 무관.

## Findings
| # | Severity | Location (path:line) | Description | Recommendation |
|---|--------|-----------------|------|------|
| 1 | Low | apps/user-service/src/user/controllers/user.controller.ts `getMe` | `@InternalActor('user_id')` 는 헤더가 없으면 null 이다 — 게이트웨이 가드 뒤에서만 불리고 내부 토큰이 필요해 실제로 빈 값이 오지 않으며, 기존 내부 라우트(내 예약 등)와 같은 패턴이다 | 그대로 둔다(패턴 공통 — 고치려면 데코레이터 단위로 따로) |
| 2 | Low | `.beaver/output/frontend/design/*.html` | 시안 예시 업체 로그인 주소 앞부분(`https://roomless.example`) · 매니저 · 관리자 이름 대신 로그인 아이디 — API 가 이름을 주지 않아서 | 보고서 Remaining 에 적음 |

## Verdict
Pass — 막는 문제 없음. 테스트 실행은 ship 뒤 `/beaver:test`.
