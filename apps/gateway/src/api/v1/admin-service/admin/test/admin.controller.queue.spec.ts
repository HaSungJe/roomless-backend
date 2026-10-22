import {ExecutionContext, HttpException, HttpStatus, INestApplication, ValidationPipe} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {COMMAND_PUBLISHER, GATEWAY_INSTANCE_ID, RESULT_SUBSCRIBER} from '@app/messaging/messaging.symbols.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';
import {FakeBroker, parseSse, replyDone} from '../../../../../modules/transport/test/fake-broker.js';
import {AdminQueueController} from '../controllers/admin.controller.queue.js';

const LOGIN_USER = {user_id: 'u'.repeat(32), login_id: 'admin', name: '총관리자', auth_id: 'SUPER_ADMIN', state_id: 'ACTIVE', is_login_allowed: 1};
const PASSWORD_DTO = {current_password: 'old1234!', new_password: 'new5678!'};

describe('게이트웨이 관리자 라우트 — 큐 경로(요청 단위 SSE, AdminQueueController)', () => {
    let app: INestApplication;
    let broker: FakeBroker;
    let authenticated: boolean;
    let loginUser: typeof LOGIN_USER;

    beforeEach(async () => {
        broker = new FakeBroker();
        authenticated = true;
        loginUser = LOGIN_USER;
        const module = await Test.createTestingModule({
            controllers: [AdminQueueController],
            providers: [CommandStreamService, {provide: COMMAND_PUBLISHER, useValue: broker}, {provide: RESULT_SUBSCRIBER, useValue: broker}, {provide: GATEWAY_INSTANCE_ID, useValue: 'gw-test'}],
        })
            .overrideGuard(PassportJwtAdminAuthGuard)
            .useValue({
                canActivate: (ctx: ExecutionContext) => {
                    if (!authenticated) throw new HttpException({message: '로그인 정보가 유효하지 않습니다.'}, HttpStatus.UNAUTHORIZED);
                    ctx.switchToHttp().getRequest().user = loginUser;
                    return true;
                },
            })
            .compile();
        app = module.createNestApplication();
        app.useGlobalFilters(new CustomErrorFilter());
        app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it.each([['SUPER_ADMIN'], ['ADMIN']])('[SUCCESS] PATCH /password — %s 회원이면 admin.admin.password 를 actor 와 함께 발행하고 accepted → done(null)', async (auth_id) => {
        loginUser = {...LOGIN_USER, auth_id};
        broker.reply = replyDone(null);

        const res = await request(app.getHttpServer()).patch('/api/v1/admin-service/admin/password').send(PASSWORD_DTO);

        expect(res.status).toBe(200);
        expect(broker.published).toHaveLength(1);
        expect(broker.published[0]).toMatchObject({type: 'admin.admin.password', actor: {user_id: LOGIN_USER.user_id, auth_id}, payload: PASSWORD_DTO});
        expect(parseSse(res.text)).toEqual([
            {event: 'accepted', data: {request_id: broker.published[0].request_id}},
            {event: 'done', data: null},
        ]);
    });

    it('[FAIL:auth] 관리자 가드 인증 실패(다른 그룹 토큰 포함)면 401, 발행 없음', async () => {
        authenticated = false;

        const res = await request(app.getHttpServer()).patch('/api/v1/admin-service/admin/password').send(PASSWORD_DTO);

        expect(res.status).toBe(401);
        expect(broker.published).toHaveLength(0);
    });

    it('[FAIL:validation] 비밀번호 형식 오류는 400, 발행 없음', async () => {
        const res = await request(app.getHttpServer()).patch('/api/v1/admin-service/admin/password').send({current_password: 'old', new_password: 'short'});

        expect(res.status).toBe(400);
        expect(res.body.validation_errors[0].property).toBe('new_password');
        expect(broker.published).toHaveLength(0);
    });

    it('[FAIL:route] 동기 경로 라우트는 이 컨트롤러에 없다 (admin.controller.ts 담당)', async () => {
        const res = await request(app.getHttpServer()).post('/api/v1/admin-service/admin/login').send({login_id: 'admin', login_pw: '1234'});

        expect(res.status).toBe(404);
        expect(broker.published).toHaveLength(0);
    });
});
