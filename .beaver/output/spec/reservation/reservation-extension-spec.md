---
# One-line feature summary (e.g. "Admin user sign-up")
feature_goal: "연장(Phase 26) — 이용 중 예약의 끝 시각에 이어 붙여 늘린다: 시간 이용 · 1박은 업체 이용 시간만큼(시간 이용 요금), 연박은 하루(1박 요금 · 최대 박수까지). 업체가 상품별로 연장 가능 여부 · 최대 횟수(기본 가능 · 3회, 최대 10회)를 정한다. 신청 즉시 구간을 잡아 두고 5분 안에 결제, 결제하지 않으면 만료되고 그 예약은 다시 연장할 수 없다"

# Domain/module name (see AGENTS.md for the project directory structure)
domain: "reservation — user-service reservation(조회 · 신청 · 결제 확인 · 취소 정리) · scheduler reservation(결제 대기 만료 · 이용 종료 대기), room — admin-service room(업체 상품 설정에 연장 설정) · store(입점 승인 기본값), discovery — user-service discovery(업체 상세의 상품 설정), libs/database(t_room_plan 컬럼 2 · CHECK · 부분 유니크 1)"

# Entry-point method/endpoint. Record the entry-point identifier this project actually uses,
#   derived from code evidence (path:line), in the project's own naming. Do not assume a
#   particular position's syntax. (key name "api_method" stays as-is)
api_method: "동기 GET 연장 조회 · 큐 user.reservation.extend(신청) · 기존 변경(결제 확인 user.reservation.payment-confirm · 결제 대기 만료 crontab · 이용 전환 crontab · 이용자 취소 · 이용 중 취소 승인 · 업체 상품 설정 조회 · 수정 admin.room.plan-update · 입점 승인 · 업체 둘러보기 상세)"

# Path/signature (e.g. "/api/v1/user/admin/sign")
#   Record the path or signature this project actually uses, from code evidence (path:line),
#   in the project's own naming. (key name "api_path" stays as-is)
api_path: "GET /api/v1/user-service/reservation/:reservation_id/extension · POST /api/v1/user-service/reservation/:reservation_id/extension · (변경) GET · PATCH /api/v1/admin-service/room/plan(/:room_plan_type_id) · GET /api/v1/user-service/discovery/store/:store_id"

# Affected state — write/persist targets. Basis for sizing the test cases. (key name "affected_data" stays as-is)
#   Record the state this project actually writes/persists, derived from code evidence (path:line),
#   in the project's own naming. Read-only reads are not "write" but are still data. Leave empty if none.
affected_data:
  - "t_payment — 연장 결제(READY → DONE · EXPIRED · REFUND_REQUESTED)"
  - "t_reservation_detail — 연장 구간(EXTENSION, PENDING → CONFIRMED · EXPIRED · CANCELED), 결제 대기 구간은 예약당 1개(새 부분 유니크)"
  - "t_reservation — 신청 때 blocked_until(새 끝 + 정비시간 — 잡아 두기), 확정 때 end_at · total_price, 만료 때 blocked_until 되돌림"
  - "t_room_qr · Redis door-qr:<room_id> — 확정 때 QR 유효 끝을 새 끝으로"
  - "t_room_plan — 연장 가능 여부(is_extendable) · 최대 연장 횟수(max_extensions 1 ~ 10) 추가, 입점 승인 · 기존 행 기본 가능 · 3회"
---

## Feature Description

이용 중인 예약을 같은 호실에서 끝 시각에 이어 붙여 늘린다. 시간 이용 · 1박은 업체 이용 시간(예: 4시간)만큼 시간 이용 요금으로, 연박은 하루씩 1박 요금으로 늘리고, 업체가 상품별로 연장 가능 여부 · 최대 횟수를 정한다.
신청하면 구간을 바로 잡아 두고 결제 정보를 주며, 5분 안에 결제가 확인되면 끝 시각 · 합계 · QR 이 늘어난다. 결제하지 않으면 만료되고 그 예약은 다시 연장할 수 없다.
결제 전에 '연장하면 몇 시까지 · 얼마'를 보여 주는 조회 API 를 둔다.

## API Spec

### 1. 연장 조회 (동기 — 잡아 두지 않는다)
- Method: GET (이용자 가드)
- Path: `/api/v1/user-service/reservation/:reservation_id/extension` → 내부 `/internal/v1/user-service/reservation/:reservation_id/extension`
- Request: path `reservation_id`(32자 hex)
- Response 200: `{reservation_id, is_extendable: 0 | 1, reason: string | null, room_plan_type_id: string | null(요금 상품 — HOURLY · NIGHT), start_at: string | null(= 지금 끝), end_at: string | null(새 끝), amount: number | null}`
  - 연장할 수 없으면 `is_extendable: 0` + `reason`(한국어 문구 — 아래 판정 표), 계산할 수 있는 값은 채우고 나머지는 null
