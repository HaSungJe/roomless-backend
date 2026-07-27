jest.mock('typeorm-transactional', () => ({
    Transactional: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, InternalServerErrorException, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { DataSource, Like } from 'typeorm';
import { StoreController } from '../store.controller';
import { StoreService } from '../store.service';
import { STORE_REPOSITORY } from '../store.symbols';
import { StoreEntity } from '../entities/store.entity';
import { StoreListDto } from '../dto/store-list.dto';
import { buildStoreSearchWhere } from '../store.util';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';

const USER = 'user-id-32chars-fillerxxxxxxxxxx';

/** 조회 결과로 돌려줄 가맹점 엔티티 1건 */
const buildStore = (overrides: Partial<StoreEntity> = {}): StoreEntity => {
    const store = new StoreEntity();
    store.store_id = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    store.store_name = '로우호텔 강남점';
    store.business_number = '1234567890';
    store.owner_name = '홍길동';
    store.phone = '02-1234-5678';
    store.address = '서울시 강남구 테헤란로 1';
    store.address_detail = null;
    store.is_delete = 0;
    store.delete_backup = null;
    store.create_at = new Date('2026-07-01T00:00:00.000Z');
    store.update_at = new Date('2026-07-02T00:00:00.000Z');
    return Object.assign(store, overrides);
};

describe('StoreService - list (가맹점 목록 조회)', () => {
    let app: INestApplication;
    let storeRepository: {countStore: jest.Mock; findStoreList: jest.Mock};
    let guardAllows: boolean;
    let currentAuthId: string;

    const buildModule = async () => {
        guardAllows = true;
        currentAuthId = 'SUPER_ADMIN';
        storeRepository = {
            countStore: jest.fn().mockResolvedValue(0),
            findStoreList: jest.fn().mockResolvedValue([]),
        };

        // PassportJwtAuthGuard 만 mock — RolesGuard 는 실제 구현을 태워 권한 분기를 검증한다.
        const module: TestingModule = await Test.createTestingModule({
            controllers: [StoreController],
            providers: [
                StoreService,
                {provide: STORE_REPOSITORY, useValue: storeRepository},
            ],
        })
            .overrideGuard(PassportJwtAuthGuard)
            .useValue({
                canActivate: (ctx: ExecutionContext) => {
                    if (!guardAllows) throw new UnauthorizedException();
                    const req = ctx.switchToHttp().getRequest();
                    req.user = {user_id: USER, auth_id: currentAuthId};
                    return true;
                },
            })
            .compile();

        app = module.createNestApplication();
        app.useGlobalFilters(new CustomErrorFilter());
        app.useGlobalPipes(
            new ValidationPipe({
                transform: true,
                forbidNonWhitelisted: true,
                exceptionFactory: (errors) => {
                    const result: Record<string, any> = {};
                    result.validationErrors = [];
                    for (const error of errors) {
                        const errorDto = new ValidationErrorDto();
                        errorDto.type = Object.keys(error.constraints)[0];
                        errorDto.property = error.property;
                        errorDto.message = error.constraints[errorDto.type];
                        result.validationErrors.push(errorDto);
                    }
                    result.message = result.validationErrors.length > 0 ? result.validationErrors[0].message : '실패했습니다.';
                    return new BadRequestException(result);
                },
            }),
        );
        await app.init();
    };

    beforeEach(async () => { await buildModule(); });
    afterEach(async () => { await app.close(); });

    const get = (query: Record<string, any> = {}) => request(app.getHttpServer()).get('/api/v1/store/list').query(query);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] list — 검색조건 없음', () => {
        it('200 + list/pagination 반환, countStore·findStoreList 가 {is_delete:0} 로 1회씩 호출', async () => {
            const store = buildStore();
            storeRepository.countStore.mockResolvedValueOnce(2);
            storeRepository.findStoreList.mockResolvedValueOnce([store]);

            const res = await get().expect(200);

            // 응답 항목 전 필드
            expect(res.body.list).toHaveLength(1);
            expect(res.body.list[0]).toEqual({
                store_id: store.store_id,
                store_name: store.store_name,
                business_number: store.business_number,
                owner_name: store.owner_name,
                phone: store.phone,
                address: store.address,
                address_detail: null,
                create_at: store.create_at.toISOString(),
                update_at: store.update_at.toISOString(),
            });

            // 페이지 정보 (total_count=2, size=20 기준)
            expect(res.body.pagination).toEqual({
                all_search_yn: 'N',
                total_count: 2,
                page: 1,
                max_page: 1,
                page_range: {start: 1, end: 1},
                content_start_number: 2,
                content_start_number_reverse: 1,
            });

            // repository 호출 — 검색조건 없으면 is_delete 필터만
            expect(storeRepository.countStore).toHaveBeenCalledTimes(1);
            expect(storeRepository.countStore).toHaveBeenCalledWith({is_delete: 0});
            expect(storeRepository.findStoreList).toHaveBeenCalledTimes(1);
            expect(storeRepository.findStoreList).toHaveBeenCalledWith({is_delete: 0}, 20, 0);
        });
    });

    describe('[SUCCESS] list — search_type=STORE_NAME', () => {
        it('where 가 {is_delete:0, store_name: Like(%키워드%)}', async () => {
            await get({search_type: 'STORE_NAME', search_keyword: '로우'}).expect(200);

            expect(storeRepository.countStore).toHaveBeenCalledWith({is_delete: 0, store_name: Like('%로우%')});
            expect(storeRepository.findStoreList).toHaveBeenCalledWith({is_delete: 0, store_name: Like('%로우%')}, 20, 0);
        });
    });

    describe('[SUCCESS] list — search_type=BUSINESS_NUMBER / OWNER_NAME', () => {
        it('BUSINESS_NUMBER — where 가 business_number 대상', async () => {
            await get({search_type: 'BUSINESS_NUMBER', search_keyword: '123'}).expect(200);
            expect(storeRepository.countStore).toHaveBeenCalledWith({is_delete: 0, business_number: Like('%123%')});
        });

        it('OWNER_NAME — where 가 owner_name 대상', async () => {
            await get({search_type: 'OWNER_NAME', search_keyword: '홍길'}).expect(200);
            expect(storeRepository.countStore).toHaveBeenCalledWith({is_delete: 0, owner_name: Like('%홍길%')});
        });
    });

    describe('[SUCCESS] list — search_type=ALL', () => {
        it('where 가 3개 원소 OR 배열(store_name·business_number·owner_name)', async () => {
            await get({search_type: 'ALL', search_keyword: '강남'}).expect(200);

            expect(storeRepository.countStore).toHaveBeenCalledWith([
                {is_delete: 0, store_name: Like('%강남%')},
                {is_delete: 0, business_number: Like('%강남%')},
                {is_delete: 0, owner_name: Like('%강남%')},
            ]);
        });
    });

    describe('[SUCCESS] list — search_keyword 만 전달(search_type 없음)', () => {
        it('검색 없이 {is_delete:0} 로 조회 (400 아님)', async () => {
            await get({search_keyword: '로우'}).expect(200);

            expect(storeRepository.countStore).toHaveBeenCalledWith({is_delete: 0});
            expect(storeRepository.findStoreList).toHaveBeenCalledWith({is_delete: 0}, 20, 0);
        });
    });

    describe('[SUCCESS] list — page/size 전달', () => {
        it('page=2, size=5 → findStoreList(limit=5, offset=5)', async () => {
            storeRepository.countStore.mockResolvedValueOnce(12);

            const res = await get({page: 2, size: 5}).expect(200);

            expect(storeRepository.findStoreList).toHaveBeenCalledWith({is_delete: 0}, 5, 5);
            expect(res.body.pagination.page).toBe(2);
            expect(res.body.pagination.max_page).toBe(3);
        });
    });

    // Query DTO 규약 — 컨트롤러의 new StoreListDto(query) 가 기본값을 확정한다
    describe('[SUCCESS] list — 쿼리 파라미터 전무 (Query DTO 기본값 규약)', () => {
        it('기본값 적용 → findStoreList(limit=20, offset=0), pagination.page=1 / all_search_yn=N', async () => {
            const res = await get().expect(200);

            expect(storeRepository.findStoreList).toHaveBeenCalledWith({is_delete: 0}, 20, 0);
            expect(res.body.pagination.page).toBe(1);
            expect(res.body.pagination.all_search_yn).toBe('N');
        });
    });

    describe('[SUCCESS] list — page 만 전달(size 생략)', () => {
        it('size 는 기본값 20 유지 → limit=20', async () => {
            storeRepository.countStore.mockResolvedValueOnce(50);

            await get({page: 2}).expect(200);

            expect(storeRepository.findStoreList).toHaveBeenCalledWith({is_delete: 0}, 20, 20);
        });
    });

    // all_search_yn 은 검증하지 않는다 — Y 가 아니면 전부 N 으로 처리(Pagination 폴백)
    describe('[SUCCESS] list — all_search_yn 이 허용값 밖', () => {
        it('400 이 아니라 N 으로 처리되어 정상 조회된다', async () => {
            const res = await get({all_search_yn: 'X'}).expect(200);

            expect(res.body.pagination.all_search_yn).toBe('N');
            expect(storeRepository.countStore).toHaveBeenCalledTimes(1);
        });
    });

    describe('[SUCCESS] list — 결과 0건', () => {
        it('list=[], total_count=0, max_page=1', async () => {
            const res = await get().expect(200);

            expect(res.body.list).toEqual([]);
            expect(res.body.pagination.total_count).toBe(0);
            expect(res.body.pagination.max_page).toBe(1);
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:auth] — RolesGuard 실제 동작 검증
    // ─────────────────────────────────────────
    describe('[FAIL:auth]', () => {
        it('USER 권한 → 403, countStore 미호출', async () => {
            currentAuthId = 'USER';

            const res = await get().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.countStore).not.toHaveBeenCalled();
        });

        it('MANAGER 권한 → 403, countStore 미호출', async () => {
            currentAuthId = 'MANAGER';

            const res = await get().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.countStore).not.toHaveBeenCalled();
        });

        it('미인증 → 401, countStore 미호출', async () => {
            guardAllows = false;

            await get().expect(401);
            expect(storeRepository.countStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        it('search_type 허용값 밖 → 400 검색 대상 오류, countStore 미호출', async () => {
            const res = await get({search_type: 'PHONE', search_keyword: '02'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('search_type');
            expect(res.body.message).toBe('검색 대상이 올바르지 않습니다.');
            expect(storeRepository.countStore).not.toHaveBeenCalled();
        });

        it('search_keyword 101자 → 400 검색어 길이 오류, countStore 미호출', async () => {
            const res = await get({search_type: 'ALL', search_keyword: 'a'.repeat(101)}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('search_keyword');
            expect(res.body.message).toBe('검색어는 최대 100자까지 입력할 수 있습니다.');
            expect(storeRepository.countStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository]', () => {
        it('countStore throw → 500, findStoreList 미호출', async () => {
            storeRepository.countStore.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await get().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(storeRepository.findStoreList).not.toHaveBeenCalled();
        });

        it('findStoreList throw → 500', async () => {
            storeRepository.findStoreList.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await get().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(storeRepository.countStore).toHaveBeenCalledTimes(1);
        });
    });
});

// ─────────────────────────────────────────────────────────────
// Query DTO 생성자 규약 — ValidationPipe 는 인자 없이 new 한다
// ─────────────────────────────────────────────────────────────
describe('StoreListDto - 생성자 기본값', () => {
    it('인자 없이 new 해도 전 필드 기본값이 채워진다 (ValidationPipe 경로 회귀 방지)', () => {
        const dto = new StoreListDto();

        expect(dto.all_search_yn).toBe('N');
        expect(dto.page).toBe(1);
        expect(dto.size).toBe(20);
        expect(dto.page_size).toBe(10);
        expect(dto.search_type).toBeNull();
        expect(dto.search_keyword).toBeNull();
    });

    it('전달된 값만 덮어쓰고 나머지는 기본값을 유지한다', () => {
        const dto = new StoreListDto({page: 3, search_type: 'ALL'});

        expect(dto.page).toBe(3);
        expect(dto.search_type).toBe('ALL');
        expect(dto.size).toBe(20);
        expect(dto.search_keyword).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────
// [SMOKE:data-access] — DB 연결 없이 실제 쿼리 빌드
//   repository mock spec 은 TypeORM 매핑 코드를 한 줄도 실행하지 않으므로,
//   buildStoreSearchWhere 가 만드는 criteria 가 진짜 SQL 로 빌드되는지 여기서 확인한다.
// ─────────────────────────────────────────────────────────────
describe('[SMOKE:data-access] store 목록 쿼리 빌드 (무연결)', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        // database 는 무연결 메타데이터 빌드에 필요한 이름일 뿐 — 실제 접속은 하지 않는다.
        // (TypeORM 은 MySQL 계열에서 database 가 없으면 NoConnectionOptionError 로 메타데이터 검증을 중단한다)
        dataSource = new DataSource({type: 'mysql', database: 'test', entities: [StoreEntity]});
        // buildMetadatas 는 protected 지만 무연결 메타데이터 구성을 위해 호출한다(docs/testing.md 규약).
        await (dataSource as any).buildMetadatas();
    });

    const buildSql = (where: any, limit = 20, offset = 0): string =>
        dataSource
            .createQueryBuilder(StoreEntity, 'StoreEntity')
            .setFindOptions({where, order: {create_at: 'DESC'}, skip: offset, take: limit})
            .getSql();

    it('검색조건 없음 — is_delete 컬럼으로 빌드', () => {
        const sql = buildSql(buildStoreSearchWhere(null, null));

        expect(sql).toContain('is_delete');
        expect(sql).toContain('t_store');
    });

    it('STORE_NAME — store_name LIKE 로 빌드', () => {
        const sql = buildSql(buildStoreSearchWhere('STORE_NAME', '로우'));

        expect(sql).toContain('store_name');
        expect(sql.toUpperCase()).toContain('LIKE');
    });

    it('BUSINESS_NUMBER — business_number LIKE 로 빌드', () => {
        const sql = buildSql(buildStoreSearchWhere('BUSINESS_NUMBER', '123'));

        expect(sql).toContain('business_number');
        expect(sql.toUpperCase()).toContain('LIKE');
    });

    it('OWNER_NAME — owner_name LIKE 로 빌드', () => {
        const sql = buildSql(buildStoreSearchWhere('OWNER_NAME', '홍길'));

        expect(sql).toContain('owner_name');
        expect(sql.toUpperCase()).toContain('LIKE');
    });

    it('ALL — 세 컬럼이 모두 포함된 OR 조건으로 빌드', () => {
        const sql = buildSql(buildStoreSearchWhere('ALL', '강남'));

        expect(sql).toContain('store_name');
        expect(sql).toContain('business_number');
        expect(sql).toContain('owner_name');
        expect(sql.toUpperCase()).toContain('OR');
    });

    it('정렬·페이지 조합이 매핑 오류 없이 빌드된다', () => {
        const sql = buildSql(buildStoreSearchWhere(null, null), 5, 10);

        expect(sql).toContain('create_at');
        expect(sql.toUpperCase()).toContain('ORDER BY');
    });

    it('위험 매핑(프로퍼티명 ≠ 컬럼명) 스냅샷 — 신규 발생 시 리뷰 강제', () => {
        const risky = dataSource
            .getMetadata(StoreEntity)
            .columns.filter((column) => column.propertyName !== column.databaseName)
            .map((column) => `${column.propertyName}→${column.databaseName}`);

        expect(risky).toEqual([]);
    });
});
