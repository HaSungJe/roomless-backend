import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, QueryFailedError} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {UserSettingEntity} from '@app/database/entities/user/user-setting.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {UserRepository} from '../repositories/user.repository.js';

/**
 * PostgreSQL 드라이버가 던지는 것과 같은 모양의 제약 위반 오류.
 *
 * @param code 23505(UK) | 23503(FK)
 * @param constraint 제약명
 * @returns QueryFailedError
 */
function constraintError(code: '23505' | '23503', constraint: string): QueryFailedError {
    return new QueryFailedError('INSERT ...', [], Object.assign(new Error('violates constraint'), {code, constraint}));
}

/**
 * txHost.tx(EntityManager)를 흉내 낸다 — getRepository(엔티티) 가 엔티티별 가짜 repository 를 돌려준다.
 *
 * @returns 저장소와 엔티티별 가짜 repository
 */
function makeRepository() {
    const fake = () => ({insert: vi.fn(), findOne: vi.fn(), find: vi.fn(), update: vi.fn()});
    const repos = new Map<unknown, ReturnType<typeof fake>>([
        [UserEntity, fake()],
        [UserSettingEntity, fake()],
        [SessionEntity, fake()],
        [SessionRefreshEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {
        repository: new UserRepository(txHost),
        user: repos.get(UserEntity)!,
        setting: repos.get(UserSettingEntity)!,
        session: repos.get(SessionEntity)!,
        refresh: repos.get(SessionRefreshEntity)!,
    };
}

const SERVER_ERROR = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

describe('UserRepository — TypeORM 오류 → HTTP 예외 매핑', () => {
    describe('insertUser', () => {
        it.each([
            ['23505', 'UK_User_LoginId', '이미 존재하는 로그인 ID입니다.'],
            ['23505', 'UK_User_UserSearchCode', '이미 존재하는 검색 코드입니다.'],
            ['23505', 'UK_User_SnsSnsUserId', '이미 가입된 SNS 계정입니다.'],
            ['23503', 'FK_User_Auth', '존재하지 않는 권한입니다.'],
            ['23503', 'FK_User_State', '존재하지 않는 상태입니다.'],
            ['23503', 'FK_User_Sns', '존재하지 않는 SNS 유형입니다.'],
        ] as const)('%s %s → 400 "%s"', async (code, constraint, message) => {
            const {repository, user} = makeRepository();
            user.insert.mockRejectedValueOnce(constraintError(code, constraint));

            const error = await repository.insertUser(new UserEntity()).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(BadRequestException);
            expect((error as BadRequestException).getResponse()).toEqual({message});
        });

        it('그 밖의 오류(다른 제약명 포함)는 통일 500', async () => {
            const {repository, user} = makeRepository();
            user.insert.mockRejectedValueOnce(constraintError('23505', 'UK_Unknown')).mockRejectedValueOnce(new Error('connection refused'));

            for (let i = 0; i < 2; i++) {
                const error = await repository.insertUser(new UserEntity()).catch((e: unknown) => e);
                expect(error).toBeInstanceOf(InternalServerErrorException);
                expect((error as InternalServerErrorException).getResponse()).toEqual({message: SERVER_ERROR});
            }
        });

        it('엔티티 인스턴스를 그대로 insert 에 넘긴다 (@BeforeInsert 트리거)', async () => {
            const {repository, user} = makeRepository();
            const entity = new UserEntity();

            await repository.insertUser(entity);

            expect(user.insert).toHaveBeenCalledWith(entity);
        });
    });

    describe('insertUserSetting', () => {
        it('UK_UserSetting_UserId 중복은 무시한다 (멱등)', async () => {
            const {repository, setting} = makeRepository();
            setting.insert.mockRejectedValueOnce(constraintError('23505', 'UK_UserSetting_UserId'));

            await expect(repository.insertUserSetting(new UserSettingEntity())).resolves.toBeUndefined();
        });

        it('FK_UserSetting_User 위반은 400', async () => {
            const {repository, setting} = makeRepository();
            setting.insert.mockRejectedValueOnce(constraintError('23503', 'FK_UserSetting_User'));

            const error = await repository.insertUserSetting(new UserSettingEntity()).catch((e: unknown) => e);

            expect((error as BadRequestException).getResponse()).toEqual({message: '존재하지 않는 회원입니다.'});
        });
    });

    describe('insertSession · insertSessionRefresh', () => {
        it('FK_Session_User 위반은 400 "존재하지 않는 회원입니다."', async () => {
            const {repository, session} = makeRepository();
            session.insert.mockRejectedValueOnce(constraintError('23503', 'FK_Session_User'));

            const error = await repository.insertSession(new SessionEntity()).catch((e: unknown) => e);

            expect((error as BadRequestException).getResponse()).toEqual({message: '존재하지 않는 회원입니다.'});
        });

        it.each([
            ['23505', 'UK_SessionRefresh_RefreshHash', '이미 존재하는 Refresh Token입니다.'],
            ['23503', 'FK_SessionRefresh_Session', '존재하지 않는 세션입니다.'],
        ] as const)('refresh %s %s → 400', async (code, constraint, message) => {
            const {repository, refresh} = makeRepository();
            refresh.insert.mockRejectedValueOnce(constraintError(code, constraint));

            const error = await repository.insertSessionRefresh(new SessionRefreshEntity()).catch((e: unknown) => e);

            expect((error as BadRequestException).getResponse()).toEqual({message});
        });
    });

    describe('조회 · 수정', () => {
        it('findUser · findUsers 는 loadRelationIds 로 FK ID 를 채운다', async () => {
            const {repository, user} = makeRepository();

            await repository.findUser({user_id: 'x'});
            await repository.findUsers({state_id: 'ACTIVE'});

            expect(user.findOne).toHaveBeenCalledWith({where: {user_id: 'x'}, loadRelationIds: true});
            expect(user.find).toHaveBeenCalledWith({where: {state_id: 'ACTIVE'}, loadRelationIds: true});
        });

        it('updateUser 는 where 와 엔티티를 그대로 update 에 넘긴다 (@BeforeUpdate 트리거)', async () => {
            const {repository, user} = makeRepository();
            const entity = Object.assign(new UserEntity(), {nickname: 'y'});

            await repository.updateUser({user_id: 'x'}, entity);

            expect(user.update).toHaveBeenCalledWith({user_id: 'x'}, entity);
        });

        it.each([
            ['findUser', 'user', 'findOne'],
            ['findUsers', 'user', 'find'],
            ['findSession', 'session', 'findOne'],
            ['findSessionRefresh', 'refresh', 'findOne'],
            ['updateSessionRefresh', 'refresh', 'update'],
            ['updateUser', 'user', 'update'],
        ] as const)('%s 실패는 통일 500', async (method, repo, fn) => {
            const fakes = makeRepository();
            fakes[repo][fn].mockRejectedValueOnce(new Error('db'));

            await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, new UserEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
        });
    });
});

describe('[SMOKE:data-access] findLoginUser 쿼리 — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: UserRepository;

    beforeAll(() => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        (dataSource as unknown as {buildMetadatas: () => void}).buildMetadatas();
        repository = new UserRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('회원 · 상태 · 회원설정을 조인하고 로그인 가능 조건으로 거른다', () => {
        const [sql, parameters] = repository.buildLoginUserQuery('u1').getQueryAndParameters();

        expect(parameters).toEqual(['u1']);
        expect(sql.replace(/\s+/g, ' ')).toBe(
            'SELECT "u"."user_id" AS "user_id", "u"."login_id" AS "login_id", "u"."name" AS "name", "u"."gender" AS "gender", "u"."birth" AS "birth", "u"."nickname" AS "nickname", ' +
                '"u"."auth_id" AS "auth_id", "u"."store_id" AS "store_id", "u"."state_id" AS "state_id", "s"."is_login_able" AS "is_login_able" ' +
                'FROM "t_user" "u" INNER JOIN "t_state" "s" ON "s"."state_id" = "u"."state_id" INNER JOIN "t_user_setting" "us" ON "us"."user_id" = "u"."user_id" ' +
                'WHERE "u"."user_id" = $1 AND "s"."is_login_able" = 1',
        );
    });

    it('select 별칭이 LoginUserRow 키와 같다', () => {
        const [sql] = repository.buildLoginUserQuery('u1').getQueryAndParameters();
        const aliases = [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((m) => m[1]);

        expect(aliases).toEqual(['user_id', 'login_id', 'name', 'gender', 'birth', 'nickname', 'auth_id', 'store_id', 'state_id', 'is_login_able']);
    });
});
