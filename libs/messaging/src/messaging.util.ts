import {UnauthorizedException} from '@nestjs/common';
import {hostname} from 'node:os';
import {v4} from 'uuid';
import type {Actor} from '@app/contracts/actor.js';
import type {MessageEnvelope, ResultPayload, ResultStatus} from '@app/contracts/message-envelope.js';
import {RESULT_ROUTING_PREFIX} from './messaging.constants.js';

/** 로그인 회원이 필요한 명령에 actor 가 없을 때의 메시지 */
export const ACTOR_REQUIRED_MESSAGE = '로그인이 필요합니다.';

/**
 * 하이픈 없는 UUID v4 (32자) — message_id · request_id 에 쓴다.
 *
 * @returns 32자 hex
 */
export function newMessageId(): string {
    return v4().replace(/-/g, '');
}

/**
 * 브로커 계정의 비밀번호 환경변수 이름 — `RABBITMQ_<계정 대문자, - → _>_PASSWORD`.
 *
 * @param user 브로커 계정 (예: 'user-service')
 * @returns 환경변수 이름 (예: 'RABBITMQ_USER_SERVICE_PASSWORD')
 */
export function brokerPasswordEnv(user: string): string {
    return `RABBITMQ_${user.toUpperCase().replace(/-/g, '_')}_PASSWORD`;
}

/**
 * 브로커 접속 URL 을 만든다 — 호스트 · 포트는 RABBITMQ_HOST · RABBITMQ_PORT, 비밀번호는 계정별 환경변수.
 *
 * @param user 브로커 계정
 * @param env 환경변수 (테스트 주입용)
 * @returns amqp:// URL
 */
export function buildBrokerUrl(user: string, env: NodeJS.ProcessEnv = process.env): string {
    const host = env.RABBITMQ_HOST || 'localhost';
    const port = env.RABBITMQ_PORT || '5672';
    const password = env[brokerPasswordEnv(user)] ?? '';
    return `amqp://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
}

/**
 * 게이트웨이 인스턴스 ID 를 정한다.
 * GATEWAY_INSTANCE_ID 가 있으면 그 값, 없으면 `gw-<호스트>-<pid>`.
 * 라우팅 키의 단어 구분자(.)가 섞이지 않도록 영숫자 · 하이픈 외 문자는 하이픈으로 바꾼다.
 *
 * @param env 환경변수 (테스트 주입용)
 * @returns 인스턴스 ID
 */
export function resolveGatewayInstanceId(env: NodeJS.ProcessEnv = process.env): string {
    const raw = env.GATEWAY_INSTANCE_ID || `gw-${hostname()}-${process.pid}`;
    return raw.replace(/[^a-zA-Z0-9-]/g, '-');
}

/**
 * 게이트웨이 인스턴스 전용 결과 큐 이름.
 *
 * @param instanceId 인스턴스 ID
 * @returns `q.gw.result.<인스턴스>`
 */
export function resultQueueName(instanceId: string): string {
    return `q.gw.result.${instanceId}`;
}

/**
 * 결과 회신 라우팅 키.
 *
 * @param replyTo 게이트웨이 인스턴스 ID
 * @param resultType 결과 type (`<명령 type>.<done|failed>`)
 * @returns `result.<인스턴스>.<결과 type>`
 */
export function resultRoutingKey(replyTo: string, resultType: string): string {
    return `${RESULT_ROUTING_PREFIX}.${replyTo}.${resultType}`;
}

/**
 * 게이트웨이 결과 큐 바인딩 키.
 *
 * @param instanceId 인스턴스 ID
 * @returns `result.<인스턴스>.#`
 */
export function resultBindingKey(instanceId: string): string {
    return `${RESULT_ROUTING_PREFIX}.${instanceId}.#`;
}

/**
 * 명령 봉투를 만든다.
 *
 * @param params 명령 종류 · 요청 회원 · 본문 · 회신 대상 · 클라이언트 IP
 * @returns 명령 봉투 (message_id = request_id)
 */
export function buildCommandEnvelope<T>(params: {type: string; actor: Actor | null; payload: T; reply_to: string | null; client_ip: string | null}): MessageEnvelope<T> {
    const id = newMessageId();
    return {
        message_id: id,
        request_id: id,
        type: params.type,
        occurred_at: new Date().toISOString(),
        actor: params.actor,
        payload: params.payload,
        meta: {reply_to: params.reply_to, client_ip: params.client_ip, attempt: 1},
    };
}

/**
 * 명령에 대한 결과 봉투를 만든다. request_id · actor · reply_to 는 명령에서 이어받는다.
 *
 * @param command 원 명령
 * @param status done | failed
 * @param payload 결과 본문
 * @param attempt 처리된 시도 번호
 * @returns 결과 봉투
 */
export function buildResultEnvelope(command: MessageEnvelope<unknown>, status: ResultStatus, payload: ResultPayload<unknown>, attempt: number): MessageEnvelope<ResultPayload<unknown>> {
    return {
        message_id: newMessageId(),
        request_id: command.request_id,
        type: `${command.type}.${status}`,
        occurred_at: new Date().toISOString(),
        actor: command.actor,
        payload,
        meta: {reply_to: command.meta?.reply_to ?? null, client_ip: null, attempt},
    };
}

/**
 * 로그인 회원이 필요한 명령에서 actor 를 꺼낸다.
 *
 * @param envelope 명령 봉투
 * @returns 요청 회원
 * @throws UnauthorizedException actor 가 없으면 (failed 401 로 회신된다)
 */
export function requireActor(envelope: MessageEnvelope<unknown>): Actor {
    if (!envelope.actor) {
        throw new UnauthorizedException({message: ACTOR_REQUIRED_MESSAGE});
    }
    return envelope.actor;
}

/**
 * 봉투를 브로커에 실을 Buffer 로 바꾼다.
 *
 * @param envelope 봉투
 * @returns JSON Buffer
 */
export function encodeEnvelope(envelope: MessageEnvelope<unknown>): Buffer {
    return Buffer.from(JSON.stringify(envelope));
}

/**
 * 브로커에서 받은 내용을 봉투로 읽는다. 형식이 틀리면 null.
 *
 * @param content 메시지 내용
 * @returns 봉투 또는 null
 */
export function decodeEnvelope<T>(content: Buffer): MessageEnvelope<T> | null {
    try {
        const parsed = JSON.parse(content.toString('utf8')) as MessageEnvelope<T>;
        if (!parsed || typeof parsed.type !== 'string' || typeof parsed.request_id !== 'string') return null;
        return parsed;
    } catch {
        return null;
    }
}
