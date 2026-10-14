import {ServiceUnavailableException} from '@nestjs/common';
import type {ChannelModel, ConsumeMessage} from 'amqplib';
import type {CommandDispatcher, DispatchDecision} from '@app/messaging/command.dispatcher.js';
import {RabbitMqCommandConsumer} from '@app/messaging/rabbitmq-command.consumer.js';
import {RabbitMqCommandPublisher} from '@app/messaging/rabbitmq-command.publisher.js';
import {RabbitMqResultSubscriber} from '@app/messaging/rabbitmq-result.subscriber.js';
import {RabbitMqConnection} from '@app/messaging/rabbitmq.connection.js';
import {buildCommandEnvelope, buildResultEnvelope, encodeEnvelope} from '@app/messaging/messaging.util.js';

/** amqplib 의 connect — 실제 브로커에 접속하지 않고 호출 인자만 기록한다 */
const amqpConnect = vi.hoisted(() => vi.fn());
vi.mock('amqplib', () => ({default: {connect: amqpConnect}}));

/**
 * 가짜 채널 — 선언 · 바인딩 · 소비 호출을 기록한다.
 *
 * @returns 채널 mock
 */
function makeChannel() {
    return {
        assertExchange: vi.fn().mockResolvedValue({}),
        assertQueue: vi.fn().mockResolvedValue({}),
        bindQueue: vi.fn().mockResolvedValue({}),
        prefetch: vi.fn().mockResolvedValue({}),
        consume: vi.fn().mockResolvedValue({consumerTag: 't'}),
        close: vi.fn().mockResolvedValue(undefined),
        ack: vi.fn(),
        nack: vi.fn(),
        publish: vi.fn((_e: string, _k: string, _c: Buffer, _o: object, cb: (err: unknown) => void) => {
            cb(null);
            return true;
        }),
    };
}

/**
 * 가짜 채널 모델 — 채널을 만들 때마다 같은 mock 을 돌려준다.
 *
 * @param channel 채널 mock
 * @returns 채널 모델
 */
function makeModel(channel: ReturnType<typeof makeChannel>): ChannelModel {
    return {createChannel: vi.fn().mockResolvedValue(channel), createConfirmChannel: vi.fn().mockResolvedValue(channel)} as unknown as ChannelModel;
}

/**
 * 소비 메시지.
 *
 * @param content 내용
 * @param deliveryCount x-delivery-count
 * @param userId 브로커가 검증한 발행자 계정 (기본 gateway)
 * @returns 메시지
 */
function message(content: Buffer, deliveryCount?: number, userId: string | null = 'gateway'): ConsumeMessage {
    return {
        content,
        fields: {},
        properties: {userId: userId ?? undefined, type: 'user.member.sign', headers: deliveryCount === undefined ? {} : {'x-delivery-count': deliveryCount}},
    } as unknown as ConsumeMessage;
}

