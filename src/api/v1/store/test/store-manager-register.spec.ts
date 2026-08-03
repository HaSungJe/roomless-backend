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
import { UserEntity } from '@root/api/v1/user/entities/user.entity';
import { UserSettingEntity } from '@root/api/v1/user/entities/user-setting.entity';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';
import * as bcryptUtil from '@root/common/utils/bcrypt';

const USER = 'user-id-32chars-fillerxxxxxxxxxx';
const MY_STORE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER_STORE_ID = 'ffffffffffffffffffffffffffffffff';
const MOCK_HASH = '$2b$13$mock-hashed-password';

const buildStore = (): StoreEntity => {
    const store = new StoreEntity();
    store.store_id = MY_STORE_ID;
    store.store_name = '로우호텔 강남점';
    store.is_delete = 0;
    return store;
};

describe('StoreService - managerRegister (매니저 계정 생성)', () => {
    let app: INestApplication;
    let storeRepository: {findStore: jest.Mock; insertStaff: jest.Mock; insertStaffSetting: jest.Mock};
    let getBcryptSpy: jest.SpyInstance;
    let guardAllows: boolean;
    let currentAuthId: string;
    let currentStoreId: string | null;

    const VALID_DTO = {
        login_id: 'manager0001',
        name: '김철수',
        gender: 'M',
        birth: '1995-05-05',
        nickname: '철수매니저',
    };

    const buildModule = async () => {
        guardAllows = true;
        currentAuthId = 'HEAD_MANAGER';
        currentStoreId = MY_STORE_ID;
        storeRepository = {
            findStore: jest.fn().mockResolvedValue(buildStore()),
            insertStaff: jest.fn().mockResolvedValue(undefined),
            insertStaffSetting: jest.fn().mockResolvedValue(undefined),
        };
        getBcryptSpy = jest.spyOn(bcryptUtil, 'getBcrypt').mockResolvedValue(MOCK_HASH);

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
    afterEach(async () => { getBcryptSpy.mockRestore(); await app.close(); });

    const post = (body: any = VALID_DTO) => request(app.getHttpServer()).post('/api/v1/store/manager/register').send(body);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] managerRegister — 정상 생성', () => {
        it('200 + auth_id=MANAGER, store_id 는 요청자의 것', async () => {
            const res = await post().expect(200);

            expect(res.body.user_id).toMatch(/^[a-f0-9]{32}$/);
            expect(res.body.login_id).toBe(VALID_DTO.login_id);
            expect(res.body.temporary_password).toMatch(/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/);

            expect(storeRepository.findStore).toHaveBeenCalledWith({store_id: MY_STORE_ID, is_delete: 0});

            const [userEntity] = storeRepository.insertStaff.mock.calls[0];
            expect(userEntity).toBeInstanceOf(UserEntity);
            expect(userEntity.auth_id).toBe('MANAGER');
            expect(userEntity.state_id).toBe('ACTIVE');
            expect(userEntity.store_id).toBe(MY_STORE_ID);
            expect(userEntity.login_pw).toBe(MOCK_HASH);
            expect(userEntity.is_password_change_required).toBe(1);
        });

        it('t_user_setting 을 동반 생성한다', async () => {
            const res = await post().expect(200);

            expect(storeRepository.insertStaffSetting).toHaveBeenCalledTimes(1);
            const [settingEntity] = storeRepository.insertStaffSetting.mock.calls[0];
            expect(settingEntity).toBeInstanceOf(UserSettingEntity);
            expect(settingEntity.user_id).toBe(res.body.user_id);
        });

        it('body 에 store_id 를 끼워보내도 무시하고 요청자 store_id 를 쓴다 (권한 우회 방지)', async () => {
            await post({...VALID_DTO, store_id: OTHER_STORE_ID}).expect(200);

            expect(storeRepository.findStore).toHaveBeenCalledWith({store_id: MY_STORE_ID, is_delete: 0});
            const [userEntity] = storeRepository.insertStaff.mock.calls[0];
            expect(userEntity.store_id).toBe(MY_STORE_ID);
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        it('login_id 형식 오류 → 400, findStore 미호출', async () => {
            const res = await post({...VALID_DTO, login_id: 'ab'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('login_id');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('name 미전송 → 400, insertStaff 미호출', async () => {
            const {name: _n, ...body} = VALID_DTO;

            const res = await post(body).expect(400);

            expect(res.body.validationErrors[0].property).toBe('name');
            expect(storeRepository.insertStaff).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service]
    // ─────────────────────────────────────────
    describe('[FAIL:service]', () => {
        it('요청자 store_id 가 없음 → 400, findStore 미호출', async () => {
            currentStoreId = null;

            const res = await post().expect(400);

            expect(res.body.message).toBe('소속된 가맹점이 없습니다.');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('가맹점이 폐점됨 → 404, insertStaff 미호출', async () => {
            storeRepository.findStore.mockResolvedValueOnce(null);

            const res = await post().expect(404);

            expect(res.body.message).toBe('가맹점을 찾을 수 없습니다.');
            expect(storeRepository.insertStaff).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:auth] — HEAD_MANAGER 만 통과
    // ─────────────────────────────────────────
    describe('[FAIL:auth]', () => {
        it.each(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'USER'])('%s 권한 → 403, findStore 미호출', async (auth_id) => {
            currentAuthId = auth_id;

            const res = await post().expect(403);
            expect(res.body.message).toBe('접근 권한이 없습니다.');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('미인증 → 401, findStore 미호출', async () => {
            guardAllows = false;

            await post().expect(401);
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository]', () => {
        it('insertStaff throw → 500, insertStaffSetting 미호출', async () => {
            storeRepository.insertStaff.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await post().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(storeRepository.insertStaffSetting).not.toHaveBeenCalled();
        });
    });
});
