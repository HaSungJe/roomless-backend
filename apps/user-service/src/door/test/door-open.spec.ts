import {INestApplication, ServiceUnavailableException} from '@nestjs/common';
import request from 'supertest';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {bootHttpPath, createDoorRepositoryMock, createDoorStoreMock, DOOR_TIME_CASES, DoorRepositoryMock, DoorStoreMock, internalHeaders, QR, REDIS_UNAVAILABLE, ROOM_ID} from './door.test-helper.js';

const PATH = '/internal/v1/user-service/door/open';

describe('POST /internal/v1/user-service/door/open — QR 로 문 열기 (동기 경로)', () => {
    let app: INestApplication;
    let repo: DoorRepositoryMock;
    let store: DoorStoreMock;

    beforeEach(async () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-10-31T17:24:59Z'));
        repo = createDoorRepositoryMock();
        store = createDoorStoreMock();
        app = await bootHttpPath(repo, store);
    });

    afterEach(async () => {
        vi.useRealTimers();
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('같은 QR 의 문을 open + 지금 시각(한국)으로 바꾸고 room_id · 상태 · 시각을 돌려준다 — 호실 조회 · 닫기 · 발급 없음', async () => {
            store.open.mockResolvedValueOnce(ROOM_ID);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({qr: QR});

            expect(res.status).toBe(200);
            expect(res.body).toEqual({room_id: ROOM_ID, door_state: 'open', door_changed_at: '20261101022459'});
            expect(store.open).toHaveBeenCalledTimes(1);
            expect(store.open).toHaveBeenCalledWith(QR, '20261101022459');
            expect(store.close).not.toHaveBeenCalled();
            expect(store.issueQr).not.toHaveBeenCalled();
            expect(repo.findDoorRoom).not.toHaveBeenCalled();
        });
    });

    describe('[CASES:toDoorTime] 지금(UTC) → 문 시각(한국 yyyyMMddHHmmss)', () => {
        it.each(DOOR_TIME_CASES)('%s — %s → %s', async (_label, now, expected) => {
            vi.setSystemTime(new Date(now));
            store.open.mockResolvedValueOnce(ROOM_ID);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({qr: QR});

            expect(res.status).toBe(200);
            expect(res.body.door_changed_at).toBe(expected);
            expect(store.open).toHaveBeenCalledWith(QR, expected);
        });
    });

    describe('[FAIL:service]', () => {
        it('같은 QR 의 문이 없으면 404 — 입력 오류가 아니라 validation_errors null', async () => {
            store.open.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({qr: QR});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '일치하는 QR 정보가 없습니다.', validation_errors: null});
            expect(store.open).toHaveBeenCalledTimes(1);
        });

        it('상태 저장소(Redis)에 닿지 못하면 503 을 그대로 돌려준다', async () => {
            store.open.mockRejectedValueOnce(new ServiceUnavailableException({message: REDIS_UNAVAILABLE}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({qr: QR});

            expect(res.status).toBe(503);
            expect(res.body).toEqual({message: REDIS_UNAVAILABLE, validation_errors: null});
        });
    });

    describe('[FAIL:validation] ValidationPipe — 400, 포트 호출 없음', () => {
        it.each([
            ['QR 없음', {}, 'QR 정보를 입력해주세요.'],
            ['대문자', {qr: 'A1'.repeat(16)}, 'QR 정보가 올바르지 않습니다.'],
            ['31자', {qr: 'a'.repeat(31)}, 'QR 정보가 올바르지 않습니다.'],
            ['hex 아님', {qr: 'z'.repeat(32)}, 'QR 정보가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, message) => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property: 'qr', message}]});
            expect(store.open).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:internal]', () => {
        it('내부 토큰이 없거나 틀리면 403, 포트 호출 없음', async () => {
            const missing = await request(app.getHttpServer()).post(PATH).send({qr: QR});
            const wrong = await request(app.getHttpServer()).post(PATH).set(INTERNAL_HEADER.TOKEN, 'wrong').send({qr: QR});

            expect(missing.status).toBe(403);
            expect(missing.body).toEqual({message: '내부 요청만 허용됩니다.', validation_errors: null});
            expect(wrong.status).toBe(403);
            expect(store.open).not.toHaveBeenCalled();
        });
    });
});
