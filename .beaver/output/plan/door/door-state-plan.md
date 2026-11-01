# Plan — door-state

## Feature Summary
- **Feature**: 문 상태(Phase 14 재정의) — 호실 문마다 QR 정보 · 열림/닫힘 · 마지막 시각을 Redis 에 두고(`door:<room_id>` = `QR:open|close:yyyyMMddHHmmss`), 문 쪽 타 업체 프로그램이 부르는 문 열기(QR) · 문 닫기 API 2개를 만든다. Redis 를 Docker 묶음으로 관리하고 실행 가이드를 정리한다.
- **Entry point**: `POST /api/v1/user-service/door/open` · `POST /api/v1/user-service/door/close` (게이트웨이 동기 — 인증 없음) → user-service `/internal/v1/user-service/door/open` · `/close`
- **Domain**: door (user-service 새 도메인) + `libs/integration` Redis 연결 · 문 정보 포트 `DOOR_STORE`
- **Spec**: [door-state-spec.md](../../spec/door/door-state-spec.md)

---

## File List

| File | Action |
|------|------|
| `package.json` · `package-lock.json` | modified — 의존성 `redis`(node-redis 6.3.1), 스크립트 `docker:redis` · `docker:infra`(+redis) · `docker:down`(+redis) |
| `compose.redis.yml` | new — Redis 8 묶음(AOF 영속 · 비밀번호 · `roomless-data` · 127.0.0.1:6379 · 볼륨 `roomless-redis-data`) |
| `compose.user-service.yml` | modified — `REDIS_URL` 필수 전달, `REDIS_PASSWORD` 빈 값 |
| `compose.admin-service.yml` · `compose.scheduler.yml` · `compose.gateway.yml` | modified — 쓰지 않는 `REDIS_URL` · `REDIS_PASSWORD` 빈 값 |
| `scripts/docker-network.mjs` | modified — `roomless-data` 용도에 redis, 머리 주석 |
| `.env.example` | modified — Redis 절(`REDIS_PASSWORD` · `REDIS_PORT` · `REDIS_URL`) |
| `libs/integration/src/integration.symbols.ts` | modified — `DOOR_STORE` |
| `libs/integration/src/integration.constants.ts` | modified — `REDIS_UNAVAILABLE_MESSAGE` · `DOOR_QR_ISSUE_FAILED_MESSAGE` · `DOOR_STATE` · `DOOR_TIME_NONE` · `DOOR_QR_ISSUE_ATTEMPTS` |
| `libs/integration/src/interfaces/integration.interface.ts` | modified — `DoorState` · `DoorRecord` · `DoorStoreInterface` |
| `libs/integration/src/redis/redis.connection.ts` · `redis/redis.module.ts` | new — `RedisConnection`(부팅을 막지 않는 연결 · 준비 전 503) · `RedisModule`(전역) |
| `libs/integration/src/door/redis-door.store.ts` · `door/door-store.module.ts` | new — `RedisDoorStore`(Lua 스크립트 3개 — 열기 · 닫기 · QR 발급) · `DoorStoreModule`(전역, RedisModule 포함) |
| `libs/contracts/src/door/door.commands.ts` | new — `DOOR_INTERNAL_PATH`(명령 없음 — 동기만) |
| `libs/contracts/src/door/dto/door-open.dto.ts` · `door-close.dto.ts` | new — `DoorOpenDto` · `DoorOpenResultDto` · `DoorCloseDto` |
| `apps/user-service/src/door/door.symbols.ts` · `door.util.ts` · `door.service.ts` · `door.module.ts` | new — `DOOR_REPOSITORY` · `toDoorTime` · `DoorService`(`openDoor` · `closeDoor`) · `DoorModule` |
| `apps/user-service/src/door/interfaces/door.repository.interface.ts` · `repositories/door.repository.ts` | new — `findDoorRoom`(t_room, 지워지지 않은 호실) |
| `apps/user-service/src/door/controllers/door.controller.ts` | new — 내부 HTTP 2개 |
| `apps/user-service/src/user-service.module.ts` | modified — `DoorStoreModule` · `DoorModule` |
| `apps/gateway/src/api/v1/user-service/door/door.module.ts` · `controllers/door.controller.ts` | new — 공개 라우트 2개(가드 없음) |
| `apps/gateway/src/gateway.module.ts` | modified — `DoorModule` |
| `apps/user-service/src/door/test/door.test-helper.ts` · `door-open.spec.ts` · `door-close.spec.ts` · `door.repository.spec.ts` | new — service 기능 spec 2개(`[CASES:toDoorTime]` 5개 포함) + repository spec |
| `docs/guides/redis-setup.md` | new — Redis 세팅 · 실행 · 확인 · 운영(ElastiCache) · 문제 해결 |
| `README.md` | modified — 실행 절 정리(준비 → 전체 실행 → 로컬 개발 → 운영으로 옮길 때), 문 API · Redis 설명, 명령 표 |
| `docs/integration.md` · `docs/architecture.md` · `AGENTS.md` | modified — Redis · `DOOR_STORE` · door 도메인 · Docker 묶음 7개 · 인증 없는 공개 라우트 |

삭제할 코드: 없음. Phase 14 의 원래 계획(`t_device*` · `DeviceGateway`)은 코드가 없어 지울 것이 없다 — 로드맵 구조 변경은 `/beaver:roadmap` 몫(spec Notes).

---

## Design

### 인프라 — Redis Docker 묶음 · 스크립트 · 설정

postgres 묶음(compose.postgres.yml:1-48)과 같은 모양 — `roomless-data` 외부 네트워크 · 127.0.0.1 포트 · 이름 있는 볼륨 · healthcheck · 필수값 `${VAR:?}`. 캐시가 아니라 원본이라 AOF 를 켠다.

```yaml
# compose.redis.yml — new
# Redis — 문 정보(호실 문의 QR · 열림/닫힘 · 마지막 시각)의 원본 저장소. 단독 실행
#   npm run docker:redis   (docker compose -f compose.redis.yml up -d --wait)
#
# 설정은 .env 를 그대로 쓴다(compose 가 값을 바꾸지 않는다). 필수값이 비어 있으면 띄우지 않는다.
# 캐시가 아니라 원본이라 AOF(appendonly, 매초 디스크에 기록)를 켠다 — 컨테이너를 다시 띄워도 문 정보가 볼륨 roomless-redis-data 에 남는다.
# 실제 운영 Redis(ElastiCache 등 — 클러스터 모드 끔)를 쓰면 이 묶음은 띄우지 않고, .env 의 REDIS_URL 을 그 주소로 둔다 — 앱 쪽 설정은 그대로다.
#
# roomless-data 네트워크에만 붙고, 호스트 포트는 127.0.0.1 에만 연다. 세팅 · 확인: docs/guides/redis-setup.md
name: roomless-redis

x-logging: &logging
    driver: json-file
    options:
        max-size: '10m'
        max-file: '5'

services:
    redis:
        image: redis:8-alpine
        container_name: roomless-redis
        environment:
            REDIS_PASSWORD: '${REDIS_PASSWORD:?.env 에 REDIS_PASSWORD 가 필요합니다}'
            TZ: Asia/Seoul
        # 비밀번호(requirepass)는 compose 파일에 적지 않고 .env 에서 받는다 — $$ 는 컨테이너 셸이 펼친다
        command: ['sh', '-c', 'exec redis-server --appendonly yes --appendfsync everysec --requirepass "$$REDIS_PASSWORD"']
        ports:
            - '127.0.0.1:${REDIS_PORT:-6379}:6379'
        volumes:
            - redis-data:/data
        networks: [data]
        healthcheck:
            test: ['CMD-SHELL', 'REDISCLI_AUTH="$$REDIS_PASSWORD" redis-cli ping | grep -q PONG']
            interval: 5s
            timeout: 3s
            retries: 10
        logging: *logging
        restart: unless-stopped

networks:
    data:
        name: roomless-data
        external: true

volumes:
    redis-data:
        name: roomless-redis-data
```

```json
// package.json — modified (해당 줄만 — scripts 3줄 · dependencies 1줄, 버전은 build 때 npm install redis@6.3.1 이 lock 과 함께 정한다)
    "docker:redis": "docker compose -f compose.redis.yml up -d --wait",
    "docker:infra": "npm run docker:network && npm run docker:postgres && npm run docker:rabbitmq && npm run docker:redis",
    "docker:down": "docker compose -f compose.gateway.yml down && docker compose -f compose.scheduler.yml down && docker compose -f compose.admin-service.yml down && docker compose -f compose.user-service.yml down && docker compose -f compose.redis.yml down && docker compose -f compose.rabbitmq.yml down && docker compose -f compose.postgres.yml down",

    "redis": "^6.3.1",
```

`docker:redis` 는 `docker:rabbitmq` 다음 줄에 둔다. `docker:up` 은 `docker:infra` 를 부르므로 그대로다.

```yaml
# compose.user-service.yml — modified (user-service 의 environment — 환경 값 · 쓰지 않는 비밀값 두 곳)
            INTERNAL_API_TOKEN: '${INTERNAL_API_TOKEN:?.env 에 INTERNAL_API_TOKEN 이 필요합니다}'
            # 문 정보 저장소 — 가상 운영은 redis 묶음(@redis), 실제 운영은 ElastiCache 등(rediss://)
            REDIS_URL: '${REDIS_URL:?.env 에 REDIS_URL 이 필요합니다}'
            # ── 서버 구성: 어느 환경이든 같다 ──
...
            # ── 쓰지 않는 비밀값은 전달하지 않는다 ──
            RABBITMQ_GATEWAY_PASSWORD: ''
            RABBITMQ_ADMIN_SERVICE_PASSWORD: ''
            RABBITMQ_PASSWORD: ''
            REDIS_PASSWORD: ''
```

머리 주석의 네트워크 줄도 고친다: `roomless-broker / roomless-data : 브로커 / DB · Redis 로 나가는 길 (외부 RDS · Amazon MQ · ElastiCache 도 이 길로 나간다)`.

```yaml
# compose.admin-service.yml · compose.scheduler.yml · compose.gateway.yml — modified (각 "쓰지 않는 비밀값" 블록 끝에 두 줄)
            REDIS_URL: ''
            REDIS_PASSWORD: ''
```

```js
// scripts/docker-network.mjs — modified (머리 주석 · roomless-data 용도)
/**
 * Docker 공용 네트워크 만들기 — postgres · rabbitmq · redis · user-service · admin-service · scheduler · gateway 를 각자 따로 띄워도 서로 이름으로 찾게 한다.
 *
 * 실행: `npm run docker:network` (이미 있으면 건너뛴다 — 몇 번을 돌려도 같다)
 *
 * compose 파일 7개는 이 네트워크들을 `external: true` 로 쓴다. 한 묶음을 내려도(`down`) 네트워크는 지워지지 않아
 * 다른 묶음이 계속 동작한다.
 */
...
    {name: 'roomless-data', internal: false, purpose: 'postgres · redis · migrate · user-service · admin-service · scheduler'},
```

