import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createReservationRepositoryMock, DETAIL_ID, internalHeaders, listRow, PAYMENT_ID, RESERVATION_ID, ReservationRepositoryMock, USER_ACTOR} from './reservation.test-helper.js';

const PATH = `/internal/v1/user-service/reservation/${RESERVATION_ID}`;

describe('GET /internal/v1/user-service/reservation/:reservation_id — 내 예약 상세 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        repo = createReservationRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    it('[SUCCESS] 예약 + 마감 뒤 비율 · 취소 정보 + 구간 · 결제', async () => {
        repo.findMyReservationRow.mockResolvedValueOnce(listRow());
        repo.findReservationSegmentRows.mockResolvedValueOnce([
            {
                reservation_detail_id: DETAIL_ID,
                reservation_detail_type_id: 'BASE',
                reservation_detail_type_name: '기본',
                reservation_state_id: 'CONFIRMED',
                start_at: new Date('2026-11-10T04:00:00Z'),
                end_at: new Date('2026-11-10T07:00:00Z'),
                price: 30000,
                expires_at: new Date('2026-11-03T00:05:00Z'),
                payment_id: PAYMENT_ID,
                payment_state_id: 'DONE',
                payment_state_name: '결제 완료',
                amount: 30000,
                method: '카드',
                approved_at: new Date('2026-11-03T00:01:00Z'),
                receipt_url: 'https://receipt.test/1',
                refund_amount: null,
                refunded_at: null,
            },
        ]);

        const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

        expect(res.status).toBe(200);
        expect(repo.findMyReservationRow).toHaveBeenCalledWith(USER_ACTOR.user_id, RESERVATION_ID);
        expect(repo.findReservationSegmentRows).toHaveBeenCalledWith(RESERVATION_ID);
        expect(res.body).toMatchObject({reservation_id: RESERVATION_ID, late_refund_percent: 50, canceled_at: null, cancel_actor: null, cancel_reason: null});
        expect(res.body.segments).toEqual([
            {
                reservation_detail_id: DETAIL_ID,
                reservation_detail_type_id: 'BASE',
                reservation_detail_type_name: '기본',
                reservation_state_id: 'CONFIRMED',
                start_at: '2026-11-10T04:00:00.000Z',
                end_at: '2026-11-10T07:00:00.000Z',
                price: 30000,
                expires_at: '2026-11-03T00:05:00.000Z',
                payment: {
                    payment_id: PAYMENT_ID,
                    payment_state_id: 'DONE',
                    payment_state_name: '결제 완료',
                    amount: 30000,
                    method: '카드',
                    approved_at: '2026-11-03T00:01:00.000Z',
                    receipt_url: 'https://receipt.test/1',
                    refund_amount: null,
                    refunded_at: null,
                },
            },
        ]);
    });

    it('[FAIL:service] 남의 예약 · 결제 대기 만료 건(행 없음)은 404, 구간 조회 없음', async () => {
        const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

        expect(res.status).toBe(404);
        expect(res.body).toEqual({message: '예약을 찾을 수 없습니다.', validation_errors: null});
        expect(repo.findReservationSegmentRows).not.toHaveBeenCalled();
    });

    it('[FAIL:validation] 예약 ID 형식이 아니면 400', async () => {
        const res = await request(app.getHttpServer()).get('/internal/v1/user-service/reservation/xyz').set(internalHeaders(USER_ACTOR));

        expect(res.status).toBe(400);
        expect(res.body.validation_errors).toEqual([{property: 'reservation_id', message: '예약 ID가 올바르지 않습니다.'}]);
    });
});
