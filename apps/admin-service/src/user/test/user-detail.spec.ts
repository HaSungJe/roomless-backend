import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {bootHttpPath, createUserRepositoryMock, FIXED_TIME, internalHeaders, USER_ID, userRow, UserRepositoryMock} from './user.test-helper.js';

const PATH = `/internal/v1/admin-service/user/${USER_ID}`;

describe('GET /internal/v1/admin-service/user/:user_id — 이용자 상세 (동기 경로)', () => {
    let app: INestApplication;
    let repo: UserRepositoryMock;

    beforeEach(async () => {
        repo = createUserRepositoryMock();
        app = await bootHttpPath(repo);
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[CASES:reservation-summary] 예약 건수 요약 — 결제 대기 만료 제외 (사용자 확정 2026-11-09)', () => {
        it.each([
            ['행 없음 → 모두 0', [], {total: 0, in_progress: 0, completed: 0, canceled: 0}],
            ['EXPIRED 3건만 → 모두 0', [{reservation_state_id: 'EXPIRED', count: '3'}], {total: 0, in_progress: 0, completed: 0, canceled: 0}],
            [
                'PENDING 1 · CONFIRMED 2 · CHECKED_IN 1 → 진행 중 4',
                [
                    {reservation_state_id: 'PENDING', count: '1'},
                    {reservation_state_id: 'CONFIRMED', count: '2'},
                    {reservation_state_id: 'CHECKED_IN', count: '1'},
                ],
                {total: 4, in_progress: 4, completed: 0, canceled: 0},
            ],
            [
                'COMPLETED 5 · CANCELED 2 · EXPIRED 4 · CONFIRMED 1 → 전체 8',
                [
                    {reservation_state_id: 'COMPLETED', count: '5'},
                    {reservation_state_id: 'CANCELED', count: '2'},
                    {reservation_state_id: 'EXPIRED', count: '4'},
                    {reservation_state_id: 'CONFIRMED', count: '1'},
                ],
                {total: 8, in_progress: 1, completed: 5, canceled: 2},
            ],
            ["건수가 문자열('3' — PostgreSQL count) → 숫자 3", [{reservation_state_id: 'COMPLETED', count: '3'}], {total: 3, in_progress: 0, completed: 3, canceled: 0}],
        ])('%s', async (_label, rows, summary) => {
            repo.findUser.mockResolvedValueOnce(userRow());
            repo.findReservationCounts.mockResolvedValueOnce(rows);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(res.body.reservation_summary).toStrictEqual(summary);
            expect(repo.findReservationCounts).toHaveBeenCalledWith(USER_ID);
        });
    });

    describe('[SUCCESS]', () => {
        it('이용자 그룹 조건으로 찾고 회원 정보 · 이용 제한 사유 · 탈퇴 예정 · 예약 요약을 돌려준다', async () => {
            repo.findUser.mockResolvedValueOnce(userRow({state_id: 'BLOCK', block_comment: '부정 이용', phone: null, phone_verified_at: null, sns_id: null}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(repo.findUser).toHaveBeenCalledWith({user_id: USER_ID, login_scope: 'USER'});
            expect(res.body).toEqual({
                user_id: USER_ID,
                user_search_code: 's'.repeat(32),
                nickname: '여행자',
                name: '김이용',
                gender: 'F',
                birth: '1995-05-05',
                phone: null,
                phone_verified_at: null,
                sns_id: null,
                state_id: 'BLOCK',
                block_comment: '부정 이용',
                leave_reserved_at: null,
                created_at: FIXED_TIME.toISOString(),
                reservation_summary: {total: 0, in_progress: 0, completed: 0, canceled: 0},
            });
        });

        it('휴대폰 인증 · 탈퇴 대기면 인증일시 · 탈퇴 예정 시각을 그대로', async () => {
            repo.findUser.mockResolvedValueOnce(userRow({state_id: 'LEAVE_WAIT', leave_reserved_at: '2026-01-15 09:00:00'}));

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.body).toMatchObject({phone: '01011112222', phone_verified_at: '2025-12-01T00:00:00.000Z', state_id: 'LEAVE_WAIT', leave_reserved_at: '2026-01-15 09:00:00'});
        });
    });

    describe('[FAIL:service]', () => {
        it('이용자 그룹 회원이 아니면 404, 예약 건수 조회 없음', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '이용자를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findReservationCounts).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation]', () => {
        it('회원 ID 가 32자 hex 가 아니면 400 validation_errors.user_id, 조회 없음', async () => {
            const res = await request(app.getHttpServer()).get('/internal/v1/admin-service/user/xyz').set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property: 'user_id', message: '회원 ID가 올바르지 않습니다.'}]);
            expect(repo.findUser).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:internal]', () => {
        it('내부 토큰이 없으면 403, 조회 없음', async () => {
            const headers = internalHeaders();
            delete headers[INTERNAL_HEADER.TOKEN];

            const res = await request(app.getHttpServer()).get(PATH).set(headers);

            expect(res.status).toBe(403);
            expect(repo.findUser).not.toHaveBeenCalled();
        });
    });
});
