---
# One-line feature summary (e.g. "Admin user sign-up")
feature_goal: "이용(Phase 19) — 체크인 · 체크아웃 없이 예약 시간이 곧 이용 권한: 시작 시각 이용 중 + 호실 사용중, 끝나면 이용 완료 + 정비중. QR 링크 SMS · QR 문 열림 로그 · 사용중지 호실 전액 환불 취소 · 이용 중 업체 취소는 이용자 동의"

# Domain/module name (see AGENTS.md for the project directory structure)
domain: "reservation — scheduler reservation(crontab) · user-service reservation · door / admin-service reservation, libs/database(엔티티 · 마이그레이션)"

# Entry-point method/endpoint. Record the entry-point identifier this project actually uses,
#   derived from code evidence (path:line), in the project's own naming. Do not assume a
#   particular position's syntax. (key name "api_method" stays as-is)
api_method: "crontab ×2(이용 전환 · QR 링크 SMS) · 큐 admin.reservation.use-cancel-request · 동기 GET + 큐 user.reservation.cancel-request-{approve,reject} · 기존 변경(내 예약 QR · 목록 · 상세 · 이용자 취소 · 결제 확인 · 업체 취소 · 업체 현황 · 문 소켓 QR 확인)"

# Path/signature (e.g. "/api/v1/user/admin/sign")
#   Record the path or signature this project actually uses, from code evidence (path:line),
#   in the project's own naming. (key name "api_path" stays as-is)
api_path: "POST /api/v1/admin-service/reservation/:reservation_id/use-cancel-request · GET /api/v1/user-service/reservation/:reservation_id/cancel-request · PATCH …/cancel-request/approve · …/cancel-request/reject"

# Affected state — write/persist targets. Basis for sizing the test cases. (key name "affected_data" stays as-is)
#   Record the state this project actually writes/persists, derived from code evidence (path:line),
#   in the project's own naming. Read-only reads are not "write" but are still data. Leave empty if none.
affected_data:
  - "t_reservation — 상태 전환(확정 → 이용 중 → 이용 완료), qr_link_sent_at(새 컬럼), checked_in_at · completed_at 삭제(마이그레이션)"
  - "t_room.room_state_id — 시작 사용중(사용중지 · 사용중 제외), 끝 사용중 → 정비중, 이용 중 업체 취소 사용중 → 정비중"
  - "t_room_qr · Redis door-qr:<room_id> — 시작 때 발급(기존 발급 규칙), 취소 때 끝내기"
  - "t_door_open_log(새) — QR 로 문을 연 기록"
  - "t_reservation_cancel_request(새) · t_reservation_cancel_request_state(새 룩업 + 시드) — 이용 중 취소 요청"
  - "t_payment — 사용중지 호실 취소 · 이용 중 취소 승인의 100% 환불 신청"
---

## Feature Description

체크인 · 체크아웃 API 를 두지 않는다. 예약 시간이 되면 들어갈 권한(QR)이 생기고, 시간이 지나면 잃는다(사용자 결정 2026-11-07). 시작 시각에 예약은 이용 중 · 호실은 사용중, 끝나면 이용 완료 · 정비중이 된다.
이용 시작 5분 전 예약 화면 링크를 SMS 로 보내고, QR 로 문을 연 기록을 쌓는다. 사용중지 호실의 예약은 언제든 전액 환불로 취소할 수 있다.
이용 중인 예약을 업체가 취소하려면, 이용자가 SMS 링크에서 로그인해 승인해야 한다(10분).

## API Spec

### 1. 이용 시작 · 종료 자동 전환 (#79 · #83 — scheduler crontab, 1분)

새 crontab `reservation-usage` 의 동작:
- **시작**: 확정 예약 중 `start_at ≤ 지금 < end_at` 인 것을 처리한다(한 트랜잭션).
  - 예약 → 이용 중(`CHECKED_IN`, 상태 조건)
  - 호실 → 사용중(`IN_USE`). 예약가능 · 예약완료 · 정비중일 때만 바꾸고, 사용중지 · 사용중은 그대로 둔다.
  - QR 발급: 기존 `INSERT … ON CONFLICT DO NOTHING`
  - 트랜잭션 뒤 Redis 현재 QR(`setQr`)을 마지막에 쓴다.
