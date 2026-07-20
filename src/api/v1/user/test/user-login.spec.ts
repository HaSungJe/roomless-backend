jest.mock('typeorm-transactional', () => ({
    Transactional: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { FindOperator } from 'typeorm';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';
import { USER_REPOSITORY } from '../user.symbols';
import { UserEntity } from '../entities/user.entity';
import { SessionEntity } from '../entities/session.entity';
import { SessionRefreshEntity } from '../entities/session-refresh.entity';
import * as hashUtil from '@root/common/utils/hash';
import * as cipherUtil from '@root/common/utils/cipher';
import * as jwtUtil from '@root/common/utils/jwt';
import { I18nModule } from 'nestjs-i18n';
import { buildI18nOptions } from '@root/common/i18n/i18n.config';
import { loadKoPack } from '@root/common/i18n/test-utils/load-ko-pack';
const userKo = loadKoPack('user');
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';

describe('UserService - login', () => {
    let app: INestApplication;
    let userRepository: {
        findUser: jest.Mock;
        updateUser: jest.Mock;
        insertSession: jest.Mock;
        insertSessionRefresh: jest.Mock;
    };
    let jwtServiceMock: {sign: jest.Mock};
    let sha256HexSpy: jest.SpyInstance;
    let encryptAesGcmSpy: jest.SpyInstance;
    let extractJwtExpiresAtSpy: jest.SpyInstance;

    const FIXED_TIME = new Date(2026, 0, 1, 10, 0, 0);
    const ACCESS_EXP = new Date(2026, 0, 1, 10, 20, 0);   // +20m
    const REFRESH_EXP = new Date(2027, 0, 1, 10, 0, 0);   // +365d

    const buildModule = async () => {
        userRepository = {
            findUser: jest.fn(),
            updateUser: jest.fn(),
            insertSession: jest.fn(),
            insertSessionRefresh: jest.fn(),
        };
        jwtServiceMock = {sign: jest.fn()};

        const module: TestingModule = await Test.createTestingModule({
            imports: [I18nModule.forRoot(buildI18nOptions())],
            controllers: [UserController],
            providers: [
                UserService,
                {provide: USER_REPOSITORY, useValue: userRepository},
                {provide: JwtService, useValue: jwtServiceMock},            ],
        }).compile();

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
                        if (errorDto.type === 'isBoolean') {
                            errorDto.property = error.contexts?.[errorDto.type]?.target || '';
                            errorDto.message = error.constraints[errorDto.type];
                        } else {
                            errorDto.property = error.property;
                            errorDto.message = error.constraints[errorDto.type];
                        }
                        result.validationErrors.push(errorDto);
                    }
                    result.message = result.validationErrors.length > 0 ? result.validationErrors[0].message : '실패했습니다.';
                    return new BadRequestException(result);
                },
            }),
        );
        await app.init();
    };

    const buildUser = (state_id: string, block_comment: string | null = null): UserEntity => {
        const user = new UserEntity();
        user.user_id = 'user-id-32chars-fillerxxxxxxxxxx';
        user.sns_id = 'KAKAO';
        user.sns_user_id = 'kakao-sns-user-id';
        user.state_id = state_id;
        user.block_comment = block_comment;
        return user;
    };

    beforeEach(async () => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_TIME);

        sha256HexSpy = jest.spyOn(hashUtil, 'sha256Hex').mockReturnValue('mock-hash-64chars'.padEnd(64, 'x'));
        encryptAesGcmSpy = jest.spyOn(cipherUtil, 'encryptAesGcm').mockReturnValue('mock-encrypted');
        extractJwtExpiresAtSpy = jest.spyOn(jwtUtil, 'extractJwtExpiresAt')
            .mockReturnValueOnce(ACCESS_EXP)
            .mockReturnValueOnce(REFRESH_EXP);

        await buildModule();
    });

    afterEach(async () => {
        jest.useRealTimers();
        sha256HexSpy.mockRestore();
        encryptAesGcmSpy.mockRestore();
        extractJwtExpiresAtSpy.mockRestore();
        await app.close();
    });

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] login — ACTIVE 회원 정상 로그인', () => {
        it('findUser + insertSession + insertSessionRefresh + 토큰 발급, 200 응답에 토큰 4종', async () => {
            const user = buildUser('ACTIVE');
            userRepository.findUser.mockResolvedValueOnce(user);
            userRepository.updateUser.mockResolvedValueOnce(undefined);
            userRepository.insertSession.mockResolvedValueOnce(undefined);
            userRepository.insertSessionRefresh.mockResolvedValueOnce(undefined);
            jwtServiceMock.sign
                .mockReturnValueOnce('mock-access-token')
                .mockReturnValueOnce('mock-refresh-token');

            const res = await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'kakao-sns-user-id', device_os: 'iOS', device_token: 'token-abc'})
                .expect(200);

            // 응답 4종 검증
            expect(res.body.access_token).toBe('mock-access-token');
            expect(res.body.refresh_token).toBe('mock-refresh-token');
            expect(res.body.access_token_expires_at).toBe(ACCESS_EXP.toISOString());
            expect(res.body.refresh_token_expires_at).toBe(REFRESH_EXP.toISOString());

            // findUser 호출 인자 검증 — state_id 가 FindOperator(In)
            expect(userRepository.findUser).toHaveBeenCalledTimes(1);
            const findArg = userRepository.findUser.mock.calls[0][0];
            expect(findArg.sns_id).toBe('KAKAO');
            expect(findArg.sns_user_id).toBe('kakao-sns-user-id');
            expect(findArg.state_id).toBeInstanceOf(FindOperator);
            expect(findArg.state_id.type).toBe('in');
            expect(findArg.state_id.value).toEqual(['ACTIVE', 'BLOCK']);

            // jwt sign 2회 (access + refresh)
            expect(jwtServiceMock.sign).toHaveBeenCalledTimes(2);
            expect(jwtServiceMock.sign).toHaveBeenNthCalledWith(
                1,
                expect.objectContaining({type: 'access', user_id: user.user_id}),
                {expiresIn: '20m'},
            );
            expect(jwtServiceMock.sign).toHaveBeenNthCalledWith(
                2,
                expect.objectContaining({type: 'refresh', user_id: user.user_id}),
                {expiresIn: '365d'},
            );

            // t_user device 동기화 검증 — device 동봉 시 updateUser 1회(device_os/device_token)
            expect(userRepository.updateUser).toHaveBeenCalledTimes(1);
            const updateWhere = userRepository.updateUser.mock.calls[0][0];
            const updateEntity = userRepository.updateUser.mock.calls[0][1];
            expect(updateWhere).toEqual({user_id: user.user_id});
            expect(updateEntity).toBeInstanceOf(UserEntity);
            expect(updateEntity.device_os).toBe('iOS');
            expect(updateEntity.device_token).toBe('token-abc');

            // insertSession entity 검증
            expect(userRepository.insertSession).toHaveBeenCalledTimes(1);
            const sessionEntity = userRepository.insertSession.mock.calls[0][0];
            expect(sessionEntity).toBeInstanceOf(SessionEntity);
            expect(sessionEntity.user_id).toBe(user.user_id);
            expect(sessionEntity.device_os).toBe('iOS');
            expect(sessionEntity.device_token).toBe('token-abc');
            expect(sessionEntity.is_delete).toBe(0);
            expect(sessionEntity.session_id).toMatch(/^[a-f0-9]{32}$/);

            // insertSessionRefresh entity 검증
            expect(userRepository.insertSessionRefresh).toHaveBeenCalledTimes(1);
            const refreshEntity = userRepository.insertSessionRefresh.mock.calls[0][0];
            expect(refreshEntity).toBeInstanceOf(SessionRefreshEntity);
            expect(refreshEntity.session_id).toBe(sessionEntity.session_id);
            expect(refreshEntity.refresh_hash).toBeDefined();
            expect(refreshEntity.refresh_encrypted).toBe('mock-encrypted');
            expect(refreshEntity.before_refresh_hash).toBeNull();
            expect(refreshEntity.end_at).toEqual(REFRESH_EXP);
        });
    });

    describe('[SUCCESS] login — device 미동봉 로그인', () => {
        it('updateUser 미호출, t_user device 미변경, session device null, 200', async () => {
            const user = buildUser('ACTIVE');
            userRepository.findUser.mockResolvedValueOnce(user);
            userRepository.insertSession.mockResolvedValueOnce(undefined);
            userRepository.insertSessionRefresh.mockResolvedValueOnce(undefined);
            jwtServiceMock.sign
                .mockReturnValueOnce('mock-access-token')
                .mockReturnValueOnce('mock-refresh-token');

            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'kakao-sns-user-id'})
                .expect(200);

            // device 미동봉 → t_user 미갱신(기존값 유지)
            expect(userRepository.updateUser).not.toHaveBeenCalled();

            // session 은 device null 로 기존 동작 유지
            expect(userRepository.insertSession).toHaveBeenCalledTimes(1);
            const sessionEntity = userRepository.insertSession.mock.calls[0][0];
            expect(sessionEntity.device_os).toBeNull();
            expect(sessionEntity.device_token).toBeNull();

            expect(userRepository.insertSessionRefresh).toHaveBeenCalledTimes(1);
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation] sns_id / sns_user_id 누락', () => {
        it('400, validationErrors 포함, findUser 미호출', async () => {
            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({})
                .expect(400)
                .expect((res) => {
                    expect(res.body.validationErrors.length).toBeGreaterThan(0);
                });

            expect(userRepository.findUser).not.toHaveBeenCalled();
            expect(userRepository.insertSession).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] device_os 만 입력 — device_token 누락', () => {
        it('400, DEVICE_TOKEN_REQUIRED_WITH_OS 메시지', async () => {
            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'k', device_os: 'iOS'})
                .expect(400)
                .expect((res) => {
                    expect(res.body.validationErrors).toBeDefined();
                    const hasTokenError = res.body.validationErrors.some(
                        (e: any) => e.message === userKo.login.dto.device_token_required_with_os,
                    );
                    expect(hasTokenError).toBe(true);
                });

            expect(userRepository.findUser).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:validation] device_token 만 입력 — device_os 누락', () => {
        it('400, DEVICE_OS_REQUIRED_WITH_TOKEN 메시지', async () => {
            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'k', device_token: 'token-abc'})
                .expect(400)
                .expect((res) => {
                    expect(res.body.validationErrors).toBeDefined();
                    const hasOsError = res.body.validationErrors.some(
                        (e: any) => e.message === userKo.login.dto.device_os_required_with_token,
                    );
                    expect(hasOsError).toBe(true);
                });

            expect(userRepository.findUser).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service]
    // ─────────────────────────────────────────
    describe('[FAIL:service] 미가입 회원 — findUser null', () => {
        it('404, INVALID_LOGIN, 후속 호출 없음', async () => {
            userRepository.findUser.mockResolvedValueOnce(null);

            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'unknown'})
                .expect(404)
                .expect((res) => {
                    expect(res.body.message).toBe(userKo.login.invalid_login);
                    expect(res.body.validationErrors).toBeUndefined();
                });

            expect(userRepository.findUser).toHaveBeenCalledTimes(1);
            expect(userRepository.updateUser).not.toHaveBeenCalled();
            expect(userRepository.insertSession).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service] BLOCK 회원', () => {
        it('403, ACCOUNT_BLOCKED, body.block_comment 동봉, 후속 호출 없음', async () => {
            const blocked = buildUser('BLOCK', '욕설 사용으로 정지');
            userRepository.findUser.mockResolvedValueOnce(blocked);

            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'kakao-sns-user-id'})
                .expect(403)
                .expect((res) => {
                    expect(res.body.message).toBe(userKo.login.account_blocked);
                    expect(res.body.block_comment).toBe('욕설 사용으로 정지');
                    expect(res.body.validationErrors).toBeUndefined();
                });

            expect(userRepository.findUser).toHaveBeenCalledTimes(1);
            expect(userRepository.updateUser).not.toHaveBeenCalled();
            expect(userRepository.insertSession).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository] findUser throw', () => {
        it('500, 통일 메시지, 후속 호출 없음', async () => {
            userRepository.findUser.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'k'})
                .expect(500)
                .expect((res) => {
                    expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
                });

            expect(userRepository.findUser).toHaveBeenCalledTimes(1);
            expect(userRepository.insertSession).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository] updateUser throw — device 동봉 로그인', () => {
        it('500, findUser 1회 + updateUser 1회 후 throw, insertSession/insertSessionRefresh 미호출', async () => {
            userRepository.findUser.mockResolvedValueOnce(buildUser('ACTIVE'));
            userRepository.updateUser.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'k', device_os: 'iOS', device_token: 'token-abc'})
                .expect(500);

            expect(userRepository.findUser).toHaveBeenCalledTimes(1);
            expect(userRepository.updateUser).toHaveBeenCalledTimes(1);
            expect(userRepository.insertSession).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository] insertSession throw', () => {
        it('500, findUser 1회 + insertSession 1회 후 throw, insertSessionRefresh 미호출', async () => {
            userRepository.findUser.mockResolvedValueOnce(buildUser('ACTIVE'));
            jwtServiceMock.sign
                .mockReturnValueOnce('mock-access-token')
                .mockReturnValueOnce('mock-refresh-token');
            userRepository.insertSession.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'k'})
                .expect(500);

            expect(userRepository.findUser).toHaveBeenCalledTimes(1);
            expect(userRepository.insertSession).toHaveBeenCalledTimes(1);
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository] insertSessionRefresh throw', () => {
        it('500, findUser + insertSession 완료 후 insertSessionRefresh 에서 throw', async () => {
            userRepository.findUser.mockResolvedValueOnce(buildUser('ACTIVE'));
            jwtServiceMock.sign
                .mockReturnValueOnce('mock-access-token')
                .mockReturnValueOnce('mock-refresh-token');
            userRepository.insertSession.mockResolvedValueOnce(undefined);
            userRepository.insertSessionRefresh.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            await request(app.getHttpServer())
                .post('/api/v1/user/login')
                .send({sns_id: 'KAKAO', sns_user_id: 'k'})
                .expect(500);

            expect(userRepository.findUser).toHaveBeenCalledTimes(1);
            expect(userRepository.insertSession).toHaveBeenCalledTimes(1);
            expect(userRepository.insertSessionRefresh).toHaveBeenCalledTimes(1);
        });
    });
});
