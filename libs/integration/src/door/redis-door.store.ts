import {Injectable, Logger, ServiceUnavailableException} from '@nestjs/common';
import {dayjs} from '@app/common/utils/dayjs.js';
import {DOOR_COMMAND, DOOR_COMMAND_CHANNEL, DOOR_STATE, DOOR_TIME_NONE, REDIS_UNAVAILABLE_MESSAGE} from '../integration.constants.js';
import type {DoorCommand, DoorRecord, DoorStoreInterface} from '../interfaces/integration.interface.js';
import {RedisConnection} from '../redis/redis.connection.js';
import type {RedisClient} from '../redis/redis.connection.js';

/** 문 상태 키 접두 — `door:<room_id>` = `상태:시각` */
const DOOR_KEY_PREFIX = 'door:';

/** 현재 QR 키 접두 — `door-qr:<room_id>` = QR (만료 = 유효 종료) */
const DOOR_QR_KEY_PREFIX = 'door-qr:';

/**
 * QR 확인 + 열림 — KEYS[1] `door-qr:<room_id>` · KEYS[2] `door:<room_id>` / ARGV[1] QR · ARGV[2] 상태(open) · ARGV[3] 시각.
 * 현재 QR 이 같을 때만 상태를 쓰고 1, 아니면 아무것도 바꾸지 않고 0.
 */
const VERIFY_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[2], ARGV[2] .. ':' .. ARGV[3])
return 1
`;

/**
 * 바로 열기 — KEYS[1] `door:<room_id>` / ARGV[1] 상태(open) · ARGV[2] 시각 · ARGV[3] 채널 · ARGV[4] 명령(JSON).
 * 상태를 쓰고 같은 스크립트에서 PUBLISH 한다(쓰기와 명령이 어긋나지 않는다).
 */
const OPEN_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1] .. ':' .. ARGV[2])
redis.call('PUBLISH', ARGV[3], ARGV[4])
return 1
`;

/**
 * 현재 QR 지우기 — KEYS[1] `door-qr:<room_id>` / ARGV[1] QR. 값이 같을 때만 지운다.
 */
const REVOKE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

/**
 * 문 상태 키
 *
 * @param room_id 호실 ID
 * @returns `door:<room_id>`
 */
function doorKey(room_id: string): string {
    return `${DOOR_KEY_PREFIX}${room_id}`;
}

/**
 * 현재 QR 키
 *
 * @param room_id 호실 ID
 * @returns `door-qr:<room_id>`
 */
function doorQrKey(room_id: string): string {
    return `${DOOR_QR_KEY_PREFIX}${room_id}`;
}

/**
 * 문 상태 값(`상태:시각`)을 읽는다 — Phase 14 의 `QR:상태:시각` 도 뒤의 두 칸만 쓴다. 값이 없으면 기록 없는 문(close · DOOR_TIME_NONE).
 *
 * @param value Redis 값
 * @returns 문 상태
 */
function parseDoorValue(value: string | null): DoorRecord {
    if (!value) {
        return {state: DOOR_STATE.CLOSE, changed_at: DOOR_TIME_NONE};
    }
    const [state, changed_at] = value.split(':').slice(-2);
    return {state: state === DOOR_STATE.OPEN ? DOOR_STATE.OPEN : DOOR_STATE.CLOSE, changed_at: changed_at || DOOR_TIME_NONE};
}

/**
 * 구독 메시지(JSON)를 문 명령으로 읽는다 — 모양이 다르면 null.
 *
 * @param message Redis 메시지
 * @returns 명령 또는 null
 */
function parseDoorCommand(message: string): DoorCommand | null {
    try {
        const data = JSON.parse(message) as {store_id?: unknown; room_id?: unknown; command?: unknown};
        if (typeof data.store_id !== 'string') {
            return null;
        }
        if (data.command === DOOR_COMMAND.OPEN && typeof data.room_id === 'string') {
            return {store_id: data.store_id, room_id: data.room_id, command: DOOR_COMMAND.OPEN};
        }
        return data.command === DOOR_COMMAND.DISCONNECT ? {store_id: data.store_id, command: DOOR_COMMAND.DISCONNECT} : null;
    } catch {
        return null;
    }
}

