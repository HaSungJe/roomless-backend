/** 대기 시간 초과 안내 */
export const COMMAND_PENDING_MESSAGE = '처리 중입니다. 잠시 후 결과를 확인해주세요.';

/** 내부 서비스 접속 실패 안내 */
export const SERVICE_UNAVAILABLE_MESSAGE = '일시적으로 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.';

/** 큐 경로 응답 스트림의 기본 대기 시간 (ms) */
export const DEFAULT_COMMAND_STREAM_TIMEOUT_MS = 30_000;

/** 내부 HTTP 기본 타임아웃 (ms) */
export const DEFAULT_INTERNAL_HTTP_TIMEOUT_MS = 10_000;

/**
 * SSE 이벤트 1건을 직렬화한다.
 *
 * @param event 이벤트 이름
 * @param data 본문 (JSON 직렬화)
 * @returns `event: <이름>\ndata: <JSON>\n\n`
 */
export function formatSseEvent(event: string, data: unknown): string {
    return `event: ${event}\ndata: ${JSON.stringify(data ?? null)}\n\n`;
}

/**
 * 양의 정수 환경변수를 읽는다. 없거나 잘못된 값이면 기본값.
 *
 * @param value 환경변수 값
 * @param fallback 기본값
 * @returns 정수
 */
export function readPositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
