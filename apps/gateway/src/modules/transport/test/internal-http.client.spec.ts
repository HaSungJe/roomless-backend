import {HttpException, ServiceUnavailableException} from '@nestjs/common';
import {InternalHttpClient} from '../internal-http.client.js';
import {formatSseEvent} from '../transport.util.js';

describe('InternalHttpClient — 게이트웨이 → 서비스 내부 HTTP', () => {
    const client = new InternalHttpClient();
    const env = {USER_SERVICE_URL: process.env.USER_SERVICE_URL, INTERNAL_API_TOKEN: process.env.INTERNAL_API_TOKEN};
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        process.env.USER_SERVICE_URL = 'http://user-service:4001';
        process.env.INTERNAL_API_TOKEN = 'secret';
        fetchSpy = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
        process.env.USER_SERVICE_URL = env.USER_SERVICE_URL;
        process.env.INTERNAL_API_TOKEN = env.INTERNAL_API_TOKEN;
        fetchSpy.mockRestore();
    });

    it('[SUCCESS] 내부 토큰 · actor · 클라이언트 IP 헤더와 JSON 본문을 붙여 호출하고 JSON 을 돌려준다', async () => {
        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ok: 1}), {status: 200}));

        const result = await client.request('user', 'POST', '/internal/v1/user-service/user/login', {body: {a: 1}, actor: {user_id: 'u', auth_id: 'USER'}, client_ip: '1.2.3.4'});

        expect(result).toEqual({ok: 1});
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('http://user-service:4001/internal/v1/user-service/user/login');
        expect(init.method).toBe('POST');
        expect(init.body).toBe('{"a":1}');
        expect(init.headers).toEqual({'content-type': 'application/json', 'x-internal-token': 'secret', 'x-actor-user-id': 'u', 'x-actor-auth-id': 'USER', 'x-client-ip': '1.2.3.4'});
        expect(init.signal).toBeInstanceOf(AbortSignal);
    });

    it('[SUCCESS] 204 는 undefined, 본문 없는 GET 은 body 없이 보낸다', async () => {
        fetchSpy.mockResolvedValueOnce(new Response(null, {status: 204}));

        await expect(client.request('user', 'GET', '/x')).resolves.toBeUndefined();
        expect((fetchSpy.mock.calls[0][1] as RequestInit).body).toBeUndefined();
        expect((fetchSpy.mock.calls[0][1] as RequestInit).headers).toEqual({'content-type': 'application/json', 'x-internal-token': 'secret'});
    });

    it('[FAIL:service] 서비스의 실패 응답을 같은 상태 코드 · 본문의 HttpException 으로 되던진다', async () => {
        fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({message: '잘못된 로그인 정보입니다.', validation_errors: null}), {status: 404}));

        const error = await client.request('user', 'POST', '/x').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(HttpException);
        expect((error as HttpException).getStatus()).toBe(404);
        expect((error as HttpException).getResponse()).toEqual({message: '잘못된 로그인 정보입니다.', validation_errors: null});
    });

    it('[FAIL:service] JSON 이 아닌 실패 본문은 message 로 감싼다', async () => {
        fetchSpy.mockResolvedValueOnce(new Response('Bad Gateway', {status: 502}));

        const error = (await client.request('user', 'GET', '/x').catch((e: unknown) => e)) as HttpException;

        expect(error.getStatus()).toBe(502);
        expect(error.getResponse()).toEqual({message: 'Bad Gateway'});
    });

    it('[FAIL:network] 접속 실패 · 타임아웃은 503 "일시적으로 서비스를 이용할 수 없습니다."', async () => {
        fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

        const error = await client.request('user', 'GET', '/x').catch((e: unknown) => e);

        expect(error).toBeInstanceOf(ServiceUnavailableException);
        expect((error as ServiceUnavailableException).getResponse()).toEqual({message: '일시적으로 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.'});
    });

    it('USER_SERVICE_URL 이 없으면 http://localhost:4001', async () => {
        delete process.env.USER_SERVICE_URL;
        fetchSpy.mockResolvedValueOnce(new Response('{}', {status: 200}));

        await client.request('user', 'GET', '/y');

        expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:4001/y');
    });
});

describe('transport.util', () => {
    it('formatSseEvent — event/data 두 줄 + 빈 줄', () => {
        expect(formatSseEvent('done', {a: '한글'})).toBe('event: done\ndata: {"a":"한글"}\n\n');
        expect(formatSseEvent('done', undefined)).toBe('event: done\ndata: null\n\n');
    });
});
