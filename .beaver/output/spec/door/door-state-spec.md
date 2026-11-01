---
# One-line feature summary
feature_goal: "문 상태(Phase 14 재정의) — 호실 문마다 QR 정보 · 열림/닫힘 · 마지막 시각을 Redis 에 두고, 문 쪽 프로그램이 부르는 문 열기(QR) · 문 닫기 API 2개를 만든다. Redis 를 Docker 묶음으로 관리하고 실행 가이드를 정리한다"

# Domain/module name
domain: "door"

# Entry-point method/endpoint
api_method: "게이트웨이 공개 API 2개(동기 — 인증 없음) → user-service door 도메인 내부 HTTP"

# Path/signature
api_path: "POST /api/v1/user-service/door/open · POST /api/v1/user-service/door/close → /internal/v1/user-service/door/open · /close"

# Affected state
affected_data: ["Redis door:<room_id> (문 정보 'QR:상태:시각' — 열기 · 닫기 · QR 발급이 쓴다)", "Redis door-qr:<QR> (QR → room_id — QR 발급이 쓰고 지운다, 열기가 읽는다)", "t_room (읽기만 — 닫기의 호실 확인)"]
---

## Feature Description

로드맵 Phase 14 를 다시 정한다(사용자 결정 2026-11-01). 원래 계획(사물 스키마 `t_device*` · 기기 명령 포트 `DeviceGateway` · 실제 기기 플랫폼 연동)은 하지 않는다 — **기기 제어는 전부 빼고 문 상태만 관리한다.**

