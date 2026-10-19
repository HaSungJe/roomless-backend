import {retry} from '@app/common/utils/retry.js';

describe('retry — 준비될 때까지 다시 시도', () => {
    it('[SUCCESS] 첫 시도에 성공하면 그 결과를 돌려주고 재시도 콜백은 부르지 않는다', async () => {
        const fn = vi.fn().mockResolvedValue('ok');
        const onRetry = vi.fn();

        await expect(retry(fn, {attempts: 3, delay_ms: 0, on_retry: onRetry})).resolves.toBe('ok');

        expect(fn).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it('[SUCCESS] 실패하다 성공하면 그 결과를 돌려주고, 실패할 때마다 오류와 시도 번호로 콜백을 부른다', async () => {
        const first = new Error('연결 거부 1');
        const second = new Error('연결 거부 2');
        const fn = vi.fn().mockRejectedValueOnce(first).mockRejectedValueOnce(second).mockResolvedValueOnce('ok');
        const onRetry = vi.fn();

        await expect(retry(fn, {attempts: 5, delay_ms: 0, on_retry: onRetry})).resolves.toBe('ok');

        expect(fn).toHaveBeenCalledTimes(3);
        expect(onRetry.mock.calls).toEqual([
            [first, 1],
            [second, 2],
        ]);
    });

    it('[FAIL] 모두 실패하면 attempts 번 시도한 뒤 마지막 오류를 던진다', async () => {
        const fn = vi.fn().mockRejectedValueOnce(new Error('1')).mockRejectedValueOnce(new Error('2')).mockRejectedValueOnce(new Error('마지막'));
        const onRetry = vi.fn();

        await expect(retry(fn, {attempts: 3, delay_ms: 0, on_retry: onRetry})).rejects.toThrow('마지막');

        expect(fn).toHaveBeenCalledTimes(3);
        expect(onRetry).toHaveBeenCalledTimes(2);
    });

    it('[SUCCESS] 실패 후 delay_ms 만큼 기다린 뒤 다시 시도한다', async () => {
        vi.useFakeTimers();
        try {
            const fn = vi.fn().mockRejectedValueOnce(new Error('대기')).mockResolvedValueOnce('ok');

            const pending = retry(fn, {attempts: 2, delay_ms: 2000});
            await vi.advanceTimersByTimeAsync(1999);
            expect(fn).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(1);

            await expect(pending).resolves.toBe('ok');
            expect(fn).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });
});
