# Messaging — RabbitMQ + 요청 단위 SSE

큐 경로 요청 1건의 전체 흐름과, 게이트웨이 · 서비스가 지키는 규칙. 구현은 [libs/messaging](../libs/messaging/src/) · [CommandStreamService](../apps/gateway/src/modules/transport/command-stream.service.ts).

## 흐름

```
Client          Gateway                       RabbitMQ                      user-service
  │ POST /sign    │                              │                              │
  │──────────────▶│ ValidationPipe · JWT         │                              │
  │               │ request_id 발급, 스트림 등록    │                              │
  │               │── publish(confirm) ─────────▶│ roomless.cmd                 │
  │               │   rk=user.member.sign        │  └▶ q.user.cmd (quorum) ────▶│ CommandDispatcher
  │◀─ 200 event-stream                           │                              │  → @OnCommand (큐 컨트롤러)
  │◀─ event: accepted {request_id}               │                              │  → UserService
  │               │                              │◀── publish ──────────────────│ result.<gw>.user.member.sign.done
  │               │◀── q.gw.result.<gw> ─────────│ roomless.event               │ ack
  │◀─ event: done {토큰 4종} · 스트림 종료           │                              │
```

- 요청 상태 저장소 없음, 사용자당 상시 연결 없음. 게이트웨이 메모리에는 처리 중인 요청 수만큼 `request_id → 열린 응답` 만 잠깐 있다.
- 발행이 실패하면(브로커 연결 없음) 스트림을 열지 않고 일반 HTTP 503 을 돌려준다.
- 결과가 발행 confirm 보다 먼저 도착해도 accepted 다음에 쓴다(스트림 등록을 발행 전에 한다).
- 대기 시간(`COMMAND_STREAM_TIMEOUT_MS`, 기본 30초)을 넘기면 `event: pending` 후 종료. 처리는 서비스에서 계속될 수 있으므로 클라이언트는 리소스를 재조회한다.
- 클라이언트가 끊으면(새로고침 등) 등록을 해제하고, 늦게 온 결과는 버린다. 결과를 다시 받을 방법은 없다(의도된 제약).
- 게이트웨이가 종료되면(`onModuleDestroy`) 남은 스트림에 `event: pending` 을 쓰고 닫는다.

## SSE 이벤트 (`COMMAND_STREAM_EVENT`)

| event | data | 다음 |
|---|---|---|
| `accepted` | `{request_id}` | 결과 대기 |
| `done` | 서비스 결과 DTO (반환값 없으면 `null`) | 종료 |
| `failed` | `{status_code, message, validation_errors, ...추가 필드}` — HTTP 실패 본문 + 상태 코드 | 종료 |
| `pending` | `{request_id, message: '처리 중입니다. 잠시 후 결과를 확인해주세요.'}` | 종료 |

POST 는 `EventSource` 로 열 수 없으므로 클라이언트는 `fetch` 응답 스트림을 읽는다. 응답 `Content-Type` 이 `application/json` 이면(검증 실패 · 503 등) 일반 실패 본문이다.

리버스 프록시는 응답 버퍼링을 꺼야 한다(nginx `proxy_buffering off` — 게이트웨이가 `X-Accel-Buffering: no` 를 보낸다).

## 토폴로지

| 이름 | 종류 | 선언 | 비고 |
|---|---|---|---|
| `roomless.cmd` | topic exchange | 모든 앱(연결 시 멱등) | 명령 |
| `roomless.event` | topic exchange | 모든 앱 | 결과 회신 (도메인 이벤트는 아직 발행하지 않는다) |
| `roomless.dlx` | topic exchange | 모든 앱 | dead-letter |
| `q.dead` | queue | 모든 앱 | `roomless.dlx` 에 `#` 바인딩 |
| `q.user.cmd` | quorum queue | user-service | `user.#`, `x-dead-letter-exchange: roomless.dlx`, `x-delivery-limit: 3` |
| `q.gw.result.<인스턴스>` | exclusive · auto-delete | 게이트웨이 인스턴스마다 | `result.<인스턴스>.#` |

