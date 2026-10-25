import {BadRequestException, InternalServerErrorException} from '@nestjs/common';
import type {TransactionHost} from '@nestjs-cls/transactional';
import type {TransactionalAdapterTypeOrm} from '@nestjs-cls/transactional-adapter-typeorm';
import {DataSource, In, QueryFailedError} from 'typeorm';
import {StoreApplicationListDto} from '@app/contracts/store/dto/store-application-list.dto.js';
import {StoreListDto} from '@app/contracts/store/dto/store-list.dto.js';
import {ENTITIES} from '@app/database/entities.js';
import {StoreApplicationEntity} from '@app/database/entities/store/store-application.entity.js';
import {StoreFilePurposeEntity} from '@app/database/entities/store/store-file-purpose.entity.js';
import {StoreFileEntity} from '@app/database/entities/store/store-file.entity.js';
import {StoreEntity} from '@app/database/entities/store/store.entity.js';
import {UserEntity} from '@app/database/entities/user/user.entity.js';
import {StoreRepository} from '../repositories/store.repository.js';
import {buildApplicationListWhere, buildStoreListWhere} from '../store.util.js';

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
    const fake = () => ({insert: vi.fn(), findOne: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn()});
    const repos = new Map<unknown, ReturnType<typeof fake>>([
        [StoreApplicationEntity, fake()],
        [StoreFilePurposeEntity, fake()],
        [StoreFileEntity, fake()],
        [StoreEntity, fake()],
        [UserEntity, fake()],
    ]);
    const txHost = {tx: {getRepository: (entity: unknown) => repos.get(entity)}} as unknown as TransactionHost<TransactionalAdapterTypeOrm>;
    return {
        repository: new StoreRepository(txHost),
        application: repos.get(StoreApplicationEntity)!,
        purpose: repos.get(StoreFilePurposeEntity)!,
        file: repos.get(StoreFileEntity)!,
        store: repos.get(StoreEntity)!,
        user: repos.get(UserEntity)!,
    };
}

