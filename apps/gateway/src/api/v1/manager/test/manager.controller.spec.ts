import {INestApplication, ValidationPipe} from '@nestjs/common';
import {MODULE_METADATA} from '@nestjs/common/constants.js';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {InternalHttpClient} from '../../../../modules/transport/internal-http.client.js';
import {ManagerController} from '../controllers/manager.controller.js';
import {ManagerQueueController} from '../controllers/manager.controller.queue.js';
import {ManagerModule} from '../manager.module.js';

const TOKENS = {access_token: 'a', refresh_token: 'r', access_token_expires_at: '2026-01-01T00:20:00.000Z', refresh_token_expires_at: '2027-01-01T00:00:00.000Z'};
const LOGIN_RESULT = {...TOKENS, is_password_change_required: 0, auth_id: 'HEAD_MANAGER', store_id: 's'.repeat(32)};

describe('게이트웨이 매니저 라우트 — 동기 경로(내부 HTTP, ManagerController)', () => {
    let app: INestApplication;
    let internalHttp: {request: ReturnType<typeof vi.fn>};

    beforeEach(async () => {
        internalHttp = {request: vi.fn()};
        const module = await Test.createTestingModule({controllers: [ManagerController], providers: [{provide: InternalHttpClient, useValue: internalHttp}]}).compile();
        app = module.createNestApplication();
        app.useGlobalFilters(new CustomErrorFilter());
        app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it.each([
        ['/api/v1/manager/login', '/internal/v1/manager/login', {login_id: 'manager_01', login_pw: 'abcd1234!'}, LOGIN_RESULT],
        ['/api/v1/manager/token-refresh', '/internal/v1/manager/token-refresh', {refresh_token: 'r.t'}, TOKENS],
    ])('[SUCCESS] POST %s → admin-service %s, 응답을 그대로 200 JSON 으로', async (path, internalPath, body, result) => {
        internalHttp.request.mockResolvedValueOnce(result);

        const res = await request(app.getHttpServer()).post(path).send(body);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(result);
        expect(internalHttp.request).toHaveBeenCalledTimes(1);
        expect(internalHttp.request).toHaveBeenCalledWith('admin', 'POST', internalPath, {body, client_ip: expect.any(String)});
    });

    it('[FAIL:validation] 로그인 아이디가 없으면 400(입력 오류 login_id), 서비스 호출 없음', async () => {
        const res = await request(app.getHttpServer()).post('/api/v1/manager/login').send({login_pw: 'abcd1234!'});

        expect(res.status).toBe(400);
        expect(res.body.validation_errors).toEqual([{property: 'login_id', message: '아이디를 입력해주세요.'}]);
        expect(internalHttp.request).not.toHaveBeenCalled();
    });

    it('[FAIL:route] 큐 경로 라우트는 이 컨트롤러에 없다 (manager.controller.queue.ts 담당)', async () => {
        const res = await request(app.getHttpServer()).post('/api/v1/manager/find-login-id').send({phone: '01012345678'});

        expect(res.status).toBe(404);
        expect(internalHttp.request).not.toHaveBeenCalled();
    });
});

describe('ManagerModule — 전달 경로별 컨트롤러', () => {
    it('동기(ManagerController) · 큐(ManagerQueueController) 컨트롤러를 함께 등록한다', () => {
        expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, ManagerModule)).toEqual([ManagerController, ManagerQueueController]);
    });
});
