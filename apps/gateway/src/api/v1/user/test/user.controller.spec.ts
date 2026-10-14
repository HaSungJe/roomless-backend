import {ExecutionContext, HttpException, HttpStatus, INestApplication, ValidationPipe} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {COMMAND_PUBLISHER, GATEWAY_INSTANCE_ID, RESULT_SUBSCRIBER} from '@app/messaging/messaging.symbols.js';
import {PassportJwtAuthGuard} from '../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {CommandStreamService} from '../../../../modules/transport/command-stream.service.js';
import {InternalHttpClient} from '../../../../modules/transport/internal-http.client.js';
import {FakeBroker, parseSse, replyDone, replyFailed} from '../../../../modules/transport/test/fake-broker.js';
import {UserController} from '../user.controller.js';

const LOGIN_USER = {
    user_id: 'u'.repeat(32),
    auth_id: 'USER',
    login_id: 'roomless_01',
    name: '홍길동',
    gender: 'M',
    birth: '1990-01-01',
    nickname: '길동',
    store_id: null,
    state_id: 'ACTIVE',
    is_login_able: 1,
};
const ACTOR = {user_id: LOGIN_USER.user_id, auth_id: 'USER'};
const TOKENS = {access_token: 'a', refresh_token: 'r', access_token_expires_at: '2026-01-01T00:20:00.000Z', refresh_token_expires_at: '2027-01-01T00:00:00.000Z'};
const SIGN_DTO = {sns_id: 'KAKAO', sns_user_id: 'kakao_1', gender: 'M', birth: '2000-01-01', nickname: '길동이'};

