---
# One-line feature summary (e.g. "Admin user sign-up")
feature_goal: "프론트 인계 자료(Phase 27 — Phase 28 화면 설계 아티팩트를 합침) — API 목록과 호출 방식 · 화면 목록과 주소 · 화면 구성과 쓰는 API · DTO 사본 지침서를 .beaver/output/frontend/ 에, 영역별 화면 설계 아티팩트(이용자 · 업체 관리자 · 관리자)를 claude.ai 에 만들어 지침서에 붙이고, 앞으로 기능이 바뀔 때마다 프론트 수정 요청 문서를 같이 만드는 규칙을 둔다"

# Domain/module name (see AGENTS.md for the project directory structure)
domain: "frontend — .beaver/output/frontend/(지침서 · 설계 원본 · 수정 요청), claude.ai 화면 설계 아티팩트 3개, AGENTS.md(프론트 연계 규칙), .beaver/memory(빠뜨리지 않기). 백엔드 코드는 바꾸지 않는다"

# Roadmap phase this feature belongs to (number), when a roadmap exists — the spec board uses it to show
#   "지금 작업 중" (in-progress / Next up phase) and to mark the feature 배포 once the phase is done. Empty if none.
roadmap_phase: 27

# Entry-point method/endpoint. Record the entry-point identifier this project actually uses,
#   derived from code evidence (path:line), in the project's own naming. Do not assume a
#   particular position's syntax. (key name "api_method" stays as-is)
api_method: "문서 — 프론트 세션이 읽는 .beaver/output/frontend/(목차 README.md) + 새 API 하나: 내 정보 GET /api/v1/user-service/user/me (동기 · 이용자 가드 → 내부 HTTP GET /internal/v1/user-service/user/me)"

# Path/signature (e.g. "/api/v1/user/admin/sign")
#   Record the path or signature this project actually uses, from code evidence (path:line),
#   in the project's own naming. (key name "api_path" stays as-is)
api_path: ".beaver/output/frontend/{README.md, api.md, screens.md, dto/<도메인>.md, design/<영역>/, changes/README.md} + 아티팩트(이용자 · 업체 관리자 · 관리자 화면 설계)"

# Affected state — write/persist targets. Basis for sizing the test cases. (key name "affected_data" stays as-is)
#   Record the state this project actually writes/persists, derived from code evidence (path:line),
#   in the project's own naming. Read-only reads are not "write" but are still data. Leave empty if none.
affected_data:
  - "내 정보 API 는 조회만(t_user 읽기 — 쓰기 없음). 문서 · 아티팩트 — .beaver/output/frontend/(새), claude.ai 아티팩트 3개(새), AGENTS.md(프론트 연계 절), .beaver/memory(frontend 규칙), 로드맵 사용자 할 일의 '프론트' 줄(screens.md 로 옮김). DB · 코드 변경 없음"
---

## Feature Description

프론트(Next.js 앱 하나 · `/` 이용자 · `/manager` 업체 관리자 · `/admin` 총관리자 — 별도 저장소) 세션은 **아티팩트 + 지침서**를 보고 화면을 그대로 만든다(사용자 결정 2026-11-10).
지침서는 셋이다. ① **API 목록과 호출 방식** — 어떤 API 가 있고(메서드 · 주소 · 동기/큐 · 로그인 · 요청 · 응답 DTO · 하는 일) 어떻게 부르는지. ② **화면 목록과 주소**. ③ **화면 구성과 쓰는 API** — 화면마다 어떤 덩어리로 되어 있고, 덩어리마다 어떤 API · 필드를 쓰며, 버튼마다 어떤 API 를 어떤 순서로 부르는지.
여기에 DTO 사본(Swagger 데코레이터만 뺀 `libs/contracts` DTO)과 **화면 설계 아티팩트**(영역별 1개 — 화면마다 같은 키 · 주소로 그린 시안)를 붙인다. 로드맵 Phase 28(화면 설계 아티팩트)을 이 Phase 로 합친다. 서버 구성 · 환경 변수 · 백엔드 설정 · 저장소 구성은 싣지 않는다.
앞으로 공개 API · 응답 · 동작이 바뀌는 기능은 프론트 수정 요청 문서(`changes/<날짜>-<기능>.md` — 바뀐 DTO 포함)를 같이 만들고, 화면 설계는 하지 않는다(초기 아티팩트 뒤 화면은 프론트 세션이 만든다).

