import { ExecutionContext } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { of } from 'rxjs';
import { ApiLogEntity } from '../api-log.entity';
import { ApiLogInterceptor } from '../api-log.interceptor';

/**
 * ExecutionContext + req/res 모킹 헬퍼
 *
 * - res.send(body) → capturedBody 저장 후 finish 이벤트 발동 시뮬레이션
 * - listeners 객체에 res.on(event, handler) 등록된 핸들러를 보관 → 테스트에서 trigger
 * - controllerPath / handlerPath 옵션으로 NestJS 라우트 메타데이터 모킹
 */
function buildMocks(
    reqOverrides: any = {},
    resOverrides: any = {},
    routeOverrides: {controllerPath?: string | null; handlerPath?: string | null} = {},
) {
    const listeners: Record<string, Function[]> = {};
    const req: any = {
        method: 'GET',
        originalUrl: '/api/v1/dept',
        url: '/api/v1/dept',
        params: {},
        query: {},
        body: {},
        ip: '127.0.0.1',
        socket: {remoteAddress: '127.0.0.1'},
        headers: {'user-agent': 'jest-test', 'content-type': 'application/json'},
        user: {user_id: 'u-1'},
        ...reqOverrides,
    };
    const res: any = {
        statusCode: 200,
        send: jest.fn(),
        on: jest.fn().mockImplementation((event: string, handler: Function) => {
            (listeners[event] = listeners[event] || []).push(handler);
        }),
        ...resOverrides,
    };

    // 라우트 메타데이터 모킹 (기본: /api/v1/dept 컨트롤러, 빈 핸들러)
    const controllerPath = routeOverrides.controllerPath === undefined ? '/api/v1/dept' : routeOverrides.controllerPath;
    const handlerPath = routeOverrides.handlerPath === undefined ? '/' : routeOverrides.handlerPath;
    class FakeController {}
    const fakeHandler = function fakeHandler() {};
    if (controllerPath !== null) Reflect.defineMetadata(PATH_METADATA, controllerPath, FakeController);
    if (handlerPath !== null) Reflect.defineMetadata(PATH_METADATA, handlerPath, fakeHandler);

    const context: ExecutionContext = {
        getType: () => 'http',
        switchToHttp: () => ({
            getRequest: () => req,
            getResponse: () => res,
        }),
        getHandler: () => fakeHandler,
        getClass: () => FakeController,
    } as any;

    return {req, res, context, listeners};
}

const flushPromises = () => new Promise((r) => setImmediate(r));