describe('RabbitMqConnection', () => {
    it.each([['gateway'], ['user-service']])('[SUCCESS] %s 계정으로 접속하고, 계정(서비스 이름)을 연결 이름으로 보낸다', async (account) => {
        amqpConnect.mockClear().mockResolvedValueOnce({on: vi.fn()});
        const connection = new RabbitMqConnection(account);

        await connection.onApplicationBootstrap();

        expect(amqpConnect).toHaveBeenCalledTimes(1);
        expect(amqpConnect.mock.calls[0][0]).toMatch(new RegExp(`^amqp://${account}:`));
        expect(amqpConnect.mock.calls[0][1]).toMatchObject({clientProperties: {connection_name: account}, recovery: {waitForConnect: false}});
    });

    it('[FAIL] 연결 전 발행은 503 "일시적으로 요청을 접수할 수 없습니다."', async () => {
        const connection = new RabbitMqConnection('gateway');

        const error = await connection.publish('x', 'k', Buffer.from('{}'), {}).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({message: '일시적으로 요청을 접수할 수 없습니다. 잠시 후 다시 시도해주세요.'});
    });

    it('[SUCCESS] prepare — 공통 토폴로지 선언 → confirm 채널 → 등록된 준비 작업 순서', async () => {
        const connection = new RabbitMqConnection('gateway');
        const channel = makeChannel();
        const model = makeModel(channel);
        const setup = vi.fn().mockResolvedValue(undefined);
        connection.register(setup);

        await connection.prepare(model);

        expect(channel.assertExchange.mock.calls).toEqual([
            ['roomless.cmd', 'topic', {durable: true}],
            ['roomless.event', 'topic', {durable: true}],
            ['roomless.dlx', 'topic', {durable: true}],
        ]);
        expect(channel.assertQueue).toHaveBeenCalledWith('q.dead', {durable: true});
        expect(channel.bindQueue).toHaveBeenCalledWith('q.dead', 'roomless.dlx', '#');
        expect(setup).toHaveBeenCalledWith(model);

        await connection.publish('roomless.cmd', 'user.member.sign', Buffer.from('{}'), {messageId: 'm'});
        expect(channel.publish).toHaveBeenCalledWith(
            'roomless.cmd',
            'user.member.sign',
            Buffer.from('{}'),
            {persistent: true, contentType: 'application/json', messageId: 'm', userId: 'gateway'},
            expect.any(Function),
        );
    });

    it('[SECURITY] 호출자가 user_id 를 다른 값으로 넘겨도 항상 자기 브로커 계정으로 덮어쓴다', async () => {
        const connection = new RabbitMqConnection('user-service');
        const channel = makeChannel();
        await connection.prepare(makeModel(channel));

        await connection.publish('roomless.event', 'k', Buffer.from('{}'), {userId: 'gateway'});

        expect(channel.publish.mock.calls[0][3]).toMatchObject({userId: 'user-service'});
    });

    it('[FAIL] 브로커가 confirm 을 거절하면 발행이 실패한다', async () => {
        const connection = new RabbitMqConnection('gateway');
        const channel = makeChannel();
        channel.publish.mockImplementationOnce((_e, _k, _c, _o, cb) => {
            cb(new Error('nack'));
            return true;
        });
        await connection.prepare(makeModel(channel));

        await expect(connection.publish('x', 'k', Buffer.from('{}'), {})).rejects.toThrow('nack');
    });
});

describe('RabbitMqCommandPublisher', () => {
    it('명령 type 을 라우팅 키로, AMQP 표준 속성을 채워 roomless.cmd 에 발행한다', async () => {
        const connection = {publish: vi.fn().mockResolvedValue(undefined)} as unknown as RabbitMqConnection;
        const envelope = buildCommandEnvelope({type: 'user.member.sign', actor: null, payload: {a: 1}, reply_to: 'gw-1', client_ip: null});

        await new RabbitMqCommandPublisher(connection).publish(envelope);

        expect(connection.publish).toHaveBeenCalledWith('roomless.cmd', 'user.member.sign', encodeEnvelope(envelope), {
            messageId: envelope.message_id,
            correlationId: envelope.request_id,
            replyTo: 'gw-1',
            type: 'user.member.sign',
            timestamp: expect.any(Number),
        });
    });
});

