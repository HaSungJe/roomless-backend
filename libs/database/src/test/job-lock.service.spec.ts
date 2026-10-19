import type {DataSource} from 'typeorm';
import {JobLockService} from '@app/database/job-lock/job-lock.service.js';

/**
 * 가짜 QueryRunner — 잠금 결과를 정하고 실행한 SQL 을 기록한다.
 *
 * @param locked pg_try_advisory_lock 결과
 * @returns runner mock
 */
function makeRunner(locked: boolean) {
    return {
        connect: vi.fn().mockResolvedValue(undefined),
        release: vi.fn().mockResolvedValue(undefined),
        query: vi.fn((sql: string) => Promise.resolve(sql.includes('pg_try_advisory_lock') ? [{locked}] : [{unlocked: true}])),
    };
}

/**
 * runner 를 돌려주는 DataSource 로 서비스를 만든다.
 *
 * @param runner runner mock
 * @returns 서비스
 */
function makeService(runner: ReturnType<typeof makeRunner>): JobLockService {
    return new JobLockService({createQueryRunner: () => runner} as unknown as DataSource);
}

describe('JobLockService.runExclusive — 인스턴스 1대만 실행', () => {
    it('[SUCCESS] 잠금을 잡으면 작업을 실행하고, 같은 키로 잠금을 푼 뒤 연결을 반납한다', async () => {
        const runner = makeRunner(true);
        const job = vi.fn().mockResolvedValue(undefined);

        const ran = await makeService(runner).runExclusive('user.leave-cleanup', job);

        expect(ran).toBe(true);
        expect(job).toHaveBeenCalledTimes(1);
        expect(runner.query.mock.calls).toEqual([
            ['SELECT pg_try_advisory_lock(hashtext($1)) AS locked', ['user.leave-cleanup']],
            ['SELECT pg_advisory_unlock(hashtext($1)) AS unlocked', ['user.leave-cleanup']],
        ]);
        expect(runner.connect).toHaveBeenCalledTimes(1);
        expect(runner.release).toHaveBeenCalledTimes(1);
    });

    it('[SKIP] 다른 인스턴스가 잠금을 잡고 있으면 작업을 실행하지 않고 false, 잠금 해제도 하지 않는다', async () => {
        const runner = makeRunner(false);
        const job = vi.fn();

        const ran = await makeService(runner).runExclusive('user.leave-cleanup', job);

        expect(ran).toBe(false);
        expect(job).not.toHaveBeenCalled();
        expect(runner.query).toHaveBeenCalledTimes(1);
        expect(runner.release).toHaveBeenCalledTimes(1);
    });

    it('[FAIL] 작업이 실패해도 잠금을 풀고 연결을 반납한 뒤 예외를 그대로 던진다', async () => {
        const runner = makeRunner(true);
        const job = vi.fn().mockRejectedValue(new Error('작업 실패'));

        await expect(makeService(runner).runExclusive('user.leave-cleanup', job)).rejects.toThrow('작업 실패');

        expect(runner.query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock(hashtext($1)) AS unlocked', ['user.leave-cleanup']);
        expect(runner.release).toHaveBeenCalledTimes(1);
    });
});
