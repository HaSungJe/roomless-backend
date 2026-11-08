import {INestApplication, ServiceUnavailableException} from '@nestjs/common';
import request from 'supertest';
import {DoorOpenLogEntity} from '@app/database/entities/door/door-open-log.entity.js';
import {bootHttpPath, createDoorStoreMock, createDoorRepositoryMock, DoorStoreMock, internalHeaders, ROOM_ID, roomEntity, DoorRepositoryMock, STORE_ID} from './door.test-helper.js';

const PATH = '/internal/v1/user-service/door/verify';

/** 문이 읽은 QR */
const QR = 'a1'.repeat(16);

/** 요청 본문 — gateway 가 소켓 접속 때 확인한 업체 ID 를 붙인다 */
const BODY = {store_id: STORE_ID, room_id: ROOM_ID, qr: QR};

/** 32자 ID 형식 */
const ID_PATTERN = /^[a-f0-9]{32}$/;

/** 그 호실 · 그 QR 의 이력(t_room_qr) */
const ROOM_QR = {room_qr_id: '4'.repeat(32), room_id: ROOM_ID, reservation_id: '1'.repeat(32), qr: QR, starts_at: new Date('2026-11-04T00:00:00Z'), ends_at: new Date('2026-11-04T03:00:00Z')};

describe('POST /internal/v1/user-service/door/verify — 문 소켓 QR 확인 (gateway 문 소켓, 동기 경로)', () => {
    let app: INestApplication;
    let repo: DoorRepositoryMock;
    let door: DoorStoreMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-04T00:30:12Z'));
        repo = createDoorRepositoryMock();
        repo.findDoorRoom.mockResolvedValue(roomEntity());
        repo.findDoorRoomQr.mockResolvedValue(ROOM_QR);
        door = createDoorStoreMock();
        app = await bootHttpPath(repo, door);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 호실의 현재 QR 과 같으면 ok true(포트가 open + 지금 시각으로 기록) + QR 로 연 기록 한 줄(호실 · 예약 · QR · 시각)', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({room_id: ROOM_ID, ok: true});
            expect(repo.findDoorRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(repo.findDoorRoomQr).toHaveBeenCalledTimes(1);
            expect(repo.findDoorRoomQr).toHaveBeenCalledWith({room_id: ROOM_ID, qr: QR});
            expect(door.verify).toHaveBeenCalledTimes(1);
            expect(door.verify).toHaveBeenCalledWith(ROOM_ID, QR, '20261104093012');
            expect(repo.insertDoorOpenLog).toHaveBeenCalledTimes(1);
            const [log] = repo.insertDoorOpenLog.mock.calls[0] as [DoorOpenLogEntity];
            expect(log).toBeInstanceOf(DoorOpenLogEntity);
            expect(log.door_open_log_id).toMatch(ID_PATTERN);
            expect(log).toMatchObject({room_id: ROOM_ID, reservation_id: ROOM_QR.reservation_id, room_qr_id: ROOM_QR.room_qr_id, opened_at: new Date('2026-11-04T00:30:12Z')});
            expect(repo.insertDoorOpenLog.mock.invocationCallOrder[0]).toBeGreaterThan(door.verify.mock.invocationCallOrder[0]);
        });

        it('이력은 있지만 Redis 현재 QR 과 다르면(끝낸 QR · 다른 예약) ok false — 실패가 아니라 200, 열림 기록 없음', async () => {
            door.verify.mockResolvedValueOnce(false);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({room_id: ROOM_ID, ok: false});
            expect(repo.insertDoorOpenLog).not.toHaveBeenCalled();
        });

        it('그 호실 · 그 QR 의 이력이 없으면 Redis 를 보지 않고 ok false(200), 열림 기록 없음', async () => {
            repo.findDoorRoomQr.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({room_id: ROOM_ID, ok: false});
            expect(door.verify).not.toHaveBeenCalled();
            expect(repo.insertDoorOpenLog).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('그 업체의 호실이 아니면(없음 · 다른 업체) 404, QR 비교 없음', async () => {
            repo.findDoorRoom.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '호실을 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findDoorRoomQr).not.toHaveBeenCalled();
            expect(door.verify).not.toHaveBeenCalled();
        });

        it('Redis 에 닿지 못하면 503', async () => {
            door.verify.mockRejectedValueOnce(new ServiceUnavailableException({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(503);
            expect(res.body).toEqual({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.', validation_errors: null});
            expect(repo.insertDoorOpenLog).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['업체 ID 형식', {...BODY, store_id: 'xyz'}, 'store_id', '업체 ID가 올바르지 않습니다.'],
            ['호실 ID 형식', {...BODY, room_id: 'xyz'}, 'room_id', '호실 ID가 올바르지 않습니다.'],
            ['QR 형식', {...BODY, qr: 'xyz'}, 'qr', 'QR 정보가 올바르지 않습니다.'],
        ])('%s → 400 validation_errors.%s, 호실 조회 없음', async (_label, body, property, message) => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property, message}]});
            expect(repo.findDoorRoom).not.toHaveBeenCalled();
        });
    });
});
