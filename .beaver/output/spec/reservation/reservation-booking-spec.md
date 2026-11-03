---
# One-line feature summary
feature_goal: "예약·결제(Phase 17) — 호실별 예약 가능 시간 조회 · 예약 생성(결제 대기 5분) · 결제 확인 · 이용자 취소(업체별 환불 마감 · 마감 뒤 환불 비율) · 내 예약 · 업체 예약 현황 · 업체 취소 · 호실 이동, 결제 대기 만료 · 늦은 승인 · 환불 crontab, 업체 환불 규정 · 연박 박수 설정"

# Domain/module name
domain: "reservation"

# Entry-point method/endpoint
api_method: "공개 9개(/api/v1/user-service/reservation — 동기 4 · 큐 5) + crontab 3개(scheduler) + 기존 API 변경 4개(업체 예약 · 환불 규정 · 업체 상품 설정 · 호실 · 객실 그룹 삭제)"

# Path/signature
api_path: "apps/user-service/src/reservation · apps/gateway/src/api/v1/user-service/reservation · apps/scheduler/src/reservation · libs/contracts/src/reservation"

# Affected state
affected_data: ["t_reservation · t_reservation_detail · t_payment (쓰기 시작 — 예약 · 결제 확인 · 취소 · 만료 · 환불)", "t_store (refund_deadline_hours → refund_deadline_minutes, + late_refund_percent)", "t_room_plan (+ min_nights · max_nights — 연박 행만)", "t_reservation (+ late_refund_percent)", "t_payment (CHK_Payment_Refunded — 부분 환불 허용)", "t_store · t_room · t_room_group · t_room_plan · t_room_group_plan(_price) · t_store_hour · t_store_break · t_store_unavailable_period (user-service 가 읽기)"]
---

## Feature Description

