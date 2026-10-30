import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    breakRow,
    createStorageGatewayMock,
    createStoreRepositoryMock,
    fileRow,
    FIXED_TIME,
    hourRow,
    imageRow,
    internalHeaders,
    MANAGER_ACTOR,
    STORE_CODE,
    STORE_ID,
    StorageGatewayMock,
    StoreRepositoryMock,
    storeRow,
} from './store.test-helper.js';

const PATH = '/internal/v1/admin-service/store/mine';
const IMAGE_KEY = `store/${STORE_ID}/${'2'.repeat(32)}.jpg`;
const LICENSE_KEY = `private/store-application/${'a'.repeat(32)}/${'1'.repeat(32)}.jpg`;

describe('GET /internal/v1/admin-service/store/mine — 내 업체 상세 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: StoreRepositoryMock;
    let storage: StorageGatewayMock;

    beforeEach(async () => {
        repo = createStoreRepositoryMock();
        storage = createStorageGatewayMock();
        repo.findStoreByManager.mockResolvedValue(
            storeRow({introduction: '소개', is_open: 1, maintenance_minutes: 30, booking_open_hours: 24, refund_deadline_hours: 2, store_state_id: 'SUSPEND', suspend_comment: '민원 접수'}),
        );
        repo.findStoreHours.mockResolvedValue([hourRow({day_of_week: 0, is_closed: 1, open_time: null, close_time: null}), hourRow({day_of_week: 1})]);
        repo.findStoreBreaks.mockResolvedValue([breakRow()]);
        repo.findStoreFileRows.mockResolvedValue([fileRow({store_id: STORE_ID, file_key: LICENSE_KEY}), imageRow({store_file_id: 'c'.repeat(32), file_key: IMAGE_KEY, sort_order: 1})]);
        app = await bootHttpPath(repo, storage);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('actor 로 소속 업체를 찾아 업체 정보 · 영업시간(HH:mm, 휴무 null) · 브레이크타임 · 파일 열람 주소(비공개 서명 · 공개 CDN)를 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findStoreByManager).toHaveBeenCalledTimes(1);
            expect(repo.findStoreByManager).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findStoreHours).toHaveBeenCalledWith(STORE_ID);
            expect(repo.findStoreBreaks).toHaveBeenCalledWith(STORE_ID);
            expect(repo.findStoreFileRows).toHaveBeenCalledWith(STORE_ID);
            expect(storage.createDownloadUrl).toHaveBeenCalledWith(LICENSE_KEY);
            expect(storage.getPublicUrl).toHaveBeenCalledWith(IMAGE_KEY);
            expect(res.body).toEqual({
                store_id: STORE_ID,
                store_code: STORE_CODE,
                store_state_id: 'SUSPEND',
                store_name: '룸리스 강남점',
                business_number: '1234567890',
                owner_name: '홍길동',
                phone: '0212345678',
                address: '서울시 강남구',
                address_detail: null,
                latitude: 37.4979,
                longitude: 127.0276,
                introduction: '소개',
                is_always_open: 0,
                is_open: 1,
                maintenance_minutes: 30,
                booking_open_hours: 24,
                refund_deadline_hours: 2,
                suspend_comment: '민원 접수',
                hours: [
                    {day_of_week: 0, is_closed: 1, open_time: null, close_time: null},
                    {day_of_week: 1, is_closed: 0, open_time: '09:00', close_time: '18:00'},
                ],
                breaks: [{store_break_id: 'e'.repeat(32), start_time: '12:00', end_time: '13:00'}],
                files: [
                    {
                        store_file_id: 'f'.repeat(32),
                        store_file_purpose_id: 'BUSINESS_LICENSE',
                        file_name: '사업자등록증.jpg',
                        content_type: 'image/jpeg',
                        is_private: 1,
                        file_url: `https://s3.test/signed/${LICENSE_KEY}`,
                        sort_order: 0,
                        created_at: FIXED_TIME.toISOString(),
                    },
                    {
                        store_file_id: 'c'.repeat(32),
                        store_file_purpose_id: 'STORE_IMAGE',
                        file_name: '사진.jpg',
                        content_type: 'image/jpeg',
                        is_private: 0,
                        file_url: `https://cdn.test/${IMAGE_KEY}`,
                        sort_order: 1,
                        created_at: FIXED_TIME.toISOString(),
                    },
                ],
                updated_at: FIXED_TIME.toISOString(),
            });
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면(탈퇴 업체 포함) 404, 영업시간 · 파일 조회 없음', async () => {
            repo.findStoreByManager.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findStoreHours).not.toHaveBeenCalled();
            expect(repo.findStoreFileRows).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH);

            expect(res.status).toBe(403);
            expect(repo.findStoreByManager).not.toHaveBeenCalled();
        });
    });
});