describe('게이트웨이 회원 라우트 (/api/v1/user)', () => {
    let app: INestApplication;
    let broker: FakeBroker;
    let internalHttp: {request: ReturnType<typeof vi.fn>};
    let authenticated: boolean;

    beforeEach(async () => {
        broker = new FakeBroker();
        internalHttp = {request: vi.fn()};
        authenticated = true;
        const module = await Test.createTestingModule({
            controllers: [UserController],
            providers: [
                CommandStreamService,
                {provide: InternalHttpClient, useValue: internalHttp},
                {provide: COMMAND_PUBLISHER, useValue: broker},
                {provide: RESULT_SUBSCRIBER, useValue: broker},
                {provide: GATEWAY_INSTANCE_ID, useValue: 'gw-test'},
            ],
        })
            .overrideGuard(PassportJwtAuthGuard)
            .useValue({
                canActivate: (ctx: ExecutionContext) => {
                    if (!authenticated) throw new HttpException({message: '로그인 정보가 유효하지 않습니다.'}, HttpStatus.UNAUTHORIZED);
                    ctx.switchToHttp().getRequest().user = LOGIN_USER;
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

    describe('큐 경로 — 요청 단위 SSE', () => {
        it('[SUCCESS] POST /sign — 명령을 발행하고 accepted → done(토큰) 후 스트림을 닫는다', async () => {
            broker.reply = replyDone(TOKENS);

            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send(SIGN_DTO);

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            expect(res.headers['cache-control']).toContain('no-cache');
            expect(broker.published).toHaveLength(1);
            const command = broker.published[0];
            expect(command).toMatchObject({type: 'user.member.sign', actor: null, payload: SIGN_DTO, meta: {reply_to: 'gw-test', attempt: 1}});
            expect(command.meta.client_ip).toEqual(expect.any(String));
            expect(parseSse(res.text)).toEqual([
                {event: 'accepted', data: {request_id: command.request_id}},
                {event: 'done', data: TOKENS},
            ]);
        });

        it('[FAIL:service] 서비스가 failed 를 회신하면 failed 이벤트에 상태 코드 + 실패 본문', async () => {
            broker.reply = replyFailed(400, {message: '이미 가입된 SNS 계정입니다.', validation_errors: null});

            const res = await request(app.getHttpServer()).post('/api/v1/user/sign').send(SIGN_DTO);

            expect(res.status).toBe(200);
            expect(parseSse(res.text)[1]).toEqual({event: 'failed', data: {status_code: 400, message: '이미 가입된 SNS 계정입니다.', validation_errors: null}});
        });

        it('[FAIL:validation] 입력 오류는 스트림을 열지 않고 일반 400, 발행 없음', async () => {
            const res = await request(app.getHttpServer())
                .post('/api/v1/user/sign')
                .send({...SIGN_DTO, gender: 'X'});

            expect(res.status).toBe(400);
            expect(res.headers['content-type']).toContain('application/json');
            expect(res.body).toEqual({message: '성별이 올바르지 않습니다.', validation_errors: [{property: 'gender', message: '성별이 올바르지 않습니다.'}]});
            expect(broker.published).toHaveLength(0);
        });

        it('[FAIL:broker] 발행이 실패하면 스트림을 열지 않고 일반 503', async () => {
            const {ServiceUnavailableException} = await import('@nestjs/common');
            broker.publishError = new ServiceUnavailableException({message: '일시적으로 요청을 접수할 수 없습니다. 잠시 후 다시 시도해주세요.'});

            const res = await request(app.getHttpServer())
                .post('/api/v1/user/general-sign')
                .send({login_id: 'roomless_01', login_pw: 'abcd1234!', gender: 'F', birth: '1995-05-05', nickname: '룸리스'});

            expect(res.status).toBe(503);
            expect(res.body).toEqual({message: '일시적으로 요청을 접수할 수 없습니다. 잠시 후 다시 시도해주세요.', validation_errors: null});
            expect(app.get(CommandStreamService).pendingCount()).toBe(0);
        });

        it.each([
            ['delete', '/api/v1/user/leave', {leave_comment: '사유'}, 'user.member.leave', {leave_comment: '사유'}],
            ['patch', '/api/v1/user/leave', {}, 'user.member.leave-cancel', {}],
            ['patch', '/api/v1/user/password', {current_password: 'old1234!', new_password: 'new5678!'}, 'user.member.password', {current_password: 'old1234!', new_password: 'new5678!'}],
        ] as const)('[SUCCESS] %s %s — 로그인 회원을 actor 로 실어 %s 를 발행하고 done(null)', async (method, path, body, type, payload) => {
            broker.reply = replyDone(null);

            const res = await request(app.getHttpServer())[method](path).send(body);

            expect(res.status).toBe(200);
            expect(broker.published[0]).toMatchObject({type, actor: ACTOR, payload});
            expect(parseSse(res.text).map((e) => e.event)).toEqual(['accepted', 'done']);
            expect(parseSse(res.text)[1].data).toBeNull();
        });

        it('[FAIL:auth] 인증 실패면 401, 발행 없음', async () => {
            authenticated = false;

            const res = await request(app.getHttpServer()).delete('/api/v1/user/leave').send({});

            expect(res.status).toBe(401);
            expect(res.body).toEqual({message: '로그인 정보가 유효하지 않습니다.', validation_errors: null});
            expect(broker.published).toHaveLength(0);
        });

        it('[FAIL:validation] 비밀번호 형식 오류는 400, 발행 없음', async () => {
            const res = await request(app.getHttpServer()).patch('/api/v1/user/password').send({current_password: 'old', new_password: 'short'});

            expect(res.status).toBe(400);
            expect(res.body.validation_errors[0].property).toBe('new_password');
            expect(broker.published).toHaveLength(0);
        });
    });

    describe('동기 경로 — 내부 HTTP', () => {
        it.each([
            ['/api/v1/user/login', '/internal/v1/user/login', {sns_id: 'KAKAO', sns_user_id: 'kakao_1'}],
            ['/api/v1/user/general-login', '/internal/v1/user/general-login', {login_id: 'roomless_01', login_pw: 'abcd1234!'}],
            ['/api/v1/user/token-refresh', '/internal/v1/user/token-refresh', {refresh_token: 'r.t'}],
        ])('[SUCCESS] POST %s → user-service %s, 응답을 그대로 200 JSON 으로', async (path, internalPath, body) => {
            internalHttp.request.mockResolvedValueOnce(TOKENS);

            const res = await request(app.getHttpServer()).post(path).send(body);

            expect(res.status).toBe(200);
            expect(res.body).toEqual(TOKENS);
            expect(internalHttp.request).toHaveBeenCalledWith('user', 'POST', internalPath, {body, client_ip: expect.any(String)});
            expect(broker.published).toHaveLength(0);
        });

        it('[FAIL:service] 서비스의 실패(상태 코드 + 본문 + 추가 필드)를 그대로 전달한다', async () => {
            internalHttp.request.mockRejectedValueOnce(new HttpException({message: '이용이 제한된 계정입니다.', validation_errors: null, block_comment: '사유'}, HttpStatus.FORBIDDEN));

            const res = await request(app.getHttpServer()).post('/api/v1/user/login').send({sns_id: 'KAKAO', sns_user_id: 'kakao_1'});

            expect(res.status).toBe(403);
            expect(res.body).toEqual({message: '이용이 제한된 계정입니다.', validation_errors: null, block_comment: '사유'});
        });

        it('[FAIL:validation] 게이트웨이에서 먼저 검증해 서비스를 호출하지 않는다', async () => {
            const res = await request(app.getHttpServer()).post('/api/v1/user/token-refresh').send({});

            expect(res.status).toBe(400);
            expect(internalHttp.request).not.toHaveBeenCalled();
        });
    });
});
