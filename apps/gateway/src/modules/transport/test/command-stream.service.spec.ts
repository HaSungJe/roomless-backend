import {EventEmitter} from 'node:events';
import type {Response} from 'express';
import {buildResultEnvelope} from '@app/messaging/messaging.util.js';
import {CommandStreamService} from '../command-stream.service.js';
import {FakeBroker, parseSse, replyDone} from './fake-broker.js';

/**
 * 쓰기 내용을 모으는 가짜 express 응답.
 *
 * @returns 응답 mock 과 기록
 */
function makeResponse() {
    const emitter = new EventEmitter();
    const state = {status: 0, headers: {} as Record<string, string>, chunks: [] as string[], ended: false};
    const res = {
        status: vi.fn((code: number) => {
            state.status = code;
            return res;
        }),
        setHeader: vi.fn((key: string, value: string) => {
            state.headers[key] = value;
        }),
        flushHeaders: vi.fn(),
        write: vi.fn((chunk: string) => {
            state.chunks.push(chunk);
            return true;
        }),
        end: vi.fn((chunk?: string) => {
            if (chunk) state.chunks.push(chunk);
            state.ended = true;
            emitter.emit('close');
        }),
        on: vi.fn((event: string, listener: () => void) => emitter.on(event, listener)),
    };
    return {res: res as unknown as Response, state, emitter};
}

describe('CommandStreamService — 요청 단위 SSE', () => {
    let broker: FakeBroker;
    let service: CommandStreamService;
    const originalTimeout = process.env.COMMAND_STREAM_TIMEOUT_MS;

    beforeEach(() => {
        broker = new FakeBroker();
        service = new CommandStreamService(broker, broker, 'gw-test');
        service.onModuleInit();
    });

    afterEach(() => {
        process.env.COMMAND_STREAM_TIMEOUT_MS = originalTimeout;
        vi.useRealTimers();
    });

    it('[SUCCESS] 응답 헤더를 SSE 로 열고 accepted 후 결과를 쓰고 닫는다', async () => {
        broker.reply = replyDone({ok: true});
        const {res, state} = makeResponse();

        await service.dispatch(res, {type: 'user.member.sign', actor: null, payload: {}, client_ip: '1.1.1.1'});
        await new Promise((resolve) => setImmediate(resolve));

        expect(state.status).toBe(200);
        expect(state.headers).toEqual({'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no'});
        expect(parseSse(state.chunks.join(''))).toEqual([
            {event: 'accepted', data: {request_id: broker.published[0].request_id}},
            {event: 'done', data: {ok: true}},
        ]);
        expect(state.ended).toBe(true);
        expect(service.pendingCount()).toBe(0);
    });

    it('[RACE] 결과가 발행 confirm 보다 먼저 와도 accepted 다음에 쓴다', async () => {
        broker.reply = replyDone({early: true});
        broker.replyBeforeConfirm = true;
        const {res, state} = makeResponse();

        await service.dispatch(res, {type: 't', actor: null, payload: {}, client_ip: null});

        expect(parseSse(state.chunks.join('')).map((e) => e.event)).toEqual(['accepted', 'done']);
        expect(service.pendingCount()).toBe(0);
    });

    it('[TIMEOUT] 대기 시간을 넘기면 pending 을 쓰고 닫는다 — 늦게 온 결과는 버린다', async () => {
        vi.useFakeTimers();
        process.env.COMMAND_STREAM_TIMEOUT_MS = '1000';
        const {res, state} = makeResponse();

        await service.dispatch(res, {type: 't', actor: null, payload: {}, client_ip: null});
        const requestId = broker.published[0].request_id;
        vi.advanceTimersByTime(1000);

        expect(parseSse(state.chunks.join(''))[1]).toEqual({event: 'pending', data: {request_id: requestId, message: '처리 중입니다. 잠시 후 결과를 확인해주세요.'}});
        expect(service.pendingCount()).toBe(0);

        const endCalls = vi.mocked(res.end).mock.calls.length;
        service.complete(buildResultEnvelope(broker.published[0], 'done', {result: 1, error: null}, 1));
        expect(vi.mocked(res.end).mock.calls.length).toBe(endCalls);
    });

    it('[DISCONNECT] 클라이언트가 끊으면 등록을 해제하고, 이후 결과는 버린다', async () => {
        const {res, emitter} = makeResponse();

        await service.dispatch(res, {type: 't', actor: null, payload: {}, client_ip: null});
        expect(service.pendingCount()).toBe(1);
        emitter.emit('close');

        expect(service.pendingCount()).toBe(0);
        service.complete(buildResultEnvelope(broker.published[0], 'done', {result: 1, error: null}, 1));
        expect(res.end).not.toHaveBeenCalled();
    });

    it('[FAIL:broker] 발행 실패 시 등록을 지우고 예외를 그대로 던진다(스트림 미개방)', async () => {
        broker.publishError = new Error('broker down');
        const {res} = makeResponse();

        await expect(service.dispatch(res, {type: 't', actor: null, payload: {}, client_ip: null})).rejects.toThrow('broker down');

        expect(res.status).not.toHaveBeenCalled();
        expect(service.pendingCount()).toBe(0);
    });

    it('[SHUTDOWN] 종료 시 남은 스트림에 pending 을 쓰고 닫는다', async () => {
        const {res, state} = makeResponse();
        await service.dispatch(res, {type: 't', actor: null, payload: {}, client_ip: null});

        service.onModuleDestroy();

        expect(parseSse(state.chunks.join('')).map((e) => e.event)).toEqual(['accepted', 'pending']);
        expect(service.pendingCount()).toBe(0);
    });

    it('모르는 request_id 의 결과는 무시한다', () => {
        expect(() => service.complete({request_id: 'nope', payload: {result: null, error: null}} as never)).not.toThrow();
    });
});
