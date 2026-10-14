import {Inject, Injectable, Logger, OnModuleInit} from '@nestjs/common';
import type {Channel, ChannelModel, ConsumeMessage} from 'amqplib';
import {CommandDispatcher} from './command.dispatcher.js';
import type {CommandConsumerOptions} from './interfaces/messaging.interface.js';
import {COMMAND_EXCHANGE, COMMAND_PUBLISHER_USER, DEAD_LETTER_EXCHANGE, DEFAULT_PREFETCH, EVENT_EXCHANGE, MAX_REDELIVERY} from './messaging.constants.js';
import {COMMAND_CONSUMER_OPTIONS} from './messaging.symbols.js';
import {encodeEnvelope, resultRoutingKey} from './messaging.util.js';
import {RabbitMqConnection} from './rabbitmq.connection.js';

/**
 * 명령 소비 어댑터 (서비스 인바운드).
 * 명령 큐를 quorum queue 로 선언하고, 받은 명령을 CommandDispatcher 에 넘긴 뒤 판정대로 결과 회신 · ack · nack 한다.
 */
@Injectable()
export class RabbitMqCommandConsumer implements OnModuleInit {
    private readonly logger = new Logger(RabbitMqCommandConsumer.name);

    /**
     * @param connection 공유 RabbitMQ 연결
     * @param dispatcher 명령 판정기
     * @param options 소비 설정
     */
    constructor(
        private readonly connection: RabbitMqConnection,
        private readonly dispatcher: CommandDispatcher,
        @Inject(COMMAND_CONSUMER_OPTIONS) private readonly options: CommandConsumerOptions,
    ) {}

    /**
     * 연결마다 명령 큐를 다시 세우도록 준비 작업을 등록한다.
     */
    onModuleInit(): void {
        this.connection.register((model) => this.setup(model));
    }

    /**
     * 명령 큐 선언 · 바인딩 · prefetch · 소비 시작.
     *
     * @param model 채널 모델
     */
    async setup(model: ChannelModel): Promise<void> {
        const channel = await model.createChannel();
        await channel.assertQueue(this.options.queue, {durable: true, arguments: {'x-queue-type': 'quorum', 'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE, 'x-delivery-limit': MAX_REDELIVERY}});
        for (const key of this.options.binding_keys) {
            await channel.bindQueue(this.options.queue, COMMAND_EXCHANGE, key);
        }
        await channel.prefetch(this.options.prefetch ?? DEFAULT_PREFETCH);
        await channel.consume(this.options.queue, (message) => {
            if (message) void this.handle(channel, message);
        });
    }

    /**
     * 명령 1건 — 발행자 확인 → 판정 → 결과 회신(실패해도 ack 판정은 유지) → ack / requeue / dead.
     * - 발행자: user_id 가 게이트웨이 계정이 아니면 처리 · 회신 없이 DLQ 로 보낸다. 브로커가 user_id 를 접속 계정과 대조하므로 위조할 수 없다.
     * - 결과 회신이 실패해도 다시 처리하지 않는다: 이미 커밋된 쓰기를 반복하는 것보다 클라이언트가 pending 후 재조회하는 편이 안전하다.
     *
     * @param channel 소비 채널
     * @param message 수신 메시지
     */
    async handle(channel: Pick<Channel, 'ack' | 'nack'>, message: ConsumeMessage): Promise<void> {
        const trusted = this.options.trusted_publisher ?? COMMAND_PUBLISHER_USER;
        if (message.properties.userId !== trusted) {
            this.logger.warn(`게이트웨이가 아닌 발행자의 명령을 DLQ 로 보냄 (user_id=${message.properties.userId ?? '없음'}, type=${message.properties.type ?? '?'})`);
            channel.nack(message, false, false);
            return;
        }

        const deliveryCount = Number(message.properties.headers?.['x-delivery-count'] ?? 0);
        const decision = await this.dispatcher.dispatch(message.content, deliveryCount);

        if (decision.result?.meta.reply_to) {
            try {
                await this.connection.publish(EVENT_EXCHANGE, resultRoutingKey(decision.result.meta.reply_to, decision.result.type), encodeEnvelope(decision.result), {
                    messageId: decision.result.message_id,
                    correlationId: decision.result.request_id,
                    type: decision.result.type,
                    timestamp: Date.now(),
                });
            } catch (error) {
                this.logger.error(`결과 회신 실패: ${decision.result.type} (${decision.result.request_id})`, (error as Error)?.stack);
            }
        }

        if (decision.action === 'ack') channel.ack(message);
        else channel.nack(message, false, decision.action === 'requeue');
    }
}
