# Redis 세팅 · 실행 가이드

> 문 정보(호실 문의 QR · 열림/닫힘 · 마지막 시각)의 **원본 저장소**다. 쓰는 앱은 user-service(문 열기 · 닫기)뿐이다.
> 캐시가 아니어서 비거나 지워지면 문 정보가 사라진다 — 영속(AOF · 백업)을 반드시 켠다.

## 1. 로컬 · 가상 운영 — Docker 묶음

1. `.env` 에 값을 둔다(`.env.example` 의 Redis 절).
   - `REDIS_PASSWORD` — Redis 컨테이너 비밀번호. 서버에서는 반드시 바꾼다.
   - `REDIS_PORT` — 호스트(127.0.0.1)에 여는 포트, 기본 6379.
   - `REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379` — 앱이 접속할 주소. 비밀번호를 위와 같게 둔다(`@` `:` `/` 가 있으면 URL 인코딩).
2. 띄운다.
   ```bash
   npm run docker:network   # 처음 한 번 — 공용 네트워크
   npm run docker:redis     # compose.redis.yml — healthy 까지 기다린다
   ```
   `npm run docker:infra` · `npm run docker:up` 도 redis 를 함께 띄운다.
3. 확인한다.
   ```bash
   docker exec roomless-redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli ping'   # PONG
   ```
   user-service 로그에 `Redis 연결됨` 이 보이면 붙은 것이다.
4. 앱을 로컬(`npm run start:user-service`)로 돌리면 hosts 파일에 `127.0.0.1 redis` 를 넣는다(postgres · rabbitmq 와 같은 줄에 둬도 된다).
5. 내린다 — `docker compose -f compose.redis.yml down`(데이터는 볼륨 `roomless-redis-data` 에 남는다). 데이터까지 지우려면 `docker volume rm roomless-redis-data`.

- 비밀번호를 바꿀 때는 `.env` 의 `REDIS_PASSWORD` 와 `REDIS_URL` 을 함께 바꾸고 `docker compose -f compose.redis.yml up -d --force-recreate` 후 user-service 를 다시 띄운다.
- 영속: `appendonly yes` · `appendfsync everysec` — 최대 1초 분량만 잃을 수 있다.

## 2. 실제 운영 — Amazon ElastiCache (Redis OSS · Valkey)

- **클러스터 모드는 끈다**(샤드 1개 + 복제본) — 문 정보 Lua 스크립트가 값에서 읽은 키를 쓰므로 키가 한 노드에 있어야 한다.
- 전송 중 암호화(TLS) + AUTH 토큰(또는 RBAC 사용자)을 켜고, 보안 그룹은 user-service 에서 오는 6379 만 연다.
- 자동 백업(스냅샷)을 켠다 — 캐시가 아니라 원본이다.
- `.env`: `REDIS_URL=rediss://:<AUTH 토큰>@<기본 엔드포인트>:6379` (TLS 는 `rediss://`). `compose.redis.yml` 묶음은 띄우지 않는다 — 앱 쪽 설정은 그대로다.

## 3. 저장 모양 — 확인 · 디버깅

| 키 | 값 | 예 |
|---|---|---|
| `door:<room_id>` | `QR:상태:시각` (시각은 한국 시각 yyyyMMddHHmmss) | `9f3c…e1:open:20261101022459` · QR 없음 `:close:00000000000000` |
| `door-qr:<QR>` | `room_id` | QR 로 문 찾기 · 같은 QR 이 두 문에 가지 않게 막는 색인 |

```bash
docker exec -it roomless-redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli'
GET door:<room_id>
GET door-qr:<QR>
SCAN 0 MATCH door:* COUNT 100
```

- 기록이 없는 문은 키가 없다 — 앱은 `close` · `00000000000000` 으로 읽는다.
- QR 은 예약 건마다 예약 쪽 기능(로드맵 Phase 15 #112 — 내 예약 방 · QR 확인)이 발급한다. 그 전에 문 열기 API 를 시험하려면 위 셸에서 두 키를 직접 넣는다: `SET door-qr:<32자 hex> <room_id>` · `SET door:<room_id> <같은 QR>:close:00000000000000`.

## 4. 문제 해결

| 증상 | 확인 |
|---|---|
| 문 API 가 503 `상태 저장소에 연결할 수 없습니다` | Redis 가 떠 있는지(`docker ps`), `REDIS_URL` 주소 · 비밀번호, 같은 네트워크(`roomless-data`)인지, user-service 로그의 `Redis 오류` |
| 부팅 경고 `REDIS_URL 이 비어 있어` | `.env` 의 `REDIS_URL` |
| 로그에 `WRONGPASS` · `NOAUTH` | `REDIS_URL` 의 비밀번호가 `REDIS_PASSWORD` 와 다르다 |
| 로컬 실행에서 `getaddrinfo ENOTFOUND redis` | hosts 파일에 `127.0.0.1 redis` |