/**
 * 문 정보 어댑터 — Redis. `door:<room_id>` = `open|close:yyyyMMddHHmmss`, `door-qr:<room_id>` = 현재 QR(만료 = 유효 종료), 바로 열기 명령은 채널 `door-commands`.
 * QR 확인 + 열림 · 열림 + 명령 · 같을 때만 지우기는 Lua 스크립트 1개씩(원자적), 여러 문 읽기는 MGET 1번. QR 이력은 DB(t_room_qr)에 있다.
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
     * 여러 문의 상태 — 받은 순서대로, 빈 배열이면 Redis 에 묻지 않는다.
     *
     * @param room_ids 호실 ID 목록
     * @returns 문 상태 목록
     */
    async getMany(room_ids: string[]): Promise<DoorRecord[]> {
        if (room_ids.length === 0) {
            return [];
        }
        const values = await this.run('문 정보 조회', (client) => client.mGet(room_ids.map(doorKey)));
        return values.map((value) => parseDoorValue(typeof value === 'string' ? value : null));
    }

    /**
     * 그 호실의 현재 QR — expires_at 에 저절로 사라진다.
     *
     * @param room_id 호실 ID
     * @param qr QR 정보
     * @param expires_at 유효 종료
     */
    async setQr(room_id: string, qr: string, expires_at: Date): Promise<void> {
        await this.run('현재 QR 쓰기', (client) => client.set(doorQrKey(room_id), qr, {expiration: {type: 'PXAT', value: dayjs(expires_at).valueOf()}}));
    }

    /**
     * 그 호실의 현재 QR 이 qr 일 때만 지운다.
     *
     * @param room_id 호실 ID
     * @param qr 지울 QR
     */
    async revokeQr(room_id: string, qr: string): Promise<void> {
        await this.run('현재 QR 지우기', (client) => client.eval(REVOKE_SCRIPT, {keys: [doorQrKey(room_id)], arguments: [qr]}));
    }

    /**
     * QR 확인 — 현재 QR 이 같으면 open + 시각으로 쓰고 true.
     *
     * @param room_id 호실 ID
     * @param qr 문이 읽은 QR
     * @param changed_at 시각 (한국 시각 yyyyMMddHHmmss)
     * @returns 같았으면 true
     */
    async verify(room_id: string, qr: string, changed_at: string): Promise<boolean> {
        const matched = await this.run('QR 확인', (client) => client.eval(VERIFY_SCRIPT, {keys: [doorQrKey(room_id), doorKey(room_id)], arguments: [qr, DOOR_STATE.OPEN, changed_at]}));
        return matched === 1;
    }

    /**
     * 바로 열기 — open + 시각을 쓰고 열기 명령을 보낸다.
     *
     * @param room_id 호실 ID
     * @param store_id 그 호실의 업체 ID (명령 대상)
     * @param changed_at 시각 (한국 시각 yyyyMMddHHmmss)
     */
    async open(room_id: string, store_id: string, changed_at: string): Promise<void> {
        const command: DoorCommand = {store_id, room_id, command: DOOR_COMMAND.OPEN};
        await this.run('바로 열기', (client) => client.eval(OPEN_SCRIPT, {keys: [doorKey(room_id)], arguments: [DOOR_STATE.OPEN, changed_at, DOOR_COMMAND_CHANNEL, JSON.stringify(command)]}));
    }

    /**
     * close + 시각을 쓴다.
     *
     * @param room_id 호실 ID
     * @param changed_at 시각 (한국 시각 yyyyMMddHHmmss)
     */
    async close(room_id: string, changed_at: string): Promise<void> {
        await this.run('문 닫기', (client) => client.set(doorKey(room_id), `${DOOR_STATE.CLOSE}:${changed_at}`));
    }

    /**
     * 그 업체 문 소켓 연결을 모두 끊으라는 명령을 보낸다(시크릿 변경).
     *
     * @param store_id 업체 ID
     */
    async disconnect(store_id: string): Promise<void> {
        const command: DoorCommand = {store_id, command: DOOR_COMMAND.DISCONNECT};
        await this.run('연결 끊기 명령', (client) => client.publish(DOOR_COMMAND_CHANNEL, JSON.stringify(command)));
    }

    /**
     * 문 명령 구독 — 모양이 다른 메시지는 경고만 남기고 버린다.
     *
     * @param listener 명령마다 부를 함수
     */
    subscribe(listener: (command: DoorCommand) => void): void {
        this.redis.subscribe(DOOR_COMMAND_CHANNEL, (message) => {
            const command = parseDoorCommand(message);
            if (command) {
                listener(command);
            } else {
                this.logger.warn(`문 명령 모양이 다릅니다: ${message}`);
            }
        });
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