- 실패: 400 검증 · 401 · 404 내 예약 아님 · 500

### 2. 연장 신청 (큐 — `user.reservation.extend`, SSE)
- Method: POST (이용자 가드)
- Path: `/api/v1/user-service/reservation/:reservation_id/extension`
- Request: path `reservation_id`(본문 없음)
- Response done: `{reservation_id, reservation_detail_id, payment_id(토스 orderId), order_name, amount, expires_at(결제 대기 5분), start_at, end_at}`
- 하는 일(한 트랜잭션): 판정(조회와 같은 표 — 불가면 400 그 문구) → 결제(READY) → 연장 구간(EXTENSION · PENDING · 5분) → 예약 `blocked_until` = 새 끝 + 예약의 정비시간(잡아 두기 — 다음 예약과 겹치면 배타 제약이 400 `이미 예약된 시간입니다.`)
- 주문명: `<상호명> <호실명> 연장 <n>시간` · `… 연장 1일`

### 3. 결제 확인 (기존 `POST /api/v1/user-service/reservation/payment-confirm`)
- 결제의 구간이 연장(EXTENSION)이면:
  - 결제됨 + 구간 결제 대기 + 예약 확정 · 이용 중 → 결제 DONE · 구간 CONFIRMED · 예약 `end_at` = 새 끝 · `total_price` += 연장 금액(예약 끝이 연장 시작과 같을 때만 — 상태 조건). 이용 중이면 `t_room_qr.ends_at` = 새 끝, Redis 현재 QR 다시 쓰기(마지막). 결과 `{reservation_id, reservation_state_id}`
  - 금액 불일치 · 이미 결제 대기가 끝난 연장(만료 · 취소) · 예약이 끝났거나 취소됨 → 토스 금액 전액 환불 신청 + (아직 결제 대기면) 구간 만료 · 잡아 둔 구간 되돌림, 커밋 뒤 실패 반환(기존과 같다)
- 기본 구간(BASE)은 지금 그대로.

### 4. 결제 대기 만료 (기존 scheduler `reservation.payment-expire`, 1분)
- 연장 구간도 대상(결제 대기 · 만료 시각 지남 · 결제 READY). 토스 조회로:
  - 결제됨 → 위 3 의 확정과 같다(DB — `t_room_qr.ends_at` 포함, Redis 는 QR 동기화 crontab 이 1분 안에 맞춘다)
  - 금액 불일치 → 환불 신청 + 구간 만료 + 되돌림
  - 미결제 → 결제 · 구간 만료 + 되돌림(`blocked_until` = 지금 끝 + 정비시간)

### 5. 그 밖의 기존 변경
- 이용 종료(scheduler `reservation.usage`): 결제 대기 중인 연장이 있는 예약은 끝 시각이 지나도 이용 완료로 바꾸지 않고 결제 결과를 기다린다(최대 5분 — 만료되면 다음 회차에 끝난다).
- 이용자 취소(사용중지 호실) · 이용 중 취소 승인: 결제 대기 중인 연장 구간은 취소(CANCELED)하고 그 결제는 만료(환불 없음 — 늦은 승인은 기존 재확인 crontab 이 환불한다). 확정된 연장 구간은 기본 구간과 같이 환불한다(지금도 구간마다 환불).

### 6. 업체 상품별 연장 설정 (기존 업체 상품 설정 — admin-service room, 업체 관리자)
- `t_room_plan`(업체 × 상품 종류 1행)에 두 컬럼을 더한다(사용자 결정 2026-11-09):
  - `is_extendable` smallint — 연장 가능 여부(0 · 1), 기본 1
  - `max_extensions` smallint — 최대 연장 횟수(1 ~ 10), 기본 3. CHECK `CHK_RoomPlan_MaxExtensions`(1 ~ 10). 연장 불가로 바꿔도 값은 남는다(다시 켜면 그대로)
- 수정 `PATCH /api/v1/admin-service/room/plan/:room_plan_type_id`(큐 `admin.room.plan-update`): 본문에 `is_extendable`(0 · 1) · `max_extensions`(1 ~ 10 정수)를 필수로 더한다(모든 종류 공통 — 통째로 보내는 설정).
- 조회 `GET /api/v1/admin-service/room/plan`: 항목에 `is_extendable` · `max_extensions`.
- 입점 승인: 상품 종류 3행 모두 연장 가능 · 3회. 이미 있는 업체는 마이그레이션이 같은 기본값(DB 기본값)으로 채운다.
- 업체 둘러보기 상세 `GET /api/v1/user-service/discovery/store/:store_id` 의 상품 설정 항목에도 `is_extendable` · `max_extensions` 를 넣는다(이용자가 예약 전에 본다).

