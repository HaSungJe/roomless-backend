/** retry 옵션 */
export interface RetryOptions {
    /** 최대 시도 횟수 (첫 시도 포함, 1 이상) */
    attempts: number;
    /** 실패 후 다음 시도까지 기다릴 시간(ms) */
    delay_ms: number;
    /** 다시 시도하기 직전에 호출 — 대기 로그용 */
    on_retry?: (error: unknown, attempt: number) => void;
}

/**
 * 실패하면 delay_ms 간격으로 최대 attempts 번까지 다시 시도한다. 모두 실패하면 마지막 오류를 그대로 던진다.
 * 따로 띄운 컨테이너(DB 등)가 아직 준비되지 않았을 때 기다리는 용도.
 *
 * @param fn 시도할 작업
 * @param options 시도 횟수 · 간격 · 재시도 콜백
 * @returns 성공한 시도의 결과
 */
export async function retry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
    const attempts = Math.max(1, options.attempts);
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt >= attempts) {
                throw error;
            }
            options.on_retry?.(error, attempt);
            await new Promise((resolve) => setTimeout(resolve, options.delay_ms));
        }
    }
}
