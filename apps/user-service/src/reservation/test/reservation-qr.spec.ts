import {INestApplication, ServiceUnavailableException} from '@nestjs/common';
import request from 'supertest';
import {In} from 'typeorm';
import {RoomQrEntity} from '@app/database/entities/door/room-qr.entity.js';
import {ReservationEntity} from '@app/database/entities/reservation/reservation.entity.js';
import {RoomEntity} from '@app/database/entities/room/room.entity.js';
import {
    bootHttpPath,
    createDoorStoreMock,
    createReservationRepositoryMock,
    DoorStoreMock,
    ID_PATTERN,
    internalHeaders,
    QR,
    RESERVATION_ID,
    reservationEntity,
    ReservationRepositoryMock,
    ROOM_ID,
    roomQrEntity,
    USER_ACTOR,
} from './reservation.test-helper.js';

const PATH = `/internal/v1/user-service/reservation/${RESERVATION_ID}/qr`;

/** 이용 10:00 ~ 13:00(한국 시각) — 2026-11-10 */
const HOURLY = {start_at: new Date('2026-11-10T01:00:00Z'), end_at: new Date('2026-11-10T04:00:00Z')};

/** 1박 22:00 ~ 다음 날 09:00(한국 시각) */
const NIGHT = {room_plan_type_id: 'NIGHT', start_at: new Date('2026-11-10T13:00:00Z'), end_at: new Date('2026-11-11T00:00:00Z')};

/** QR 행 — 유효 = 이용 구간 */
const HOURLY_QR = {starts_at: HOURLY.start_at, ends_at: HOURLY.end_at};

/** 이용 시간 밖 메시지 */
const OUT_OF_TIME = 'QR 은 이용 시간에만 볼 수 있습니다.';

/** QR 을 볼 수 없는 예약 메시지 */
const NO_QR = 'QR 을 볼 수 없는 예약입니다.';