- **문 정보** — 호실 문(room_id)마다 `QR 정보 : 상태(open | close) : 마지막으로 열거나 닫은 시각(한국 시각 yyyyMMddHHmmss)` 을 Redis 에 둔다. 한 번도 열거나 닫은 적 없는 문의 시각은 `00000000000000`.
- **QR 정보** — 호실을 쓰는 예약 건마다 계속 새로 발급한다(이전 QR 은 무효). 시간이 되면 예약자는 로그인한 상태로 QR 을 보는 웹페이지 링크를 받는다(로드맵 Phase 15 #112 내 예약 방 · QR 확인 · Phase 19 #78 링크 발송 + 프론트 연계 — 이번 범위 밖). 이번에는 발급 기능을 포트에만 둔다.
- **문 열기** — 예약자가 우리 웹페이지의 QR 을 문에 대면, 문에 연결된 타 업체 프로그램이 그 QR 정보를 우리 서버에 넘긴다. 같은 QR 을 가진 문이 있으면 Redis 의 그 문을 open + 지금 시각으로 바꾸고 room_id 를 돌려준다. **딱 여기까지** — 체크인 · 예약 확인 같은 다른 처리는 하지 않는다. QR 은 절대 겹치지 않는다(두 문이 같은 QR 을 가질 수 없다).
- **문 닫기** — 권한 없이 그 호실 문을 close + 지금 시각으로 바꾼다.
- **Redis 기반** — Redis 를 Docker 묶음(`compose.redis.yml`)으로 관리하고, 앱 공용 연결(`RedisModule`)과 문 정보 포트(`DOOR_STORE`)를 `libs/integration` 에 둔다. 로드맵 Phase 23 #95(Redis 기반) 일부를 앞당긴다. 실행 가이드(README 실행 절 · `docs/guides/redis-setup.md`)를 함께 정리한다.

## Entry Point

| # | Method | 공개 경로 | 내부 경로 | 전달 | 인증 | service 메서드 | 입력 DTO | 결과 |
|---|---|---|---|---|---|---|---|---|
| 1 | POST | `/api/v1/user-service/door/open` | `/internal/v1/user-service/door/open` | 동기 | 없음(QR 이 열쇠) | `openDoor(dto)` | `DoorOpenDto {qr}` | `DoorOpenResultDto {room_id, door_state: 'open', door_changed_at}` |
| 2 | POST | `/api/v1/user-service/door/close` | `/internal/v1/user-service/door/close` | 동기 | 없음 | `closeDoor(dto)` | `DoorCloseDto {room_id}` | 없음(200 빈 본문) |

- Method: POST (둘 다)
- Path: 위 표
- Request: `{"qr": "<32자 hex>"}` / `{"room_id": "<32자 hex>"}`
- Response: 열기 `{"room_id": "…", "door_state": "open", "door_changed_at": "20261101022459"}` / 닫기 빈 본문. 실패는 공통 `ApiFailResultDto {message, validation_errors}`.

**포트 `DOOR_STORE`(libs/integration — API 가 아니다)**

| 메서드 | 하는 일 | 이번에 부르는 곳 |
|---|---|---|
| `open(qr, changed_at)` | QR 로 문을 찾아 open + 시각, room_id 반환(없으면 null) | 문 열기 |
| `close(room_id, changed_at)` | 그 문을 close + 시각(QR 은 그대로) | 문 닫기 |
| `issueQr(room_id)` | 새 QR 발급 — 겹치지 않는 값으로 바꾸고 이전 QR 무효, 상태 · 시각은 그대로 | 없음(Phase 15 #112 — 예약 건마다 발급) |
| `get(room_id)` | 문 정보 읽기 — 기록 없으면 `{qr: null, state: 'close', changed_at: '00000000000000'}` | 없음(Phase 15 #110 · #112 — 문 목록 · QR 화면) |

**Redis 저장 모양**

| 키 | 값 | 예 |
|---|---|---|
| `door:<room_id>` | `QR:상태:시각` | `9f3c…e1:open:20261101022459` · QR 없음 `:close:00000000000000` |
| `door-qr:<QR>` | `room_id` | QR 로 문 찾기 · 중복 방지(발급 때 `SET NX`) |

## Business Rules

- **QR 은 겹치지 않는다** — 발급은 `door-qr:<QR>` 를 `SET NX` 로 먼저 잡고 성공해야 문 정보에 넣는다(Lua 스크립트 1개로 원자적). 잡지 못하면 새 값으로 다시(최대 3번, 32자 무작위라 사실상 첫 번에 끝난다). 새로 발급하면 이전 QR 의 `door-qr:` 키를 지워 이전 QR 로는 열 수 없다.
- **열기는 QR 로만 찾는다** — `door-qr:<QR>` 가 없으면 404 `일치하는 QR 정보가 없습니다.` 찾기와 open 쓰기는 Lua 스크립트 1개(그 사이 QR 이 바뀌어 옛 QR 로 덮어쓰는 일이 없다).
- **닫기는 호실이 있어야 한다** — DB 에 지워지지 않은 호실이 없으면 404 `호실을 찾을 수 없습니다.` — 인증 없는 API 라 아무 값으로 Redis 키가 쌓이지 않게. 문 기록이 없던 호실이면 QR 없이 `:close:<시각>` 을 만든다.
- **시각** — 한국 시각 `yyyyMMddHHmmss`(밀리초 버림), `@app/common/utils/dayjs.js` 로 만든다(door.util.ts `toDoorTime`). 기록 없음은 `00000000000000`.
- **인증 없음** — QR 은 32자 무작위(uuid v4 — 추측 불가)라 QR 자체가 열쇠다. 문 쪽 프로그램 인증 키는 두지 않는다(사용자 선호 없음 — 이 결정의 위험은 Notes).
- **동기 경로** — 문 쪽 프로그램이 열지 말지를 바로 받아야 하고 DB 쓰기 · 트랜잭션이 없다(로그인 · 토큰 재발급처럼). 큐 · SSE 를 쓰지 않는다.
- **Redis 장애** — Redis 가 없거나 끊겨도 서버는 뜬다(부팅을 막지 않는다). 그동안 문 API 는 503 `상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.` 끊긴 동안 명령을 쌓아 두지 않는다(`disableOfflineQueue`).
- **영속** — Redis 는 캐시가 아니라 문 정보의 원본이라 Docker 묶음은 AOF(`appendonly yes`)로 디스크에 남긴다.

## Notes

- **로드맵 구조 변경**(`/beaver:roadmap` — 반영함, 커밋 bf87d7d · Phase 14 #107 ~ #109 · Phase 15 #110 ~ #112): Phase 14 #58 · #59 dropped(기기 제어 제외) → 문 상태 유닛으로, Phase 15 사물 관리(#60 · #61 · #62) dropped, Phase 19 #80 이용 중 사물 제어 dropped, #78 · #79 를 QR 확인 웹페이지 링크 · QR 발급 기준으로, Open Decision "입장 QR 확인 수단" 해결(문 쪽 타 업체 프로그램이 우리 QR 을 읽어 문 열기 API 를 부른다), Phase 23 #95 의 Redis 기반 일부 완료.
- **인증 없는 API 의 위험** — QR 화면을 찍어 둔 사람은 그 QR 이 바뀌기 전까지 문을 열 수 있다(QR 을 계속 새로 발급하는 이유). 문 닫기는 누구나 아무 호실이나 닫힘으로 바꿀 수 있다(상태 표시만 — 실제 문은 움직이지 않는다). 남용이 보이면 문 쪽 프로그램 키를 나중에 붙인다.
- **단일 노드 Redis 전제** — Lua 스크립트가 값에서 읽은 키(`door:<room_id>` · 이전 `door-qr:`)를 쓰므로 클러스터 모드가 아닌 Redis(ElastiCache 는 클러스터 모드 끔)여야 한다.
- 다른 앱(admin-service · scheduler · gateway)은 이번에 Redis 를 쓰지 않는다 — user-service 만 `REDIS_URL` 을 받는다.

## Proposals (Codebase-Based)

- [x] 포트는 `libs/integration` 에 — 문 정보는 user-service(문 열기 · 닫기, Phase 15 QR 발급)와 나중의 관리 화면이 함께 쓰므로 외부 연동 포트와 같은 자리(`integration.symbols.ts` 의 `SMS_SENDER` · `STORAGE_GATEWAY` 옆 — libs/integration/src/integration.symbols.ts:1-5).
- [x] Redis 연결은 `RabbitMqConnection` 과 같은 수명주기 — `onApplicationBootstrap` 에서 열고 부팅을 막지 않으며 준비 전 요청은 503(libs/messaging/src/rabbitmq.connection.ts:26-62). 형제 어댑터처럼 외부 실패를 503 으로 바꾼다(libs/integration/src/sms/sns-sms.sender.ts:31-45).
- [x] Docker 묶음은 postgres 묶음과 같은 모양 — `roomless-data` 네트워크 · 127.0.0.1 포트 · 이름 있는 볼륨 · healthcheck · 필수값 `${VAR:?}`(compose.postgres.yml:1-48).
- [x] 닫기의 호실 확인은 door 도메인 repository 가 `t_room` 을 door 어휘로 읽는다(`findDoorRoom` — 도메인 간 데이터 접근 규칙, 형제 room.repository.ts:652 `findRoom` 의 `notDeleted`).

## Decisions

- [x] 기기 플랫폼 연동 — 하지 않는다. 기기 제어(명령 · 전등 · 에어컨)는 전부 빼고 문 상태만 (사용자 결정 2026-11-01)
- [x] 상태 저장소 — Redis (사용자 결정 2026-11-01)
- [x] 문 기록 기준 — 호실 room_id (사용자 결정 2026-11-01)
- [x] 저장 모양 — `door:<room_id>` = `QR:open|close:yyyyMMddHHmmss`, 기록 없으면 시각 `00000000000000` (사용자 결정 2026-11-01)
- [x] QR 출처 — 예약 건마다 새로 발급(이번엔 포트만), 예약자는 로그인 웹페이지로 확인(Phase 15 #112 · 프론트) (사용자 결정 2026-11-01)
- [x] API — 문 열기(QR → 같은 QR 의 문을 open + 시각, 여기까지만) · 문 닫기(권한 없음, close + 시각) (사용자 결정 2026-11-01)
- [x] 문 닫기 입력 — room_id, 없는 호실 404 (사용자 결정 2026-11-01)
- [x] 기기 인증 — 두지 않는다(선호 없음 → QR 이 열쇠) (2026-11-01)
- [x] 전달 경로 — 동기(내부 HTTP), user-service 새 도메인 door (사용자 확인 2026-11-01)
- [x] Redis 는 Docker 로 관리 + 실행 가이드 정리 (사용자 요청 2026-11-01)
- [x] TDD — 문 시각 5개 케이스(다음 날 · 09시 · 연도 경계 · 밀리초 버림 · 윤년)를 열기 · 닫기 service spec 에서 (사용자 결정 2026-11-01)
- [x] Redis 클라이언트 — node-redis(`redis` 6.x, 공식), 운영은 `.env` 의 `REDIS_URL`(같은 서버 컨테이너 · ElastiCache — `rediss://` 면 TLS) (2026-11-01)
