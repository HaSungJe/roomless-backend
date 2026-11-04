# Realtime — 실시간 소켓 (WebSocket)

밖의 프로그램이 서버에 계속 붙어 요청 · 응답과 서버 명령을 주고받는 경로의 규칙. 첫 적용은 문 소켓(로드맵 Phase 15 — 문 쪽 타 업체 프로그램이 업체 단위로 붙어 QR 을 확인받고, 잠금을 알리고, 바로 열기 명령을 받는다). 구현은 [DoorSocketServer](../apps/gateway/src/modules/door-socket/door-socket.server.ts) · [door-socket.util](../apps/gateway/src/modules/door-socket/door-socket.util.ts) · 규격 [door.commands.ts](../libs/contracts/src/door/door.commands.ts).

## 흐름

```
문 프로그램        gateway-lb(nginx)   gateway(여러 대)                 admin-service             Redis
  │ GET /ws/v1/door   │                   │                               │                        │
  │ Upgrade + 헤더     │── /ws/ 업그레이드 ─▶│ 헤더 모양 확인                   │                        │
  │                   │                   │── POST …/room/door-snapshot ─▶│ 업체 · 시크릿(bcrypt)    │
  │                   │                   │◀── {store_id, list} ──────────│ + 호실 문 상태 ──MGET──▶│
  │◀── 101 Switching ──────────────────────│ 업체 묶음에 등록                │                        │
  │◀── door.snapshot ──────────────────────│                               │                        │
  │ door.verify {room_id, qr} ────────────▶│── POST …/room/door-verify ───▶│ 현재 QR 비교 + 열림 ─Lua─▶│
  │◀── door.verified {room_id, ok} ────────│◀── {room_id, ok} ─────────────│                        │
  │ door.closed {room_id} ────────────────▶│── POST …/room/door-close ────▶│ close + 시각 ──────────▶│
  │                   │                   │◀══ SUBSCRIBE door-commands (인스턴스마다) ═══════════════│
  │                   │  (관리자 바로 열기 — admin-service 가 같은 Lua 로 SET + PUBLISH)                │
  │◀── door.open {room_id} ────────────────│ 그 업체 연결에만                 │                        │
```

## 규칙

