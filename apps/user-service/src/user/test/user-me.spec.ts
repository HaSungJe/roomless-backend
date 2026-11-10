import {INestApplication} from '@nestjs/common';
import request from 'supertest';
import {INTERNAL_HEADER} from '@app/contracts/actor.js';
import {bootHttpPath, createJwtServiceMock, createUserRepositoryMock, internalHeaders, UserRepositoryMock} from './user.test-helper.js';

const USER_ID = 'u'.repeat(32);
const PATH = '/internal/v1/user-service/user/me';

/** 게이트웨이가 로그인 이용자를 붙여 보내는 내부 요청 헤더 */
const actorHeaders = (user_id: string = USER_ID): Record<string, string> => ({...internalHeaders(), [INTERNAL_HEADER.ACTOR_USER_ID]: user_id, [INTERNAL_HEADER.ACTOR_AUTH_ID]: 'USER'});

/** 이용자 회원 행 (findUser 결과) */
const USER = {
    user_id: USER_ID,
    user_search_code: 'A1B2C3D4',
    auth_id: 'USER',
    state_id: 'ACTIVE',
    sns_id: 'KAKAO',
    sns_user_id: 'kakao-123',
    store_id: null,
    login_id: 'KAKAO_20260101000000000',
    login_scope: 'USER',
    login_pw: 'hashed',
    name: '김하늘',
    gender: 'F',
    birth: '1995-03-02',
    phone: null,
    phone_verified_at: null,
    nickname: '여행하는고양이',
    block_comment: null,
    leave_reserved_at: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('GET /internal/v1/user-service/user/me — 내 정보 (이용자, 동기 경로)', () => {
    let app: INestApplication;
    let repo: UserRepositoryMock;

    beforeEach(async () => {
        repo = createUserRepositoryMock();
        app = await bootHttpPath(repo, createJwtServiceMock('a', 'r'));
    });

    afterEach(async () => {
        vi.clearAllMocks();
        await app.close();
    });

    describe('[SUCCESS]', () => {
        it('로그인 이용자 본인을 이용자 그룹 조건으로 찾아 내 정보로 돌려준다 — 미인증이면 phone null · is_phone_verified 0', async () => {
            repo.findUser.mockResolvedValueOnce(USER);

            const res = await request(app.getHttpServer()).get(PATH).set(actorHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                user_id: USER_ID,
                user_search_code: 'A1B2C3D4',
                nickname: '여행하는고양이',
                gender: 'F',
                birth: '1995-03-02',
                sns_id: 'KAKAO',
                phone: null,
                is_phone_verified: 0,
                state_id: 'ACTIVE',
                block_comment: null,
                leave_reserved_at: null,
                created_at: '2026-01-01T00:00:00.000Z',
            });
            expect(repo.findUser).toHaveBeenCalledTimes(1);
            expect(repo.findUser).toHaveBeenCalledWith({user_id: USER_ID, login_scope: 'USER'});
        });

        it('휴대폰 인증 · 이용 제한 회원이면 번호 · is_phone_verified 1 · 이용 제한 사유를 함께 돌려준다', async () => {
            repo.findUser.mockResolvedValueOnce({...USER, phone: '01012345678', phone_verified_at: new Date('2026-01-02T00:00:00.000Z'), state_id: 'BLOCK', block_comment: '노쇼 반복'});

            const res = await request(app.getHttpServer()).get(PATH).set(actorHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({phone: '01012345678', is_phone_verified: 1, state_id: 'BLOCK', block_comment: '노쇼 반복', leave_reserved_at: null});
        });

        it('탈퇴 대기 회원이면 탈퇴 예정 시각을 그대로 돌려준다', async () => {
            repo.findUser.mockResolvedValueOnce({...USER, state_id: 'LEAVE_WAIT', leave_reserved_at: '2026-01-15 00:00:00'});

            const res = await request(app.getHttpServer()).get(PATH).set(actorHeaders());

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({state_id: 'LEAVE_WAIT', leave_reserved_at: '2026-01-15 00:00:00'});
        });
    });

    describe('[FAIL:service]', () => {
        it('이용자 그룹 회원이 아니거나 없으면(조회 null) 404', async () => {
            repo.findUser.mockResolvedValueOnce(null);

            const res = await request(app.getHttpServer()).get(PATH).set(actorHeaders());

            expect(res.status).toBe(404);
            expect(res.body).toEqual({message: '회원 정보를 찾을 수 없습니다.', validation_errors: null});
            expect(repo.findUser).toHaveBeenCalledWith({user_id: USER_ID, login_scope: 'USER'});
        });
    });

    describe('[SECURITY]', () => {
        it('게이트웨이 내부 토큰이 없으면 403 이고 조회하지 않는다', async () => {
            const res = await request(app.getHttpServer())
                .get(PATH)
                .set({[INTERNAL_HEADER.ACTOR_USER_ID]: USER_ID, [INTERNAL_HEADER.ACTOR_AUTH_ID]: 'USER'});

            expect(res.status).toBe(403);
            expect(repo.findUser).not.toHaveBeenCalled();
        });
    });
});
