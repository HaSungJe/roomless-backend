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
const STORE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const MOCK_HASH = '$2b$13$mock-hashed-password';

/** 비밀번호 정규식 — 임시 비밀번호가 이걸 만족해야 발급 직후 로그인이 된다 */
const PASSWORD_RE = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/;

const buildStore = (): StoreEntity => {
    const store = new StoreEntity();
    store.store_id = STORE_ID;
    store.store_name = '로우호텔 강남점';
    store.is_delete = 0;
    return store;
};

describe('StoreService - headManagerRegister (총괄매니저 계정 생성)', () => {
    let app: INestApplication;
    let storeRepository: {findStore: jest.Mock; findStaff: jest.Mock; insertStaff: jest.Mock; insertStaffSetting: jest.Mock};
    let getBcryptSpy: jest.SpyInstance;
    let guardAllows: boolean;
    let currentAuthId: string;

    const VALID_DTO = {
        store_id: STORE_ID,
        login_id: 'head_manager1',
        name: '홍길동',
        gender: 'M',
        birth: '1990-01-01',
        nickname: '길동매니저',
    };

    const buildModule = async () => {
        guardAllows = true;
        currentAuthId = 'SUPER_ADMIN';
        storeRepository = {
            findStore: jest.fn().mockResolvedValue(buildStore()),
            findStaff: jest.fn().mockResolvedValue(null),
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
                    req.user = {user_id: USER, auth_id: currentAuthId, store_id: null};
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

    const post = (body: any = VALID_DTO) => request(app.getHttpServer()).post('/api/v1/store/head-manager/register').send(body);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] headManagerRegister — 정상 생성', () => {
        it('200 + 응답 3종, insertStaff entity 전 컬럼 검증', async () => {
            const res = await post().expect(200);

            // 응답
            expect(res.body.user_id).toMatch(/^[a-f0-9]{32}$/);
            expect(res.body.login_id).toBe(VALID_DTO.login_id);
            expect(res.body.temporary_password).toEqual(expect.any(String));

            // 대상 가맹점 확인 → 기존 총괄 확인 순서
            expect(storeRepository.findStore).toHaveBeenCalledWith({store_id: STORE_ID, is_delete: 0});
            expect(storeRepository.findStaff).toHaveBeenCalledTimes(1);

            // insertStaff entity
            expect(storeRepository.insertStaff).toHaveBeenCalledTimes(1);
            const [userEntity] = storeRepository.insertStaff.mock.calls[0];
            expect(userEntity).toBeInstanceOf(UserEntity);
            expect(userEntity.user_id).toBe(res.body.user_id);
            expect(userEntity.user_search_code).toMatch(/^[a-f0-9]{32}$/);
            expect(userEntity.auth_id).toBe('HEAD_MANAGER');
            expect(userEntity.state_id).toBe('ACTIVE');
            expect(userEntity.store_id).toBe(STORE_ID);
            expect(userEntity.login_id).toBe(VALID_DTO.login_id);
            expect(userEntity.name).toBe(VALID_DTO.name);
            expect(userEntity.gender).toBe(VALID_DTO.gender);
            expect(userEntity.birth).toBe(VALID_DTO.birth);
            expect(userEntity.nickname).toBe(VALID_DTO.nickname);
            expect(userEntity.is_password_change_required).toBe(1);
            expect(userEntity.sns_id).toBeNull();
            expect(userEntity.sns_user_id).toBeNull();
            expect(userEntity.phone).toBeNull();
            expect(userEntity.device_os).toBeNull();
            expect(userEntity.device_token).toBeNull();
        });

        it('비밀번호는 해시로 저장되고 평문은 응답에만 있다', async () => {
            const res = await post().expect(200);

            const [userEntity] = storeRepository.insertStaff.mock.calls[0];
            expect(userEntity.login_pw).toBe(MOCK_HASH);
            expect(userEntity.login_pw).not.toBe(res.body.temporary_password);
            expect(getBcryptSpy).toHaveBeenCalledTimes(1);
            expect(getBcryptSpy).toHaveBeenCalledWith(res.body.temporary_password);
        });

        it('t_user_setting 을 동반 생성한다 (없으면 로그인 불가)', async () => {
            const res = await post().expect(200);

            expect(storeRepository.insertStaffSetting).toHaveBeenCalledTimes(1);
            const [settingEntity] = storeRepository.insertStaffSetting.mock.calls[0];
            expect(settingEntity).toBeInstanceOf(UserSettingEntity);
            expect(settingEntity.user_setting_id).toMatch(/^[a-f0-9]{32}$/);
            expect(settingEntity.user_id).toBe(res.body.user_id);
            expect(settingEntity.bio).toBeNull();
        });

        it('임시 비밀번호가 비밀번호 정규식을 만족한다', async () => {
            const res = await post().expect(200);

            expect(res.body.temporary_password).toMatch(PASSWORD_RE);
        });

        it('ADMIN 권한도 허용', async () => {
            currentAuthId = 'ADMIN';

            await post().expect(200);
            expect(storeRepository.insertStaff).toHaveBeenCalledTimes(1);
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        it('store_id 형식 오류 → 400, findStore 미호출', async () => {
            const res = await post({...VALID_DTO, store_id: 'bad-id'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('store_id');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('login_id 3자 → 400, findStore 미호출', async () => {
            const res = await post({...VALID_DTO, login_id: 'abc'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('login_id');
            expect(res.body.message).toBe('아이디는 4~30자의 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.');
            expect(storeRepository.findStore).not.toHaveBeenCalled();
        });

        it('gender 허용값 밖 → 400', async () => {
            const res = await post({...VALID_DTO, gender: 'X'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('gender');
            expect(res.body.message).toBe('성별이 올바르지 않습니다.');
            expect(storeRepository.insertStaff).not.toHaveBeenCalled();
        });

        it('birth 형식 오류 → 400', async () => {
            const res = await post({...VALID_DTO, birth: '1990/01/01'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('birth');
            expect(storeRepository.insertStaff).not.toHaveBeenCalled();
        });

        it('nickname 특수문자 → 400', async () => {
            const res = await post({...VALID_DTO, nickname: '길동@매니저'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('nickname');
            expect(storeRepository.insertStaff).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service]
    // ─────────────────────────────────────────
    describe('[FAIL:service]', () => {
        it('가맹점 없음 → 404, findStaff·insertStaff 미호출', async () => {
            storeRepository.findStore.mockResolvedValueOnce(null);

            const res = await post().expect(404);

            expect(res.body.message).toBe('가맹점을 찾을 수 없습니다.');
            expect(storeRepository.findStaff).not.toHaveBeenCalled();
            expect(storeRepository.insertStaff).not.toHaveBeenCalled();
        });

        it('이미 총괄매니저 존재 → 400, insertStaff 미호출 (업체당 1명 고정)', async () => {
            const existing = new UserEntity();
            existing.user_id = 'existing-head-manager-xxxxxxxxxx';
            storeRepository.findStaff.mockResolvedValueOnce(existing);

            const res = await post().expect(400);

            expect(res.body.message).toBe('이미 총괄매니저가 지정된 가맹점입니다.');
            expect(storeRepository.insertStaff).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:duplicate]
    // ─────────────────────────────────────────
    describe('[FAIL:duplicate] login_id 중복', () => {
        it('insertStaff 가 400 → 그대로 전달, insertStaffSetting 미호출', async () => {
            storeRepository.insertStaff.mockRejectedValueOnce(
                new BadRequestException({message: '이미 존재하는 로그인 ID입니다.'}),
            );

            const res = await post().expect(400);

            expect(res.body.message).toBe('이미 존재하는 로그인 ID입니다.');
            expect(storeRepository.insertStaffSetting).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:auth]
    // ─────────────────────────────────────────
    describe('[FAIL:auth]', () => {
        it.each(['USER', 'MANAGER', 'HEAD_MANAGER'])('%s 권한 → 403, findStore 미호출', async (auth_id) => {
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
        it('insertStaffSetting throw → 500', async () => {
            storeRepository.insertStaffSetting.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await post().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
            expect(storeRepository.insertStaff).toHaveBeenCalledTimes(1);
        });
    });
});
