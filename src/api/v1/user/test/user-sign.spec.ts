jest.mock('typeorm-transactional', () => ({
    Transactional: () => (_target: any, _key: string, descriptor: PropertyDescriptor) => descriptor,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';
import { USER_REPOSITORY } from '../user.symbols';
import { UserEntity } from '../entities/user.entity';
import { UserSettingEntity } from '../entities/user-setting.entity';
import { SessionEntity } from '../entities/session.entity';
import { SessionRefreshEntity } from '../entities/session-refresh.entity';
import * as userUtil from '../user.util';
import * as bcryptUtil from '@root/common/utils/bcrypt';
import * as hashUtil from '@root/common/utils/hash';
import * as cipherUtil from '@root/common/utils/cipher';
import * as jwtUtil from '@root/common/utils/jwt';
import { I18nModule } from 'nestjs-i18n';
import { buildI18nOptions } from '@root/common/i18n/i18n.config';
import { loadKoPack } from '@root/common/i18n/test-utils/load-ko-pack';
const userKo = loadKoPack('user');
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';

describe('UserService - sign (SNS 회원가입)', () => {
    let app: INestApplication;
    let userRepository: {
        insertUser: jest.Mock;
        insertUserSetting: jest.Mock;
        insertSession: jest.Mock;
        insertSessionRefresh: jest.Mock;
    };
    let jwtServiceMock: {sign: jest.Mock};
    let isAdultSpy: jest.SpyInstance;
    let generateSnsLoginIdSpy: jest.SpyInstance;
    let getBcryptSpy: jest.SpyInstance;
    let sha256HexSpy: jest.SpyInstance;
    let encryptAesGcmSpy: jest.SpyInstance;
    let extractJwtExpiresAtSpy: jest.SpyInstance;

    const FIXED_TIME = new Date(2026, 0, 1); // 2026-01-01
    const ADULT_BIRTH = '2000-01-01';        // 26세 — 성인
    const MINOR_BIRTH = '2010-01-01';        // 16세 — 미성년

    const MOCK_LOGIN_ID = 'KAKAO_20260101000000000';
    const MOCK_LOGIN_PW = '$2b$13$mockhashvalue';
    const MOCK_ACCESS_TOKEN = 'mock.access.token';
    const MOCK_REFRESH_TOKEN = 'mock.refresh.token';
    const MOCK_ACCESS_EXPIRES_AT = new Date(2026, 0, 1, 0, 20, 0);
    const MOCK_REFRESH_EXPIRES_AT = new Date(2027, 0, 1);
    const MOCK_REFRESH_HASH = 'a'.repeat(64);
    const MOCK_REFRESH_ENCRYPTED = 'iv_hex:tag_hex:cipher_hex';

    const VALID_DTO = {
        sns_id: 'KAKAO',
        sns_user_id: 'kakao_user_123',
        gender: 'M',
        birth: ADULT_BIRTH,
        nickname: '길동이',
        device_os: 'iOS',
        device_token: 'some-device-token',
    };

    const buildModule = async () => {
        userRepository = {
            insertUser: jest.fn(),
            insertUserSetting: jest.fn(),
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
                {provide: JwtService, useValue: jwtServiceMock},
            ],
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

    beforeEach(async () => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_TIME);

        isAdultSpy = jest.spyOn(userUtil, 'isAdult').mockReturnValue(true);
        generateSnsLoginIdSpy = jest.spyOn(userUtil, 'generateSnsLoginId').mockReturnValue(MOCK_LOGIN_ID);
        getBcryptSpy = jest.spyOn(bcryptUtil, 'getBcrypt').mockResolvedValue(MOCK_LOGIN_PW);
        sha256HexSpy = jest.spyOn(hashUtil, 'sha256Hex').mockReturnValue(MOCK_REFRESH_HASH);
        encryptAesGcmSpy = jest.spyOn(cipherUtil, 'encryptAesGcm').mockReturnValue(MOCK_REFRESH_ENCRYPTED);
        extractJwtExpiresAtSpy = jest.spyOn(jwtUtil, 'extractJwtExpiresAt').mockImplementation((token) => {
            if (token === MOCK_ACCESS_TOKEN) return MOCK_ACCESS_EXPIRES_AT;
            if (token === MOCK_REFRESH_TOKEN) return MOCK_REFRESH_EXPIRES_AT;
            return new Date(0);
        });

        await buildModule();
    });

    afterEach(async () => {
        jest.useRealTimers();
        isAdultSpy.mockRestore();
        generateSnsLoginIdSpy.mockRestore();
        getBcryptSpy.mockRestore();
        sha256HexSpy.mockRestore();
        encryptAesGcmSpy.mockRestore();
        extractJwtExpiresAtSpy.mockRestore();
        await app.close();
    });

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] sign — 정상 가입 후 accessToken + refreshToken 반환', () => {
        it('모든 repository 호출 인자·순서 검증, 200 응답 + 토큰 반환', async () => {
            userRepository.insertUser.mockResolvedValueOnce(undefined);
            userRepository.insertUserSetting.mockResolvedValueOnce(undefined);
            userRepository.insertSession.mockResolvedValueOnce(undefined);
            userRepository.insertSessionRefresh.mockResolvedValueOnce(undefined);
            jwtServiceMock.sign
                .mockReturnValueOnce(MOCK_ACCESS_TOKEN)
                .mockReturnValueOnce(MOCK_REFRESH_TOKEN);

            const res = await request(app.getHttpServer())
                .post('/api/v1/user/sign')
                .send(VALID_DTO)
                .expect(200);

            // 응답
            expect(res.body.access_token).toBe(MOCK_ACCESS_TOKEN);
            expect(res.body.refresh_token).toBe(MOCK_REFRESH_TOKEN);
            expect(res.body.access_token_expires_at).toBe(MOCK_ACCESS_EXPIRES_AT.toISOString());
            expect(res.body.refresh_token_expires_at).toBe(MOCK_REFRESH_EXPIRES_AT.toISOString());

            // isAdult 호출 검증
            expect(isAdultSpy).toHaveBeenCalledTimes(1);
            expect(isAdultSpy).toHaveBeenCalledWith(VALID_DTO.birth);

            // generateSnsLoginId · getBcrypt 검증
            expect(generateSnsLoginIdSpy).toHaveBeenCalledTimes(1);
            expect(generateSnsLoginIdSpy).toHaveBeenCalledWith(VALID_DTO.sns_id);
            expect(getBcryptSpy).toHaveBeenCalledTimes(1);
            expect(getBcryptSpy).toHaveBeenCalledWith(MOCK_LOGIN_ID);

            // insertUser 호출 검증 — entity 컬럼 값
            expect(userRepository.insertUser).toHaveBeenCalledTimes(1);
            const [userEntity] = userRepository.insertUser.mock.calls[0];
            expect(userEntity).toBeInstanceOf(UserEntity);
            expect(userEntity.user_id).toMatch(/^[a-f0-9]{32}$/);
            expect(userEntity.user_search_code).toMatch(/^[a-f0-9]{32}$/);
            expect(userEntity.auth_id).toBe('USER');
            expect(userEntity.state_id).toBe('ACTIVE');
            expect(userEntity.sns_id).toBe(VALID_DTO.sns_id);
            expect(userEntity.sns_user_id).toBe(VALID_DTO.sns_user_id);
            expect(userEntity.login_id).toBe(MOCK_LOGIN_ID);
            expect(userEntity.login_pw).toBe(MOCK_LOGIN_PW);
            expect(userEntity.name).toBe(VALID_DTO.nickname);
            expect(userEntity.gender).toBe(VALID_DTO.gender);
            expect(userEntity.birth).toBe(VALID_DTO.birth);
            expect(userEntity.phone).toBeNull();
            expect(userEntity.nickname).toBe(VALID_DTO.nickname);
            expect(userEntity.device_os).toBe(VALID_DTO.device_os);
            expect(userEntity.device_token).toBe(VALID_DTO.device_token);

            const capturedUserId = userEntity.user_id;

            // insertUserSetting 호출 검증 (bio 만)
            expect(userRepository.insertUserSetting).toHaveBeenCalledTimes(1);
            const [settingEntity] = userRepository.insertUserSetting.mock.calls[0];
            expect(settingEntity).toBeInstanceOf(UserSettingEntity);
            expect(settingEntity.user_setting_id).toMatch(/^[a-f0-9]{32}$/);
            expect(settingEntity.user_id).toBe(capturedUserId);
            expect(settingEntity.bio).toBeNull();

            // insertSession 호출 검증
            expect(userRepository.insertSession).toHaveBeenCalledTimes(1);
            const [sessionEntity] = userRepository.insertSession.mock.calls[0];
            expect(sessionEntity).toBeInstanceOf(SessionEntity);
            expect(sessionEntity.session_id).toMatch(/^[a-f0-9]{32}$/);
            expect(sessionEntity.user_id).toBe(capturedUserId);
            expect(sessionEntity.device_os).toBe(VALID_DTO.device_os);
            expect(sessionEntity.device_token).toBe(VALID_DTO.device_token);
            expect(sessionEntity.is_delete).toBe(0);

            const capturedSessionId = sessionEntity.session_id;

            // jwtService.sign 호출 검증 (accessToken → refreshToken 순)
            expect(jwtServiceMock.sign).toHaveBeenCalledTimes(2);
            expect(jwtServiceMock.sign).toHaveBeenNthCalledWith(
                1,
                {type: 'access', user_id: capturedUserId, session_id: capturedSessionId},
                {expiresIn: '20m'},
            );
            expect(jwtServiceMock.sign).toHaveBeenNthCalledWith(
                2,
                {type: 'refresh', user_id: capturedUserId, session_id: capturedSessionId},
                {expiresIn: '365d'},
            );

            // sha256Hex · encryptAesGcm · extractJwtExpiresAt 검증
            expect(sha256HexSpy).toHaveBeenCalledTimes(1);
            expect(sha256HexSpy).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN);
            expect(encryptAesGcmSpy).toHaveBeenCalledTimes(1);
            expect(encryptAesGcmSpy).toHaveBeenCalledWith(MOCK_REFRESH_TOKEN);
            expect(extractJwtExpiresAtSpy).toHaveBeenCalledTimes(2);
            expect(extractJwtExpiresAtSpy).toHaveBeenNthCalledWith(1, MOCK_ACCESS_TOKEN);
            expect(extractJwtExpiresAtSpy).toHaveBeenNthCalledWith(2, MOCK_REFRESH_TOKEN);

            // insertSessionRefresh 호출 검증
            expect(userRepository.insertSessionRefresh).toHaveBeenCalledTimes(1);
            const [refreshEntity] = userRepository.insertSessionRefresh.mock.calls[0];
            expect(refreshEntity).toBeInstanceOf(SessionRefreshEntity);
            expect(refreshEntity.session_id).toBe(capturedSessionId);
            expect(refreshEntity.refresh_hash).toBe(MOCK_REFRESH_HASH);
            expect(refreshEntity.refresh_encrypted).toBe(MOCK_REFRESH_ENCRYPTED);
            expect(refreshEntity.before_refresh_hash).toBeNull();
            expect(refreshEntity.end_at).toBe(MOCK_REFRESH_EXPIRES_AT);
        });
    });

    describe('[SUCCESS] device 미전송 시 device_os/device_token null 저장', () => {
        it('device_os/device_token 없이 요청 → userEntity.device_* = null', async () => {
            userRepository.insertUser.mockResolvedValueOnce(undefined);
            userRepository.insertUserSetting.mockResolvedValueOnce(undefined);
            userRepository.insertSession.mockResolvedValueOnce(undefined);
            userRepository.insertSessionRefresh.mockResolvedValueOnce(undefined);
            jwtServiceMock.sign.mockReturnValueOnce(MOCK_ACCESS_TOKEN).mockReturnValueOnce(MOCK_REFRESH_TOKEN);

            const {device_os: _o, device_token: _t, ...dtoWithoutDevice} = VALID_DTO;

            await request(app.getHttpServer())
                .post('/api/v1/user/sign')
                .send(dtoWithoutDevice)
                .expect(200);

            const [userEntity] = userRepository.insertUser.mock.calls[0];
            expect(userEntity.device_os).toBeNull();
            expect(userEntity.device_token).toBeNull();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    const expectNoWrites = () => {
        expect(userRepository.insertUser).not.toHaveBeenCalled();
        expect(userRepository.insertUserSetting).not.toHaveBeenCalled();
        expect(userRepository.insertSession).not.toHaveBeenCalled();
        expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
    };

    describe('[FAIL:validation]', () => {
        it('sns_id 미전송 → 400, property=sns_id, 모든 write 미호출', async () => {
            const {sns_id: _, ...body} = VALID_DTO;
            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send(body).expect(400);
            expect(res.body.validationErrors[0].property).toBe('sns_id');
            expect(isAdultSpy).not.toHaveBeenCalled();
            expectNoWrites();
        });

        it('sns_id 허용값 외("NAVER") → 400, property=sns_id, 모든 write 미호출', async () => {
            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send({...VALID_DTO, sns_id: 'NAVER'}).expect(400);
            expect(res.body.validationErrors[0].property).toBe('sns_id');
            expectNoWrites();
        });

        it('sns_user_id 미전송 → 400, property=sns_user_id, 모든 write 미호출', async () => {
            const {sns_user_id: _, ...body} = VALID_DTO;
            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send(body).expect(400);
            expect(res.body.validationErrors[0].property).toBe('sns_user_id');
            expectNoWrites();
        });

        it('gender 허용값 외 → 400, property=gender, 모든 write 미호출', async () => {
            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send({...VALID_DTO, gender: 'X'}).expect(400);
            expect(res.body.validationErrors[0].property).toBe('gender');
            expectNoWrites();
        });

        it('birth 형식 오류("20260101") → 400, 모든 write 미호출', async () => {
            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send({...VALID_DTO, birth: '20260101'}).expect(400);
            expect(res.body.validationErrors.length).toBeGreaterThan(0);
            expectNoWrites();
        });

        it('nickname 13자 초과 → 400, property=nickname, 모든 write 미호출', async () => {
            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send({...VALID_DTO, nickname: 'a'.repeat(13)}).expect(400);
            expect(res.body.validationErrors[0].property).toBe('nickname');
            expectNoWrites();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service] — 만 18세 이하
    // ─────────────────────────────────────────
    describe('[FAIL:service] 만 18세 이하', () => {
        it('isAdult false → 400 age_restriction, property=birth, 이후 write 미호출', async () => {
            isAdultSpy.mockReturnValue(false);

            const res = await request(app.getHttpServer())
                .post('/api/v1/user/sign')
                .send({...VALID_DTO, birth: MINOR_BIRTH})
                .expect(400);

            expect(res.body.message).toBe(userKo.sign.age_restriction);
            expect(res.body.validationErrors[0].property).toBe('birth');
            expect(isAdultSpy).toHaveBeenCalledTimes(1);
            expect(isAdultSpy).toHaveBeenCalledWith(MINOR_BIRTH);
            expect(getBcryptSpy).not.toHaveBeenCalled();
            expectNoWrites();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:duplicate] — UK_User_SnsSnsUserId
    // ─────────────────────────────────────────
    describe('[FAIL:duplicate] insertUser — UK_User_SnsSnsUserId 중복', () => {
        it('insertUser → BadRequest 이미 가입된 SNS, 이후 write 미호출', async () => {
            userRepository.insertUser.mockRejectedValueOnce(new BadRequestException({message: '이미 가입된 SNS 계정입니다.'}));

            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send(VALID_DTO).expect(400);
            expect(res.body.message).toBe('이미 가입된 SNS 계정입니다.');

            expect(userRepository.insertUser).toHaveBeenCalledTimes(1);
            const [userEntity] = userRepository.insertUser.mock.calls[0];
            expect(userEntity.sns_id).toBe(VALID_DTO.sns_id);
            expect(userEntity.sns_user_id).toBe(VALID_DTO.sns_user_id);
            expect(userRepository.insertUserSetting).not.toHaveBeenCalled();
            expect(userRepository.insertSession).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository] insertUser — InternalServerError', () => {
        it('insertUser → 500, 이후 write 미호출', async () => {
            userRepository.insertUser.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send(VALID_DTO).expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');

            expect(userRepository.insertUser).toHaveBeenCalledTimes(1);
            expect(userRepository.insertUserSetting).not.toHaveBeenCalled();
            expect(userRepository.insertSession).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository] insertUserSetting — FK_UserSetting_User', () => {
        it('insertUser 완료 후 insertUserSetting → 400, insertSession 미호출', async () => {
            userRepository.insertUser.mockResolvedValueOnce(undefined);
            userRepository.insertUserSetting.mockRejectedValueOnce(new BadRequestException({message: '존재하지 않는 회원입니다.'}));

            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send(VALID_DTO).expect(400);
            expect(res.body.message).toBe('존재하지 않는 회원입니다.');

            expect(userRepository.insertUser).toHaveBeenCalledTimes(1);
            expect(userRepository.insertUserSetting).toHaveBeenCalledTimes(1);
            const [settingEntity] = userRepository.insertUserSetting.mock.calls[0];
            const [userEntity] = userRepository.insertUser.mock.calls[0];
            expect(settingEntity.user_id).toBe(userEntity.user_id);
            expect(userRepository.insertSession).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository] insertSession — FK_Session_User', () => {
        it('insertUser·insertUserSetting 완료 후 insertSession → 400, insertSessionRefresh 미호출', async () => {
            userRepository.insertUser.mockResolvedValueOnce(undefined);
            userRepository.insertUserSetting.mockResolvedValueOnce(undefined);
            userRepository.insertSession.mockRejectedValueOnce(new BadRequestException({message: '존재하지 않는 회원입니다.'}));

            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send(VALID_DTO).expect(400);
            expect(res.body.message).toBe('존재하지 않는 회원입니다.');

            expect(userRepository.insertSession).toHaveBeenCalledTimes(1);
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });
});
