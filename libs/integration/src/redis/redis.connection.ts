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
    /** 구독 전용 연결 — 구독 중인 연결은 다른 명령을 보내지 않으므로 채널마다 따로 연다 */
    private readonly subscribers: RedisClient[] = [];

    /**
     * 연결을 연다 — 기다리지 않는다(부팅을 막지 않는다).
     */
    onApplicationBootstrap(): void {
        const url = process.env.REDIS_URL;
        if (!url) {
            this.logger.warn('REDIS_URL 이 비어 있어 Redis 를 쓰는 요청(문 상태 · QR · 문 소켓)이 실패합니다 — docs/guides/redis-setup.md');
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
     * 종료 시 연결 · 구독 연결을 닫는다.
     */
    async onModuleDestroy(): Promise<void> {
        for (const subscriber of this.subscribers) {
            if (subscriber.isOpen) {
                await subscriber.close();
            }
        }
        if (this.client?.isOpen) {
            await this.client.close();
        }
    }

    /**
     * 채널을 구독한다 — 구독 전용 연결을 따로 연다(기다리지 않는다 — 부팅을 막지 않는다). 끊기면 node-redis 가 다시 붙고 같은 채널을 다시 구독한다.
     * REDIS_URL 이 비어 있으면 경고만 남긴다.
     *
     * @param channel 채널
     * @param listener 메시지마다 부를 함수
     */
    subscribe(channel: string, listener: (message: string) => void): void {
        const url = process.env.REDIS_URL;
        if (!url) {
            this.logger.warn(`REDIS_URL 이 비어 있어 ${channel} 을 구독하지 않습니다 — docs/guides/redis-setup.md`);
            return;
        }
        const subscriber = buildClient(url);
        subscriber.on('error', (error: Error) => this.logger.error(`Redis 구독 오류: ${error.message}`));
        this.subscribers.push(subscriber);
        subscriber
            .connect()
            .then(() => subscriber.subscribe(channel, listener))
            .catch((error: Error) => this.logger.error(`Redis 구독 실패(${channel}): ${error.message}`));
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
