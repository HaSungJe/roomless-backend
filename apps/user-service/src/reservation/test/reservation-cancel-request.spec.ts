import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    CANCEL_REQUEST_ID,
    cancelRequestEntity,
    createReservationRepositoryMock,
    internalHeaders,
    listRow,
    RESERVATION_ID,
    ReservationRepositoryMock,
    segmentRow,
    USER_ACTOR,
} from './reservation.test-helper.js';

const PATH = `/internal/v1/user-service/reservation/${RESERVATION_ID}/cancel-request`;

/**
 * [CASES:cancel-request] 상태 — 보이는 상태(만료는 읽을 때 계산, 사용자 확정 2026-11-07). 요청 14:00 · 만료 14:10(한국 시각).
 * [이름, 저장된 상태, 지금, 보이는 상태]
 */
const STATE_CASES: [string, string, string, string][] = [
    ['요청 중 · 지금 = 만료 − 1초(14:09:59) → 요청 중(승인 가능)', 'REQUESTED', '2026-11-10T05:09:59Z', 'REQUESTED'],
    ['요청 중 · 지금 = 만료 정각(14:10) → 만료', 'REQUESTED', '2026-11-10T05:10:00Z', 'EXPIRED'],
    ['승인(저장) → 그대로', 'APPROVED', '2026-11-10T05:05:00Z', 'APPROVED'],
    ['거절(저장) → 그대로', 'REJECTED', '2026-11-10T05:05:00Z', 'REJECTED'],
    ['만료(저장 — 새 요청이 만료로 바꿈) → 그대로', 'EXPIRED', '2026-11-10T05:05:00Z', 'EXPIRED'],
];

describe('GET /internal/v1/user-service/reservation/:reservation_id/cancel-request — 내 예약의 이용 중 취소 요청 (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-10T05:05:00Z'));
        repo = createReservationRepositoryMock();
        repo.findMyReservationRow.mockResolvedValue(listRow({reservation_state_id: 'CHECKED_IN', reservation_state_name: '이용 중'}));
        repo.findLatestCancelRequest.mockResolvedValue(cancelRequestEntity());
        repo.findReservationSegmentRows.mockResolvedValue([segmentRow()]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[CASES:cancel-request] 보이는 상태', () => {
        it.each(STATE_CASES)('%s', async (_label, reservation_cancel_request_state_id, now, expected) => {
            vi.setSystemTime(new Date(now));
            repo.findLatestCancelRequest.mockResolvedValueOnce(cancelRequestEntity({reservation_cancel_request_state_id}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body.reservation_cancel_request_state_id).toBe(expected);
        });
    });

    describe('[SUCCESS]', () => {
        it('내 예약 · 마지막 요청 · 구간을 읽어 업체 · 호실 · 사유 · 환불 예정액 · 만료 · 요청 일시', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                reservation_cancel_request_id: CANCEL_REQUEST_ID,
                reservation_cancel_request_state_id: 'REQUESTED',
                store_name: '루미 강남점',
                room_name: '101호',
                cancel_reason: '배관 누수로 객실을 쓸 수 없습니다',
                refund_amount: 30000,
                expires_at: '2026-11-10T05:10:00.000Z',
                created_at: '2026-11-10T05:00:00.000Z',
            });
            expect(repo.findMyReservationRow).toHaveBeenCalledWith(USER_ACTOR.user_id, RESERVATION_ID);
            expect(repo.findLatestCancelRequest).toHaveBeenCalledTimes(1);
            expect(repo.findLatestCancelRequest).toHaveBeenCalledWith({reservation_id: RESERVATION_ID});
            expect(repo.findReservationSegmentRows).toHaveBeenCalledWith(RESERVATION_ID);
        });

        it('환불 예정액은 결제가 끝난 구간만 더한다 — 결제 대기 구간(연장 결제 전)은 빼고, 승인 뒤 환불 신청 · 완료 구간은 넣는다', async () => {
            repo.findReservationSegmentRows.mockResolvedValueOnce([
                segmentRow({price: 30000, payment_state_id: 'REFUND_REQUESTED'}),
                segmentRow({price: 20000, payment_state_id: 'REFUNDED'}),
                segmentRow({price: 10000, reservation_state_id: 'PENDING', payment_state_id: 'READY'}),
            ]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body.refund_amount).toBe(50000);
        });
    });

    describe('[FAIL:service]', () => {
        it('내 예약이 아니면(남의 예약 · 결제 대기 만료) 404, 요청 조회 없음', async () => {
            repo.findMyReservationRow.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '예약을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findLatestCancelRequest).not.toHaveBeenCalled();
        });

        it('요청이 없으면 404 취소 요청이 없습니다, 구간 조회 없음', async () => {
            repo.findLatestCancelRequest.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '취소 요청이 없습니다.', validation_errors: null});
            expect(repo.findReservationSegmentRows).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('예약 ID 가 32자 hex 가 아니면 400 validation_errors.reservation_id, 예약 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/user-service/reservation/xyz/cancel-request').set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '예약 ID가 올바르지 않습니다.', validation_errors: [{property: 'reservation_id', message: '예약 ID가 올바르지 않습니다.'}]});
            expect(repo.findMyReservationRow).not.toHaveBeenCalled();
        });
    });
});
