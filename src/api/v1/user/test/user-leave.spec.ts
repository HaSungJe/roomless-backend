jest.mock('typeorm-transactional', () => ({
    Transactional: () => () => undefined,
    initializeTransactionalContext: jest.fn(),
    addTransactionalDataSource: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, BadRequestException, InternalServerErrorException, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import dayjs from 'dayjs';
import request from 'supertest';
import { UserController } from '../user.controller';
import { UserService } from '../user.service';
import { USER_REPOSITORY } from '../user.symbols';
import { PassportJwtAuthGuard } from '@root/guards/passport.jwt.auth/passport.jwt.auth.guard';
import { ValidationErrorDto } from '@root/common/dto/global.result.dto';
import { CustomErrorFilter } from '@root/exception/exception';

const USER = 'user-id-32chars-fillerxxxxxxxxxx';

describe('UserService - leave (회원 탈퇴 신청)', () => {
    let app: INestApplication;
    let userRepository: {findUser: jest.Mock; updateUser: jest.Mock};
    let guardAllows: boolean;

    const buildModule = async () => {
        guardAllows = true;
        userRepository = {
            findUser: jest.fn().mockResolvedValue({user_id: USER, state_id: 'ACTIVE'}),
            updateUser: jest.fn().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
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

    const del = (body?: any) => request(app.getHttpServer()).delete('/api/v1/user/leave').send(body);

    describe('[SUCCESS]', () => {
        it('ACTIVE 회원 → 204, updateUser 인자(LEAVE_WAIT/prev=ACTIVE/예약시각/사유) 검증', async () => {
            await del({leave_comment: '서비스 미사용'}).expect(204);

            expect(userRepository.updateUser).toHaveBeenCalledTimes(1);
            const [where, entity] = userRepository.updateUser.mock.calls[0];
            expect(where).toEqual({user_id: USER});
            expect(entity.state_id).toBe('LEAVE_WAIT');
            expect(entity.leave_prev_state_id).toBe('ACTIVE');
            expect(entity.leave_comment).toBe('서비스 미사용');
            // 예약시각 = now+14일, dayjs YYYY-MM-DD HH:mm:ss 문자열
            expect(entity.leave_reserved_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
            const diffDays = dayjs(entity.leave_reserved_at).diff(dayjs(), 'day');
            expect(diffDays === 13 || diffDays === 14).toBe(true);
        });

        it('BLOCK 회원 → 204, leave_prev_state_id=BLOCK 로 스냅샷', async () => {
            userRepository.findUser.mockResolvedValueOnce({user_id: USER, state_id: 'BLOCK'});
            await del({leave_comment: '사유'}).expect(204);
            expect(userRepository.updateUser.mock.calls[0][1].leave_prev_state_id).toBe('BLOCK');
        });

        it('leave_comment 미전송 → leave_comment=null 저장', async () => {
            await del({}).expect(204);
            expect(userRepository.updateUser.mock.calls[0][1].leave_comment).toBeNull();
        });
    });

    describe('[FAIL:validation]', () => {
        it('leave_comment 256자 → 400 max, updateUser 미호출', async () => {
            const res = await del({leave_comment: 'a'.repeat(256)}).expect(400);
            expect(res.body.message).toBe('탈퇴 사유는 최대 255자까지 입력할 수 있습니다.');
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:service]', () => {
        it('이미 LEAVE_WAIT 상태 → 400 invalid_state, updateUser 미호출', async () => {
            userRepository.findUser.mockResolvedValueOnce({user_id: USER, state_id: 'LEAVE_WAIT'});
            const res = await del({}).expect(400);
            expect(res.body.message).toBe('탈퇴를 신청할 수 없는 상태입니다.');
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });

        it('회원 미존재 → 404 member_not_found, updateUser 미호출', async () => {
            userRepository.findUser.mockResolvedValueOnce(null);
            const res = await del({}).expect(404);
            expect(res.body.message).toBe('일치하는 회원이 없습니다.');
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });
    });

    describe('[FAIL:repository]', () => {
        it('updateUser throw → 500 전파', async () => {
            userRepository.updateUser.mockRejectedValueOnce(new InternalServerErrorException({message: 'x'}));
            await del({}).expect(500);
        });
    });

    describe('[FAIL] 미인증', () => {
        it('guard 거부 → 401, findUser/updateUser 미호출', async () => {
            guardAllows = false;
            await del({}).expect(401);
            expect(userRepository.findUser).not.toHaveBeenCalled();
            expect(userRepository.updateUser).not.toHaveBeenCalled();
        });
    });
});
