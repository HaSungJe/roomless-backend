import {COMMAND_STREAM_EVENT} from '@app/contracts/message-envelope.js';
import {ApiLogEntity} from '@app/database/entities/api-log/api-log.entity.js';

/** t_api_log.path 길이 — 넘치면 insert 가 실패해 로그가 빠지므로 자른다 */
const API_LOG_PATH_MAX = 500;

/** t_api_log.user_agent 길이 */
const API_LOG_USER_AGENT_MAX = 500;

/** 실제 경로를 꺼낼 때 쓰는 origin (URL 파싱용) */
const URL_BASE = 'http://gateway';

/** 로그 한 행을 만들 재료 — 미들웨어가 응답이 끝난 뒤 모은다 */
export interface ApiLogSource {
    created_at: Date;
    method: string;
    route_path: unknown;
    original_url: string;
    params: unknown;
    query: unknown;
    body: unknown;
    status_code: number;
    content_type: string;
    response_text: string;
    error_stack: unknown;
    user_id: string | null;
    ip: string | null;
    user_agent: string | null;
    duration_ms: number;
}

/**
 * 요청의 실제 경로(쿼리 제외).
 *
 * @param originalUrl req.originalUrl
 * @returns 경로
 */
export function toRequestPath(originalUrl: string): string {
    return new URL(originalUrl, URL_BASE).pathname;
}

/**
 * 남기지 않는 경로 — Swagger 문서(`/<path>` · `/<path>/…` · `/<path>-json` …).
 *
 * @param path 실제 경로
 * @param swaggerPath Swagger 경로(SWAGGER_PATH)
 * @returns 남기지 않으면 true
 */
export function isApiLogExcluded(path: string, swaggerPath: string): boolean {
    const swagger = `/${swaggerPath.replace(/^\/+|\/+$/g, '')}`;
    return path === swagger || path.startsWith(`${swagger}/`) || path.startsWith(`${swagger}-`);
}

/**
 * 응답 조각을 모은다 — res.write · res.end 로 들어온 문자열 · Buffer(콜백 등 그 밖은 버린다).
 *
 * @param chunks 모을 곳
 * @param chunk 조각
 */
export function collectApiLogChunk(chunks: Buffer[], chunk: unknown): void {
    if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
    } else if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
    }
}

/**
 * 파일 전용 — JSON 이면 값, 아니면 문자열 그대로.
 *
 * @param text 문자열
 * @returns 값
 */
function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

/**
 * 파일 전용 — 빈 값(undefined · null · 키 없는 객체)은 null.
 *
 * @param value 값
 * @returns 값 또는 null
 */
function toNullable(value: unknown): unknown {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
        return null;
    }
    return value;
}

/**
 * 파일 전용 — SSE 응답의 마지막 이벤트(`event: x\ndata: {...}\n\n` — transport.util formatSseEvent 형식).
 *
 * @param text SSE 본문
 * @returns 이벤트 또는 null
 */
function parseLastSseEvent(text: string): {event: string; data: unknown} | null {
    const blocks = text.split('\n\n').filter((block) => block.trim() !== '');
    const last = blocks[blocks.length - 1];
    if (!last) {
        return null;
    }
    let event = 'message';
    let data = '';
    for (const line of last.split('\n')) {
        if (line.startsWith('event: ')) {
            event = line.slice('event: '.length);
        } else if (line.startsWith('data: ')) {
            data += line.slice('data: '.length);
        }
    }
    return {event, data: parseJson(data)};
}

/**
 * 파일 전용 — 응답 본문 · 상태. JSON 은 객체, SSE 는 마지막 이벤트(failed 면 그 status_code 를 상태로), 그 밖은 문자열, 없으면 null.
 *
 * @param contentType Content-Type
 * @param text 모은 응답
 * @param statusCode HTTP 상태
 * @returns 상태 · 본문
 */
function toApiLogResponse(contentType: string, text: string, statusCode: number): {status_code: number; response_body: unknown} {
    if (text === '') {
        return {status_code: statusCode, response_body: null};
    }
    if (contentType.includes('text/event-stream')) {
        const event = parseLastSseEvent(text);
        const failed = event?.event === COMMAND_STREAM_EVENT.FAILED ? (event.data as {status_code?: unknown} | null) : null;
        return {status_code: typeof failed?.status_code === 'number' ? failed.status_code : statusCode, response_body: event ?? text};
    }
    if (contentType.includes('application/json')) {
        return {status_code: statusCode, response_body: parseJson(text)};
    }
    return {status_code: statusCode, response_body: text};
}

/**
 * 로그 한 행 — 경로는 맞은 라우트 패턴(없으면 실제 경로), 길이 제한 컬럼은 자른다. 마스킹 없음(beaver memory api-log).
 *
 * @param source 모은 재료
 * @returns 엔티티
 */
export function buildApiLogEntity(source: ApiLogSource): ApiLogEntity {
    const path = typeof source.route_path === 'string' && source.route_path !== '' ? source.route_path : toRequestPath(source.original_url);
    const response = toApiLogResponse(source.content_type, source.response_text, source.status_code);
    const entity = new ApiLogEntity();
    entity.created_at = source.created_at;
    entity.method = source.method;
    entity.path = path.slice(0, API_LOG_PATH_MAX);
    entity.request_param = toNullable(source.params);
    entity.request_query = toNullable(source.query);
    entity.request_body = toNullable(source.body);
    entity.status_code = response.status_code;
    entity.response_body = response.response_body;
    entity.error_stack = typeof source.error_stack === 'string' ? source.error_stack : null;
    entity.user_id = source.user_id;
    entity.ip = source.ip;
    entity.user_agent = source.user_agent === null ? null : source.user_agent.slice(0, API_LOG_USER_AGENT_MAX);
    entity.duration_ms = source.duration_ms;
    return entity;
}
