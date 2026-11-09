import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    amountRow,
    bootHttpPath,
    createStatsRepositoryMock,
    internalHeaders,
    MANAGER_ACTOR,
    NOW,
    STORE_A,
    StatsRepositoryMock,
    storeRow,
    usageMonthRow,
    usageStoreRow,
    usageTotalRow,
    zeroSummary,
} from './stats.test-helper.js';

const PATH = '/internal/v1/admin-service/stats/mine';

describe('GET /internal/v1/admin-service/stats/mine — 내 업체 통계 (동기 경로)', () => {
    let app: INestApplication;
    let repo: StatsRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createStatsRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('로그인 매니저의 소속 업체로만 집계 — 필터 store_id = 그 업체, 응답 업체 · 합계 · 월별(업체 목록 없음)', async () => {
            repo.findUsageRows.mockResolvedValueOnce([usageStoreRow(STORE_A, 2, 3), usageMonthRow('2026-10', 2, 3), usageTotalRow(2, 3)]);
            repo.findPaymentRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-10', 45000)]);
            repo.findRefundRows.mockResolvedValueOnce([amountRow(STORE_A, '2026-11', 5000)]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledTimes(1);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id);
            const filter = {from: new Date('2026-08-31T15:00:00.000Z'), to: new Date('2026-11-30T15:00:00.000Z'), environment: 'LIVE', store_id: STORE_A};
            expect(repo.findUsageRows).toHaveBeenCalledWith(filter);
            expect(repo.findPaymentRows).toHaveBeenCalledWith(filter);
            expect(repo.findRefundRows).toHaveBeenCalledWith(filter);
            expect(repo.findStatsStores).not.toHaveBeenCalled();
            expect(res.body).toEqual({
                period: {start_month: '2026-09', end_month: '2026-11', environment: 'LIVE'},
                store: {store_id: STORE_A, store_name: '가업체'},
                total: {user_count: 2, completed_count: 3, paid_amount: 45000, refund_amount: 5000, profit: 40000},
                monthly: [
                    {month: '2026-09', ...zeroSummary()},
                    {month: '2026-10', user_count: 2, completed_count: 3, paid_amount: 45000, refund_amount: 0, profit: 45000},
                    {month: '2026-11', user_count: 0, completed_count: 0, paid_amount: 0, refund_amount: 5000, profit: -5000},
                ],
            });
        });

        it('기간 · 결제 환경 입력 — 2026-01 ~ 2026-02 · TEST 가 필터와 응답 period 에', async () => {
            const res = await request(app.getHttpServer()).get(PATH).query({start_month: '2026-01', end_month: '2026-02', environment: 'TEST'}).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findUsageRows).toHaveBeenCalledWith({from: new Date('2025-12-31T15:00:00.000Z'), to: new Date('2026-02-28T15:00:00.000Z'), environment: 'TEST', store_id: STORE_A});
            expect(res.body.period).toEqual({start_month: '2026-01', end_month: '2026-02', environment: 'TEST'});
            expect(res.body.monthly).toEqual([
                {month: '2026-01', ...zeroSummary()},
                {month: '2026-02', ...zeroSummary()},
            ]);
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체 없음(탈퇴 · 삭제 업체 포함) → 404, 집계 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findUsageRows).not.toHaveBeenCalled();
            expect(repo.findPaymentRows).not.toHaveBeenCalled();
            expect(repo.findRefundRows).not.toHaveBeenCalled();
        });

        it.each([
            ['2025-11 ~ 2026-11(13개월)', {start_month: '2025-11', end_month: '2026-11'}, '기간은 최대 12개월입니다.'],
            ['2026-03 ~ 2026-01(시작 > 끝)', {start_month: '2026-03', end_month: '2026-01'}, '시작 월이 끝 월보다 늦습니다.'],
        ])('%s → 400 validation_errors.start_month, 집계 조회 없음', async (_label, query, message) => {
            const res = await request(app.getHttpServer()).get(PATH).query(query).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property: 'start_month', message}]});
            expect(repo.findUsageRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['시작 월 형식', {start_month: '2026-13'}, 'start_month', '시작 월을 YYYY-MM 으로 입력해주세요.'],
            ['끝 월 형식', {end_month: '2026-1'}, 'end_month', '끝 월을 YYYY-MM 으로 입력해주세요.'],
            ['결제 환경 허용값 밖', {environment: 'REAL'}, 'environment', '결제 환경이 올바르지 않습니다.'],
        ])('%s → 400 validation_errors.%s, 소속 업체 조회 없음', async (_label, query, property, message) => {
            const res = await request(app.getHttpServer()).get(PATH).query(query).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property, message}]);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
