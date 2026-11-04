import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {
    bootHttpPath,
    createDoorStoreMock,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    DOOR_TIME_CASES,
    DoorStoreMock,
    internalHeaders,
    ROOM_ID,
    roomEntity,
    RoomRepositoryMock,
    STORE_ID,
} from './room.test-helper.js';

const PATH = '/internal/v1/admin-service/room/door-close';

/** 요청 본문 — gateway 가 소켓 접속 때 확인한 업체 ID 를 붙인다 */
const BODY = {store_id: STORE_ID, room_id: ROOM_ID};

describe('POST /internal/v1/admin-service/room/door-close — 문 소켓 잠금 알림 (gateway 문 소켓, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;
    let door: DoorStoreMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-04T00:30:12Z'));
        repo = createRoomRepositoryMock();
        repo.findRoom.mockResolvedValue(roomEntity());
        door = createDoorStoreMock();
        app = await bootHttpPath(repo, createStorageGatewayMock(), door);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 호실이면 close + 지금 시각으로 쓰고 그 상태를 돌려준다(QR 없이 — 인증된 소켓)', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({room_id: ROOM_ID, door_state: 'close', door_changed_at: '20261104093012'});
            expect(repo.findRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(door.close).toHaveBeenCalledTimes(1);
            expect(door.close).toHaveBeenCalledWith(ROOM_ID, '20261104093012');
        });
    });

    describe('[CASES:toDoorTime] 지금(UTC) → 문 시각(한국 yyyyMMddHHmmss)', () => {
        it.each(DOOR_TIME_CASES)('%s — %s → %s', async (_label, now, expected) => {
            vi.setSystemTime(new Date(now));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(200);
            expect(res.body.door_changed_at).toBe(expected);
            expect(door.close).toHaveBeenCalledWith(ROOM_ID, expected);
        });
    });

    describe('[FAIL:service]', () => {
        it('그 업체의 호실이 아니면(없음 · 다른 업체) 404, 잠금 기록 없음', async () => {
            repo.findRoom.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '호실을 찾을 수 없습니다.', validation_errors: null});
            expect(door.close).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['업체 ID 형식', {...BODY, store_id: 'xyz'}, 'store_id', '업체 ID가 올바르지 않습니다.'],
            ['호실 ID 형식', {...BODY, room_id: 'xyz'}, 'room_id', '호실 ID가 올바르지 않습니다.'],
        ])('%s → 400 validation_errors.%s, 호실 조회 없음', async (_label, body, property, message) => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property, message}]});
            expect(repo.findRoom).not.toHaveBeenCalled();
        });
    });
});
