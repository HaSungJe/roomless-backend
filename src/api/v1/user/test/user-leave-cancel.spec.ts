jest.mock('typeorm-transactional', () => ({
    Transactional: () => () => undefined,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';
import { USER_REPOSITORY } from '../user.symbols';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { I18nModule } from 'nestjs-i18n';
import { buildI18nOptions } from '@root/common/i18n/i18n.config';
import { loadKoPack } from '@root/common/i18n/test-utils/load-ko-pack';
const userKo = loadKoPack('user');
const cancelKo = userKo['cancel_leave'];
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';

const USER = 'user-id-32chars-fillerxxxxxxxxxx';

describe('UserService - cancelLeave (회원 탈퇴 철회)', () => {
    let app: INestApplication;
    let userRepository: {findUser: jest.Mock; updateUser: jest.Mock};
    let guardAllows: boolean;

    const buildModule = async () => {
        guardAllows = true;
        userRepository = {
            findUser: jest.fn().mockResolvedValue({user_id: USER, state_id: 'LEAVE_WAIT', leave_prev_state_id: 'BLOCK'}),
            updateUser: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            imports: [I18nModule.forRoot(buildI18nOptions())],
            controllers: [UserController],
            providers: [
                UserService,
                {provide: USER_REPOSITORY, useValue: userRepository},
                {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}},            ],
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
        app.useGlobalPipes(new ValidationPipe({
            transform: true, forbidNonWhitelisted: true,
            exceptionFactory: (errors) => {
                const result: Record<string, any> = {validationErrors: []};
                for (const e of errors) {
                    const dto = new ValidationErrorDto();
                    dto.type = Object.keys(e.constraints)[0];
                    dto.property = e.property;
                    dto.message = e.constraints[dto.type];
                    result.validationErrors.push(dto);
                }
                result.message = result.validationErrors[0]?.message ?? '실패';
                return new BadRequestException(result);
            },
        }));
        await app.init();
    };

    beforeEach(async () => { await buildModule(); });
    afterEach(async () => { await app.close(); });

    const patch = () => request(app.getHttpServer()).patch('/api/v1/user/leave');

    describe('[SUCCESS]', () => {
        it('LEAVE_WAIT(prev=BLOCK) → 204, 직전상태 복원 + null 초기화', async () => {
            await patch().expect(204);

            expect(userRepository.updateUser).toHaveBeenCalledTimes(1);
            const [where, entity] = userRepository.updateUser.mock.calls[0];
            expect(where).toEqual({user_id: USER});
            expect(entity.state_id).toBe('BLOCK');
            expect(entity.leave_reserved_at).toBeNull();
            expect(entity.leave_prev_state_id).toBeNull();
            expect(entity.leave_comment).toBeNull();
        });

        it('prev=null → 안전망 ACTIVE 복원', async () => {
            userRepository.findUser.mockResolvedValueOnce({user_id: USER, state_id: 'LEAVE_WAIT', leave_prev_state_id: null});
            await patch().expect(204);
            expect(userRepository.updateUser.mock.calls[0][1].state_id).toBe('ACTIVE');
        });
    });

    describe('[FAIL:service]', () => {
        it('LEAVE_WAIT 아님(ACTIVE) → 400 invalid_state, updateUser 미호출', async () => {
            userRepository.findUser.mockResolvedValueOnce({user_id: USER, state_id: 'ACTIVE', leave_prev_state_id: null});
            const res = await patch().expect(400);
            expect(res.body.message).toBe(cancelKo.invalid_state);
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });

        it('회원 미존재 → 404 member_not_found, updateUser 미호출', async () => {
            userRepository.findUser.mockResolvedValueOnce(null);
            const res = await patch().expect(404);
            expect(res.body.message).toBe(cancelKo.member_not_found);
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL] 미인증', () => {
        it('guard 거부 → 401, updateUser 미호출', async () => {
            guardAllows = false;
            await patch().expect(401);
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });
    });
});