describe('GET /internal/v1/user-service/reservation/:reservation_id/qr — 내 예약 QR (동기 경로)', () => {
    let app: INestApplication;
    let repo: ReservationRepositoryMock;
    let door: DoorStoreMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        repo = createReservationRepositoryMock();
        door = createDoorStoreMock();
        app = await bootHttpPath(repo, door);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    /**
     * [CASES:usage-transition] — 이용 전환 판정(사용자 확정 2026-11-07). 이용 10:00 ~ 13:00(한국 시각).
     * 시작 → 그 자리에서 이용 중 · 호실 사용중 · QR 발급, 그대로 · 종료 → QR 을 볼 수 없다(쓰기 없음). 종료 전환 자체는 scheduler 가 한다(같은 경계 — Smoke).
     * [이름, 예약 상태, 지금, 기대 — START: 이용 시작 후 QR / SHOW: 이용 중 그 QR / 400 문구]
     */
    describe('[CASES:usage-transition] 예약 상태 · 지금 → 이용 시작 / 그대로 / 종료 (사용자 확정 2026-11-07)', () => {
        it.each([
            ['1. 확정 · 지금 = 시작 정각(10:00:00) → 시작', 'CONFIRMED', '2026-11-10T01:00:00Z', 'START'],
            ['2. 확정 · 지금 = 시작 − 1초(09:59:59) → 그대로(QR 은 시작 시각부터 — 링크 SMS 가 5분 전에 가도)', 'CONFIRMED', '2026-11-10T00:59:59Z', OUT_OF_TIME],
            ['3. 확정 · 지금 = 끝 − 1초(12:59:59, scheduler 가 늦음) → 시작', 'CONFIRMED', '2026-11-10T03:59:59Z', 'START'],
            ['4. 확정 · 지금 = 끝 정각(13:00, 시작을 놓침) → 종료', 'CONFIRMED', '2026-11-10T04:00:00Z', OUT_OF_TIME],
            ['5. 이용 중 · 지금 = 끝 − 1초 → 그대로(그 QR)', 'CHECKED_IN', '2026-11-10T03:59:59Z', 'SHOW'],
            ['6. 이용 중 · 지금 = 끝 정각 → 종료', 'CHECKED_IN', '2026-11-10T04:00:00Z', OUT_OF_TIME],
            ['7. 결제 대기 · 지금 = 시작 → 그대로', 'PENDING', '2026-11-10T01:00:00Z', NO_QR],
            ['8-1. 이용 완료 → 그대로', 'COMPLETED', '2026-11-10T02:00:00Z', NO_QR],
            ['8-2. 취소 → 그대로', 'CANCELED', '2026-11-10T02:00:00Z', NO_QR],
            ['8-3. 결제 대기 만료 → 그대로', 'EXPIRED', '2026-11-10T02:00:00Z', NO_QR],
        ])('%s', async (_label, reservation_state_id, now, expected) => {
            vi.setSystemTime(new Date(now));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({...HOURLY, reservation_state_id}));
            const existing = reservation_state_id === 'CHECKED_IN' ? roomQrEntity(HOURLY_QR) : null;
            const issued = roomQrEntity(HOURLY_QR);
            repo.findRoomQr.mockResolvedValueOnce(existing).mockResolvedValueOnce(issued);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            if (expected === 'START' || expected === 'SHOW') {
                expect(res.status).toBe(200);
                expect(res.body).toEqual({reservation_id: RESERVATION_ID, room_id: ROOM_ID, qr: QR, qr_starts_at: HOURLY.start_at.toISOString(), qr_ends_at: HOURLY.end_at.toISOString()});
                expect(door.setQr).toHaveBeenCalledWith(ROOM_ID, QR, HOURLY.end_at);
            } else {
                expect(res.status).toBe(400);
                expect(res.body).toEqual({message: expected, validation_errors: null});
                expect(door.setQr).not.toHaveBeenCalled();
            }
            if (expected === 'START') {
                const [where, started] = repo.updateReservation.mock.calls[0] as [unknown, ReservationEntity];
                expect(where).toEqual({reservation_id: RESERVATION_ID, reservation_state_id: 'CONFIRMED'});
                expect(started).toBeInstanceOf(ReservationEntity);
                expect(started.reservation_state_id).toBe('CHECKED_IN');
                expect(repo.updateReservationRoom).toHaveBeenCalledTimes(1);
                expect(repo.insertRoomQr).toHaveBeenCalledTimes(1);
            } else {
                expect(repo.updateReservation).not.toHaveBeenCalled();
                expect(repo.updateReservationRoom).not.toHaveBeenCalled();
                expect(repo.insertRoomQr).not.toHaveBeenCalled();
            }
        });
    });

    /**
     * [CASES:room-state] 시작 — 호실을 읽지 않고 상태 조건 쓰기로 바꾼다. 조건에 든 상태만 사용중이 되고, 빠진 상태는 0행이라 그대로다(사용자 확정 2026-11-07).
     * [이름, 호실 상태, 조건에 드는가]
     */
    describe('[CASES:room-state] 시작 — 호실 상태 → 사용중 / 그대로', () => {
        it.each([
            ['예약가능 + 시작 → 사용중', 'AVAILABLE', true],
            ['예약완료 + 시작 → 사용중', 'RESERVED', true],
            ['정비중 + 시작 → 사용중', 'MAINTENANCE', true],
            ['사용중 + 시작 → 그대로', 'IN_USE', false],
            ['사용중지 + 시작 → 그대로', 'DISABLED', false],
        ])('%s', async (_label, room_state_id, changes) => {
            vi.setSystemTime(new Date('2026-11-10T01:00:00Z'));
            repo.findReservation.mockResolvedValueOnce(reservationEntity(HOURLY));
            repo.findRoomQr.mockResolvedValueOnce(null).mockResolvedValueOnce(roomQrEntity(HOURLY_QR));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            const [where, room] = repo.updateReservationRoom.mock.calls[0] as [{room_id: string; room_state_id: ReturnType<typeof In>}, RoomEntity];
            expect(where).toEqual({room_id: ROOM_ID, room_state_id: In(['AVAILABLE', 'RESERVED', 'MAINTENANCE'])});
            expect((where.room_state_id.value as string[]).includes(room_state_id)).toBe(changes);
            expect(room).toBeInstanceOf(RoomEntity);
            expect(room.room_state_id).toBe('IN_USE');
            expect(repo.updateReservationRoom.mock.invocationCallOrder[0]).toBeGreaterThan(repo.updateReservation.mock.invocationCallOrder[0]);
        });
    });

    describe('[CASES:judgeReservationQr] 이용 중 예약의 QR 행 → 내줌 / 발급 / 거절', () => {
        it.each([
            ['1. 이용 중 · 11:00 · QR 행 없음 → 발급 후 그 QR', {reservation_state_id: 'CHECKED_IN'}, null, '2026-11-10T02:00:00Z', 'ISSUE'],
            ['2. 이용 중 · 11:00 · 끝낸 QR(끝 10:30) → QR 없는 예약', {reservation_state_id: 'CHECKED_IN'}, {...HOURLY_QR, ends_at: new Date('2026-11-10T01:30:00Z')}, '2026-11-10T02:00:00Z', NO_QR],
            [
                '3. 1박 22:00 ~ 다음 날 09:00 · 이용 중 · 다음 날 03:00 → 그 QR(날짜 넘김)',
                {...NIGHT, reservation_state_id: 'CHECKED_IN'},
                {starts_at: NIGHT.start_at, ends_at: NIGHT.end_at},
                '2026-11-10T18:00:00Z',
                'SHOW',
            ],
        ])('%s', async (_label, override, qrWindow, now, expected) => {
            vi.setSystemTime(new Date(now));
            const reservation = reservationEntity({...HOURLY, ...override});
            repo.findReservation.mockResolvedValueOnce(reservation);
            const row = qrWindow ? roomQrEntity(qrWindow) : null;
            const issued = roomQrEntity({starts_at: reservation.start_at, ends_at: reservation.end_at});
            repo.findRoomQr.mockResolvedValueOnce(row).mockResolvedValueOnce(issued);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(repo.updateReservation).not.toHaveBeenCalled();
            if (expected === 'SHOW' || expected === 'ISSUE') {
                const shown = (expected === 'SHOW' ? row : issued) as Record<string, Date>;
                expect(res.status).toBe(200);
                expect(res.body).toEqual({reservation_id: RESERVATION_ID, room_id: ROOM_ID, qr: QR, qr_starts_at: shown.starts_at.toISOString(), qr_ends_at: shown.ends_at.toISOString()});
                expect(repo.insertRoomQr).toHaveBeenCalledTimes(expected === 'ISSUE' ? 1 : 0);
                expect(door.setQr).toHaveBeenCalledTimes(1);
                expect(door.setQr).toHaveBeenCalledWith(ROOM_ID, QR, shown.ends_at);
            } else {
                expect(res.status).toBe(400);
                expect(res.body).toEqual({message: expected, validation_errors: null});
                expect(repo.insertRoomQr).not.toHaveBeenCalled();
                expect(door.setQr).not.toHaveBeenCalled();
            }
        });
    });

    describe('[SUCCESS]', () => {
        it('그 QR — 이용 중 예약 · 그 예약의 QR 을 한 번씩 읽고, 발급 · 전환하지 않고 Redis 현재 QR 로 다시 쓴다', async () => {
            vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'CHECKED_IN'}));
            repo.findRoomQr.mockResolvedValueOnce(roomQrEntity());

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findReservation).toHaveBeenCalledTimes(1);
            expect(repo.findReservation).toHaveBeenCalledWith({reservation_id: RESERVATION_ID, user_id: USER_ACTOR.user_id});
            expect(repo.findRoomQr).toHaveBeenCalledTimes(1);
            expect(repo.findRoomQr).toHaveBeenCalledWith({reservation_id: RESERVATION_ID});
            expect(repo.insertRoomQr).not.toHaveBeenCalled();
            expect(repo.updateReservation).not.toHaveBeenCalled();
            expect(repo.updateReservationRoom).not.toHaveBeenCalled();
            expect(door.setQr).toHaveBeenCalledWith(ROOM_ID, QR, new Date('2026-11-10T07:00:00Z'));
        });

        it('발급 — 유효 = 이용 시작 ~ 이용 끝, QR · ID 는 32자 무작위(서로 다름)', async () => {
            vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'CHECKED_IN'}));
            repo.findRoomQr.mockResolvedValueOnce(null).mockResolvedValueOnce(roomQrEntity());

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.insertRoomQr).toHaveBeenCalledTimes(1);
            const issued = repo.insertRoomQr.mock.calls[0][0] as RoomQrEntity;
            expect(issued).toBeInstanceOf(RoomQrEntity);
            expect(issued.room_qr_id).toMatch(ID_PATTERN);
            expect(issued.qr).toMatch(ID_PATTERN);
            expect(issued.qr).not.toBe(issued.room_qr_id);
            expect(issued.room_id).toBe(ROOM_ID);
            expect(issued.reservation_id).toBe(RESERVATION_ID);
            expect(issued.starts_at).toEqual(new Date('2026-11-10T04:00:00Z'));
            expect(issued.ends_at).toEqual(new Date('2026-11-10T07:00:00Z'));
            expect(repo.findRoomQr).toHaveBeenCalledTimes(2);
        });

        it('발급 경합 — scheduler 가 먼저 넣은 다른 QR 이면 다시 읽은 그 값을 돌려주고 Redis 에도 그 값을 쓴다', async () => {
            vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'CHECKED_IN'}));
            const other = 'f'.repeat(32);
            repo.findRoomQr.mockResolvedValueOnce(null).mockResolvedValueOnce(roomQrEntity({qr: other}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body.qr).toBe(other);
            expect(door.setQr).toHaveBeenCalledWith(ROOM_ID, other, new Date('2026-11-10T07:00:00Z'));
        });
    });

    describe('[FAIL:service]', () => {
        it('내 예약이 아니면 404, QR 조회 · 발급 · Redis 없음', async () => {
            repo.findReservation.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '예약을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoomQr).not.toHaveBeenCalled();
            expect(repo.insertRoomQr).not.toHaveBeenCalled();
            expect(door.setQr).not.toHaveBeenCalled();
        });

        it('발급 뒤 다시 읽어도 없으면 500, Redis 없음', async () => {
            vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'CHECKED_IN'}));
            repo.findRoomQr.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(500);
            expect(res.body).toEqual({message: 'QR 정보를 발급하지 못했습니다. 관리자에게 문의해주세요.', validation_errors: null});
            expect(door.setQr).not.toHaveBeenCalled();
        });

        it('그 자리에서 이용 시작하는데 scheduler 가 먼저 바꿨으면(확정 조건 0행) 400, 호실 · QR 쓰기 · Redis 없음', async () => {
            vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
            repo.updateReservation.mockResolvedValueOnce(false);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '예약 상태가 바뀌었습니다. 다시 확인해주세요.', validation_errors: null});
            expect(repo.updateReservationRoom).not.toHaveBeenCalled();
            expect(repo.insertRoomQr).not.toHaveBeenCalled();
            expect(door.setQr).not.toHaveBeenCalled();
        });

        it('Redis 에 닿지 못하면 503', async () => {
            vi.setSystemTime(new Date('2026-11-10T05:00:00Z'));
            repo.findReservation.mockResolvedValueOnce(reservationEntity({reservation_state_id: 'CHECKED_IN'}));
            repo.findRoomQr.mockResolvedValueOnce(roomQrEntity());
            door.setQr.mockRejectedValueOnce(new ServiceUnavailableException({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(503);
            expect(res.body).toEqual({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.', validation_errors: null});
        });
    });

    describe('[FAIL:validation]', () => {
        it('예약 ID 가 32자 hex 가 아니면 400 validation_errors.reservation_id, 예약 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/user-service/reservation/xyz/qr').set(internalHeaders(USER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '예약 ID가 올바르지 않습니다.', validation_errors: [{property: 'reservation_id', message: '예약 ID가 올바르지 않습니다.'}]});
            expect(repo.findReservation).not.toHaveBeenCalled();
        });
    });
});
