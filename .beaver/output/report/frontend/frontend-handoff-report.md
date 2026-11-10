# Report — frontend-handoff

## Feature Summary
- **Feature**: 프론트 인계 자료(Phase 27 — Phase 28 화면 설계 아티팩트를 합침) — 프론트 세션이 아티팩트 + 지침서를 보고 화면을 그대로 만들도록, 지침서(API 목록과 호출 방식 · 화면 목록과 주소 · 화면 구성과 쓰는 API · DTO 사본)를 `.beaver/output/frontend/` 에, 화면 설계 아티팩트 3개를 claude.ai 에 만들어 붙였다. 인계 문서를 쓰다 없음을 발견한 이용자 내 정보 API 를 이번 Phase 에 넣었다(#131). 앞으로 공개 API · 동작이 바뀌면 프론트 수정 요청 문서를 같은 변경에서 만드는 규칙을 AGENTS.md · beaver 메모리에 두었다.
- **Entry point**: `.beaver/output/frontend/README.md` + `GET /api/v1/user-service/user/me`(동기 · 이용자 → `GET /internal/v1/user-service/user/me`)
- **Domain**: frontend(인계 문서 · 아티팩트) + user-service `user`(내 정보)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `.beaver/output/frontend/README.md` | created | 목차 · 아티팩트 링크 3개 · 읽는 순서 |
| `.beaver/output/frontend/screens.md` | created | 화면 25개(U1 ~ U11 · M1 ~ M8 · A1 ~ A6) — 주소 · 로그인 · 시안 이름 · 구성 · 들어올 때 · 동작 · 화면 주의, API 108개를 모두 어느 화면엔가 쓴다 |
| `.beaver/output/frontend/api.md` | created | 호출 방식(주소 · 로그인 · 동기/큐 SSE + 읽기 예시 코드 · 실패 · 목록 · 파일 올리기 · 결제 · 시각) + 도메인별 API 108개 표(쓰는 화면 키 포함) |
| `.beaver/output/frontend/dto/{admin,discovery,manager,reservation,room,stats,store,user}.md` | created | 공개 API 가 쓰는 DTO 107개 파일의 사본 — Swagger import · 데코레이터만 빼고 필드 설명은 JSDoc 주석으로 옮김(내부 전용 auth-user · 문 소켓 DTO 제외) |
| `.beaver/output/frontend/dto/common.md` | created | 페이지 DTO · 실패 본문 · 권한 · SSE 이벤트 · 예약 · 결제 상태 상수 · 룩업 값 표 |
| `.beaver/output/frontend/changes/README.md` | created | 수정 요청 목록(처음 인계 한 줄) · 문서 틀 |
| `.beaver/output/frontend/design/{user,manager,admin}.html` | created | 화면 설계 아티팩트 원본(영역별 한 페이지 HTML) |
| claude.ai 아티팩트 3개 | created | 영역별 한 페이지(일반 HTML) — 이용자 화면 `LWUV7hrLgq8nN8EkA4Bj3f` · 관리자 콘솔 `T6Hna7UcqH5ki7uwf9Noyb` · 업체 관리자 콘솔 `8ruyrydbQ8Xvoz3vtqyPWP`. 처음 만든 Design 캔버스 3개는 피그마식이라 사용자 요청으로 지움 |
| `libs/contracts/src/user/dto/user-me.dto.ts` | created | `UserMeResultDto` |
| `libs/contracts/src/user/user.commands.ts` | modified | `USER_INTERNAL_PATH.ME` |
| `apps/user-service/src/user/user.service.ts` · `user.util.ts` | modified | `getMe` · `toUserMeResult` |
| `apps/user-service/src/user/controllers/user.controller.ts` | modified | `GET /me`(`@InternalActor('user_id')`) |
| `apps/gateway/src/api/v1/user-service/user/controllers/user.controller.ts` | modified | `GET /me`(이용자 가드 · Swagger) |
| `apps/user-service/src/user/test/user-me.spec.ts` | created | 내 정보 service 기능 spec |
| `AGENTS.md` | modified | "프론트 연계" 절 · Checklist 한 줄 |
| `.beaver/memory/frontend.md` · `MEMORY.md` | created · modified | 수정 요청 문서 규칙 |
| `.beaver/output/roadmap/roomless-roadmap.md` | modified | Phase 28 을 27 로 합침 · #131 추가 · 사용자 할 일 '프론트' 줄을 한 줄로(내용은 screens.md 화면 주의로) |
| `README.md` · `docs/api.md` | modified | 프론트 인계 줄 · 구조 줄 · user-service 내 정보 / 이용자 그룹 동기 경로에 `GET /me` |

## Tests Written
- `apps/user-service/src/user/test/user-me.spec.ts`(동기 경로 — 실제 controller + service + 전역 InternalAuthGuard 부팅, repository · JwtService mock)
  - [SUCCESS] 본인을 `{user_id, login_scope: 'USER'}` 로 찾아 내 정보(미인증 `phone` null · `is_phone_verified` 0 · 가입일 ISO), 호출 1회
  - [SUCCESS] 휴대폰 인증 · 이용 제한 회원 — 번호 · `is_phone_verified` 1 · `block_comment`
  - [SUCCESS] 탈퇴 대기 — `leave_reserved_at` 그대로
  - [FAIL:service] 조회 null → 404 "회원 정보를 찾을 수 없습니다."
  - [SECURITY] 내부 토큰 없음 → 403, 조회 없음
- 문서 쪽은 테스트 없음(plan) — 대신 아래 확인.

## Verification
- 화면 ↔ API 대조(임시 스크립트 `gen-api-md.cjs`): screens.md 가 공개 API 108개를 모두 어느 화면엔가 쓰고, 없는 API 를 쓰지 않는다 — 통과(화면 키 25개).
- DTO 사본: 저장소 안 임시 폴더에 112개 파일(도메인 107 + 공통 5)로 펼쳐 `tsc --noEmit`(strict · 데코레이터) — 통과, 사본에 `@nestjs/swagger` · `@Api` 없음. 임시 폴더는 지움.
- `npm run typecheck` 통과, 바뀐 파일 `oxlint` 0건 · Prettier 통과(spec 은 --write 로 맞춤).
- 화면 주의의 서버 동작은 코드로 대조했다 — 매니저 · 관리자 로그인 실패는 404 "잘못된 로그인 정보입니다." · 정지 계정 403 + `block_comment`(manager.service.ts:99 · admin.service.ts), 성인 기준 만 19세가 되는 해(user.util.ts `isAdult`), 입점 승인은 사업자등록증 1장 필수(admin store.service.ts:179), 업체 관리자 계정 비밀번호 초기화는 휴대폰 없음 · 탈퇴 업체면 400, 지도는 활성 업체만(discovery.service.ts:59).
- 아티팩트 3개: screens.md 의 시안 이름 60개가 모두 해당 페이지 머리줄에 있다(이용자 25 · 업체 관리자 24 · 관리자 11), 페이지에 `<!doctype>` · `<html>` · `<body>` 태그 · 외부 이미지 · 남은 `{{구멍}}` 없음.
- 업체 관리자 로그인 주소를 `/manager/[store_code]/login` 등으로 바꿨다(사용자 결정 — 업체코드가 32자 ID 라 주소에 넣는다): screens.md M1 · M7 · U11 · A3 와 세 페이지에 반영.
- 테스트 실행은 `/beaver:test` 몫(build 는 실행하지 않음).

## Remaining Issues
- 아티팩트는 정적 시안이다(눌러 보는 동작 없음 — 페이지 안 링크는 그 화면 위치로 이동) — 화면 이동은 screens.md 가 설명한다.
- 시안에서 정해 둔 것: 매니저 · 관리자 이름을 주는 API 가 없어 상단 바는 로그인 아이디 + 권한 배지, 업체 로그인 주소 앞부분은 예시(`https://roomless.example`). 예약 취소 사유 입력 시트 · U10 휴대폰 미인증 화면은 따로 그리지 않음(컴포넌트 견본에만).
- 후보: 업체 관리자 등록 SMS 에 로그인 주소를 넣으려면 매니저 화면 주소 설정값(예: `MANAGER_WEB_URL`)이 필요하다 — 지금은 업체코드만 글자로 간다.
- 아티팩트는 비공개다 — 프론트 세션이 같은 계정이 아니면 아티팩트 공유(Share)가 필요하다.
