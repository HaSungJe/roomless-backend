import {ExecutionContext, HttpException, HttpStatus, INestApplication, ValidationPipe} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {COMMAND_PUBLISHER, GATEWAY_INSTANCE_ID, RESULT_SUBSCRIBER} from '@app/messaging/messaging.symbols.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';
import {FakeBroker, parseSse, replyDone} from '../../../../../modules/transport/test/fake-broker.js';
import {ManagerQueueController} from '../controllers/manager.controller.queue.js';

const LOGIN_USER = {user_id: 'u'.repeat(32), login_id: 'manager_01', name: '총매니저', auth_id: 'HEAD_MANAGER', store_id: 's'.repeat(32), state_id: 'ACTIVE', is_login_allowed: 1};
const PASSWORD_DTO = {current_password: 'old1234!', new_password: 'new5678!'};
const SEND_RESULT = {sms_verification_id: 'a'.repeat(32), expires_at: '2026-01-01T00:05:00.000Z'};
const CONFIRM = {sms_verification_id: 'a'.repeat(32), code: '123456'};

describe('게이트웨이 매니저 라우트 — 큐 경로(요청 단위 SSE, ManagerQueueController)', () => {
    let app: INestApplication;
    let broker: FakeBroker;
    let authenticated: boolean;
    let loginUser: typeof LOGIN_USER;

    beforeEach(async () => {
        broker = new FakeBroker();
        authenticated = true;
        loginUser = LOGIN_USER;
        const module = await Test.createTestingModule({
            controllers: [ManagerQueueController],
            providers: [CommandStreamService, {provide: COMMAND_PUBLISHER, useValue: broker}, {provide: RESULT_SUBSCRIBER, useValue: broker}, {provide: GATEWAY_INSTANCE_ID, useValue: 'gw-test'}],
        })
            .overrideGuard(PassportJwtManagerAuthGuard)
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

    it.each([['HEAD_MANAGER'], ['MANAGER']])('[SUCCESS] PATCH /password — %s 회원이면 admin.manager.password 를 actor 와 함께 발행하고 accepted → done(null)', async (auth_id) => {
        loginUser = {...LOGIN_USER, auth_id};
        broker.reply = replyDone(null);

        const res = await request(app.getHttpServer()).patch('/api/v1/admin-service/manager/password').send(PASSWORD_DTO);

        expect(res.status).toBe(200);
        expect(broker.published).toHaveLength(1);
        expect(broker.published[0]).toMatchObject({type: 'admin.manager.password', actor: {user_id: LOGIN_USER.user_id, auth_id}, payload: PASSWORD_DTO});
        expect(parseSse(res.text).map((e) => e.event)).toEqual(['accepted', 'done']);
    });

    it('[FAIL:auth] 비밀번호 변경은 매니저 가드 인증 실패(다른 그룹 토큰 포함)면 401, 발행 없음', async () => {
        authenticated = false;

        const res = await request(app.getHttpServer()).patch('/api/v1/admin-service/manager/password').send(PASSWORD_DTO);

        expect(res.status).toBe(401);
        expect(broker.published).toHaveLength(0);
    });

    it.each([
        ['/api/v1/admin-service/manager/find-login-id', {phone: '01012345678'}, 'admin.manager.find-login-id', SEND_RESULT],
        ['/api/v1/admin-service/manager/find-login-id/confirm', CONFIRM, 'admin.manager.find-login-id-confirm', {login_id: 'manager_01', created_at: '2025-06-01T00:30:00.000Z'}],
        ['/api/v1/admin-service/manager/password-reset', {login_id: 'manager_01', phone: '01012345678'}, 'admin.manager.password-reset', SEND_RESULT],
        ['/api/v1/admin-service/manager/password-reset/confirm', CONFIRM, 'admin.manager.password-reset-confirm', null],
    ] as const)('[SUCCESS] POST %s — 비로그인(actor null)으로 %s 를 발행하고 accepted → done', async (path, body, type, data) => {
        authenticated = false;
        broker.reply = replyDone(data);

        const res = await request(app.getHttpServer()).post(path).send(body);

        expect(res.status).toBe(200);
        expect(broker.published).toHaveLength(1);
        expect(broker.published[0]).toMatchObject({type, actor: null, payload: body});
        expect(parseSse(res.text)[1]).toEqual({event: 'done', data});
    });

    it.each([
        ['/api/v1/admin-service/manager/find-login-id', {phone: '010-1234-5678'}, 'phone'],
        ['/api/v1/admin-service/manager/find-login-id/confirm', {...CONFIRM, code: '12345'}, 'code'],
        ['/api/v1/admin-service/manager/password-reset', {login_id: 'manager_01', phone: '0101234'}, 'phone'],
    ] as const)('[FAIL:validation] POST %s 형식 오류는 400(입력 오류 %s), 발행 없음', async (path, body, property) => {
        const res = await request(app.getHttpServer()).post(path).send(body);

        expect(res.status).toBe(400);
        expect(res.body.validation_errors[0].property).toBe(property);
        expect(broker.published).toHaveLength(0);
    });

    it('[FAIL:route] 동기 경로 라우트는 이 컨트롤러에 없다 (manager.controller.ts 담당)', async () => {
        const res = await request(app.getHttpServer()).post('/api/v1/admin-service/manager/login').send({login_id: 'manager_01', login_pw: 'abcd1234!'});

        expect(res.status).toBe(404);
        expect(broker.published).toHaveLength(0);
    });
});