## Business Rules

- **연장 단위 · 요금**(사용자 결정 2026-11-09)
  - 시간 이용 · 1박 예약 → 지금 끝 + 업체 시간 이용 상품의 이용 시간(`t_room_plan.usage_hours`), 요금은 그 객실 그룹의 시간 이용 요금
  - 연박 예약 → 지금 끝 + 1일(퇴실 시각 그대로), 요금은 그 객실 그룹의 1박 요금, 연장 뒤 박수가 업체 연박 최대 박수 이하일 때만
  - 금액은 연장 시작 날짜(한국 날짜)의 기간 가격 — 없으면 기본 요금(예약 금액 계산과 같은 규칙)
  - 요금 상품을 팔아야 한다 — 업체 상품 설정 사용 중 + 그 그룹 상품 판매 중(사용 · 요금 > 0)
- **언제** — 이용 중에만: 확정 · 이용 중 예약의 시작 ≤ 지금 < 끝(사용자 결정 2026-11-09). 한 번에 한 단위, 확정되면 다시 연장할 수 있다 — 업체 설정의 최대 횟수까지.
- **업체 연장 설정** — 예약의 상품(시간 이용 · 1박 · 연박 — 기본 구간의 상품) 행의 `is_extendable` · `max_extensions` 를 본다(1박 예약은 시간 이용 요금으로 늘리지만 설정은 1박 행). 횟수 = 그 예약의 확정된 연장 구간 수. 연장할 때의 지금 설정을 본다 — 업체가 끄거나 줄이면 이용 중인 예약도 바로 따른다(사용자 결정 2026-11-09 — 연장은 앞으로 일어날 일).
- **잡아 두기** — 신청 즉시 예약의 점유 끝(`blocked_until`)을 새 끝 + 정비시간으로 늘린다(다른 예약이 못 들어온다 — 배타 제약). 다음 예약과 겹치면 연장 불가(정비시간 포함, 맞닿음은 된다).
- **결제 대기 5분** — 결제하지 않으면 만료되고 잡아 둔 구간을 되돌린다. **결제하지 않아 만료된 연장이 있는 예약은 다시 연장할 수 없다**(사용자 결정 2026-11-09).
- **결제 대기 중인 연장은 예약당 1개** — 판정 + DB 부분 유니크(결제 대기 구간 예약당 1행).
- **연장 가능 판정**(조회 사유 · 신청 400 공통) — 위에서부터 첫 사유:
  1. 이용 중 아님(시작 전 · 끝남 · 취소 · 결제 대기) → `이용 중인 예약만 연장할 수 있습니다.`
  2. 결제하지 않아 만료된 연장이 있음 → `결제하지 않은 연장이 있어 더 연장할 수 없습니다.`
  3. 결제 대기 중인 연장이 있음 → `결제 대기 중인 연장이 있습니다.`
  4. 업체 영업중 아님 · 호실 사용중지 → `지금은 연장할 수 없습니다.`
  5. 예약 상품이 연장 불가(업체 설정) → `연장할 수 없는 상품입니다.`
  6. 확정된 연장이 최대 횟수에 닿음 → `연장은 최대 n회까지 할 수 있습니다.`
  7. 요금 상품을 팔지 않음 → `연장 상품을 팔지 않는 업체입니다.`
  8. 연박 최대 박수 초과 → `연박은 최대 n박까지 연장할 수 있습니다.`
  9. 연장 구간이 영업시간 밖 · 브레이크와 겹침 · 일시 예약불가와 겹침 → `연장할 수 없는 시간입니다.`
  10. 다음 예약과 겹침(연장 끝 + 정비시간) → `다음 예약이 있어 연장할 수 없습니다.`