- **종료**: 확정 · 이용 중 예약 중 `end_at ≤ 지금` 인 것을 처리한다(한 트랜잭션).
  - 예약 → 이용 완료(`COMPLETED`)
  - 호실 → 사용중일 때만 정비중(`MAINTENANCE`). 정비 뒤 예약가능으로 바꾸는 것은 업체 관리자의 기존 '호실 상태' 기능이다.
  - QR 은 Redis 가 끝 시각에 저절로 만료된다(PXAT).
- **같은 전환이 일어나는 다른 자리** — 판정 · 호실 규칙이 같다(user-service):
  - 결제 확인(`user.reservation.payment-confirm`): 이미 시작한 예약이면 확정 직후 바로 이용 중으로 바꾼다(지금 바로 예약).
  - 내 예약 QR: 시작했는데 아직 확정이면(crontab 이 돌기 전) 그 자리에서 이용 중으로 바꾼다.
- **QR 동기화**(`reservation-qr-sync`): 대상을 이용 중 예약으로 줄인다.
- 문 소켓 QR 확인은 그대로다(QR 이 맞으면 열림). 입장 · 퇴실을 따로 기록하지 않는다.

### 2. 내 예약 QR 변경 (기존 `GET /api/v1/user-service/reservation/:reservation_id/qr`)
- **이용 중 예약에만** QR 을 준다(사용자 결정 2026-11-07).
- **QR 은 정확히 시작 시각부터 활성화된다**(사용자 결정 2026-11-07).
  - 링크 SMS 가 5분 전에 가도, 시작 전에 화면에서 QR 을 열면 400 이다.
  - QR 유효 시작은 `start_at` 이고, Redis 현재 QR 도 시작 전환 때 처음 쓴다.
  - 시작 시각이 지났는데 아직 확정이면(crontab 이 돌기 전 — 최대 1분), 위 1 의 전환을 그 자리에서 해서 바로 준다.
- 그 밖은 400:
  - 시작 전 · 끝난 뒤: `QR 은 이용 시간에만 볼 수 있습니다.`
  - 결제 대기 · 취소 등: `QR 을 볼 수 없는 예약입니다.`

### 3. QR 확인 링크 SMS (#78 — scheduler crontab `reservation-qr-link`, 1분)
- **대상**: 확정 · 이용 중이고 `start_at ≤ 지금 + 5분` · `end_at > 지금` · `qr_link_sent_at` 없음 · 예약자 휴대폰 번호가 있는 예약
  - 지금 바로 예약은 결제 확인 다음 회차에 나간다.
- 링크는 5분 전에 가지만, 화면의 QR 은 시작 시각부터 열린다(위 2).
- **문구**: `[roomless] <업체명> <M/D HH:mm> 예약 — QR 확인: <USER_WEB_URL>/reservation/<reservation_id>`
  - `USER_WEB_URL` 은 새 `.env` 값이다(scheduler · admin-service). 비어 있으면 보내지 않는다.
- **예약당 1번** — 순서는 아래와 같다.
  1. `qr_link_sent_at` 을 먼저 지금으로 표시한다(비어 있을 때만 — 겹쳐 돌아도 1번).
  2. SMS 를 보낸다.
  3. 실패하면 표시를 되돌려 다음 회차에 다시 보낸다.

### 4. QR 문 열림 로그 (#121 — 기존 문 소켓 `POST /internal/v1/user-service/door/verify`)
- QR 확인은 아래 순서다.
  1. 그 호실 · QR 의 `t_room_qr` 행이 없으면 Redis 를 보지 않고 `ok: false` 다.
  2. 있으면 Redis 현재 QR 과 비교한다(Lua — 지금 그대로).
  3. 맞으면 `t_door_open_log` 에 한 줄 쌓는다.
- `t_door_open_log` 의 내용: 호실 · 예약 · QR · 연 시각.
- 업체 관리자 바로 열기 · 틀린 QR 은 남기지 않는다(QR 로 연 것만 — 사용자 결정 2026-11-07). 조회 API 는 아직 없다.
- `t_reservation.checked_in_at` · `completed_at` 은 삭제한다(마이그레이션 — 값이 없다).

