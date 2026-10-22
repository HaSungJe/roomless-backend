import {HttpException, HttpStatus, INestApplication, ValidationPipe} from '@nestjs/common';
import {MODULE_METADATA} from '@nestjs/common/constants.js';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';
import {UserController} from '../controllers/user.controller.js';
import {UserQueueController} from '../controllers/user.controller.queue.js';
import {UserModule} from '../user.module.js';

const TOKENS = {access_token: 'a', refresh_token: 'r', access_token_expires_at: '2026-01-01T00:20:00.000Z', refresh_token_expires_at: '2027-01-01T00:00:00.000Z'};

describe('게이트웨이 이용자 라우트 — 동기 경로(내부 HTTP, UserController)', () => {
    let app: INestApplication;
    let internalHttp: {request: ReturnType<typeof vi.fn>};

    beforeEach(async () => {
        internalHttp = {request: vi.fn()};
        const module = await Test.createTestingModule({controllers: [UserController], providers: [{provide: InternalHttpClient, useValue: internalHttp}]}).compile();
        app = module.createNestApplication();
        app.useGlobalFilters(new CustomErrorFilter());
        app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it.each([
        ['/api/v1/user-service/user/login', '/internal/v1/user-service/user/login', {sns_id: 'KAKAO', sns_user_id: 'kakao_1'}],
        ['/api/v1/user-service/user/token-refresh', '/internal/v1/user-service/user/token-refresh', {refresh_token: 'r.t'}],
    ])('[SUCCESS] POST %s → user-service %s, 응답을 그대로 200 JSON 으로', async (path, internalPath, body) => {
        internalHttp.request.mockResolvedValueOnce(TOKENS);

        const res = await request(app.getHttpServer()).post(path).send(body);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/json');
        expect(res.body).toEqual(TOKENS);
        expect(internalHttp.request).toHaveBeenCalledTimes(1);
        expect(internalHttp.request).toHaveBeenCalledWith('user', 'POST', internalPath, {body, client_ip: expect.any(String)});
    });

    it('[FAIL:service] 서비스의 실패(상태 코드 + 본문 + 추가 필드)를 그대로 전달한다', async () => {
        internalHttp.request.mockRejectedValueOnce(new HttpException({message: '이용이 제한된 계정입니다.', validation_errors: null, block_comment: '사유'}, HttpStatus.FORBIDDEN));

        const res = await request(app.getHttpServer()).post('/api/v1/user-service/user/login').send({sns_id: 'KAKAO', sns_user_id: 'kakao_1'});

        expect(res.status).toBe(403);
        expect(res.body).toEqual({message: '이용이 제한된 계정입니다.', validation_errors: null, block_comment: '사유'});
    });

    it('[FAIL:validation] 게이트웨이에서 먼저 검증해 서비스를 호출하지 않는다', async () => {
        const res = await request(app.getHttpServer()).post('/api/v1/user-service/user/token-refresh').send({});

        expect(res.status).toBe(400);
        expect(internalHttp.request).not.toHaveBeenCalled();
    });

    it('[FAIL:route] 이용자 일반 로그인(/general-login)은 없어졌다 → 404, 서비스 호출 없음', async () => {
        const res = await request(app.getHttpServer()).post('/api/v1/user-service/user/general-login').send({login_id: 'roomless_01', login_pw: 'abcd1234!'});

        expect(res.status).toBe(404);
        expect(internalHttp.request).not.toHaveBeenCalled();
    });

    it('[FAIL:route] 큐 경로 라우트는 이 컨트롤러에 없다 (user.controller.queue.ts 담당)', async () => {
        const res = await request(app.getHttpServer()).post('/api/v1/user-service/user/sign').send({});

        expect(res.status).toBe(404);
        expect(internalHttp.request).not.toHaveBeenCalled();
    });
});

describe('UserModule — 전달 경로별 컨트롤러', () => {
    it('동기(UserController) · 큐(UserQueueController) 컨트롤러를 함께 등록한다', () => {
        expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, UserModule)).toEqual([UserController, UserQueueController]);
    });
});
