jest.mock('typeorm-transactional', () => ({
    Transactional: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, InternalServerErrorException, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { DataSource, In, Like, Not } from 'typeorm';
import { StoreController } from '../store.controller';
import { StoreService } from '../store.service';
import { STORE_REPOSITORY } from '../store.symbols';
import { StoreEntity } from '../entities/store.entity';
import { StoreStaffListDto } from '../dto/store-staff-list.dto';
import { buildStaffSearchWhere } from '../store.util';
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { AuthEntity } from '@root/api/v1/user/entities/auth.entity';
import { StateEntity } from '@root/api/v1/user/entities/state.entity';
import { SnsEntity } from '@root/api/v1/user/entities/sns.entity';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';

const USER = 'user-id-32chars-fillerxxxxxxxxxx';
const MY_STORE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER_STORE_ID = 'ffffffffffffffffffffffffffffffff';

const buildStaff = (overrides: Partial<UserEntity> = {}): UserEntity => {
    const staff = new UserEntity();
    staff.user_id = 'staff-id-32chars-fillerxxxxxxxxx';
    staff.login_id = 'head_manager1';
    staff.name = '홍길동';
    staff.nickname = '길동매니저';
    staff.auth_id = 'HEAD_MANAGER';
    staff.state_id = 'ACTIVE';
    staff.store_id = MY_STORE_ID;
    staff.create_at = new Date('2026-07-01T00:00:00.000Z');
    return Object.assign(staff, overrides);
};

const buildStore = (): StoreEntity => {
    const store = new StoreEntity();
    store.store_id = MY_STORE_ID;
    store.store_name = '로우호텔 강남점';
    return store;
};

describe('StoreService - staffList (업체 인력 목록)', () => {
    let app: INestApplication;
    let storeRepository: {countStaff: jest.Mock; findStaffList: jest.Mock; findStores: jest.Mock};
    let guardAllows: boolean;
    let currentAuthId: string;
    let currentStoreId: string | null;

    const buildModule = async () => {
        guardAllows = true;
        currentAuthId = 'SUPER_ADMIN';
        currentStoreId = null;
        storeRepository = {
            countStaff: jest.fn().mockResolvedValue(0),
            findStaffList: jest.fn().mockResolvedValue([]),
            findStores: jest.fn().mockResolvedValue([]),
        };

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
                    req.user = {user_id: USER, auth_id: currentAuthId, store_id: currentStoreId};
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

    const get = (query: Record<string, any> = {}) => request(app.getHttpServer()).get('/api/v1/store/staff/list').query(query);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] staffList — ADMIN 전체 조회', () => {
        it('200 + where 가 인력 역할·비LEAVE 만, store_id 조건 없음', async () => {
            const staff = buildStaff();
            storeRepository.countStaff.mockResolvedValueOnce(1);
            storeRepository.findStaffList.mockResolvedValueOnce([staff]);
            storeRepository.findStores.mockResolvedValueOnce([buildStore()]);

            const res = await get().expect(200);

            expect(res.body.list).toHaveLength(1);
            expect(res.body.list[0]).toEqual({
                user_id: staff.user_id,
                login_id: staff.login_id,
                name: staff.name,
                nickname: staff.nickname,
                auth_id: 'HEAD_MANAGER',
                state_id: 'ACTIVE',
                store_id: MY_STORE_ID,
                store_name: '로우호텔 강남점',
                create_at: staff.create_at.toISOString(),
            });

            expect(storeRepository.countStaff).toHaveBeenCalledTimes(1);
            const [where] = storeRepository.countStaff.mock.calls[0];
            expect(where).toEqual({auth_id: In(['HEAD_MANAGER', 'MANAGER']), state_id: Not('LEAVE')});
            expect(where.store_id).toBeUndefined();
        });
    });

    describe('[SUCCESS] staffList — ADMIN + store_id 파라미터', () => {
        it('where 에 store_id 가 포함된다', async () => {
            await get({store_id: OTHER_STORE_ID}).expect(200);

            const [where] = storeRepository.countStaff.mock.calls[0];
            expect(where.store_id).toBe(OTHER_STORE_ID);
        });
    });

    describe('[SUCCESS] staffList — 총괄매니저 스코프 강제', () => {
        it('남의 store_id 를 넣어도 무시하고 자기 업체로 고정된다 (권한 우회 방지)', async () => {
            currentAuthId = 'HEAD_MANAGER';
            currentStoreId = MY_STORE_ID;

            await get({store_id: OTHER_STORE_ID}).expect(200);

            const [where] = storeRepository.countStaff.mock.calls[0];
            expect(where.store_id).toBe(MY_STORE_ID);
            expect(where.store_id).not.toBe(OTHER_STORE_ID);
        });
    });

    describe('[SUCCESS] staffList — auth_id 필터', () => {
        it('auth_id=MANAGER → where.auth_id 가 In 이 아니라 단일 값', async () => {
            await get({auth_id: 'MANAGER'}).expect(200);

            const [where] = storeRepository.countStaff.mock.calls[0];
            expect(where.auth_id).toBe('MANAGER');
        });
    });

    describe('[SUCCESS] staffList — 검색어', () => {
        it('3원소 OR 배열이고 각 원소가 base 조건을 모두 보유한다', async () => {
            await get({search_keyword: '홍길'}).expect(200);

            const [where] = storeRepository.countStaff.mock.calls[0];
            expect(Array.isArray(where)).toBe(true);
            expect(where).toHaveLength(3);
            expect(where[0]).toEqual({auth_id: In(['HEAD_MANAGER', 'MANAGER']), state_id: Not('LEAVE'), login_id: Like('%홍길%')});
            expect(where[1].name).toEqual(Like('%홍길%'));
            expect(where[2].nickname).toEqual(Like('%홍길%'));
            for (const clause of where) {
                expect(clause.state_id).toEqual(Not('LEAVE'));
            }
        });
    });

    describe('[SUCCESS] staffList — 상호명 매핑', () => {
        it('findStores 가 중복 제거된 store_ids 로 1회만 호출된다', async () => {
            const a = buildStaff({user_id: 'a'.repeat(32), store_id: MY_STORE_ID});
            const b = buildStaff({user_id: 'b'.repeat(32), store_id: MY_STORE_ID, auth_id: 'MANAGER'});
            storeRepository.countStaff.mockResolvedValueOnce(2);
            storeRepository.findStaffList.mockResolvedValueOnce([a, b]);
            storeRepository.findStores.mockResolvedValueOnce([buildStore()]);

            const res = await get().expect(200);

            expect(storeRepository.findStores).toHaveBeenCalledTimes(1);
            expect(storeRepository.findStores).toHaveBeenCalledWith({store_id: In([MY_STORE_ID])});
            expect(res.body.list[0].store_name).toBe('로우호텔 강남점');
            expect(res.body.list[1].store_name).toBe('로우호텔 강남점');
        });

        it('store_id 가 null 인 인력은 store_name 도 null 이고 findStores 를 호출하지 않는다', async () => {
            storeRepository.countStaff.mockResolvedValueOnce(1);
            storeRepository.findStaffList.mockResolvedValueOnce([buildStaff({store_id: null})]);

            const res = await get().expect(200);

            expect(res.body.list[0].store_id).toBeNull();
            expect(res.body.list[0].store_name).toBeNull();
            expect(storeRepository.findStores).not.toHaveBeenCalled();
        });
    });

    describe('[SUCCESS] staffList — Query DTO 기본값', () => {
        it('쿼리 파라미터 전무 → findStaffList(limit=20, offset=0), pagination.page=1', async () => {
            const res = await get().expect(200);

            const [, limit, offset] = storeRepository.findStaffList.mock.calls[0];
            expect(limit).toBe(20);
            expect(offset).toBe(0);
            expect(res.body.pagination.page).toBe(1);
            expect(res.body.pagination.all_search_yn).toBe('N');
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        it('auth_id 허용값 밖 → 400, countStaff 미호출', async () => {
            const res = await get({auth_id: 'USER'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('auth_id');
            expect(res.body.message).toBe('역할이 올바르지 않습니다.');
            expect(storeRepository.countStaff).not.toHaveBeenCalled();
        });

        it('store_id 형식 오류 → 400, countStaff 미호출', async () => {
            const res = await get({store_id: 'bad-id'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('store_id');
            expect(storeRepository.countStaff).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:auth]
    // ─────────────────────────────────────────
    describe('[FAIL:auth]', () => {
        it.each(['USER', 'MANAGER'])('%s 권한 → 403, countStaff 미호출', async (auth_id) => {
            currentAuthId = auth_id;

            const res = await get().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.countStaff).not.toHaveBeenCalled();
        });

        it('미인증 → 401, countStaff 미호출', async () => {
            guardAllows = false;

            await get().expect(401);
            expect(storeRepository.countStaff).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository]', () => {
        it('countStaff throw → 500, findStaffList 미호출', async () => {
            storeRepository.countStaff.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await get().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(storeRepository.findStaffList).not.toHaveBeenCalled();
        });
    });
});

// ─────────────────────────────────────────────────────────────
// Query DTO 생성자 규약
// ─────────────────────────────────────────────────────────────
describe('StoreStaffListDto - 생성자 기본값', () => {
    it('인자 없이 new 해도 전 필드 기본값이 채워진다 (ValidationPipe 경로 회귀 방지)', () => {
        const dto = new StoreStaffListDto();

        expect(dto.all_search_yn).toBe('N');
        expect(dto.page).toBe(1);
        expect(dto.size).toBe(20);
        expect(dto.page_size).toBe(10);
        expect(dto.store_id).toBeNull();
        expect(dto.auth_id).toBeNull();
        expect(dto.search_keyword).toBeNull();
    });

    it('전달된 값만 덮어쓰고 나머지는 기본값을 유지한다', () => {
        const dto = new StoreStaffListDto({page: 2, auth_id: 'MANAGER'});

        expect(dto.page).toBe(2);
        expect(dto.auth_id).toBe('MANAGER');
        expect(dto.size).toBe(20);
        expect(dto.store_id).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────
// [SMOKE:data-access] — DB 연결 없이 실제 쿼리 빌드
//   auth_id·state_id·store_id 는 전부 @ManyToOne 관계 필드라 매핑 민감이다.
//   repository mock spec 은 TypeORM 매핑 코드를 한 줄도 실행하지 않는다.
// ─────────────────────────────────────────────────────────────
describe('[SMOKE:data-access] staff 목록 쿼리 빌드 (무연결)', () => {
    let dataSource: DataSource;

    beforeAll(async () => {
        // database 는 무연결 메타데이터 빌드에 필요한 이름일 뿐 — 실제 접속은 하지 않는다.
        // (MySQL 계열은 database 가 없으면 buildMetadatas 가 NoConnectionOptionError 로 중단된다)
        // UserEntity 는 auth/state/sns/store 4개 FK 를 갖고 있어 관계 대상 엔티티를 모두 넣어야 메타데이터가 구성된다.
        dataSource = new DataSource({type: 'mysql', database: 'test', entities: [UserEntity, StoreEntity, AuthEntity, StateEntity, SnsEntity]});
        // buildMetadatas 는 protected 지만 무연결 메타데이터 구성을 위해 호출한다(docs/testing.md 규약).
        await (dataSource as any).buildMetadatas();
    });

    const buildSql = (where: any, limit = 20, offset = 0): string =>
        dataSource
            .createQueryBuilder(UserEntity, 'UserEntity')
            .setFindOptions({where, order: {auth_id: 'ASC', create_at: 'DESC'}, skip: offset, take: limit})
            .getSql();

    it('기본 조건 — auth_id IN + state_id != LEAVE 로 빌드', () => {
        const sql = buildSql(buildStaffSearchWhere(null, null, null));

        expect(sql).toContain('auth_id');
        expect(sql).toContain('state_id');
        expect(sql).toContain('t_user');
    });

    it('store_id 지정 — 관계 필드 where 가 컬럼으로 해석된다', () => {
        const sql = buildSql(buildStaffSearchWhere(MY_STORE_ID, null, null));

        expect(sql).toContain('store_id');
    });

    it('auth_id 지정 — 단일 값 조건으로 빌드', () => {
        const sql = buildSql(buildStaffSearchWhere(null, 'MANAGER', null));

        expect(sql).toContain('auth_id');
    });

    it('검색어 — login_id·name·nickname OR 로 빌드', () => {
        const sql = buildSql(buildStaffSearchWhere(null, null, '홍길'));

        expect(sql).toContain('login_id');
        expect(sql).toContain('name');
        expect(sql).toContain('nickname');
        expect(sql.toUpperCase()).toContain('OR');
        expect(sql.toUpperCase()).toContain('LIKE');
    });

    it('관계 필드 정렬(auth_id) + 페이지 조합이 매핑 오류 없이 빌드된다', () => {
        const sql = buildSql(buildStaffSearchWhere(null, null, null), 5, 10);

        expect(sql.toUpperCase()).toContain('ORDER BY');
        expect(sql).toContain('create_at');
    });

    it('위험 매핑(프로퍼티명 ≠ 컬럼명) 스냅샷 — store_id 추가 후에도 신규 발생 없음', () => {
        const risky = dataSource
            .getMetadata(UserEntity)
            .columns.filter((column) => column.propertyName !== column.databaseName)
            .map((column) => `${column.propertyName}→${column.databaseName}`);

        expect(risky).toEqual([]);
    });
});
