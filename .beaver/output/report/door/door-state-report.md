# Report — door-state

## Feature Summary
- **Feature**: 문 상태(Phase 14 재정의) — 호실 문마다 QR 정보 · 열림/닫힘 · 마지막 시각을 Redis 에 두고(`door:<room_id>` = `QR:open|close:yyyyMMddHHmmss`, 기록 없음 `00000000000000`, `door-qr:<QR>` = room_id), 문 쪽 타 업체 프로그램이 부르는 문 열기(QR) · 문 닫기 API 2개를 만든다. Redis 를 Docker 묶음으로 관리하고 실행 가이드를 정리했다. 기기 제어(`t_device*` · `DeviceGateway`)는 하지 않는다(사용자 결정 2026-11-01).
- **Entry point**: `POST /api/v1/user-service/door/open` · `POST /api/v1/user-service/door/close` (게이트웨이 동기 — 인증 없음) → user-service `/internal/v1/user-service/door/open` · `/close`
- **Domain**: door (user-service 새 도메인) + `libs/integration` Redis 연결 · 문 정보 포트 `DOOR_STORE` (로드맵 Phase 14 — #107 · #108 · #109)
- **Plan**: [door-state-plan.md](../../plan/door/door-state-plan.md) · **Spec**: [door-state-spec.md](../../spec/door/door-state-spec.md)

## Created/Modified/Deleted Files
| File | Change Type | Description |
|------|-----------|------|
| `compose.redis.yml` | created | Redis 8 묶음 — AOF(`appendonly yes` · 매초) · 비밀번호(`REDIS_PASSWORD`) · `roomless-data` · 127.0.0.1:6379 · 볼륨 `roomless-redis-data` · healthcheck |
| `package.json` · `package-lock.json` | modified | 의존성 `redis`(node-redis 6.3.1), `docker:redis`, `docker:infra` · `docker:down` 에 redis |
| `compose.user-service.yml` | modified | `REDIS_URL` 필수 전달, `REDIS_PASSWORD` 빈 값, 네트워크 주석 |
| `compose.admin-service.yml` · `compose.scheduler.yml` · `compose.gateway.yml` | modified | 쓰지 않는 `REDIS_URL` · `REDIS_PASSWORD` 빈 값 |
| `scripts/docker-network.mjs` | modified | `roomless-data` 용도에 redis(· admin-service · scheduler), 머리 주석 |
| `.env.example` | modified | Redis 절 — `REDIS_PASSWORD` · `REDIS_PORT` · `REDIS_URL` |
| `libs/integration/src/integration.symbols.ts` · `integration.constants.ts` · `interfaces/integration.interface.ts` | modified | `DOOR_STORE`, `REDIS_UNAVAILABLE_MESSAGE` · `DOOR_QR_ISSUE_FAILED_MESSAGE` · `DOOR_STATE` · `DOOR_TIME_NONE` · `DOOR_QR_ISSUE_ATTEMPTS`, `DoorState` · `DoorRecord` · `DoorStoreInterface` |
| `libs/integration/src/redis/redis.connection.ts` · `redis.module.ts` | created | `RedisConnection`(부팅을 막지 않는 연결 · `disableOfflineQueue` · 준비 전 503 · `error` 리스너) · `RedisModule`(전역) |
| `libs/integration/src/door/redis-door.store.ts` · `door-store.module.ts` | created | `RedisDoorStore`(Lua 3개 — 열기 · 닫기 · QR 발급 `SET NX`, 실패 503) · `DoorStoreModule`(전역, RedisModule 포함) |
| `libs/contracts/src/door/door.commands.ts` · `dto/door-open.dto.ts` · `dto/door-close.dto.ts` | created | `DOOR_INTERNAL_PATH`(명령 없음), `DoorOpenDto` · `DoorOpenResultDto` · `DoorCloseDto` |
| `apps/user-service/src/door/` (symbols · util · interfaces · repositories · service · controllers · module) | created | `toDoorTime`(dayjs 한국 시각) · `DoorRepository.findDoorRoom`(t_room, `notDeleted`) · `DoorService.openDoor` · `closeDoor` · 내부 HTTP 2개 |
| `apps/user-service/src/user-service.module.ts` | modified | `DoorStoreModule` · `DoorModule` |
| `apps/gateway/src/api/v1/user-service/door/` (module · controllers) · `apps/gateway/src/gateway.module.ts` | created · modified | 공개 라우트 2개(가드 없음 · Swagger `문`) · `DoorModule` 등록 |
| `apps/user-service/src/door/test/` (helper · door-open · door-close · door.repository spec) | created | 28건 |
| `docs/guides/redis-setup.md` | created | 로컬 · 가상 운영(Docker) · 실제 운영(ElastiCache — 클러스터 모드 끔 · TLS · 백업) · 저장 모양 확인 · 문제 해결 |
| `README.md` | modified | 실행 절 정리(준비 → 전체 실행 8단계 → 로컬 개발 → 운영으로 옮길 때), 문 API · Redis 설명, 스택, 구조, 명령 표 |
| `docs/integration.md` · `docs/architecture.md` · `AGENTS.md` | modified | Redis · `DOOR_STORE` 절 · 실패 계약, door 도메인 · 전역 모듈, Docker 묶음 7개 · 네트워크 · 쓰지 않는 비밀값, 인증 없는 공개 라우트 |
| `.beaver/output/spec/door/door-state-spec.md` · `.beaver/output/plan/door/door-state-plan.md` | modified | 로드맵 변경(QR 발급 첫 사용처 Phase 15 #112) 반영, plan 코드 블록을 실제 파일과 맞춤 |

## Tests Written
- `door-open.spec.ts` — `[SUCCESS]` store.open(QR, 시각) 1회 · 응답 · 호실 조회 · 닫기 · 발급 미호출 / `[CASES:toDoorTime]` 5개(다음 날 · 09시 · 연도 경계 · 밀리초 버림 · 윤년) / `[FAIL:service]` 404(validation_errors null) · Redis 503 / `[FAIL:validation]` 4개(없음 · 대문자 · 31자 · hex 아님) / `[FAIL:internal]` 403 · 포트 미호출
- `door-close.spec.ts` — `[SUCCESS]` findDoorRoom({room_id}) · store.close(room_id, 시각) · 빈 본문 / `[CASES:toDoorTime]` 5개 / `[FAIL:service]` 호실 없음 404 → close 미호출 · Redis 503 / `[FAIL:repository]` 조회 500 → close 미호출 / `[FAIL:validation]` 3개 / `[FAIL:internal]` 403
- `door.repository.spec.ts` — `findDoorRoom` 이 `is_deleted: 0` · `loadRelationIds` 를 붙임, DB 실패 통일 500
- 어댑터(`RedisConnection` · `RedisDoorStore`) spec 은 두지 않는다(plan 테스트 생략 — docs/integration.md). Smoke 해당 없음(단순 findOne).

## Verification
- `npm run typecheck` · `npm run lint` · `npm run build`(4개 앱) · `npm run db:check`(엔티티 변경 없음) 통과, 새 코드 Prettier 적용.
- 테스트(AGENTS 허용 범위의 확인 실행): door 3파일 28건, 전체 83파일 746건 통과.
- compose 5개 문법 — `docker compose --env-file <빈 필수값만 채운 .env.example 사본> -f <파일> config --quiet` 통과(`.env` 값은 출력하지 않음). Redis command · healthcheck 의 `$$REDIS_PASSWORD` 가 컨테이너 셸 변수로 남는 것 확인.
- Lua 스크립트 3개를 소스에서 그대로 꺼내 Lua VM(fengari — scratch 전용, 커밋 안 함)에서 가짜 `redis.call`(GET · SET NX · DEL)로 실행 — 16/16: 색인 없음 nil · 기록 없는 문 발급(close · 00000000000000) · 열기(room_id · QR 보존) · 닫기(QR 보존 · 기록 없음은 QR 없이) · 재발급(이전 색인 삭제 · 상태 · 시각 보존 · 이전 QR 로 못 엶) · 충돌 0(변화 없음) · QR 없는 기록 발급(빈 색인 키 안 건드림).
- plan 과 다른 점: `RedisClient` 타입을 `ReturnType<typeof createClient>` 대신 클라이언트를 만드는 함수(`buildClient`)에서 얻는다 — node-redis 6 의 기본 RESP3 제네릭과 맞추기 위해. RESP3 에서 Lua `false` 는 `false` 로 오지만 `open` 의 `typeof room_id === 'string'` 판정이 그대로 null 로 바꾼다.

## Remaining Issues
- 사용자 — 배포 때 `.env` 에 `REDIS_PASSWORD` · `REDIS_URL` 을 넣고 `npm run docker:redis`(또는 `docker:infra`) → user-service 묶음 다시 띄우기. user-service compose 는 이제 `REDIS_URL` 이 없으면 뜨지 않는다. 로컬 실행은 hosts 에 `127.0.0.1 redis`.
- 실제 Redis 동작 확인은 사용자 몫 — [docs/guides/redis-setup.md](../../../../docs/guides/redis-setup.md) 3절(키를 직접 넣고 문 열기 · 닫기 호출). QR 발급은 Phase 15 #112 전까지 부르는 곳이 없다.
- 인증 없는 API 위험(spec Notes): 찍어 둔 QR 은 새로 발급되기 전까지 유효, 닫기는 누구나 아무 호실이나 닫힘 표시 가능(상태만). 남용이 보이면 문 쪽 프로그램 키를 붙인다.