```sh
# .env.example — modified (RabbitMQ 절 다음에 새 절)
# ── Redis (문 정보) ─────────────────────────
# 호실 문의 QR · 열림/닫힘 · 마지막 시각의 원본 저장소. 세팅 · 확인 방법: docs/guides/redis-setup.md
# (필수) 가상 운영 Redis 컨테이너 비밀번호 — 서버에서는 반드시 바꾼다. 아래 REDIS_URL 의 비밀번호와 같게 둔다
REDIS_PASSWORD=roomless
REDIS_PORT=6379
# (필수) 앱(user-service)이 접속할 Redis — 가상 운영은 @redis, 실제 운영은 ElastiCache 등의 주소(TLS 면 rediss://)
# 비밀번호에 @ : / 가 있으면 URL 인코딩한다
REDIS_URL=redis://:roomless@redis:6379
```

### 외부 연동 포트 — Redis 연결 · 문 정보(`libs/integration`)

형제: 포트 Symbol · 인터페이스는 integration.symbols.ts:1-5 · interfaces/integration.interface.ts, 연결 수명주기는 `RabbitMqConnection`(libs/messaging/src/rabbitmq.connection.ts:26-62 — `onApplicationBootstrap` 에서 열고 부팅을 막지 않는다, 준비 전 요청은 503), 외부 실패 → 503 은 `SnsSmsSender`(libs/integration/src/sms/sns-sms.sender.ts:31-45).

```ts
// libs/integration/src/integration.symbols.ts — modified (파일 전체)
/** SMS 발송 포트 — 구현: SnsSmsSender (Amazon SNS) */
export const SMS_SENDER = Symbol('SmsSenderInterface');

/** 파일 저장소 포트 — 구현: S3StorageGateway (Amazon S3) */
export const STORAGE_GATEWAY = Symbol('StorageGatewayInterface');

/** 문 정보 포트 — 구현: RedisDoorStore (Redis) */
export const DOOR_STORE = Symbol('DoorStoreInterface');
```

```ts
// libs/integration/src/integration.constants.ts — modified (파일 끝에 추가)

/** Redis(상태 저장소)에 닿지 못했을 때 — 503 */
export const REDIS_UNAVAILABLE_MESSAGE = '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';

/** 새 QR 을 겹치지 않게 발급하지 못했을 때 — 500 (32자 무작위라 사실상 일어나지 않는다) */
export const DOOR_QR_ISSUE_FAILED_MESSAGE = 'QR 정보를 발급하지 못했습니다. 관리자에게 문의해주세요.';

/** 문 상태 — open: 열림, close: 닫힘 (Redis 문 정보의 상태 칸) */
export const DOOR_STATE = {OPEN: 'open', CLOSE: 'close'} as const;

/** 한 번도 열거나 닫은 적 없는 문의 시각 */
export const DOOR_TIME_NONE = '00000000000000';

/** 새 QR 을 겹치지 않게 잡는 최대 시도 횟수 */
export const DOOR_QR_ISSUE_ATTEMPTS = 3;
```

```ts
// libs/integration/src/interfaces/integration.interface.ts — modified (파일 끝에 추가)

/** 문 상태 — DOOR_STATE 값 */
export type DoorState = 'open' | 'close';

/** 호실 문 1개의 정보 — Redis `door:<room_id>` 의 값 `QR:상태:시각` */
export interface DoorRecord {
    /** 지금 유효한 QR 정보 — 아직 발급하지 않았으면 null */
    qr: string | null;
    /** 문 상태 */
    state: DoorState;
    /** 마지막으로 열거나 닫은 시각 — 한국 시각 yyyyMMddHHmmss, 기록이 없으면 DOOR_TIME_NONE */
    changed_at: string;
}

/**
 * 문 정보 포트 — 호실 문마다 QR 정보 · 열림/닫힘 · 마지막 시각을 둔다(Redis). QR 은 두 문에 겹치지 않는다.
 * 서버는 문을 직접 움직이지 않는다 — 문 쪽 타 업체 프로그램이 읽은 QR 로 문 열기 API 를 부르고, 그 결과로 문을 연다.
 */
export interface DoorStoreInterface {
    /**
     * 문 정보를 읽는다. 기록이 없으면 `{qr: null, state: 'close', changed_at: DOOR_TIME_NONE}`.
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    get(room_id: string): Promise<DoorRecord>;

    /**
     * 새 QR 을 발급한다 — 겹치지 않는 값으로 바꾸고 이전 QR 은 무효가 된다. 상태 · 시각은 그대로(기록이 없으면 close · DOOR_TIME_NONE).
     *
     * @returns 새 QR (32자)
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     * @throws InternalServerErrorException `{message: DOOR_QR_ISSUE_FAILED_MESSAGE}` — 겹치지 않는 값을 잡지 못했을 때
     */
    issueQr(room_id: string): Promise<string>;

    /**
     * QR 이 같은 문을 open + changed_at 으로 바꾼다. 찾기와 쓰기를 한 번에 한다(그 사이 QR 이 바뀌어도 옛 QR 로 덮어쓰지 않는다).
     *
     * @returns 그 문의 room_id — 일치하는 문이 없으면 null
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    open(qr: string, changed_at: string): Promise<string | null>;

    /**
     * 그 문을 close + changed_at 으로 바꾼다(QR 은 그대로, 기록이 없으면 QR 없이 만든다).
     *
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}` — Redis 에 닿지 못했을 때
     */
    close(room_id: string, changed_at: string): Promise<void>;
}
```

```ts
// libs/integration/src/redis/redis.connection.ts — new
import {Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException} from '@nestjs/common';
import {createClient} from 'redis';
import {REDIS_UNAVAILABLE_MESSAGE} from '../integration.constants.js';

/**
 * REDIS_URL 로 클라이언트를 만든다 — 끊긴 동안 명령을 쌓아 두지 않는다(disableOfflineQueue).
 *
 * @param url Redis 주소
 * @returns 아직 연결하지 않은 클라이언트
 */
function buildClient(url: string) {
    return createClient({url, disableOfflineQueue: true});
}

/** node-redis 클라이언트 — buildClient 가 만든 모양 그대로(node-redis 6 기본 RESP3) */
export type RedisClient = ReturnType<typeof buildClient>;

/**
 * Redis 연결 1개를 앱 전체가 공유한다 — 문 정보 포트(RedisDoorStore)가 쓴다.
 *
 * - 주소는 REDIS_URL(`redis://:<비밀번호>@<호스트>:6379`, TLS 면 `rediss://`). 비어 있으면 부팅 때 한 번 경고하고 연결하지 않는다.
 * - Redis 가 내려가 있어도 앱 부팅은 막지 않는다(연결을 기다리지 않는다). 끊기면 node-redis 기본 재연결(지수 백오프 · 최대 2초)로 다시 붙는다.
 * - 끊긴 동안 명령을 쌓아 두지 않는다(disableOfflineQueue) — 준비 전 요청은 `ready()` 가 503 으로 거절한다.
 * - `error` 리스너가 없으면 node-redis 가 오류를 던져 프로세스가 죽으므로 반드시 단다.
 * 세팅: docs/guides/redis-setup.md
 */
@Injectable()
export class RedisConnection implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(RedisConnection.name);
    private client: RedisClient | null = null;

    /**
     * 연결을 연다 — 기다리지 않는다(부팅을 막지 않는다).
     */
    onApplicationBootstrap(): void {
        const url = process.env.REDIS_URL;
        if (!url) {
            this.logger.warn('REDIS_URL 이 비어 있어 Redis 를 쓰는 요청(문 열기 · 닫기)이 실패합니다 — docs/guides/redis-setup.md');
            return;
        }
        const client = buildClient(url);
        client.on('error', (error: Error) => this.logger.error(`Redis 오류: ${error.message}`));
        client.on('ready', () => this.logger.log('Redis 연결됨'));
        client.on('reconnecting', () => this.logger.warn('Redis 재연결 중'));
        this.client = client;
        client.connect().catch((error: Error) => this.logger.error(`Redis 연결 실패: ${error.message}`));
    }

    /**
     * 종료 시 연결을 닫는다.
     */
    async onModuleDestroy(): Promise<void> {
        if (this.client?.isOpen) {
            await this.client.close();
        }
    }

    /**
     * 명령을 보낼 수 있는 클라이언트 — 아직 준비되지 않았거나 끊겼으면 503.
     *
     * @returns 준비된 클라이언트
     * @throws ServiceUnavailableException `{message: REDIS_UNAVAILABLE_MESSAGE}`
     */
    ready(): RedisClient {
        if (!this.client?.isReady) {
            throw new ServiceUnavailableException({message: REDIS_UNAVAILABLE_MESSAGE});
        }
        return this.client;
    }
}
```

```ts
// libs/integration/src/redis/redis.module.ts — new
import {Global, Module} from '@nestjs/common';
import {RedisConnection} from './redis.connection.js';

/**
 * Redis 연결(RedisConnection) — 앱마다 1개. 전역이라 Redis 를 쓰는 포트 모듈(DoorStoreModule)이 import 해 같은 연결을 나눠 쓴다.
 */
@Global()
@Module({providers: [RedisConnection], exports: [RedisConnection]})
export class RedisModule {}
```

QR 은 `generateId()`(32자 hex — uuid v4, libs/common/src/utils/id.ts:8)로 만든다. 세 동작은 Lua 스크립트 1개씩이라 Redis 안에서 원자적이다. 스크립트가 값에서 읽은 키(`door:<room_id>` · 이전 `door-qr:`)를 쓰므로 단일 노드 Redis 전제(guide 에 명시).

```ts
// libs/integration/src/door/redis-door.store.ts — new
import {Injectable, InternalServerErrorException, Logger, ServiceUnavailableException} from '@nestjs/common';
import {generateId} from '@app/common/utils/id.js';
import {DOOR_QR_ISSUE_ATTEMPTS, DOOR_QR_ISSUE_FAILED_MESSAGE, DOOR_STATE, DOOR_TIME_NONE, REDIS_UNAVAILABLE_MESSAGE} from '../integration.constants.js';
import type {DoorRecord, DoorStoreInterface} from '../interfaces/integration.interface.js';
import {RedisConnection} from '../redis/redis.connection.js';
import type {RedisClient} from '../redis/redis.connection.js';

/** 문 정보 키 접두 — `door:<room_id>` = `QR:상태:시각` */
const DOOR_KEY_PREFIX = 'door:';

/** QR 색인 키 접두 — `door-qr:<QR>` = room_id (QR 로 문 찾기 · 중복 방지) */
const DOOR_QR_KEY_PREFIX = 'door-qr:';

/**
 * 문 열기 — KEYS[1] `door-qr:<QR>` / ARGV[1] `door:` 접두 · ARGV[2] QR · ARGV[3] 상태(open) · ARGV[4] 시각.
 * QR 로 문을 찾고 그 문 정보를 쓰는 것을 한 번에 한다. 일치하는 문이 없으면 nil.
 */
