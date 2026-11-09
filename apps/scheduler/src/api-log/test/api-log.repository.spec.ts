import {InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {ApiLogRepository} from '../repositories/api-log.repository.js';

/**
 * txHost.tx(EntityManager)의 query 만 흉내 낸다 — DDL 을 실행하지 않고 받은 SQL 을 가로챈다.
 *
 * @returns 저장소와 가짜 query
 */
function makeRepository() {
    const query = vi.fn().mockResolvedValue([]);
    const repository = new ApiLogRepository({tx: {query}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    return {repository, query};
}

describe('[SMOKE:data-access] ApiLogRepository(scheduler).createPartition — 월 파티션 DDL', () => {
    it.each([
        [
            '2026-11 — 한국 달 1일 00:00 경계',
            {name: 't_api_log_202611', from: '2026-11-01T00:00:00+09:00', to: '2026-12-01T00:00:00+09:00'},
            `CREATE TABLE IF NOT EXISTS "t_api_log_202611" PARTITION OF "t_api_log" FOR VALUES FROM ('2026-11-01T00:00:00+09:00') TO ('2026-12-01T00:00:00+09:00')`,
        ],
        [
            '2026-12 — 연도를 넘기는 끝 경계',
            {name: 't_api_log_202612', from: '2026-12-01T00:00:00+09:00', to: '2027-01-01T00:00:00+09:00'},
            `CREATE TABLE IF NOT EXISTS "t_api_log_202612" PARTITION OF "t_api_log" FOR VALUES FROM ('2026-12-01T00:00:00+09:00') TO ('2027-01-01T00:00:00+09:00')`,
        ],
    ])('%s → 이미 있으면 그대로(IF NOT EXISTS)인 DDL 을 1번 실행', async (_label, partition, sql) => {
        const {repository, query} = makeRepository();

        await repository.createPartition(partition);

        expect(query).toHaveBeenCalledTimes(1);
        expect(query).toHaveBeenCalledWith(sql);
    });

    it('[FAIL:repository] 실행 실패(그 달 행이 기본 파티션에 있음 등)는 통일 500', async () => {
        const {repository, query} = makeRepository();
        query.mockRejectedValueOnce(new Error('updated partition constraint for default partition would be violated'));

        await expect(repository.createPartition({name: 't_api_log_202611', from: '2026-11-01T00:00:00+09:00', to: '2026-12-01T00:00:00+09:00'})).rejects.toBeInstanceOf(InternalServerErrorException);
    });
});
