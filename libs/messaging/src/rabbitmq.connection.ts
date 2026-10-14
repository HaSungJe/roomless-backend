import {Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, ServiceUnavailableException} from '@nestjs/common';
import amqp from 'amqplib';
import type {Channel, ChannelModel, ConfirmChannel, Options, RecoveringChannelModel} from 'amqplib';
import {BROKER_UNAVAILABLE_MESSAGE, COMMAND_EXCHANGE, DEAD_LETTER_EXCHANGE, DEAD_LETTER_QUEUE, EVENT_EXCHANGE} from './messaging.constants.js';
import {BROKER_ACCOUNT} from './messaging.symbols.js';
import {buildBrokerUrl} from './messaging.util.js';

/** (재)연결될 때마다 실행할 준비 작업 — 채널 생성 · 큐 선언 · consume 등록 */
export type ConnectionSetup = (model: ChannelModel) => Promise<void>;

/**
 * 공통 토폴로지(exchange 3개 + DLQ)를 선언한다. 멱등이라 모든 앱이 연결할 때마다 실행해도 된다.
 *
 * @param channel 임시 채널
 */
export async function declareCoreTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(COMMAND_EXCHANGE, 'topic', {durable: true});
    await channel.assertExchange(EVENT_EXCHANGE, 'topic', {durable: true});
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'topic', {durable: true});
    await channel.assertQueue(DEAD_LETTER_QUEUE, {durable: true});
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '#');
}

/**
 * RabbitMQ 연결 1개를 앱 전체가 공유한다.
 *
 * - amqplib 의 recovery 로 끊기면 자동 재연결하고, 재연결마다 공통 토폴로지 → 발행 채널 → 등록된 준비 작업 순으로 다시 세운다.
 * - 브로커가 내려가 있어도 앱 부팅은 막지 않는다(waitForConnect: false). 그동안 발행은 503 으로 거절된다.
 * - 준비 작업은 각 provider 의 onModuleInit 에서 `register()` 하고, 연결은 모든 등록이 끝난 onApplicationBootstrap 에서 연다.
 * - 앱마다 자기 브로커 계정(BROKER_ACCOUNT)으로 접속하고, 발행하는 모든 메시지에 그 계정을 `user_id` 로 붙인다.
 *   브로커가 user_id 와 접속 계정이 같은지 검증하므로, 소비자는 user_id 로 발행자를 신뢰할 수 있다.
 */
@Injectable()
export class RabbitMqConnection implements OnApplicationBootstrap, OnModuleDestroy {
    private readonly logger = new Logger(RabbitMqConnection.name);
    private readonly setups: ConnectionSetup[] = [];
    private model: RecoveringChannelModel | null = null;
    private publishChannel: ConfirmChannel | null = null;

    /**
     * @param user 이 앱의 브로커 계정 (BROKER_USER 값)
     */
    constructor(@Inject(BROKER_ACCOUNT) readonly user: string) {}

    /**
     * 연결마다 실행할 준비 작업을 등록한다.
     *
     * @param setup 준비 작업
     */
    register(setup: ConnectionSetup): void {
        this.setups.push(setup);
    }

    /**
     * 모든 provider 초기화가 끝난 뒤 연결을 연다.
     * 연결 이름(connection_name)은 브로커 계정 = 서비스 이름이다. 관리 화면 Connections 탭의 Name 칸에
     * 브로커가 보는 `IP:포트` 아래 서비스 이름이 함께 표시된다(재연결로 포트가 바뀌어도 그대로 맞다).
     */
    async onApplicationBootstrap(): Promise<void> {
        this.model = await amqp.connect(buildBrokerUrl(this.user), {
            clientProperties: {connection_name: this.user},
            recovery: {waitForConnect: false, setup: (model: ChannelModel) => this.prepare(model)},
        });
        this.model.on('disconnect', (error: Error) => {
            this.publishChannel = null;
            this.logger.warn(`RabbitMQ 연결 끊김 — 재연결 대기: ${error?.message ?? ''}`);
        });
        this.model.on('error', (error: Error) => this.logger.error(`RabbitMQ 오류: ${error.message}`));
    }

    /**
     * 연결 1회분 준비 — 공통 토폴로지, 발행용 confirm 채널, 등록된 준비 작업.
     *
     * @param model 새로 연결된 채널 모델
     */
    async prepare(model: ChannelModel): Promise<void> {
        const channel = await model.createChannel();
        await declareCoreTopology(channel);
        await channel.close();
        this.publishChannel = await model.createConfirmChannel();
        for (const setup of this.setups) {
            await setup(model);
        }
        this.logger.log('RabbitMQ 연결 준비 완료');
    }

    /**
     * 발행하고 브로커의 confirm 까지 기다린다. user_id 는 항상 이 앱의 브로커 계정으로 덮어쓴다.
     *
     * @param exchange exchange 이름
     * @param routingKey 라우팅 키
     * @param content 내용
     * @param options AMQP 속성
     * @throws ServiceUnavailableException 연결이 없을 때
     */
    async publish(exchange: string, routingKey: string, content: Buffer, options: Options.Publish): Promise<void> {
        const channel = this.publishChannel;
        if (!channel) {
            throw new ServiceUnavailableException({message: BROKER_UNAVAILABLE_MESSAGE});
        }
        await new Promise<void>((resolve, reject) => {
            channel.publish(exchange, routingKey, content, {persistent: true, contentType: 'application/json', ...options, userId: this.user}, (error) => (error ? reject(error) : resolve()));
        });
    }

    /**
     * 앱 종료 시 연결을 닫는다.
     */
    async onModuleDestroy(): Promise<void> {
        await this.model?.close().catch(() => undefined);
        this.model = null;
        this.publishChannel = null;
    }
}
