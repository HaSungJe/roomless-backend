---
# One-line feature summary
feature_goal: "reservation 기반(Phase 16) — 예약 · 예약 구간(기본 · 연장) · 결제 스키마와 룩업 3개(+시드), 결제 포트 PAYMENT_GATEWAY + 토스페이먼츠 어댑터(조회 검증 · 환불 — 승인은 프론트). 호실의 그룹은 등록 때만 정한다(Phase 13 호실 수정에서 그룹 변경 제거)"

# Domain/module name
domain: "reservation"

# Entry-point method/endpoint
api_method: "새 API 없음 — 엔티티 · 시드 · 마이그레이션 ReservationSchema + 포트 PAYMENT_GATEWAY(libs/integration) · 기존 API 1개 변경(PATCH /api/v1/admin-service/room/:room_id — 그룹 변경 제거)"

# Path/signature
api_path: "libs/database/src/entities/{reservation,payment}/ · libs/integration/src/payment/ · admin.room.update"

# Affected state
affected_data: ["t_reservation_state · t_reservation_detail_type · t_payment_state (새 룩업 + 시드)", "t_reservation · t_reservation_detail · t_payment (새 테이블 — 아직 쓰는 API 없음)", "t_room (호실 수정이 room_group_id 를 더 이상 바꾸지 않음)"]
---

## Feature Description