describe('ApiLogInterceptor', () => {
    let mockRepo: {insert: jest.Mock};
    let interceptor: ApiLogInterceptor;

    beforeEach(() => {
        mockRepo = {insert: jest.fn().mockResolvedValue(undefined)};
        interceptor = new ApiLogInterceptor(mockRepo);
    });

    it('[SUCCESS] 정상 응답 — finish 이벤트 시 ApiLogEntity 가 컬럼 값과 함께 insert 됨', async () => {
        const {req: _req, res, context, listeners} = buildMocks(
            {
                method: 'POST',
                originalUrl: '/api/v1/dept?x=1',
                params: {dept_id: 'd-1'},
                query: {x: '1'},
                body: {dept_name: '개발'},
            },
            {},
            {controllerPath: '/api/v1/dept', handlerPath: '/'},
        );

        const next = {handle: () => of({result: 'ok'})};
        await interceptor.intercept(context, next as any).subscribe();

        // 컨트롤러가 응답을 보낸다고 가정
        res.statusCode = 201;
        res.send({result: 'ok'});

        // finish 이벤트 발동
        listeners['finish'][0]();
        await flushPromises();

        expect(mockRepo.insert).toHaveBeenCalledTimes(1);
        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity).toBeInstanceOf(ApiLogEntity);
        expect(entity.method).toBe('POST');
        expect(entity.path).toBe('/api/v1/dept'); // 라우트 패턴 (controllerPath + handlerPath 정규화)
        expect(entity.request_param).toEqual({dept_id: 'd-1'});
        expect(entity.request_query).toEqual({x: '1'});
        expect(entity.request_body).toEqual({dept_name: '개발'});
        expect(entity.status_code).toBe(201);
        expect(entity.response_body).toEqual({result: 'ok'});
        expect(entity.error_stack).toBeNull();
        expect(entity.user_id).toBe('u-1');
        expect(entity.ip).toBe('127.0.0.1');
        expect(entity.user_agent).toBe('jest-test');
        expect(typeof entity.duration_ms).toBe('number');
    });

    it('[SUCCESS] path — 라우트 패턴(:user_id)을 그대로 저장 (실제 ID 값으로 치환되지 않음)', async () => {
        const {res, context, listeners} = buildMocks(
            {
                method: 'PATCH',
                originalUrl: '/api/v1/user/admin/ec2a62b608424c678e72829b0015f034/password',
                params: {user_id: 'ec2a62b608424c678e72829b0015f034'},
                body: {new_password: 'X'},
            },
            {},
            {controllerPath: '/api/v1/user', handlerPath: '/admin/:user_id/password'},
        );

        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.statusCode = 204;
        res.send('');
        listeners['finish'][0]();
        await flushPromises();

        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity.path).toBe('/api/v1/user/admin/:user_id/password');
        // 실제 ID 값은 request_param 으로만 보존
        expect(entity.request_param).toEqual({user_id: 'ec2a62b608424c678e72829b0015f034'});
    });

    it('[SUCCESS] path — 메타데이터 누락 시 originalUrl 로 fallback', async () => {
        const {res, context, listeners} = buildMocks(
            {
                method: 'GET',
                originalUrl: '/api/v1/foo/bar?x=1',
            },
            {},
            {controllerPath: null, handlerPath: null},
        );

        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.send('');
        listeners['finish'][0]();
        await flushPromises();

        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity.path).toBe('/api/v1/foo/bar'); // query string 제거된 originalUrl
    });

    it('[SUCCESS] 빈 객체는 null 로 정규화 (params/query/body)', async () => {
        const {res, context, listeners} = buildMocks();

        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.send('');
        listeners['finish'][0]();
        await flushPromises();

        expect(mockRepo.insert).toHaveBeenCalledTimes(1);
        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity.request_param).toBeNull();
        expect(entity.request_query).toBeNull();
        expect(entity.request_body).toBeNull();
        expect(entity.response_body).toBeNull();
    });

    it('[SUCCESS] 5xx 에러 — req.__apiLogErrorStack 이 entity.error_stack 으로 전달', async () => {
        const {req, res, context, listeners} = buildMocks();
        req.__apiLogErrorStack = 'Error: boom\n    at handler (foo.ts:10:5)';

        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.statusCode = 500;
        res.send({message: 'Internal server error'});
        listeners['finish'][0]();
        await flushPromises();

        expect(mockRepo.insert).toHaveBeenCalledTimes(1);
        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity.status_code).toBe(500);
        expect(entity.error_stack).toBe('Error: boom\n    at handler (foo.ts:10:5)');
        expect(entity.response_body).toEqual({message: 'Internal server error'});
    });

    it('[SUCCESS] multipart/form-data — 파일은 메타만 저장, 텍스트 필드는 그대로', async () => {
        const {res, context, listeners} = buildMocks({
            method: 'POST',
            headers: {'user-agent': 'jest-test', 'content-type': 'multipart/form-data; boundary=----x'},
            body: {title: '제목'},
            file: {fieldname: 'cover', originalname: 'a.png', mimetype: 'image/png', size: 1234},
        });

        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.send({ok: true});
        listeners['finish'][0]();
        await flushPromises();

        expect(mockRepo.insert).toHaveBeenCalledTimes(1);
        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity.request_body).toEqual({
            fields: {title: '제목'},
            files: [{fieldname: 'cover', originalname: 'a.png', mimetype: 'image/png', size: 1234}],
        });
    });

    it('[SUCCESS] multipart/form-data — req.files (배열) 인 경우도 메타 추출', async () => {
        const {res, context, listeners} = buildMocks({
            method: 'POST',
            headers: {'user-agent': 'jest-test', 'content-type': 'multipart/form-data; boundary=----x'},
            body: {},
            files: [
                {fieldname: 'images', originalname: 'a.png', mimetype: 'image/png', size: 100},
                {fieldname: 'images', originalname: 'b.jpg', mimetype: 'image/jpeg', size: 200},
            ],
        });

        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.send('');
        listeners['finish'][0]();
        await flushPromises();

        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity.request_body.files).toHaveLength(2);
        expect(entity.request_body.files[0].originalname).toBe('a.png');
        expect(entity.request_body.files[1].originalname).toBe('b.jpg');
    });

    it('[SUCCESS] response_body — Buffer 는 type/size 메타로 변환', async () => {
        const {res, context, listeners} = buildMocks();
        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.send(Buffer.from('hello'));
        listeners['finish'][0]();
        await flushPromises();

        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity.response_body).toEqual({type: 'Buffer', size: 5});
    });

    it('[SUCCESS] response_body — JSON 문자열은 객체로 파싱', async () => {
        const {res, context, listeners} = buildMocks();
        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.send(JSON.stringify({a: 1}));
        listeners['finish'][0]();
        await flushPromises();

        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity.response_body).toEqual({a: 1});
    });

    it('[SUCCESS] finish/close 둘 다 발동해도 한 번만 insert', async () => {
        const {res, context, listeners} = buildMocks();
        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.send('ok');
        listeners['finish'][0]();
        listeners['close'][0]();
        await flushPromises();

        expect(mockRepo.insert).toHaveBeenCalledTimes(1);
    });

    it('[SUCCESS] HTTP 외 컨텍스트는 인터셉터 스킵', async () => {
        const next = {handle: () => of('skipped')};
        const context = {getType: () => 'rpc'} as any;

        await interceptor.intercept(context, next).subscribe();
        await flushPromises();

        expect(mockRepo.insert).not.toHaveBeenCalled();
    });

    it('[SUCCESS] insert 실패해도 응답 흐름에 영향 없음 (예외 전파 안 됨)', async () => {
        mockRepo.insert.mockRejectedValue(new Error('db down'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const {res, context, listeners} = buildMocks();
        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.send('ok');
        // finish 핸들러 실행 시 unhandled rejection 이 발생하지 않아야 함
        await expect(Promise.resolve(listeners['finish'][0]())).resolves.toBeUndefined();
        await flushPromises();

        expect(mockRepo.insert).toHaveBeenCalledTimes(1);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('[SUCCESS] user 정보 없을 때 user_id null', async () => {
        const {req, res, context, listeners} = buildMocks();
        delete req.user;

        const next = {handle: () => of(null)};
        await interceptor.intercept(context, next as any).subscribe();

        res.send('ok');
        listeners['finish'][0]();
        await flushPromises();

        const entity: ApiLogEntity = mockRepo.insert.mock.calls[0][0];
        expect(entity.user_id).toBeNull();
    });
});
