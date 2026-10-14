import {Controller, Get, INestApplication} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {buildCorsOptions} from '../cors.config.js';

/** CORS 확인용 컨트롤러 */
@Controller('/probe')
class CorsProbeController {
    /** 200 */
    @Get()
    ok(): {ok: boolean} {
        return {ok: true};
    }
}

describe('buildCorsOptions — CORS_ORIGINS', () => {
    it('쉼표 목록을 공백을 빼고 출처 배열로 쓴다', () => {
        expect(buildCorsOptions({CORS_ORIGINS: ' http://localhost:3001 , https://app.roomless.kr '}).origin).toEqual(['http://localhost:3001', 'https://app.roomless.kr']);
    });

    it('* 가 있으면 모든 출처 허용', () => {
        expect(buildCorsOptions({CORS_ORIGINS: '*'}).origin).toBe('*');
    });

    it.each([[undefined], [''], [' , ']])('값이 없으면(%s) 다른 출처를 모두 막는다', (value) => {
        expect(buildCorsOptions(value === undefined ? {} : {CORS_ORIGINS: value}).origin).toBe(false);
    });

    it('기존 메서드 · 헤더 · preflight 설정을 유지한다', () => {
        expect(buildCorsOptions({CORS_ORIGINS: '*'})).toEqual({origin: '*', allowedHeaders: '*', methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', preflightContinue: false, optionsSuccessStatus: 204});
    });
});

describe('게이트웨이 CORS 동작 (HTTP)', () => {
    let app: INestApplication;

    /**
     * 주어진 CORS_ORIGINS 로 앱을 띄운다.
     *
     * @param origins CORS_ORIGINS 값
     */
    const boot = async (origins: string | undefined) => {
        const module = await Test.createTestingModule({controllers: [CorsProbeController]}).compile();
        app = module.createNestApplication();
        app.enableCors(buildCorsOptions(origins === undefined ? {} : {CORS_ORIGINS: origins}));
        await app.init();
    };

    afterEach(async () => {
        await app.close();
    });

    it('[SUCCESS] 허용 출처는 Access-Control-Allow-Origin 에 그 출처가 실린다', async () => {
        await boot('http://localhost:3001');

        const res = await request(app.getHttpServer()).get('/probe').set('Origin', 'http://localhost:3001');

        expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    });

    it('[FAIL] 허용하지 않은 출처에는 CORS 헤더를 주지 않는다(브라우저가 응답을 막는다)', async () => {
        await boot('http://localhost:3001');

        const res = await request(app.getHttpServer()).get('/probe').set('Origin', 'http://evil.example');

        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('[SUCCESS] preflight(OPTIONS)는 204 + 허용 메서드', async () => {
        await boot('http://localhost:3001');

        const res = await request(app.getHttpServer()).options('/probe').set('Origin', 'http://localhost:3001').set('Access-Control-Request-Method', 'POST');

        expect(res.status).toBe(204);
        expect(res.headers['access-control-allow-methods']).toBe('GET,HEAD,PUT,PATCH,POST,DELETE');
    });

    it('[FAIL] CORS_ORIGINS 가 없으면 어떤 출처에도 CORS 헤더를 주지 않는다', async () => {
        await boot(undefined);

        const res = await request(app.getHttpServer()).get('/probe').set('Origin', 'http://localhost:3001');

        expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
});
