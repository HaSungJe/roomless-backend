import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {Not} from 'typeorm';
import {matchBcrypt} from '@app/common/utils/bcrypt.js';
import {
    bootHttpPath,
    createDoorStoreMock,
    createRoomRepositoryMock,
    createStorageGatewayMock,
    DoorStoreMock,
    internalHeaders,
    ROOM_ID,
    RoomRepositoryMock,
    STORE_ID,
    storeRow,
} from './room.test-helper.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));

const PATH = '/internal/v1/admin-service/room/door-snapshot';

/** 문 소켓 시크릿 원문 · 저장 해시 */
const SECRET = 'A1b2C3d4E5f6G7h8';
const SECRET_HASH = '$2b$12$hashed';

/** 둘째 호실 ID */
const ROOM_ID_2 = '6'.repeat(32);

/** 인증 실패 본문 — 이유를 가르지 않는다 */
const AUTH_FAILED = {message: '업체 ID 또는 시크릿 코드가 올바르지 않습니다.', validation_errors: null};

describe('POST /internal/v1/admin-service/room/door-snapshot — 문 소켓 접속 확인 (gateway 문 소켓, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;
    let door: DoorStoreMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findDoorStore.mockResolvedValue(storeRow({door_secret: SECRET_HASH}));
        repo.findStoreDoorRoomRows.mockResolvedValue([
            {room_id: ROOM_ID, room_name: '101호', floor: 1},
            {room_id: ROOM_ID_2, room_name: 'B101호', floor: -1},
        ]);
        vi.mocked(matchBcrypt).mockResolvedValue(true);
        door = createDoorStoreMock();
        door.getMany.mockResolvedValue([
            {state: 'open', changed_at: '20261104093012'},
            {state: 'close', changed_at: '00000000000000'},
        ]);
        app = await bootHttpPath(repo, createStorageGatewayMock(), door);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('탈퇴하지 않은 업체 · 시크릿 일치면 그 업체 호실 전체(층 · 호실명 순 그대로)의 문 상태를 돌려준다', async () => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({store_id: STORE_ID, door_secret: SECRET});

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                store_id: STORE_ID,
                list: [
                    {room_id: ROOM_ID, room_name: '101호', floor: 1, door_state: 'open', door_changed_at: '20261104093012'},
                    {room_id: ROOM_ID_2, room_name: 'B101호', floor: -1, door_state: 'close', door_changed_at: '00000000000000'},
                ],
            });
            expect(repo.findDoorStore).toHaveBeenCalledWith({store_id: STORE_ID, store_state_id: Not('LEAVE')});
            expect(matchBcrypt).toHaveBeenCalledWith(SECRET, SECRET_HASH);
            expect(repo.findStoreDoorRoomRows).toHaveBeenCalledWith(STORE_ID);
            expect(door.getMany).toHaveBeenCalledTimes(1);
            expect(door.getMany).toHaveBeenCalledWith([ROOM_ID, ROOM_ID_2]);
        });
    });

    describe('[FAIL:service] 모두 같은 401 — 업체가 있는지 알려 주지 않는다', () => {
        it('업체가 없으면(지움 · 탈퇴 포함) 401, 비밀번호 비교 · 호실 조회 없음', async () => {
            repo.findDoorStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({store_id: STORE_ID, door_secret: SECRET});

            expect(res.status).toBe(401);
            expect(res.body).toEqual(AUTH_FAILED);
            expect(matchBcrypt).not.toHaveBeenCalled();
            expect(repo.findStoreDoorRoomRows).not.toHaveBeenCalled();
            expect(door.getMany).not.toHaveBeenCalled();
        });

        it('시크릿을 정하지 않은 업체면 401, 비밀번호 비교 없음', async () => {
            repo.findDoorStore.mockResolvedValueOnce(storeRow({door_secret: null}));

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({store_id: STORE_ID, door_secret: SECRET});

            expect(res.status).toBe(401);
            expect(res.body).toEqual(AUTH_FAILED);
            expect(matchBcrypt).not.toHaveBeenCalled();
            expect(repo.findStoreDoorRoomRows).not.toHaveBeenCalled();
        });

        it('시크릿이 다르면 401, 호실 조회 없음', async () => {
            vi.mocked(matchBcrypt).mockResolvedValueOnce(false);

            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send({store_id: STORE_ID, door_secret: SECRET});

            expect(res.status).toBe(401);
            expect(res.body).toEqual(AUTH_FAILED);
            expect(repo.findStoreDoorRoomRows).not.toHaveBeenCalled();
            expect(door.getMany).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['업체 ID 형식', {store_id: 'xyz', door_secret: SECRET}, 'store_id', '업체 ID가 올바르지 않습니다.'],
            ['시크릿 15자', {store_id: STORE_ID, door_secret: 'A1b2C3d4E5f6G7h'}, 'door_secret', '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'],
            ['시크릿 특수문자', {store_id: STORE_ID, door_secret: 'A1b2C3d4E5f6G7h!'}, 'door_secret', '시크릿 코드는 영문 · 숫자 16 ~ 64자로 입력해주세요.'],
        ])('%s → 400 validation_errors.%s, 업체 조회 없음', async (_label, body, property, message) => {
            const res = await request(app.getHttpServer()).post(PATH).set(internalHeaders()).send(body);

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property, message}]});
            expect(repo.findDoorStore).not.toHaveBeenCalled();
        });
    });
});
