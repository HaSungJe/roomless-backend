import {Controller, Get, Ip} from '@nestjs/common';
import type {NestExpressApplication} from '@nestjs/platform-express';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {parseTrustProxy} from '../trust-proxy.config.js';

/** 클라이언트 IP 확인용 컨트롤러 */
@Controller('/probe')
class IpProbeController {
    /**
     * 게이트웨이가 본 클라이언트 IP 를 돌려준다.
     *
     * @param ip `@Ip()`
     * @returns {ip}
     */
    @Get()
    ip(@Ip() ip: string): {ip: string} {
        return {ip};
    }
}

describe('parseTrustProxy — TRUST_PROXY', () => {
    it.each([[undefined], [''], ['  ']])('값이 없으면(%s) 설정하지 않는다(null)', (value) => {
        expect(parseTrustProxy(value)).toBeNull();
    });

    it('정수는 앞단 프록시 수(number)로 바꾼다', () => {
        expect(parseTrustProxy('1')).toBe(1);
        expect(parseTrustProxy(' 2 ')).toBe(2);
    });

    it('true / false 는 boolean 으로 바꾼다', () => {
        expect(parseTrustProxy('true')).toBe(true);
        expect(parseTrustProxy('false')).toBe(false);
    });

    it('그 밖의 값은 주소 목록으로 그대로 넘긴다', () => {
        expect(parseTrustProxy('loopback, uniquelocal')).toBe('loopback, uniquelocal');
    });
});

describe('게이트웨이 클라이언트 IP (로드밸런서 뒤)', () => {
    let app: NestExpressApplication;

    /**
     * 주어진 TRUST_PROXY 로 앱을 띄운다 (main.ts 와 같은 방식).
     *
     * @param value TRUST_PROXY 값
     */
    const boot = async (value: string | undefined) => {
        const module = await Test.createTestingModule({controllers: [IpProbeController]}).compile();
        app = module.createNestApplication<NestExpressApplication>();
        const trustProxy = parseTrustProxy(value);
        if (trustProxy !== null) app.set('trust proxy', trustProxy);
        await app.init();
    };

    afterEach(async () => {
        await app.close();
    });

    it('[SUCCESS] TRUST_PROXY=1 이면 nginx 가 붙인 X-Forwarded-For 의 마지막 주소(실제 클라이언트)를 쓴다', async () => {
        await boot('1');

        // 클라이언트가 위조해 보낸 값(198.51.100.9) 뒤에 nginx 가 실제 주소(203.0.113.7)를 덧붙인 모양
        const res = await request(app.getHttpServer()).get('/probe').set('X-Forwarded-For', '198.51.100.9, 203.0.113.7');

        expect(res.body).toEqual({ip: '203.0.113.7'});
    });

    it('[SUCCESS] TRUST_PROXY 가 없으면 X-Forwarded-For 를 무시하고 요청을 보낸 주소를 쓴다', async () => {
        await boot(undefined);

        const res = await request(app.getHttpServer()).get('/probe').set('X-Forwarded-For', '203.0.113.7');

        expect(res.body.ip).not.toBe('203.0.113.7');
        expect(res.body.ip).toMatch(/127\.0\.0\.1|::1/);
    });
});
