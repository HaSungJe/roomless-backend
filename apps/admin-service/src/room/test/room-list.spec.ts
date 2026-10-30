import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {bootHttpPath, createRoomRepositoryMock, FIXED_TIME, internalHeaders, MANAGER_ACTOR, ROOM_GROUP_ID, ROOM_ID, roomRow, RoomRepositoryMock, STORE_ID, storeRow} from './room.test-helper.js';

const PATH = '/internal/v1/admin-service/room';

describe('GET /internal/v1/admin-service/room — 호실 목록 (업체 관리자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: RoomRepositoryMock;

    beforeEach(async () => {
        repo = createRoomRepositoryMock();
        repo.findManagerStore.mockResolvedValue(storeRow());
        repo.countRooms.mockResolvedValue(1);
        repo.findRoomRows.mockResolvedValue([roomRow()]);
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('필터가 없으면 내 업체 호실을 세고 기본 페이지로 층 · 호실명 순 목록(그룹명 · 상태명 포함)을 돌려준다', async () => {
            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.findManagerStore).toHaveBeenCalledWith(MANAGER_ACTOR.user_id, false);
            expect(repo.countRooms).toHaveBeenCalledWith({store_id: STORE_ID});
            expect(repo.findRoomRows).toHaveBeenCalledWith({store_id: STORE_ID, floor: null, room_group_id: null}, 20, 0);
            expect(repo.countRooms.mock.invocationCallOrder[0]).toBeLessThan(repo.findRoomRows.mock.invocationCallOrder[0]);
            expect(res.body).toEqual({
                list: [
                    {
                        room_id: ROOM_ID,
                        room_group_id: ROOM_GROUP_ID,
                        room_group_name: '스탠다드',
                        room_name: '101호',
                        floor: 1,
                        room_state_id: 'AVAILABLE',
                        room_state_name: '예약가능',
                        created_at: FIXED_TIME.toISOString(),
                    },
                ],
                pagination: expect.objectContaining({total_count: 1, page: 1}),
            });
        });

        it('층(지하 음수 — 정수 문자열) · 그룹 필터는 숫자 층 · 그룹 ID 로 같은 조건을 세고 목록에 넘긴다', async () => {
            const res = await request(app.getHttpServer()).get(`${PATH}?floor=-1&room_group_id=${ROOM_GROUP_ID}`).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(200);
            expect(repo.countRooms).toHaveBeenCalledWith({store_id: STORE_ID, floor: -1, room_group_id: ROOM_GROUP_ID});
            expect(repo.findRoomRows).toHaveBeenCalledWith({store_id: STORE_ID, floor: -1, room_group_id: ROOM_GROUP_ID}, 20, 0);
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['층이 정수가 아님(B1)', 'floor=B1', 'floor', '층을 정수로 입력해주세요.'],
            ['그룹 ID 가 32자 hex 가 아님', 'room_group_id=xyz', 'room_group_id', '객실 그룹 ID가 올바르지 않습니다.'],
        ])('%s → 400 validation_errors.%s, 업체 조회 없음', async (_label, query, property, message) => {
            const res = await request(app.getHttpServer()).get(`${PATH}?${query}`).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(400);
            expect(res.body).toEqual({message, validation_errors: [{property, message}]});
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('소속 업체가 없으면 404, 개수 · 목록 조회 없음', async () => {
            repo.findManagerStore.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders(MANAGER_ACTOR));

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '소속 업체를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.countRooms).not.toHaveBeenCalled();
            expect(repo.findRoomRows).not.toHaveBeenCalled();
        });
    });

    describe('[SECURITY]', () => {
        it('내부 토큰이 없으면 403, 업체 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get(PATH);

            expect(res.status).toBe(403);
            expect(repo.findManagerStore).not.toHaveBeenCalled();
        });
    });
});
