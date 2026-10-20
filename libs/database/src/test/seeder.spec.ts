import type {DataSource} from 'typeorm';
import {In} from 'typeorm';
import {getBcrypt} from '@app/common/utils/bcrypt.js';
import {AuthEntity} from '@app/database/entities/user/auth.entity.js';
import {SmsPurposeEntity} from '@app/database/entities/user/sms-purpose.entity.js';
import {SnsEntity} from '@app/database/entities/user/sns.entity.js';
import {StateEntity} from '@app/database/entities/user/state.entity.js';
import {UserSettingEntity} from '@app/database/entities/user/user-setting.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {SeederService} from '@app/database/seeder/seeder.service.js';
import {AUTH_SEED_DATA, SEED_TARGETS, SMS_PURPOSE_SEED_DATA, SNS_SEED_DATA, STATE_SEED_DATA} from '@app/database/seeder/seeder.targets.js';
import {pickMissingRows} from '@app/database/seeder/seeder.util.js';

vi.mock('@app/common/utils/bcrypt.js', () => ({getBcrypt: vi.fn(), matchBcrypt: vi.fn()}));

/** 32자 hex ID */
const ID_PATTERN = /^[a-f0-9]{32}$/;

/** 가짜 repository — find · findOne · insert */
type FakeRepo = {find: ReturnType<typeof vi.fn>; findOne: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn>; metadata: object};

/**
 * 엔티티별 find · findOne · insert 를 가진 가짜 DataSource.
 *
 * @param existing 엔티티별 이미 있는 행
 * @returns DataSource mock 과 엔티티별 repository mock
 */
function makeDataSource(existing: Map<unknown, unknown[]> = new Map()) {
    const pkOf = new Map<unknown, string>([
        [AuthEntity, 'auth_id'],
        [StateEntity, 'state_id'],
        [SnsEntity, 'sns_id'],
        [SmsPurposeEntity, 'sms_purpose_id'],
        [UserEntity, 'user_id'],
        [UserSettingEntity, 'user_setting_id'],
    ]);
    const tableOf = new Map<unknown, string>([
        [AuthEntity, 't_auth'],
        [StateEntity, 't_state'],
        [SnsEntity, 't_sns'],
        [SmsPurposeEntity, 't_sms_purpose'],
        [UserEntity, 't_user'],
        [UserSettingEntity, 't_user_setting'],
    ]);
    const repos = new Map<unknown, FakeRepo>();
    for (const entity of pkOf.keys()) {
        repos.set(entity, {
            find: vi.fn().mockResolvedValue(existing.get(entity) ?? []),
            findOne: vi.fn().mockResolvedValue(null),
            insert: vi.fn().mockResolvedValue({}),
            metadata: {primaryColumns: [{propertyName: pkOf.get(entity)}], tableName: tableOf.get(entity)},
        });
    }
    const dataSource = {getRepository: (entity: unknown) => repos.get(entity)} as unknown as DataSource;
    return {dataSource, repos};
}

describe('pickMissingRows', () => {
    it('확인 컬럼 값이 이미 있는 행을 빼고 돌려준다', () => {
        const rows = [{id: 'A'}, {id: 'B'}, {id: 'C'}];

        expect(pickMissingRows(rows, [{id: 'B'}], 'id')).toEqual([{id: 'A'}, {id: 'C'}]);
        expect(pickMissingRows(rows, [], 'id')).toEqual(rows);
        expect(pickMissingRows(rows, rows, 'id')).toEqual([]);
    });
});

