import type {Actor} from './actor.js';

/**
 * RabbitMQ 메시지 봉투 — 명령(roomless.cmd)과 결과(roomless.event)가 같은 모양을 쓴다.
 * 모든 키는 snake_case.
 */
export interface MessageEnvelope<T> {
    /** 메시지 고유 ID (재전달돼도 같은 값) */
    message_id: string;
    /** 게이트웨이가 HTTP 요청마다 발급한 추적 ID — 결과를 열린 응답 스트림에 매칭하는 키 */
    request_id: string;
    /** 메시지 종류 = 라우팅 키 (`<server>.<resource>.<action>`, 결과는 뒤에 `.done` / `.failed`) */
    type: string;
    /** 발행 시각 (ISO 8601) */
    occurred_at: string;
    /** 요청 회원 (비로그인 요청이면 null) */
    actor: Actor | null;
    /** 본문 — 명령이면 입력 DTO, 결과면 ResultPayload */
    payload: T;
    /** 전달 메타 */
    meta: MessageMeta;
}

/** 메시지 전달 메타 */
export interface MessageMeta {
    /** 결과를 돌려받을 게이트웨이 인스턴스 ID (회신이 필요 없으면 null) */
    reply_to: string | null;
    /** 클라이언트 IP (게이트웨이가 받은 원래 IP, 없으면 null) */
    client_ip: string | null;
    /** 처리 시도 횟수 (명령은 1, 결과는 처리된 시도 번호) */
    attempt: number;
}

/**
 * 결과 메시지 본문.
 * 성공이면 result 에 서비스 반환값(void 면 null), 실패면 error 에 전송 계층 중립 실패 결과가 들어간다.
 */
export interface ResultPayload<R> {
    /** 성공 결과 (실패거나 반환값이 없으면 null) */
    result: R | null;
    /** 실패 결과 (성공이면 null) */
    error: ResultError | null;
}

/** 결과 메시지의 실패 — 상태 코드 + HTTP 실패 본문과 같은 모양 */
export interface ResultError {
    /** HTTP 상태 코드 의미의 숫자 */
    status_code: number;
    /** 실패 본문 — HTTP 실패 응답(ApiFailResultDto)과 같다. 기능별 추가 필드(예: block_comment)도 함께 실린다 */
    body: ResultErrorBody;
}

/** 실패 본문의 공통 필드 */
export interface ResultErrorBody {
    /** 메시지 */
    message: string;
    /** 입력 필드 오류 목록 (없으면 null) */
    validation_errors: unknown[] | null;
}

/** 결과 메시지 종류 접미사 */
export const RESULT_STATUS = {DONE: 'done', FAILED: 'failed'} as const;
export type ResultStatus = (typeof RESULT_STATUS)[keyof typeof RESULT_STATUS];

/**
 * 게이트웨이 → 클라이언트 요청 단위 SSE 이벤트 이름.
 * 큐 경로 요청 1건 = 스트림 1개 = accepted 1회 + (done | failed | pending) 1회 후 종료.
 */
export const COMMAND_STREAM_EVENT = {
    /** 명령이 브로커에 접수됨 — data: `{request_id}` */
    ACCEPTED: 'accepted',
    /** 처리 성공 — data: 서비스 결과 DTO (반환값이 없으면 null) */
    DONE: 'done',
    /** 처리 실패 — data: `{status_code, message, validation_errors, ...}` */
    FAILED: 'failed',
    /** 대기 시간 초과 — data: `{request_id, message}`. 처리는 계속될 수 있으므로 클라이언트는 리소스를 재조회한다 */
    PENDING: 'pending',
} as const;