- **소켓은 gateway 만 받는다** — 게이트웨이가 유일한 바깥 입구다. 인프라 모듈 `apps/gateway/src/modules/<이름>-socket/`(`<이름>-socket.server.ts` · `.util.ts` · `.module.ts`)에 두고 게이트웨이 루트 모듈이 import 한다. 서비스 앱은 소켓을 받지 않는다 — 소켓에서 온 요청은 게이트웨이가 서비스 내부 HTTP(내부 토큰)로 넘기고, 판단은 서비스가 한다.
- **표준 WebSocket(`ws`)** — 클라이언트가 남의 프로그램이라 어느 언어든 기본 WebSocket 으로 붙을 수 있어야 한다(Socket.IO ❌ — 사용자 결정 2026-11-04). Nest WebSocket 어댑터 대신 HTTP 서버의 `upgrade` 를 직접 받는다(`new WebSocketServer({noServer: true})` + `HttpAdapterHost`) — 인증이 틀리면 연결을 맺기 전에 HTTP 401 로 거절하기 위해서다.
- **인증은 접속 헤더** — 주소 쿼리에 비밀값을 두지 않는다(접속 로그에 남는다). 헤더 모양이 틀리면 서비스에 묻지 않고 401, 맞으면 서비스 내부 HTTP 가 확인한다. 실패 이유(없음 · 탈퇴 · 미설정 · 불일치)는 가르지 않고 같은 401. 서비스 확인이 503 이면 업그레이드도 503 으로 거절한다. 거절 본문은 공통 실패 모양 `{message, validation_errors: null}`. 그 뒤 메시지에는 접속 때 확인한 업체 ID 를 게이트웨이가 붙여 넘긴다(클라이언트가 보낸 업체 ID 를 믿지 않는다).
- **메시지는 JSON 한 개 `{"event", "data"}`** — 경로 · 헤더 이름 · event 이름은 `libs/contracts/src/<domain>/<domain>.commands.ts` 에 둔다(밖과의 규격). data 키는 snake_case. 요청에 답이 필요하면 그 연결에만 답 event(`door.verify` → `door.verified`), 기록만 하는 알림은 성공을 답하지 않는다. 처리하지 못한 메시지는 `error` `{status_code, message}` 로 답하고 연결은 유지한다.
- **비밀값은 밖으로 내보내지 않는다** — 확인이 필요한 값(QR 등)은 클라이언트에 내려 두지 않고 클라이언트가 보낸 값을 서버가 비교한다(사용자 결정 2026-11-04). 클라이언트가 서버 저장소(Redis · DB)에 직접 붙지 않는다.
- **서버가 먼저 보내는 명령은 Redis 채널** — 명령을 만드는 쪽(어느 앱이든)이 상태 쓰기와 같은 Lua 스크립트에서 `PUBLISH` 한다(쓰기와 명령이 어긋나지 않는다). gateway 인스턴스마다 채널을 구독해 자기에게 붙은 연결에만 보낸다 — 연결이 어느 인스턴스에 붙어도 되고 sticky session 이 필요 없다. 구독은 구독 전용 연결(`RedisConnection.subscribe`)로 하고, 끊기면 다시 붙어 다시 구독한다. 문 소켓의 명령은 둘이다 — 바로 열기(`open` → 그 업체 연결에 `door.open`), 연결 끊기(`disconnect` — 업체 문 시크릿이 바뀌었다 → 그 업체 연결을 모두 1008 로 끊는다, 새 시크릿으로 다시 붙는다).
- **연결 목록은 인스턴스 메모리** — "인스턴스 로컬 상태 금지" 의 유일한 예외다(연결 자체가 그 인스턴스에 붙어 있다). 상태 원본은 Redis · DB 이고, 연결이 끊기면 클라이언트가 다시 붙어 처음 상태(snapshot)부터 받는다.
- **연결 유지** — 서버가 30초마다 ping, 다음 ping 까지 pong 이 없으면 끊는다. 재연결은 클라이언트 몫. nginx 는 `/ws/` 에 `Upgrade` · `Connection: upgrade` 를 넘기고 읽기 대기를 ping 보다 길게(120초) 둔다. 종료 때는 1001 로 닫는다(다른 인스턴스로 다시 붙는다).
- **로깅** — 소켓 서버는 인프라 클래스라 `Logger` 를 쓴다(연결 오류 · 구독 오류). 메시지 내용 · 시크릿 · QR 은 남기지 않는다.

## 문 소켓 — 경우별 결과

| 경우 | 결과 |
|---|---|
| `/ws/v1/door` 가 아닌 경로로 업그레이드 | HTTP 404 `없는 소켓 경로입니다.` |
| 헤더가 없거나 모양이 틀림 | HTTP 401 `업체 ID 또는 시크릿 코드가 올바르지 않습니다.`(서비스에 묻지 않는다) |
| 업체 총관리자가 시크릿을 바꿈 | 그 업체 연결을 모두 끊는다(종료 코드 1008 `store secret changed`) — 새 시크릿으로 다시 붙는다 |
| 업체 없음 · 탈퇴 · 지움 · 시크릿 미설정 · 불일치 | HTTP 401 같은 문구(이유를 가르지 않는다) |
| admin-service · Redis 에 닿지 못함 | 그 상태 코드(503 등)로 업그레이드 거절 |
| JSON 아님 · 모르는 event · `room_id` · `qr` 모양 틀림 | `error {status_code: 400, message: '알 수 없는 메시지입니다.'}` |
| 그 업체 호실이 아님(없음 · 다른 업체 · 지움) | `error {status_code: 404, message: '호실을 찾을 수 없습니다.'}` |
| `door.verify` QR 불일치 · 현재 QR 없음 | `door.verified {room_id, ok: false}` — 실패가 아니다(문을 열지 않는다) |
| `door.closed` 성공 | 답하지 않는다 |
| 그 밖의 서버 오류 | `error {status_code: 500, message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}` |

## 테스트

- 소켓 서버 · util 은 게이트웨이 인프라라 spec 을 두지 않는다([testing.md](testing.md)). 대신 소켓이 부르는 서비스 내부 API(접속 확인 · QR 확인 · 잠금)는 service 기능 spec 이 두 경로로 지난다.
- 소켓 자체의 확인은 사용자가 실제로 띄워서 한다 — 헤더 틀림 401 · snapshot · door.verify 맞음 · 틀림 · door.closed · 바로 열기 → door.open · 잘못된 메시지 → error · ping.
