import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, QueryFailedError} from 'typeorm';
import {ManagerStaffListDto} from '@app/contracts/manager/dto/manager-staff-list.dto.js';
import {ENTITIES} from '@app/database/entities.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {SessionRefreshEntity} from '@app/database/entities/user/session-refresh.entity.js';
import {SessionEntity} from '@app/database/entities/user/session.entity.js';
import {SmsVerificationEntity} from '@app/database/entities/user/sms-verification.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {buildStaffListWhere} from '../manager.util.js';
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
        [StoreEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {
        repository: new ManagerRepository(txHost),
        user: repos.get(UserEntity)!,
        session: repos.get(SessionEntity)!,
        refresh: repos.get(SessionRefreshEntity)!,
        sms: repos.get(SmsVerificationEntity)!,
        store: repos.get(StoreEntity)!,
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
        ['UK_User_LoginIdLoginScopeStoreId', '이미 사용 중인 아이디입니다.'],
        ['UK_User_PhoneLoginScopeStoreId', '이미 다른 계정에 등록된 휴대폰 번호입니다.'],
    ] as const)('insertStaff — 23505 %s(업체 안 유일) → 400 "%s"', async (constraint, message) => {
        const {repository, user} = makeRepository();
        user.insert.mockRejectedValueOnce(constraintError('23505', constraint));

        const error = await repository.insertStaff(new UserEntity()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message});
    });

    it('insertStaff — 업체 없는 계정용 UK(UK_User_LoginIdLoginScope)는 매니저 등록에서 걸리지 않으므로 통일 500', async () => {
        const {repository, user} = makeRepository();
        user.insert.mockRejectedValueOnce(constraintError('23505', 'UK_User_LoginIdLoginScope'));

        await expect(repository.insertStaff(new UserEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('updateStaff — 23505 UK_User_PhoneLoginScopeStoreId → 400 번호 문구, 넘긴 where · 엔티티 그대로', async () => {
        const {repository, user} = makeRepository();
        user.update.mockRejectedValueOnce(constraintError('23505', 'UK_User_PhoneLoginScopeStoreId'));
        const entity = Object.assign(new UserEntity(), {phone: '01022223333'});

        const error = await repository.updateStaff({user_id: 'x'}, entity).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message: '이미 다른 계정에 등록된 휴대폰 번호입니다.'});
        expect(user.update).toHaveBeenCalledWith({user_id: 'x'}, entity);
    });

    it('findManagerStore 는 조건 그대로 업체를 loadRelationIds 로 조회한다(업체코드 · 업체 ID)', async () => {
        const {repository, store} = makeRepository();

        await repository.findManagerStore({store_code: 'c1'});

        expect(store.findOne).toHaveBeenCalledWith({where: {store_code: 'c1'}, loadRelationIds: true});
    });

    it.each([
        ['findManager', 'user', 'findOne'],
        ['updateManager', 'user', 'update'],
        ['findManagerStore', 'store', 'findOne'],
        ['countStaff', 'user', 'count'],
        ['insertStaff', 'user', 'insert'],
        ['updateStaff', 'user', 'update'],
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

describe('[SMOKE:data-access] findLoginManager · consumeSmsVerificationAttempt · 업체 인력 목록 쿼리 — DB 연결 없이 SQL 빌드', () => {
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

    const USER_SELECT =
        'SELECT "u"."user_id" AS "u_user_id", "u"."user_search_code" AS "u_user_search_code", "u"."sns_user_id" AS "u_sns_user_id", "u"."login_id" AS "u_login_id", ' +
        '"u"."login_scope" AS "u_login_scope", "u"."login_pw" AS "u_login_pw", "u"."name" AS "u_name", "u"."gender" AS "u_gender", "u"."birth" AS "u_birth", "u"."phone" AS "u_phone", ' +
        '"u"."phone_verified_at" AS "u_phone_verified_at", "u"."nickname" AS "u_nickname", "u"."device_os" AS "u_device_os", "u"."device_token" AS "u_device_token", ' +
        '"u"."is_password_change_required" AS "u_is_password_change_required", "u"."block_comment" AS "u_block_comment", "u"."leave_comment" AS "u_leave_comment", ' +
        '"u"."leave_reserved_at" AS "u_leave_reserved_at", "u"."leave_previous_state_id" AS "u_leave_previous_state_id", "u"."leave_backup" AS "u_leave_backup", ' +
        '"u"."created_at" AS "u_created_at", "u"."updated_at" AS "u_updated_at", "u"."auth_id" AS "u_auth_id", "u"."state_id" AS "u_state_id", "u"."sns_id" AS "u_sns_id", ' +
        '"u"."store_id" AS "u_store_id" FROM "t_user" "u"';

    it('업체 인력 목록 — 그 업체 · 매니저 그룹 · 삭제 제외 + 검색어 OR(아이디 · 이름 · 번호, 이스케이프), 업체 총관리자가 위 · 등록일 최신순 · 페이지', () => {
        const [sql, parameters] = repository.buildStaffListQuery(buildStaffListWhere('s1', new ManagerStaffListDto({keyword: 'a_b'})), 20, 0).getQueryAndParameters();

        expect(parameters).toEqual(['MANAGER', 's1', 'ACTIVE', 'BLOCK', '%a\\_b%', 'MANAGER', 's1', 'ACTIVE', 'BLOCK', '%a\\_b%', 'MANAGER', 's1', 'ACTIVE', 'BLOCK', '%a\\_b%']);
        expect(sql.replace(/\s+/g, ' ')).toBe(
            `${USER_SELECT} WHERE ((((` +
                '"u"."login_scope" = $1) AND ("u"."store_id" = $2) AND ("u"."state_id" IN ($3, $4)) AND ("u"."login_id" ILIKE $5))) OR ((' +
                '("u"."login_scope" = $6) AND ("u"."store_id" = $7) AND ("u"."state_id" IN ($8, $9)) AND ("u"."name" ILIKE $10))) OR ((' +
                '("u"."login_scope" = $11) AND ("u"."store_id" = $12) AND ("u"."state_id" IN ($13, $14)) AND ("u"."phone" ILIKE $15)))) ' +
                'ORDER BY "u"."auth_id" ASC, "u"."created_at" DESC LIMIT 20 OFFSET 0',
        );
    });

    it('업체 인력 목록 — 검색어가 없으면 기본 조건 하나', () => {
        const [sql, parameters] = repository.buildStaffListQuery(buildStaffListWhere('s1', new ManagerStaffListDto()), 20, 0).getQueryAndParameters();

        expect(parameters).toEqual(['MANAGER', 's1', 'ACTIVE', 'BLOCK']);
        expect(sql.replace(/\s+/g, ' ')).toBe(
            `${USER_SELECT} WHERE (((("u"."login_scope" = $1) AND ("u"."store_id" = $2) AND ("u"."state_id" IN ($3, $4))))) ORDER BY "u"."auth_id" ASC, "u"."created_at" DESC LIMIT 20 OFFSET 0`,
        );
    });
});