- **영업시간 규칙** — 시간 단위 연장(시간 이용 · 1박)은 연장 구간 전체가 영업시간 안 · 브레이크와 안 겹침(시간 이용 예약 규칙), 연박 하루 연장은 새 퇴실 시각이 영업시간 안 · 브레이크 밖(연박 예약의 퇴실 규칙). 24시간 업체는 영업시간을 보지 않는다(브레이크는 본다). 예약 가능 요일 · 예약 가능 기간 · 즉시 입실(30분) 조건은 보지 않는다 — 이미 이용 중인 호실이다.
- **구간 기록** — 연장마다 `t_reservation_detail` 1행(EXTENSION — 상품 = 요금 상품, 시작 = 지금 끝, 끝 = 새 끝, 금액) + 결제 1행. 기본 구간과 함께 내 예약 상세의 구간 목록에 나온다(사용자 결정 — 기록은 기본 + 연장).
- **정비시간은 마지막 연장 뒤로** — 확정된 예약의 `blocked_until` = 새 끝 + 예약 때 정비시간.
- **환불** — 이용 중 예약은 이용자가 취소할 수 없으므로(사용중지 호실 · 업체 동의 취소 예외) 연장 결제도 그 규칙을 따른다 — 두 예외 모두 확정된 연장까지 100% 환불.

## TDD Cases

- [CASES:extension-stay] 시간 이용 14:00 ~ 16:00(이용 시간 4) → 16:00 ~ 20:00 · 시간 이용 요금
- [CASES:extension-stay] 시간 이용 14:00 ~ 20:00(한 번 연장한 뒤) → 20:00 ~ 다음 날 00:00
- [CASES:extension-stay] 시간 이용 22:00 ~ 02:00 → 02:00 ~ 06:00 · 요금 날짜는 연장 시작일(다음 날)
- [CASES:extension-stay] 1박 21:00 ~ 다음 날 09:00 → 09:00 ~ 13:00 · 시간 이용 요금
- [CASES:extension-stay] 연박 11/10 15:00 ~ 11/12 11:00(2박) → 11/12 11:00 ~ 11/13 11:00 · 1박 요금 · 연장 뒤 3박
- [CASES:extension-stay] 연장 시작일이 기간 가격 안 → 기간 요금
- [CASES:extension-stay] 연장 시작일이 기간 가격 밖(전날까지) → 기본 요금
- [CASES:extension-judge] 확정 · 시작 전 → 불가 `이용 중인 예약만 연장할 수 있습니다.`
- [CASES:extension-judge] 이용 중 · 지금 = 끝 정각 → 불가(이용 중 아님)
- [CASES:extension-judge] 취소 · 이용 완료 · 결제 대기 → 불가(이용 중 아님)
- [CASES:extension-judge] 만료된 연장 구간이 있음 → 불가 `결제하지 않은 연장이 있어 더 연장할 수 없습니다.`
- [CASES:extension-judge] 결제 대기 중인 연장 구간이 있음 → 불가 `결제 대기 중인 연장이 있습니다.`
- [CASES:extension-judge] 업체 영업중 아님 · 호실 사용중지 → 불가 `지금은 연장할 수 없습니다.`
- [CASES:extension-judge] 예약 상품(시간 이용) 행 연장 불가 → 불가 `연장할 수 없는 상품입니다.`
- [CASES:extension-judge] 1박 예약 · 1박 행 연장 가능 · 시간 이용 행 연장 불가 → 가능(설정은 예약 상품 행)
- [CASES:extension-judge] 확정 연장 3회 · 최대 3회 → 불가 `연장은 최대 3회까지 할 수 있습니다.`
- [CASES:extension-judge] 확정 연장 2회 · 최대 3회 → 가능
- [CASES:extension-judge] 업체 시간 이용 미판매 · 그룹 시간 이용 요금 0 → 불가 `연장 상품을 팔지 않는 업체입니다.`
- [CASES:extension-judge] 연박 2박 · 최대 2박 → 불가 `연박은 최대 2박까지 연장할 수 있습니다.`
- [CASES:extension-judge] 연장 구간이 영업 끝(22:00)을 넘음 · 브레이크와 겹침 · 일시 예약불가와 겹침 → 불가 `연장할 수 없는 시간입니다.`
- [CASES:extension-judge] 다음 예약 시작 < 연장 끝 + 정비시간 → 불가 `다음 예약이 있어 연장할 수 없습니다.`
- [CASES:extension-judge] 다음 예약 시작 = 연장 끝 + 정비시간(맞닿음) → 가능
- [CASES:extension-judge] 24시간 업체 · 영업시간 밖 시각 → 가능(브레이크만 본다)
- [FAIL:validation] 연장 조회 · 신청 — 예약 ID 형식 → 400
- [FAIL:validation] 업체 상품 설정 수정 — 연장 가능 여부 없음 · 0 · 1 밖, 최대 연장 횟수 없음 · 0 · 11 · 소수 → 400
- [FAIL:duplicate] 연장 신청 — 다음 예약과 겹침(배타 제약 EXC_Reservation_RoomIdBlockedRange) · 결제 대기 구간 부분 유니크 위반(겹친 신청) → 400
- [SMOKE:data-access] 결제 대기 만료 대상(연장 구간 포함 — 구간 종류 · 예약 끝 · 합계 · 정비시간) · 이용 종료 대상(결제 대기 연장 제외 NOT EXISTS) · 연장 판정 재료(그 호실의 다른 점유 예약 · 그 예약의 연장 구간)
- 테스트 생략(위임형): gateway 라우트 · contracts 경로 상수 · 모듈 등록 — 프로젝트 규칙상 gateway · controller spec 을 두지 않는다

