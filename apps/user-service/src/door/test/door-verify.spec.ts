import {INestApplication, ServiceUnavailableException} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createDoorStoreMock, createDoorRepositoryMock, DoorStoreMock, internalHeaders, ROOM_ID, roomEntity, DoorRepositoryMock, STORE_ID} from './door.test-helper.js';

const PATH = '/internal/v1/user-service/door/verify';

/** 문이 읽은 QR */
const QR = 'a1'.repeat(16);

/** 요청 본문 — gateway 가 소켓 접속 때 확인한 업체 ID 를 붙인다 */
const BODY = {store_id: STORE_ID, room_id: ROOM_ID, qr: QR};

describe('POST /internal/v1/user-service/door/verify — 문 소켓 QR 확인 (gateway 문 소켓, 동기 경로)', () => {
    let app: INestApplication;
    let repo: DoorRepositoryMock;
    let door: DoorStoreMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-11-04T00:30:12Z'));
        repo = createDoorRepositoryMock();
        repo.findDoorRoom.mockResolvedValue(roomEntity());
        door = createDoorStoreMock();
        app = await bootHttpPath(repo, door);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('그 업체 호실의 현재 QR 과 같으면 ok true(포트가 open + 지금 시각으로 기록)', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({room_id: ROOM_ID, ok: true});
            expect(repo.findDoorRoom).toHaveBeenCalledWith({room_id: ROOM_ID, store_id: STORE_ID});
            expect(door.verify).toHaveBeenCalledTimes(1);
            expect(door.verify).toHaveBeenCalledWith(ROOM_ID, QR, '20261104093012');
        });

        it('다르거나 현재 QR 이 없으면 ok false — 실패가 아니라 200(문은 열지 않는다)', async () => {
            door.verify.mockResolvedValueOnce(false);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(200);
            expect(res.body).toEqual({room_id: ROOM_ID, ok: false});
        });
    });

    describe('[FAIL:service]', () => {
        it('그 업체의 호실이 아니면(없음 · 다른 업체) 404, QR 비교 없음', async () => {
            repo.findDoorRoom.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '호실을 찾을 수 없습니다.', validation_errors: null});
            expect(door.verify).not.toHaveBeenCalled();
        });

        it('Redis 에 닿지 못하면 503', async () => {
            door.verify.mockRejectedValueOnce(new ServiceUnavailableException({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(BODY);

            expect(res.status).toBe(503);
            expect(res.body).toEqual({message: '상태 저장소에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.', validation_errors: null});
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