로드맵 Phase 17(#67 ~ #73 · #113) — 이용자가 호실과 시간을 골라 예약하고 토스로 결제한 뒤, 취소 · 환불되는 흐름 전체. 업체 관리자는 자기 업체 예약 현황을 보고 예약을 취소하거나 호실을 옮긴다.

- **예약 기능은 user-service 의 새 도메인 `reservation`** — 업체 · 객실 · 상품 · 영업시간(admin-service 가 쓰는 테이블)은 공유 DB 에서 같은 엔티티로 직접 읽는다(사용자 결정 2026-11-03 — admin-service 가 `t_user` 를 직접 쓰는 것과 같은 방식).
- **결제는 토스** — 결제창 · 승인은 프론트(Next.js), 서버는 결제 행을 만들고(주문번호 = `payment_id`) 토스 조회로 검증 · 환불한다(Phase 16 포트 `PAYMENT_GATEWAY`).
- **시간이 트리거인 일은 scheduler crontab** — 결제 대기 만료, 늦게 승인된 결제 환불, 환불 처리(백그라운드).
- **업체 설정 확장** — 환불 마감을 분 단위로, 마감 뒤 환불 비율, 연박 최소 · 최대 박수.

## Entry Point

| # | Method | Path (공개) | 경로 | 가드 | 하는 일 |
|---|---|---|---|---|---|
| 68 | GET | `/api/v1/user-service/reservation/availability` | 동기 | 없음 | 업체 · 날짜 · 상품(연박은 박수)으로 호실별 예약 가능 시간 · 요금 |
| 69 | POST | `/api/v1/user-service/reservation` | 큐 `user.reservation.create` | 이용자 | 예약 생성 — 결제 대기 5분, 결제 정보(주문번호 · 금액 · 주문명) 회신 |
| 113 | POST | `/api/v1/user-service/reservation/payment-confirm` | 큐 `user.reservation.payment-confirm` | 이용자 | 토스 승인 결과 대조 → 확정 |
| 70 | PATCH | `/api/v1/user-service/reservation/:reservation_id/cancel` | 큐 `user.reservation.cancel` | 이용자 | 이용자 취소(사유 필수) — 환불 규정대로 |
| 71 | GET | `/api/v1/user-service/reservation` · `/:reservation_id` | 동기 | 이용자 | 내 예약 목록(페이지) · 상세 — 결제 대기 만료 건은 숨김 |
| 72 | GET | `/api/v1/user-service/reservation/store` | 동기 | 매니저 | 내 업체 예약 현황(날짜 — 호실별) |
| 73 | PATCH | `/api/v1/user-service/reservation/:reservation_id/store-cancel` | 큐 `user.reservation.store-cancel` | 매니저 | 업체 취소(사유 필수) — 100% 환불 + 이용자 SMS |
| 73 | PATCH | `/api/v1/user-service/reservation/:reservation_id/room` | 큐 `user.reservation.room-change` | 매니저 | 호실 이동(같은 그룹) + 이용자 SMS |

crontab(scheduler — 운영 전용 · `JobLockService`):

| 이름 | 주기 | 하는 일 |
|---|---|---|
| `reservation-payment-expire` | 1분 | 결제 대기 5분이 지난 예약 — 토스 주문번호 조회로 확정 · 만료 · 환불 |
| `reservation-payment-recheck` | 5분 | 만료 · 취소된 결제 대기 건(30분 안) — 토스에서 늦게 승인됐으면 환불 신청 |
| `reservation-refund` | 1분 | 환불 신청(`REFUND_REQUESTED`) 결제 — 토스 취소(금액 지정) → 환불 완료 · 실패 |

기존 API 변경:

| API | 바뀌는 것 |
|---|---|
| `PUT /api/v1/admin-service/store/mine/reservation-policy`(#99) · 업체 상세 · 내 업체 상세 | `refund_deadline_hours` → `refund_deadline_minutes`(0 ~ 10,080), `late_refund_percent`(0 ~ 100) 추가 |
| `PATCH /api/v1/admin-service/room/plan/:room_plan_type_id`(#103) · 업체 상품 설정 조회 | 연박일 때 `min_nights` · `max_nights`(1 ~ 180, 최소 ≤ 최대) |
| `DELETE /api/v1/admin-service/room/:room_id` · `/group/:room_group_id` | 점유 중인 예약(결제 대기 · 확정 · 이용 중)이 있으면 400 |

- Request 예(예약 생성): `{"room_id": "…", "room_plan_type_id": "HOURLY", "date": "2026-11-10", "start_time": "13:30"}` · 연박 `{"room_plan_type_id": "LONG", "date": "2026-11-10", "nights": 3}`
- Response 예(예약 생성 done data): `{"reservation_id", "payment_id", "order_name", "amount", "expires_at", "start_at", "end_at"}` — 프론트는 `payment_id` 를 토스 orderId 로 결제창을 연다.

## Business Rules

### 재고 판정(가용성) — 조회 · 생성 공통

호실 1개 · 상품 1개 · 구간 1개가 예약 가능한 조건:

1. **업체** — `ACTIVE` · 지워지지 않음 · 영업중(`is_open = 1`).
2. **상품** — 업체 상품 설정(`t_room_plan`) 판매 + 그룹 상품(`t_room_group_plan`) 판매 · 요금 > 0. 그룹 · 호실은 지워지지 않음.
3. **호실** — 사용중지(`DISABLED`)가 아니다. 시작이 지금부터 30분 안이면(즉시 입실) 호실이 예약가능(`AVAILABLE`)일 때만.
4. **시작 시각** — 지금 이후, 예약 가능 기간(`booking_open_hours` — 지금부터 n시간) 안.
5. **예약 가능 요일** — 입실일(대실은 시작일)의 요일 비트가 `days_of_week` 에 있다. 숙박 · 연박도 입실일 하나만 본다(사용자 결정 2026-11-03 — 화요일 입실 숙박 · 화 ~ 토 연박은 수요일이 쉬는 날이어도 된다).
6. **영업시간 · 브레이크타임**(24시간 업체는 영업시간을 보지 않고 브레이크만 본다):
   - 대실 — 시작 ~ 끝 전체가 영업시간 안 · 브레이크와 겹치지 않음(맞닿음은 허용).
   - 숙박 · 연박 — 체크인 시각과 체크아웃 시각이 각각 영업시간 안 · 브레이크 안이 아님(사용자 결정 2026-11-03). 체크인은 `[여는 시각, 닫는 시각)`, 체크아웃은 `(여는 시각, 닫는 시각]`.
   - 영업시간은 그 날의 요일 행 + 자정을 넘는 전날 행(닫는 시각 < 여는 시각)까지 본다. 휴무(`is_closed = 1`) 요일은 영업시간이 없다.
7. **일시 예약불가** — 이용 구간이 일시 예약불가 기간과 겹치지 않는다(반열린 — 맞닿음 허용).
8. **점유** — 새 예약의 `[시작, 끝 + 정비시간)` 이 같은 호실의 점유 예약(결제 대기 · 확정 · 이용 중)의 `[start_at, blocked_until)` 과 겹치지 않는다. 최종 판정은 DB 배타 제약(`EXC_Reservation_RoomIdBlockedRange` — 23P01 → 400).

### 이용 구간 · 요금

| 상품 | 구간 | 요금 |
|---|---|---|
| 대실 `HOURLY` | 날짜 + 시작 시각(30분 단위 — :00 · :30, 사용자 결정 2026-11-03) ~ + `usage_hours` | 시작일 기준 1회 요금 |
| 숙박 `NIGHT` | 날짜 체크인 시각 ~ **다음 날** 체크아웃 시각 — 항상 날짜를 넘긴다(퇴실 시각이 입실보다 늦어도, 사용자 결정 2026-11-03 — 예: 10:00 → 다음 날 12:00) | 입실일 기준 1박 요금 |
| 연박 `LONG` | 날짜 체크인 시각 ~ 날짜 + 박수 체크아웃 시각, 박수는 업체 설정 `min_nights` ~ `max_nights` | 박마다(입실일, +1일, …) 요금 합계 |

- 요금 = 그 날짜가 기간 가격(`t_room_group_plan_price`, 지워지지 않은 행, 시작 · 끝 날짜 포함) 안이면 기간 요금, 아니면 그룹 상품 기본 요금. 대실 · 숙박 · 연박 요금은 종류별로 따로다(그룹 상품 행이 종류마다 있다).
- 날짜 · 시각은 모두 한국 시각이다. 자정을 넘겨 시작하는 대실(01:00 시작)은 시작한 날짜 기준이다.
- 정비시간(`maintenance_minutes`)은 예약 때 업체 값을 예약에 저장하고 `blocked_until = end_at + 정비시간`.

### 예약 생성 (#69) — 결제 대기 5분

- 위 재고 판정을 생성 시점에 다시 한다(조회 결과를 믿지 않는다).
- **같은 호실 재예약 제한** — 같은 이용자가 같은 호실에서 결제 대기 만료(`EXPIRED`)된 예약이 있고, 만료 시각(`expires_at`)부터 10분이 지나지 않았으면 400(사용자 결정 2026-11-03).
- 쓰기(한 트랜잭션): 결제(`READY` · 결제 환경 · 주문명 · 금액) → 예약(`PENDING` — 환불 마감 시각 · 마감 뒤 환불 비율 · 정비시간 저장) → 기본 구간(`BASE` · `PENDING` · `expires_at = 지금 + 5분` · 결제 FK).
- 주문명 `<업체명> <호실명> <상품명>`(100자로 자름 — 예: `루미 강남점 101호 시간 이용`).
- 환불 마감 시각 = `start_at − refund_deadline_minutes`, 마감 뒤 환불 비율 = 그때 업체 `late_refund_percent` — 업체가 나중에 규정을 바꿔도 이 예약은 그대로다.
- 응답 done data: 예약 ID · 결제 ID(토스 orderId) · 주문명 · 금액 · 결제 대기 만료 · 시작 · 끝.

### 결제 확인 (#113)

프론트가 토스 승인 뒤 `{payment_id, payment_key}` 를 보낸다(금액은 받지 않는다 — 프론트 값은 믿지 않는다). 서버는 `getPayment(payment_key)` 로 다시 읽어 대조한다(대조 함수 `verifyPaymentLookup` — 결과 4가지):

| 토스 조회 | 결과 | 처리 |
|---|---|---|
| 없음 · `DONE` 아님(인증만 · 취소 · 중단) | 미결제 | 400 `결제가 완료되지 않았습니다.` — 쓰기 없음, 5분 안에 다시 시도 |
| `DONE` · 주문번호 다름 | 다른 주문 | 400 `결제 정보가 맞지 않습니다.` — 쓰기 없음(다른 주문 · 다른 이용자일 수 있어 환불하지 않는다) |
| `DONE` · 금액 다름 | 불일치 | 결제 환불 신청(토스 금액 전액) + 예약 · 구간 만료 → **반환** 400 `결제 금액이 맞지 않아 결제를 취소했습니다.` |
| `DONE` · 주문번호 · 금액 일치 | 결제됨 | 결제 `DONE`(결제 키 · 수단 · 승인 시각 · 영수증) · 구간 · 예약 `CONFIRMED` → done |

- 예약이 이미 만료 · 취소됐는데 결제됨이면 → 결제 환불 신청 → **반환** 400 `결제 대기 시간이 지나 결제를 취소했습니다. 다시 예약해주세요.`
- 이미 같은 결제 키로 확정된 결제면 done(중복 요청). 다른 결제 키로 확정된 결제면 400.
- 결제 대기 5분이 지났어도 아직 만료되지 않았으면(crontab 전) 결제됨은 확정한다 — crontab 도 같은 판정을 하므로 결과가 같다.
- **반환(return)** — 환불 신청 · 만료를 커밋한 채 실패를 알리는 경우만 예외를 던지지 않고 돌려준다(서비스 계층 규칙 — 인증번호 불일치와 같은 방식).
- 상태 조건을 건 쓰기(`reservation_state_id = PENDING` 일 때만)로 crontab 과 겹쳐도 한쪽만 바꾼다.

### 결제 대기 만료 · 늦은 승인 · 환불 — scheduler crontab

토스 문서: 취소 API 는 승인된 결제만 취소하고, 주문번호 조회도 승인된 결제를 돌려준다. 그래서 만료는 "취소 요청"이 아니라 "주문번호 조회"로 가른다(사용자 확인 2026-11-03).

- **`reservation-payment-expire`(1분)** — 구간 `PENDING` · `expires_at ≤ 지금` 인 기본 구간마다 `findByPaymentId(payment_id)`:
  - 결제됨 → 확정(결제 확인과 같은 쓰기).
  - 불일치(금액 다름) → 환불 신청 + 만료.
  - 미결제 → 결제 `EXPIRED` · 구간 · 예약 `EXPIRED`(호실이 풀린다).
  - 토스 503 → 건너뛰고 다음 회차.
- **`reservation-payment-recheck`(5분)** — 결제 `EXPIRED` 이고 바뀐 지 30분 안인 결제(토스 인증은 최대 30분 유효)를 다시 조회 → 결제됨 · 불일치면 환불 신청(전액). 미결제면 그대로.
- **`reservation-refund`(1분)** — 결제 `REFUND_REQUESTED` 마다 `cancel({payment_id, payment_key, reason: refund_reason, amount: refund_amount})`:
  - 성공 → `REFUNDED`(`refunded_at` = 토스 취소 시각).
  - 업무 실패 400 → `REFUND_FAILED`(`failure_code` · `failure_message` — 관리자가 따로 처리).
  - 503 → 건너뛰고 다음 회차(멱등키 `cancel-<payment_id>` 로 중복 없음).
- 세 crontab 모두 규약대로 운영(`NODE_ENV=production`)에서만 돌고 `JobLockService` 로 회차마다 1대만 실행한다. 건별 실패는 건너뛴다. 여러 표를 바꾸는 상태 전환은 repository 메서드 1개가 트랜잭션으로 묶고, 상태 조건(`PENDING` · `REFUND_REQUESTED`)을 건다.
- scheduler 가 토스 키를 쓰게 된다 — `compose.scheduler.yml` 이 `TOSS_SECRET_KEY` 를 빈 값으로 덮지 않고 전달, scheduler 루트 모듈이 `PaymentModule` import.

### 이용자 취소 (#70) — 업체별 환불 규정

| 시점 | 환불 |
|---|---|
| 지금 < 환불 마감(`refund_deadline_at`) | 100% |
| 환불 마감 ≤ 지금 < 이용 시작 | `floor(결제 금액 × late_refund_percent / 100)` — 원 단위 내림(15,001원 · 50% → 7,500원) |
| 이용 시작 ≤ 지금 | 400 `이용 시작 후에는 취소할 수 없습니다.`(노쇼 환불 없음 — 기존 결정 유지) |

- 환불 마감 · 비율은 예약에 저장된 값을 쓴다(사용자 결정 2026-11-03 — 예전 "50% 구간 없음"(2026-10-29)을 바꿈).
- 확정 예약: 예약 · 구간 `CANCELED`(주체 `USER` · 사유) + 결제마다 환불액 > 0 이면 `REFUND_REQUESTED`(환불액 · 사유 `이용자 예약 취소` · 신청 시각), 0 이면 결제는 `DONE` 그대로(환불 없이 취소). 호실은 바로 풀린다.
- 결제 대기 예약: 예약 · 구간 `CANCELED` + 결제 `EXPIRED`(환불 없음 — 늦은 승인은 recheck crontab 이 잡는다).
- 그 밖(이용 중 · 완료 · 취소 · 만료) 400 `취소할 수 없는 예약입니다.`, 남의 예약 404.
- 취소 사유 메모는 필수(255자).

### 업체 환불 규정 · 연박 박수 설정 (기존 API 확장)

- `t_store.refund_deadline_hours`(0 ~ 168, 기본 1) → **`refund_deadline_minutes`**(0 ~ 10,080 = 7일, 기본 60) — 손으로 쓴 마이그레이션(RENAME + 기존 값 × 60, 데이터 유지).
- `t_store.late_refund_percent`(0 ~ 100, 기본 50) — 0 이면 마감 뒤에는 환불 없이 취소만.
- 내 업체 예약 · 환불 규정 API(#99)가 `booking_open_hours` · `refund_deadline_minutes` · `late_refund_percent` 를 받는다. 입점 승인 때 기본값. 업체 상세 · 내 업체 상세 응답 필드명도 바뀐다(프론트 영향).
- `t_room_plan.min_nights` · `max_nights` — 연박 행만(1 ~ 180, 최소 ≤ 최대, 기본 1 · 30), 대실 · 숙박 행은 NULL(CHECK). 기존 업체 연박 행은 마이그레이션이 기본값으로 채운다. 업체 상품 설정 수정 API(#103)가 연박일 때 받는다(사용자 결정 2026-11-03 — 시간 정보 · 박수는 업체별, 판매 여부 · 요금은 그룹별).
- `t_reservation.late_refund_percent`(예약 때 업체 값).
- `t_payment` `CHK_Payment_Refunded` → 환불 완료면 `0 < refund_amount ≤ amount` 이고 `refunded_at` 있음(부분 환불). 결제 포트 `cancel` 이 취소 금액(`amount`)을 받는다.

### 업체 취소 · 호실 이동 (#73)

- 업체 관리자의 소속 업체 예약만(아니면 404).
- **업체 취소** — 결제 대기 · 확정 예약. 예약 · 구간 `CANCELED`(주체 `STORE` · 사유 필수) + 확정 결제는 100% 환불 신청(사유 `업체 예약 취소`), 결제 대기 결제는 `EXPIRED`. 이용자에게 SMS(마지막 단계).
- **호실 이동** — 이용 시작 전의 확정 예약만. 같은 객실 그룹 · 지워지지 않음 · 사용중지 아님인 다른 호실로(사용자 결정 2026-11-03). 같은 `[start_at, blocked_until)` 겹침은 배타 제약 23P01 → 400. 금액 · 시간은 그대로. 이용자에게 SMS.
- **SMS** — 이용자 번호(`t_user.phone` — 휴대폰 인증을 마친 번호)가 있을 때만 보낸다. 없으면 건너뛴다(사용자 결정 2026-11-03 — 예약에 휴대폰 인증 가드를 두지 않음). 문구 예: `[roomless] 루미 강남점 11/10 13:30 예약이 업체 사정으로 취소되었습니다. 결제 금액은 전액 환불됩니다. 사유: …` · `[roomless] 루미 강남점 11/10 13:30 예약 호실이 101호에서 102호로 변경되었습니다.`

### 조회 (#71 · #72)

- **내 예약 목록** — 이용자 본인 예약, 결제 대기 만료(`EXPIRED`)는 숨긴다. 페이지(`PaginationDto` — count → `Pagination` → 목록), 시작 시각 최근순. 항목: 예약 · 업체 · 호실 · 그룹 · 상품 · 상태 · 시작 · 끝 · 합계 · 환불 마감 · 등록일.
- **내 예약 상세** — 목록 항목 + 마감 뒤 환불 비율 · 취소 정보 + 구간(종류 · 시각 · 금액 · 상태 · 결제 대기 만료) + 결제(결제 ID · 상태 · 금액 · 수단 · 영수증 · 환불 금액 · 환불 시각). 남의 예약 · 만료 건 404.
- **업체 예약 현황** — 매니저 소속 업체, 날짜(한국 날짜) 하루와 겹치는 결제 대기 · 확정 · 이용 중 · 완료 예약을 호실별로(지워지지 않은 호실 — 층 · 호실명 순). 예약마다 이용자 이름 · 휴대폰(연락용)을 함께 준다.

### 호실 상태와 예약 상태는 따로

- 예약 · 결제 상태(결제 대기 · 확정 …)와 호실 상태(예약가능 · 사용중 · 정비중 · 사용중지)는 따로 관리한다(사용자 결정 2026-11-03). Phase 17 은 호실 상태를 바꾸지 않는다.
- 예약 시간이 되면 사용중 → 끝나면 정비중 → 관리자가 정비 완료 → 예약가능 전환은 Phase 19(예: 09:00 ~ 12:00 사용중, 12:00 정비중, 정비 완료 뒤 예약가능, 다음 예약 13:00 이 되면 다시 사용중). 남은 시간에 상품이 들어가지 않으면 그 시간은 예약불가로 나온다(점유 판정).
- `RESERVED`(예약완료) 호실 상태는 이번에 쓰지 않는다.

### 업체 설정과 기존 예약의 충돌

- 일시 예약불가 등록 · 영업시간 · 브레이크 변경 · 영업중 아님 · 영업중지가 기존 예약과 겹쳐도 예약은 그대로 둔다. 자동 취소도 충돌 표시도 이번에는 만들지 않는다(사용자 결정 2026-11-03 — 개발 중이라 예약이 없다). 업체는 필요하면 업체 취소로 정리한다.

### 호실 · 객실 그룹 삭제 (admin-service)

- 점유 예약(결제 대기 · 확정 · 이용 중)이 있는 호실은 지울 수 없다 — 400 `예약이 있는 호실은 지울 수 없습니다.`. 그룹은 그 그룹 호실에 점유 예약이 있으면 400 `예약이 있는 객실 그룹은 지울 수 없습니다.`(Phase 13 의 "Phase 17 에서" 주석 해소).

## Notes

- **Phase 19 로 넘기는 것** — 호실 상태의 시간 전환(사용중 · 정비중), 체크인 · 체크아웃, 이용 완료 crontab, 연장(구간 `EXTENSION` — 대실 시간 단위).
- **개발 환경의 crontab** — 규약대로 운영에서만 돌아서, 로컬(`NODE_ENV=development`)에서는 결제 대기가 만료되지 않고 환불도 나가지 않는다. 토스 테스트 키로 끝까지 시험하려면 `NODE_ENV=production` 으로 scheduler 를 띄운다.
- **프론트** — 토스 승인 전에 예약이 결제 대기인지(내 예약 상세) 확인하면 늦은 승인이 줄어든다. 늦게 승인돼도 서버가 환불한다.
- 가용성 조회는 로그인 없이 연다(업체 둘러보기 단계 — Phase 18 discovery 와 같은 선).
- 상태 · 종류 값(예약 상태 · 결제 상태 · 구간 종류 · 취소 주체)은 user-service · scheduler · admin-service 가 함께 쓰므로 `libs/contracts/src/reservation/reservation.constants.ts`(API 응답 값이기도 하다), 상품 종류 · 호실 상태 · 업체 상태는 예약 도메인 상수에 같은 값으로 둔다(형제 `ROOM_STORE_STATE_LEAVE` — 도메인끼리 import 하지 않는다).

## Proposals (Codebase-Based)

- [x] 새 도메인은 형제 user-service `door`(apps/user-service/src/door — symbols · util · interfaces · repositories · service · controllers · module) · `user`(큐 컨트롤러 — user.controller.queue.ts) 모양을 따른다.
- [x] 공유 DB 직접 읽기 — 형제 admin-service 매니저 도메인이 `t_store` 를 `findManagerStore` 로 읽는 방식(소유 도메인 어휘로 이름 — 예약 repository 의 `findReservationStore` · `findBookableRooms`).
- [x] 배타 제약 위반 변환은 `isExclusionViolation(error, 'EXC_Reservation_RoomIdBlockedRange')`(libs/database/src/typeorm-error.ts:50 — 기간 가격 형제).
- [x] 커밋해야 하는 실패의 반환은 형제 `confirmPhoneVerification`(apps/user-service/src/user/user.service.ts — `Promise<T | BadRequestException>`).
- [x] 시간 계산은 dayjs(`@app/common/utils/dayjs.js` — 한국 시각) — 하루 안 시각을 기준일에 올리는 형제 `toDailyRange` · `hasOverlappingBreaks`(apps/admin-service/src/store/store.util.ts:228 · :242 — 반열린 · 자정 넘김)와 같은 규칙을 실제 날짜 위로 옮긴다.
- [x] crontab 은 형제 `UserLeaveCleanupCrontab`(apps/scheduler/src/user/crontabs/user-leave-cleanup.crontab.ts — 운영 가드 · `runExclusive` · 건별 try/catch).
- [x] 토스 조회 대조는 결제 포트 옆 순수 함수(`verifyPaymentLookup` — libs/integration/src/integration.util.ts, 형제 `classifyTossFailure`) — user-service · scheduler 가 함께 쓴다.

## Decisions

- [x] 객실 데이터는 공유 DB 직접 읽기 (사용자 결정 2026-11-03)
- [x] 결제 대기 5분 → 토스 주문번호 조회로 확정 · 만료 가르기, 금액 불일치 · 늦은 승인은 자동 환불(만료 후 30분 재확인), 같은 이용자 · 같은 호실 만료 후 10분 재예약 금지 (사용자 결정 2026-11-03 — "취소 요청으로 가르기"는 토스가 승인된 결제만 취소해 조회로 바꿈)
- [x] 환불 마감 뒤 ~ 이용 시작 전 취소는 업체별 비율로 부분 환불(기본 50%, 원 단위 내림), 시작 뒤 취소 불가, 업체 취소 100% (사용자 결정 2026-11-03)
- [x] 환불 마감은 업체별 분 단위(`refund_deadline_minutes` 0 ~ 10,080, 기본 60), 마감 뒤 비율 `late_refund_percent`(0 ~ 100, 기본 50), 예약에 그때 값 저장 (사용자 결정 2026-11-03)
- [x] 업체 설정 충돌 — 기존 예약 그대로, 자동 취소 · 표시 없음 (사용자 결정 2026-11-03)
- [x] 대실 시작 30분 단위 (사용자 결정 2026-11-03)
- [x] 연박 최소 · 최대 박수는 업체 상품 설정(연박 행), 판매 여부 · 요금은 그룹 상품 (사용자 결정 2026-11-03)
- [x] 호실 상태와 예약 상태는 따로 — Phase 17 은 호실 상태를 바꾸지 않고 시간 전환은 Phase 19, 즉시 입실(30분 안)은 예약가능 호실만 (사용자 결정 2026-11-03)
- [x] 요금 · 예약 가능 요일 — 요일은 입실일만, 요금은 대실 · 숙박 입실일 · 연박 박마다(기간 가격) (사용자 결정 2026-11-03)
- [x] 호실 이동은 같은 그룹만 (사용자 결정 2026-11-03)
- [x] 영업시간 — 대실은 구간 전체, 숙박 · 연박은 체크인 · 체크아웃 시각 각각 (사용자 결정 2026-11-03)
- [x] 숙박은 항상 다음 날 퇴실 — 퇴실 시각이 입실보다 늦어도 날짜를 넘긴다, 업체 상품 설정 퇴실 시각 주석 · DTO 설명도 함께 (사용자 결정 2026-11-03)
- [x] 휴대폰 인증 가드 없음 — 번호 없으면 SMS 생략 (사용자 결정 2026-11-03)
- [x] 결제 확인 대조 — 미결제 400 · 다른 주문 400(환불 안 함) · 금액 불일치 자동 환불 + 만료(반환) · 늦은 결제 환불(반환) · 같은 결제 재요청 done (사용자 결정 2026-11-03 — 주문번호 불일치는 다른 주문 결제라 환불하지 않도록 고침)
- [x] TDD 케이스 — 가용성 12 · 환불액 8 · 토스 조회 대조 6 (사용자 결정 2026-11-03)