## Notes

- 근거 코드
  - 예약 생성 · 결제 · 구간: `apps/user-service/src/reservation/reservation.service.ts` `createReservation` · `confirmPayment`, 재고 판정 `isStayBookable` · `isWithinStoreHours` · 금액 `calculateStayPrice`(reservation.util.ts)
  - 구간 · 결제 1:1 · 연장 구간 종류는 Phase 16 스키마에 이미 있다(`t_reservation_detail` EXTENSION · `UK_ReservationDetail_PaymentId`). `t_room_plan.usage_hours` 주석 "1회 이용 · 연장이 이 시간만큼".
  - 결제 대기 만료: `apps/scheduler/src/reservation/crontabs/reservation-payment-expire.crontab.ts` · repository `buildExpiredPendingQuery`(지금은 기본 구간만) · `transitionPending`(예약 PENDING 조건)
  - 늦은 승인 재확인 crontab 은 결제 단위라 연장 결제에도 그대로 맞다(만료된 결제가 승인되면 환불 신청).
- 연장은 이용 중에만이라 업체 취소(시작 전만) · 호실 이동(시작 전만)과 겹치지 않는다.
- 결제 대기 중 끝 시각이 지나면 Redis 현재 QR 이 끝 시각에 만료되어 그 사이 문이 안 열린다 — 확정되면 다시 쓴다(user-service 결제 확인은 즉시, scheduler 확정은 QR 동기화가 1분 안에).
- 프론트: 예약 1건 화면의 '연장' — 조회로 새 끝 · 금액을 보여 주고, 신청 결과의 `payment_id` 로 토스 결제창 → 기존 결제 확인 API.

## Proposals (Codebase-Based)

- [x] 연장 결제는 기존 결제 확인 API · 결제 대기 만료 crontab 을 그대로 쓰고 구간 종류(EXTENSION)로 가른다 — 결제 흐름이 하나로 남는다(`confirmPayment` · `ReservationPaymentExpireCrontab`)
- [x] 잡아 두기는 예약 행의 `blocked_until` 을 늘려 기존 배타 제약(`EXC_Reservation_RoomIdBlockedRange`)이 겹침을 막게 한다 — 새 잠금 · 새 표가 필요 없다
- [x] 결제 대기 구간 예약당 1개를 DB 부분 유니크(`UK_ReservationDetail_ReservationIdPending`)로 — 겹친 신청을 판정만으로는 막지 못한다
- [x] 연장 판정은 기존 재고 판정의 영업시간 · 브레이크 · 일시 예약불가 · 점유 비교를 재사용하고, 즉시 입실 · 예약 가능 기간 · 요일 조건만 뺀다

## Decisions

- [x] 시간 이용 · 1박은 업체 이용 시간 단위(시간 이용 요금), 연박은 1일 단위(1박 요금 · 연박 최대 박수까지)(사용자 결정 2026-11-09)
- [x] 연장은 지금 끝에서 이어 붙인다 — 여러 번 가능, 구간 기록은 기본 + 연장(사용자 결정 2026-11-09 — 예: 21:00 ~ 09:00 → 21:00 ~ 13:00, 14:00 ~ 16:00 → 14:00 ~ 20:00 → 14:00 ~ 24:00)
- [x] 이용 중에만 신청(사용자 결정 2026-11-09)
- [x] 다음 예약과 겹치면 불가 · 신청 즉시 잡아 두고 결제 · 5분 안에 결제하지 않으면 만료되고 그 예약은 다시 연장 불가(사용자 결정 2026-11-09)
- [x] 조회 API 도 둔다(사용자 결정 2026-11-09)
- [x] TDD — 연장 구간 · 금액, 연장 가능 판정(사용자 결정 2026-11-09)
- [x] 업체가 상품별로 연장 가능 여부 · 최대 연장 횟수를 정한다 — 기본 가능 · 3회, 최대 10회(사용자 결정 2026-11-09)
- [x] 연장 설정은 연장할 때의 지금 설정을 본다(예약에 저장하지 않는다 — 사용자 결정 2026-11-09)
