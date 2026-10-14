import type {DataSource} from 'typeorm';
import {AuthEntity} from '@app/database/entities/user/auth.entity.js';
import {SnsEntity} from '@app/database/entities/user/sns.entity.js';
import {StateEntity} from '@app/database/entities/user/state.entity.js';
import {SeederService} from '@app/database/seeder/seeder.service.js';
import {AUTH_SEED_DATA, SEED_TARGETS, SNS_SEED_DATA, STATE_SEED_DATA} from '@app/database/seeder/seeder.targets.js';
import {pickMissingRows} from '@app/database/seeder/seeder.util.js';

/**
 * 엔티티별 find · insert 를 가진 가짜 DataSource.
 *
 * @param existing 엔티티별 이미 있는 행
 * @returns DataSource mock 과 엔티티별 repository mock
 */
function makeDataSource(existing: Map<unknown, unknown[]> = new Map()) {
    const pkOf = new Map<unknown, string>([
        [AuthEntity, 'auth_id'],
        [StateEntity, 'state_id'],
        [SnsEntity, 'sns_id'],
    ]);
    const tableOf = new Map<unknown, string>([
        [AuthEntity, 't_auth'],
        [StateEntity, 't_state'],
        [SnsEntity, 't_sns'],
    ]);
    const repos = new Map<unknown, {find: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn>; metadata: object}>();
    for (const entity of pkOf.keys()) {
        repos.set(entity, {
            find: vi.fn().mockResolvedValue(existing.get(entity) ?? []),
            insert: vi.fn().mockResolvedValue({}),
            metadata: {primaryColumns: [{propertyName: pkOf.get(entity)}], tableName: tableOf.get(entity)},
        });
    }
    const dataSource = {getRepository: (entity: unknown) => repos.get(entity)} as unknown as DataSource;
    return {dataSource, repos};
}

describe('pickMissingRows', () => {
    it('PK 가 이미 있는 행을 빼고 돌려준다', () => {
        const rows = [{id: 'A'}, {id: 'B'}, {id: 'C'}];

        expect(pickMissingRows(rows, [{id: 'B'}], 'id')).toEqual([{id: 'A'}, {id: 'C'}]);
        expect(pickMissingRows(rows, [], 'id')).toEqual(rows);
        expect(pickMissingRows(rows, rows, 'id')).toEqual([]);
    });
});

describe('SeederService', () => {
    describe('[SUCCESS] 기본 데이터 멱등 입력', () => {
        it('빈 DB 면 대상 순서대로 전부 insert 한다', async () => {
            const {dataSource, repos} = makeDataSource();

            await new SeederService(dataSource).onApplicationBootstrap();

            expect(repos.get(AuthEntity)!.insert).toHaveBeenCalledWith(AUTH_SEED_DATA);
            expect(repos.get(StateEntity)!.insert).toHaveBeenCalledWith(STATE_SEED_DATA);
            expect(repos.get(SnsEntity)!.insert).toHaveBeenCalledWith(SNS_SEED_DATA);
            const order = [AuthEntity, StateEntity, SnsEntity].map((e) => repos.get(e)!.insert.mock.invocationCallOrder[0]);
            expect(order).toEqual([...order].sort((a, b) => a - b));
        });

        it('이미 있는 PK 는 건너뛰고 없는 행만 insert, 입력 건수를 돌려준다', async () => {
            const {dataSource, repos} = makeDataSource(new Map([[AuthEntity, [{auth_id: 'USER'}, {auth_id: 'ADMIN'}]]]));

            const count = await new SeederService(dataSource).seedEntity(AuthEntity, AUTH_SEED_DATA);

            expect(count).toBe(3);
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

        it('실패한 대상은 null 을 돌려준다', async () => {
            const {dataSource, repos} = makeDataSource();
            repos.get(AuthEntity)!.insert.mockRejectedValueOnce(new Error('db'));

            await expect(new SeederService(dataSource).seedEntity(AuthEntity, AUTH_SEED_DATA)).resolves.toBeNull();
        });
    });

    describe('기본 데이터 정합성', () => {
        it('가입 DTO 가 허용하는 SNS 유형이 모두 시드에 있다 (FK_User_Sns 위반 방지)', () => {
            expect(SNS_SEED_DATA.map((row) => row.sns_id)).toEqual(expect.arrayContaining(['GOOGLE', 'FACEBOOK', 'APPLE', 'KAKAO', 'LINE']));
        });

        it('회원 가입이 쓰는 권한 USER · 상태 ACTIVE 가 시드에 있고, FK 부모 순서를 지킨다', () => {
            expect(AUTH_SEED_DATA.map((row) => row.auth_id)).toContain('USER');
            expect(STATE_SEED_DATA.map((row) => row.state_id)).toContain('ACTIVE');
            expect(SEED_TARGETS.map((target) => target.entity)).toEqual([AuthEntity, StateEntity, SnsEntity]);
        });
    });
});