const OPEN_SCRIPT = `
local room_id = redis.call('GET', KEYS[1])
if not room_id then return false end
redis.call('SET', ARGV[1] .. room_id, ARGV[2] .. ':' .. ARGV[3] .. ':' .. ARGV[4])
return room_id
`;

/**
 * 문 닫기 — KEYS[1] `door:<room_id>` / ARGV[1] 상태(close) · ARGV[2] 시각. 지금 QR 은 그대로 두고, 기록이 없으면 QR 없이 만든다.
 */
const CLOSE_SCRIPT = `
local value = redis.call('GET', KEYS[1])
local qr = ''
if value then qr = string.match(value, '^([^:]*):') or '' end
redis.call('SET', KEYS[1], qr .. ':' .. ARGV[1] .. ':' .. ARGV[2])
return 1
`;

/**
 * QR 발급 — KEYS[1] `door:<room_id>` · KEYS[2] `door-qr:<새 QR>` / ARGV[1] room_id · ARGV[2] 새 QR · ARGV[3] `door-qr:` 접두 · ARGV[4] 기록 없음 상태(close) · ARGV[5] 기록 없음 시각.
 * 새 QR 색인을 SET NX 로 먼저 잡아야만 바꾼다(다른 문이 쓰는 값이면 0 — 다시 만든다). 이전 QR 색인은 지우고, 상태 · 시각은 그대로 둔다.
 */
const ISSUE_SCRIPT = `
if not redis.call('SET', KEYS[2], ARGV[1], 'NX') then return 0 end
local state, changed_at = ARGV[4], ARGV[5]
local value = redis.call('GET', KEYS[1])
if value then
    local old_qr, old_state, old_changed_at = string.match(value, '^([^:]*):([^:]*):([^:]*)$')
    if old_qr and old_qr ~= '' then redis.call('DEL', ARGV[3] .. old_qr) end
    if old_state then state, changed_at = old_state, old_changed_at end
end
redis.call('SET', KEYS[1], ARGV[2] .. ':' .. state .. ':' .. changed_at)
return 1
`;

/**
 * 문 정보 키
 *
 * @param room_id 호실 ID
 * @returns `door:<room_id>`
 */
function doorKey(room_id: string): string {
    return `${DOOR_KEY_PREFIX}${room_id}`;
}

/**
 * QR 색인 키
 *
 * @param qr QR 정보
 * @returns `door-qr:<QR>`
 */
function doorQrKey(qr: string): string {
    return `${DOOR_QR_KEY_PREFIX}${qr}`;
}

/**
 * 문 정보 값(`QR:상태:시각`)을 읽는다. 값이 없으면 기록 없는 문(close · DOOR_TIME_NONE).
 *
 * @param value Redis 값
 * @returns 문 정보
 */
function parseDoorValue(value: string | null): DoorRecord {
    if (!value) {
        return {qr: null, state: DOOR_STATE.CLOSE, changed_at: DOOR_TIME_NONE};
    }
    const [qr, state, changed_at] = value.split(':');
    return {qr: qr || null, state: state === DOOR_STATE.OPEN ? DOOR_STATE.OPEN : DOOR_STATE.CLOSE, changed_at: changed_at || DOOR_TIME_NONE};
}

/**
 * 문 정보 어댑터 — Redis. `door:<room_id>` = `QR:open|close:yyyyMMddHHmmss`, `door-qr:<QR>` = room_id.
 * 열기 · 닫기 · QR 발급은 Lua 스크립트 1개씩(원자적)이고, QR 은 색인을 SET NX 로 잡아 두 문에 겹치지 않는다.
 * 세팅 · 저장 모양 확인: docs/guides/redis-setup.md
 */
@Injectable()
export class RedisDoorStore implements DoorStoreInterface {
    private readonly logger = new Logger(RedisDoorStore.name);

    /**
     * @param redis 앱 공용 Redis 연결
     */
    constructor(private readonly redis: RedisConnection) {}

    /**
     * 문 정보를 읽는다 — 기록이 없으면 close · DOOR_TIME_NONE.
     *
     * @param room_id 호실 ID
     * @returns 문 정보
     */
    async get(room_id: string): Promise<DoorRecord> {
        const value = await this.run('문 정보 조회', (client) => client.get(doorKey(room_id)));
        return parseDoorValue(typeof value === 'string' ? value : null);
    }

    /**
     * 새 QR 을 발급한다 — 다른 문이 쓰는 값이면 새로 만들어 다시(최대 DOOR_QR_ISSUE_ATTEMPTS 번).
     *
     * @param room_id 호실 ID
     * @returns 새 QR
     */
    async issueQr(room_id: string): Promise<string> {
        for (let attempt = 0; attempt < DOOR_QR_ISSUE_ATTEMPTS; attempt++) {
            const qr = generateId();
            const issued = await this.run('QR 발급', (client) =>
                client.eval(ISSUE_SCRIPT, {keys: [doorKey(room_id), doorQrKey(qr)], arguments: [room_id, qr, DOOR_QR_KEY_PREFIX, DOOR_STATE.CLOSE, DOOR_TIME_NONE]}),
            );
            if (issued === 1) {
                return qr;
            }
        }
        throw new InternalServerErrorException({message: DOOR_QR_ISSUE_FAILED_MESSAGE});
    }

    /**
     * QR 이 같은 문을 open + 시각으로 바꾼다.
     *
     * @param qr QR 정보
     * @param changed_at 시각 (한국 시각 yyyyMMddHHmmss)
     * @returns 그 문의 room_id — 없으면 null
     */
    async open(qr: string, changed_at: string): Promise<string | null> {
        const room_id = await this.run('문 열기', (client) => client.eval(OPEN_SCRIPT, {keys: [doorQrKey(qr)], arguments: [DOOR_KEY_PREFIX, qr, DOOR_STATE.OPEN, changed_at]}));
        return typeof room_id === 'string' ? room_id : null;
    }

    /**
     * 그 문을 close + 시각으로 바꾼다.
     *
     * @param room_id 호실 ID
     * @param changed_at 시각 (한국 시각 yyyyMMddHHmmss)
     */
    async close(room_id: string, changed_at: string): Promise<void> {
        await this.run('문 닫기', (client) => client.eval(CLOSE_SCRIPT, {keys: [doorKey(room_id)], arguments: [DOOR_STATE.CLOSE, changed_at]}));
    }

    /**
     * Redis 명령 1번 — 준비 전이면 RedisConnection 이 503, 명령이 실패하면 로그를 남기고 503.
     *
     * @param action 로그에 남길 동작 이름
     * @param command 클라이언트로 실행할 명령
     * @returns 명령 결과
     */
    private async run<T>(action: string, command: (client: RedisClient) => Promise<T>): Promise<T> {
        const client = this.redis.ready();
        try {
            return await command(client);
        } catch (error) {
            this.logger.error(`${action} 실패: ${(error as Error)?.message ?? error}`);
            throw new ServiceUnavailableException({message: REDIS_UNAVAILABLE_MESSAGE});
        }
    }
}
```

```ts
// libs/integration/src/door/door-store.module.ts — new
import {Global, Module} from '@nestjs/common';
import {DOOR_STORE} from '../integration.symbols.js';
import {RedisModule} from '../redis/redis.module.js';
import {RedisDoorStore} from './redis-door.store.js';

/**
 * 문 정보 포트(DOOR_STORE) — Redis. Redis 연결(RedisModule)을 함께 가져온다.
 * 문 정보를 쓰는 앱의 루트 모듈에서 import 한다(전역 — 도메인 모듈은 import 없이 `@Inject(DOOR_STORE)` 로 주입받는다).
 */
@Global()
@Module({imports: [RedisModule], providers: [{provide: DOOR_STORE, useClass: RedisDoorStore}], exports: [DOOR_STORE]})
export class DoorStoreModule {}
```

### Input/Validation (DTO) · 규격 상수 (`libs/contracts`)

형제: 경로 ID 검증 room-delete.dto.ts(`@Matches(/^[a-f0-9]{32}$/)` → `@IsNotEmpty`), 결과 DTO room-group-image-upload-url.dto.ts:27-36.

```ts
// libs/contracts/src/door/door.commands.ts — new
/**
 * 문 도메인 규격 — RabbitMQ 명령은 없다. 문 열기 · 닫기는 문 쪽 타 업체 프로그램이 결과를 바로 받아야 하고 DB 쓰기가 없어
 * 내부 HTTP 동기 경로다(로그인 · 토큰 재발급처럼). 공개 경로는 `/api/v1/user-service/door/…`.
 */

/** 문 도메인 내부 HTTP 경로 (게이트웨이 → user-service) */
export const DOOR_INTERNAL_PATH = {
    /** QR 로 문 열기 */
    OPEN: '/internal/v1/user-service/door/open',
    /** 문 닫기 */
    CLOSE: '/internal/v1/user-service/door/close',
} as const;
```

```ts
// libs/contracts/src/door/dto/door-open.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 문 열기 — 문 쪽 타 업체 프로그램이 예약자 QR 화면에서 읽은 QR 정보. 같은 QR 을 가진 문이 없으면 404
 */
export class DoorOpenDto {
    @ApiProperty({description: 'QR 정보 (32자 — 예약자 QR 화면의 값)'})
    @Matches(/^[a-f0-9]{32}$/, {message: 'QR 정보가 올바르지 않습니다.'})
    @IsNotEmpty({message: 'QR 정보를 입력해주세요.'})
    qr: string;
}

/**
 * 문 열기 결과 — 연 문(호실)과 바뀐 상태 · 시각. 문 쪽 프로그램은 닫을 때 이 room_id 를 보낸다
 */
export class DoorOpenResultDto {
    @ApiProperty({description: '연 문의 호실 ID'})
    room_id: string;

    @ApiProperty({description: '문 상태 (open: 열림)', enum: ['open', 'close']})
    door_state: string;

    @ApiProperty({description: '문을 연 시각 — 한국 시각 yyyyMMddHHmmss (예: 20261101022459)'})
    door_changed_at: string;
}
```

```ts
// libs/contracts/src/door/dto/door-close.dto.ts — new
import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 문 닫기 — 권한 없이 그 호실 문을 닫힘 + 지금 시각으로 바꾼다. 지워지지 않은 호실이 없으면 404
 */
