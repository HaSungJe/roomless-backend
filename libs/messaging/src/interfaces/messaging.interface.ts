import type {MessageEnvelope, ResultPayload} from '@app/contracts/message-envelope.js';

/** 명령 발행 포트 — 게이트웨이의 CommandStreamService 가 쓴다 */
export interface CommandPublisherInterface {
    /**
     * 명령을 브로커에 발행하고 publisher confirm 까지 기다린다.
     * 브로커 연결이 없으면 503 예외를 던진다.
     */
    publish(envelope: MessageEnvelope<unknown>): Promise<void>;
}

/** 결과 메시지 */
export type ResultEnvelope = MessageEnvelope<ResultPayload<unknown>>;

/** 결과 수신 포트 — 게이트웨이 인스턴스 전용 결과 큐를 소비한다 */
export interface ResultSubscriberInterface {
    /**
     * 결과가 도착할 때마다 호출할 함수를 등록한다(인스턴스당 1개).
     */
    setListener(listener: (envelope: ResultEnvelope) => void): void;
}

/** 서비스 명령 소비 설정 */
export interface CommandConsumerOptions {
    /** 소비할 큐 이름 (예: q.user.cmd) */
    queue: string;
    /** 명령 exchange 바인딩 키 (예: ['user.#']) */
    binding_keys: string[];
    /** 동시 처리 수 (기본 10) */
    prefetch?: number;
    /** 이 서비스의 브로커 계정 (BROKER_USER 값) */
    broker_user: string;
    /** 명령을 받아들일 발행자 계정 (기본 BROKER_USER.GATEWAY) — user_id 가 다르면 처리하지 않고 DLQ 로 보낸다 */
    trusted_publisher?: string;
}

/** `@OnCommand` 핸들러 — 반환값이 done 결과의 result 가 된다(void 면 null) */
export type CommandHandlerFn = (envelope: MessageEnvelope<any>) => Promise<unknown> | unknown;
