import {DynamicModule, Module} from '@nestjs/common';
import {DiscoveryModule} from '@nestjs/core';
import {CommandHandlerRegistry} from './command-handler.registry.js';
import {CommandDispatcher} from './command.dispatcher.js';
import type {CommandConsumerOptions} from './interfaces/messaging.interface.js';
import {BROKER_USER} from './messaging.constants.js';
import {BROKER_ACCOUNT, COMMAND_CONSUMER_OPTIONS, COMMAND_PUBLISHER, GATEWAY_INSTANCE_ID, RESULT_SUBSCRIBER} from './messaging.symbols.js';
import {resolveGatewayInstanceId} from './messaging.util.js';
import {RabbitMqCommandConsumer} from './rabbitmq-command.consumer.js';
import {RabbitMqCommandPublisher} from './rabbitmq-command.publisher.js';
import {RabbitMqResultSubscriber} from './rabbitmq-result.subscriber.js';
import {RabbitMqConnection} from './rabbitmq.connection.js';

/**
 * RabbitMQ 메시징. 앱 역할에 따라 둘 중 하나만 import 한다.
 * - `forGateway()`: 명령 발행 + 인스턴스 전용 결과 큐 소비
 * - `forService(options)`: 명령 큐 소비 + `@OnCommand` 핸들러 디스패치 + 결과 회신
 */
@Module({})
export class MessagingModule {
    /**
     * 게이트웨이용 — COMMAND_PUBLISHER · RESULT_SUBSCRIBER · GATEWAY_INSTANCE_ID 를 제공한다. 브로커 계정은 gateway(명령 발행 권한을 가진 유일한 계정).
     *
     * @returns 동적 모듈
     */
    static forGateway(): DynamicModule {
        return {
            module: MessagingModule,
            global: true,
            providers: [
                {provide: BROKER_ACCOUNT, useValue: BROKER_USER.GATEWAY},
                RabbitMqConnection,
                {provide: GATEWAY_INSTANCE_ID, useFactory: () => resolveGatewayInstanceId()},
                {provide: COMMAND_PUBLISHER, useClass: RabbitMqCommandPublisher},
                {provide: RESULT_SUBSCRIBER, useClass: RabbitMqResultSubscriber},
            ],
            exports: [COMMAND_PUBLISHER, RESULT_SUBSCRIBER, GATEWAY_INSTANCE_ID],
        };
    }

    /**
     * 서비스용 — 명령 큐를 소비하고 `@OnCommand` 핸들러로 디스패치한다. user_id 가 게이트웨이 계정인 명령만 처리한다.
     *
     * @param options 소비할 큐 · 바인딩 키 · 이 서비스의 브로커 계정 · prefetch
     * @returns 동적 모듈
     */
    static forService(options: CommandConsumerOptions): DynamicModule {
        return {
            module: MessagingModule,
            global: true,
            imports: [DiscoveryModule],
            providers: [
                {provide: BROKER_ACCOUNT, useValue: options.broker_user},
                RabbitMqConnection,
                {provide: COMMAND_CONSUMER_OPTIONS, useValue: options},
                CommandHandlerRegistry,
                CommandDispatcher,
                RabbitMqCommandConsumer,
            ],
            exports: [],
        };
    }
}