export class DoorCloseDto {
    @ApiProperty({description: '호실 ID (문 열기 결과의 room_id)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '호실 ID를 입력해주세요.'})
    room_id: string;
}
```

### Data Access (Repository)

다른 도메인 테이블(t_room — room 도메인)을 door 어휘로 읽는다(AGENTS 도메인 간 데이터 접근). 형제: room.repository.ts:652-658 `findRoom`(`notDeleted` + `loadRelationIds` + 통일 500).

```ts
// apps/user-service/src/door/door.symbols.ts — new
/** 문 repository 포트 토큰 — 구현: DoorRepository */
export const DOOR_REPOSITORY = Symbol('DoorRepositoryInterface');
```

```ts
// apps/user-service/src/door/interfaces/door.repository.interface.ts — new
import type {FindOptionsWhere} from 'typeorm';
import type {RoomEntity} from '@app/database/entities/room/room.entity.js';

/**
 * 문 repository 포트 — 문 정보는 Redis(DOOR_STORE)에 있고, DB 에서는 호실이 있는지만 본다.
 */
export interface DoorRepositoryInterface {
    /**
     * 문을 둘 호실 — 지워지지 않은 호실만(is_deleted = 0 은 repository 가 붙인다)
     *
     * @param where 조건
     * @returns 호실 또는 null
     */
    findDoorRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null>;
}
```

```ts
// apps/user-service/src/door/repositories/door.repository.ts — new
import {Injectable, InternalServerErrorException} from '@nestjs/common';
import {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import type {FindOptionsWhere, Repository} from 'typeorm';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {notDeleted} from '@app/database/soft-delete.js';
import type {DoorRepositoryInterface} from '../interfaces/door.repository.interface.js';

/** DB 최종 실패 메시지 */
const SERVER_ERROR_MESSAGE = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

/**
 * door repository (아웃바운드 어댑터) — 공유 DB 의 t_room(room 도메인 테이블)을 door 어휘로 읽기만 한다.
 * 문 정보 자체는 Redis 포트(DOOR_STORE)에 있다. 조회에는 항상 is_deleted = 0 을 붙인다(notDeleted).
 */
@Injectable()
export class DoorRepository implements DoorRepositoryInterface {
    /**
     * @param txHost 트랜잭션 호스트
     */
    constructor(private readonly txHost: TransactionHost<TransactionalAdapterTypeOrm>) {}

    /** t_room */
    private get rooms(): Repository<RoomEntity> {
        return this.txHost.tx.getRepository(RoomEntity);
    }

    /**
     * 문을 둘 호실 — 지워지지 않은 호실만
     *
     * @param where 조건 (service 는 is_deleted 를 넣지 않는다)
     * @returns 호실 또는 null
     */
    async findDoorRoom(where: FindOptionsWhere<RoomEntity>): Promise<RoomEntity | null> {
        try {
            return await this.rooms.findOne({where: notDeleted(where), loadRelationIds: true});
        } catch {
            throw new InternalServerErrorException({message: SERVER_ERROR_MESSAGE});
        }
    }
}
```

### Business Logic (Service) · util

시각은 dayjs 로만 만든다(AGENTS 날짜 · 시각 — `@app/common/utils/dayjs.js`, 형제 user.service.ts:381 `dayjs(now).tz(KST_TIMEZONE)`). DB 쓰기가 없어 `@Transactional()` 을 두지 않는다. 메시지는 한 곳에서만 쓰여 throw 옆 리터럴.

```ts
// apps/user-service/src/door/door.util.ts — new
import {dayjs, KST_TIMEZONE} from '@app/common/utils/dayjs.js';

/** 문 시각 형식 — 한국 시각 yyyyMMddHHmmss (Redis 문 정보의 시각 칸) */
const DOOR_TIME_FORMAT = 'YYYYMMDDHHmmss';

/**
 * 문을 열거나 닫은 시각 — 한국 시각 `yyyyMMddHHmmss`(밀리초는 버린다).
 *
 * @param at 시각
 * @returns 예: 20261101022459
 */
export function toDoorTime(at: Date): string {
    return dayjs(at).tz(KST_TIMEZONE).format(DOOR_TIME_FORMAT);
}
```

```ts
// apps/user-service/src/door/door.service.ts — new
import {Inject, Injectable, NotFoundException} from '@nestjs/common';
import type {DoorCloseDto} from '@app/contracts/door/dto/door-close.dto.js';
import type {DoorOpenDto, DoorOpenResultDto} from '@app/contracts/door/dto/door-open.dto.js';
import {DOOR_STATE} from '@app/integration/integration.constants.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import type {DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import type {DoorRepositoryInterface} from './interfaces/door.repository.interface.js';
import {DOOR_REPOSITORY} from './door.symbols.js';
import {toDoorTime} from './door.util.js';

/**
 * 문 service — 호실 문의 열림/닫힘 · 마지막 시각을 문 정보 포트(Redis)에 남긴다.
 * 서버는 문을 직접 움직이지 않는다 — 문 쪽 타 업체 프로그램이 이 결과를 보고 문을 연다. DB 쓰기가 없어 `@Transactional()` 이 없다.
 */
@Injectable()
export class DoorService {
    /**
     * @param doorRepository 문 repository 포트 (호실 확인)
     * @param doorStore 문 정보 포트 (Redis)
     */
    constructor(
        @Inject(DOOR_REPOSITORY) private readonly doorRepository: DoorRepositoryInterface,
        @Inject(DOOR_STORE) private readonly doorStore: DoorStoreInterface,
    ) {}

    /**
     * QR 로 문 열기 — 같은 QR 을 가진 문을 open + 지금 시각으로 바꾸고 그 호실을 돌려준다. 여기까지만 한다(체크인 · 예약 확인 없음).
     * (내부 HTTP: POST /internal/v1/user-service/door/open)
     *
     * @param dto QR 정보
     * @returns 연 문의 room_id · 상태 · 시각
     * @throws NotFoundException 일치하는 QR 의 문이 없을 때
     */
    async openDoor(dto: DoorOpenDto): Promise<DoorOpenResultDto> {
        // 1. 지금 시각 (한국 시각 yyyyMMddHHmmss)
        const changed_at = toDoorTime(new Date());

        // 2. QR 이 같은 문을 open — 찾기와 쓰기는 포트가 한 번에
        const room_id = await this.doorStore.open(dto.qr, changed_at);
        if (!room_id) {
            throw new NotFoundException({message: '일치하는 QR 정보가 없습니다.'});
        }
        return {room_id, door_state: DOOR_STATE.OPEN, door_changed_at: changed_at};
    }

    /**
     * 문 닫기 — 권한 없이 그 호실 문을 close + 지금 시각으로 바꾼다. 지워지지 않은 호실이 없으면 404(아무 값으로 Redis 키가 쌓이지 않게).
     * (내부 HTTP: POST /internal/v1/user-service/door/close)
     *
     * @param dto 호실 ID
     * @throws NotFoundException 호실이 없을 때
     */
    async closeDoor(dto: DoorCloseDto): Promise<void> {
        // 1. 호실
        const room = await this.doorRepository.findDoorRoom({room_id: dto.room_id});
        if (!room) {
            throw new NotFoundException({message: '호실을 찾을 수 없습니다.'});
        }

        // 2. close + 지금 시각
        await this.doorStore.close(room.room_id, toDoorTime(new Date()));
    }
}
```

### Entry Point (Controller) · 모듈

user-service 내부 HTTP(형제 user.controller.ts:12-34) · 게이트웨이 동기(형제 gateway user.controller.ts:26-49 — 가드 없는 로그인 라우트와 같은 모양, `@ApiTags` → `@Controller`, verb → `@HttpCode` → `@ApiOperation` → `@ApiBody` → `@ApiOkResponse` → 에러 응답). 큐 경로가 없어 `.controller.queue.ts` 는 두지 않는다.

```ts
// apps/user-service/src/door/controllers/door.controller.ts — new
import {Body, Controller, HttpCode, Post} from '@nestjs/common';
import {DoorCloseDto} from '@app/contracts/door/dto/door-close.dto.js';
import {DoorOpenDto, DoorOpenResultDto} from '@app/contracts/door/dto/door-open.dto.js';
import {DoorService} from '../door.service.js';

/**
 * 문 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로만 받는다(외부 비공개, Swagger 없음). 큐 경로는 없다.
 * 내부 토큰 검사는 user-service 전역 InternalAuthGuard(APP_GUARD)가 한다 — 게이트웨이를 거치지 않은 요청은 여기 닿지 않는다.
 */
@Controller('/internal/v1/user-service/door')
export class DoorController {
    /**
     * @param doorService 문 service
     */
    constructor(private readonly doorService: DoorService) {}

    /**
     * QR 로 문 열기
     */
    @Post('/open')
    @HttpCode(200)
    async openDoor(@Body() dto: DoorOpenDto): Promise<DoorOpenResultDto> {
        return this.doorService.openDoor(dto);
    }

    /**
     * 문 닫기
     */
    @Post('/close')
    @HttpCode(200)
    async closeDoor(@Body() dto: DoorCloseDto): Promise<void> {
        return this.doorService.closeDoor(dto);
    }
}
```

```ts
// apps/user-service/src/door/door.module.ts — new
import {Module} from '@nestjs/common';
import {DoorController} from './controllers/door.controller.js';
import {DoorRepository} from './repositories/door.repository.js';
import {DoorService} from './door.service.js';
import {DOOR_REPOSITORY} from './door.symbols.js';

/**
 * 문 도메인 — 내부 HTTP(게이트웨이 동기 경로)만 있다. 문 정보 포트(DOOR_STORE)는 루트 모듈의 DoorStoreModule 이 전역으로 준다.
 * - DoorController(controllers/door.controller.ts): 문 열기 · 닫기
 */
@Module({controllers: [DoorController], providers: [DoorService, {provide: DOOR_REPOSITORY, useClass: DoorRepository}]})
export class DoorModule {}
```

```ts
// apps/user-service/src/user-service.module.ts — modified (파일 전체)
import {Module} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {USER_COMMAND_BINDING, USER_COMMAND_QUEUE} from '@app/contracts/user/user.commands.js';
import {DatabaseModule} from '@app/database/database.module.js';
import {SeederService} from '@app/database/seeder/seeder.service.js';
import {BROKER_USER} from '@app/messaging/messaging.constants.js';
import {DoorStoreModule} from '@app/integration/door/door-store.module.js';
import {SmsModule} from '@app/integration/sms/sms.module.js';
import {MessagingModule} from '@app/messaging/messaging.module.js';
import {DoorModule} from './door/door.module.js';
import {UserModule} from './user/user.module.js';

/**
 * user-service 루트 모듈 — 게이트웨이를 거친 요청만 받는다.
 * - APP_GUARD(InternalAuthGuard): 모든 HTTP 요청에 게이트웨이의 내부 토큰을 요구한다
 * - APP_INTERCEPTOR(ReturnedExceptionInterceptor): 내부 HTTP 컨트롤러가 반환한 HttpException 을 실패 응답으로 바꾼다(커밋 뒤 실패 — 큐 경로는 CommandDispatcher)
 * - DatabaseModule: TypeORM(PostgreSQL) + `@Transactional()` (nestjs-cls)
 * - MessagingModule.forService: q.user.cmd 소비 → `@OnCommand` 핸들러 디스패치 (user_id 가 gateway 인 명령만 처리)
 * - SmsModule: SMS 발송 포트(SMS_SENDER, Amazon SNS) — 휴대폰 인증 · 아이디 찾기 · 비밀번호 초기화
 * - DoorStoreModule: 문 정보 포트(DOOR_STORE, Redis — RedisModule 연결 포함) — 문 열기 · 닫기
 * - SeederService: DB 를 소유하는 이 서비스가 룩업 기본 데이터 · 첫 총관리자를 보장한다
 * 도메인: UserModule(회원) · DoorModule(문). crontab 은 scheduler 앱이 돌린다(이 서비스에는 ScheduleModule 이 없다).
 */
@Module({
    imports: [
        DatabaseModule,
        MessagingModule.forService({queue: USER_COMMAND_QUEUE, binding_keys: [USER_COMMAND_BINDING], broker_user: BROKER_USER.USER_SERVICE}),
        SmsModule,
        DoorStoreModule,
        UserModule,
        DoorModule,
    ],
    providers: [{provide: APP_GUARD, useClass: InternalAuthGuard}, {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}, SeederService],
})
export class UserServiceModule {}
```

```ts
// apps/gateway/src/api/v1/user-service/door/controllers/door.controller.ts — new
import {Body, Controller, HttpCode, Post} from '@nestjs/common';
import {ApiBadRequestResponse, ApiBody, ApiInternalServerErrorResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import {DoorCloseDto} from '@app/contracts/door/dto/door-close.dto.js';
import {DoorOpenDto, DoorOpenResultDto} from '@app/contracts/door/dto/door-open.dto.js';
import {DOOR_INTERNAL_PATH} from '@app/contracts/door/door.commands.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 문 공개 API — 동기 경로(내부 HTTP). 게이트웨이 인바운드 어댑터. 로직 0.
 * 문 쪽 타 업체 프로그램이 부른다 — 로그인 가드가 없고 QR(32자 무작위)이 열쇠다. 큐 경로는 없다.
 */
@ApiTags('문')
@Controller('/api/v1/user-service/door')
export class DoorController {
    /**
     * @param internalHttp 동기 경로 — user-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * QR 로 문 열기 — 예약자 QR 화면에서 읽은 QR 로 부른다. 같은 QR 의 문이 open + 지금 시각이 되고 room_id 를 돌려준다(문을 열지는 부른 쪽이 정한다)
     */
    @Post('/open')
    @HttpCode(200)
    @ApiOperation({summary: 'QR 로 문 열기'})
    @ApiBody({type: DoorOpenDto})
    @ApiOkResponse({type: DoorOpenResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async openDoor(@Body() dto: DoorOpenDto): Promise<DoorOpenResultDto> {
        return this.internalHttp.request<DoorOpenResultDto>('user', 'POST', DOOR_INTERNAL_PATH.OPEN, {body: dto});
    }

    /**
     * 문 닫기 — 권한 없이 그 호실 문을 close + 지금 시각으로(빈 본문). 지워지지 않은 호실이 없으면 404
     */
    @Post('/close')
    @HttpCode(200)
    @ApiOperation({summary: '문 닫기'})
    @ApiBody({type: DoorCloseDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async closeDoor(@Body() dto: DoorCloseDto): Promise<void> {
        return this.internalHttp.request<void>('user', 'POST', DOOR_INTERNAL_PATH.CLOSE, {body: dto});
    }
}
```

```ts
// apps/gateway/src/api/v1/user-service/door/door.module.ts — new
import {Module} from '@nestjs/common';
import {DoorController} from './controllers/door.controller.js';

/**
 * 게이트웨이 문 라우트 — `/api/v1/user-service/door`. 동기 경로만(DoorController — 내부 HTTP), 큐 경로는 없다.
 * 로그인 가드가 없다 — 문 쪽 타 업체 프로그램이 부르고 QR 자체가 열쇠다. 전달 수단(TransportModule)은 전역이다.
 */
@Module({controllers: [DoorController]})
export class DoorModule {}
```

```ts
// apps/gateway/src/gateway.module.ts — modified (파일 전체)
import {Module} from '@nestjs/common';
import {MessagingModule} from '@app/messaging/messaging.module.js';
import {PassportJwtAuthModule} from './guards/passport.jwt.auth/passport.jwt.auth.module.js';
import {TransportModule} from './modules/transport/transport.module.js';
import {AdminModule} from './api/v1/admin-service/admin/admin.module.js';
import {ManagerModule} from './api/v1/admin-service/manager/manager.module.js';
import {RoomModule} from './api/v1/admin-service/room/room.module.js';
import {StoreModule} from './api/v1/admin-service/store/store.module.js';
import {DoorModule} from './api/v1/user-service/door/door.module.js';
import {UserModule} from './api/v1/user-service/user/user.module.js';

/**
 * 게이트웨이 루트 모듈 — 유일한 외부 진입점.
 * DB 를 쓰지 않는다. 회원 상태 확인도 user-service 내부 HTTP 로 묻는다.
 * - MessagingModule.forGateway: 명령 발행 + 인스턴스 전용 결과 큐
 * - TransportModule: 동기(내부 HTTP) · 큐(RabbitMQ + SSE) 전달 수단
 * - PassportJwtAuthModule: JWT 전략 (guards/)
 * - 로그인 그룹별 라우트: UserModule(/api/v1/user-service/user) · ManagerModule(/api/v1/admin-service/manager) · AdminModule(/api/v1/admin-service/admin) · StoreModule(/api/v1/admin-service/store — 이용자 · 관리자 가드) · RoomModule(/api/v1/admin-service/room — 매니저 가드)
 * - 문 라우트: DoorModule(/api/v1/user-service/door — 가드 없음, 문 쪽 타 업체 프로그램이 QR 로 부른다)
 */
@Module({imports: [MessagingModule.forGateway(), TransportModule, PassportJwtAuthModule, UserModule, ManagerModule, AdminModule, StoreModule, RoomModule, DoorModule]})
export class GatewayModule {}
```

### Tests — 도우미 · service 기능 spec · repository spec

형제: 동기 경로 부팅 user.test-helper.ts:120-138(`bootHttpPath` — 실제 controller + service + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor, 포트 · repository 만 mock), 내부 토큰 403 단언 user-login.spec.ts:154-163, repository 가짜 txHost room.repository.spec.ts:48-74.

```ts
// apps/user-service/src/door/test/door.test-helper.ts — new
import {INestApplication, ValidationPipe} from '@nestjs/common';
import {APP_GUARD, APP_INTERCEPTOR} from '@nestjs/core';
import {Test} from '@nestjs/testing';
import type {Mock} from 'vitest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {InternalAuthGuard} from '@app/common/internal/internal-auth.guard.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {DOOR_STORE} from '@app/integration/integration.symbols.js';
import type {DoorStoreInterface} from '@app/integration/interfaces/integration.interface.js';
import {DoorController} from '../controllers/door.controller.js';
import type {DoorRepositoryInterface} from '../interfaces/door.repository.interface.js';
import {DoorService} from '../door.service.js';
import {DOOR_REPOSITORY} from '../door.symbols.js';

/** 테스트용 내부 요청 비밀값 */
export const TEST_INTERNAL_TOKEN = 'test-internal-token';

/** QR 정보 (32자 hex) */
export const QR = 'a1'.repeat(16);

/** 호실 ID */
export const ROOM_ID = 'b2'.repeat(16);

/** 상태 저장소(Redis) 503 메시지 */
export const REDIS_UNAVAILABLE = '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';

/**
 * [CASES:toDoorTime] — 지금(UTC) → 저장되는 문 시각(한국 시각 yyyyMMddHHmmss). 사용자 결정 2026-11-01
 * [이름, 지금, 문 시각]
 */
export const DOOR_TIME_CASES: [string, string, string][] = [
    ['한국은 다음 날', '2026-10-31T17:24:59Z', '20261101022459'],
    ['한국 09시', '2026-11-01T00:00:00Z', '20261101090000'],
    ['연도 경계', '2026-12-31T15:00:00Z', '20270101000000'],
    ['밀리초는 버림', '2026-11-01T14:59:59.999Z', '20261101235959'],
    ['윤년 2월 29일', '2028-02-28T15:30:00Z', '20280229003000'],
];

/** 문 repository 포트 mock */
export type DoorRepositoryMock = {[K in keyof DoorRepositoryInterface]: Mock};

/** 문 정보 포트 mock */
export type DoorStoreMock = {[K in keyof DoorStoreInterface]: Mock};

/**
 * 문 repository mock — 포트 메서드마다 vi.fn()
 *
 * @returns mock
 */
export function createDoorRepositoryMock(): DoorRepositoryMock {
    return {findDoorRoom: vi.fn()};
}

/**
 * 문 정보 포트 mock — 포트 메서드마다 vi.fn()
 *
 * @returns mock
 */
export function createDoorStoreMock(): DoorStoreMock {
    return {get: vi.fn(), issueQr: vi.fn(), open: vi.fn(), close: vi.fn()};
}

/**
 * 동기 경로 부팅 — 실제 DoorController + DoorService + ValidationPipe + 필터 + 전역 InternalAuthGuard · ReturnedExceptionInterceptor, repository · 문 정보 포트만 mock.
 *
 * @param repo repository mock
 * @param store 문 정보 포트 mock
 * @returns Nest 앱
 */
export async function bootHttpPath(repo: DoorRepositoryMock, store: DoorStoreMock): Promise<INestApplication> {
    process.env.INTERNAL_API_TOKEN = TEST_INTERNAL_TOKEN;
    const module = await Test.createTestingModule({
        controllers: [DoorController],
        providers: [
            DoorService,
            {provide: DOOR_REPOSITORY, useValue: repo},
            {provide: DOOR_STORE, useValue: store},
            {provide: APP_GUARD, useClass: InternalAuthGuard},
            {provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor},
        ],
    }).compile();
    const app = module.createNestApplication();
    app.useGlobalFilters(new CustomErrorFilter());
    app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
    await app.init();
    return app;
}

/**
 * 게이트웨이가 붙이는 내부 요청 헤더
 *
 * @returns 헤더
 */
export function internalHeaders(): Record<string, string> {
    return {[INTERNAL_HEADER.TOKEN]: TEST_INTERNAL_TOKEN};
}
```

```ts
// apps/user-service/src/door/test/door-open.spec.ts — new
import {INestApplication, ServiceUnavailableException} from '@nestjs/common';
import request from 'supertest';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {bootHttpPath, createDoorRepositoryMock, createDoorStoreMock, DOOR_TIME_CASES, DoorRepositoryMock, DoorStoreMock, internalHeaders, QR, REDIS_UNAVAILABLE, ROOM_ID} from './door.test-helper.js';

const PATH = '/internal/v1/user-service/door/open';

describe('POST /internal/v1/user-service/door/open — QR 로 문 열기 (동기 경로)', () => {
    let app: INestApplication;
    let repo: DoorRepositoryMock;
    let store: DoorStoreMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-10-31T17:24:59Z'));
        repo = createDoorRepositoryMock();
        store = createDoorStoreMock();
        app = await bootHttpPath(repo, store);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('같은 QR 의 문을 open + 지금 시각(한국)으로 바꾸고 room_id · 상태 · 시각을 돌려준다 — 호실 조회 · 닫기 · 발급 없음', async () => {
            store.open.mockResolvedValueOnce(ROOM_ID);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({qr: QR});

            expect(res.status).toBe(200);
            expect(res.body).toEqual({room_id: ROOM_ID, door_state: 'open', door_changed_at: '20261101022459'});
            expect(store.open).toHaveBeenCalledTimes(1);
            expect(store.open).toHaveBeenCalledWith(QR, '20261101022459');
            expect(store.close).not.toHaveBeenCalled();
            expect(store.issueQr).not.toHaveBeenCalled();
            expect(repo.findDoorRoom).not.toHaveBeenCalled();
        });
    });

    describe('[CASES:toDoorTime] 지금(UTC) → 문 시각(한국 yyyyMMddHHmmss)', () => {
        it.each(DOOR_TIME_CASES)('%s — %s → %s', async (_label, now, expected) => {
            vi.setSystemTime(new Date(now));
            store.open.mockResolvedValueOnce(ROOM_ID);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({qr: QR});

            expect(res.status).toBe(200);
            expect(res.body.door_changed_at).toBe(expected);
            expect(store.open).toHaveBeenCalledWith(QR, expected);
        });
    });

    describe('[FAIL:service]', () => {
        it('같은 QR 의 문이 없으면 404 — 입력 오류가 아니라 validation_errors null', async () => {
            store.open.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({qr: QR});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '일치하는 QR 정보가 없습니다.', validation_errors: null});
            expect(store.open).toHaveBeenCalledTimes(1);
        });

        it('상태 저장소(Redis)에 닿지 못하면 503 을 그대로 돌려준다', async () => {
            store.open.mockRejectedValueOnce(new ServiceUnavailableException({message: REDIS_UNAVAILABLE}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({qr: QR});

            expect(res.status).toBe(503);
            expect(res.body).toEqual({message: REDIS_UNAVAILABLE, validation_errors: null});
        });
    });

    describe('[FAIL:validation] ValidationPipe — 400, 포트 호출 없음', () => {
        it.each([
            ['QR 없음', {}, 'QR 정보를 입력해주세요.'],
            ['대문자', {qr: 'A1'.repeat(16)}, 'QR 정보가 올바르지 않습니다.'],
            ['31자', {qr: 'a'.repeat(31)}, 'QR 정보가 올바르지 않습니다.'],
            ['hex 아님', {qr: 'z'.repeat(32)}, 'QR 정보가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, message) => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property: 'qr', message}]});
            expect(store.open).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:internal]', () => {
        it('내부 토큰이 없거나 틀리면 403, 포트 호출 없음', async () => {
            const missing = await request(app.getHttpServer()).post(PATH).send({qr: QR});
            const wrong = await request(app.getHttpServer()).post(PATH).set(INTERNAL_HEADER.TOKEN, 'wrong').send({qr: QR});

            expect(missing.status).toBe(403);
            expect(missing.body).toEqual({message: '내부 요청만 허용됩니다.', validation_errors: null});
            expect(wrong.status).toBe(403);
            expect(store.open).not.toHaveBeenCalled();
        });
    });
});
```

```ts
// apps/user-service/src/door/test/door-close.spec.ts — new
import {INestApplication, InternalServerErrorException, ServiceUnavailableException} from '@nestjs/common';
import request from 'supertest';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {bootHttpPath, createDoorRepositoryMock, createDoorStoreMock, DOOR_TIME_CASES, DoorRepositoryMock, DoorStoreMock, internalHeaders, REDIS_UNAVAILABLE, ROOM_ID} from './door.test-helper.js';

const PATH = '/internal/v1/user-service/door/close';
const ROOM = {room_id: ROOM_ID, store_id: 's'.repeat(32), is_deleted: 0};

describe('POST /internal/v1/user-service/door/close — 문 닫기 (동기 경로)', () => {
    let app: INestApplication;
    let repo: DoorRepositoryMock;
    let store: DoorStoreMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-10-31T17:24:59Z'));
        repo = createDoorRepositoryMock();
        store = createDoorStoreMock();
        app = await bootHttpPath(repo, store);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('지워지지 않은 호실이면 그 문을 close + 지금 시각(한국)으로 — 빈 본문, 열기 · 발급 없음', async () => {
            repo.findDoorRoom.mockResolvedValueOnce(ROOM);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(200);
            expect(res.text).toBe('');
            expect(repo.findDoorRoom).toHaveBeenCalledTimes(1);
            expect(repo.findDoorRoom).toHaveBeenCalledWith({room_id: ROOM_ID});
            expect(store.close).toHaveBeenCalledTimes(1);
            expect(store.close).toHaveBeenCalledWith(ROOM_ID, '20261101022459');
            expect(store.open).not.toHaveBeenCalled();
            expect(store.issueQr).not.toHaveBeenCalled();
        });
    });

    describe('[CASES:toDoorTime] 지금(UTC) → 문 시각(한국 yyyyMMddHHmmss)', () => {
        it.each(DOOR_TIME_CASES)('%s — %s → %s', async (_label, now, expected) => {
            vi.setSystemTime(new Date(now));
            repo.findDoorRoom.mockResolvedValueOnce(ROOM);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(200);
            expect(store.close).toHaveBeenCalledWith(ROOM_ID, expected);
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면(지운 호실 포함) 404 — 문 정보를 쓰지 않는다', async () => {
            repo.findDoorRoom.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '호실을 찾을 수 없습니다.', validation_errors: null});
            expect(store.close).not.toHaveBeenCalled();
        });

        it('상태 저장소(Redis)에 닿지 못하면 503 을 그대로 돌려준다', async () => {
            repo.findDoorRoom.mockResolvedValueOnce(ROOM);
            store.close.mockRejectedValueOnce(new ServiceUnavailableException({message: REDIS_UNAVAILABLE}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(503);
            expect(res.body).toEqual({message: REDIS_UNAVAILABLE, validation_errors: null});
        });
    });

    describe('[FAIL:repository]', () => {
        it('호실 조회가 500 이면 그대로 — 문 정보를 쓰지 않는다', async () => {
            repo.findDoorRoom.mockRejectedValueOnce(new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(500);
            expect(res.body).toEqual({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.', validation_errors: null});
            expect(store.close).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] ValidationPipe — 400, 조회 · 포트 호출 없음', () => {
        it.each([
            ['호실 ID 없음', {}, '호실 ID를 입력해주세요.'],
            ['32자 hex 아님', {room_id: 'x'.repeat(32)}, '호실 ID가 올바르지 않습니다.'],
            ['33자', {room_id: 'a'.repeat(33)}, '호실 ID가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, message) => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property: 'room_id', message}]});
            expect(repo.findDoorRoom).not.toHaveBeenCalled();
            expect(store.close).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:internal]', () => {
        it('내부 토큰이 없거나 틀리면 403, 조회 · 포트 호출 없음', async () => {
            const missing = await request(app.getHttpServer()).post(PATH).send({room_id: ROOM_ID});
            const wrong = await request(app.getHttpServer()).post(PATH).set(INTERNAL_HEADER.TOKEN, 'wrong').send({room_id: ROOM_ID});

            expect(missing.status).toBe(403);
            expect(missing.body).toEqual({message: '내부 요청만 허용됩니다.', validation_errors: null});
            expect(wrong.status).toBe(403);
            expect(repo.findDoorRoom).not.toHaveBeenCalled();
            expect(store.close).not.toHaveBeenCalled();
        });
    });
});
```

```ts
// apps/user-service/src/door/test/door.repository.spec.ts — new
import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {DoorRepository} from '../repositories/door.repository.js';

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(RoomEntity) 가 가짜 repository 를 돌려준다.
 *
 * @returns 저장소와 가짜 t_room repository
 */
function makeRepository() {
    const room = {findOne: vi.fn().mockResolvedValue(null)};
    const txHost = {tx: {getRepository: (entity: unknown) => (entity === RoomEntity ? room : undefined)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new DoorRepository(txHost), room};
}

describe('DoorRepository — t_room 을 door 어휘로 읽기만', () => {
    it('[SUCCESS] findDoorRoom 은 받은 조건에 is_deleted = 0 을 더하고(service 는 넣지 않는다) 관계는 ID 로 읽는다', async () => {
        const {repository, room} = makeRepository();
        const found = Object.assign(new RoomEntity(), {room_id: 'r1'});
        room.findOne.mockResolvedValueOnce(found);

        const result = await repository.findDoorRoom({room_id: 'r1'});

        expect(result).toBe(found);
        expect(room.findOne).toHaveBeenCalledTimes(1);
        expect(room.findOne).toHaveBeenCalledWith({where: {room_id: 'r1', is_deleted: 0}, loadRelationIds: true});
    });

    it('[FAIL:repository] DB 실패는 통일 500', async () => {
        const {repository, room} = makeRepository();
        room.findOne.mockRejectedValueOnce(new Error('db'));

        const error = await repository.findDoorRoom({room_id: 'r1'}).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(InternalServerErrorException);
        expect((error as InternalServerErrorException).getResponse()).toEqual({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'});
    });
});
```

### 문서 — 실행 가이드 · 규약

````md
<!-- docs/guides/redis-setup.md — new -->
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
````

````md
<!-- README.md — modified -->
<!-- 1) user-service 설명 줄 끝에 이어 쓴다 -->
… 첫 총관리자(`admin` / `1234`)를 넣는다. 문: 호실 문마다 QR 정보 · 열림/닫힘 · 마지막 시각을 Redis 에 두고, 문 쪽 타 업체 프로그램이 부르는 문 열기(QR — `POST /api/v1/user-service/door/open`) · 문 닫기(`/close`)를 받는다(로그인 없음 — QR 이 열쇠).

<!-- 2) gateway 설명의 공개 경로 목록에 문을 더한다 -->
… 업체(입점 신청 · 업체 관리) `/api/v1/admin-service/store` · 객실 `/api/v1/admin-service/room` · 문 `/api/v1/user-service/door`. …

<!-- 3) 스택 줄 -->
스택: NestJS 12 (ESM) · TypeORM 1.x + PostgreSQL 17 · RabbitMQ 4 · Redis 8(node-redis) · AWS SDK v3(SNS · S3) · Vitest · oxlint.

<!-- 4) "## 실행 (Docker)" 절 전체를 아래로 바꾼다 (다음 "## 명령" 앞까지) -->
## 실행

### 1. 준비 — `.env`

```bash
cp .env.example .env
```

| 꼭 채울 값 | 내용 |
|---|---|
| `JWT_SECRET` · `BCRYPT_CODE` · `TOKEN_CIPHER_KEY` · `INTERNAL_API_TOKEN` | 인증 · 암호화 비밀값(만드는 법은 `.env.example` 주석) |
| `RABBITMQ_GATEWAY_PASSWORD` · `RABBITMQ_USER_SERVICE_PASSWORD` · `RABBITMQ_ADMIN_SERVICE_PASSWORD` | 앱별 브로커 계정 |
| `REDIS_PASSWORD` · `REDIS_URL` | Redis 비밀번호 — `REDIS_URL` 안의 비밀번호와 같게 |
| `CORS_ORIGINS` | 프론트 주소 |

- `.env` 하나가 곧 서버 설정이다. Docker 는 값을 바꾸지 않고 그대로 쓰며, 필수값이 비어 있으면 띄우지 않는다.
- AWS 값(`AWS_REGION` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL`)은 비워도 서버는 뜨고 SMS 발송 · 파일 요청만 실패한다(공개 파일 주소를 쓰려면 `AWS_S3_PUBLIC_URL` — CloudFront 배포 주소). 채우는 방법은 [docs/guides/aws-setup.md](docs/guides/aws-setup.md).

### 2. 전체 실행 (Docker)

```bash
npm run docker:up     # 아래 묶음을 순서대로 빌드 + 실행
npm run docker:down   # 모두 내림 (공용 네트워크 · 데이터 볼륨은 남는다)
```

| 순서 | 묶음 | 명령 | 하는 일 |
|---|---|---|---|
| 1 | 공용 네트워크 | `npm run docker:network` | 묶음끼리 이름으로 찾는 네트워크 4개 (이미 있으면 건너뜀) |
| 2 | postgres | `npm run docker:postgres` | DB (127.0.0.1:5432) |
| 3 | rabbitmq | `npm run docker:rabbitmq` | 브로커 + 앱별 계정 초기화 (관리 화면 http://localhost:15672) |
| 4 | redis | `npm run docker:redis` | 문 정보 저장소 (127.0.0.1:6379, AOF 영속) — [docs/guides/redis-setup.md](docs/guides/redis-setup.md) |
| 5 | user-service | `npm run docker:user-service` | 마이그레이션 1회 → 인스턴스 N대 → 로드밸런서 |
| 6 | admin-service | `npm run docker:admin-service` | 매니저 · 관리자 인스턴스 → 로드밸런서 |
| 7 | scheduler | `npm run docker:scheduler` | crontab 전용 (포트 없음) |
| 8 | gateway | `npm run docker:gateway` | 외부 진입점 http://localhost:3000 · Swagger http://localhost:3000/swagger |

- 묶음마다 compose 파일이 따로 있어 하나씩 띄우고 내릴 수 있다(`npm run docker:<묶음>`). 로그는 `npm run docker:logs:<앱>`.
- gateway · user-service 는 여러 대(`GATEWAY_REPLICAS` · `USER_SERVICE_REPLICAS`, 기본 2), admin-service 는 `ADMIN_SERVICE_REPLICAS`(기본 1)로 뜨고 앞에 nginx 로드밸런서가 붙는다. scheduler 는 `SCHEDULER_REPLICAS`(기본 1)이고 포트 · 로드밸런서가 없다.
- user-service · admin-service 는 게이트웨이만 닿는다(전역 내부 토큰 가드 + internal 네트워크). 큐 명령도 gateway 브로커 계정이 발행한 것만 처리한다.
- 마이그레이션은 `migrate` 컨테이너(user-service 묶음)가 인스턴스보다 먼저 1회 적용한다. 적용 계정에는 PostgreSQL 확장 `btree_gist`(기간 겹침 배타 제약) 생성 권한이 필요하다(RDS PostgreSQL 13+ 는 DB 의 CREATE 권한). admin-service 는 같은 DB 를 쓰므로 user-service 묶음 뒤에 띄운다.
- 같은 휴대폰 번호의 하루 인증 SMS 수는 `SMS_VERIFICATION_DAILY_LIMIT`(기본 10), DB 연결 풀 대기 최대 시간은 `DATABASE_CONNECTION_TIMEOUT_MS`(기본 30000ms — 넘기면 500).

### 3. 로컬 개발 — 인프라만 Docker, 앱은 watch

```bash
npm install
npm run docker:infra        # 공용 네트워크 + postgres + rabbitmq(+계정 초기화) + redis
npm run db:migrate
npm run start:user-service  # :4001
npm run start:admin-service # :4002
npm run start:gateway       # :3000
npm run start:scheduler     # crontab (포트 없음)
```

- 같은 `.env` 를 쓰려면 hosts 파일에 `127.0.0.1 postgres rabbitmq redis` 를 넣는다(인프라 묶음의 포트가 127.0.0.1 에 열려 있다).

### 4. 운영으로 옮길 때

- compose 는 그대로 두고 `.env` 의 접속정보만 바꾼다 — DB `DATABASE_URL`(RDS 등) · 브로커 `RABBITMQ_HOST`(Amazon MQ 등) · Redis `REDIS_URL`(ElastiCache 등, TLS 면 `rediss://`). 바꾼 인프라의 묶음(postgres · rabbitmq · redis)은 띄우지 않는다.
- 올리기 전 확인: `NODE_ENV=production`(development 는 JWT 만료를 검사하지 않는다) · 비밀값 새로 생성 · `POSTGRES_PASSWORD` · `RABBITMQ_PASSWORD` · `REDIS_PASSWORD` 변경 · `CORS_ORIGINS` 를 실제 프론트 주소로.
- 자세한 구성: [docs/architecture.md](docs/architecture.md) 의 "실행 (Docker)" · Redis: [docs/guides/redis-setup.md](docs/guides/redis-setup.md) · AWS: [docs/guides/aws-setup.md](docs/guides/aws-setup.md).

<!-- 5) "## 명령" 표에서 바꾸는 줄 -->
| `npm run docker:up` · `docker:down` | 모든 묶음 실행 · 종료 |
| `npm run docker:postgres` · `docker:rabbitmq` · `docker:redis` · `docker:user-service` · `docker:admin-service` · `docker:scheduler` · `docker:gateway` | 묶음 하나만 실행 |
| `npm run docker:infra` | 공용 네트워크 · postgres · rabbitmq(+계정 초기화) · redis 만 실행 (앱 로컬 개발용) |
````

```md
<!-- docs/integration.md — modified -->
<!-- 머리 사용처 줄 -->
> 사용처: user-service 의 휴대폰 SMS 인증 · 아이디 찾기 · 문 열기 · 닫기(문 정보 — Redis), admin-service 의 매니저 아이디 찾기 · 비밀번호 초기화(루트 모듈이 `SmsModule` · `DoorStoreModule` 을 import 한다). AWS 세팅은 [guides/aws-setup.md](guides/aws-setup.md), Redis 는 [guides/redis-setup.md](guides/redis-setup.md).

<!-- "## 구성" 표 — 행을 고치고 더한다 -->
| `integration.symbols.ts` | `SMS_SENDER` · `STORAGE_GATEWAY` · `DOOR_STORE` |
| `interfaces/integration.interface.ts` | `SmsSenderInterface` · `SmsMessage` · `StorageGatewayInterface` · `StorageUploadInput` · `StorageUploadResult` · `StorageDownloadResult` · `DoorStoreInterface` · `DoorRecord` · `DoorState` |
| `integration.constants.ts` | `SMS_UNAVAILABLE_MESSAGE` · `STORAGE_UNAVAILABLE_MESSAGE` · `STORAGE_PUBLIC_URL_MISSING_MESSAGE` · `STORAGE_UPLOAD_URL_TTL_SECONDS` · `STORAGE_DOWNLOAD_URL_TTL_SECONDS` · `REDIS_UNAVAILABLE_MESSAGE` · `DOOR_QR_ISSUE_FAILED_MESSAGE` · `DOOR_STATE` · `DOOR_TIME_NONE` · `DOOR_QR_ISSUE_ATTEMPTS` |
| `redis/redis.connection.ts` · `redis/redis.module.ts` | `RedisConnection`(node-redis — 부팅을 막지 않는 연결 · 끊긴 동안 명령을 쌓지 않음 · 준비 전 503) · `RedisModule`(`@Global`) |
| `door/redis-door.store.ts` · `door/door-store.module.ts` | `RedisDoorStore`(Lua 스크립트 3개 — 열기 · 닫기 · QR 발급) · `DoorStoreModule`(`@Global`, RedisModule 포함) |

<!-- 설정 줄 -->
설정은 `.env` 의 `AWS_REGION` · `AWS_ACCESS_KEY_ID` · `AWS_SECRET_ACCESS_KEY` · `AWS_S3_BUCKET` · `AWS_S3_PUBLIC_URL`(AWS — 자격증명은 SDK 기본 체인, IAM 역할이면 키를 비운다)과 `REDIS_URL`(Redis) 이다.

<!-- "## 저장 키 · CDN" 절 다음에 새 절 -->
## 문 정보 (`DOOR_STORE` · Redis)

- **저장 모양** — `door:<room_id>` = `QR:상태:시각`(상태 `open` | `close`, 시각은 한국 시각 yyyyMMddHHmmss — 만드는 쪽은 service 의 `toDoorTime`), `door-qr:<QR>` = room_id. 기록이 없는 문은 키가 없고 `get` 이 `{qr: null, state: 'close', changed_at: '00000000000000'}` 으로 읽는다.
- **원자적 3동작** — 열기(QR 색인으로 문을 찾아 open + 시각) · 닫기(QR 은 그대로 close + 시각) · QR 발급(새 색인을 `SET NX` 로 잡은 뒤 문 정보를 바꾸고 이전 색인을 지운다)은 Lua 스크립트 1개씩이다. 그래서 QR 은 두 문에 겹치지 않고, 열기와 발급이 겹쳐도 옛 QR 로 덮어쓰지 않는다.
- **단일 노드 전제** — 스크립트가 값에서 읽은 키를 쓰므로 클러스터 모드가 아닌 Redis(ElastiCache 는 클러스터 모드 끔)여야 한다.
- 서버는 문을 직접 움직이지 않는다 — 문 쪽 타 업체 프로그램이 읽은 QR 로 문 열기 API 를 부르고 그 결과로 문을 연다. QR 발급의 첫 사용처는 예약 쪽(로드맵 Phase 15 #112)이다.

<!-- "## 실패 계약" 첫 줄 다음에 -->
- Redis 가 준비되지 않았거나 명령이 실패하면 `ServiceUnavailableException({message: REDIS_UNAVAILABLE_MESSAGE})`(503, "상태 저장소에 연결할 수 없습니다") — `RedisConnection.ready()` · `RedisDoorStore` 가 던진다. QR 발급이 겹치지 않는 값을 3번 안에 못 잡으면 `InternalServerErrorException({message: DOOR_QR_ISSUE_FAILED_MESSAGE})`(500).
```

```md
<!-- docs/architecture.md — modified -->
<!-- libs 표의 libs/integration 행 -->
| `libs/integration` | 외부 연동 포트 `SMS_SENDER`(Amazon SNS) · `STORAGE_GATEWAY`(Amazon S3, presigned URL) · `DOOR_STORE`(Redis — 문 정보) · `SmsModule` · `StorageModule` · `RedisModule` · `DoorStoreModule`(전역) — [integration.md](integration.md) · … |

<!-- gateway 모듈 줄의 라우트 모듈 목록 -->
… 도메인 라우트 모듈(`UserModule` · `DoorModule` — `api/v1/user-service/{user,door}`(문은 가드 없음), `ManagerModule` · `AdminModule` · `StoreModule` · `RoomModule` — `api/v1/admin-service/{manager,admin,store,room}`) …

<!-- user-service 모듈 줄 -->
**user-service** — `UserServiceModule` = `DatabaseModule`(…) + `MessagingModule.forService({…})`(…) + `SmsModule` + `DoorStoreModule`(문 정보 포트 `DOOR_STORE` — Redis 연결 `RedisModule` 포함) + `UserModule` · `DoorModule`(문 — 내부 HTTP 2개, 큐 없음) + providers … crontab 이 없다(scheduler).

<!-- "## 실행 (Docker)" — 제목 · 첫 문장 · 명령 블록 · compose 표 -->
## 실행 (Docker) — 묶음 7개를 따로 띄운다

postgres · rabbitmq · redis · user-service · admin-service · scheduler · gateway 는 compose 파일이 하나씩 따로 있어 각자 띄우고 내린다. …

npm run docker:up            # 아래 1~8 을 순서대로
npm run docker:network       # 1. 공용 네트워크 4개 (이미 있으면 건너뜀)
npm run docker:postgres      # 2. compose.postgres.yml — healthy 까지 기다림
npm run docker:rabbitmq      # 3. compose.rabbitmq.yml — healthy 후 브로커 계정 초기화 1회
npm run docker:redis         # 4. compose.redis.yml — healthy 까지 기다림 (AOF 영속)
npm run docker:user-service  # 5. compose.user-service.yml — 마이그레이션 → 인스턴스 N대 → LB
npm run docker:admin-service # 6. compose.admin-service.yml — 매니저 · 관리자 인스턴스 N대 → LB
npm run docker:scheduler     # 7. compose.scheduler.yml — crontab 전용 인스턴스 (포트 없음)
npm run docker:gateway       # 8. compose.gateway.yml — 인스턴스 N대 → LB (:3000)

| `compose.redis.yml` | redis | 가상 운영용 Redis 8 (127.0.0.1:6379) — 문 정보의 원본이라 AOF 영속 · 비밀번호(`REDIS_PASSWORD`), 볼륨 `roomless-redis-data` — 실제 운영(ElastiCache 등 · 클러스터 모드 끔)이면 띄우지 않는다 ([guides/redis-setup.md](guides/redis-setup.md)) |

<!-- 설정 절 -->
- 가상 운영 · 실제 운영 줄: … 가상 운영은 같은 서버에 postgres · rabbitmq · redis 묶음을 띄우고 주소를 컨테이너 이름(`postgres` · `rabbitmq` · `redis`)으로 둔다. 실제 운영은 세 묶음을 띄우지 않고 RDS · Amazon MQ · ElastiCache 주소를 둔다.
- 로컬 실행 줄: hosts 파일에 `127.0.0.1 postgres rabbitmq redis`.
- 운영 전 확인 줄: … `POSTGRES_PASSWORD` · `RABBITMQ_PASSWORD` · `REDIS_PASSWORD` 변경 …
- 쓰지 않는 비밀값 행: user-service 는 `REDIS_PASSWORD`, admin-service · scheduler · gateway 는 `REDIS_URL` · `REDIS_PASSWORD` 도 빈 값.

<!-- 네트워크 표 -->
| `roomless-data` | postgres · redis · migrate · user-service · admin-service · scheduler |

<!-- 로컬 개발 명령 -->
npm run docker:infra          # 공용 네트워크 + postgres + rabbitmq(+계정 초기화) + redis
```

```md
<!-- AGENTS.md — modified -->
<!-- Architecture 트리: user-service 아래 user/ 다음 -->
│   ├── user/                 # 이용자 도메인: …
│   ├── door/                 # 문 도메인(문 열기 · 닫기 — 문 쪽 타 업체 프로그램, 가드 없음): controllers/(door.controller.ts 내부 HTTP — 큐 없음) → DoorService → DOOR_STORE(Redis)
<!-- 게이트웨이 공개 라우트 줄 -->
│   ├── api/v1/<service>/<domain>/  # 공개 라우트 — user-service/{user,door} · admin-service/{manager,admin,store,room}. …
<!-- libs/integration 줄 -->
├── integration/  # 외부 연동 포트 — SMS 발송(SMS_SENDER · Amazon SNS) · 파일 저장(STORAGE_GATEWAY · S3 + CloudFront) · 문 정보(DOOR_STORE · Redis) · SmsModule · StorageModule · RedisModule · DoorStoreModule(전역)

<!-- Auth — "미적용 규약" 줄 앞에 한 줄 -->
- **인증 없는 공개 라우트(적용 — 문 `/api/v1/user-service/door/open` · `/close`)**: 로그인 사용자가 아니라 문 쪽 타 업체 프로그램이 부른다 — 가드를 붙이지 않고, 열기는 QR(32자 무작위)이 열쇠, 닫기는 지워지지 않은 호실만(404). 서비스 쪽 전역 InternalAuthGuard(게이트웨이 내부 토큰)는 그대로다.

<!-- Key Patterns — 전역 모듈 줄 -->
- **전역 모듈**: `TransportModule`(게이트웨이) · `DatabaseModule` · `MessagingModule` · `SmsModule` · `StorageModule` · `RedisModule` · `DoorStoreModule` 은 전역이라 도메인 모듈은 import 없이 주입받는다.
<!-- Key Patterns — 외부 연동 목록에 한 줄 -->
  - 문 정보는 `DOOR_STORE`(Redis) — `door:<room_id>` = `QR:open|close:yyyyMMddHHmmss`, `door-qr:<QR>` = room_id. 열기 · 닫기 · QR 발급은 Lua 스크립트 1개씩(원자적, QR 은 `SET NX` 로 겹치지 않음). 캐시가 아니라 원본이라 Redis 는 AOF 영속 · 단일 노드(클러스터 모드 끔). Redis 가 없어도 부팅하고 문 요청만 503.
<!-- Key Patterns — Docker 줄 -->
- **Docker 실행 — 묶음 7개를 따로**: `compose.postgres.yml` · `compose.rabbitmq.yml`(…) · `compose.redis.yml`(Redis 8 — AOF 영속 · 비밀번호, `roomless-data`) · `compose.user-service.yml`(…) · … `docker:up` 순서는 인프라(postgres → rabbitmq → redis) → user-service(마이그레이션) → admin-service → scheduler → gateway. … `npm run docker:infra` 는 postgres · rabbitmq · redis.
<!-- Key Patterns — .env 줄의 환경 값 목록 -->
… compose 는 환경 값(NODE_ENV · DB/RabbitMQ/Redis 접속정보 · 비밀값 · …)을 … 가상 운영(같은 서버의 postgres · rabbitmq · redis 묶음 …)과 실제 운영(RDS · Amazon MQ · ElastiCache) …
```

---

## Test Cases

```
[CASES:toDoorTime]   door-open.spec.ts · door-close.spec.ts — 같은 표를 두 경로에서(util 단위 spec 없음 — AGENTS), 시계 고정(vi.useFakeTimers Date)
  2026-10-31T17:24:59Z      → 20261101022459   한국은 다음 날
  2026-11-01T00:00:00Z      → 20261101090000   한국 09시
  2026-12-31T15:00:00Z      → 20270101000000   연도 경계
  2026-11-01T14:59:59.999Z  → 20261101235959   밀리초는 버림
  2028-02-28T15:30:00Z      → 20280229003000   윤년 2월 29일
[SUCCESS]            문 열기 — store.open(QR, 시각) 1회 · 응답 {room_id, door_state: 'open', door_changed_at} · 호실 조회 · close · issueQr 미호출
[SUCCESS]            문 닫기 — findDoorRoom({room_id}) 1회 · store.close(room_id, 시각) 1회 · 200 빈 본문 · open · issueQr 미호출
[FAIL:validation]    열기 qr 없음 · 대문자 · 31자 · hex 아님 / 닫기 room_id 없음 · hex 아님 · 33자 → 400 + validation_errors(필드 1개), 조회 · 포트 미호출
[FAIL:service]       열기 일치하는 QR 없음 → 404(validation_errors null) / 닫기 호실 없음 → 404 + store.close 미호출 / Redis 503 은 그대로
[FAIL:repository]    door.repository.spec — findDoorRoom 은 is_deleted 0 + loadRelationIds, DB 실패 통일 500 / door-close.spec — 호실 조회 500 이면 store.close 미호출
[FAIL:internal]      내부 토큰 없음 · 틀림 → 403 '내부 요청만 허용됩니다.', 조회 · 포트 미호출 (열기 · 닫기)

테스트 생략(위임형): RedisConnection · RedisDoorStore(Lua 3개) — 어댑터 spec 은 두지 않는다(docs/integration.md "테스트", 실제 Redis 호출 금지). build 확인으로 Lua 3개를 scratch(커밋 안 함)에서 실행해 본다 — 열기(색인 없음 nil · 있음 room_id + 값) · 닫기(QR 보존 · 기록 없음) · 발급(NX 충돌 0 · 이전 색인 삭제 · 상태 보존). 실제 Redis 동작은 사용자가 docs/guides/redis-setup.md 3절로 확인한다.
테스트 생략(위임형): 게이트웨이 door.controller(게이트웨이 controller spec 없음 — AGENTS), DoorModule · DoorStoreModule · RedisModule 등록, compose · 스크립트(`docker compose -f compose.redis.yml config` 로 문법만 확인)
[SMOKE:data-access]  해당 없음 — findDoorRoom 은 단순 findOne(관계 필드 where · QueryBuilder · raw select · 동적 조립 없음)
```

---

## Response Codes

| Code | Cause |
|------|------|
| 200 | 문 열기 — `{room_id, door_state: 'open', door_changed_at}` / 문 닫기 — 빈 본문 |
| 400 | DTO 검증(게이트웨이 ValidationPipe — `validation_errors` 에 필드) — QR 32자 hex 아님 · 호실 ID 32자 hex 아님 · 없음 |
| 403 | (user-service 내부) 게이트웨이 내부 토큰 없음 · 틀림 — 공개 API 에는 없다 |
| 404 | 문 열기 — 일치하는 QR 의 문 없음(발급 전 · 이전 QR) / 문 닫기 — 호실 없음(지운 호실 포함) |
| 503 | Redis 준비 안 됨 · 명령 실패(`상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.`) / 게이트웨이 → user-service 연결 실패 |
| 500 | DB 오류(닫기의 호실 조회 — 통일 메시지) |
