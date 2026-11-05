import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createDiscoveryRepositoryMock, DiscoveryRepositoryMock, internalHeaders, STORE_ID, storeEntity, storePlanRow} from './discovery.test-helper.js';

const PATH = `/internal/v1/user-service/discovery/store/${STORE_ID}`;

describe('GET /internal/v1/user-service/discovery/store/:store_id — 업체 상세 (동기 경로, 로그인 없음)', () => {
    let app: INestApplication;
    let repo: DiscoveryRepositoryMock;

    beforeEach(async () => {
        repo = createDiscoveryRepositoryMock();
        repo.findStoreImages.mockResolvedValue([
            {store_file_id: '1'.repeat(32), file_key: `store/${STORE_ID}/a.jpg`, sort_order: 0},
            {store_file_id: '2'.repeat(32), file_key: `store/${STORE_ID}/b.png`, sort_order: 1},
        ]);
        repo.findStoreHours.mockResolvedValue([
            {day_of_week: 0, is_closed: 1, open_time: null, close_time: null},
            {day_of_week: 1, is_closed: 0, open_time: '18:00:00', close_time: '06:00:00'},
        ]);
        repo.findStoreBreaks.mockResolvedValue([{start_time: '13:00:00', end_time: '14:00:00'}]);
        repo.findStorePlanRows.mockResolvedValue([storePlanRow('LONG'), storePlanRow('HOURLY'), storePlanRow('NIGHT', {is_used: 0})]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('공개 필드만 — 사업자 정보 · 업체코드 · 정지 사유 · 문 시크릿 · 정비시간 없음, 사진 CDN 주소, 시각 HH:mm, 사용 중인 상품만 시간 이용 → 연박 순', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                store_id: STORE_ID,
                store_name: '루미 강남점',
                phone: '0212345678',
                address: '서울 강남구 테헤란로 1',
                address_detail: '3층',
                latitude: 37.4979,
                longitude: 127.0276,
                introduction: '역에서 1분',
                is_open: 1,
                is_always_open: 0,
                booking_open_hours: 72,
                refund_deadline_minutes: 60,
                late_refund_percent: 50,
                images: [
                    {image_url: `https://cdn.test/store/${STORE_ID}/a.jpg`, sort_order: 0},
                    {image_url: `https://cdn.test/store/${STORE_ID}/b.png`, sort_order: 1},
                ],
                hours: [
                    {day_of_week: 0, is_closed: 1, open_time: null, close_time: null},
                    {day_of_week: 1, is_closed: 0, open_time: '18:00', close_time: '06:00'},
                ],
                breaks: [{start_time: '13:00', end_time: '14:00'}],
                plans: [
                    {room_plan_type_id: 'HOURLY', room_plan_type_name: '시간 이용', days_of_week: 127, usage_hours: 3, check_in_time: null, check_out_time: null, min_nights: null, max_nights: null},
                    {room_plan_type_id: 'LONG', room_plan_type_name: '연박', days_of_week: 127, usage_hours: null, check_in_time: '15:00', check_out_time: '11:00', min_nights: 2, max_nights: 7},
                ],
            });
            expect(repo.findDiscoveryStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: 'ACTIVE'});
            expect(repo.findStoreImages).toHaveBeenCalledWith({store_id: STORE_ID, store_file_purpose_id: 'STORE_IMAGE'});
            expect(repo.findStoreHours).toHaveBeenCalledWith(STORE_ID);
            expect(repo.findStoreBreaks).toHaveBeenCalledWith(STORE_ID);
            expect(repo.findStorePlanRows).toHaveBeenCalledWith(STORE_ID);
        });

        it('영업중 아님(is_open 0)도 상세는 보인다 — is_open 0', async () => {
            repo.findDiscoveryStore.mockResolvedValueOnce(storeEntity({is_open: 0}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.is_open).toBe(0);
        });
    });

    describe('[FAIL:service]', () => {
        it('업체가 없거나 활성이 아니면(지움 · 영업중지 · 탈퇴) 404, 사진 · 영업시간 조회 없음', async () => {
            repo.findDiscoveryStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findStoreImages).not.toHaveBeenCalled();
            expect(repo.findStoreHours).not.toHaveBeenCalled();
            expect(repo.findStorePlanRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('업체 ID 가 32자 hex 가 아니면 400 validation_errors.store_id, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/user-service/discovery/store/xyz').set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '업체 ID가 올바르지 않습니다.', validation_errors: [{property: 'store_id', message: '업체 ID가 올바르지 않습니다.'}]});
            expect(repo.findDiscoveryStore).not.toHaveBeenCalled();
        });
    });
});