로드맵 Phase 16(#63 · #64 · #65 · #66) — 예약 · 결제가 기댈 스키마와 결제 포트를 먼저 만든다(API 는 Phase 17). 같은 묶음으로 호실 그룹 고정을 넣는다 — 예약은 호실로 그룹을 찾으므로 호실의 그룹이 바뀌면 안 된다(사용자 결정 2026-11-02).

- **예약 1건 = `t_reservation` 1행** — 이용자 · 업체 · 호실 · 기본 상품 · 상태 · 입실(`start_at`) · 최종 체크아웃(`end_at`, 연장이 확정되면 늘어난다) · 정비시간(예약 때 값) · 점유 끝(`blocked_until` = `end_at` + 정비시간) · 합계 금액 · 환불 마감 · 체크인 · 완료 · 취소 시각 · 취소 주체와 사유.
- **구간 = `t_reservation_detail`** — 기본 1행 + 연장마다 1행. 구간마다 상품 · 시각 · 금액 · 상태 · 결제(`payment_id` FK). 예: 예약 + 연장 2번 = 예약 1행 + 구간 3행 + 결제 3행.
- **결제 1번 = `t_payment` 1행**(시도마다) — 토스 orderId 는 `payment_id` 그대로. 금액 · 주문명 스냅샷, 결제 환경(TEST · LIVE), 토스 결제 키 · 수단 · 승인 시각 · 영수증, 환불 금액 · 사유 · 시각, 마지막 실패 사유.
- **겹침 방지** — 같은 호실의 `[start_at, blocked_until)` 이 겹치는 활성 예약(결제 대기 · 확정 · 이용 중)을 DB 배타 제약이 막는다. 끝과 시작이 맞닿는 것은 된다.
- **결제 포트 `PAYMENT_GATEWAY`(토스페이먼츠)** — 결제창 · 승인은 프론트(Next.js)가 하고, 여기서는 토스 조회 API 로 진짜인지 확인(검증)하고 환불(취소 API)을 한다. 시크릿 키 `TOSS_SECRET_KEY`.
- **호실 그룹 고정** — `PATCH /api/v1/admin-service/room/:room_id` 는 호실명 · 층만 바꾼다. 그룹을 잘못 등록했으면 지우고 다시 등록한다.

## Entry Point

새 공개 API 는 없다. 바뀌는 것:

| 대상 | 전 | 후 |
|---|---|---|
| `PATCH /api/v1/admin-service/room/:room_id` (큐 `admin.room.update`) — `RoomUpdateDto` | `{room_group_id, room_name, floor}` — 같은 업체 그룹으로 이동 | `{room_name, floor}` — 그룹은 바꾸지 않는다(보내도 무시) |
| 포트 `PAYMENT_GATEWAY` (libs/integration) | 없음 | `environment()` · `getPayment(payment_key)` · `findByPaymentId(payment_id)` · `cancel({payment_id, payment_key, reason})` |

- Method: (해당 없음 — 스키마 · 포트), 변경 API 는 PATCH
- Path: 위 표
- Request: 호실 수정 `{"room_name": "201호", "floor": 2}`
- Response: 호실 수정 SSE `done`(data null) — 그대로

## Business Rules

### 예약 상태 `t_reservation_state`

| ID | 이름 | 점유 | 쓰는 곳 |
|---|---|---|---|
| `PENDING` | 결제 대기 | ○ | 예약 · 구간 — 결제 전 홀드 |
| `CONFIRMED` | 예약 확정 | ○ | 예약 · 구간 — 결제 확인됨 |
| `CHECKED_IN` | 이용 중 | ○ | 예약 — 이용 시간 안의 첫 문 열기 |
| `COMPLETED` | 이용 완료 | × | 예약 — 체크아웃 또는 이용 시간이 지난 crontab(Phase 19). 남은 시간이 있어도 완료되면 호실은 정비중 → 정비 완료 → 예약가능 |
| `CANCELED` | 취소 | × | 예약 · 구간 — 취소 주체(`USER` · `STORE`)와 사유 메모 필수 |
| `EXPIRED` | 결제 대기 만료 | × | 예약 · 구간 — DB 에만 남고 이용자 이력에서는 보이지 않는다(Phase 17 목록에서 제외) |

- 구간(`t_reservation_detail`)은 `PENDING` · `CONFIRMED` · `CANCELED` · `EXPIRED` 만 쓴다(CHECK).
- 점유(배타 제약)는 예약 행 기준이다 — `PENDING` · `CONFIRMED` · `CHECKED_IN`.

### 예약 · 구간 · 결제

- **예약은 지우지 않는다** — 취소는 상태다(`is_deleted` 없음).
- **취소 조합(CHECK)** — `CANCELED` ⟺ `canceled_at` · `cancel_actor`(`USER` · `STORE`) · `cancel_reason` 이 모두 있다.
- **시각(CHECK)** — 예약 `start_at < end_at ≤ blocked_until`, 구간 `start_at < end_at`.
- **결제 1건 = 구간 1개** — `t_reservation_detail.payment_id` UK. 결제가 실패해 다시 하면 구간이 새 결제 행을 가리키고, 실패한 결제 행은 기록으로 남는다.
- **합계 · 기본 상품을 예약에도** — 목록 · 조회가 구간을 모으지 않게 `total_price`(기본 + 확정된 연장 구간 합계) · `room_plan_type_id`(기본 구간 상품)를 예약에 둔다(사용자 결정).
- **결제 상태 `t_payment_state`** — `READY` 결제 대기 · `DONE` 결제 완료 · `FAILED` 결제 실패 · `EXPIRED` 결제 만료 · `REFUND_REQUESTED` 환불 신청(백그라운드 처리 대기) · `REFUNDED` 환불 완료 · `REFUND_FAILED` 환불 실패. 환불은 100% 만이라 부분 환불 상태는 없다.
- **결제 불변식(CHECK)** — `DONE` · 환불 3종 ⟹ `payment_key` · `approved_at` 있음 / `REFUNDED` ⟹ `refund_amount = amount` · `refunded_at` 있음 / `FAILED` · `REFUND_FAILED` ⟹ `failure_message` 있음 / `environment` 는 `TEST` · `LIVE`(기본값 없음 — 빠뜨리면 insert 가 실패해 드러난다).
- **`refund_amount` 는 환불이 없으면 null**(0 과 구분).

### 결제 포트 `PAYMENT_GATEWAY` — 토스페이먼츠

- **역할** — 프론트(Next.js)가 결제창(클라이언트 키) · 승인(Next.js 서버, 시크릿 키)을 하고 결과(`paymentKey` · `orderId`(= `payment_id`) · `amount`)를 여기로 넘긴다. 여기서는 `getPayment` 로 토스에서 다시 읽어 진짜인지(상태 `DONE` · 금액 · orderId) 확인한 뒤 기록한다(검증 규칙 · API 는 Phase 17). 환불은 여기서 `cancel`.
- **결제 환경** — `environment()` 가 시크릿 키 접두사로 `TEST`(`test_`) · `LIVE` 를 정한다. 결제 행을 만들 때 넣고, 통계 · 매출에서 `TEST` 를 뺀다.
- **멱등** — `cancel` 은 `Idempotency-Key: cancel-<payment_id>` 를 붙인다(15일 유효) — 큐 재시도가 중복 취소를 만들지 않는다.
- **실패 분류(`classifyTossFailure`)** — 업무 실패는 400 `{message: 토스 메시지, payment_error_code: 토스 code}`(큐 재시도 없음), 일시 실패는 503 `결제 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.`(큐 재시도), 결제 없음(404 `NOT_FOUND_PAYMENT`)은 조회에서 null · 취소에서 400.

| # | 토스 응답 | 분류 |
|---|---|---|
| 1 | 400 `ALREADY_CANCELED_PAYMENT`(취소) | 400 |
| 2 | 403 `NOT_CANCELABLE_AMOUNT`(취소) | 400 |
| 3 | 404 `NOT_FOUND_PAYMENT`(조회) | null |
| 4 | 400 `INVALID_REQUEST` | 400 |
| 5 | 400 `PROVIDER_ERROR`(일시 오류) | 503 |
| 6 | 409 `IDEMPOTENT_REQUEST_PROCESSING` | 503 |
| 7 | 401 `UNAUTHORIZED_KEY`(우리 키) | 503 + 로그 |
| 8 | 500 `FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING` | 503 |
| 9 | 네트워크 오류 · 시간 초과 | 503 |
| 10 | 본문이 JSON 이 아닌 4xx | 400 `결제를 처리하지 못했습니다.` |
| 11 | 404 `NOT_FOUND_PAYMENT`(취소) | 400 |

- **키 없음** — `TOSS_SECRET_KEY` 가 비어 있으면 부팅 경고만 하고 결제 요청이 503(AWS 와 같은 방식). 앱 등록은 처음 쓰는 Phase 17(user-service).

### 호실 그룹 고정

- `RoomUpdateDto` 에서 `room_group_id` 를 뺀다. service 는 그룹을 찾지 않고 호실명 · 층만 바꾼다. 예전 클라이언트가 `room_group_id` 를 보내도 무시된다(ValidationPipe 는 whitelist 를 켜지 않는다 — 걸러지지 않지만 service 가 쓰지 않는다).

## Notes

- **Phase 17 에서 정할 것** — 결제 확인 API(프론트가 넘긴 결과를 `getPayment` 로 검증 → `DONE` · 예약 확정, 로드맵 #69 옆에 필요), 결제 대기 유지 시간(추천 10분 — `expires_at`), 만료 처리 전 `findByPaymentId` 로 실제 결제 여부 재확인, 일시 예약불가에 걸린 예약 특수 표시 컬럼, 이용자 이력에서 `EXPIRED` 제외.
- **Phase 19 에서 정할 것** — 연장 중 결제 대기 구간이 자리를 잡는 방식(예약 `end_at` · `blocked_until` 을 언제 늘리나), 체크인 · 체크아웃 · 이용 종료 crontab 의 상태 변화.
- **FK onDelete** — 규약대로 NOT NULL FK 는 CASCADE. 회원 · 업체 · 호실은 실제로 지우지 않으므로(소프트 삭제 · 탈퇴는 상태) 예약 · 결제가 함께 지워지는 일은 없다.
- `btree_gist` 확장은 Phase 12(RoomSchema)가 이미 만든다 — 새 배타 제약(`tstzrange`)도 같은 확장을 쓴다.

## Proposals (Codebase-Based)

- [x] 배타 제약은 형제 `EXC_RoomGroupPlanPrice_RoomGroupPlanIdDateRange`(libs/database/src/entities/room/room-group-plan-price.entity.ts:12 — `daterange` · `WHERE`)와 같은 모양으로 `tstzrange(start_at, blocked_until, '[)')` · 활성 상태 `WHERE`.
- [x] 룩업은 형제 `RoomStateEntity`(room-state.entity.ts — 구조 컬럼만) + `seeder.targets.ts` 시드(`ROOM_STATE_SEED_DATA`).
- [x] 결제 포트는 SMS · S3 · 문 정보와 같은 자리(`libs/integration` — `PAYMENT_GATEWAY` Symbol + 인터페이스 + `@Global` 모듈), HTTP 는 형제 `InternalHttpClient`(apps/gateway/src/modules/transport/internal-http.client.ts:46-73 — `fetch` + `AbortSignal.timeout`, 연결 실패 503)와 같은 방식. 실패 분류는 형제 `toE164KrPhone` 옆 순수 함수(integration.util.ts).
- [x] 결제 엔티티는 사용자가 준 다른 프로젝트의 인앱 결제 원장에서 스냅샷 · 결제 환경 · 멱등 · 불변식 · null 구분을 가져오고, 환불 자식 표 · 정산 · 숨김 · 영수증 원문 · 통화는 가져오지 않는다(이유는 Decisions).

## Decisions

- [x] 예약 상태 6개 — 결제 대기 · 예약 확정 · 이용 중(점유) · 이용 완료 · 취소 · 결제 대기 만료 (사용자 결정 2026-11-02)
- [x] 취소는 주체(이용자 · 업체) + 사유 메모 필수 (사용자 결정 2026-11-02)
- [x] 이용 완료는 체크아웃 · 이용 시간 경과 crontab 이 바꾸고, 남은 시간이 있어도 호실은 정비중 → 정비 완료 → 예약가능 (사용자 결정 2026-11-02 — Phase 19)
- [x] 결제 대기 만료는 DB 에만 남고 이용자 이력에서 숨김 (사용자 결정 2026-11-02 — Phase 17)
- [x] `room_group_id` 는 예약에 두지 않는다(호실로 찾는다), 호실의 그룹은 등록 때만 — 수정에서 그룹 변경 제거, 잘못 등록하면 지우고 다시 (사용자 결정 2026-11-02)
- [x] 예약 · 구간 분리 — `t_reservation` 1행 + `t_reservation_detail`(기본 · 연장), 예약에 최종 체크아웃 · 합계 · 기본 상품 (사용자 결정 2026-11-02)
- [x] 구간이 결제를 FK 로 가리킨다(`t_reservation_detail.payment_id`) (사용자 결정 2026-11-02)
- [x] `t_payment` — 참고 원장의 스냅샷 · 결제 환경 · 멱등 · 불변식(CHECK) · null 구분 가져옴, 환불 자식 표(100% 환불 1번뿐) · 정산(로드맵 밖) · 숨김(화면 없음) · 영수증 원문(결제 키로 조회) · 통화(원화만) 안 가져옴 (사용자 결정 2026-11-02)
- [x] 결제 상태 7개 · 부분 환불 없음 (사용자 결정 2026-11-02)
- [x] 토스 역할 — 프론트 결제창 · 승인, 여기 조회 검증 · 환불 (사용자 결정 2026-11-02)
- [x] 실패 분류 — 업무 400(토스 메시지 · code) / 일시 503(재시도) / 멱등키 고정, 키 없으면 부팅 경고 · 503, 앱 등록은 Phase 17 (사용자 결정 2026-11-02)
- [x] 실패 분류 11개 케이스를 build 때 임시 스크립트로 표 대조(라이브러리라 spec 없음) — 승인이 프론트로 가면서 승인 전용 코드 3개를 취소 · 조회 코드로 바꿈 (사용자 결정 2026-11-02)
