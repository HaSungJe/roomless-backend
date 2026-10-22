import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, QueryFailedError} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {ManagerRepository} from '../repositories/manager.repository.js';

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
    const fake = () => ({insert: vi.fn(), findOne: vi.fn(), update: vi.fn(), count: vi.fn()});
    const repos = new Map<unknown, ReturnType<typeof fake>>([
        [UserEntity, fake()],
        [SessionEntity, fake()],
        [SessionRefreshEntity, fake()],
        [SmsVerificationEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {
        repository: new ManagerRepository(txHost),
        user: repos.get(UserEntity)!,
        session: repos.get(SessionEntity)!,
        refresh: repos.get(SessionRefreshEntity)!,
        sms: repos.get(SmsVerificationEntity)!,
    };
}

describe('ManagerRepository — TypeORM 오류 → HTTP 예외 매핑', () => {
    it('insertSession — FK_Session_User 위반은 400 "존재하지 않는 회원입니다."', async () => {
        const {repository, session} = makeRepository();
        session.insert.mockRejectedValueOnce(constraintError('23503', 'FK_Session_User'));

        const error = await repository.insertSession(new SessionEntity()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message: '존재하지 않는 회원입니다.'});
    });

    it.each([
        ['23505', 'UK_SessionRefresh_RefreshHash', '이미 존재하는 Refresh Token입니다.'],
        ['23503', 'FK_SessionRefresh_Session', '존재하지 않는 세션입니다.'],
    ] as const)('insertSessionRefresh — %s %s → 400 "%s"', async (code, constraint, message) => {
        const {repository, refresh} = makeRepository();
        refresh.insert.mockRejectedValueOnce(constraintError(code, constraint));

        const error = await repository.insertSessionRefresh(new SessionRefreshEntity()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message});
    });

    it.each([
        ['FK_SmsVerification_SmsPurpose', '존재하지 않는 SMS 인증 용도입니다.'],
        ['FK_SmsVerification_User', '존재하지 않는 회원입니다.'],
    ] as const)('insertSmsVerification — 23503 %s → 400 "%s"', async (constraint, message) => {
        const {repository, sms} = makeRepository();
        sms.insert.mockRejectedValueOnce(constraintError('23503', constraint));

        const error = await repository.insertSmsVerification(new SmsVerificationEntity()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message});
    });

    it('findManager 는 조건 그대로 loadRelationIds 로 조회한다', async () => {
        const {repository, user} = makeRepository();

        await repository.findManager({user_id: 'x', login_scope: 'MANAGER'});

        expect(user.findOne).toHaveBeenCalledWith({where: {user_id: 'x', login_scope: 'MANAGER'}, loadRelationIds: true});
    });

    it('updateManager 는 where 와 엔티티를 그대로 update 에 넘긴다 (@BeforeUpdate 트리거)', async () => {
        const {repository, user} = makeRepository();
        const entity = Object.assign(new UserEntity(), {login_pw: 'h'});

        await repository.updateManager({user_id: 'x'}, entity);

        expect(user.update).toHaveBeenCalledWith({user_id: 'x'}, entity);
    });

    it.each([
        ['findManager', 'user', 'findOne'],
        ['updateManager', 'user', 'update'],
        ['findSession', 'session', 'findOne'],
        ['findSessionRefresh', 'refresh', 'findOne'],
        ['updateSessionRefresh', 'refresh', 'update'],
        ['countSmsVerifications', 'sms', 'count'],
        ['findSmsVerification', 'sms', 'findOne'],
        ['updateSmsVerification', 'sms', 'update'],
    ] as const)('%s 실패는 통일 500', async (method, repo, fn) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(new Error('db'));

        await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, new UserEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });
});

describe('[SMOKE:data-access] findLoginManager · consumeSmsVerificationAttempt 쿼리 — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: ManagerRepository;

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new ManagerRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('회원 · 상태를 조인하고 매니저 그룹 · 로그인 가능 조건으로 거른다', () => {
        const [sql, parameters] = repository.buildLoginManagerQuery('u1').getQueryAndParameters();

        expect(parameters).toEqual(['u1', 'MANAGER']);
        expect(sql.replace(/\s+/g, ' ')).toBe(
            'SELECT "u"."user_id" AS "user_id", "u"."login_id" AS "login_id", "u"."name" AS "name", "u"."auth_id" AS "auth_id", "u"."store_id" AS "store_id", "u"."state_id" AS "state_id", ' +
                '"s"."is_login_allowed" AS "is_login_allowed" FROM "t_user" "u" INNER JOIN "t_state" "s" ON "s"."state_id" = "u"."state_id" ' +
                'WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."is_login_allowed" = 1',
        );
    });

    it('select 별칭이 LoginManagerRow 키와 같다', () => {
        const [sql] = repository.buildLoginManagerQuery('u1').getQueryAndParameters();
        const aliases = [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((m) => m[1]);

        expect(aliases).toEqual(['user_id', 'login_id', 'name', 'auth_id', 'store_id', 'state_id', 'is_login_allowed']);
    });

    it('SMS 인증 시도 소비 — 한도 미만인 행만 원자적으로 +1, 수정일 갱신', () => {
        const [sql, parameters] = repository.buildConsumeSmsVerificationAttemptQuery('v1', 3).getQueryAndParameters();

        expect(parameters).toEqual(['v1', 3]);
        expect(sql).toBe('UPDATE "t_sms_verification" SET "attempt_count" = "attempt_count" + 1, "updated_at" = CURRENT_TIMESTAMP WHERE "sms_verification_id" = $1 AND "attempt_count" < $2');
    });
});
