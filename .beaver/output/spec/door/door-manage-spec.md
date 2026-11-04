---
# One-line feature summary
feature_goal: "문 관리 · QR 확인(Phase 15) — 호실 목록에 문 상태 · 업체 관리자 바로 열기, 이용 시작 때 QR 발급(DB 이력 + Redis 현재 QR) · 이용자 QR 조회(없으면 그 자리에서 발급), 문 프로그램이 업체 소켓(gateway 표준 WebSocket · 업체 ID + 시크릿)으로 QR 확인 · 잠금 알림 · 바로 열기 명령을 주고받는다, HTTP 문 열기 · 닫기 API 는 없앤다, 업체 시크릿 코드 설정"

# Domain/module name
domain: "door"

# Entry-point method/endpoint
api_method: "새 공개 3개(호실 바로 열기 · 내 예약 QR · 업체 문 시크릿) + 소켓 1개(gateway /ws/v1/door) + 내부 HTTP 3개(gateway → admin-service: 소켓 접속 · QR 확인 · 잠금) + crontab 1개(scheduler QR 맞추기) + 기존 변경 3개(호실 목록 · 업체 취소 · 내 업체 상세) + 삭제 2개(HTTP 문 열기 · 닫기)"

# Path/signature
api_path: "apps/admin-service/src/room · apps/admin-service/src/store · apps/user-service/src/reservation · apps/scheduler/src/reservation · apps/gateway/src/modules/door-socket · libs/integration/src/door · libs/contracts/src/{door,room,store,reservation} (삭제: apps/user-service/src/door · apps/gateway/src/api/v1/user-service/door · libs/contracts/src/door/dto)"

# Affected state
affected_data: ["t_room_qr (새 테이블 — 호실 QR 이력 · 유효 시작 · 종료, 쓰기: QR 발급 · 업체 취소)", "t_store (+ door_secret — 업체 문 시크릿 bcrypt 해시)", "Redis door:<room_id> (값 QR:상태:시각 → 상태:시각)", "Redis door-qr:<room_id> (새 — 그 호실의 현재 유효 QR, 만료 = 유효 종료)", "Redis 채널 door-commands (관리자 바로 열기 명령)", "t_reservation · t_room · t_room_group · t_store (읽기)"]
---

## Feature Description

