import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import type {ChannelModel, ConsumeMessage} from 'amqplib';
import type {ResultPayload} from '@app/contracts/message-envelope.js';
import type {ResultEnvelope, ResultSubscriberInterface} from './interfaces/messaging.interface.js';
import {EVENT_EXCHANGE} from './messaging.constants.js';
import {GATEWAY_INSTANCE_ID} from './messaging.symbols.js';
import {decodeEnvelope, resultBindingKey, resultQueueName} from './messaging.util.js';
import {RabbitMqConnection} from './rabbitmq.connection.js';

/**
 * 결과 수신 어댑터 (게이트웨이 인바운드).
 * 인스턴스 전용 exclusive · auto-delete 큐를 `result.<인스턴스>.#` 로 바인딩해 소비한다.
 * 게이트웨이가 내려가면 큐도 사라지므로 회신 못 한 결과가 쌓이지 않는다.
 */
@Injectable()
export class RabbitMqResultSubscriber implements ResultSubscriberInterface, OnModuleInit {
    private readonly logger = new Logger(RabbitMqResultSubscriber.name);
    private listener: ((envelope: ResultEnvelope) => void) | null = null;

    /**
     * @param connection 공유 RabbitMQ 연결
     * @param instanceId 게이트웨이 인스턴스 ID
     */
    constructor(
        private readonly connection: RabbitMqConnection,
        @Inject(GATEWAY_INSTANCE_ID) private readonly instanceId: string,
    ) {}

    /**
     * 연결마다 결과 큐를 다시 세우도록 준비 작업을 등록한다.
     */
    onModuleInit(): void {
        this.connection.register((model) => this.setup(model));
    }

    /**
     * 결과가 도착할 때 호출할 함수를 등록한다.
     *
     * @param listener 결과 처리 함수
     */
    setListener(listener: (envelope: ResultEnvelope) => void): void {
        this.listener = listener;
    }

    /**
     * 결과 큐 선언 · 바인딩 · 소비 시작.
     *
     * @param model 채널 모델
     */
    async setup(model: ChannelModel): Promise<void> {
        const channel = await model.createChannel();
        const queue = resultQueueName(this.instanceId);
        await channel.assertQueue(queue, {exclusive: true, autoDelete: true, durable: false});
        await channel.bindQueue(queue, EVENT_EXCHANGE, resultBindingKey(this.instanceId));
        await channel.consume(queue, (message) => {
            if (!message) return;
            this.handle(message);
            channel.ack(message);
        });
    }

    /**
     * 결과 메시지 1건을 리스너로 넘긴다. 형식이 틀리면 버린다.
     *
     * @param message 수신 메시지
     */
    handle(message: Pick<ConsumeMessage, 'content'>): void {
        const envelope = decodeEnvelope<ResultPayload<unknown>>(message.content);
        if (!envelope) {
            this.logger.warn('형식이 올바르지 않은 결과 메시지를 버림');
            return;
        }
        this.listener?.(envelope);
    }
}