### 5. 사용중지 호실 전액 환불 취소 (#122 — 기존 `PATCH /api/v1/user-service/reservation/:reservation_id/cancel`)
- **사용중지 호실**: 예약한 호실이 사용중지면, 확정 · 이용 중 예약을 `end_at` 전까지 언제든 취소할 수 있다. 환불은 결제 금액 100% 이고, 환불 마감 · 시작과 상관없다. 사유: `사용중지 호실 취소`.
  - 이용 중이었으면 QR 을 끝낸다(`t_room_qr.ends_at` = 지금 + Redis `revokeQr` — 마지막).
  - 호실 상태는 그대로(사용중지) 둔다.
- **그 밖은 지금 규칙 그대로**: 확정은 마감 전 100% · 마감 뒤 비율이고, 시작 뒤(이용 중 포함)는 400 `이용 시작 후에는 취소할 수 없습니다.` 이다.
- 내 예약 목록 · 상세 응답에 `is_room_disabled: 0 | 1` 을 더한다(프론트가 '사용중지 — 전액 환불 취소' 를 보여 준다).

### 6. 이용 중 업체 취소 — 이용자 동의 (#123)

| 진입점 | 경로 | 하는 일 |
|---|---|---|
| 업체 관리자 | `POST /api/v1/admin-service/reservation/:reservation_id/use-cancel-request` (큐 `admin.reservation.use-cancel-request`, 본문 `cancel_reason`) | 요청 만들기 + 예약자에게 승인 링크 SMS. 결과 `{reservation_cancel_request_id, expires_at}` |
| 이용자 | `GET /api/v1/user-service/reservation/:reservation_id/cancel-request` (동기) | 마지막 요청: `{reservation_cancel_request_id, reservation_cancel_request_state_id, store_name, room_name, cancel_reason, refund_amount, expires_at, created_at}` |
| 이용자 | `PATCH …/cancel-request/approve` (큐 `user.reservation.cancel-request-approve`) | 승인 → 예약 취소(아래) |
| 이용자 | `PATCH …/cancel-request/reject` (큐 `user.reservation.cancel-request-reject`) | 거절 → 요청만 끝, 예약 그대로 |
| 업체 관리자 | 기존 `GET /api/v1/admin-service/reservation/store` | 예약 항목에 `cancel_request_state_id` · `cancel_request_created_at`(마지막 요청, 없으면 null) |

- **요청 SMS 링크**: `<USER_WEB_URL>/reservation/<reservation_id>/cancel-request`. 이용자는 로그인한 뒤 승인 · 거절한다(이용자 가드 — 내 예약만).
- **승인** = 업체 취소와 같은 결과다(한 트랜잭션).
  - 예약 · 구간 취소(주체 `STORE`, 사유 = 요청 사유)
  - 결제마다 100% 환불 신청
  - 요청 → 승인
  - QR 끝내기 + 호실 사용중 → 정비중
  - 트랜잭션 뒤 Redis `revokeQr` 를 마지막에 한다.
- **기존 업체 취소**(`…/:reservation_id/store-cancel`)는 시작 전 예약(결제 대기 · 확정 + `start_at > 지금`)만 받는다. 시작 뒤면 400 `이용 중인 예약은 이용자 동의를 받아 취소합니다.` 이다.

## Business Rules

- **이용 중** = 예약 시간이 된 예약이다. 상태 코드는 `CHECKED_IN`(이름 '이용 중')을 그대로 쓴다. 입장 여부와 무관하다.
- **전환은 상태 조건을 건 쓰기다** — 여러 대 · 여러 자리에서 겹쳐도 한 번만 바뀐다.
  - 예약: `CONFIRMED → CHECKED_IN`, `CONFIRMED | CHECKED_IN → COMPLETED`
  - 호실: 바꿀 수 있는 상태일 때만
  - crontab 은 `JobLockService.runExclusive` · 운영(`NODE_ENV=production`)에서만 돈다.
- **호실 상태 규칙** — 업체 관리자가 사용중을 직접 바꾸는 전이는 지금도 없다.
  - 시작: 예약가능 · 예약완료 · 정비중 → 사용중, 사용중지 · 사용중 → 그대로
  - 끝 · 이용 중 업체 취소: 사용중 → 정비중, 그 밖 → 그대로
- **끝난 시간대 재판매** — 이용 완료 · 취소는 점유 예약이 아니라 시간이 풀린다.
  - 정비중인 동안 30분 안 즉시 예약은 막힌다(지금 재고 판정).
  - 다음 예약이 시작하면 사용중이 된다.
