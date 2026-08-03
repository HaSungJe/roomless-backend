jest.mock('typeorm-transactional', () => ({
    Transactional: () => () => undefined,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, InternalServerErrorException, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';
import { USER_REPOSITORY } from '../user.symbols';
import { UserEntity } from '../entities/user.entity';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';
import * as bcryptUtil from '@root/common/utils/bcrypt';

const USER = 'user-id-32chars-fillerxxxxxxxxxx';
const STORED_HASH = '$2b$13$stored-hash';
const NEW_HASH = '$2b$13$new-hash';

describe('UserService - changePassword (비밀번호 변경)', () => {
    let app: INestApplication;
    let userRepository: {findUser: jest.Mock; updateUser: jest.Mock};
    let matchBcryptSpy: jest.SpyInstance;
    let getBcryptSpy: jest.SpyInstance;
    let guardAllows: boolean;

    const VALID_DTO = {current_password: 'oldpass123', new_password: 'newpass456!'};

    const buildUser = (): UserEntity => {
        const user = new UserEntity();
        user.user_id = USER;
        user.login_pw = STORED_HASH;
        user.is_password_change_required = 1;
        return user;
    };

    const buildModule = async () => {
        guardAllows = true;
        userRepository = {
            findUser: jest.fn().mockResolvedValue(buildUser()),
            updateUser: jest.fn().mockResolvedValue(undefined),
        };
        // 기본: 현재 비밀번호 일치(1번째 호출) / 새 비밀번호는 기존과 다름(2번째 호출)
        matchBcryptSpy = jest.spyOn(bcryptUtil, 'matchBcrypt').mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        getBcryptSpy = jest.spyOn(bcryptUtil, 'getBcrypt').mockResolvedValue(NEW_HASH);

        const module: TestingModule = await Test.createTestingModule({
            controllers: [UserController],
            providers: [
                UserService,
                {provide: USER_REPOSITORY, useValue: userRepository},
                {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}},
            ],
        })
            .overrideGuard(PassportJwtAuthGuard)
            .useValue({
                canActivate: (ctx: ExecutionContext) => {
                    if (!guardAllows) throw new UnauthorizedException();
                    const req = ctx.switchToHttp().getRequest();
                    req.user = {user_id: USER};
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
    afterEach(async () => { matchBcryptSpy.mockRestore(); getBcryptSpy.mockRestore(); await app.close(); });

    const patch = (body: any = VALID_DTO) => request(app.getHttpServer()).patch('/api/v1/user/password').send(body);

    // ─────────────────────────────────────────
    // [SUCCESS]
    // ─────────────────────────────────────────
    describe('[SUCCESS] changePassword — 정상 변경', () => {
        it('204 + login_pw 해시 갱신, 변경 필요 플래그 해제', async () => {
            await patch().expect(204);

            expect(userRepository.findUser).toHaveBeenCalledWith({user_id: USER});
            expect(getBcryptSpy).toHaveBeenCalledWith(VALID_DTO.new_password);

            expect(userRepository.updateUser).toHaveBeenCalledTimes(1);
            const [where, entity] = userRepository.updateUser.mock.calls[0];
            expect(where).toEqual({user_id: USER});
            expect(entity).toBeInstanceOf(UserEntity);
            expect(entity.login_pw).toBe(NEW_HASH);
            expect(entity.is_password_change_required).toBe(0);
        });

        it('현재 비밀번호는 저장 해시와 비교된다', async () => {
            await patch().expect(204);

            expect(matchBcryptSpy).toHaveBeenNthCalledWith(1, VALID_DTO.current_password, STORED_HASH);
            expect(matchBcryptSpy).toHaveBeenNthCalledWith(2, VALID_DTO.new_password, STORED_HASH);
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:validation]
    // ─────────────────────────────────────────
    describe('[FAIL:validation]', () => {
        it('new_password 가 영문만 → 400, findUser 미호출', async () => {
            const res = await patch({...VALID_DTO, new_password: 'abcdefgh'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('new_password');
            expect(userRepository.findUser).not.toHaveBeenCalled();
        });

        it('new_password 7자 → 400, findUser 미호출', async () => {
            const res = await patch({...VALID_DTO, new_password: 'abc123!'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('new_password');
            expect(userRepository.findUser).not.toHaveBeenCalled();
        });

        it('new_password 에 허용되지 않은 특수문자 → 400', async () => {
            const res = await patch({...VALID_DTO, new_password: 'abcd1234<>'}).expect(400);

            expect(res.body.validationErrors[0].property).toBe('new_password');
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });

        it('current_password 미전송 → 400, findUser 미호출', async () => {
            const {current_password: _c, ...body} = VALID_DTO;

            const res = await patch(body).expect(400);

            expect(res.body.validationErrors[0].property).toBe('current_password');
            expect(userRepository.findUser).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:service]
    // ─────────────────────────────────────────
    describe('[FAIL:service]', () => {
        it('회원 없음 → 404, updateUser 미호출', async () => {
            userRepository.findUser.mockResolvedValueOnce(null);

            const res = await patch().expect(404);

            expect(res.body.message).toBe('회원 정보를 찾을 수 없습니다.');
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });

        it('현재 비밀번호 불일치 → 400, updateUser 미호출', async () => {
            matchBcryptSpy.mockReset().mockResolvedValueOnce(false);

            const res = await patch().expect(400);

            expect(res.body.message).toBe('현재 비밀번호가 일치하지 않습니다.');
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });

        it('새 비밀번호가 기존과 동일 → 400, updateUser 미호출', async () => {
            matchBcryptSpy.mockReset().mockResolvedValueOnce(true).mockResolvedValueOnce(true);

            const res = await patch().expect(400);

            expect(res.body.message).toBe('기존 비밀번호와 다른 비밀번호를 입력해주세요.');
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:auth]
    // ─────────────────────────────────────────
    describe('[FAIL:auth]', () => {
        it('미인증 → 401, findUser 미호출', async () => {
            guardAllows = false;

            await patch().expect(401);
            expect(userRepository.findUser).not.toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────
    // [FAIL:repository]
    // ─────────────────────────────────────────
    describe('[FAIL:repository]', () => {
        it('updateUser throw → 500', async () => {
            userRepository.updateUser.mockRejectedValueOnce(
                new InternalServerErrorException({message: '서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.'}),
            );

            const res = await patch().expect(500);
            expect(res.body.message).toBe('서버에서 오류가 발생했습니다. 관리자에게 문의해주세요.');
        });
    });
});
