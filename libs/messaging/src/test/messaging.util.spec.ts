import {UnauthorizedException} from '@nestjs/common';
import {
    buildCommandEnvelope,
    buildResultEnvelope,
    decodeEnvelope,
    encodeEnvelope,
    newMessageId,
    requireActor,
    resolveGatewayInstanceId,
    resultBindingKey,
    resultQueueName,
    resultRoutingKey,
} from '@app/messaging/messaging.util.js';

describe('messaging.util', () => {
    it('newMessageId 는 32자 hex', () => {
        expect(newMessageId()).toMatch(/^[a-f0-9]{32}$/);
        expect(newMessageId()).not.toBe(newMessageId());
    });

    describe('resolveGatewayInstanceId', () => {
        it('GATEWAY_INSTANCE_ID 가 있으면 그 값 — 라우팅 키를 깨는 점(.)은 하이픈으로 바꾼다', () => {
            expect(resolveGatewayInstanceId({GATEWAY_INSTANCE_ID: 'gw.01'})).toBe('gw-01');
        });

        it('없으면 gw-<호스트>-<pid> 이고 영숫자 · 하이픈만 남는다', () => {
            const id = resolveGatewayInstanceId({});

            expect(id.startsWith('gw-')).toBe(true);
            expect(id).toMatch(/^[a-zA-Z0-9-]+$/);
            expect(id.endsWith(`-${process.pid}`)).toBe(true);
        });
    });

    it('결과 큐 · 라우팅 키 · 바인딩 키 규칙', () => {
        expect(resultQueueName('gw-1')).toBe('q.gw.result.gw-1');
        expect(resultRoutingKey('gw-1', 'user.member.sign.done')).toBe('result.gw-1.user.member.sign.done');
        expect(resultBindingKey('gw-1')).toBe('result.gw-1.#');
    });

    it('buildCommandEnvelope — message_id = request_id, attempt 1', () => {
        const envelope = buildCommandEnvelope({type: 'user.member.sign', actor: null, payload: {a: 1}, reply_to: 'gw-1', client_ip: '1.1.1.1'});

        expect(envelope.message_id).toBe(envelope.request_id);
        expect(envelope).toMatchObject({type: 'user.member.sign', actor: null, payload: {a: 1}, meta: {reply_to: 'gw-1', client_ip: '1.1.1.1', attempt: 1}});
        expect(new Date(envelope.occurred_at).toISOString()).toBe(envelope.occurred_at);
    });

    it('buildResultEnvelope — request_id · actor · reply_to 를 이어받고 type 뒤에 상태를 붙인다', () => {
        const actor = {user_id: 'u', auth_id: 'USER'};
        const command = buildCommandEnvelope({type: 'user.member.leave', actor, payload: {}, reply_to: 'gw-1', client_ip: null});

        const result = buildResultEnvelope(command, 'failed', {result: null, error: {status_code: 404, body: {message: 'x', validation_errors: null}}}, 2);

        expect(result.message_id).not.toBe(command.message_id);
        expect(result).toMatchObject({request_id: command.request_id, type: 'user.member.leave.failed', actor, meta: {reply_to: 'gw-1', client_ip: null, attempt: 2}});
    });

    describe('requireActor', () => {
        it('actor 가 있으면 돌려준다', () => {
            const actor = {user_id: 'u', auth_id: 'USER'};
            expect(requireActor(buildCommandEnvelope({type: 't', actor, payload: {}, reply_to: null, client_ip: null}))).toBe(actor);
        });

        it('없으면 401 "로그인이 필요합니다."', () => {
            const envelope = buildCommandEnvelope({type: 't', actor: null, payload: {}, reply_to: null, client_ip: null});

            expect(() => requireActor(envelope)).toThrow(UnauthorizedException);
            try {
                requireActor(envelope);
            } catch (error) {
                expect((error as UnauthorizedException).getResponse()).toEqual({message: '로그인이 필요합니다.'});
            }
        });
    });

    describe('encode / decode', () => {
        it('왕복하면 같은 봉투', () => {
            const envelope = buildCommandEnvelope({type: 't', actor: null, payload: {한글: '값'}, reply_to: 'gw', client_ip: null});

            expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope);
        });

        it.each([['not json'], ['{"type":1}'], ['null'], ['{"type":"t"}']])('형식이 틀리면 null: %s', (raw) => {
            expect(decodeEnvelope(Buffer.from(raw))).toBeNull();
        });
    });
});

describe('브로커 접속 정보', () => {
    it('계정별 비밀번호 환경변수 이름', async () => {
        const {brokerPasswordEnv} = await import('@app/messaging/messaging.util.js');

        expect(brokerPasswordEnv('gateway')).toBe('RABBITMQ_GATEWAY_PASSWORD');
        expect(brokerPasswordEnv('user-service')).toBe('RABBITMQ_USER_SERVICE_PASSWORD');
    });

    it('호스트 · 포트 · 계정별 비밀번호로 URL 을 만들고, 특수문자는 인코딩한다', async () => {
        const {buildBrokerUrl} = await import('@app/messaging/messaging.util.js');

        expect(buildBrokerUrl('gateway', {RABBITMQ_HOST: 'rabbitmq', RABBITMQ_PORT: '5673', RABBITMQ_GATEWAY_PASSWORD: 'p@ss:w/rd'})).toBe('amqp://gateway:p%40ss%3Aw%2Frd@rabbitmq:5673');
        expect(buildBrokerUrl('user-service', {})).toBe('amqp://user-service:@localhost:5672');
    });
});
