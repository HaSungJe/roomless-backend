jest.mock('typeorm-transactional', () => ({
    Transactional: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, InternalServerErrorException, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import request from 'supertest';
import { StoreController } from '../store.controller';
import { StoreService } from '../store.service';
import { STORE_REPOSITORY } from '../store.symbols';
import { StoreEntity } from '../entities/store.entity';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';

const USER = 'user-id-32chars-fillerxxxxxxxxxx';
const STORE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const buildStore = (overrides: Partial<StoreEntity> = {}): StoreEntity => {
    const store = new StoreEntity();
    store.store_id = STORE_ID;
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

describe('StoreService - detail (가맹점 상세 조회)', () => {
    let app: INestApplication;
    let storeRepository: {findStore: jest.Mock};
    let guardAllows: boolean;
    let currentAuthId: string;

    const buildModule = async () => {
        guardAllows = true;
        currentAuthId = 'SUPER_ADMIN';
        storeRepository = {findStore: jest.fn().mockResolvedValue(buildStore())};

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

    const get = (store_id: string = STORE_ID) => request(app.getHttpServer()).get(`/api/v1/store/detail/${store_id}`);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] detail — 존재하는 가맹점', () => {
        it('200 + 전 필드 반환, findStore 가 {store_id, is_delete:0} 로 1회 호출', async () => {
            const store = buildStore({address_detail: '3층'});
            storeRepository.findStore.mockResolvedValueOnce(store);

            const res = await get().expect(200);

            expect(res.body).toEqual({
                store_id: STORE_ID,
                store_name: store.store_name,
                business_number: store.business_number,
                owner_name: store.owner_name,
                phone: store.phone,
                address: store.address,
                address_detail: '3층',
                create_at: store.create_at.toISOString(),
                update_at: store.update_at.toISOString(),
            });

            expect(storeRepository.findStore).toHaveBeenCalledTimes(1);
            expect(storeRepository.findStore).toHaveBeenCalledWith({store_id: STORE_ID, is_delete: 0});
        });
    });

    describe('[SUCCESS] detail — address_detail 없음', () => {
        it('address_detail 이 null 로 포함된다 (필드 생략 금지)', async () => {
            const res = await get().expect(200);

            expect(res.body).toHaveProperty('address_detail');
            expect(res.body.address_detail).toBeNull();
        });
    });

    describe('[SUCCESS] detail — ADMIN 권한도 허용', () => {
        it('200, findStore 1회', async () => {
            currentAuthId = 'ADMIN';

            await get().expect(200);
            expect(storeRepository.findStore).toHaveBeenCalledTimes(1);
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        it('store_id 형식 불일치(32자 hex 아님) → 400, findStore 미호출', async () => {
            const res = await get('not-a-valid-store-id').expect(400);

            expect(res.body.validationErrors[0].property).toBe('store_id');
            expect(res.body.message).toBe('가맹점 ID 형식이 올바르지 않습니다.');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('store_id 길이 부족(31자) → 400, findStore 미호출', async () => {
            const res = await get('a'.repeat(31)).expect(400);

            expect(res.body.validationErrors[0].property).toBe('store_id');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service]
    // ─────────────────────────────────────────
    describe('[FAIL:service] 대상 없음', () => {
        it('findStore 가 null → 404 가맹점을 찾을 수 없습니다.', async () => {
            storeRepository.findStore.mockResolvedValueOnce(null);

            const res = await get().expect(404);

            expect(res.body.message).toBe('가맹점을 찾을 수 없습니다.');
            expect(storeRepository.findStore).toHaveBeenCalledTimes(1);
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:auth]
    // ─────────────────────────────────────────
    describe('[FAIL:auth]', () => {
        it('USER 권한 → 403, findStore 미호출', async () => {
            currentAuthId = 'USER';

            const res = await get().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('미인증 → 401, findStore 미호출', async () => {
            guardAllows = false;

            await get().expect(401);
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository]', () => {
        it('findStore throw → 500 통일 메시지', async () => {
            storeRepository.findStore.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await get().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
        });
    });
});
