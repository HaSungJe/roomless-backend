import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {CommandPublisherInterface, ResultEnvelope, ResultSubscriberInterface} from '@app/messaging/interfaces/messaging.interface.js';
import {buildResultEnvelope} from '@app/messaging/messaging.util.js';

/** 명령을 받았을 때 브로커가 할 일 */
export type FakeReply = (command: MessageEnvelope<unknown>) => ResultEnvelope | null;

/**
 * 테스트용 브로커 — 발행 포트와 결과 수신 포트를 함께 흉내 낸다.
 * 발행된 명령을 기록하고, reply 가 돌려준 결과를 다음 tick 에 리스너로 넘긴다(실제 서비스 처리 지연과 같은 순서).
 */
export class FakeBroker implements CommandPublisherInterface, ResultSubscriberInterface {
    readonly published: MessageEnvelope<unknown>[] = [];
    reply: FakeReply = () => null;
    /** true 면 발행 confirm 전에(동기적으로) 결과를 넘긴다 — 결과가 스트림 열기보다 먼저 오는 경쟁 상황 */
    replyBeforeConfirm = false;
    publishError: Error | null = null;
    private listener: ((envelope: ResultEnvelope) => void) | null = null;

    /**
     * 결과 리스너 등록.
     *
     * @param listener 리스너
     */
    setListener(listener: (envelope: ResultEnvelope) => void): void {
        this.listener = listener;
    }

    /**
     * 명령 발행.
     *
     * @param command 명령
     */
    async publish(command: MessageEnvelope<unknown>): Promise<void> {
        if (this.publishError) throw this.publishError;
        this.published.push(command);
        const result = this.reply(command);
        if (!result) return;
        if (this.replyBeforeConfirm) this.listener?.(result);
        else setImmediate(() => this.listener?.(result));
    }
}

/**
 * done 결과를 만드는 reply.
 *
 * @param result 서비스 결과
 * @returns reply
 */
export function replyDone(result: unknown): FakeReply {
    return (command) => buildResultEnvelope(command, 'done', {result, error: null}, 1);
}

/**
 * failed 결과를 만드는 reply.
 *
 * @param status_code 상태 코드
 * @param body 실패 본문
 * @returns reply
 */
export function replyFailed(status_code: number, body: {message: string; validation_errors: unknown[] | null; [key: string]: unknown}): FakeReply {
    return (command) => buildResultEnvelope(command, 'failed', {result: null, error: {status_code, body}}, 1);
}

/**
 * SSE 본문을 이벤트 목록으로 읽는다.
 *
 * @param text 응답 본문
 * @returns {event, data} 목록
 */
export function parseSse(text: string): {event: string; data: unknown}[] {
    return text
        .split('\n\n')
        .filter((block) => block.trim().length > 0)
        .map((block) => {
            const lines = block.split('\n');
            const event = lines.find((line) => line.startsWith('event: '))?.slice(7) ?? '';
            const data = lines.find((line) => line.startsWith('data: '))?.slice(6) ?? 'null';
            return {event, data: JSON.parse(data)};
        });
}
