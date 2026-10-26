import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {MoreThan} from 'typeorm';
import {bootHttpPath, createStoreRepositoryMock, FIXED_TIME, internalHeaders, MANAGER_ACTOR, periodRow, STORE_ID, StoreRepositoryMock, storeRow} from './store.test-helper.js';

const PATH = '/internal/v1/admin-service/store/mine/unavailable-period';
const NOW = new Date('2026-11-01T00:00:00.000Z');

describe('GET /internal/v1/admin-service/store/mine/unavailable-period — 내 업체 일시 예약불가 목록 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: StoreRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(NOW);
        repo = createStoreRepositoryMock();
        repo.findStoreByManager.mockResolvedValue(storeRow());
        repo.countUnavailablePeriods.mockResolvedValue(1);
        repo.findUnavailablePeriodList.mockResolvedValue([periodRow()]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('끝나지 않은 것(종료 > 지금)만 같은 WHERE 로 세고 기본 페이지로 시작 순 목록을 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            const where = {store_id: STORE_ID, ends_at: MoreThan(NOW)};
            expect(res.status).toBe(200);
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.countUnavailablePeriods).toHaveBeenCalledWith(where);
            expect(repo.findUnavailablePeriodList).toHaveBeenCalledWith(where, 20, 0);
            expect(res.body).toEqual({
                list: [{store_unavailable_period_id: '9'.repeat(32), starts_at: '2026-11-02T00:00:00.000Z', ends_at: '2026-11-02T09:00:00.000Z', memo: null, created_at: FIXED_TIME.toISOString()}],
                pagination: expect.objectContaining({total_count: 1, page: 1}),
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 404, 개수 · 목록 조회 없음', async () => {
            repo.findStoreByManager.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.countUnavailablePeriods).not.toHaveBeenCalled();
            expect(repo.findUnavailablePeriodList).not.toHaveBeenCalled();
        });
    });
});