## API Spec
- Method: 문서(프론트 세션이 읽는다)
- Path: `.beaver/output/frontend/`
  - `README.md` — 목차(문서 · 아티팩트 링크 · 읽는 순서)만
  - `api.md` — ① API 목록과 호출 방식(#126): 호출 방식(주소 앞부분 · 로그인 토큰 · 동기 JSON / 큐 SSE · 실패 본문 모양 · 파일 올리기) + 도메인별 107개 표
  - `screens.md` — ② 화면 목록과 주소(#125) + ③ 화면 구성과 쓰는 API(#127): 화면마다 시안 위치(아티팩트 · 키) · 구성(덩어리 → API · 필드) · 들어올 때 · 동작(버튼 → API → 결과 처리) · 화면 주의
  - 화면 설계 아티팩트 3개(#128 이용자 모바일 · #129 업체 관리자 콘솔 · #130 관리자 콘솔) — 영역별 한 페이지(일반 HTML), 화면마다 screens.md 와 같은 키 · 주소를 붙인 시안. 원본은 `design/<영역>.html`
  - `dto/<도메인>.md` — 처음 인계 때의 DTO 전체 사본(기준점 — 이후에는 고치지 않고 수정 요청 문서가 바뀐 DTO 를 싣는다)
  - `changes/README.md` — 수정 요청 목록 · 문서 틀
- Request(프론트 세션이 받는 것): 위 지침서 + 아티팩트 링크 3개
- Response: 없음(문서)
- **새 API — 내 정보**(사용자 결정 2026-11-10 — 인계 문서를 쓰다 이용자 회원 정보를 다시 읽는 API 가 없음을 발견): `GET /api/v1/user-service/user/me`(동기 · `PassportJwtAuthGuard`) → user-service `GET /internal/v1/user-service/user/me`(`@InternalActor('user_id')`) → `UserService.getMe` → 기존 `findUser({user_id, login_scope: USER})`. 응답 `UserMeResultDto`(`libs/contracts/src/user/dto/user-me.dto.ts`): `user_id` · `user_search_code` · `nickname` · `gender` · `birth` · `sns_id` · `phone` · `is_phone_verified` · `state_id` · `block_comment` · `leave_reserved_at` · `created_at`. 없으면 404 `USER_NOT_FOUND_MESSAGE`. 마이페이지(U10)가 들어올 때 · 앱을 다시 열 때 부른다.

## Business Rules
- **위치는 `.beaver/output/frontend/`**(사용자 결정 2026-11-10) — 백엔드 저장소에 커밋되고, 프론트 세션은 이 폴더만 읽으면 된다.
- **싣는 것은 API 목록과 호출 방식 · 화면 목록과 주소 · 화면 구성과 쓰는 API · DTO 사본 · 화면 설계 아티팩트뿐**(사용자 결정 2026-11-10) — 서버 구성 · 환경 변수 · 백엔드 `.env` 설정 · 저장소 구성 · 배포는 싣지 않는다. API 를 부르는 데 꼭 필요한 호출 방식(토큰 · SSE · 실패 본문)만 api.md 앞에 짧게 둔다.
- **화면 구성과 쓰는 API 의 모양** — 화면마다: 주소 · 로그인 · 시안(아티팩트 · 화면 키) · 구성(화면 덩어리 → 그 덩어리를 채우는 API · 필드) · 들어올 때(부르는 API) · 동작(버튼 → API → done/실패 때 할 일 · 다시 조회할 API) · 화면 주의(서버가 정한 동작 — 막히는 조건 · 안내 문구 근거).
- **화면 설계 아티팩트**(Phase 28 을 합침 — 사용자 결정 2026-11-10) — 영역별 1개(이용자 모바일 · 업체 관리자 PC · 관리자 PC), **일반 HTML 페이지 하나에 화면을 위에서 아래로 이어 놓는다**(목차 → 디자인 기준 → 묶음별 화면 — 처음 Design 캔버스로 만들었다가 피그마식이라 바꿈, 사용자 결정 2026-11-10). 화면마다 screens.md 의 키 · 주소를 머리줄로 붙이고, 문구 · 필드는 실제 DTO 이름과 한국어 메시지 · 룩업 이름을 쓴다. 상태가 갈리는 화면(예약 1건의 결제 대기 · 이용 중 · 취소, 빈 목록, 이용 제한 안내 등)은 상태별로 그린다. 충실도는 색 · 글꼴 · 실제 문구까지 갖춘 정적 시안(눌러 보는 동작 없음), 디자인 시스템은 계정에 없어 세 아티팩트가 같은 색 · 글꼴 토큰을 함께 쓴다. 지침서(README · screens.md)에 링크를 붙인다. 로드맵 사용자 할 일의 '프론트' 줄에 쌓인 안내는 해당 화면의 "화면 주의" 로 옮긴다.
- **DTO 는 문서에만**(사용자 결정 2026-11-10) — 처음 인계 때 `dto/<도메인>.md` 에 전체 사본(기준점), 이후에는 수정 요청 문서에 바뀐 DTO 만. 사본은 `@nestjs/swagger` import · `@Api…(...)` 데코레이터를 뺀 코드이고, `class-validator` · `class-transformer` 데코레이터와 한국어 메시지는 그대로 둔다. 함께 싣는 것: 페이지 DTO(`libs/common/src/dto/pagination.dto.ts`) · 실패 본문 DTO(`ApiFailResultDto` · `ValidationErrorResultDto`) · 상태 값 상수(예약 · 결제 · 이용 중 취소 요청 상태) · 권한 · 로그인 그룹 값(`AUTH_ID` · `LOGIN_SCOPE`) · SSE 이벤트 이름(`COMMAND_STREAM_EVENT`) · 룩업 값 표.
- **프론트 수정 요청 규칙**(사용자 결정 2026-11-10) — 공개 API(경로 · 요청 · 응답 · 실패 · 큐/동기)나 사용자에게 보이는 동작이 바뀌는 기능은 `changes/<YYYY-MM-DD>-<기능>.md` 를 같은 변경에서 만든다: 바뀐 이유 · 영향 화면 · API 변경(추가 · 변경 · 삭제) · 화면 구성과 쓰는 API 의 변경(화면 동작 지침) · 바뀐 DTO 코드(Swagger 없이) · 반영 순서. 처음 아티팩트 뒤로는 화면 설계(배치 · 디자인)를 쓰지 않고 아티팩트도 고치지 않는다(화면은 프론트 세션). 기획(direct/stick)이 plan 파일 목록에 넣고, build 가 쓰고, ship 리뷰가 빠졌는지 본다. 규칙은 AGENTS.md(프론트 연계 절) + beaver 메모리.
- **이용자 주소 중 둘은 고정** — SMS 링크가 이미 연다: `/reservation/<예약 ID>`(QR 확인 — 이용 시작 5분 전 SMS, scheduler) · `/reservation/<예약 ID>/cancel-request`(이용 중 취소 동의 — admin-service reservation.util.ts).
- **이용자는 로그인 없이 둘러본다** — 지도 · 업체 상세 · 객실 그룹 · 예약 가능 시간은 공개, 예약 · 결제 · 내 예약 · 마이페이지 · 입점 신청은 로그인(이용자 토큰). 매니저 · 관리자 영역은 로그인 화면 말고 모두 로그인. 세 로그인 그룹은 토큰이 따로다(다른 그룹 토큰은 401).
- **예약 · 연장 결제 조합** — 예약(또는 연장 신청) done 의 `payment_id` · 금액 · 주문명으로 토스 결제창 → 결제 성공 화면에서 토스 승인(프론트 서버) → `POST /api/v1/user-service/reservation/payment-confirm`(`payment_id` · `payment_key`). 5분 안에 결제가 확인되지 않으면 만료(docs/guides/toss-setup.md).
- **화면 목록과 주소(사용자 승인)**
  - 이용자 `/`: `/` 지도 · 주변 업체(공개) · `/stores/[store_id]` 업체 상세 + 객실 그룹(공개) · `/stores/[store_id]/booking` 예약(조회 공개, 예약부터 로그인) · `/payments/success` · `/payments/fail` 결제 결과 · `/login` SNS 로그인 · `/signup` 가입 추가 정보 · `/phone-verification` 휴대폰 인증 · `/find-login-id` 아이디 찾기 · `/reservation` 내 예약 목록 · `/reservation/[reservation_id]` 예약 1건(고정) · `/reservation/[reservation_id]/cancel-request` 취소 동의(고정) · `/reservation/[reservation_id]/extension` 연장 · `/me` 마이페이지 · `/store-applications` · `/store-applications/new` · `/store-applications/[store_application_id]` 입점 신청
  - 업체 관리자 `/manager`: `/manager/login` · `/manager/find-login-id` · `/manager/password-reset` · `/manager/password` · `/manager` 대시보드 · `/manager/reservations` · `/manager/rooms` · `/manager/room-groups` · `/manager/room-groups/[room_group_id]` · `/manager/plans` · `/manager/store` · `/manager/staff` · `/manager/staff/[user_id]`
  - 총관리자 · 관리자 `/admin`: `/admin/login` · `/admin/password` · `/admin` 대시보드 · `/admin/store-applications` · `/admin/store-applications/[store_application_id]` · `/admin/stores` · `/admin/stores/[store_id]` · `/admin/managers` · `/admin/managers/[user_id]` · `/admin/users` · `/admin/users/[user_id]`
- **로드맵 사용자 할 일의 '프론트' 줄**은 screens.md 의 화면 주의로 옮기고 그 줄은 "프론트 작업은 `.beaver/output/frontend/`" 한 줄로 줄인다(같은 내용을 두 곳에 두지 않는다).

## TDD Cases
- `user-me.spec.ts`(동기 경로 — 내 정보): [SUCCESS] 로그인 이용자 본인을 이용자 그룹 조건(`{user_id, login_scope: USER}`)으로 찾아 내 정보로 돌려준다(미인증이면 `phone` null · `is_phone_verified` 0, 가입일 ISO) / 휴대폰 인증 · 이용 제한 회원이면 번호 · `is_phone_verified` 1 · `block_comment` / 탈퇴 대기면 `leave_reserved_at` 그대로, [FAIL:service] 조회 null 이면 404 "회원 정보를 찾을 수 없습니다.", [SECURITY] 게이트웨이 내부 토큰이 없으면 403 · 조회 없음
- 테스트 생략(문서만): 인계 문서 · 수정 요청 규칙 · AGENTS.md · 메모리 — 코드 변경이 없다. DTO 사본은 build 때 임시 변환 스크립트(저장소 밖)로 만들고, 사본을 모은 임시 폴더에서 `tsc --noEmit`(class-validator · class-transformer 만 설치)으로 문법 · import 를 확인한다

## Notes
- 근거
  - 공개 라우트 107개: `apps/gateway/src/api/v1/**/controllers/*.ts`(가드 · 동기 / 큐 · Swagger 요약)
  - contracts DTO 의 import: `@nestjs/swagger`(112) · `class-validator`(107) · `class-transformer`(4) · `@app/common/dto/pagination.dto.js`(13) · `./actor.js`(1)
  - SNS 로그인 입력: `libs/contracts/src/user/dto/user-login.dto.ts:5`(`sns_id` NAVER · KAKAO + `sns_user_id`)
  - 결제 흐름: `docs/guides/toss-setup.md:9`(프론트 결제창 → 프론트 서버 승인 → 서버 조회 검증)
  - SMS 링크: admin-service `reservation.util.ts:67`(취소 동의) · scheduler QR 링크(`USER_WEB_URL/reservation/<id>`)
- 로그인 화면 주의에 적는다: 서버는 SNS 토큰을 다시 확인하지 않고 넘긴 `sns_user_id` 를 믿는다 — SNS 로그인을 끝낸 뒤 그 사용자 ID 만 넘긴다.
- 화면 설계 아티팩트는 이 Phase 에서 한 번 만든다. 그 뒤의 화면 작업은 프론트 세션 몫이고, 백엔드는 수정 요청 문서로만 알린다.

## Proposals (Codebase-Based)
- [x] DTO 사본은 임시 스크립트로 만든다 — 110개 넘는 파일을 손으로 옮기지 않는다(스크립트는 저장소에 두지 않는다)
- [x] 로드맵 사용자 할 일의 '프론트' 줄(Phase 19 ~ 22 에서 쌓인 프론트 안내)을 screens.md 화면 주의로 옮긴다

## Decisions
- [x] 문서 위치 — `.beaver/output/frontend/`(사용자 결정 2026-11-10)
- [x] 싣는 것 — API 목록과 호출 방식 · 화면 목록과 주소 · 화면 구성과 쓰는 API · DTO 사본 + 화면 설계 아티팩트, 서버 구성 · 환경 설정은 빼기(사용자 결정 2026-11-10)
- [x] 화면 설계 아티팩트 — Phase 28 을 이 Phase 로 합쳐 같이 만들고 지침서에 붙인다(사용자 결정 2026-11-10). 영역별 한 페이지(위에서 아래로) · 정적 시안 · 공통 토큰
- [x] 업체 관리자 로그인 주소 — 업체코드를 주소에(`/manager/[store_code]/login` · `/find-login-id` · `/password-reset`, 업체코드 없이 오면 `/manager/login` 안내)(사용자 결정 2026-11-10)
- [x] DTO 전달 — 처음은 인계 문서에 전체 사본, 이후 수정 요청 문서에 바뀐 DTO(사용자 결정 2026-11-10)
- [x] 수정 요청 규칙 위치 — AGENTS.md + beaver 메모리(사용자 결정 2026-11-10)
- [x] 테스트 — 문서는 없음(사본은 임시 폴더 tsc 로 확인), 내 정보 API 는 service 기능 spec 1개
- [x] 내 정보 API — 이번 Phase 에 추가(사용자 결정 2026-11-10 "이번 페이즈에서 내 정보 api 추가하고 반영하자")