describe('RabbitMqResultSubscriber', () => {
    it('인스턴스 전용 exclusive 큐를 result.<인스턴스>.# 로 바인딩하고, 받은 결과를 리스너로 넘긴 뒤 ack', async () => {
        const connection = new RabbitMqConnection('gateway');
        const subscriber = new RabbitMqResultSubscriber(connection, 'gw-1');
        const listener = vi.fn();
        subscriber.setListener(listener);
        const channel = makeChannel();

        await subscriber.setup(makeModel(channel));

        expect(channel.assertQueue).toHaveBeenCalledWith('q.gw.result.gw-1', {exclusive: true, autoDelete: true, durable: false});
        expect(channel.bindQueue).toHaveBeenCalledWith('q.gw.result.gw-1', 'roomless.event', 'result.gw-1.#');

        const command = buildCommandEnvelope({type: 'user.member.sign', actor: null, payload: {}, reply_to: 'gw-1', client_ip: null});
        const result = buildResultEnvelope(command, 'done', {result: {ok: true}, error: null}, 1);
        const onMessage = channel.consume.mock.calls[0][1] as (m: ConsumeMessage | null) => void;
        const delivered = message(encodeEnvelope(result));
        onMessage(delivered);

        expect(listener).toHaveBeenCalledWith(result);
        expect(channel.ack).toHaveBeenCalledWith(delivered);
    });

    it('형식이 틀린 결과는 리스너에 넘기지 않는다', () => {
        const subscriber = new RabbitMqResultSubscriber(new RabbitMqConnection('gateway'), 'gw-1');
        const listener = vi.fn();
        subscriber.setListener(listener);

        subscriber.handle({content: Buffer.from('nope')});

        expect(listener).not.toHaveBeenCalled();
    });

    it('onModuleInit 이 연결 준비 작업을 등록한다', () => {
        const connection = {register: vi.fn()} as unknown as RabbitMqConnection;

        new RabbitMqResultSubscriber(connection, 'gw-1').onModuleInit();

        expect(connection.register).toHaveBeenCalledTimes(1);
    });
});

