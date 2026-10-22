import {BadRequestException, HttpException, HttpStatus, InternalServerErrorException} from '@nestjs/common';
import type {DiscoveryService, MetadataScanner, Reflector} from '@nestjs/core';
import {CommandHandlerRegistry} from '@app/messaging/command-handler.registry.js';
import {CommandDispatcher} from '@app/messaging/command.dispatcher.js';
import {buildCommandEnvelope, encodeEnvelope} from '@app/messaging/messaging.util.js';

const ACTOR = {user_id: 'u', auth_id: 'USER'};

/**
 * 핸들러 하나를 등록한 디스패처.
 *
 * @param handler 'test.cmd' 핸들러
 * @returns 디스패처
 */
function makeDispatcher(handler: (envelope: unknown) => unknown): CommandDispatcher {
    const registry = new CommandHandlerRegistry({} as DiscoveryService, {} as MetadataScanner, {} as Reflector);
    registry.add('test.cmd', handler);
    return new CommandDispatcher(registry);
}

/**
 * 명령 Buffer.
 *
 * @param replyTo 회신 대상
 * @returns 명령 봉투와 Buffer
 */
function command(replyTo: string | null = 'gw-1') {
    const envelope = buildCommandEnvelope({type: 'test.cmd', actor: ACTOR, payload: {x: 1}, reply_to: replyTo, client_ip: null});
    return {envelope, content: encodeEnvelope(envelope)};
}

describe('CommandDispatcher — 명령 1건 판정', () => {
    describe('[SUCCESS]', () => {
        it('핸들러 반환값을 done 결과로 회신하고 ack', async () => {
            const handler = vi.fn().mockResolvedValue({id: 7});
            const {envelope, content} = command();

            const decision = await makeDispatcher(handler).dispatch(content, 0);

            expect(handler).toHaveBeenCalledWith(envelope);
            expect(decision.action).toBe('ack');
            expect(decision.result).toMatchObject({
                request_id: envelope.request_id,
                type: 'test.cmd.done',
                actor: ACTOR,
                payload: {result: {id: 7}, error: null},
                meta: {reply_to: 'gw-1', attempt: 1},
            });
        });

        it('void 핸들러는 result null', async () => {
            const decision = await makeDispatcher(vi.fn().mockResolvedValue(undefined)).dispatch(command().content, 0);

            expect(decision.result?.payload).toEqual({result: null, error: null});
        });

        it('reply_to 가 없으면 처리만 하고 회신하지 않는다', async () => {
            const decision = await makeDispatcher(vi.fn().mockResolvedValue({id: 1})).dispatch(command(null).content, 0);

            expect(decision).toEqual({action: 'ack', result: null});
        });
    });

    describe('[CASES:returned-exception] 핸들러가 예외를 반환 — service 가 쓰기를 커밋한 뒤 돌려준 실패', () => {
        it('① 400 예외 반환 → failed(400 · validation_errors) 회신 후 ack', async () => {
            const message = '인증번호가 일치하지 않습니다.';
            const returned = new BadRequestException({message, validation_errors: [{property: 'code', message}]});
            const handler = vi.fn().mockResolvedValue(returned);
            const {envelope, content} = command();

            const decision = await makeDispatcher(handler).dispatch(content, 0);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(decision.action).toBe('ack');
            expect(decision.result).toMatchObject({
                request_id: envelope.request_id,
                type: 'test.cmd.failed',
                actor: ACTOR,
                payload: {result: null, error: {status_code: 400, body: {message, validation_errors: [{property: 'code', message}]}}},
                meta: {reply_to: 'gw-1', attempt: 1},
            });
        });

        it('② 500 예외 반환 → 이미 커밋돼 재시도하지 않고 failed 회신 후 ack (던진 500 은 requeue)', async () => {
            const decision = await makeDispatcher(vi.fn().mockResolvedValue(new InternalServerErrorException({message: '서버 오류'}))).dispatch(command().content, 0);

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('test.cmd.failed');
            expect(decision.result?.payload).toEqual({result: null, error: {status_code: 500, body: {message: '서버 오류', validation_errors: null}}});
        });

        it('③ reply_to 가 없으면 예외를 반환해도 회신 없이 ack', async () => {
            const decision = await makeDispatcher(vi.fn().mockResolvedValue(new BadRequestException({message: '인증번호가 일치하지 않습니다.'}))).dispatch(command(null).content, 0);

            expect(decision).toEqual({action: 'ack', result: null});
        });
    });

    describe('[FAIL:business] 4xx — 재시도해도 같으므로 failed 회신 후 ack', () => {
        it.each([
            [new BadRequestException({message: '중복입니다.'}), 400, {message: '중복입니다.', validation_errors: null}],
            [new HttpException({message: '정지', block_comment: '사유'}, HttpStatus.FORBIDDEN), 403, {message: '정지', validation_errors: null, block_comment: '사유'}],
        ])('%s', async (error, status, body) => {
            const decision = await makeDispatcher(vi.fn().mockRejectedValue(error)).dispatch(command().content, 0);

            expect(decision.action).toBe('ack');
            expect(decision.result?.type).toBe('test.cmd.failed');
            expect(decision.result?.payload).toEqual({result: null, error: {status_code: status, body}});
        });
    });

    describe('[FAIL:infra] 5xx — 재시도 후 DLQ', () => {
        it.each([0, 1, 2])('이전 전달 %i 회면 회신 없이 requeue', async (deliveryCount) => {
            const decision = await makeDispatcher(vi.fn().mockRejectedValue(new InternalServerErrorException({message: '서버 오류'}))).dispatch(command().content, deliveryCount);

            expect(decision).toEqual({action: 'requeue', result: null});
        });

        it('마지막 시도(이전 전달 3회)면 failed 회신 후 dead', async () => {
            const decision = await makeDispatcher(vi.fn().mockRejectedValue(new Error('boom'))).dispatch(command().content, 3);

            expect(decision.action).toBe('dead');
            expect(decision.result?.payload).toEqual({result: null, error: {status_code: 500, body: {message: '요청이 실패했습니다. 관리자에게 문의해주세요.', validation_errors: null}}});
            expect(decision.result?.meta.attempt).toBe(4);
        });
    });

    describe('[FAIL:message] 회신 불가 → dead', () => {
        it('JSON 이 아니면 dead, 핸들러 미호출', async () => {
            const handler = vi.fn();

            const decision = await makeDispatcher(handler).dispatch(Buffer.from('garbage'), 0);

            expect(decision).toEqual({action: 'dead', result: null});
            expect(handler).not.toHaveBeenCalled();
        });

        it('핸들러가 없는 type 이면 dead', async () => {
            const envelope = buildCommandEnvelope({type: 'unknown.cmd', actor: null, payload: {}, reply_to: 'gw-1', client_ip: null});

            const decision = await makeDispatcher(vi.fn()).dispatch(encodeEnvelope(envelope), 0);

            expect(decision).toEqual({action: 'dead', result: null});
        });
    });
});
