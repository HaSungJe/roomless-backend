import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, QueryFailedError} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {AdminRepository} from '../repositories/admin.repository.js';

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
    const fake = () => ({insert: vi.fn(), findOne: vi.fn(), update: vi.fn()});
    const repos = new Map<unknown, ReturnType<typeof fake>>([
        [UserEntity, fake()],
        [SessionEntity, fake()],
        [SessionRefreshEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {repository: new AdminRepository(txHost), user: repos.get(UserEntity)!, session: repos.get(SessionEntity)!, refresh: repos.get(SessionRefreshEntity)!};
}

describe('AdminRepository — TypeORM 오류 → HTTP 예외 매핑', () => {
    it('insertSession — FK_Session_User 위반은 400 "존재하지 않는 회원입니다."', async () => {
        const {repository, session} = makeRepository();
        session.insert.mockRejectedValueOnce(constraintError('23503', 'FK_Session_User'));

        const error = await repository.insertSession(new SessionEntity()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message: '존재하지 않는 회원입니다.'});
    });

    it('findSession 은 받은 조건에 is_deleted: 0 을 더해 loadRelationIds 로 조회한다(지워지지 않은 세션만)', async () => {
        const {repository, session} = makeRepository();

        await repository.findSession({session_id: 's1'});

        expect(session.findOne).toHaveBeenCalledWith({where: {session_id: 's1', is_deleted: 0}, loadRelationIds: true});
    });
    it('findAdmin 은 조건 그대로 loadRelationIds 로 조회한다', async () => {
        const {repository, user} = makeRepository();

        await repository.findAdmin({user_id: 'x', login_scope: 'ADMIN'});

        expect(user.findOne).toHaveBeenCalledWith({where: {user_id: 'x', login_scope: 'ADMIN'}, loadRelationIds: true});
    });

    it.each([
        ['findAdmin', 'user', 'findOne'],
        ['updateAdmin', 'user', 'update'],
        ['findSession', 'session', 'findOne'],
        ['findSessionRefresh', 'refresh', 'findOne'],
        ['updateSessionRefresh', 'refresh', 'update'],
    ] as const)('%s 실패는 통일 500', async (method, repo, fn) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(new Error('db'));

        await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, new UserEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });
});

describe('[SMOKE:data-access] findLoginAdmin 쿼리 — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: AdminRepository;

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new AdminRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('회원 · 상태를 조인하고 관리자 그룹 · 로그인 가능 조건으로 거른다', () => {
        const [sql, parameters] = repository.buildLoginAdminQuery('u1').getQueryAndParameters();

        expect(parameters).toEqual(['u1', 'ADMIN']);
        expect(sql.replace(/\s+/g, ' ')).toBe(
            'SELECT "u"."user_id" AS "user_id", "u"."login_id" AS "login_id", "u"."name" AS "name", "u"."auth_id" AS "auth_id", "u"."state_id" AS "state_id", ' +
                '"s"."is_login_allowed" AS "is_login_allowed" FROM "t_user" "u" INNER JOIN "t_state" "s" ON "s"."state_id" = "u"."state_id" ' +
                'WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."is_login_allowed" = 1',
        );
    });

    it('select 별칭이 LoginAdminRow 키와 같다', () => {
        const [sql] = repository.buildLoginAdminQuery('u1').getQueryAndParameters();
        const aliases = [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((m) => m[1]);

        expect(aliases).toEqual(['user_id', 'login_id', 'name', 'auth_id', 'state_id', 'is_login_allowed']);
    });
});
