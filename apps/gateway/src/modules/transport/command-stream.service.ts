import {Inject, Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import type {Response} from 'express';
import type {Actor} from '@app/contracts/actor.js';
import {COMMAND_STREAM_EVENT} from '@app/contracts/message-envelope.js';
import type {CommandPublisherInterface, ResultEnvelope, ResultSubscriberInterface} from '@app/messaging/interfaces/messaging.interface.js';
import {COMMAND_PUBLISHER, GATEWAY_INSTANCE_ID, RESULT_SUBSCRIBER} from '@app/messaging/messaging.symbols.js';
import {buildCommandEnvelope} from '@app/messaging/messaging.util.js';
import {readPositiveInt} from '@app/common/utils/env.js';
import {COMMAND_PENDING_MESSAGE, DEFAULT_COMMAND_STREAM_TIMEOUT_MS, formatSseEvent} from './transport.util.js';

/** 큐 경로 명령 1건의 입력 */
export interface CommandRequest {
    /** 명령 type (예: USER_COMMAND.SIGN) */
    type: string;
    /** 로그인 회원 (비로그인 요청이면 null) */
    actor: Actor | null;
    /** 검증된 입력 DTO */
    payload: unknown;
    /** 클라이언트 IP */
    client_ip: string | null;
}

/** 결과를 기다리는 응답 스트림 */
interface PendingStream {
    res: Response;
    timer: NodeJS.Timeout;
    /** 응답 헤더를 보냈는지 (발행 confirm 전에 결과가 오면 false) */
    opened: boolean;
    /** 스트림을 열기 전에 도착한 결과 */
    early: ResultEnvelope | null;
}

/**
 * 큐 경로의 요청 단위 SSE.
 *
 * POST 의 HTTP 응답 자체를 `text/event-stream` 으로 열어 두고, 명령을 RabbitMQ 에 발행한 뒤
 * 이 인스턴스 전용 결과 큐로 돌아온 결과를 그 응답에 한 번 쓰고 닫는다.
 * 요청 상태 저장소도, 사용자당 상시 연결도 없다 — 메모리에는 처리 중인 요청 수만큼의 `request_id → 응답` 만 잠깐 있다.
 *
 * 이벤트 순서: accepted → (done | failed | pending) → 종료
 */
@Injectable()
export class CommandStreamService implements OnModuleInit, OnModuleDestroy {
    private readonly streams = new Map<string, PendingStream>();

    /**
     * @param publisher 명령 발행 포트
     * @param subscriber 결과 수신 포트
     * @param instanceId 이 게이트웨이 인스턴스 ID (결과 회신 주소)
     */
    constructor(
        @Inject(COMMAND_PUBLISHER) private readonly publisher: CommandPublisherInterface,
        @Inject(RESULT_SUBSCRIBER) private readonly subscriber: ResultSubscriberInterface,
        @Inject(GATEWAY_INSTANCE_ID) private readonly instanceId: string,
    ) {}

    /**
     * 결과 수신 시 complete 를 호출하도록 연결한다.
     */
    onModuleInit(): void {
        this.subscriber.setListener((envelope) => this.complete(envelope));
    }

    /**
     * 명령을 발행하고 응답을 SSE 스트림으로 연다.
     * 발행이 실패하면(브로커 연결 없음 등) 스트림을 열지 않고 예외를 던져 일반 HTTP 실패 응답이 나가게 한다.
     *
     * @param res express 응답 (핸들러의 `@Res()`)
     * @param request 명령 입력
     */
    async dispatch(res: Response, request: CommandRequest): Promise<void> {
        const command = buildCommandEnvelope({...request, reply_to: this.instanceId});
        const requestId = command.request_id;

        // 결과가 발행 confirm 보다 먼저 도착해도 받을 수 있도록 발행 전에 등록한다
        const entry: PendingStream = {res, timer: setTimeout(() => this.expire(requestId), this.timeoutMs()), opened: false, early: null};
        this.streams.set(requestId, entry);

        try {
            await this.publisher.publish(command);
        } catch (error) {
            clearTimeout(entry.timer);
            this.streams.delete(requestId);
            throw error;
        }

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        res.write(formatSseEvent(COMMAND_STREAM_EVENT.ACCEPTED, {request_id: requestId}));
        entry.opened = true;
        res.on('close', () => this.release(requestId));

        if (entry.early) this.finish(requestId, entry.early);
    }

    /**
     * 결과 도착 — 해당 요청의 스트림에 done/failed 를 쓰고 닫는다.
     * 기다리는 스트림이 없으면(클라이언트가 끊었거나 대기 시간 초과) 결과를 버린다.
     *
     * @param envelope 결과 봉투
     */
    complete(envelope: ResultEnvelope): void {
        const entry = this.streams.get(envelope.request_id);
        if (!entry) return;
        if (!entry.opened) {
            entry.early = envelope;
            return;
        }
        this.finish(envelope.request_id, envelope);
    }

    /**
     * 처리 중인 스트림 수 (모니터링 · 테스트용).
     *
     * @returns 스트림 수
     */
    pendingCount(): number {
        return this.streams.size;
    }

    /**
     * 종료 시 남은 스트림에 pending 을 쓰고 닫는다.
     */
    onModuleDestroy(): void {
        for (const requestId of this.streams.keys()) {
            this.expire(requestId);
        }
    }

    /**
     * 결과를 SSE 이벤트로 쓰고 스트림을 닫는다.
     *
     * @param requestId 요청 ID
     * @param envelope 결과 봉투
     */
    private finish(requestId: string, envelope: ResultEnvelope): void {
        const entry = this.streams.get(requestId);
        if (!entry) return;
        const {result, error} = envelope.payload;
        const event = error ? formatSseEvent(COMMAND_STREAM_EVENT.FAILED, {status_code: error.status_code, ...error.body}) : formatSseEvent(COMMAND_STREAM_EVENT.DONE, result ?? null);
        entry.res.end(event);
        this.release(requestId);
    }

    /**
     * 대기 시간 초과 — pending 을 쓰고 닫는다. 처리는 서비스에서 계속될 수 있다.
     *
     * @param requestId 요청 ID
     */
    private expire(requestId: string): void {
        const entry = this.streams.get(requestId);
        if (!entry) return;
        if (entry.opened) {
            entry.res.end(formatSseEvent(COMMAND_STREAM_EVENT.PENDING, {request_id: requestId, message: COMMAND_PENDING_MESSAGE}));
        }
        this.release(requestId);
    }

    /**
     * 스트림 등록을 해제한다.
     *
     * @param requestId 요청 ID
     */
    private release(requestId: string): void {
        const entry = this.streams.get(requestId);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.streams.delete(requestId);
    }

    /**
     * 대기 시간 (COMMAND_STREAM_TIMEOUT_MS, 기본 30초).
     *
     * @returns ms
     */
    private timeoutMs(): number {
        return readPositiveInt(process.env.COMMAND_STREAM_TIMEOUT_MS, DEFAULT_COMMAND_STREAM_TIMEOUT_MS);
    }
}