- 라우팅 키: 명령 `<server>.<resource>.<action>`(예: `user.member.sign`), 결과 `result.<게이트웨이 인스턴스>.<명령 type>.<done|failed>`.
- 게이트웨이 인스턴스 ID: `GATEWAY_INSTANCE_ID` 또는 `gw-<호스트>-<pid>`(영숫자 · `-` 외 문자는 `-`). 명령의 `meta.reply_to` 에 실려 결과가 그 인스턴스로만 돌아온다 — 게이트웨이를 여러 대 띄워도 sticky session 이 필요 없다. Docker 에서는 compose 가 `GATEWAY_INSTANCE_ID` 를 비워 `gw-<컨테이너 호스트명>-<pid>` 가 된다.
- 서비스 앱마다 명령 큐가 하나다 — user-service `q.user.cmd`(`user.#`), admin-service `q.admin.cmd`(`admin.#`, 매니저 · 관리자 도메인 명령을 함께 받는다). 같은 앱을 여러 대 띄우면 모두 같은 큐를 소비한다(경쟁 소비) — 브로커가 prefetch 범위 안에서 나눠 주고, 한 인스턴스가 죽으면 미확인(unacked) 명령은 다른 인스턴스로 다시 전달된다.
- 연결: `RabbitMqConnection` 1개를 앱이 공유한다. 접속 정보는 `RABBITMQ_HOST` · `RABBITMQ_PORT` + 앱 계정(`BROKER_ACCOUNT`)의 비밀번호다. 연결 이름(`connection_name`)으로 계정 = 서비스 이름을 보내, 관리 화면 Connections 탭의 Name 칸에 브로커가 보는 `IP:포트` 와 그 아래 서비스 이름(gateway · user-service · admin-service)이 함께 표시된다. 포트는 접속 후에야 정해지므로 앱이 이름에 넣지 않고 브로커 표시에 맡긴다. amqplib 2 의 `recovery` 로 끊기면 자동 재연결하고, 재연결마다 공통 토폴로지 → 발행 confirm 채널 → 등록된 준비 작업(결과 큐 · 명령 큐 소비)을 다시 세운다. 브로커가 내려가 있어도 앱 부팅은 막지 않는다(`waitForConnect: false`). 그동안 발행은 503 `BROKER_UNAVAILABLE_MESSAGE`.
- 준비 작업 등록 규약: 결과 수신기 · 명령 소비자 같은 provider 는 `onModuleInit` 에서 `connection.register(setup)` 만 하고, 연결은 모든 등록이 끝난 `onApplicationBootstrap` 에서 연다.
- 명령 소비자 옵션(`CommandConsumerOptions`): `queue` · `binding_keys` · `broker_user`(필수), `prefetch`(기본 10) · `trusted_publisher`(기본 `'gateway'`, 운영 설정 0건 — 테스트에서만 바꾼다).
- `@OnCommand(type)` 은 `SetMetadata('roomless:on-command', type)` 이다. `CommandHandlerRegistry` 가 부팅 때 앱 전체 provider 를 스캔해 등록하고, **같은 type 이 두 번 등록되면 부팅이 실패한다**.

## 브로커 계정과 권한 — 명령은 게이트웨이만 넣을 수 있다

앱마다 다른 계정으로 접속한다(`BROKER_USER`, 비밀번호는 `RABBITMQ_<계정>_PASSWORD`). 계정 · 권한은 Docker 의 `rabbitmq-init` 이 관리 API 로 만든다([init.sh](../docker/rabbitmq/init.sh)). 관리자 계정(`RABBITMQ_USER`)은 관리 화면 · 초기화 전용이다.

| 계정 | configure | write (발행 · 바인딩) | read (바인딩 · 소비) |
|---|---|---|---|
| `gateway` | 공통 exchange · `q.dead` · `q.gw.result.*` | **`roomless.cmd`** · `q.dead` · `q.gw.result.*` | `roomless.event` · `roomless.dlx` · `q.gw.result.*` |
| `user-service` | 공통 exchange · `q.dead` · `q.user.cmd` | **`roomless.event`** · `roomless.dlx` · `q.dead` · `q.user.cmd` | `roomless.cmd` · `roomless.dlx` · `q.user.cmd` |
| `admin-service` | 공통 exchange · `q.dead` · `q.admin.cmd` | **`roomless.event`** · `roomless.dlx` · `q.dead` · `q.admin.cmd` | `roomless.cmd` · `roomless.dlx` · `q.admin.cmd` |

