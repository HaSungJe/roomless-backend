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

const buildStore = (): StoreEntity => {
    const store = new StoreEntity();
    store.store_id = STORE_ID;
    store.store_name = '로우호텔 강남점';
    store.business_number = '1234567890';
    store.owner_name = '홍길동';
    store.phone = '02-1234-5678';
    store.address = '서울시 강남구 테헤란로 1';
    store.address_detail = '3층';
    store.is_delete = 0;
    store.delete_backup = null;
    store.create_at = new Date('2026-07-01T00:00:00.000Z');
    store.update_at = new Date('2026-07-02T00:00:00.000Z');
    return store;
};

describe('StoreService - remove (가맹점 삭제)', () => {
    let app: INestApplication;
    let storeRepository: {findStore: jest.Mock; updateStore: jest.Mock};
    let guardAllows: boolean;
    let currentAuthId: string;

    const buildModule = async () => {
        guardAllows = true;
        currentAuthId = 'SUPER_ADMIN';
        storeRepository = {
            findStore: jest.fn().mockResolvedValue(buildStore()),
            updateStore: jest.fn().mockResolvedValue(undefined),
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

    const del = (store_id: string = STORE_ID) => request(app.getHttpServer()).delete(`/api/v1/store/remove/${store_id}`);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] remove — 정상 삭제', () => {
        it('204 + is_delete=1, business_number 마스킹, delete_backup 스냅샷', async () => {
            const origin = buildStore();

            await del().expect(204);

            expect(storeRepository.findStore).toHaveBeenCalledTimes(1);
            expect(storeRepository.findStore).toHaveBeenCalledWith({store_id: STORE_ID, is_delete: 0});

            expect(storeRepository.updateStore).toHaveBeenCalledTimes(1);
            const [where, entity] = storeRepository.updateStore.mock.calls[0];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);

            // soft delete + UK 를 비우는 마스킹
            expect(entity.is_delete).toBe(1);
            expect(entity.business_number).toBe(`DELETE_${STORE_ID}`);

            // 삭제 직전 스냅샷 — 원본 사업자등록번호 포함
            const backup = JSON.parse(entity.delete_backup);
            expect(backup).toEqual({
                store_name: origin.store_name,
                business_number: origin.business_number,
                owner_name: origin.owner_name,
                phone: origin.phone,
                address: origin.address,
                address_detail: origin.address_detail,
                create_at: origin.create_at.toISOString(),
            });
        });

        it('마스킹 값이 PK 접미사라 39자로 고정된다 (business_number 길이 45 수용)', async () => {
            await del().expect(204);

            const [, entity] = storeRepository.updateStore.mock.calls[0];
            expect(entity.business_number).toHaveLength(39);
        });

        it('상호명·연락처 등 나머지 컬럼은 손대지 않는다', async () => {
            await del().expect(204);

            const [, entity] = storeRepository.updateStore.mock.calls[0];
            expect(entity.store_name).toBeUndefined();
            expect(entity.owner_name).toBeUndefined();
            expect(entity.phone).toBeUndefined();
            expect(entity.address).toBeUndefined();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        it('store_id 형식 불일치 → 400, findStore·updateStore 미호출', async () => {
            const res = await del('bad-store-id').expect(400);

            expect(res.body.validationErrors[0].property).toBe('store_id');
            expect(res.body.message).toBe('가맹점 ID 형식이 올바르지 않습니다.');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
            expect(storeRepository.updateStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service]
    // ─────────────────────────────────────────
    describe('[FAIL:service] 대상 없음(이미 삭제된 가맹점 포함)', () => {
        it('findStore 가 null → 404, updateStore 미호출', async () => {
            storeRepository.findStore.mockResolvedValueOnce(null);

            const res = await del().expect(404);

            expect(res.body.message).toBe('가맹점을 찾을 수 없습니다.');
            expect(storeRepository.updateStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:auth]
    // ─────────────────────────────────────────
    describe('[FAIL:auth]', () => {
        it('USER 권한 → 403, findStore 미호출', async () => {
            currentAuthId = 'USER';

            const res = await del().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('MANAGER 권한 → 403, findStore 미호출', async () => {
            currentAuthId = 'MANAGER';

            const res = await del().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('미인증 → 401, findStore 미호출', async () => {
            guardAllows = false;

            await del().expect(401);
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository]', () => {
        it('updateStore throw → 500 통일 메시지', async () => {
            storeRepository.updateStore.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await del().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(storeRepository.updateStore).toHaveBeenCalledTimes(1);
        });
    });
});
