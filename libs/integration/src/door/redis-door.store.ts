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