describe('SeederService', () => {
    beforeEach(() => {
        vi.mocked(getBcrypt).mockResolvedValue('$2b$12$admin');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('[SUCCESS] 기본 데이터 멱등 입력', () => {
        it('빈 DB 면 대상 순서대로 전부 insert — 룩업 · SMS 용도 · 첫 총관리자 · 그 회원 설정', async () => {
            const {dataSource, repos} = makeDataSource();
            repos.get(UserEntity)!.findOne.mockResolvedValueOnce({user_id: 'a'.repeat(32), login_id: 'admin'});

            await new SeederService(dataSource).onApplicationBootstrap();

            expect(repos.get(AuthEntity)!.insert).toHaveBeenCalledWith(AUTH_SEED_DATA);
            expect(repos.get(StateEntity)!.insert).toHaveBeenCalledWith(STATE_SEED_DATA);
            expect(repos.get(SnsEntity)!.insert).toHaveBeenCalledWith(SNS_SEED_DATA);
            expect(repos.get(SmsPurposeEntity)!.insert).toHaveBeenCalledWith(SMS_PURPOSE_SEED_DATA);

            const [admin] = repos.get(UserEntity)!.insert.mock.calls[0][0];
            expect(admin).toBeInstanceOf(UserEntity);
            expect(admin.user_id).toMatch(ID_PATTERN);
            expect(admin).toMatchObject({login_id: 'admin', login_pw: '$2b$12$admin', auth_id: 'SUPER_ADMIN', state_id: 'ACTIVE', is_password_change_required: 1, phone: null});
            expect(getBcrypt).toHaveBeenCalledWith('1234');

            expect(repos.get(UserEntity)!.findOne).toHaveBeenCalledWith({where: {login_id: 'admin'}});
            const [setting] = repos.get(UserSettingEntity)!.insert.mock.calls[0][0];
            expect(setting).toBeInstanceOf(UserSettingEntity);
            expect(setting).toMatchObject({user_id: 'a'.repeat(32), bio: null});

            const order = [AuthEntity, StateEntity, SnsEntity, SmsPurposeEntity, UserEntity, UserSettingEntity].map((e) => repos.get(e)!.insert.mock.invocationCallOrder[0]);
            expect(order).toEqual([...order].sort((a, b) => a - b));
        });

        it('총관리자 존재 확인은 login_id 기준 — 이미 있으면 insert 하지 않는다(바꾼 비밀번호를 덮지 않는다)', async () => {
            const {dataSource, repos} = makeDataSource(new Map([[UserEntity, [{user_id: 'a'.repeat(32), login_id: 'admin'}]]]));

            await new SeederService(dataSource).onApplicationBootstrap();

            expect(repos.get(UserEntity)!.find).toHaveBeenCalledWith({where: {login_id: In(['admin'])}});
            expect(repos.get(UserEntity)!.insert).not.toHaveBeenCalled();
        });

        it('회원 설정 확인은 user_id 기준 — 이미 있으면 insert 하지 않는다', async () => {
            const {dataSource, repos} = makeDataSource(new Map([[UserSettingEntity, [{user_setting_id: 's'.repeat(32), user_id: 'a'.repeat(32)}]]]));
            repos.get(UserEntity)!.findOne.mockResolvedValueOnce({user_id: 'a'.repeat(32), login_id: 'admin'});

            await new SeederService(dataSource).onApplicationBootstrap();

            expect(repos.get(UserSettingEntity)!.find).toHaveBeenCalledWith({where: {user_id: In(['a'.repeat(32)])}});
            expect(repos.get(UserSettingEntity)!.insert).not.toHaveBeenCalled();
        });

        it('총관리자가 없으면(findOne null) 회원 설정을 만들지 않는다', async () => {
            const {dataSource, repos} = makeDataSource();

            await new SeederService(dataSource).onApplicationBootstrap();

            expect(repos.get(UserSettingEntity)!.find).not.toHaveBeenCalled();
            expect(repos.get(UserSettingEntity)!.insert).not.toHaveBeenCalled();
        });

        it('key 가 없는 대상(룩업)은 PK 기준 — 이미 있는 PK 는 건너뛰고 없는 행만 insert, 입력 건수를 돌려준다', async () => {
            const {dataSource, repos} = makeDataSource(new Map([[AuthEntity, [{auth_id: 'USER'}, {auth_id: 'ADMIN'}]]]));

            const count = await new SeederService(dataSource).seedEntity(AuthEntity, AUTH_SEED_DATA);

            expect(count).toBe(3);
            expect(repos.get(AuthEntity)!.find).toHaveBeenCalledWith({where: {auth_id: In(AUTH_SEED_DATA.map((row) => row.auth_id))}});
            expect(repos.get(AuthEntity)!.insert.mock.calls[0][0].map((r: AuthEntity) => r.auth_id)).toEqual(['SUPER_ADMIN', 'HEAD_MANAGER', 'MANAGER']);
        });

        it('모두 있으면 insert 하지 않는다', async () => {
            const {dataSource, repos} = makeDataSource(new Map([[SnsEntity, SNS_SEED_DATA]]));

            await expect(new SeederService(dataSource).seedEntity(SnsEntity, SNS_SEED_DATA)).resolves.toBe(0);
            expect(repos.get(SnsEntity)!.insert).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:target] 대상별 실패 격리', () => {
        it('한 대상이 실패해도 다음 대상은 계속 입력한다', async () => {
            const {dataSource, repos} = makeDataSource();
            repos.get(StateEntity)!.find.mockRejectedValueOnce(new Error('relation "t_state" does not exist'));

            await new SeederService(dataSource).onApplicationBootstrap();

            expect(repos.get(StateEntity)!.insert).not.toHaveBeenCalled();
            expect(repos.get(SnsEntity)!.insert).toHaveBeenCalledTimes(1);
        });

        it('만드는 함수가 실패(getBcrypt reject)하면 그 대상만 건너뛰고 다음 대상(회원 설정)은 계속', async () => {
            const {dataSource, repos} = makeDataSource();
            vi.mocked(getBcrypt).mockRejectedValueOnce(new Error('BCRYPT_ROUNDS 가 잘못됐습니다'));
            repos.get(UserEntity)!.findOne.mockResolvedValueOnce({user_id: 'a'.repeat(32), login_id: 'admin'});

            await new SeederService(dataSource).onApplicationBootstrap();

            expect(repos.get(UserEntity)!.insert).not.toHaveBeenCalled();
            expect(repos.get(UserSettingEntity)!.insert).toHaveBeenCalledTimes(1);
        });

        it('실패한 대상은 null 을 돌려준다', async () => {
            const {dataSource, repos} = makeDataSource();
            repos.get(AuthEntity)!.insert.mockRejectedValueOnce(new Error('db'));

            await expect(new SeederService(dataSource).seedEntity(AuthEntity, AUTH_SEED_DATA)).resolves.toBeNull();
        });
    });

    describe('기본 데이터 정합성', () => {
        it('가입 · 로그인 DTO 가 허용하는 SNS 유형(NAVER · KAKAO)이 모두 시드에 있다 (FK_User_Sns 위반 방지)', () => {
            expect(SNS_SEED_DATA.map((row) => row.sns_id)).toEqual(expect.arrayContaining(['NAVER', 'KAKAO']));
        });

        it('SMS 인증 용도 3개가 시드에 있다 (FK_SmsVerification_SmsPurpose 위반 방지)', () => {
            expect(SMS_PURPOSE_SEED_DATA.map((row) => row.sms_purpose_id)).toEqual(['PHONE_VERIFY', 'FIND_LOGIN_ID', 'PASSWORD_RESET']);
        });

        it('회원 가입이 쓰는 권한 USER · 상태 ACTIVE 가 시드에 있고, FK 부모 순서를 지킨다', () => {
            expect(AUTH_SEED_DATA.map((row) => row.auth_id)).toContain('USER');
            expect(STATE_SEED_DATA.map((row) => row.state_id)).toContain('ACTIVE');
            expect(SEED_TARGETS.map((target) => target.entity)).toEqual([AuthEntity, StateEntity, SnsEntity, SmsPurposeEntity, UserEntity, UserSettingEntity]);
            expect(SEED_TARGETS.map((target) => target.key)).toEqual([undefined, undefined, undefined, undefined, 'login_id', 'user_id']);
        });
    });
});
