import {Injectable} from '@nestjs/common';
import {InjectDataSource} from '@nestjs/typeorm';
import {DataSource} from 'typeorm';

/** 잠금 SQL — 키 문자열을 hashtext 로 정수 잠금 번호로 바꾼다 */
export const JOB_LOCK_SQL = {TRY: 'SELECT pg_try_advisory_lock(hashtext($1)) AS locked', UNLOCK: 'SELECT pg_advisory_unlock(hashtext($1)) AS unlocked'} as const;

/**
 * 인스턴스가 여러 대여도 작업은 1대만 실행하게 하는 잠금 — PostgreSQL 세션 advisory lock.
 *
 * - 스케줄러(crontab)처럼 모든 인스턴스가 같은 시각에 깨어나는 작업을 감싼다. 잠금을 못 잡은 인스턴스는 그 회차를 건너뛴다.
 * - 잠금은 전용 DB 연결 1개에 묶인다. 작업이 끝나면 풀고 연결을 반납하며, 인스턴스가 죽어 연결이 끊기면 DB 가 자동으로 푼다.
 * - 작업 자체는 이 연결이 아니라 평소처럼 repository(txHost.tx)로 실행한다.
 * - 잠금은 동시 실행만 막는다. 앞 인스턴스가 끝난 직후 다른 인스턴스가 잡을 수 있으므로, 작업은 상태 조건으로 대상을 고르는 등
 *   두 번 돌아도 결과가 같아야 한다.
 */
@Injectable()
export class JobLockService {
    /**
     * @param dataSource 기본 DataSource
     */
    constructor(
        @InjectDataSource()
        private readonly dataSource: DataSource,
    ) {}

    /**
     * 잠금을 잡으면 작업을 실행하고 true, 다른 인스턴스가 잡고 있으면 실행하지 않고 false.
     * 작업이 던진 예외는 잠금을 푼 뒤 그대로 다시 던진다.
     *
     * @param key 작업 잠금 키 (`<domain>.<작업>`)
     * @param job 실행할 작업
     * @returns 이번 인스턴스가 실행했는지
     */
    async runExclusive(key: string, job: () => Promise<void>): Promise<boolean> {
        const runner = this.dataSource.createQueryRunner();
        await runner.connect();
        try {
            const rows: {locked: boolean}[] = await runner.query(JOB_LOCK_SQL.TRY, [key]);
            if (rows[0]?.locked !== true) {
                return false;
            }
            try {
                await job();
                return true;
            } finally {
                await runner.query(JOB_LOCK_SQL.UNLOCK, [key]);
            }
        } finally {
            await runner.release();
        }
    }
}
