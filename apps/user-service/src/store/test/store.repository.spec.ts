import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, In, QueryFailedError} from 'typeorm';
import {ENTITIES} from '@app/database/entities.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {StoreRepository} from '../repositories/store.repository.js';

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
    const fake = () => ({insert: vi.fn(), findOne: vi.fn(), find: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn()});
    const repos = new Map<unknown, ReturnType<typeof fake>>([
        [StoreApplicationEntity, fake()],
        [StoreFilePurposeEntity, fake()],
        [StoreFileEntity, fake()],
        [StoreEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {
        repository: new StoreRepository(txHost),
        application: repos.get(StoreApplicationEntity)!,
        purpose: repos.get(StoreFilePurposeEntity)!,
        file: repos.get(StoreFileEntity)!,
        store: repos.get(StoreEntity)!,
    };
}

describe('StoreRepository (이용자 입점 신청) — TypeORM 오류 → HTTP 예외 매핑 · 넘긴 조건', () => {
    it('insertStoreFile — 23505 UK_StoreFile_FileKey → 400 "이미 등록된 파일입니다."', async () => {
        const {repository, file} = makeRepository();
        file.insert.mockRejectedValueOnce(constraintError('23505', 'UK_StoreFile_FileKey'));

        const error = await repository.insertStoreFile(new StoreFileEntity()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message: '이미 등록된 파일입니다.'});
    });

    it('findStores 는 받은 조건에 is_deleted: 0 을 더해 여러 건을 loadRelationIds 로 조회한다(내 신청 목록의 업체코드)', async () => {
        const {repository, store} = makeRepository();

        await repository.findStores({store_id: In(['s1', 's2'])});

        expect(store.find).toHaveBeenCalledWith({where: {store_id: In(['s1', 's2']), is_deleted: 0}, loadRelationIds: true});
    });

    it('is_deleted 가 있는 테이블의 조회 · 개수는 받은 조건에 is_deleted: 0 을 더한다(배열 OR 조건은 조건마다)', async () => {
        const {repository, application, file, store} = makeRepository();

        await repository.findApplication({store_application_id: 'a1'});
        await repository.countApplications([{user_id: 'u1'}, {business_number: '1234567890'}]);
        await repository.countStoreFiles({store_application_id: 'a1'});
        await repository.findStoreFile({store_file_id: 'f1'});
        await repository.findStore({store_id: 's1'});
        await repository.countStores([{business_number: '1234567890'}, {store_name: '룸'}]);

        expect(application.findOne).toHaveBeenCalledWith({where: {store_application_id: 'a1', is_deleted: 0}, loadRelationIds: true});
        expect(application.count).toHaveBeenCalledWith({
            where: [
                {user_id: 'u1', is_deleted: 0},
                {business_number: '1234567890', is_deleted: 0},
            ],
        });
        expect(file.count).toHaveBeenCalledWith({where: {store_application_id: 'a1', is_deleted: 0}});
        expect(file.findOne).toHaveBeenCalledWith({where: {store_file_id: 'f1', is_deleted: 0}, loadRelationIds: true});
        expect(store.findOne).toHaveBeenCalledWith({where: {store_id: 's1', is_deleted: 0}, loadRelationIds: true});
        expect(store.count).toHaveBeenCalledWith({
            where: [
                {business_number: '1234567890', is_deleted: 0},
                {store_name: '룸', is_deleted: 0},
            ],
        });
    });

    it('deleteStoreFile 는 실제로 지우지 않고 지워지지 않은 행을 삭제 표시한다(소프트 삭제)', async () => {
        const {repository, file} = makeRepository();

        await repository.deleteStoreFile({store_file_id: 'f1'});

        expect(file.delete).not.toHaveBeenCalled();
        expect(file.update).toHaveBeenCalledTimes(1);
        const [condition, entity] = file.update.mock.calls[0] as [unknown, object];
        expect(condition).toEqual({store_file_id: 'f1', is_deleted: 0});
        expect(entity).toBeInstanceOf(StoreFileEntity);
        expect({...entity}).toEqual({is_deleted: 1});
    });

    it('findStoreFilePurpose 는 용도 PK 로 조회한다', async () => {
        const {repository, purpose} = makeRepository();

        await repository.findStoreFilePurpose('BUSINESS_LICENSE');

        expect(purpose.findOne).toHaveBeenCalledWith({where: {store_file_purpose_id: 'BUSINESS_LICENSE'}});
    });

    it.each([
        [1, true],
        [0, false],
    ])('deleteApplication — affected %s → %s (그 사이 바뀐 신청 판별), 지워지지 않은 행만 삭제 표시', async (affected, expected) => {
        const {repository, application} = makeRepository();
        application.update.mockResolvedValue({affected});

        await expect(repository.deleteApplication({store_application_id: 'a1', store_application_state_id: 'WAIT'})).resolves.toBe(expected);
        expect(application.update).toHaveBeenCalledTimes(1);
        const [where, deleted] = application.update.mock.calls[0] as [unknown, object];
        expect(where).toEqual({store_application_id: 'a1', store_application_state_id: 'WAIT', is_deleted: 0});
        expect(deleted).toBeInstanceOf(StoreApplicationEntity);
        expect({...deleted}).toEqual({is_deleted: 1});
        expect(application.delete).not.toHaveBeenCalled();
    });

    it.each([
        ['findApplication', 'application', 'findOne'],
        ['countApplications', 'application', 'count'],
        ['insertApplication', 'application', 'insert'],
        ['deleteApplication', 'application', 'update'],
        ['findStoreFilePurpose', 'purpose', 'findOne'],
        ['countStoreFiles', 'file', 'count'],
        ['findStoreFile', 'file', 'findOne'],
        ['insertStoreFile', 'file', 'insert'],
        ['deleteStoreFile', 'file', 'update'],
        ['findStore', 'store', 'findOne'],
        ['findStores', 'store', 'find'],
        ['countStores', 'store', 'count'],
    ] as const)('%s 실패는 통일 500', async (method, repo, fn) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(new Error('db'));

        await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, new StoreEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it.each([
        ['findApplicationList', 'buildApplicationListQuery', 'getMany', [{user_id: 'u1'}, 20, 0], [{user_id: 'u1'}, 20, 0]],
        ['findApplicationFileRows', 'buildStoreFileRowsQuery', 'getRawMany', ['a1'], ['store_application_id', 'a1']],
        ['deleteApplicationFiles', 'buildDeleteApplicationFilesQuery', 'execute', ['a1'], ['a1']],
    ] as const)('%s 는 %s 를 실행하고, 실패는 통일 500', async (method, builder, run, args, builderArgs) => {
        const {repository} = makeRepository();
        const failing = {[run]: vi.fn().mockRejectedValue(new Error('db'))};
        const spy = vi.spyOn(repository as unknown as Record<string, (...params: unknown[]) => unknown>, builder).mockReturnValue(failing);

        await expect((repository[method] as (...params: unknown[]) => Promise<unknown>)(...args)).rejects.toBeInstanceOf(InternalServerErrorException);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenCalledWith(...builderArgs);
    });
});

describe('[SMOKE:data-access] 내 신청 목록 · 신청 파일 조회 · 신청 파일 삭제 쿼리 — DB 연결 없이 SQL 빌드, 지워지지 않은 행만', () => {
    let dataSource: DataSource;
    let repository: StoreRepository;

    const APPLICATION_SELECT =
        'SELECT "a"."store_application_id" AS "a_store_application_id", "a"."user_id" AS "a_user_id", "a"."store_name" AS "a_store_name", "a"."business_number" AS "a_business_number", ' +
        '"a"."owner_name" AS "a_owner_name", "a"."owner_phone" AS "a_owner_phone", "a"."head_manager_login_id" AS "a_head_manager_login_id", "a"."head_manager_login_pw" AS "a_head_manager_login_pw", "a"."phone" AS "a_phone", "a"."address" AS "a_address", "a"."address_detail" AS "a_address_detail", ' +
        '"a"."latitude" AS "a_latitude", "a"."longitude" AS "a_longitude", "a"."application_comment" AS "a_application_comment", "a"."reject_comment" AS "a_reject_comment", ' +
        '"a"."reviewed_at" AS "a_reviewed_at", "a"."is_deleted" AS "a_is_deleted", "a"."created_at" AS "a_created_at", "a"."updated_at" AS "a_updated_at", "a"."store_application_state_id" AS "a_store_application_state_id", ' +
        '"a"."store_id" AS "a_store_id" FROM "t_store_application" "a"';

    const FILE_SELECT =
        'SELECT "f"."store_file_id" AS "store_file_id", "f"."store_file_purpose_id" AS "store_file_purpose_id", "f"."store_application_id" AS "store_application_id", ' +
        '"f"."store_id" AS "store_id", "f"."file_key" AS "file_key", "f"."file_name" AS "file_name", "f"."content_type" AS "content_type", "f"."sort_order" AS "sort_order", ' +
        '"f"."created_at" AS "created_at", "p"."is_private" AS "is_private" FROM "t_store_file" "f" INNER JOIN "t_store_file_purpose" "p" ON "p"."store_file_purpose_id" = "f"."store_file_purpose_id"';

    const FILE_ORDER = 'ORDER BY "f"."store_file_purpose_id" ASC, "f"."sort_order" ASC, "f"."created_at" ASC';

    beforeAll(async () => {
        // 접속하지 않는다 — 엔티티 메타데이터만 만들어 QueryBuilder 가 SQL 을 조립하게 한다
        dataSource = new DataSource({type: 'postgres', database: 'smoke', entities: ENTITIES});
        await (dataSource as unknown as {buildMetadatas: () => Promise<void>}).buildMetadatas();
        repository = new StoreRepository({tx: dataSource.manager} as unknown as TransactionHost<TransactionalAdapterTypeOrm>);
    });

    it('내 입점 신청 목록 — 신청자(service 조건 {user_id}) · 지워지지 않은 신청, 신청일 최신순 · 페이지', () => {
        const [sql, parameters] = repository.buildApplicationListQuery({user_id: 'u1'}, 20, 0).getQueryAndParameters();

        expect(parameters).toEqual(['u1', 0]);
        expect(sql.replace(/\s+/g, ' ')).toBe(`${APPLICATION_SELECT} WHERE (("a"."user_id" = $1) AND ("a"."is_deleted" = $2)) ORDER BY "a"."created_at" DESC LIMIT 20 OFFSET 0`);
    });

    it('신청의 업체 정보 파일 조회 — 용도 조인 · 비공개 여부 · 지워지지 않은 파일만, 용도 · 정렬 순서 · 등록일 순, select 별칭 = StoreFileRow 키', () => {
        const [sql, parameters] = repository.buildStoreFileRowsQuery('store_application_id', 'a1').getQueryAndParameters();
        const aliases = [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((m) => m[1]);

        expect(parameters).toEqual(['a1']);
        expect(sql.replace(/\s+/g, ' ')).toBe(`${FILE_SELECT} WHERE "f"."store_application_id" = $1 AND "f"."is_deleted" = 0 ${FILE_ORDER}`);
        expect(aliases).toEqual(['store_file_id', 'store_file_purpose_id', 'store_application_id', 'store_id', 'file_key', 'file_name', 'content_type', 'sort_order', 'created_at', 'is_private']);
    });

    it('신청 취소 — 아직 업체에 붙지 않은(store_id IS NULL) 지워지지 않은 신청 파일만 삭제 표시한다(소프트 삭제 — DELETE 없음)', () => {
        const [sql, parameters] = repository.buildDeleteApplicationFilesQuery('a1').getQueryAndParameters();

        expect(parameters).toEqual([1, 'a1']);
        expect(sql).toBe('UPDATE "t_store_file" SET "is_deleted" = $1, "updated_at" = CURRENT_TIMESTAMP WHERE "store_application_id" = $2 AND "store_id" IS NULL AND "is_deleted" = 0');
    });
});
