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

describe('UserService - tokenRefresh', () => {
    let app: INestApplication;
    let userRepository: {
        findUser: jest.Mock;
        findSessionRefresh: jest.Mock;
        updateSessionRefresh: jest.Mock;
        insertSessionRefresh: jest.Mock;
    };
    let jwtServiceMock: {sign: jest.Mock; verify: jest.Mock};
    let sha256HexSpy: jest.SpyInstance;
    let encryptAesGcmSpy: jest.SpyInstance;
    let extractJwtExpiresAtSpy: jest.SpyInstance;

    const FIXED_TIME = new Date(2026, 5, 1, 10, 0, 0);
    const ACCESS_EXP = new Date(2026, 5, 1, 10, 20, 0);
    const REFRESH_EXP = new Date(2027, 5, 1, 10, 0, 0);
    const SHRINK_EXP = new Date(2026, 5, 1, 10, 1, 0); // FIXED_TIME + 1m

    const OLD_REFRESH = 'old.refresh.token';
    const NEW_ACCESS = 'new.access.token';
    const NEW_REFRESH = 'new.refresh.token';
    const OLD_HASH = 'old-hash-64chars'.padEnd(64, 'x');
    const NEW_HASH = 'new-hash-64chars'.padEnd(64, 'x');
    const NEW_ENCRYPTED = 'new-encrypted';

    const PAYLOAD = {type: 'refresh', user_id: 'user-id-32chars-fillerxxxxxxxxxx', session_id: 'session-id-32chars-fillerxxxxxxx'};

    const buildModule = async () => {
        userRepository = {
            findUser: jest.fn(),
            findSessionRefresh: jest.fn(),
            updateSessionRefresh: jest.fn(),
            insertSessionRefresh: jest.fn(),
        };
        jwtServiceMock = {sign: jest.fn(), verify: jest.fn()};

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

    const buildActiveUser = (): UserEntity => {
        const u = new UserEntity();
        u.user_id = PAYLOAD.user_id;
        u.state_id = 'ACTIVE';
        return u;
    };

    const buildOldRefresh = (end_at: Date): SessionRefreshEntity => {
        const e = new SessionRefreshEntity();
        e.session_id = PAYLOAD.session_id;
        e.refresh_hash = OLD_HASH;
        e.end_at = end_at;
        return e;
    };

    beforeEach(async () => {
        jest.useFakeTimers();
        jest.setSystemTime(FIXED_TIME);

        sha256HexSpy = jest.spyOn(hashUtil, 'sha256Hex').mockImplementation((token) => {
            if (token === OLD_REFRESH) return OLD_HASH;
            if (token === NEW_REFRESH) return NEW_HASH;
            return 'unknown-hash';
        });
        encryptAesGcmSpy = jest.spyOn(cipherUtil, 'encryptAesGcm').mockReturnValue(NEW_ENCRYPTED);
        extractJwtExpiresAtSpy = jest.spyOn(jwtUtil, 'extractJwtExpiresAt').mockImplementation((token) => {
            if (token === NEW_ACCESS) return ACCESS_EXP;
            if (token === NEW_REFRESH) return REFRESH_EXP;
            return new Date(0);
        });

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
    describe('[SUCCESS] tokenRefresh — 정상 재발급', () => {
        it('verify → findSessionRefresh → findUser ACTIVE → update(end_at 1m) → 토큰 발급 → insert(chain), 200 4필드', async () => {
            jwtServiceMock.verify.mockReturnValueOnce(PAYLOAD);
            userRepository.findSessionRefresh.mockResolvedValueOnce(buildOldRefresh(REFRESH_EXP));
            userRepository.findUser.mockResolvedValueOnce(buildActiveUser());
            userRepository.updateSessionRefresh.mockResolvedValueOnce(undefined);
            jwtServiceMock.sign
                .mockReturnValueOnce(NEW_ACCESS)
                .mockReturnValueOnce(NEW_REFRESH);
            userRepository.insertSessionRefresh.mockResolvedValueOnce(undefined);

            const res = await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(200);

            // 응답
            expect(res.body.access_token).toBe(NEW_ACCESS);
            expect(res.body.refresh_token).toBe(NEW_REFRESH);
            expect(res.body.access_token_expires_at).toBe(ACCESS_EXP.toISOString());
            expect(res.body.refresh_token_expires_at).toBe(REFRESH_EXP.toISOString());

            // verify
            expect(jwtServiceMock.verify).toHaveBeenCalledTimes(1);
            expect(jwtServiceMock.verify).toHaveBeenCalledWith(OLD_REFRESH);

            // findSessionRefresh
            expect(userRepository.findSessionRefresh).toHaveBeenCalledTimes(1);
            expect(userRepository.findSessionRefresh).toHaveBeenCalledWith({refresh_hash: OLD_HASH});

            // findUser
            expect(userRepository.findUser).toHaveBeenCalledTimes(1);
            expect(userRepository.findUser).toHaveBeenCalledWith({user_id: PAYLOAD.user_id});

            // updateSessionRefresh — end_at = FIXED + 1m
            expect(userRepository.updateSessionRefresh).toHaveBeenCalledTimes(1);
            const [updWhere, updEntity] = userRepository.updateSessionRefresh.mock.calls[0];
            expect(updWhere).toEqual({refresh_hash: OLD_HASH});
            expect(updEntity).toBeInstanceOf(SessionRefreshEntity);
            expect(updEntity.end_at).toEqual(SHRINK_EXP);

            // sign 2회
            expect(jwtServiceMock.sign).toHaveBeenCalledTimes(2);
            expect(jwtServiceMock.sign).toHaveBeenNthCalledWith(1, {type: 'access', user_id: PAYLOAD.user_id, session_id: PAYLOAD.session_id}, {expiresIn: '20m'});
            expect(jwtServiceMock.sign).toHaveBeenNthCalledWith(2, {type: 'refresh', user_id: PAYLOAD.user_id, session_id: PAYLOAD.session_id}, {expiresIn: '365d'});

            // insertSessionRefresh — chain
            expect(userRepository.insertSessionRefresh).toHaveBeenCalledTimes(1);
            const [newEntity] = userRepository.insertSessionRefresh.mock.calls[0];
            expect(newEntity).toBeInstanceOf(SessionRefreshEntity);
            expect(newEntity.session_id).toBe(PAYLOAD.session_id);
            expect(newEntity.refresh_hash).toBe(NEW_HASH);
            expect(newEntity.refresh_encrypted).toBe(NEW_ENCRYPTED);
            expect(newEntity.before_refresh_hash).toBe(OLD_HASH);
            expect(newEntity.end_at).toEqual(REFRESH_EXP);
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation] refreshToken 누락', () => {
        it('400, validationErrors, 후속 호출 없음', async () => {
            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({})
                .expect(400)
                .expect((res) => {
                    expect(res.body.validationErrors.length).toBeGreaterThan(0);
                });

            expect(jwtServiceMock.verify).not.toHaveBeenCalled();
            expect(userRepository.findSessionRefresh).not.toHaveBeenCalled();
            expect(userRepository.findUser).not.toHaveBeenCalled();
            expect(userRepository.updateSessionRefresh).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service]
    // ─────────────────────────────────────────
    describe('[FAIL:service] jwt.verify throw', () => {
        it('401 INVALID_REFRESH_TOKEN, findSessionRefresh 미호출', async () => {
            jwtServiceMock.verify.mockImplementationOnce(() => {
                throw new Error('invalid');
            });

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: 'bad-token'})
                .expect(401)
                .expect((res) => {
                    expect(res.body.message).toBe(userKo.token_refresh.invalid_refresh_token);
                });

            expect(userRepository.findSessionRefresh).not.toHaveBeenCalled();
            expect(userRepository.findUser).not.toHaveBeenCalled();
            expect(userRepository.updateSessionRefresh).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service] payload.type !== refresh', () => {
        it('401, findSessionRefresh 미호출', async () => {
            jwtServiceMock.verify.mockReturnValueOnce({...PAYLOAD, type: 'access'});

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(401)
                .expect((res) => {
                    expect(res.body.message).toBe(userKo.token_refresh.invalid_refresh_token);
                });

            expect(userRepository.findSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service] findSessionRefresh null', () => {
        it('401, findUser 미호출', async () => {
            jwtServiceMock.verify.mockReturnValueOnce(PAYLOAD);
            userRepository.findSessionRefresh.mockResolvedValueOnce(null);

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(401);

            expect(userRepository.findSessionRefresh).toHaveBeenCalledTimes(1);
            expect(userRepository.findUser).not.toHaveBeenCalled();
            expect(userRepository.updateSessionRefresh).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service] DB end_at 만료', () => {
        it('401, findUser 미호출', async () => {
            jwtServiceMock.verify.mockReturnValueOnce(PAYLOAD);
            const past = new Date(FIXED_TIME.getTime() - 1000);
            userRepository.findSessionRefresh.mockResolvedValueOnce(buildOldRefresh(past));

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(401);

            expect(userRepository.findSessionRefresh).toHaveBeenCalledTimes(1);
            expect(userRepository.findUser).not.toHaveBeenCalled();
            expect(userRepository.updateSessionRefresh).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service] findUser null — 안전망으로 update 1회', () => {
        it('401 UNAUTHORIZED_USER, updateSessionRefresh 1회(end_at 1m), insertSessionRefresh 미호출', async () => {
            jwtServiceMock.verify.mockReturnValueOnce(PAYLOAD);
            userRepository.findSessionRefresh.mockResolvedValueOnce(buildOldRefresh(REFRESH_EXP));
            userRepository.findUser.mockResolvedValueOnce(null);
            userRepository.updateSessionRefresh.mockResolvedValueOnce(undefined);

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(401)
                .expect((res) => {
                    expect(res.body.message).toBe(userKo.token_refresh.unauthorized_user);
                });

            expect(userRepository.updateSessionRefresh).toHaveBeenCalledTimes(1);
            const [w, e] = userRepository.updateSessionRefresh.mock.calls[0];
            expect(w).toEqual({refresh_hash: OLD_HASH});
            expect(e.end_at).toEqual(SHRINK_EXP);
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service] user.state_id BLOCK — 안전망 update', () => {
        it('401, updateSessionRefresh 1회, insertSessionRefresh 미호출', async () => {
            jwtServiceMock.verify.mockReturnValueOnce(PAYLOAD);
            userRepository.findSessionRefresh.mockResolvedValueOnce(buildOldRefresh(REFRESH_EXP));
            const blocked = buildActiveUser();
            blocked.state_id = 'BLOCK';
            userRepository.findUser.mockResolvedValueOnce(blocked);
            userRepository.updateSessionRefresh.mockResolvedValueOnce(undefined);

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(401)
                .expect((res) => {
                    expect(res.body.message).toBe(userKo.token_refresh.unauthorized_user);
                });

            expect(userRepository.updateSessionRefresh).toHaveBeenCalledTimes(1);
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository] findSessionRefresh throw', () => {
        it('500, 후속 호출 없음', async () => {
            jwtServiceMock.verify.mockReturnValueOnce(PAYLOAD);
            userRepository.findSessionRefresh.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(500);

            expect(userRepository.findUser).not.toHaveBeenCalled();
            expect(userRepository.updateSessionRefresh).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository] findUser throw', () => {
        it('500, updateSessionRefresh 미호출', async () => {
            jwtServiceMock.verify.mockReturnValueOnce(PAYLOAD);
            userRepository.findSessionRefresh.mockResolvedValueOnce(buildOldRefresh(REFRESH_EXP));
            userRepository.findUser.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(500);

            expect(userRepository.updateSessionRefresh).not.toHaveBeenCalled();
            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository] updateSessionRefresh throw', () => {
        it('500, insertSessionRefresh 미호출', async () => {
            jwtServiceMock.verify.mockReturnValueOnce(PAYLOAD);
            userRepository.findSessionRefresh.mockResolvedValueOnce(buildOldRefresh(REFRESH_EXP));
            userRepository.findUser.mockResolvedValueOnce(buildActiveUser());
            userRepository.updateSessionRefresh.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(500);

            expect(userRepository.insertSessionRefresh).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository] insertSessionRefresh throw', () => {
        it('500, 흐름 끝까지 진행 후 insert 에서 throw', async () => {
            jwtServiceMock.verify.mockReturnValueOnce(PAYLOAD);
            userRepository.findSessionRefresh.mockResolvedValueOnce(buildOldRefresh(REFRESH_EXP));
            userRepository.findUser.mockResolvedValueOnce(buildActiveUser());
            userRepository.updateSessionRefresh.mockResolvedValueOnce(undefined);
            jwtServiceMock.sign
                .mockReturnValueOnce(NEW_ACCESS)
                .mockReturnValueOnce(NEW_REFRESH);
            userRepository.insertSessionRefresh.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            await request(app.getHttpServer())
                .post('/api/v1/user/token-refresh')
                .send({refresh_token: OLD_REFRESH})
                .expect(500);

            expect(userRepository.updateSessionRefresh).toHaveBeenCalledTimes(1);
            expect(userRepository.insertSessionRefresh).toHaveBeenCalledTimes(1);
        });
    });
});