describe('RabbitMqCommandConsumer', () => {
    const OPTIONS = {queue: 'q.user.cmd', binding_keys: ['user.#'], broker_user: 'user-service'};
    const command = buildCommandEnvelope({type: 'user.member.sign', actor: null, payload: {}, reply_to: 'gw-1', client_ip: null});

    /**
     * 판정을 고정한 소비자.
     *
     * @param decision 디스패처가 돌려줄 판정
     * @returns 소비자 · 연결 · 디스패처 mock
     */
    function makeConsumer(decision: DispatchDecision) {
        const connection = {publish: vi.fn().mockResolvedValue(undefined), register: vi.fn()} as unknown as RabbitMqConnection & {publish: ReturnType<typeof vi.fn>};
        const dispatcher = {dispatch: vi.fn().mockResolvedValue(decision)} as unknown as CommandDispatcher & {dispatch: ReturnType<typeof vi.fn>};
        return {consumer: new RabbitMqCommandConsumer(connection, dispatcher, OPTIONS), connection, dispatcher};
    }

    it('명령 큐를 quorum · DLX · delivery-limit 로 선언하고 바인딩 · prefetch 후 소비한다', async () => {
        const {consumer} = makeConsumer({action: 'ack', result: null});
        const channel = makeChannel();

        await consumer.setup(makeModel(channel));

        expect(channel.assertQueue).toHaveBeenCalledWith('q.user.cmd', {durable: true, arguments: {'x-queue-type': 'quorum', 'x-dead-letter-exchange': 'roomless.dlx', 'x-delivery-limit': 3}});
        expect(channel.bindQueue).toHaveBeenCalledWith('q.user.cmd', 'roomless.cmd', 'user.#');
        expect(channel.prefetch).toHaveBeenCalledWith(10);
        expect(channel.consume).toHaveBeenCalledWith('q.user.cmd', expect.any(Function));
    });

    it('done 결과를 result.<reply_to>.<type> 로 회신한 뒤 ack — x-delivery-count 를 디스패처에 넘긴다', async () => {
        const result = buildResultEnvelope(command, 'done', {result: {ok: 1}, error: null}, 3);
        const {consumer, connection, dispatcher} = makeConsumer({action: 'ack', result});
        const channel = makeChannel();
        const delivered = message(encodeEnvelope(command), 2);

        await consumer.handle(channel, delivered);

        expect(dispatcher.dispatch).toHaveBeenCalledWith(delivered.content, 2);
        expect(connection.publish).toHaveBeenCalledWith('roomless.event', 'result.gw-1.user.member.sign.done', encodeEnvelope(result), {
            messageId: result.message_id,
            correlationId: command.request_id,
            type: 'user.member.sign.done',
            timestamp: expect.any(Number),
        });
        expect(channel.ack).toHaveBeenCalledWith(delivered);
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it('requeue 판정은 회신 없이 nack(requeue=true)', async () => {
        const {consumer, connection} = makeConsumer({action: 'requeue', result: null});
        const channel = makeChannel();
        const delivered = message(encodeEnvelope(command));

        await consumer.handle(channel, delivered);

        expect(connection.publish).not.toHaveBeenCalled();
        expect(channel.nack).toHaveBeenCalledWith(delivered, false, true);
    });

    it('dead 판정은 failed 를 회신한 뒤 nack(requeue=false) → DLQ', async () => {
        const result = buildResultEnvelope(command, 'failed', {result: null, error: {status_code: 500, body: {message: 'x', validation_errors: null}}}, 4);
        const {consumer, connection} = makeConsumer({action: 'dead', result});
        const channel = makeChannel();
        const delivered = message(encodeEnvelope(command), 3);

        await consumer.handle(channel, delivered);

        expect(connection.publish).toHaveBeenCalledTimes(1);
        expect(channel.nack).toHaveBeenCalledWith(delivered, false, false);
    });

    it('회신 발행이 실패해도 다시 처리하지 않도록 ack 는 유지한다', async () => {
        const result = buildResultEnvelope(command, 'done', {result: null, error: null}, 1);
        const {consumer, connection} = makeConsumer({action: 'ack', result});
        connection.publish.mockRejectedValueOnce(new Error('broker down'));
        const channel = makeChannel();
        const delivered = message(encodeEnvelope(command));

        await consumer.handle(channel, delivered);

        expect(channel.ack).toHaveBeenCalledWith(delivered);
        expect(channel.nack).not.toHaveBeenCalled();
    });

    it.each([
        ['user-service(다른 서비스 계정)', 'user-service'],
        ['관리자 계정', 'roomless'],
        ['user_id 없음', null],
    ])('[SECURITY] 발행자가 게이트웨이가 아니면(%s) 처리 · 회신 없이 DLQ 로 보낸다', async (_label, userId) => {
        const {consumer, connection, dispatcher} = makeConsumer({action: 'ack', result: null});
        const channel = makeChannel();
        const delivered = message(encodeEnvelope(command), 0, userId);

        await consumer.handle(channel, delivered);

        expect(dispatcher.dispatch).not.toHaveBeenCalled();
        expect(connection.publish).not.toHaveBeenCalled();
        expect(channel.ack).not.toHaveBeenCalled();
        expect(channel.nack).toHaveBeenCalledWith(delivered, false, false);
    });

    it('trusted_publisher 로 신뢰할 발행자를 바꿀 수 있다', async () => {
        const connection = {publish: vi.fn().mockResolvedValue(undefined), register: vi.fn()} as unknown as RabbitMqConnection;
        const dispatcher = {dispatch: vi.fn().mockResolvedValue({action: 'ack', result: null})} as unknown as CommandDispatcher & {dispatch: ReturnType<typeof vi.fn>};
        const consumer = new RabbitMqCommandConsumer(connection, dispatcher, {...OPTIONS, trusted_publisher: 'batch'});

        await consumer.handle(makeChannel(), message(encodeEnvelope(command), 0, 'batch'));

        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it('x-delivery-count 헤더가 없으면 첫 전달(0)', async () => {
        const {consumer, dispatcher} = makeConsumer({action: 'ack', result: null});

        await consumer.handle(makeChannel(), message(encodeEnvelope(command)));

        expect(dispatcher.dispatch.mock.calls[0][1]).toBe(0);
    });
});