describe('StoreRepository — TypeORM 오류 → HTTP 예외 매핑', () => {
    it('insertStoreFile — 23505 UK_StoreFile_FileKey → 400 "이미 등록된 파일입니다."', async () => {
        const {repository, file} = makeRepository();
        file.insert.mockRejectedValueOnce(constraintError('23505', 'UK_StoreFile_FileKey'));

        const error = await repository.insertStoreFile(new StoreFileEntity()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message: '이미 등록된 파일입니다.'});
    });

    it('insertStore — 23505 UK_Store_BusinessNumber → 400 "이미 신청 · 등록된 사업자등록번호입니다."', async () => {
        const {repository, store} = makeRepository();
        store.insert.mockRejectedValueOnce(constraintError('23505', 'UK_Store_BusinessNumber'));

        const error = await repository.insertStore(new StoreEntity()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message: '이미 신청 · 등록된 사업자등록번호입니다.'});
    });

    it.each([
        ['UK_User_PhoneLoginScope', '이미 다른 매니저 계정에 등록된 휴대폰 번호입니다.'],
        ['UK_User_LoginIdLoginScope', '업체 총관리자 아이디가 겹쳤습니다. 다시 승인해주세요.'],
    ] as const)('insertHeadManager — 23505 %s → 400 "%s"', async (constraint, message) => {
        const {repository, user} = makeRepository();
        user.insert.mockRejectedValueOnce(constraintError('23505', constraint));

        const error = await repository.insertHeadManager(new UserEntity()).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toEqual({message});
    });

    it('다른 제약 위반은 제약명이 맞지 않으므로 통일 500', async () => {
        const {repository, store} = makeRepository();
        store.insert.mockRejectedValueOnce(constraintError('23503', 'FK_Store_StoreState'));

        await expect(repository.insertStore(new StoreEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('findApplicant 는 이용자 그룹 조건으로 조회한다', async () => {
        const {repository, user} = makeRepository();

        await repository.findApplicant('u1');

        expect(user.findOne).toHaveBeenCalledWith({where: {user_id: 'u1', login_scope: 'USER'}, loadRelationIds: true});
    });

    it('findStoreFilePurpose 는 용도 PK 로 조회한다', async () => {
        const {repository, purpose} = makeRepository();

        await repository.findStoreFilePurpose('BUSINESS_LICENSE');

        expect(purpose.findOne).toHaveBeenCalledWith({where: {store_file_purpose_id: 'BUSINESS_LICENSE'}});
    });

    it.each([
        [1, true],
        [0, false],
    ])('updateApplication · deleteApplication — affected %s → %s (그 사이 바뀐 신청 판별)', async (affected, expected) => {
        const {repository, application} = makeRepository();
        application.update.mockResolvedValueOnce({affected});
        application.delete.mockResolvedValueOnce({affected});
        const entity = Object.assign(new StoreApplicationEntity(), {store_application_state_id: 'APPROVED'});

        await expect(repository.updateApplication({store_application_id: 'a1', store_application_state_id: 'WAIT'}, entity)).resolves.toBe(expected);
        await expect(repository.deleteApplication({store_application_id: 'a1', store_application_state_id: 'WAIT'})).resolves.toBe(expected);
        expect(application.update).toHaveBeenCalledWith({store_application_id: 'a1', store_application_state_id: 'WAIT'}, entity);
        expect(application.delete).toHaveBeenCalledWith({store_application_id: 'a1', store_application_state_id: 'WAIT'});
    });

    it.each([
        ['findApplication', 'application', 'findOne'],
        ['countApplications', 'application', 'count'],
        ['insertApplication', 'application', 'insert'],
        ['updateApplication', 'application', 'update'],
        ['deleteApplication', 'application', 'delete'],
        ['findStoreFilePurpose', 'purpose', 'findOne'],
        ['countStoreFiles', 'file', 'count'],
        ['findStoreFile', 'file', 'findOne'],
        ['insertStoreFile', 'file', 'insert'],
        ['deleteStoreFile', 'file', 'delete'],
        ['findStore', 'store', 'findOne'],
        ['countStores', 'store', 'count'],
        ['insertStore', 'store', 'insert'],
        ['updateStore', 'store', 'update'],
        ['findApplicant', 'user', 'findOne'],
        ['countManagers', 'user', 'count'],
        ['insertHeadManager', 'user', 'insert'],
    ] as const)('%s 실패는 통일 500', async (method, repo, fn) => {
        const fakes = makeRepository();
        fakes[repo][fn].mockRejectedValueOnce(new Error('db'));

        await expect((fakes.repository[method] as (...args: unknown[]) => Promise<unknown>)({}, new StoreEntity())).rejects.toBeInstanceOf(InternalServerErrorException);
    });
});

describe('[SMOKE:data-access] 목록 · 파일 조회 · 파일 업체 지정 · 신청 파일 삭제 · 매니저 상태 쿼리 — DB 연결 없이 SQL 빌드', () => {
    let dataSource: DataSource;
    let repository: StoreRepository;

    const APPLICATION_SELECT =
        'SELECT "a"."store_application_id" AS "a_store_application_id", "a"."user_id" AS "a_user_id", "a"."store_name" AS "a_store_name", "a"."business_number" AS "a_business_number", ' +
        '"a"."owner_name" AS "a_owner_name", "a"."owner_phone" AS "a_owner_phone", "a"."phone" AS "a_phone", "a"."address" AS "a_address", "a"."address_detail" AS "a_address_detail", ' +
        '"a"."latitude" AS "a_latitude", "a"."longitude" AS "a_longitude", "a"."application_comment" AS "a_application_comment", "a"."reject_comment" AS "a_reject_comment", ' +
        '"a"."reviewed_at" AS "a_reviewed_at", "a"."created_at" AS "a_created_at", "a"."updated_at" AS "a_updated_at", "a"."store_application_state_id" AS "a_store_application_state_id", ' +
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

    it('입점 신청 목록 (총관리자) — 상태 + 검색어 OR(상호명 · 사업자번호), 신청일 최신순 · 페이지', () => {
        const [sql, parameters] = repository
            .buildApplicationListQuery(buildApplicationListWhere(new StoreApplicationListDto({store_application_state_id: 'WAIT', keyword: '룸'})), 20, 0)
            .getQueryAndParameters();

        expect(parameters).toEqual(['WAIT', '%룸%', 'WAIT', '%룸%']);
        expect(sql.replace(/\s+/g, ' ')).toBe(
            `${APPLICATION_SELECT} WHERE (((("a"."store_application_state_id" = $1) AND ("a"."store_name" ILIKE $2))) OR ((("a"."store_application_state_id" = $3) AND ("a"."business_number" ILIKE $4)))) ` +
                'ORDER BY "a"."created_at" DESC LIMIT 20 OFFSET 0',
        );
    });

    it('내 입점 신청 목록 — 신청자 + 대기 · 반려(IN)', () => {
        const [sql, parameters] = repository.buildApplicationListQuery({user_id: 'u1', store_application_state_id: In(['WAIT', 'REJECTED'])}, 20, 0).getQueryAndParameters();

        expect(parameters).toEqual(['u1', 'WAIT', 'REJECTED']);
        expect(sql.replace(/\s+/g, ' ')).toBe(`${APPLICATION_SELECT} WHERE (("a"."user_id" = $1) AND ("a"."store_application_state_id" IN ($2, $3))) ORDER BY "a"."created_at" DESC LIMIT 20 OFFSET 0`);
    });

    it('업체 목록 — 상태 + 검색어 OR(상호명 · 사업자번호 · 대표자명), 이스케이프한 패턴 · 페이지', () => {
        const [sql, parameters] = repository.buildStoreListQuery(buildStoreListWhere(new StoreListDto({store_state_id: 'ACTIVE', keyword: 'a_b'})), 10, 20).getQueryAndParameters();

        expect(parameters).toEqual(['ACTIVE', '%a\\_b%', 'ACTIVE', '%a\\_b%', 'ACTIVE', '%a\\_b%']);
        expect(sql.replace(/\s+/g, ' ')).toBe(
            'SELECT "s"."store_id" AS "s_store_id", "s"."store_name" AS "s_store_name", "s"."business_number" AS "s_business_number", "s"."owner_name" AS "s_owner_name", ' +
                '"s"."phone" AS "s_phone", "s"."address" AS "s_address", "s"."address_detail" AS "s_address_detail", "s"."latitude" AS "s_latitude", "s"."longitude" AS "s_longitude", ' +
                '"s"."introduction" AS "s_introduction", "s"."store_detail" AS "s_store_detail", "s"."is_always_open" AS "s_is_always_open", "s"."is_open" AS "s_is_open", ' +
                '"s"."maintenance_minutes" AS "s_maintenance_minutes", "s"."is_deleted" AS "s_is_deleted", "s"."delete_backup" AS "s_delete_backup", "s"."created_at" AS "s_created_at", ' +
                '"s"."updated_at" AS "s_updated_at", "s"."store_state_id" AS "s_store_state_id" FROM "t_store" "s" ' +
                'WHERE (((("s"."store_state_id" = $1) AND ("s"."store_name" ILIKE $2))) OR ((("s"."store_state_id" = $3) AND ("s"."business_number" ILIKE $4))) OR ((("s"."store_state_id" = $5) AND ("s"."owner_name" ILIKE $6)))) ' +
                'ORDER BY "s"."created_at" DESC LIMIT 10 OFFSET 20',
        );
    });

    it.each([
        ['store_application_id', 'a1'],
        ['store_id', 's1'],
    ] as const)('업체 정보 파일 조회 (%s 기준) — 용도 조인 · 비공개 여부, 용도 · 정렬 순서 · 등록일 순', (column, id) => {
        const [sql, parameters] = repository.buildStoreFileRowsQuery(column, id).getQueryAndParameters();

        expect(parameters).toEqual([id]);
        expect(sql.replace(/\s+/g, ' ')).toBe(`${FILE_SELECT} WHERE "f"."${column}" = $1 ${FILE_ORDER}`);
    });

    it('업체 정보 파일 select 별칭이 StoreFileRow 키와 같다', () => {
        const [sql] = repository.buildStoreFileRowsQuery('store_id', 's1').getQueryAndParameters();
        const aliases = [...sql.matchAll(/ AS "([a-z_]+)"/g)].map((m) => m[1]);

        expect(aliases).toEqual(['store_file_id', 'store_file_purpose_id', 'store_application_id', 'store_id', 'file_key', 'file_name', 'content_type', 'sort_order', 'created_at', 'is_private']);
    });

    it('승인 — 신청의 업체 정보 파일 행에 store_id 를 채운다', () => {
        const [sql, parameters] = repository.buildAssignStoreFilesQuery('a1', 's1').getQueryAndParameters();

        expect(parameters).toEqual(['s1', 'a1']);
        expect(sql).toBe('UPDATE "t_store_file" SET "store_id" = $1 WHERE "store_application_id" = $2');
    });

    it('신청 취소 — 아직 업체에 붙지 않은(store_id IS NULL) 신청 파일만 지운다', () => {
        const [sql, parameters] = repository.buildDeleteApplicationFilesQuery('a1').getQueryAndParameters();

        expect(parameters).toEqual(['a1']);
        expect(sql).toBe('DELETE FROM "t_store_file" WHERE "store_application_id" = $1 AND "store_id" IS NULL');
    });

    it('업체 탈퇴 — 그 업체 매니저 그룹 회원 상태 · 정지 사유 · 수정일', () => {
        const [sql, parameters] = repository.buildUpdateStoreManagersQuery('s1', 'BLOCK', '사유').getQueryAndParameters();

        expect(parameters).toEqual(['BLOCK', '사유', 's1', 'MANAGER']);
        expect(sql).toBe('UPDATE "t_user" SET "state_id" = $1, "block_comment" = $2, "updated_at" = CURRENT_TIMESTAMP WHERE "store_id" = $3 AND "login_scope" = $4');
    });
});