- **이용 중 취소 요청**
  - 대상: 내 업체 예약 · 시작 뒤 · 끝 전 · 확정 또는 이용 중 · 예약자 휴대폰 번호 있음(없으면 400 `예약자 휴대폰 번호가 없어 동의를 받을 수 없습니다.`)
  - 만료: `min(요청 + 10분, 예약 끝)`. 만료는 읽을 때 계산한다(요청 중인데 만료 시각이 지나면 만료로 본다).
  - 진행 중 요청(`REQUESTED`)은 예약당 1건이다(부분 유니크). 새 요청이 오면 이전 요청을 만료로 바꾸고 넣는다.
  - 승인 · 거절은 그 예약의 마지막 요청이 요청 중이고 만료 전일 때만 된다(아니면 400). 승인 때 예약이 이미 끝났거나 취소됐으면 400(상태 바뀜)이다.
- **SMS 는 마지막 단계다** — 요청 SMS 가 실패하면 요청 쓰기를 롤백한다(503 재시도). 링크 SMS 는 crontab 안에서 표시를 되돌린다.
- 서버 위치: 업체 관리자 요청은 admin-service, 이용자 승인 · 거절 · 조회는 user-service, 전환 · 링크 SMS 는 scheduler 다(행위자별 서버 — AGENTS.md).

## TDD Cases

- [CASES:usage-transition] 확정 · 지금 = 시작 정각 → 시작
- [CASES:usage-transition] 확정 · 지금 = 시작 − 1초 → 그대로
- [CASES:usage-transition] 확정 · 지금 = 끝 − 1초(crontab 이 늦음) → 시작
- [CASES:usage-transition] 확정 · 지금 = 끝 정각(시작을 놓침) → 종료
- [CASES:usage-transition] 이용 중 · 지금 = 끝 − 1초 → 그대로
- [CASES:usage-transition] 이용 중 · 지금 = 끝 정각 → 종료
- [CASES:usage-transition] 결제 대기 · 지금 = 시작 → 그대로
- [CASES:usage-transition] 이용 완료 · 취소 · 만료 → 그대로
- [CASES:room-state] 예약가능 · 예약완료 · 정비중 + 시작 → 사용중
- [CASES:room-state] 사용중 · 사용중지 + 시작 → 그대로
- [CASES:room-state] 사용중 + 종료 → 정비중
- [CASES:room-state] 예약가능 · 사용중지 · 정비중 + 종료 → 그대로
- [CASES:cancel-refund] 확정 · 마감 전 · 30,000원 → 30,000
- [CASES:cancel-refund] 확정 · 마감 정각 · 50% · 30,000원 → 15,000
- [CASES:cancel-refund] 확정 · 마감 뒤 · 50% · 33,333원 → 16,666(원 단위 내림)
- [CASES:cancel-refund] 확정 · 마감 뒤 · 0% → 0(환불 없이 취소)
- [CASES:cancel-refund] 확정 · 시작 정각 · 사용중지 아님 → 취소 불가
- [CASES:cancel-refund] 이용 중 · 사용중지 아님 → 취소 불가
- [CASES:cancel-refund] 확정 · 마감 뒤 · 사용중지 → 30,000(100%)
- [CASES:cancel-refund] 확정 · 시작 뒤 · 사용중지 → 30,000
- [CASES:cancel-refund] 이용 중 · 끝 − 1초 · 사용중지 → 30,000
- [CASES:cancel-refund] 이용 중 · 끝 정각 · 사용중지 → 취소 불가
- [CASES:cancel-request] 요청 13:00 · 예약 끝 15:00 → 만료 13:10
- [CASES:cancel-request] 요청 14:55 · 끝 15:00 → 만료 15:00(끝이 먼저)
- [CASES:cancel-request] 요청 14:50 · 끝 15:00 → 만료 15:00(같음)
- [CASES:cancel-request] 요청 중 · 지금 = 만료 − 1초 → 요청 중 · 승인 가능
- [CASES:cancel-request] 요청 중 · 지금 = 만료 정각 → 만료 · 불가
- [CASES:cancel-request] 승인 · 거절 · 만료(저장) → 그대로 · 불가
- [FAIL:validation] 이용 중 취소 요청 — 사유 없음 · 너무 김 · 예약 ID 형식 → 400
- [FAIL:validation] 승인 · 거절 · 요청 조회 — 예약 ID 형식 → 400
- [FAIL:duplicate] 이용 중 취소 요청 — 진행 중 요청 부분 유니크 위반(겹친 요청) → 400 `이미 진행 중인 취소 요청이 있습니다.`
- [SMOKE:data-access] 이용 전환 대상(시작 · 종료) · 링크 SMS 대상(번호 · 업체 조인) · 업체 현황 예약(마지막 취소 요청 서브쿼리) · 내 예약 목록 · 상세(호실 상태)
- 테스트 생략(위임형): gateway 라우트 · 모듈 등록 · contracts 경로 상수 · 시드 행 — 프로젝트 규칙상 gateway · controller spec 을 두지 않는다

