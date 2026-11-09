import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {In} from 'typeorm';
import {
    amountRow,
    bootHttpPath,
    createStatsRepositoryMock,
    internalHeaders,
    NOW,
    STORE_A,
    STORE_B,
    STORE_C,
    StatsRepositoryMock,
    storeRow,
    usageMonthRow,
    usageStoreRow,
    usageTotalRow,
    zeroSummary,
} from './stats.test-helper.js';

const PATH = '/internal/v1/admin-service/stats';

describe('GET /internal/v1/admin-service/stats — 전체 통계 (동기 경로)', () => {
    let app: INestApplication;
    let repo: StatsRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createStatsRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[CASES:stats-period] 기간 — 지금 2026-11-09 12:00(한국)', () => {
        it.each([
            ['입력 없음 → 이번 달 포함 3개월', {}, ['2026-09', '2026-10', '2026-11'], '2026-08-31T15:00:00.000Z', '2026-11-30T15:00:00.000Z'],
            ['끝만 2026-06 → 끝 − 2개월부터', {end_month: '2026-06'}, ['2026-04', '2026-05', '2026-06'], '2026-03-31T15:00:00.000Z', '2026-06-30T15:00:00.000Z'],
            [
                '시작만 2026-01 → 이번 달까지 11개월',
                {start_month: '2026-01'},
                ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
                '2025-12-31T15:00:00.000Z',
                '2026-11-30T15:00:00.000Z',
            ],
            [
                '2025-11 ~ 2026-02 → 연도를 넘겨 4개월',
                {start_month: '2025-11', end_month: '2026-02'},
                ['2025-11', '2025-12', '2026-01', '2026-02'],
                '2025-10-31T15:00:00.000Z',
                '2026-02-28T15:00:00.000Z',
            ],
            [
                '2025-12 ~ 2026-11 → 12개월(경계) 통과',
                {start_month: '2025-12', end_month: '2026-11'},
                ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'],
                '2025-11-30T15:00:00.000Z',
                '2026-11-30T15:00:00.000Z',
            ],
            ['같은 달 2026-11 ~ 2026-11 → 1개월', {start_month: '2026-11', end_month: '2026-11'}, ['2026-11'], '2026-10-31T15:00:00.000Z', '2026-11-30T15:00:00.000Z'],
        ])('%s', async (_label, query, months, from, to) => {
            const res = await request(app.getHttpServer()).get(PATH).query(query).set(internalHeaders());

            expect(res.status).toBe(200);
            const filter = {from: new Date(from), to: new Date(to), environment: 'LIVE', store_id: null};
            expect(repo.findUsageRows).toHaveBeenCalledTimes(1);
            expect(repo.findUsageRows).toHaveBeenCalledWith(filter);
            expect(repo.findPaymentRows).toHaveBeenCalledWith(filter);
            expect(repo.findRefundRows).toHaveBeenCalledWith(filter);
            expect(res.body.period).toEqual({start_month: months[0], end_month: months[months.length - 1], environment: 'LIVE'});
            expect(res.body.monthly.map((month: {month: string}) => month.month)).toEqual(months);
        });

        it('이번 달은 한국 시각 — 2026-10-31 16:00 UTC(한국 11-01 01:00)면 끝 월 2026-11', async () => {
            vi.setSystemTime(new Date('2026-10-31T16:00:00Z'));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.period).toEqual({start_month: '2026-09', end_month: '2026-11', environment: 'LIVE'});
            expect(repo.findUsageRows).toHaveBeenCalledWith({from: new Date('2026-08-31T15:00:00.000Z'), to: new Date('2026-11-30T15:00:00.000Z'), environment: 'LIVE', store_id: null});
        });

        it.each([
            ['2025-11 ~ 2026-11(13개월)', {start_month: '2025-11', end_month: '2026-11'}, '기간은 최대 12개월입니다.'],
            ['2026-03 ~ 2026-01(시작 > 끝)', {start_month: '2026-03', end_month: '2026-01'}, '시작 월이 끝 월보다 늦습니다.'],
        ])('%s → 400 validation_errors.start_month, 집계 조회 없음', async (_label, query, message) => {
            const res = await request(app.getHttpServer()).get(PATH).query(query).set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property: 'start_month', message}]});
            expect(repo.findUsageRows).not.toHaveBeenCalled();
            expect(repo.findPaymentRows).not.toHaveBeenCalled();
            expect(repo.findRefundRows).not.toHaveBeenCalled();
            expect(repo.findStatsStores).not.toHaveBeenCalled();
        });
    });

    describe('[CASES:stats-aggregate] 모으기 — 기간 2026-09 ~ 2026-11', () => {
        it('집계 행 없음 → 합계 0, 월별은 기간의 모든 달 0, 업체 목록 빈 배열(업체 조회 없음)', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.total).toEqual(zeroSummary());
            expect(res.body.monthly).toEqual([
                {month: '2026-09', ...zeroSummary()},
                {month: '2026-10', ...zeroSummary()},
                {month: '2026-11', ...zeroSummary()},
            ]);
            expect(res.body.stores.list).toEqual([]);
            expect(res.body.stores.pagination).toMatchObject({total_count: 0, page: 1});
            expect(repo.findStatsStores).not.toHaveBeenCalled();
        });

        it('한 업체 결제 30,000 · 환불 15,000 → 결제액 30,000 · 환불액 15,000 · 수익 15,000(합계 · 그 달 · 그 업체)', async () => {
            repo.findPaymentRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-10', 30000)]);
            repo.findRefundRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-10', 15000)]);
            repo.findStatsStores.mockResolvedValueOnce([storeRow()]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            const amounts = {user_count: 0, completed_count: 0, paid_amount: 30000, refund_amount: 15000, profit: 15000};
            expect(res.status).toBe(200);
            expect(res.body.total).toEqual(amounts);
            expect(res.body.monthly[1]).toEqual({month: '2026-10', ...amounts});
            expect(res.body.stores.list).toEqual([{store_id: STORE_A, store_name: '가업체', store_code: 'k'.repeat(32), store_state_id: 'ACTIVE', ...amounts}]);
        });

        it('업체 A 이용자 2 · 업체 B 이용자 2 · 전체(중복 제거) 3 → 합계 이용자 수 3, 업체별 2 · 2(합계를 업체별에서 더하지 않는다)', async () => {
            repo.findUsageRows.mockResolvedValueOnce([usageStoreRow(STORE_A, 2, 2), usageStoreRow(STORE_B, 2, 3), usageMonthRow('2026-10', 3, 5), usageTotalRow(3, 5)]);
            repo.findStatsStores.mockResolvedValueOnce([storeRow(), storeRow({store_id: STORE_B, store_name: '나업체'})]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.total).toEqual({...zeroSummary(), user_count: 3, completed_count: 5});
            expect(res.body.monthly[1]).toEqual({month: '2026-10', ...zeroSummary(), user_count: 3, completed_count: 5});
            expect(res.body.stores.list.map((store: {store_id: string; user_count: number; completed_count: number}) => [store.store_id, store.user_count, store.completed_count])).toEqual([
                [STORE_A, 2, 2],
                [STORE_B, 2, 3],
            ]);
        });

        it('10월만 활동 → 9월 · 11월은 0 으로 채우고 오래된 달부터', async () => {
            repo.findUsageRows.mockResolvedValueOnce([usageStoreRow(STORE_A, 1, 1), usageMonthRow('2026-10', 1, 1), usageTotalRow(1, 1)]);
            repo.findPaymentRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-10', 20000)]);
            repo.findStatsStores.mockResolvedValueOnce([storeRow()]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.monthly).toEqual([
                {month: '2026-09', ...zeroSummary()},
                {month: '2026-10', user_count: 1, completed_count: 1, paid_amount: 20000, refund_amount: 0, profit: 20000},
                {month: '2026-11', ...zeroSummary()},
            ]);
        });

        it('업체 수익 다업체 10,000 · 나업체 30,000 · 가업체 30,000 → 가업체 · 나업체(같은 수익은 상호명 순) · 다업체', async () => {
            repo.findPaymentRows.mockResolvedValueOnce([amountRow(STORE_C, '2026-10', 10000), amountRow(STORE_B, '2026-10', 30000), amountRow(STORE_A, '2026-11', 30000)]);
            repo.findStatsStores.mockResolvedValueOnce([
                storeRow({store_id: STORE_C, store_name: '다업체'}),
                storeRow({store_id: STORE_B, store_name: '나업체'}),
                storeRow({store_id: STORE_A, store_name: '가업체'}),
            ]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.stores.list.map((store: {store_name: string; profit: number}) => [store.store_name, store.profit])).toEqual([
                ['가업체', 30000],
                ['나업체', 30000],
                ['다업체', 10000],
            ]);
            expect(res.body.total).toMatchObject({paid_amount: 70000, profit: 70000});
        });

        it('환불만 있는 업체(결제는 기간 밖) → 수익 음수 그대로', async () => {
            repo.findRefundRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-09', 20000)]);
            repo.findStatsStores.mockResolvedValueOnce([storeRow()]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            const amounts = {user_count: 0, completed_count: 0, paid_amount: 0, refund_amount: 20000, profit: -20000};
            expect(res.status).toBe(200);
            expect(res.body.total).toEqual(amounts);
            expect(res.body.monthly[0]).toEqual({month: '2026-09', ...amounts});
            expect(res.body.stores.list[0]).toMatchObject(amounts);
        });

        it("집계 값이 문자열('3' · '30000' — PostgreSQL count · sum · GROUPING) → 숫자로", async () => {
            repo.findUsageRows.mockResolvedValueOnce([
                {store_id: STORE_A, month: null, grouping_store: '0', grouping_month: '1', user_count: '3', completed_count: '4'},
                {store_id: null, month: '2026-11', grouping_store: '1', grouping_month: '0', user_count: '3', completed_count: '4'},
                {store_id: null, month: null, grouping_store: '1', grouping_month: '1', user_count: '3', completed_count: '4'},
            ]);
            repo.findPaymentRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-11', '30000')]);
            repo.findRefundRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-11', '5000')]);
            repo.findStatsStores.mockResolvedValueOnce([storeRow()]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            const values = {user_count: 3, completed_count: 4, paid_amount: 30000, refund_amount: 5000, profit: 25000};
            expect(res.status).toBe(200);
            expect(res.body.total).toStrictEqual(values);
            expect(res.body.monthly[2]).toStrictEqual({month: '2026-11', ...values});
            expect(res.body.stores.list[0]).toMatchObject(values);
        });
    });

    describe('[SUCCESS] 업체 범위 · 결제 환경 · 페이지', () => {
        it('기본(활동 있는 업체만) — 이용 · 결제 · 환불에 나온 업체 ID 를 중복 없이 In 으로 조회', async () => {
            repo.findUsageRows.mockResolvedValueOnce([usageStoreRow(STORE_A, 1, 1), usageMonthRow('2026-10', 1, 1), usageTotalRow(1, 1)]);
            repo.findPaymentRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-10', 10000), amountRow(STORE_B, '2026-10', 10000)]);
            repo.findRefundRows.mockResolvedValueOnce([amountRow(STORE_C, '2026-11', 5000), amountRow(STORE_A, '2026-11', 5000)]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(repo.findStatsStores).toHaveBeenCalledTimes(1);
            expect(repo.findStatsStores).toHaveBeenCalledWith({store_id: In([STORE_A, STORE_B, STORE_C])});
        });

        it('모든 업체(has_activity 0) — 조건 없이 조회하고 활동 없는 업체도 0 으로 목록에', async () => {
            repo.findPaymentRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-10', 10000)]);
            repo.findStatsStores.mockResolvedValueOnce([storeRow({store_id: STORE_B, store_name: '나업체'}), storeRow()]);

            const res = await request(app.getHttpServer()).get(PATH).query({has_activity: '0'}).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(repo.findStatsStores).toHaveBeenCalledWith({});
            expect(res.body.stores.list).toEqual([
                {store_id: STORE_A, store_name: '가업체', store_code: 'k'.repeat(32), store_state_id: 'ACTIVE', user_count: 0, completed_count: 0, paid_amount: 10000, refund_amount: 0, profit: 10000},
                {store_id: STORE_B, store_name: '나업체', store_code: 'k'.repeat(32), store_state_id: 'ACTIVE', ...zeroSummary()},
            ]);
            expect(res.body.stores.pagination).toMatchObject({total_count: 2});
        });

        it('결제 환경 TEST — 세 집계의 필터와 응답 period 에', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({environment: 'TEST'}).set(internalHeaders());

            expect(res.status).toBe(200);
            const filter = {from: new Date('2026-08-31T15:00:00.000Z'), to: new Date('2026-11-30T15:00:00.000Z'), environment: 'TEST', store_id: null};
            expect(repo.findUsageRows).toHaveBeenCalledWith(filter);
            expect(repo.findPaymentRows).toHaveBeenCalledWith(filter);
            expect(repo.findRefundRows).toHaveBeenCalledWith(filter);
            expect(res.body.period).toEqual({start_month: '2026-09', end_month: '2026-11', environment: 'TEST'});
        });

        it('업체 목록 페이지 — size 1 · page 2 면 수익 순 두 번째 업체, total_count = 업체 수', async () => {
            repo.findPaymentRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-10', 30000), amountRow(STORE_B, '2026-10', 10000)]);
            repo.findStatsStores.mockResolvedValueOnce([storeRow(), storeRow({store_id: STORE_B, store_name: '나업체'})]);

            const res = await request(app.getHttpServer()).get(PATH).query({size: 1, page: 2}).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.stores.list.map((store: {store_id: string}) => store.store_id)).toEqual([STORE_B]);
            expect(res.body.stores.pagination).toMatchObject({total_count: 2, page: 2, max_page: 2});
            expect(res.body.total).toMatchObject({paid_amount: 40000});
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['시작 월 13월', {start_month: '2026-13'}, 'start_month', '시작 월을 YYYY-MM 으로 입력해주세요.'],
            ['시작 월 한 자리 달', {start_month: '2026-1'}, 'start_month', '시작 월을 YYYY-MM 으로 입력해주세요.'],
            ['끝 월 구분자 없음', {end_month: '202611'}, 'end_month', '끝 월을 YYYY-MM 으로 입력해주세요.'],
            ['결제 환경 허용값 밖', {environment: 'REAL'}, 'environment', '결제 환경이 올바르지 않습니다.'],
            ['업체 범위 허용값 밖', {has_activity: '2'}, 'has_activity', '업체 범위가 올바르지 않습니다.'],
        ])('%s → 400 validation_errors.%s, 집계 조회 없음', async (_label, query, property, message) => {
            const res = await request(app.getHttpServer()).get(PATH).query(query).set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property, message}]);
            expect(repo.findUsageRows).not.toHaveBeenCalled();
        });
    });

    it('[FAIL:internal] 내부 토큰 없이 호출하면 403, 집계 조회 없음', async () => {
        const res = await request(app.getHttpServer()).get(PATH);

        expect(res.status).toBe(403);
        expect(repo.findUsageRows).not.toHaveBeenCalled();
    });
});