- user-service · admin-service 는 `roomless.cmd` 에 쓸 수 없고, gateway 는 `roomless.event` 에 쓸 수 없다 — 서로 명령 · 결과를 위조할 수 없다.
- `RabbitMqConnection.publish()` 는 모든 메시지의 `user_id` 를 자기 계정으로 덮어쓴다. 브로커는 `user_id` 가 접속 계정과 다르면 거절한다([Validated User-ID](https://www.rabbitmq.com/docs/validated-user-id)).
- 서비스 소비자는 `user_id` 가 `COMMAND_PUBLISHER_USER`(gateway)가 아닌 명령을 처리 · 회신 없이 DLQ 로 보낸다. 권한이 잘못 설정돼도 이 검사가 남는다.
- **점검**: `npm run broker:check`([check-broker-acl.mjs](../scripts/check-broker-acl.mjs)) — 계정마다 허용 · 거부돼야 할 발행(쓰기 권한 403, user_id 위조 406)을 실제 브로커에 시도해 대조한다. 바인딩 없는 라우팅 키로 보내므로 명령이 처리되지 않는다.
- 새 서비스를 추가하면 `BROKER_USER` 에 계정을 더하고, init.sh 에 그 계정의 권한(자기 명령 큐 · `roomless.event` 쓰기)을 추가한다.

## 메시지 봉투 (`MessageEnvelope<T>`)

```jsonc
{
  "message_id": "…32hex",          // 재전달돼도 같은 값
  "request_id": "…32hex",          // 결과 ↔ 열린 응답 매칭 키 (명령은 message_id 와 같다)
  "type": "user.member.sign",      // = 라우팅 키, 결과는 뒤에 .done / .failed
  "occurred_at": "2026-10-14T00:00:00.000Z",
  "actor": {"user_id": "…", "auth_id": "USER"} | null,   // 게이트웨이가 JWT 로 확인한 회원
  "payload": { … },                // 명령: 검증된 입력 DTO / 결과: {result, error}
  "meta": {"reply_to": "gw-…" | null, "client_ip": "1.2.3.4" | null, "attempt": 1}
}
```

결과 payload: `{result: R | null, error: {status_code, body: {message, validation_errors, ...}} | null}`.
AMQP 속성에도 `messageId` · `correlationId`(=request_id) · `replyTo` · `type` 을 채운다.

## 서비스 쪽 — 판정 규칙 (`CommandDispatcher`)

| 상황 | 회신 | 브로커 |
|---|---|---|
| 핸들러 성공 | done (`result` = 반환값 또는 null) | ack |
| 핸들러가 HttpException 을 **반환**(service 가 쓰기를 커밋한 뒤 실패를 return — 인증번호 불일치) | failed (`toFailResult` — 던진 예외와 같은 본문) | ack — 이미 커밋돼 상태 코드와 무관하게 재시도하지 않는다 |
| HttpException 4xx (비즈니스 규칙 위반 · 중복 · 미존재 · actor 없음) | failed | ack — 재시도해도 결과가 같다 |
| 5xx · 처리되지 않은 예외, 이전 전달 < 3 | 없음 | nack(requeue) |
| 5xx, 마지막 시도(이전 전달 3) | failed (500) | nack(dead) → `q.dead` |
| JSON 형식 오류 · 핸들러 없는 type | 없음 | nack(dead) |
| **발행자(`user_id`)가 gateway 가 아님** — 판정 전에 소비자가 거른다 | 없음 | nack(dead) |

- 결과 회신 발행이 실패해도 ack 판정은 유지한다. 이미 커밋된 쓰기를 다시 실행하는 것보다 클라이언트가 pending 후 재조회하는 편이 안전하다.
- `meta.reply_to` 가 없는 명령은 처리만 하고 회신하지 않는다.
- `@Transactional()` 이 실패 시 롤백하므로 5xx 재시도는 안전하다.

## 멱등성

| 중복의 원인 | 막는 곳 |
|---|---|
| 브로커 재전달(처리 후 ack 전에 끊김) | 비즈니스 제약 — 가입은 `UK_User_SnsSnsUserId` · `UK_User_LoginIdLoginScope`, 탈퇴/철회는 상태 전이 검사가 두 번째 처리를 4xx 로 막는다 |
| 사용자 재요청(새 request_id) | 같은 비즈니스 제약 |

자연 키가 없는 명령(결제 등)이 생기면 그때 `t_processed_message`(PK = message_id) 를 서비스별로 두고, 비즈니스 처리와 같은 트랜잭션에서 INSERT 해 UK 위반(23505)이면 즉시 ack 하는 방식을 추가한다. 클라이언트 `Idempotency-Key` 헤더를 message_id 로 쓰는 것도 그때 함께 정한다.

## 명령 추가 절차

1. `libs/contracts/src/<domain>/<domain>.commands.ts` — `<DOMAIN>_COMMAND.<X>: '<server>.<resource>.<action>'` (+ 새 서비스면 큐 이름 · 바인딩 키).
2. 서비스 `controllers/<domain>.controller.queue.ts` — `@OnCommand(<DOMAIN>_COMMAND.X)` 메서드에서 service 로 위임만. 로그인 필요 명령은 `requireActor(command).user_id`, IP 는 `command.meta.client_ip ?? ''`.
3. 게이트웨이 `controllers/<domain>.controller.queue.ts` — `@Res() res` + `await this.commandStream.dispatch(res, {type, actor, payload: dto, client_ip: ip})`(비인증은 `actor: null`, 입력 없는 명령은 `payload: {}`), Swagger `@ApiProduces('text/event-stream')`.
4. 테스트 — 서비스: `runCommand()` 로 done/failed · ack/requeue/dead, 게이트웨이: FakeBroker 로 이벤트 순서([testing.md](testing.md)).

## 운영 메모

- 처리량: durable + publisher confirm + quorum 기준 단일 노드 수천 msg/s. 병목은 대개 DB 쪽이 먼저 온다.
- `q.dead` 에 쌓인 메시지는 원래 라우팅 키를 유지한다 — 관리 화면(:15672)에서 확인 · 재발행.
- 도메인 이벤트(알림 서버용 `user.member.signed` 등)는 알림 서버를 만들 때 `roomless.event` 에 함께 발행한다(아직 소비자 없음).