로드맵 Phase 15(#110 · #111 · #112) — 업체 관리자는 자기 업체 호실 문의 상태를 보고 문을 바로 열어 주고, 이용자는 이용 시간에 내 예약의 QR 을 받아 문에 댄다. 여기에 **문 쪽 타 업체 프로그램이 업체 단위로 붙는 실시간 소켓**을 더한다(사용자 결정 2026-11-04).

- **QR 은 문에서 확인한다** — 이용자가 QR 을 문에 대면 문 프로그램이 읽어 소켓으로 서버에 묻고(`door.verify`), 서버가 Redis 의 그 호실 **현재 QR** 과 비교해 맞으면 열림으로 기록하고 답한다(`door.verified`). 문은 그 답을 보고 연다. QR 값은 서버 밖으로 나가지 않는다(사용자 결정 2026-11-04 — 문 프로그램이 Redis 에 직접 붙지 않는다).
- **HTTP 문 열기 · 닫기 API 는 없앤다**(사용자 결정 2026-11-04) — 문과의 모든 주고받기는 소켓이다. 하드웨어가 잠기면(잠금 버튼 · 자동 잠금) 문 프로그램이 소켓으로 알린다(`door.closed`).
- **QR 은 DB 에 이력, Redis 에 현재 값** — 새 테이블 `t_room_qr`(호실 FK · 예약 FK · QR · 유효 시작 · 유효 종료)에 모든 QR 을 남기고, Redis `door-qr:<room_id>` 에는 그 호실의 지금 유효한 QR 하나를 둔다(만료 = 유효 종료 — 이용이 끝나면 저절로 사라진다).
- **QR 은 이용 시간에만** — 미래 예약에 미리 발급하지 않는다(문마다 지금 쓰는 사람의 QR 만 있어야 한다). 이용 시작 시각에 scheduler 가 발급하고, 이용자가 이용 시간 안에 조회했는데 아직 없으면 그 자리에서 발급한다. 업체가 이용 중 예약을 취소하면 DB 유효 종료를 지금으로 바꾸고 Redis 에서 지운다(이력은 남는다).
- **바로 열기** — 업체 관리자가 누르면 Redis 문 상태를 open + 지금 시각으로 바꾸고, 그 업체 소켓에 열기 명령(`door.open`)을 보낸다.

## Entry Point

| # | Method | Path (공개) | 경로 | 가드 | 하는 일 |
|---|---|---|---|---|---|
| 110 | GET | `/api/v1/admin-service/room` (기존) | 동기 | 매니저 | 호실 목록 항목에 `door_state` · `door_changed_at` 추가 |
| 111 | POST | `/api/v1/admin-service/room/:room_id/door-open` | 동기 | 매니저 | 바로 열기 — 문 open + 지금 시각, 그 업체 소켓에 `door.open` |
| 112 | GET | `/api/v1/user-service/reservation/:reservation_id/qr` | 동기 | 이용자 | 내 예약 QR — 이용 시간 안의 확정 · 이용 중 예약만, 없으면 발급 |
| 114 | PATCH | `/api/v1/admin-service/store/mine/door-secret` | 큐 `admin.store.mine-door-secret` | 매니저 + 업체 총관리자 | 업체 문 시크릿 코드 설정(bcrypt 해시 저장) |
| 115 | WS | `/ws/v1/door` (gateway) | 소켓 | 헤더 `x-store-id` · `x-store-secret` | 업체 문 소켓 — 접속 때 문 상태 전체, QR 확인 · 잠금 알림 · 바로 열기 명령 |

기존 API 변경 · 삭제:

| API | 바뀌는 것 |
|---|---|
| `PATCH /api/v1/user-service/reservation/:reservation_id/store-cancel` | 이용 중 예약이면 그 QR 의 유효 종료를 지금으로 + Redis 현재 QR 에서 지운다 |
| `GET /api/v1/admin-service/store/mine` | `is_door_secret_set`(0/1) 추가 — 시크릿 원문은 돌려주지 않는다 |
| `POST /api/v1/user-service/door/open` · `/close` | **삭제** — 소켓의 `door.verify` · `door.closed` 로 바뀐다(문 쪽 프로그램 연동 규격 변경) |

내부 HTTP(gateway 소켓 → admin-service, 내부 토큰만 — actor 없음):

| Method | 내부 경로 | 하는 일 |
|---|---|---|
| POST | `/internal/v1/admin-service/room/door-snapshot` | 업체 ID · 시크릿 확인 → 그 업체 호실 전체의 문 상태(소켓 접속) |
| POST | `/internal/v1/admin-service/room/door-verify` | 그 업체 호실의 현재 QR 과 비교 → 맞으면 open + 지금 시각, `{room_id, ok}` |
| POST | `/internal/v1/admin-service/room/door-close` | 그 업체 호실 문을 close + 지금 시각(소켓 잠금 알림) |

crontab(scheduler — 운영 전용 · `JobLockService`):

| 이름 | 주기 | 하는 일 |
|---|---|---|
| `reservation-qr-sync` | 1분 | 이용 중(시작 ≤ 지금 < 끝)인 확정 · 이용 중 예약 — QR 이 없으면 발급(DB), 있는 QR 은 Redis 현재 QR 로 다시 쓴다(한쪽 쓰기 실패 · Redis 재시작에도 맞춰진다) |

**소켓 규격**(표준 WebSocket — 메시지는 JSON 한 개 `{"event", "data"}`):

| 방향 | event | data |
|---|---|---|
| 서버 → 문 프로그램 | `door.snapshot` | `{store_id, list: [{room_id, room_name, floor, door_state, door_changed_at}]}` — 접속 직후 1번, 지워지지 않은 호실 전체(층 · 호실명 순) |
| 문 프로그램 → 서버 | `door.verify` | `{room_id, qr}` — 문이 읽은 QR |
| 서버 → 문 프로그램 | `door.verified` | `{room_id, ok}` — 그 연결에만. ok 면 서버는 이미 open + 시각으로 기록했다 → 문을 연다 |
| 서버 → 문 프로그램 | `door.open` | `{room_id}` — 관리자 바로 열기(그 업체 연결 모두 — 호실이 맞는 문만 연다) |
| 문 프로그램 → 서버 | `door.closed` | `{room_id}` — 하드웨어가 잠겼다(잠금 버튼 · 자동 잠금). 성공은 답하지 않는다 |
| 서버 → 문 프로그램 | `error` | `{status_code, message}` — 받은 메시지를 처리하지 못했을 때(연결은 유지) |

- 접속: `GET /ws/v1/door` 업그레이드 요청에 헤더 `x-store-id`(업체 ID) · `x-store-secret`(시크릿 코드). 틀리면 업그레이드 전에 HTTP 401 로 거절(연결 안 됨).
- 예: `{"event": "door.verify", "data": {"room_id": "9f3c…e1", "qr": "a1b2…"}}` → `{"event": "door.verified", "data": {"room_id": "9f3c…e1", "ok": true}}`
- Response 예(내 예약 QR): `{"reservation_id", "room_id", "qr", "qr_starts_at": "2026-11-04T01:00:00.000Z", "qr_ends_at": "2026-11-04T04:00:00.000Z"}`

## Business Rules

### 문 정보 저장 (Redis · DB)

- **Redis `door:<room_id>`** = `상태:시각`(`open|close:yyyyMMddHHmmss`, 기록 없음 `close:00000000000000`). Phase 14 의 `QR:상태:시각` 값은 읽을 때 뒤의 두 칸만 쓴다(데이터 정리 없이 읽힌다).
- **Redis `door-qr:<room_id>`** = 그 호실의 현재 유효 QR(32자), 만료(`PXAT`) = 그 QR 의 유효 종료. 없으면 그 호실은 지금 QR 로 열 수 없다. Phase 14 의 `door-qr:<QR>` 색인은 발급한 적이 없어(issueQr 호출 0) 남은 키가 없다.
- **QR 확인 · 열림 기록은 Lua 1개** — 현재 QR 이 같을 때만 상태를 open + 시각으로 쓴다(비교와 쓰기가 어긋나지 않는다). 바로 열기는 상태 쓰기 + 채널 `door-commands` 에 `{store_id, room_id, command: 'open'}` PUBLISH 를 Lua 1개로. 현재 QR 지우기는 값이 같을 때만(다른 QR 을 지우지 않는다).
- **`t_room_qr`** — 예약 1건에 QR 1개(UK 예약), QR 값은 32자 무작위(UK QR). 유효 시작 = 이용 시작, 유효 종료 = 이용 끝(업체 취소 때 지금). 행을 지우지 않는다(이력).
- **DB 와 Redis 맞추기** — 발급 · 업체 취소는 DB 를 쓴 뒤 Redis 를 쓰고, Redis 가 실패하면 503 으로 DB 도 되돌린다(같은 트랜잭션). scheduler 가 1분마다 이용 중 예약의 QR 을 Redis 에 다시 써서 어긋남을 메운다.

### 호실 목록 문 상태 (#110)

- 기존 호실 목록(필터 · 페이지 · 정렬 그대로)에 그 페이지 호실들의 문 상태를 Redis 에서 한 번에 읽어(MGET) 붙인다. 기록 없는 문은 `close` · `00000000000000`.
- Redis 에 닿지 못하면 호실 목록도 503(사용자 결정 2026-11-04 — 호실 목록에 합친다).

### 바로 열기 (#111)

- 내 업체의 지워지지 않은 호실만(없으면 404 `호실을 찾을 수 없습니다.`). 사용중지 · 예약 여부는 보지 않는다(관리자 판단).
- Redis 만 바꾼다(DB 쓰기 없음 — 동기 경로). 그 업체 소켓 연결 모두에 `door.open {room_id}` — 붙어 있는 문 프로그램이 없으면 상태만 바뀐다. 결과 `{room_id, door_state: 'open', door_changed_at}`.

### 내 예약 QR (#112)

판정(입력 = 예약 상태 · 이용 구간 · 그 예약의 QR 행 · 지금):

| 조건 | 결과 |
|---|---|
| 예약이 내 것이 아님 · 없음 | 404 `예약을 찾을 수 없습니다.` |
| 상태가 확정(`CONFIRMED`) · 이용 중(`CHECKED_IN`)이 아님 | 400 `QR 을 볼 수 없는 예약입니다.` |
| 지금이 이용 구간 `[start_at, end_at)` 밖 | 400 `QR 은 이용 시간에만 볼 수 있습니다.` |
| 이용 구간 안 · QR 행이 있고 지금 유효 | 그 QR |
| 이용 구간 안 · QR 행이 없음 | **그 자리에서 발급**(유효 = 이용 시작 ~ 이용 끝) 후 그 QR (사용자 결정 2026-11-04) |
| 이용 구간 안 · QR 행이 있지만 유효 종료가 지남 | 400 `QR 을 볼 수 없는 예약입니다.` (업체가 끝낸 QR) |

- 내주는 QR 은 Redis 현재 QR 로도 쓴다(보여 주는 QR 로 문이 반드시 열리게 — 발급 · 기존 둘 다).
- scheduler 발급과 겹쳐 같은 예약에 두 번 넣으려 하면 DB 가 무시한다(ON CONFLICT DO NOTHING) — 다시 읽은 행을 쓴다.

### QR 맞추기 crontab

- 1분마다 확정 · 이용 중 예약 중 `start_at ≤ 지금 < end_at` 인 건을 QR 행과 함께 읽는다. QR 행이 없으면 발급(유효 = 이용 시작 ~ 이용 끝)하고, 유효한 QR 은 Redis 현재 QR 로 다시 쓴다(같은 값이면 그대로 — 멱등). 한 건 실패는 건너뛰고 다음 회차에 다시.
- 운영(`NODE_ENV=production`)에서만, `JobLockService.runExclusive('reservation.qr-sync')`.

### QR 확인 · 잠금 (소켓)

- **QR 확인** — 그 업체의 지워지지 않은 호실이 아니면 `error` 404 `호실을 찾을 수 없습니다.` 호실이면 Redis 현재 QR 과 비교: 같으면 open + 지금 시각 · `door.verified {ok: true}`, 다르거나 없으면 `{ok: false}`(상태는 그대로).
- **잠금 알림** — 그 업체의 지워지지 않은 호실이면 close + 지금 시각(성공은 답하지 않는다), 아니면 `error` 404.
- 서버는 문을 직접 움직이지 않는다 — 문 프로그램이 답과 명령을 보고 움직인다.

### 업체 취소 (기존 API 변경)

- 취소하는 예약에 QR 행이 있고 아직 유효하면(`ends_at > 지금`) DB 유효 종료를 지금으로 바꾸고 Redis 현재 QR 에서 그 QR 을 지운다(같은 트랜잭션 — Redis 실패면 503 · 롤백 · 재시도). 시작 전 예약은 QR 이 없어 할 일이 없다. SMS 는 여전히 마지막 단계.

### 업체 문 시크릿 (#114)

- 업체 총관리자만(`@Roles(HEAD_MANAGER)` — 업체 관리자는 403). 영문 · 숫자 16 ~ 64자.
- bcrypt 해시로 `t_store.door_secret` 에 저장, 원문은 저장 · 조회하지 않는다(잊으면 새로 정한다). 내 업체 상세에는 `is_door_secret_set` 만.
- 바꿔도 이미 붙어 있는 소켓은 끊지 않는다 — 다음 접속부터 새 코드.

### 실시간 소켓 (#115)

- **gateway 가 받는다**(사용자 결정 2026-11-04 — 유일한 바깥 입구). 표준 WebSocket(`ws` 패키지 — 사용자 결정 2026-11-04). 접속 확인 · QR 확인 · 잠금은 admin-service 내부 HTTP, 바로 열기 명령은 Redis 채널 `door-commands` 구독.
- **접속** — 업그레이드 요청 헤더의 업체 ID · 시크릿을 admin-service 가 확인한다: 지워지지 않고 탈퇴(LEAVE)하지 않은 업체 · 시크릿이 정해져 있음 · bcrypt 일치. 영업 상태(영업중지 · 영업중 아님)는 보지 않는다(문은 영업과 별개). 틀리면 401 `업체 ID 또는 시크릿 코드가 올바르지 않습니다.` 로 업그레이드 전에 거절. admin-service · Redis 에 닿지 못하면 503 으로 거절.
- **명령 전달** — gateway 인스턴스마다 `door-commands` 를 구독하고, 받은 명령의 `store_id` 에 붙은 자기 인스턴스 연결들에 `door.open` 을 보낸다(여러 대여도 각자 구독 — sticky 불필요).
- **연결 유지** — 서버가 30초마다 ping, 다음 ping 때까지 pong 이 없으면 끊는다. 재연결은 문 프로그램이 한다(다시 붙으면 `door.snapshot` 부터).
- 알 수 없는 메시지 · JSON 이 아닌 메시지는 `error` 400 `알 수 없는 메시지입니다.`(연결 유지).

## Notes

- **로드맵 구조 변경** — 이번 Phase 에 소켓(#115) · 시크릿(#114)과 QR 테이블이 더해지고, Phase 14 #109(문 열기 · 닫기 API)가 소켓으로 바뀐다. 유닛 추가는 `/beaver:roadmap` 몫이라 이 기획 승인 뒤에 반영한다(plan Prerequisites).
- **Phase 14 대비 바뀌는 것** — HTTP 문 열기 · 닫기 API 와 user-service 문 도메인 · gateway 문 라우트 삭제(문 쪽 프로그램 연동 규격 변경 — 사용자 안내 필요), Redis 값 모양(`QR:상태:시각` → `상태:시각` + `door-qr:<room_id>`), 포트 `issueQr` · `get` 없앰, 문 시각 util(`toDoorTime`)은 `libs/integration` 으로.
- **Redis 를 쓰는 앱** — user-service(QR 발급 · 업체 취소) · admin-service(호실 목록 · 바로 열기 · 소켓 접속 · QR 확인 · 잠금 — 새로 연결) · scheduler(QR 맞추기 — 새로 연결) · gateway(명령 구독 — 새로 연결, `roomless-data` 네트워크 추가).
- **Phase 19 와 맞물림** — #78(이용 시작 5분 전 QR 링크 SMS)은 QR 이 시작 시각부터 나오므로 링크 화면이 시작 전에는 "이용 시간에만" 을 보인다. #79(체크인 = 이용 시간 안 첫 문 열기)는 `door.verify` 가 맞았을 때 그 QR 의 예약(`t_room_qr`)으로 체크인할 수 있다. 체크아웃(#82)도 유효 종료를 지금으로 + Redis 에서 지우는 방식을 쓸 수 있다.
- **소켓이 끊기면 문은 QR 로 열 수 없다** — 서버가 비교하는 구조라서다(QR 값을 문에 내려 두지 않는 대가). 문 프로그램의 재연결 · 기계식 비상 열쇠는 문 업체 몫.
- **시크릿 대입 공격** — 소켓 접속 시도 횟수 제한은 두지 않는다(bcrypt 비교라 느리다). 남용이 보이면 접속 제한을 붙인다.
- **소켓은 인스턴스 연결** — 연결 목록은 gateway 인스턴스 메모리에 있다(연결 자체가 인스턴스에 붙어 있으므로 "인스턴스 로컬 상태 금지" 의 예외 — 상태 원본은 Redis · DB).

## Proposals (Codebase-Based)

- [x] 바로 열기 · 소켓 접속 · QR 확인 · 잠금을 admin-service room 도메인에 — 호실 목록과 같은 `findManagerStore` · 호실 조회(apps/admin-service/src/room/room.service.ts:749)를 쓴다(사용자 결정 2026-11-04).
- [x] 비교 + 쓰기, 쓰기 + 알림을 Lua 1개로 — 기존 열기 · 닫기 · 발급이 Lua 1개씩인 방식(libs/integration/src/door/redis-door.store.ts:15)을 따른다.
- [x] 시크릿 해시는 비밀번호와 같은 bcrypt util(libs/common/src/utils/bcrypt.ts) — 새 암호 방식을 만들지 않는다.
- [x] 큐 쓰기 · 그룹 안 권한은 업체 총관리자 라우트 방식(`@UseGuards(PassportJwtManagerAuthGuard, RolesGuard)` + `@Roles(AUTH_ID.HEAD_MANAGER)` — apps/gateway/src/api/v1/admin-service/manager/controllers/manager.controller.queue.ts)을 따른다.
- [x] QR 맞추기 crontab 은 결제 대기 만료 crontab(apps/scheduler/src/reservation/crontabs/reservation-payment-expire.crontab.ts)과 같은 틀(운영 가드 · JobLock · 건별 catch).

## Decisions

- [x] 매니저 문 API 위치 — admin-service(사용자 결정 2026-11-04), 바로 열기는 room 도메인(`/api/v1/admin-service/room/:room_id/door-open`)
- [x] 문 목록 모양 — 따로 두지 않고 기존 호실 목록에 문 상태 · 시각을 더한다(Redis 장애 시 호실 목록도 503)
- [x] QR 발급 시점 — 미래 예약에 미리 주지 않는다. 이용 시작 시각에 scheduler 가 발급, 이용 시간 안에 조회했는데 없으면 그 자리에서 발급
- [x] QR 만료 — 이용 끝 시각에 자동(유효 종료 — Redis 현재 QR 도 그때 사라진다)
- [x] 업체가 이용 중 예약을 취소하면 — QR 을 무효로 하되 이력을 남긴다: 새 테이블 `t_room_qr`(호실 FK · 유효 시작 · 종료), 취소 때 유효 종료 = 지금
- [x] QR 저장 — DB 는 모든 QR 이력, Redis 는 호실별 현재 유효 QR(사용자 결정 2026-11-04)
- [x] 문이 QR 을 확인하는 방식 — 문 프로그램이 소켓으로 묻고(`door.verify`) 서버가 Redis 현재 QR 과 비교해 답한다(`door.verified`). QR 값은 밖으로 나가지 않는다. 문 프로그램은 Redis 에 직접 붙지 않는다
- [x] HTTP 문 열기 · 닫기 API — 없앤다(소켓으로 대체). 하드웨어 잠금은 소켓 `door.closed`
- [x] 바로 열기 — Redis open + 시각, 그 업체 소켓에 `door.open` 명령
- [x] 실시간 소켓 — gateway, 표준 WebSocket(`ws`), 접속 헤더 `x-store-id` · `x-store-secret`(틀리면 401)
- [x] 업체 시크릿 — 업체 총관리자가 직접 입력(영문 · 숫자 16 ~ 64자), bcrypt 해시 저장. 경로는 형제 `PATCH /mine/reservation-policy` 를 따라 PATCH(질문 때 보인 PUT 에서 바꿈 — 업체 컬럼 하나만 바꾸는 쓰기)
- [x] TDD — 내 예약 QR 판정 표 10건(6번은 "QR 없음 → 발급 후 내줌" 으로 바꿈)
