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
    MANAGER_ACTOR,
    ROOM_ID,
    roomEntity,
    RoomRepositoryMock,
    STORE_ID,
    storeRow,
} from './room.test-helper.js';

const PATH = `/internal/v1/admin-service/room/${ROOM_ID}/door-open`;

describe('POST /internal/v1/admin-service/room/:room_id/door-open — 호실 문 바로 열기 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;
    let door: DoorStoreMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-04T00:30:12Z'));
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
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
        it('내 업체 호실 문을 open + 지금 시각으로 쓰고(열기 명령은 포트가 함께) 그 상태를 돌려준다', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body).toEqual({room_id: ROOM_ID, door_state: 'open', door_changed_at: '20261104093012'});
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.findRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(door.open).toHaveBeenCalledTimes(1);
            expect(door.open).toHaveBeenCalledWith(ROOM_ID, STORE_ID, '20261104093012');
        });
    });

    describe('[CASES:toDoorTime] 지금(UTC) → 문 시각(한국 yyyyMMddHHmmss)', () => {
        it.each(DOOR_TIME_CASES)('%s — %s → %s', async (_label, now, expected) => {
            vi.setSystemTime(new Date(now));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(res.body.door_changed_at).toBe(expected);
            expect(door.open).toHaveBeenCalledWith(ROOM_ID, STORE_ID, expected);
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 404, 호실 조회 · 문 열기 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findRoom).not.toHaveBeenCalled();
            expect(door.open).not.toHaveBeenCalled();
        });

        it('내 업체 호실이 아니면(없음 · 다른 업체) 404, 문 열기 없음', async () => {
            repo.findRoom.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '호실을 찾을 수 없습니다.', validation_errors: null});
            expect(door.open).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('호실 ID 가 32자 hex 가 아니면 400 validation_errors.room_id, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).post('/internal/v1/admin-service/room/xyz/door-open').set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message: '호실 ID가 올바르지 않습니다.', validation_errors: [{property: 'room_id', message: '호실 ID가 올바르지 않습니다.'}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
