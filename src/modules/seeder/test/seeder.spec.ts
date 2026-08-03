import { SeederService } from '../seeder.service';
import { pickMissingRows } from '../seeder.util';
import { AUTH_SEED_DATA, STATE_SEED_DATA, SNS_SEED_DATA } from '../seeder.targets';
import { AuthEntity } from '@root/api/v1/user/entities/auth.entity';
import { StateEntity } from '@root/api/v1/user/entities/state.entity';
import { SnsEntity } from '@root/api/v1/user/entities/sns.entity';

/** PK/tableName/기존행 을 받는 mock repository 생성 */
const makeRepo = (pk: string, tableName: string, existing: any[]) => ({
    metadata: {primaryColumns: [{propertyName: pk}], tableName},
    find: jest.fn().mockResolvedValue(existing),
    insert: jest.fn().mockResolvedValue(undefined),
});

describe('pickMissingRows (순수함수)', () => {
    const rows = [{id: 'A'}, {id: 'B'}, {id: 'C'}];

    it('기존이 비어있으면 전체 반환', () => {
        expect(pickMissingRows(rows, [], 'id')).toEqual(rows);
    });

    it('일부 존재하면 누락분만 반환', () => {
        expect(pickMissingRows(rows, [{id: 'A'}, {id: 'C'}], 'id')).toEqual([{id: 'B'}]);
    });

    it('전부 존재하면 빈 배열', () => {
        expect(pickMissingRows(rows, [{id: 'A'}, {id: 'B'}, {id: 'C'}], 'id')).toEqual([]);
    });
});

describe('AUTH_SEED_DATA (권한 기본 데이터)', () => {
    it('총괄매니저(HEAD_MANAGER)가 매니저 바로 위 level 로 포함된다', () => {
        const headManager = AUTH_SEED_DATA.find((row) => row.auth_id === 'HEAD_MANAGER');
        const manager = AUTH_SEED_DATA.find((row) => row.auth_id === 'MANAGER');

        expect(headManager).toBeDefined();
        expect(headManager.auth_name).toBe('총괄매니저');
        expect(headManager.level).toBe(102);
        expect(headManager.level).toBeGreaterThan(manager.level);
    });

    it('권한은 5종 — SUPER_ADMIN / ADMIN / HEAD_MANAGER / MANAGER / USER', () => {
        expect(AUTH_SEED_DATA.map((row) => row.auth_id)).toEqual(['SUPER_ADMIN', 'ADMIN', 'HEAD_MANAGER', 'MANAGER', 'USER']);
    });
});

describe('SeederService - onApplicationBootstrap', () => {
    const buildDataSource = (authExisting: any[], stateExisting: any[], snsExisting: any[]) => {
        const authRepo = makeRepo('auth_id', 't_auth', authExisting);
        const stateRepo = makeRepo('state_id', 't_state', stateExisting);
        const snsRepo = makeRepo('sns_id', 't_sns', snsExisting);
        const getRepository = jest.fn((entity: any) => {
            if (entity === AuthEntity) return authRepo;
            if (entity === StateEntity) return stateRepo;
            if (entity === SnsEntity) return snsRepo;
            throw new Error('unexpected entity');
        });
        return {dataSource: {getRepository} as any, authRepo, stateRepo, snsRepo};
    };

    it('전부 미존재 → 각 엔티티 기본 데이터 전량 insert', async () => {
        const {dataSource, authRepo, stateRepo, snsRepo} = buildDataSource([], [], []);
        const service = new SeederService(dataSource);

        await service.onApplicationBootstrap();

        expect(authRepo.find).toHaveBeenCalledTimes(1);
        expect(authRepo.insert).toHaveBeenCalledTimes(1);
        expect(authRepo.insert.mock.calls[0][0]).toHaveLength(AUTH_SEED_DATA.length);
        expect(stateRepo.insert.mock.calls[0][0]).toHaveLength(STATE_SEED_DATA.length);
        expect(snsRepo.insert.mock.calls[0][0]).toHaveLength(SNS_SEED_DATA.length);
    });

    it('일부 존재 → 누락분만 insert', async () => {
        // auth: USER 만 이미 존재 → 나머지 2건만 insert
        const {dataSource, authRepo} = buildDataSource([{auth_id: 'USER'}], [], []);
        const service = new SeederService(dataSource);

        await service.onApplicationBootstrap();

        expect(authRepo.insert).toHaveBeenCalledTimes(1);
        const inserted = authRepo.insert.mock.calls[0][0];
        expect(inserted).toHaveLength(AUTH_SEED_DATA.length - 1);
        expect(inserted.map((r: any) => r.auth_id)).not.toContain('USER');
    });

    it('전부 존재 → insert 미호출', async () => {
        const {dataSource, authRepo} = buildDataSource(
            AUTH_SEED_DATA.map((r) => ({auth_id: r.auth_id})),
            STATE_SEED_DATA.map((r) => ({state_id: r.state_id})),
            SNS_SEED_DATA.map((r) => ({sns_id: r.sns_id})),
        );
        const service = new SeederService(dataSource);

        await service.onApplicationBootstrap();

        expect(authRepo.insert).not.toHaveBeenCalled();
    });

    it('find 실패 → throw 없이 다음 대상 계속 진행', async () => {
        const {dataSource, authRepo, stateRepo} = buildDataSource([], [], []);
        authRepo.find.mockRejectedValueOnce(new Error('table missing'));
        const service = new SeederService(dataSource);

        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

        // auth 는 실패(insert 미호출)했지만 state 는 정상 진행
        expect(authRepo.insert).not.toHaveBeenCalled();
        expect(stateRepo.insert).toHaveBeenCalledTimes(1);
    });
});
