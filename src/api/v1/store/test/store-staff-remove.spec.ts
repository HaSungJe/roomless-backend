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
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';

const USER = 'user-id-32chars-fillerxxxxxxxxxx';
const TARGET_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const MY_STORE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_STORE_ID = 'ffffffffffffffffffffffffffffffff';

const buildStaff = (overrides: Partial<UserEntity> = {}): UserEntity => {
    const staff = new UserEntity();
    staff.user_id = TARGET_ID;
    staff.login_id = 'manager0001';
    staff.auth_id = 'MANAGER';
    staff.state_id = 'ACTIVE';
    staff.store_id = MY_STORE_ID;
    return Object.assign(staff, overrides);
};

describe('StoreService - staffRemove (인력 계정 삭제)', () => {
    let app: INestApplication;
    let storeRepository: {findStaff: jest.Mock; updateStaff: jest.Mock};
    let guardAllows: boolean;
    let currentAuthId: string;
    let currentStoreId: string | null;

    const buildModule = async () => {
        guardAllows = true;
        currentAuthId = 'SUPER_ADMIN';
        currentStoreId = null;
        storeRepository = {
            findStaff: jest.fn().mockResolvedValue(buildStaff()),
            updateStaff: jest.fn().mockResolvedValue(undefined),
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

    const del = (user_id: string = TARGET_ID) => request(app.getHttpServer()).delete(`/api/v1/store/staff/remove/${user_id}`);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] staffRemove — ADMIN', () => {
        it('204 + state_id=LEAVE 전이, store_id 는 손대지 않는다 (소속 이력 보존)', async () => {
            await del().expect(204);

            expect(storeRepository.findStaff).toHaveBeenCalledTimes(1);
            expect(storeRepository.updateStaff).toHaveBeenCalledTimes(1);
            const [where, entity] = storeRepository.updateStaff.mock.calls[0];
            expect(where).toEqual({user_id: TARGET_ID});
            expect(entity).toBeInstanceOf(UserEntity);
            expect(entity.state_id).toBe('LEAVE');
            expect(entity.store_id).toBeUndefined();
            expect(entity.auth_id).toBeUndefined();
            expect(entity.login_id).toBeUndefined();
        });

        it('ADMIN 은 총괄매니저도 삭제할 수 있다', async () => {
            currentAuthId = 'ADMIN';
            storeRepository.findStaff.mockResolvedValueOnce(buildStaff({auth_id: 'HEAD_MANAGER'}));

            await del().expect(204);

            expect(storeRepository.updateStaff).toHaveBeenCalledTimes(1);
        });
    });

    describe('[SUCCESS] staffRemove — 총괄매니저', () => {
        it('자기 업체의 매니저 삭제 → 204', async () => {
            currentAuthId = 'HEAD_MANAGER';
            currentStoreId = MY_STORE_ID;

            await del().expect(204);

            const [, entity] = storeRepository.updateStaff.mock.calls[0];
            expect(entity.state_id).toBe('LEAVE');
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service] — 총괄매니저 권한 경계
    // ─────────────────────────────────────────
    describe('[FAIL:service] 총괄매니저 권한 경계', () => {
        it('다른 업체 매니저 삭제 → 403, updateStaff 미호출', async () => {
            currentAuthId = 'HEAD_MANAGER';
            currentStoreId = MY_STORE_ID;
            storeRepository.findStaff.mockResolvedValueOnce(buildStaff({store_id: OTHER_STORE_ID}));

            const res = await del().expect(403);

            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.updateStaff).not.toHaveBeenCalled();
        });

        it('총괄매니저(자신 포함) 삭제 시도 → 403, updateStaff 미호출', async () => {
            currentAuthId = 'HEAD_MANAGER';
            currentStoreId = MY_STORE_ID;
            storeRepository.findStaff.mockResolvedValueOnce(buildStaff({auth_id: 'HEAD_MANAGER'}));

            const res = await del().expect(403);

            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.updateStaff).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service] 대상 없음', () => {
        it('findStaff 가 null(이미 LEAVE 포함) → 404, updateStaff 미호출', async () => {
            storeRepository.findStaff.mockResolvedValueOnce(null);

            const res = await del().expect(404);

            expect(res.body.message).toBe('인력을 찾을 수 없습니다.');
            expect(storeRepository.updateStaff).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        it('user_id 형식 오류 → 400, findStaff 미호출', async () => {
            const res = await del('bad-user-id').expect(400);

            expect(res.body.validationErrors[0].property).toBe('user_id');
            expect(res.body.message).toBe('회원 ID 형식이 올바르지 않습니다.');
            expect(storeRepository.findStaff).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:auth]
    // ─────────────────────────────────────────
    describe('[FAIL:auth]', () => {
        it.each(['USER', 'MANAGER'])('%s 권한 → 403, findStaff 미호출', async (auth_id) => {
            currentAuthId = auth_id;

            const res = await del().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.findStaff).not.toHaveBeenCalled();
        });

        it('미인증 → 401, findStaff 미호출', async () => {
            guardAllows = false;

            await del().expect(401);
            expect(storeRepository.findStaff).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository]', () => {
        it('updateStaff throw → 500', async () => {
            storeRepository.updateStaff.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await del().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(storeRepository.updateStaff).toHaveBeenCalledTimes(1);
        });
    });
});
