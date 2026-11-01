import {INestApplication, InternalServerErrorException, ServiceUnavailableException} from '@nestjs/common';
import request from 'supertest';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {bootHttpPath, createDoorRepositoryMock, createDoorStoreMock, DOOR_TIME_CASES, DoorRepositoryMock, DoorStoreMock, internalHeaders, REDIS_UNAVAILABLE, ROOM_ID} from './door.test-helper.js';

const PATH = '/internal/v1/user-service/door/close';
const ROOM = {room_id: ROOM_ID, store_id: 's'.repeat(32), is_deleted: 0};

describe('POST /internal/v1/user-service/door/close — 문 닫기 (동기 경로)', () => {
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
        it('지워지지 않은 호실이면 그 문을 close + 지금 시각(한국)으로 — 빈 본문, 열기 · 발급 없음', async () => {
            repo.findDoorRoom.mockResolvedValueOnce(ROOM);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(200);
            expect(res.text).toBe('');
            expect(repo.findDoorRoom).toHaveBeenCalledTimes(1);
            expect(repo.findDoorRoom).toHaveBeenCalledWith({room_id: ROOM_ID});
            expect(store.close).toHaveBeenCalledTimes(1);
            expect(store.close).toHaveBeenCalledWith(ROOM_ID, '20261101022459');
            expect(store.open).not.toHaveBeenCalled();
            expect(store.issueQr).not.toHaveBeenCalled();
        });
    });

    describe('[CASES:toDoorTime] 지금(UTC) → 문 시각(한국 yyyyMMddHHmmss)', () => {
        it.each(DOOR_TIME_CASES)('%s — %s → %s', async (_label, now, expected) => {
            vi.setSystemTime(new Date(now));
            repo.findDoorRoom.mockResolvedValueOnce(ROOM);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(200);
            expect(store.close).toHaveBeenCalledWith(ROOM_ID, expected);
        });
    });

    describe('[FAIL:service]', () => {
        it('호실이 없으면(지운 호실 포함) 404 — 문 정보를 쓰지 않는다', async () => {
            repo.findDoorRoom.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '호실을 찾을 수 없습니다.', validation_errors: null});
            expect(store.close).not.toHaveBeenCalled();
        });

        it('상태 저장소(Redis)에 닿지 못하면 503 을 그대로 돌려준다', async () => {
            repo.findDoorRoom.mockResolvedValueOnce(ROOM);
            store.close.mockRejectedValueOnce(new ServiceUnavailableException({message: REDIS_UNAVAILABLE}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(503);
            expect(res.body).toEqual({message: REDIS_UNAVAILABLE, validation_errors: null});
        });
    });

    describe('[FAIL:repository]', () => {
        it('호실 조회가 500 이면 그대로 — 문 정보를 쓰지 않는다', async () => {
            repo.findDoorRoom.mockRejectedValueOnce(new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({room_id: ROOM_ID});

            expect(res.status).toBe(500);
            expect(res.body).toEqual({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.', validation_errors: null});
            expect(store.close).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] ValidationPipe — 400, 조회 · 포트 호출 없음', () => {
        it.each([
            ['호실 ID 없음', {}, '호실 ID를 입력해주세요.'],
            ['32자 hex 아님', {room_id: 'x'.repeat(32)}, '호실 ID가 올바르지 않습니다.'],
            ['33자', {room_id: 'a'.repeat(33)}, '호실 ID가 올바르지 않습니다.'],
        ])('%s → %s', async (_label, body, message) => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property: 'room_id', message}]});
            expect(repo.findDoorRoom).not.toHaveBeenCalled();
            expect(store.close).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:internal]', () => {
        it('내부 토큰이 없거나 틀리면 403, 조회 · 포트 호출 없음', async () => {
            const missing = await request(app.getHttpServer()).post(PATH).send({room_id: ROOM_ID});
            const wrong = await request(app.getHttpServer()).post(PATH).set(INTERNAL_HEADER.TOKEN, 'wrong').send({room_id: ROOM_ID});

            expect(missing.status).toBe(403);
            expect(missing.body).toEqual({message: '내부 요청만 허용됩니다.', validation_errors: null});
            expect(wrong.status).toBe(403);
            expect(repo.findDoorRoom).not.toHaveBeenCalled();
            expect(store.close).not.toHaveBeenCalled();
        });
    });
});
