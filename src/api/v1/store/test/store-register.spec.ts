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

describe('StoreService - register (가맹점 등록)', () => {
    let app: INestApplication;
    let storeRepository: {insertStore: jest.Mock};
    let guardAllows: boolean;
    let currentAuthId: string;

    const VALID_DTO = {
        store_name: '로우호텔 강남점',
        business_number: '1234567890',
        owner_name: '홍길동',
        phone: '02-1234-5678',
        address: '서울시 강남구 테헤란로 1',
        address_detail: '3층',
    };

    const buildModule = async () => {
        guardAllows = true;
        currentAuthId = 'SUPER_ADMIN';
        storeRepository = {insertStore: jest.fn().mockResolvedValue(undefined)};

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

    const post = (body: any = VALID_DTO) => request(app.getHttpServer()).post('/api/v1/store/register').send(body);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] register — SUPER_ADMIN 정상 등록', () => {
        it('200 + store_id 반환, insertStore entity 전 컬럼 검증', async () => {
            const res = await post().expect(200);

            // 응답
            expect(res.body.store_id).toMatch(/^[a-f0-9]{32}$/);

            // insertStore 호출 검증 — entity 컬럼 값
            expect(storeRepository.insertStore).toHaveBeenCalledTimes(1);
            const [storeEntity] = storeRepository.insertStore.mock.calls[0];
            expect(storeEntity).toBeInstanceOf(StoreEntity);
            expect(storeEntity.store_id).toBe(res.body.store_id);
            expect(storeEntity.store_name).toBe(VALID_DTO.store_name);
            expect(storeEntity.business_number).toBe(VALID_DTO.business_number);
            expect(storeEntity.owner_name).toBe(VALID_DTO.owner_name);
            expect(storeEntity.phone).toBe(VALID_DTO.phone);
            expect(storeEntity.address).toBe(VALID_DTO.address);
            expect(storeEntity.address_detail).toBe(VALID_DTO.address_detail);
            expect(storeEntity.is_delete).toBe(0);
            expect(storeEntity.delete_backup).toBeNull();
        });
    });

    describe('[SUCCESS] register — ADMIN 권한도 허용', () => {
        it('200, insertStore 1회', async () => {
            currentAuthId = 'ADMIN';

            const res = await post().expect(200);

            expect(res.body.store_id).toMatch(/^[a-f0-9]{32}$/);
            expect(storeRepository.insertStore).toHaveBeenCalledTimes(1);
        });
    });

    describe('[SUCCESS] address_detail 미전송', () => {
        it('address_detail = null 저장', async () => {
            const {address_detail: _d, ...bodyWithoutDetail} = VALID_DTO;

            await post(bodyWithoutDetail).expect(200);

            const [storeEntity] = storeRepository.insertStore.mock.calls[0];
            expect(storeEntity.address_detail).toBeNull();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:auth] — RolesGuard 실제 동작 검증
    // ─────────────────────────────────────────
    describe('[FAIL:auth] USER 권한', () => {
        it('403 접근 권한 없음, insertStore 미호출', async () => {
            currentAuthId = 'USER';

            const res = await post().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.insertStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:auth] MANAGER 권한', () => {
        it('403 접근 권한 없음, insertStore 미호출', async () => {
            currentAuthId = 'MANAGER';

            const res = await post().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.insertStore).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:auth] 미인증', () => {
        it('guard 거부 → 401, insertStore 미호출', async () => {
            guardAllows = false;

            await post().expect(401);
            expect(storeRepository.insertStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        it('store_name 미전송 → 400, property=store_name, insertStore 미호출', async () => {
            const {store_name: _n, ...body} = VALID_DTO;
            const res = await post(body).expect(400);
            expect(res.body.validationErrors[0].property).toBe('store_name');
            expect(storeRepository.insertStore).not.toHaveBeenCalled();
        });

        it('business_number 형식 오류("123") → 400, property=business_number, insertStore 미호출', async () => {
            const res = await post({...VALID_DTO, business_number: '123'}).expect(400);
            expect(res.body.validationErrors[0].property).toBe('business_number');
            expect(storeRepository.insertStore).not.toHaveBeenCalled();
        });

        it('phone 형식 오류("abc") → 400, property=phone, insertStore 미호출', async () => {
            const res = await post({...VALID_DTO, phone: 'abc'}).expect(400);
            expect(res.body.validationErrors[0].property).toBe('phone');
            expect(storeRepository.insertStore).not.toHaveBeenCalled();
        });

        it('address 미전송 → 400, property=address, insertStore 미호출', async () => {
            const {address: _a, ...body} = VALID_DTO;
            const res = await post(body).expect(400);
            expect(res.body.validationErrors[0].property).toBe('address');
            expect(storeRepository.insertStore).not.toHaveBeenCalled();
        });

        it('store_name 101자 초과 → 400, property=store_name, insertStore 미호출', async () => {
            const res = await post({...VALID_DTO, store_name: 'a'.repeat(101)}).expect(400);
            expect(res.body.validationErrors[0].property).toBe('store_name');
            expect(storeRepository.insertStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:duplicate]
    // ─────────────────────────────────────────
    describe('[FAIL:duplicate] insertStore — UK_Store_BusinessNumber 중복', () => {
        it('400 이미 등록된 사업자등록번호, insertStore 1회 호출 인자 검증', async () => {
            storeRepository.insertStore.mockRejectedValueOnce(
                new BadRequestException({message: '이미 등록된 사업자등록번호입니다.'}),
            );

            const res = await post().expect(400);
            expect(res.body.message).toBe('이미 등록된 사업자등록번호입니다.');

            expect(storeRepository.insertStore).toHaveBeenCalledTimes(1);
            const [storeEntity] = storeRepository.insertStore.mock.calls[0];
            expect(storeEntity.business_number).toBe(VALID_DTO.business_number);
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository] insertStore — InternalServerError', () => {
        it('500 통일 메시지', async () => {
            storeRepository.insertStore.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await post().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(storeRepository.insertStore).toHaveBeenCalledTimes(1);
        });
    });
});
