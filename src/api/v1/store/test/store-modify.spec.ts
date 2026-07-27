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

describe('StoreService - modify (가맹점 수정)', () => {
    let app: INestApplication;
    let storeRepository: {findStore: jest.Mock; updateStore: jest.Mock};
    let guardAllows: boolean;
    let currentAuthId: string;

    const VALID_DTO = {
        store_name: '로우호텔 역삼점',
        owner_name: '김철수',
        phone: '02-9999-8888',
        address: '서울시 강남구 역삼로 2',
        address_detail: '5층',
    };

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

    const patch = (body: any = VALID_DTO, store_id: string = STORE_ID) =>
        request(app.getHttpServer()).patch(`/api/v1/store/modify/${store_id}`).send(body);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] modify — 정상 수정', () => {
        it('204 + updateStore 가 ({store_id}, entity) 로 1회 호출, entity 컬럼 값 검증', async () => {
            await patch().expect(204);

            expect(storeRepository.findStore).toHaveBeenCalledTimes(1);
            expect(storeRepository.findStore).toHaveBeenCalledWith({store_id: STORE_ID, is_delete: 0});

            expect(storeRepository.updateStore).toHaveBeenCalledTimes(1);
            const [where, entity] = storeRepository.updateStore.mock.calls[0];
            expect(where).toEqual({store_id: STORE_ID});
            expect(entity).toBeInstanceOf(StoreEntity);
            expect(entity.store_name).toBe(VALID_DTO.store_name);
            expect(entity.owner_name).toBe(VALID_DTO.owner_name);
            expect(entity.phone).toBe(VALID_DTO.phone);
            expect(entity.address).toBe(VALID_DTO.address);
            expect(entity.address_detail).toBe(VALID_DTO.address_detail);
        });

        it('사업자등록번호는 수정 대상이 아니므로 entity 에 실리지 않는다', async () => {
            await patch().expect(204);

            const [, entity] = storeRepository.updateStore.mock.calls[0];
            expect(entity.business_number).toBeUndefined();
        });
    });

    describe('[SUCCESS] modify — address_detail 미전송', () => {
        it('entity.address_detail 이 null 로 명시된다 (TypeORM update 가 undefined 를 무시하지 않도록)', async () => {
            const {address_detail: _d, ...body} = VALID_DTO;

            await patch(body).expect(204);

            const [, entity] = storeRepository.updateStore.mock.calls[0];
            expect(entity.address_detail).toBeNull();
        });
    });

    describe('[SUCCESS] modify — body 에 business_number 를 끼워보내도 무시', () => {
        it('204 이며 entity.business_number 는 여전히 undefined', async () => {
            await patch({...VALID_DTO, business_number: '9999999999'}).expect(204);

            const [, entity] = storeRepository.updateStore.mock.calls[0];
            expect(entity.business_number).toBeUndefined();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        // 미전송은 @MaxLength·@IsNotEmpty 가 함께 걸려 constraints 키 순서가 보장되지 않으므로 property 만 단언한다.
        it('store_name 미전송 → 400, findStore·updateStore 미호출', async () => {
            const {store_name: _n, ...body} = VALID_DTO;

            const res = await patch(body).expect(400);

            expect(res.body.validationErrors[0].property).toBe('store_name');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
            expect(storeRepository.updateStore).not.toHaveBeenCalled();
        });

        it('phone 형식 오류 → 400, updateStore 미호출', async () => {
            const res = await patch({...VALID_DTO, phone: 'abc'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('phone');
            expect(res.body.message).toBe('연락처 형식이 올바르지 않습니다.');
            expect(storeRepository.updateStore).not.toHaveBeenCalled();
        });

        it('address 256자 → 400, updateStore 미호출', async () => {
            const res = await patch({...VALID_DTO, address: 'a'.repeat(256)}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('address');
            expect(res.body.message).toBe('주소는 최대 255자까지 입력할 수 있습니다.');
            expect(storeRepository.updateStore).not.toHaveBeenCalled();
        });

        it('store_id 형식 불일치 → 400, findStore 미호출', async () => {
            const res = await patch(VALID_DTO, 'bad-store-id').expect(400);

            expect(res.body.validationErrors[0].property).toBe('store_id');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service]
    // ─────────────────────────────────────────
    describe('[FAIL:service] 대상 없음', () => {
        it('findStore 가 null → 404, updateStore 미호출', async () => {
            storeRepository.findStore.mockResolvedValueOnce(null);

            const res = await patch().expect(404);

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

            const res = await patch().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('미인증 → 401, findStore 미호출', async () => {
            guardAllows = false;

            await patch().expect(401);
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

            const res = await patch().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(storeRepository.updateStore).toHaveBeenCalledTimes(1);
        });
    });
});
