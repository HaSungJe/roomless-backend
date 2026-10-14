import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {CommandPublisherInterface} from './interfaces/messaging.interface.js';
import {COMMAND_EXCHANGE} from './messaging.constants.js';
import {encodeEnvelope} from './messaging.util.js';
import {RabbitMqConnection} from './rabbitmq.connection.js';

/**
 * 명령 발행 어댑터 (게이트웨이 아웃바운드).
 * 라우팅 키 = 명령 type, AMQP 표준 속성(messageId · correlationId · replyTo · type)을 함께 채운다.
 */
@Injectable()
export class RabbitMqCommandPublisher implements CommandPublisherInterface {
    /**
     * @param connection 공유 RabbitMQ 연결
     */
    constructor(private readonly connection: RabbitMqConnection) {}

    /**
     * 명령을 발행하고 confirm 까지 기다린다.
     *
     * @param envelope 명령 봉투
     */
    async publish(envelope: MessageEnvelope<unknown>): Promise<void> {
        await this.connection.publish(COMMAND_EXCHANGE, envelope.type, encodeEnvelope(envelope), {
            messageId: envelope.message_id,
            correlationId: envelope.request_id,
            replyTo: envelope.meta.reply_to ?? undefined,
            type: envelope.type,
            timestamp: Date.now(),
        });
    }
}