## Notes

- 근거 코드
  - 내 예약 QR: `apps/user-service/src/reservation/reservation.service.ts` `getMyReservationQr`, `judgeReservationQr`(reservation.util.ts)
  - 이용자 취소: `cancelReservation` · `calculateRefundAmount` — 마감 정각은 비율, 시작 정각은 불가
  - QR 동기화 대상: `apps/scheduler/src/reservation/repositories/reservation.repository.ts` `buildQrSyncTargetsQuery` — 확정 · 이용 중 · 이용 구간
  - scheduler 여러 쓰기는 repository 의 `txHost.withTransaction`(`transitionPending`)
- 구간(`t_reservation_detail`) 상태 CHECK 는 결제 대기 · 확정 · 취소 · 만료뿐이다. 이용 중 · 완료는 예약 표에만 둔다(구간은 확정 그대로).
- 기존 SMS 인증 표(`t_sms_verification`)는 쓰지 않는다 — 동의는 링크 + 로그인 승인으로 바뀌었다(사용자 결정 2026-11-07).
- scheduler 에 `SmsModule` 을 붙인다. `compose.scheduler.yml` 이 비우던 `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` 를 넘기게 바꾼다.
- 프론트(Next.js) 화면이 필요하다:
  - 예약 1건 화면(`/reservation/<id>` — 'QR 확인' 버튼)
  - 취소 동의 화면(`/reservation/<id>/cancel-request`)
  - 사용중지 전액 환불 버튼
- 연장(#81, Phase 26)은 그대로 뒤에 남는다.

## Proposals (Codebase-Based)

- [x] 이용 시작 전환을 QR 발급과 묶는다 — scheduler(1분) · 결제 확인 · 내 예약 QR 세 자리가 같은 판정 util · 같은 호실 규칙을 쓴다(user-service 는 repository 메서드 하나, scheduler 는 자기 repository 메서드)
- [x] 문 열림 로그는 QR 확인 안에서 DB 를 먼저 본다(없는 QR 이면 Redis 를 안 본다) — 로그에 예약을 바로 붙일 수 있다
- [x] 요청 만료는 저장하지 않고 읽을 때 계산한다 — 만료용 crontab 이 필요 없다(새 요청이 이전 요청을 만료로 바꾼다)

## Decisions

- [x] 체크인 · 체크아웃 API 없음 — 시간이 되면 권한, 지나면 끝(사용자 결정 2026-11-07, #82 dropped)
- [x] 시작 시각에 손님이 안 와도 호실 사용중(사용자 결정 2026-11-07)
- [x] 끝나면 정비중 → 업체가 예약가능으로(사용자 결정 2026-11-07)
- [x] checked_in_at · completed_at 삭제, QR 문 열림 로그만 쌓기(사용자 결정 2026-11-07)
- [x] 사용중지 호실은 상태 그대로 + 이용자 전액 환불 취소(기존 취소 API + `is_room_disabled`, 사용자 결정 2026-11-07)
- [x] 이용 중 업체 취소는 이용자 동의 — 링크 SMS + 로그인 승인 · 거절, 10분, 전액 환불, 결과는 업체 예약 현황(사용자 결정 2026-11-07)
- [x] 내 예약 QR 은 이용 중에만, 링크 SMS 는 예약 1건 화면으로(사용자 결정 2026-11-07)
- [x] 한 Phase 로(사용자 결정 2026-11-07)
- [x] TDD — 이용 전환 판정 · 이용자 취소 환불액 · 이용 중 취소 요청 상태(사용자 결정 2026-11-07)
