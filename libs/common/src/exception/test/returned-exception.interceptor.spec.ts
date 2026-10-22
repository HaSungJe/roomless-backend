import {BadRequestException, Controller, Get, HttpCode, INestApplication} from '@nestjs/common';
import {APP_INTERCEPTOR} from '@nestjs/core';
import {Test} from '@nestjs/testing';
import request from 'supertest';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';
import {ReturnedExceptionInterceptor} from '@app/common/exception/returned-exception.interceptor.js';
import {createValidationError} from '@app/common/utils/validation.js';

/** 불일치 메시지 — service 가 커밋 뒤 실패를 return 하는 대표 사례 */
const MISMATCH_MESSAGE = '인증번호가 일치하지 않습니다.';

/** 반환값만 다른 두 라우트 — 커밋 뒤 실패를 return 한 경우와 정상 반환 */
@Controller('/test')
class ReturnedProbeController {
    /**
     * 400 예외를 throw 하지 않고 반환한다.
     *
     * @returns 반환된 실패
     */
    @Get('/fail')
    @HttpCode(200)
    fail(): BadRequestException {
        return new BadRequestException({message: MISMATCH_MESSAGE, validation_errors: createValidationError('code', MISMATCH_MESSAGE)});
    }

    /**
     * 일반 값을 반환한다.
     *
     * @returns 결과
     */
    @Get('/ok')
    @HttpCode(200)
    ok(): {id: number} {
        return {id: 7};
    }
}

describe('ReturnedExceptionInterceptor — 내부 HTTP 에서 반환된 예외를 실패 응답으로', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const module = await Test.createTestingModule({controllers: [ReturnedProbeController], providers: [{provide: APP_INTERCEPTOR, useClass: ReturnedExceptionInterceptor}]}).compile();
        app = module.createNestApplication();
        app.useGlobalFilters(new CustomErrorFilter());
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it('[CASES:returned-exception] ⑤ 컨트롤러가 400 예외를 반환 → 400 + {message, validation_errors}', async () => {
        const res = await request(app.getHttpServer()).get('/test/fail');

        expect(res.status).toBe(400);
        expect(res.body).toEqual({message: MISMATCH_MESSAGE, validation_errors: [{property: 'code', message: MISMATCH_MESSAGE}]});
    });

    it('[CASES:returned-exception] ⑥ 일반 값을 반환 → 200 그대로', async () => {
        const res = await request(app.getHttpServer()).get('/test/ok');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({id: 7});
    });
});
