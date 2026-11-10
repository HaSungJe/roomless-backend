# Plan — frontend-handoff

## Feature Summary
- **Feature**: 프론트 인계 자료(Phase 27 — Phase 28 화면 설계 아티팩트를 합침) — 프론트 세션이 **아티팩트 + 지침서**를 보고 화면을 그대로 만들도록, 지침서(① API 목록과 호출 방식 ② 화면 목록과 주소 ③ 화면 구성과 쓰는 API + DTO 사본)를 `.beaver/output/frontend/` 에, 화면 설계 아티팩트 3개(이용자 · 업체 관리자 · 관리자)를 claude.ai 에 만들어 지침서에 붙인다. 앞으로 기능이 바뀔 때마다 프론트 수정 요청 문서를 만드는 규칙(AGENTS.md · beaver 메모리)을 둔다. 서버 구성 · 환경 변수 · 백엔드 설정은 싣지 않는다
- **Entry point**: `.beaver/output/frontend/README.md`(목차 · 아티팩트 링크). 백엔드 코드 · DB 변경 없음
- **Domain**: frontend — 로드맵 Phase 27(#125 화면 목록 · #126 API 목록과 호출 방식 · #127 화면 구성과 쓰는 API · #128 이용자 화면 설계 · #129 업체 관리자 콘솔 설계 · #130 관리자 콘솔 설계)
- **Spec**: [frontend-handoff-spec.md](../../spec/frontend/frontend-handoff-spec.md)

### 구현 단위 (순서)
- A. `api.md` — API 목록과 호출 방식(#126): 호출 방식 + 도메인별 107개 표(임시 스크립트가 게이트웨이 컨트롤러에서 뽑음)
- B. `screens.md` — 화면 목록과 주소(#125) + 화면 구성과 쓰는 API(#127): 화면 25개, 화면마다 시안 위치 · 구성(덩어리 → API · 필드) · 들어올 때 · 동작 · 화면 주의
- C. `dto/<도메인>.md` — DTO 사본(임시 스크립트 — Swagger 줄만 뺌) + `common.md`(페이지 · 실패 본문 · 상수 · 룩업 값)
- D. 화면 설계 아티팩트 3개(#128 ~ #130) — 영역별 한 페이지(일반 HTML — 위에서 아래로 목차 · 디자인 기준 · 화면), screens.md 의 키 · 주소 · 구성을 그대로 그린 정적 시안, 원본은 `design/<영역>.html`
- E. `README.md`(목차 · 아티팩트 링크) · `changes/README.md`(수정 요청 목록 · 틀)
- G. 내 정보 API(#131 — 사용자 결정 2026-11-10) — `GET /api/v1/user-service/user/me`(동기 · 이용자), 기존 `findUser` 로 조회만. 지침서 U5 · U10 · api.md · dto 에 반영
- F. 규칙 — AGENTS.md "프론트 연계" 절 + Checklist, beaver 메모리 `frontend.md`, 로드맵(Phase 28 을 27 로 합친 구조 · 사용자 할 일 '프론트' 줄 → screens.md 화면 주의로 옮기고 한 줄로), README.md 한 줄

## Prerequisites
- [x] 공개 라우트 107개와 DTO 가 다 있다(Phase 26 까지 ship) — `apps/gateway/src/api/v1/**/controllers/*.ts` · `libs/contracts/src/*/dto/*.ts`

---

## File List

| File | Action |
|------|------|
| `.beaver/output/frontend/README.md` | new — 목차 · 아티팩트 링크 3개 |
| `.beaver/output/frontend/api.md` | new — API 목록과 호출 방식(#126) |
| `.beaver/output/frontend/screens.md` | new — 화면 목록과 주소 + 화면 구성과 쓰는 API(#125 · #127) |
| `.beaver/output/frontend/dto/{common,user,manager,admin,store,room,reservation,discovery,stats}.md` | new — DTO 사본(처음 인계 기준점) |
| `.beaver/output/frontend/design/{user,manager,admin}.html` | new — 화면 설계 아티팩트 원본(영역별 한 페이지 HTML) |
| claude.ai 아티팩트 3개 — `roomless 이용자 화면` · `roomless 업체 관리자 콘솔` · `roomless 관리자 콘솔` | new — 화면 설계(#128 · #129 · #130), 일반 HTML 페이지(처음 Design 캔버스로 만들었다가 피그마식이라 바꿈 — 사용자 결정) |
| `.beaver/output/frontend/changes/README.md` | new — 수정 요청 목록 · 문서 틀 |
| `AGENTS.md` | modified — "프론트 연계" 절 · Checklist 한 줄 |
| `.beaver/memory/frontend.md` · `.beaver/memory/MEMORY.md` | new · modified — 수정 요청 문서를 빠뜨리지 않기 |
| `.beaver/output/roadmap/roomless-roadmap.md` | modified — Phase 28 을 27 로 합친 구조(기획 때 반영) · 사용자 할 일 '프론트' 줄 → 인계 폴더 한 줄(내용은 screens.md 화면 주의로) |
| `README.md` | modified — 인계 · 수정 요청 위치 한 줄, user-service 설명에 내 정보 |
| `libs/contracts/src/user/dto/user-me.dto.ts` | new — `UserMeResultDto` |
| `libs/contracts/src/user/user.commands.ts` | modified — `USER_INTERNAL_PATH.ME` |
| `apps/user-service/src/user/user.service.ts` · `user.util.ts` | modified — `getMe` · `toUserMeResult` |
| `apps/user-service/src/user/controllers/user.controller.ts` | modified — `GET /me`(`@InternalActor`) |
| `apps/gateway/src/api/v1/user-service/user/controllers/user.controller.ts` | modified — `GET /me`(이용자 가드 · Swagger) |
| `apps/user-service/src/user/test/user-me.spec.ts` | new — service 기능 spec |
| `docs/api.md` | modified — 이용자 그룹 동기 경로에 `GET /me` |

임시(저장소 밖 scratchpad, 커밋하지 않음): `scan-routes.cjs`(라우트 → routes.json) · `gen-api-md.cjs`(API 목록 표 + 화면 매핑 누락 검사) · `gen-dto-docs.cjs`(DTO 사본).

---

## Design

### A. api.md — API 목록

```md
<!-- .beaver/output/frontend/api.md — 앞부분은 손으로, 표는 gen-api-md.cjs 결과 -->
# API 목록

## 호출 방식
- 주소: `<게이트웨이>/api/v1/<서비스>/<도메인>/…` — `user-service`(이용자 쪽) · `admin-service`(업체 · 관리자 쪽). 키는 모두 snake_case.
- 로그인: 그룹마다 로그인 · 재발급 API 가 따로다(이용자 · 매니저 · 관리자 — 토큰은 서로 통하지 않는다). `Authorization: Bearer <access_token>`, 401 이면 그 그룹의 `token-refresh` 로 한 번 재발급 후 다시 보내고, 또 401 이면 그 영역 로그인 화면으로.
- 방식 두 가지:
  - **동기** — JSON 응답(조회 · 로그인 · 재발급 · 업로드 주소 발급).
  - **큐** — 상태를 바꾸는 쓰기. 응답이 `text/event-stream`: `accepted` → `done`(data = 응답 DTO, 없으면 `null`) | `failed`(data `{status_code, message, validation_errors, …}`) | `pending`(30초 안에 결과 없음 — 그 리소스를 다시 조회). POST 라서 `EventSource` 대신 `fetch` 스트림으로 읽는다.
- 실패 본문(동기 · 큐 같음): `{message, validation_errors: [{property, message}] | null, …기능별 필드}` — `validation_errors` 는 입력 칸 옆, 나머지는 `message` 를 띄운다. 400 입력 · 규칙 / 401 로그인 / 403 권한 / 404 없음 / 503 잠시 뒤 다시.
- 목록: query `page` · `size` · `page_size` · `all_search_yn`, 응답 `{list, pagination}`.
- 파일 올리기: 업로드 주소 발급(동기) → 그 주소로 파일 `PUT`(S3 직접) → 등록 API(큐)에 키를 넘긴다.

## 이용자 — user-service
### user
| 메서드 · 주소 | 방식 | 로그인 | 요청 DTO | 응답 DTO(큐는 done data) | 하는 일 |
|---|---|---|---|---|---|
| `POST /api/v1/user-service/user/login` | 큐 | — | UserLoginDto | UserLoginResultDto | SNS 로그인 … |
<!-- … discovery · reservation · store, 업체 · 관리자 — admin-service: manager · admin · store · room · reservation · user · stats — 107개 -->
```

```js
// scratchpad/gen-api-md.cjs — routes.json → api.md 의 도메인별 표 + 화면 매핑 누락 검사(저장소에 두지 않음)
// scan-routes.cjs 수정: 요청 DTO 는 핸들러 블록 전체에서 /@(Body|Query|Param)\(\) \w+: (\w+)/g 로 찾는다(@PassportActor() 에서 끊기지 않게)
const fs = require('fs');
const [routesPath, outPath] = process.argv.slice(2);
const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
const DOMAIN_ORDER = ['user-service/user', 'user-service/discovery', 'user-service/reservation', 'user-service/store', 'admin-service/manager', 'admin-service/admin', 'admin-service/store', 'admin-service/room', 'admin-service/reservation', 'admin-service/user', 'admin-service/stats'];

const lines = [];
for (const domain of DOMAIN_ORDER) {
    const rows = routes.filter((r) => r.path.startsWith(`/api/v1/${domain}`)).sort((a, b) => a.path.localeCompare(b.path));
    lines.push(`### ${domain.split('/')[1]}`, '', '| 메서드 · 주소 | 방식 | 로그인 | 요청 DTO | 응답 DTO(큐는 done data) | 하는 일 |', '|---|---|---|---|---|---|');
    for (const r of rows) lines.push(`| \`${r.method} ${r.path}\` | ${r.kind} | ${r.guard || '—'} | ${r.inputs || '—'} | ${r.ok || '—'} | ${r.summary} |`);
    lines.push('');
}
if (lines.filter((l) => l.startsWith('| `')).length !== routes.length) throw new Error('도메인 표에 빠진 라우트가 있다');

// 화면 매핑 누락 검사 — screens.md 의 API 언급(`METHOD /api/v1/...`)이 107개를 모두 덮는지
const screens = fs.readFileSync(process.argv[4], 'utf8');
const mentioned = new Set([...screens.matchAll(/`(GET|POST|PATCH|PUT|DELETE) (\/api\/v1\/[^`]+)`/g)].map((m) => `${m[1]} ${m[2]}`));
const missing = routes.map((r) => `${r.method} ${r.path}`).filter((k) => !mentioned.has(k));
const unknown = [...mentioned].filter((k) => !routes.some((r) => `${r.method} ${r.path}` === k));
if (missing.length || unknown.length) throw new Error(`화면에 안 쓴 API: ${missing.join(', ')} / 없는 API: ${unknown.join(', ')}`);
fs.writeFileSync(outPath, lines.join('\n'));
```

### B. screens.md — 화면 목록과 주소 + 화면별 API 조합

```md
<!-- .beaver/output/frontend/screens.md -->
# 화면 목록 · 화면별 API 조합

## 화면 목록
| 키 | 주소 | 화면 | 로그인 |
|---|---|---|---|
| U1 | `/` | 지도 · 주변 업체 | 공개 |
| U2 | `/stores/[store_id]` | 업체 상세 + 객실 그룹 | 공개 |
| U3 | `/stores/[store_id]/booking` | 예약 | 조회 공개 · 예약은 이용자 |
| U4 | `/payments/success` · `/payments/fail` | 결제 결과 | 이용자 |
| U5 | `/login` · `/signup` · `/phone-verification` · `/find-login-id` | 로그인 · 가입 · 휴대폰 인증 · 아이디 찾기 | 공개(인증은 이용자) |
| U6 | `/reservation` | 내 예약 목록 | 이용자 |
| U7 | `/reservation/[reservation_id]` ★ | 예약 1건(상세 · QR · 취소 · 연장으로) | 이용자 |
| U8 | `/reservation/[reservation_id]/cancel-request` ★ | 이용 중 취소 동의 | 이용자 |
| U9 | `/reservation/[reservation_id]/extension` | 연장 | 이용자 |
| U10 | `/me` | 마이페이지(탈퇴 · 철회) | 이용자 |
| U11 | `/store-applications` · `/store-applications/new` · `/store-applications/[store_application_id]` | 입점 신청 | 이용자 |
| M1 | `/manager/login` · `/manager/find-login-id` · `/manager/password-reset` · `/manager/password` | 로그인 · 계정 찾기 · 비밀번호 | 공개(변경은 매니저) |
| M2 | `/manager` | 대시보드(내 업체 통계) | 매니저 |
| M3 | `/manager/reservations` | 예약 현황 | 매니저 |
| M4 | `/manager/rooms` | 호실 | 매니저 |
| M5 | `/manager/room-groups` · `/manager/room-groups/[room_group_id]` | 객실 그룹(사진 · 그룹 상품 · 기간 가격) | 매니저 |
| M6 | `/manager/plans` | 업체 상품 설정 | 매니저 |
| M7 | `/manager/store` | 내 업체 설정 | 매니저(문 시크릿은 업체 총관리자) |
| M8 | `/manager/staff` · `/manager/staff/[user_id]` | 업체 관리자 관리 | 업체 총관리자 |
| A1 | `/admin/login` · `/admin/password` | 로그인 · 비밀번호 | 공개(변경은 관리자) |
| A2 | `/admin` | 대시보드(전체 통계) | 관리자 |
| A3 | `/admin/store-applications` · `/admin/store-applications/[store_application_id]` | 입점 신청 관리 | 관리자 |
| A4 | `/admin/stores` · `/admin/stores/[store_id]` | 업체 관리 | 관리자 |
| A5 | `/admin/managers` · `/admin/managers/[user_id]` | 업체 관리자 계정 | 관리자 |
| A6 | `/admin/users` · `/admin/users/[user_id]` | 이용자 관리 | 관리자 |

★ 고정 주소 — SMS 링크가 연다(이름을 바꾸지 않는다). 로그인 안 돼 있으면 로그인 뒤 그 주소로 돌아온다.

## 화면 구성과 쓰는 API
(화면마다: 시안 · 구성 · 들어올 때 · 동작 · 화면 주의. API 상세는 api.md, 필드는 dto/)

### U3 예약 — `/stores/[store_id]/booking`
- 시안: 이용자 화면 아티팩트의 `U3 예약` 화면(상품 · 날짜 고르기 / 시간대 · 호수 고르기 / 결제 대기)
- 구성: 상단 업체 이름 · 판매 상품 탭(store 상세의 `plans`) → 날짜(연박이면 박수) → 객실 그룹 카드(availability 의 `room_group_name` · `price`) → 시간대 칩(`slots` — 첫 칸 `is_now` 1 이면 '지금 바로') → 호수 목록(`rooms` — `room_name` · `floor`) → 하단 금액 · 예약하기 버튼
- 들어올 때: `GET /api/v1/user-service/discovery/store/:store_id` 로 판매 상품(시간 이용 · 1박 · 연박) · 영업시간을 받아 상품 · 날짜 고르기를 그린다.
- 상품 · 날짜(연박이면 박수, 그룹 거르기 선택)를 고르면: `GET /api/v1/user-service/reservation/availability`(store_id · date · room_plan_type_id · nights · room_group_id) → 객실 그룹 → 시간대(`slots` — `start_at` · `end_at`, 오늘 시간 이용의 첫 칸은 `is_now` 1 '지금 바로') → 호수(`rooms`) 순으로 고른다.
- 예약하기(로그인 필요 — 안 돼 있으면 U5 뒤 이 화면으로): `POST /api/v1/user-service/reservation`(큐 — room_id · room_plan_type_id · date · `is_now` 또는 `start_time` · nights)
  - done → `payment_id` · `order_name` · `amount` 로 토스 결제창(orderId = `payment_id`), 결제 마감 `expires_at`(5분)
  - failed 400(그 사이 다른 예약이 잡힘 · 이용 제한 등) → `message` 를 띄우고 availability 를 다시 부른다
- 화면 주의: 회원 상태가 이용 제한(BLOCK) · 탈퇴 대기(LEAVE_WAIT)면 예약 버튼을 막는다(서버도 400).

### U4 결제 결과 — `/payments/success` · `/payments/fail`
- success: 토스가 붙여 준 `paymentKey` · `orderId` · `amount` → 프론트 서버(Next.js 라우트)가 토스 승인 → `POST /api/v1/user-service/reservation/payment-confirm`(큐 — `payment_id` = orderId · `payment_key`)
  - done `reservation_state_id` CONFIRMED → U7, CHECKED_IN(이미 시작한 예약 · 지금 바로) → U7 에서 바로 QR
  - failed 400 + `payment_error_code` → 안내 후 U3(5분이 지났으면 예약은 만료)
- fail: 토스 오류 안내 → U3

### U7 예약 1건 — `/reservation/[reservation_id]` ★
- 시안: 이용자 화면 아티팩트의 `U7 예약 1건` — 상태별 4장(결제 대기 · 이용 전 · 이용 중(QR) · 취소됨)
- 구성: 상태 띠(`reservation_state_name`) → 업체 · 호실 · 상품 · 시간 → 구간 목록(`segments` — 기본 · 연장, 구간마다 결제 상태 · 영수증) → 환불 안내 → 버튼 줄(QR 확인 · 취소 · 연장)
- 들어올 때: `GET /api/v1/user-service/reservation/:reservation_id` — 상태 · 호실 · 시간 · 금액 · 구간(`segments` — 기본 · 연장, 구간마다 결제) · 환불 마감(`refund_deadline_at` · `late_refund_percent`) · `is_room_disabled`.
- 상태가 CHECKED_IN(이용 중)이면: `GET /api/v1/user-service/reservation/:reservation_id/qr` → `qr` 를 QR 이미지로, `qr_ends_at` 까지 보여 준다(시작 전 · 끝난 뒤는 부르지 않는다).
- 취소: `PATCH /api/v1/user-service/reservation/:reservation_id/cancel`(큐) → done 이면 상세를 다시 조회. 환불 금액 안내는 `refund_deadline_at` 전 전액 · 뒤 `late_refund_percent`, `is_room_disabled` 1 이면 이용 중이어도 전액.
- 연장: 이용 중일 때 U9 로.

<!-- U1 · U2 · U5 · U6 · U8 · U9 · U10 · U11 · M1 ~ M8 · A1 ~ A6 도 같은 모양으로(build) — 로드맵 사용자 할 일의 '프론트' 줄 안내는 해당 화면의 "화면 주의" 로 옮긴다 -->
```

### D. 화면 설계 아티팩트(#128 ~ #130)

```text
만들기(build — screens.md 를 다 쓴 뒤):
1. Artifact publish — type_url https://claude.ai/artifact/QKN21svewxgyPb6SYRqWnd(Design), title, auto_open "after_first_write"
   - "roomless 이용자 화면"(#128 — 모바일 390px 화면) · "roomless 업체 관리자 콘솔"(#129 — PC 1440px) · "roomless 관리자 콘솔"(#130 — PC 1440px, 업체 관리자 콘솔과 같은 틀)
2. 생성 결과의 타입 지침(채우는 방법 · 먼저 읽을 페이지)을 따라 화면을 채운다 — 원본 데이터 파일은 .beaver/output/frontend/design/<user|manager|admin>/ 에 두고 같은 url 로 게시
3. 화면 = screens.md 의 키 하나(상태가 갈리면 상태별로 여러 장) — 화면 이름 "<키> <화면> — <주소>"(예: "U7 예약 1건(이용 중) — /reservation/[reservation_id]")
4. 화면 안 문구 · 값: 실제 필드 이름에 맞는 예시 값, 버튼 · 안내 문구는 한국어, 상태 · 종류 이름은 룩업 이름(예약 상태 '이용 중', 상품 '시간 이용' …), 입력 오류 예시는 DTO 의 한국어 메시지
5. 공통 토큰 — 디자인 시스템이 계정에 없다: 첫 아티팩트(이용자)에서 색 · 글꼴 · 간격 토큰을 정하고 나머지 둘이 같은 값을 쓴다
6. 정적 시안(눌러 보는 동작 없음) — 화면 간 이동은 screens.md 가 말한다

화면 목록(아티팩트별):
- 이용자: U1 지도(마커 · 목록 · 반경 줄이기 안내) · U2 업체 상세 · U3 예약(고르기 · 결제 대기) · U4 결제 성공 · 실패 · U5 로그인 · 가입 · 휴대폰 인증 · 아이디 찾기 · U6 내 예약(빈 목록 포함) · U7 예약 1건(결제 대기 · 이용 전 · 이용 중 QR · 취소됨) · U8 취소 동의 · U9 연장(가능 · 불가 사유) · U10 마이페이지(탈퇴 대기 안내) · U11 입점 신청(목록 · 작성 · 상세 — 승인되면 업체코드) · 이용 제한 안내 띠
- 업체 관리자: M1 로그인 · 계정 찾기 · 비밀번호 초기화 · 변경 · M2 대시보드 · M3 예약 현황(+ 업체 취소 · 호실 이동 · 이용 중 취소 요청 창) · M4 호실(+ 문 바로 열기 · 상태 변경) · M5 객실 그룹 목록 · 상세(사진 · 그룹 상품 · 기간 가격) · M6 업체 상품 설정 · M7 내 업체 설정(탭 — 소개 · 사진 · 영업시간 · 브레이크 · 정비 · 규정 · 일시 예약불가 · 문 시크릿) · M8 업체 관리자 목록 · 상세
- 관리자: A1 로그인 · 비밀번호 · A2 대시보드 · A3 입점 신청 목록 · 상세(승인 · 반려) · A4 업체 목록 · 상세 · A5 업체 관리자 계정 목록 · 상세 · A6 이용자 목록 · 상세(예약 이력 · 이용 제한)

붙이기: README.md 의 "아티팩트" 줄과 screens.md 각 화면의 "시안" 줄에 아티팩트 주소를 적는다.
```

### C. DTO 사본

```js
// scratchpad/gen-dto-docs.cjs — libs/contracts DTO 에서 Swagger 줄만 뺀 코드 블록으로 dto/<도메인>.md (저장소에 두지 않음)
// 사용: node gen-dto-docs.cjs <backend 루트> <출력 폴더> <기준 커밋>
const fs = require('fs');
const path = require('path');
const [root, out, commit] = process.argv.slice(2);

/** @nestjs/swagger import 와 @Api…(...) 데코레이터를 괄호 짝을 맞춰 지운다(여러 줄 포함) */
function stripSwagger(src) {
    let text = src.replace(/^import \{[^}]*\} from '@nestjs\/swagger';\n/m, '');
    let i;
    while ((i = text.search(/@Api[A-Za-z]*\(/)) >= 0) {
        let depth = 0;
        let j = text.indexOf('(', i);
        for (; j < text.length; j++) {
            if (text[j] === '(') depth++;
            else if (text[j] === ')' && --depth === 0) break;
        }
        const lineStart = text.lastIndexOf('\n', i) + 1;
        const lineEnd = text.indexOf('\n', j);
        const onlyDecorator = text.slice(lineStart, i).trim() === '' && text.slice(j + 1, lineEnd).trim() === '';
        text = onlyDecorator ? text.slice(0, lineStart) + text.slice(lineEnd + 1) : text.slice(0, i) + text.slice(j + 1);
    }
    return text
        .replace(/'@app\/common\/dto\/pagination\.dto\.js'/g, "'../../common/pagination.dto'")
        .replace(/from '\.\.\/\.\.\/actor\.js'/g, "from '../../common/actor'")
        .replace(/from '(\.{1,2}\/[^']+)\.js'/g, "from '$1'");
}

const contracts = path.join(root, 'libs/contracts/src');
for (const domain of fs.readdirSync(contracts)) {
    const dir = path.join(contracts, domain, 'dto');
    if (!fs.existsSync(dir)) continue;
    const parts = [`# DTO — ${domain}\n`, `> \`libs/contracts/src/${domain}/dto/\` 에서 Swagger 데코레이터만 뺀 사본(기준 커밋 ${commit}). class-validator 검증 · 한국어 메시지는 그대로다. 이후 바뀐 DTO 는 changes/ 로 온다.\n`];
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts')).sort()) {
        parts.push(`## ${domain}/dto/${file}\n\n\`\`\`ts\n${stripSwagger(fs.readFileSync(path.join(dir, file), 'utf8')).trim()}\n\`\`\`\n`);
    }
    fs.writeFileSync(path.join(out, `${domain}.md`), parts.join('\n'));
}
```

```md
<!-- .beaver/output/frontend/dto/common.md — 손으로(원문에서 Swagger 줄만 뺀 코드) -->
# DTO — 공통
## common/pagination.dto.ts          ← libs/common/src/dto/pagination.dto.ts
## common/fail-result.dto.ts         ← libs/common/src/dto/global.result.dto.ts (ApiFailResultDto · ValidationErrorResultDto)
## common/roles.ts                   ← libs/contracts/src/roles.ts (AUTH_ID · LOGIN_SCOPE)
## common/sse.ts                     ← libs/contracts/src/message-envelope.ts 의 COMMAND_STREAM_EVENT
## common/reservation.constants.ts   ← libs/contracts/src/reservation/reservation.constants.ts
## common/actor.ts                   ← libs/contracts/src/actor.ts 의 Actor 만(store 신청 DTO 가 import)
## 룩업 값 표 — libs/database/src/seeder/seeder.targets.ts: 권한 · 회원 상태 · SNS · 업체 상태 · 입점 신청 상태 · 파일 용도 · 호실 상태 · 상품 종류 · 예약 상태 · 구간 종류 · 취소 요청 상태 · 결제 상태 (ID · 한국어 이름)
```

### E. README.md(목차) · changes/README.md

```md
<!-- .beaver/output/frontend/README.md -->
# roomless 프론트 인계

기준: 백엔드 커밋 <build 때 HEAD>(2026-11-10). 이후 바뀐 것은 `changes/` 로 온다.
아티팩트(시안)와 이 지침서를 함께 보고 만든다 — 화면 모양은 아티팩트, 주소 · 구성 · API 는 지침서.

아티팩트(화면 설계 — 화면 이름이 screens.md 의 키 · 주소):
- 이용자 화면: <url>
- 업체 관리자 콘솔: <url>
- 관리자 콘솔: <url>

1. `screens.md` — 화면 목록과 주소, 화면 구성과 쓰는 API
2. `api.md` — API 목록과 호출 방식(107개)
3. `dto/` — 요청 · 응답 DTO(Swagger 데코레이터만 뺀 사본)
4. `changes/README.md` — 수정 요청 목록(위에서부터 차례로 반영)
```

```md
<!-- .beaver/output/frontend/changes/README.md -->
# 프론트 수정 요청

백엔드가 공개 API(주소 · 요청 · 응답 · 실패 · 동기/큐)나 사용자에게 보이는 동작을 바꾸면 같은 커밋에 문서 한 건이 생긴다. 위에서부터 차례로 반영한다.

| 날짜 | 문서 | 영향 화면 | 백엔드 커밋 |
|---|---|---|---|
| 2026-11-10 | 처음 인계(`../screens.md` · `../api.md` · `../dto/`) | 전체 | <build 때 HEAD> |

## 문서 틀 — `changes/<YYYY-MM-DD>-<기능>.md`
- 바뀐 이유(한두 줄) · 반영 순서(백엔드 배포 먼저 / 함께 / 상관없음)
- 영향 화면(screens.md 키 · 주소)
- API 변경 — 추가 · 변경 · 삭제(메서드 · 주소 · 방식 · 바뀐 점)
- 화면별 API 조합 변경 — 무엇을 부르고 · 막고 · 어디로 보내는지(배치 · 디자인은 쓰지 않는다)
- 바뀐 DTO — Swagger 데코레이터를 뺀 새 코드 전체(지운 DTO 는 "삭제")
```

### G. 내 정보 API(#131)

```ts
// libs/contracts/src/user/dto/user-me.dto.ts — 입력 없음(로그인 회원은 actor)
export class UserMeResultDto {
    user_id: string; user_search_code: string; nickname: string; gender: string; birth: string;
    sns_id: string | null; phone: string | null; is_phone_verified: number;
    state_id: string; block_comment: string | null; leave_reserved_at: string | null; created_at: string;
}

// apps/user-service/src/user/user.service.ts
/** 내 정보 — 로그인한 이용자 본인의 회원 정보(마이페이지). (내부 HTTP: GET /internal/v1/user-service/user/me) */
async getMe(user_id: string): Promise<UserMeResultDto> {
    const user = await this.userRepository.findUser({user_id, login_scope: LOGIN_SCOPE.USER});
    if (!user) {
        throw new NotFoundException({message: USER_NOT_FOUND_MESSAGE});
    }
    return toUserMeResult(user); // user.util.ts — 휴대폰 인증 여부는 phone_verified_at 로, 가입일 ISO
}

// user-service controllers/user.controller.ts
@Get('/me') @HttpCode(200) getMe(@InternalActor('user_id') user_id: string) → userService.getMe(user_id)
// gateway controllers/user.controller.ts
@Get('/me') @UseGuards(PassportJwtAuthGuard) @HttpCode(200) @ApiBearerAuth() @ApiOperation({summary: '내 정보'}) @ApiOkResponse({type: UserMeResultDto}) …
getMe(@PassportActor() actor: Actor) → internalHttp.request('user', 'GET', USER_INTERNAL_PATH.ME, {actor})
```

### F. 규칙 — AGENTS.md · 메모리 · 로드맵 · README

```md
<!-- AGENTS.md — "## 실시간 소켓" 절 다음 -->
## 프론트 연계

- **프론트는 별도 저장소**(Next.js 앱 하나 — `/` 이용자 · `/manager` 업체 관리자 · `/admin` 총관리자 · 관리자, 사용자 결정 2026-11-10). 인계 자료는 화면 설계 아티팩트 3개(이용자 · 업체 관리자 · 관리자 — 링크는 README) + 지침서 `.beaver/output/frontend/` — 화면 목록과 주소 · 화면 구성과 쓰는 API `screens.md`, API 목록과 호출 방식 `api.md`, DTO 사본 `dto/`, 아티팩트 원본 `design/`, 수정 요청 `changes/`. 서버 구성 · 환경 설정은 싣지 않는다. 아티팩트는 처음 한 번만 만들고, 그 뒤 화면은 프론트 세션이 만든다.
- **공개 API(주소 · 요청 · 응답 · 실패 · 동기/큐)나 사용자에게 보이는 동작이 바뀌면 같은 변경에서 `.beaver/output/frontend/changes/<YYYY-MM-DD>-<기능>.md` 를 만들고 `changes/README.md` 목록에 한 줄 더한다** — 바뀐 이유 · 영향 화면 · API 변경 · 화면별 API 조합 변경 · 바뀐 DTO 코드(`@nestjs/swagger` import · `@Api…` 데코레이터만 뺀 사본) · 반영 순서. 화면 배치 · 디자인은 쓰지 않는다. 기획이 plan 파일 목록에 넣고, build 가 쓰고, ship 리뷰가 빠졌는지 본다. 내부 API · 응답이 같은 리팩터링은 대상이 아니다.
- 고정 주소: SMS 링크가 여는 `/reservation/<예약 ID>` · `/reservation/<예약 ID>/cancel-request` 를 바꾸면 수정 요청 문서로 알린다.

<!-- Checklist 끝 -->
- [ ] 프론트 연계: 공개 API · 사용자 동작이 바뀌면 `.beaver/output/frontend/changes/<날짜>-<기능>.md` + 목록 한 줄
```

```md
<!-- .beaver/memory/frontend.md (+ MEMORY.md 색인 한 줄) -->
# frontend

## 공개 API · 동작이 바뀌면 프론트 수정 요청 문서를 같이 만든다
- Rule: 공개 API(주소 · 요청 · 응답 · 실패 · 동기/큐)나 사용자에게 보이는 동작을 바꾸는 기능은 `.beaver/output/frontend/changes/<YYYY-MM-DD>-<기능>.md` 를 같은 변경에서 만들고 `changes/README.md` 목록에 한 줄 더한다. 기획은 plan 파일 목록에 넣고, build 가 쓰고, ship 리뷰가 확인한다. 화면 설계는 쓰지 않는다. 인계 자료는 화면 설계 아티팩트 + 지침서(API 목록과 호출 방식 · 화면 목록과 주소 · 화면 구성과 쓰는 API · DTO)만 — 서버 구성 · 환경 설정은 넣지 않는다. 아티팩트는 처음 한 번만 만든다.
- Scope: global
- Rationale: User decision 2026-11-10 — "이제부터 기능 수정되는 것들에 대한 프론트 수정 요청 자료도 같이 만들어야해. 초기 아티팩트 이후로는 화면을 프론트 세션에서 만들거니, 기능에 대한 수정지침만 만들 수 있도록 연계되면 됨" · "api 종류, 필요한 화면 목록과 사용할 주소, 각 페이지마다 어떤 api들이 조합되서 사용되어야 하는지" · "아티팩트도 같이 만들어서 첨부해야 프론트가 아티팩트 + 지침서를 보고 그대로 만들지"
- AGENTS.md application: applied (AGENTS.md "프론트 연계" 절 — Phase 27 build)
- Priority: takes precedence over AGENTS.md/defaults
```

```md
<!-- 로드맵 사용자 할 일 — '프론트' 줄을 한 줄로(내용은 screens.md 화면 주의로 옮김) -->
- 사용자 — 프론트: 아티팩트 3개 + `.beaver/output/frontend/`(README 에 링크 · 화면 목록과 구성 · API 목록 · DTO)를 프론트 세션에 넘긴다. 이후 변경은 `changes/` 로 온다

<!-- README.md — 한 줄 -->
- 프론트 인계 · 수정 요청: `.beaver/output/frontend/`(공개 API · 동작이 바뀌면 `changes/` — AGENTS.md "프론트 연계")
```

---

## Test Cases

```
`user-me.spec.ts`(동기 경로 — 내 정보): [SUCCESS] 로그인 이용자 본인을 이용자 그룹 조건(`{user_id, login_scope: USER}`)으로 찾아 내 정보로 돌려준다(미인증이면 `phone` null · `is_phone_verified` 0, 가입일 ISO) / 휴대폰 인증 · 이용 제한 회원이면 번호 · `is_phone_verified` 1 · `block_comment` / 탈퇴 대기면 `leave_reserved_at` 그대로, [FAIL:service] 조회 null 이면 404 "회원 정보를 찾을 수 없습니다.", [SECURITY] 게이트웨이 내부 토큰이 없으면 403 · 조회 없음
테스트 생략(문서만): 인계 문서 · 수정 요청 규칙 · AGENTS.md · 메모리 — 문서 쪽은 코드 변경이 없다. DTO 사본은 build 때 임시 변환 스크립트(저장소 밖)로 만들고, 사본을 모은 임시 폴더에서 `tsc --noEmit`(class-validator · class-transformer 만 설치)으로 문법 · import 를 확인한다
```

build 때 확인(테스트 대신):
- `gen-api-md.cjs` — 도메인 표에 107개가 모두 들어가고, screens.md 가 107개 API 를 모두 어느 화면엔가 쓰는지(빠진 API · 없는 API 가 있으면 던진다).
- DTO 사본을 저장소 안 임시 폴더(`.tmp-contracts/`, 끝나면 지움)에 파일로 펼쳐 `npx tsc --noEmit` — 문법 · import, 사본에 `@nestjs/swagger` · `@Api` 가 남지 않았는지 grep.
- `npm run typecheck` 한 번(바뀌는 코드 없음 확인).
- 아티팩트 3개 — 게시 뒤 Artifact read 로 화면 이름을 뽑아 screens.md 의 키(U1 ~ A6)가 모두 있는지 대조, README · screens.md 의 링크가 그 주소인지 확인.

---

## Response Codes

새 API 하나 — 내 정보:

| Entry | 200 | 401 | 403 | 404 |
|---|---|---|---|---|
| `GET /api/v1/user-service/user/me` | `UserMeResultDto` | 이용자 토큰 아님 · 만료(게이트웨이) | 내부 토큰 없음(서비스 직접 호출) | 이용자 회원 없음 |

문서 결과 계약:

| Entry | 결과 |
|---|---|
| `screens.md` | 화면 25개(U1 ~ U11 · M1 ~ M8 · A1 ~ A6)의 주소와 화면 구성 · 쓰는 API — 107개를 빠짐없이 쓴다 |
| 아티팩트 3개 | screens.md 의 화면 키 · 주소 · 구성을 그린 시안 — 링크는 README · screens.md |
| `api.md` · `dto/` | API 107개 목록과 요청 · 응답 DTO 사본 |
| `changes/README.md` + AGENTS.md · 메모리 | 이후 기능 변경마다 수정 요청 문서가 같은 커밋으로 생긴다 |
