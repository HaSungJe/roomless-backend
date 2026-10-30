import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, QueryFailedError} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
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
    /** 갱신 QueryBuilder 체인 — 빌더 메서드는 자기 자신, execute 만 결과 */
    const chain = {update: vi.fn(), set: vi.fn(), where: vi.fn(), andWhere: vi.fn(), execute: vi.fn()};
    chain.update.mockReturnValue(chain);
    chain.set.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.andWhere.mockReturnValue(chain);
    const fake = () => ({insert: vi.fn(), findOne: vi.fn(), find: vi.fn(), update: vi.fn(), count: vi.fn(), createQueryBuilder: vi.fn(() => chain)});
    const repos = new Map<unknown, ReturnType<typeof fake>>([
        [UserEntity, fake()],
        [UserSettingEntity, fake()],
        [SessionEntity, fake()],
        [SessionRefreshEntity, fake()],
        [SmsVerificationEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {
        repository: new UserRepository(txHost),
        user: repos.get(UserEntity)!,
        setting: repos.get(UserSettingEntity)!,
        session: repos.get(SessionEntity)!,
        refresh: repos.get(SessionRefreshEntity)!,
        sms: repos.get(SmsVerificationEntity)!,
        chain,
    };
}

const SERVER_ERROR = '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.';

describe('UserRepository — TypeORM 오류 → HTTP 예외 매핑', () => {
    describe('insertUser', () => {
        it.each([
            ['23505', 'UK_User_LoginIdLoginScope', '이미 존재하는 로그인 ID입니다.'],
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

    describe('insertSmsVerification', () => {
        it.each([
            ['FK_SmsVerification_SmsPurpose', '존재하지 않는 SMS 인증 용도입니다.'],
            ['FK_SmsVerification_User', '존재하지 않는 회원입니다.'],
        ] as const)('23503 %s → 400 "%s"', async (constraint, message) => {
            const {repository, sms} = makeRepository();
            sms.insert.mockRejectedValueOnce(constraintError('23503', constraint));

            const error = await repository.insertSmsVerification(new SmsVerificationEntity()).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(BadRequestException);
            expect((error as BadRequestException).getResponse()).toEqual({message});
        });

        it('그 밖의 오류는 통일 500', async () => {
            const {repository, sms} = makeRepository();
            sms.insert.mockRejectedValueOnce(new Error('db'));

            await expect(repository.insertSmsVerification(new SmsVerificationEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
        });
    });

    describe('updateUser — 휴대폰 번호 경쟁', () => {
        it('23505 UK_User_PhoneLoginScope(같은 로그인 그룹) → 400 "이미 가입된 번호입니다."', async () => {
            const {repository, user} = makeRepository();
            user.update.mockRejectedValueOnce(constraintError('23505', 'UK_User_PhoneLoginScope'));

            const error = await repository.updateUser({user_id: 'x'}, Object.assign(new UserEntity(), {phone: '01012345678'})).catch((e: unknown) => e);

            expect(error).toBeInstanceOf(BadRequestException);
            expect((error as BadRequestException).getResponse()).toEqual({message: '이미 가입된 번호입니다.'});
        });
    });

    describe('consumeSmsVerificationAttempt', () => {
        it.each([
            [1, true],
            [0, false],
        ])('갱신 행 %i → %s (한도에 닿았으면 false)', async (affected, expected) => {
            const {repository, chain} = makeRepository();
            chain.execute.mockResolvedValueOnce({affected});

            await expect(repository.consumeSmsVerificationAttempt('v1', 3)).resolves.toBe(expected);
            expect(chain.where).toHaveBeenCalledWith('sms_verification_id = :sms_verification_id', {sms_verification_id: 'v1'});
            expect(chain.andWhere).toHaveBeenCalledWith('attempt_count < :max_attempts', {max_attempts: 3});
        });

        it('실패는 통일 500', async () => {
            const {repository, chain} = makeRepository();
            chain.execute.mockRejectedValueOnce(new Error('db'));

            await expect(repository.consumeSmsVerificationAttempt('v1', 3)).rejects.toBeInstanceOf(InternalServerErrorException);
        });
    });

    describe('조회 · 수정', () => {
        it('findSmsVerification 은 인증 ID 조건 그대로 loadRelationIds 로 조회한다', async () => {
            const {repository, sms} = makeRepository();

            await repository.findSmsVerification({sms_verification_id: 'v1', sms_purpose_id: 'PHONE_VERIFY'});

            expect(sms.findOne).toHaveBeenCalledWith({where: {sms_verification_id: 'v1', sms_purpose_id: 'PHONE_VERIFY'}, loadRelationIds: true});
        });

        it('findSession 은 받은 조건에 is_deleted: 0 을 더해 loadRelationIds 로 조회한다(지워지지 않은 세션만)', async () => {
            const {repository, session} = makeRepository();

            await repository.findSession({session_id: 's1'});

            expect(session.findOne).toHaveBeenCalledWith({where: {session_id: 's1', is_deleted: 0}, loadRelationIds: true});
        });
        it('findUser 는 loadRelationIds 로 FK ID 를 채운다', async () => {
            const {repository, user} = makeRepository();

            await repository.findUser({user_id: 'x'});

            expect(user.findOne).toHaveBeenCalledWith({where: {user_id: 'x'}, loadRelationIds: true});
        });

        it('updateUser 는 where 와 엔티티를 그대로 update 에 넘긴다 (@BeforeUpdate 트리거)', async () => {
            const {repository, user} = makeRepository();
            const entity = Object.assign(new UserEntity(), {nickname: 'y'});

            await repository.updateUser({user_id: 'x'}, entity);

            expect(user.update).toHaveBeenCalledWith({user_id: 'x'}, entity);
        });

        it.each([
            ['findUser', 'user', 'findOne'],
            ['findSession', 'session', 'findOne'],
            ['findSessionRefresh', 'refresh', 'findOne'],
            ['updateSessionRefresh', 'refresh', 'update'],
            ['updateUser', 'user', 'update'],
            ['countSmsVerifications', 'sms', 'count'],
            ['findSmsVerification', 'sms', 'findOne'],
            ['updateSmsVerification', 'sms', 'update'],
        ] as const)('%s 실패는 통일 500', async (method, repo, fn) => {
            const fakes = makeRepository();
            fakes[repo][fn].mockRejectedValueOnce(new Error('db'));

            await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, new UserEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
        });
    });
});

describe('[SMOKE:data-access] findLoginUser · consumeSmsVerificationAttempt 쿼리 — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: UserRepository;

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new UserRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('회원 · 상태 · 회원설정을 조인하고 이용자 그룹 · 로그인 가능 조건으로 거른다', () => {
        const [sql, parameters] = repository.buildLoginUserQuery('u1').getQueryAndParameters();

        expect(parameters).toEqual(['u1', 'USER']);
        expect(sql.replace(/\s+/g, ' ')).toBe(
            'SELECT "u"."user_id" AS "user_id", "u"."login_id" AS "login_id", "u"."name" AS "name", "u"."gender" AS "gender", "u"."birth" AS "birth", "u"."nickname" AS "nickname", ' +
                '"u"."auth_id" AS "auth_id", "u"."store_id" AS "store_id", "u"."state_id" AS "state_id", "u"."phone_verified_at" AS "phone_verified_at", "s"."is_login_allowed" AS "is_login_allowed" ' +
                'FROM "t_user" "u" INNER JOIN "t_state" "s" ON "s"."state_id" = "u"."state_id" INNER JOIN "t_user_setting" "us" ON "us"."user_id" = "u"."user_id" ' +
                'WHERE "u"."user_id" = $1 AND "u"."login_scope" = $2 AND "s"."is_login_allowed" = 1',
        );
    });

    it('select 별칭이 LoginUserRow 키와 같다', () => {
        const [sql] = repository.buildLoginUserQuery('u1').getQueryAndParameters();
        const aliases = [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((m) => m[1]);

        expect(aliases).toEqual(['user_id', 'login_id', 'name', 'gender', 'birth', 'nickname', 'auth_id', 'store_id', 'state_id', 'phone_verified_at', 'is_login_allowed']);
    });

    it('SMS 인증 시도 소비 — 한도 미만인 행만 원자적으로 +1, 수정일 갱신', () => {
        const [sql, parameters] = repository.buildConsumeSmsVerificationAttemptQuery('v1', 3).getQueryAndParameters();

        expect(parameters).toEqual(['v1', 3]);
        expect(sql).toBe('UPDATE "t_sms_verification" SET "attempt_count" = "attempt_count" + 1, "updated_at" = CURRENT_TIMESTAMP WHERE "sms_verification_id" = $1 AND "attempt_count" < $2');
    });
});
