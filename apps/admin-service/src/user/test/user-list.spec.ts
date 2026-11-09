import type {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {ILike} from 'typeorm';
import {bootHttpPath, createUserRepositoryMock, FIXED_TIME, internalHeaders, USER_ID, userRow, UserRepositoryMock} from './user.test-helper.js';

const PATH = '/internal/v1/admin-service/user';

describe('GET /internal/v1/admin-service/user — 이용자 목록 (동기 경로)', () => {
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

    describe('[SUCCESS]', () => {
        it('필터 없음 — 이용자 그룹만, count → 페이지(기본 20 · 0) → 목록, 항목(휴대폰 인증 여부 · 가입일 ISO)', async () => {
            repo.countUsers.mockResolvedValueOnce(2);
            repo.findUserList.mockResolvedValueOnce([userRow(), userRow({user_id: 'v'.repeat(32), phone: null, phone_verified_at: null, sns_id: null, state_id: 'BLOCK'})]);

            const res = await request(app.getHttpServer()).get(PATH).set(internalHeaders());

            expect(res.status).toBe(200);
            expect(repo.countUsers).toHaveBeenCalledWith([{login_scope: 'USER'}]);
            expect(repo.findUserList).toHaveBeenCalledWith([{login_scope: 'USER'}], 20, 0);
            expect(repo.countUsers.mock.invocationCallOrder[0]).toBeLessThan(repo.findUserList.mock.invocationCallOrder[0]);
            expect(res.body.list).toEqual([
                {
                    user_id: USER_ID,
                    user_search_code: 's'.repeat(32),
                    nickname: '여행자',
                    name: '김이용',
                    phone: '01011112222',
                    sns_id: 'KAKAO',
                    state_id: 'ACTIVE',
                    is_phone_verified: 1,
                    created_at: FIXED_TIME.toISOString(),
                },
                {
                    user_id: 'v'.repeat(32),
                    user_search_code: 's'.repeat(32),
                    nickname: '여행자',
                    name: '김이용',
                    phone: null,
                    sns_id: null,
                    state_id: 'BLOCK',
                    is_phone_verified: 0,
                    created_at: FIXED_TIME.toISOString(),
                },
            ]);
            expect(res.body.pagination).toMatchObject({total_count: 2});
        });

        it('상태 · SNS · 검색어 — 필터를 모든 OR 조건에, 검색어는 이름 · 닉네임 · 휴대폰 · 회원 식별 코드 부분 일치(% · _ 이스케이프)', async () => {
            repo.countUsers.mockResolvedValueOnce(15);

            const res = await request(app.getHttpServer()).get(PATH).query({state_id: 'BLOCK', sns_id: 'NAVER', keyword: 'a_b', page: 2, size: 10}).set(internalHeaders());

            expect(res.status).toBe(200);
            const base = {login_scope: 'USER', state_id: 'BLOCK', sns_id: 'NAVER'};
            const where = [
                {...base, name: ILike('%a\\_b%')},
                {...base, nickname: ILike('%a\\_b%')},
                {...base, phone: ILike('%a\\_b%')},
                {...base, user_search_code: ILike('%a\\_b%')},
            ];
            expect(repo.countUsers).toHaveBeenCalledWith(where);
            expect(repo.findUserList).toHaveBeenCalledWith(where, 10, 10);
        });
    });

    describe('[FAIL:validation]', () => {
        it.each([
            ['상태가 허용값 밖', {state_id: 'DELETED'}, 'state_id', '상태가 올바르지 않습니다.'],
            ['SNS 가 허용값 밖', {sns_id: 'TWITTER'}, 'sns_id', 'SNS 유형이 올바르지 않습니다.'],
            ['검색어 101자', {keyword: 'a'.repeat(101)}, 'keyword', '검색어는 100자 이내로 입력해주세요.'],
        ])('%s → 400 validation_errors.%s, 조회 없음', async (_label, query, property, message) => {
            const res = await request(app.getHttpServer()).get(PATH).query(query).set(internalHeaders());

            expect(res.status).toBe(400);
            expect(res.body.validation_errors).toEqual([{property, message}]);
            expect(repo.countUsers).not.toHaveBeenCalled();
        });
    });
});
