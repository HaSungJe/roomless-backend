import {INestApplication, ValidationPipe} from '@nestjs/common';
import {MODULE_METADATA} from '@nestjs/common/constants.js';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {InternalHttpClient} from '../../../../modules/transport/internal-http.client.js';
import {AdminModule} from '../admin.module.js';
import {AdminController} from '../controllers/admin.controller.js';
import {AdminQueueController} from '../controllers/admin.controller.queue.js';

const TOKENS = {access_token: 'a', refresh_token: 'r', access_token_expires_at: '2026-01-01T00:20:00.000Z', refresh_token_expires_at: '2027-01-01T00:00:00.000Z'};
const LOGIN_RESULT = {...TOKENS, is_password_change_required: 1, auth_id: 'SUPER_ADMIN'};

describe('게이트웨이 관리자 라우트 — 동기 경로(내부 HTTP, AdminController)', () => {
    let app: INestApplication;
    let internalHttp: {request: ReturnType<typeof vi.fn>};

    beforeEach(async () => {
        internalHttp = {request: vi.fn()};
        const module = await Test.createTestingModule({controllers: [AdminController], providers: [{provide: InternalHttpClient, useValue: internalHttp}]}).compile();
        app = module.createNestApplication();
        app.useGlobalFilters(new CustomErrorFilter());
        app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it.each([
        ['/api/v1/admin/login', '/internal/v1/admin/login', {login_id: 'admin', login_pw: '1234'}, LOGIN_RESULT],
        ['/api/v1/admin/token-refresh', '/internal/v1/admin/token-refresh', {refresh_token: 'r.t'}, TOKENS],
    ])('[SUCCESS] POST %s → admin-service %s, 응답을 그대로 200 JSON 으로', async (path, internalPath, body, result) => {
        internalHttp.request.mockResolvedValueOnce(result);

        const res = await request(app.getHttpServer()).post(path).send(body);

        expect(res.status).toBe(200);
        expect(res.body).toEqual(result);
        expect(internalHttp.request).toHaveBeenCalledTimes(1);
        expect(internalHttp.request).toHaveBeenCalledWith('admin', 'POST', internalPath, {body, client_ip: expect.any(String)});
    });

    it('[FAIL:validation] 로그인 아이디가 없으면 400(입력 오류 login_id), 서비스 호출 없음', async () => {
        const res = await request(app.getHttpServer()).post('/api/v1/admin/login').send({login_pw: '1234'});

        expect(res.status).toBe(400);
        expect(res.body.validation_errors).toEqual([{property: 'login_id', message: '아이디를 입력해주세요.'}]);
        expect(internalHttp.request).not.toHaveBeenCalled();
    });

    it.each([['/api/v1/admin/find-login-id'], ['/api/v1/admin/password-reset']])('[FAIL:route] 관리자 그룹은 아이디 찾기 · 비밀번호 초기화가 없다 — POST %s → 404', async (path) => {
        const res = await request(app.getHttpServer()).post(path).send({});

        expect(res.status).toBe(404);
        expect(internalHttp.request).not.toHaveBeenCalled();
    });

    it('[FAIL:route] 큐 경로 라우트는 이 컨트롤러에 없다 (admin.controller.queue.ts 담당)', async () => {
        const res = await request(app.getHttpServer()).patch('/api/v1/admin/password').send({});

        expect(res.status).toBe(404);
        expect(internalHttp.request).not.toHaveBeenCalled();
    });
});

describe('AdminModule — 전달 경로별 컨트롤러', () => {
    it('동기(AdminController) · 큐(AdminQueueController) 컨트롤러를 함께 등록한다', () => {
        expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AdminModule)).toEqual([AdminController, AdminQueueController]);
    });
});
