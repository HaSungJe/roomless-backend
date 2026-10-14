import {Body, Controller, ForbiddenException, Get, HttpCode, INestApplication, NotFoundException, Post, ValidationPipe} from '@nestjs/common';
import {Test} from '@nestjs/testing';
import {IsNotEmpty, MaxLength} from 'class-validator';
import request from 'supertest';
import {validationExceptionFactory} from '@app/common/utils/validation.js';
import {CustomErrorFilter} from '@app/common/exception/custom-error.filter.js';

/** 검증 경로 확인용 입력 DTO */
class FilterProbeDto {
    @MaxLength(10, {message: '닉네임은 10자 이하로 입력해주세요.'})
    @IsNotEmpty({message: '닉네임을 입력해주세요.'})
    nickname: string;
}

/** 필터 동작 확인용 컨트롤러 — 세 가지 실패 경로를 만든다 */
@Controller('/probe')
class FilterProbeController {
    /** 검증 통과 시 200 */
    @Post('/validate')
    @HttpCode(200)
    validate(@Body() dto: FilterProbeDto): {nickname: string} {
        return {nickname: dto.nickname};
    }

    /** service 가 던지는 비즈니스 예외 */
    @Get('/not-found')
    notFound(): never {
        throw new NotFoundException({message: '회원을 찾을 수 없습니다.'});
    }

    /** 처리되지 않은 예외 */
    @Get('/crash')
    crash(): never {
        throw new Error('Connection lost: mysql://user:pw@db');
    }
}

describe('CustomErrorFilter (HTTP 인바운드 어댑터)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const module = await Test.createTestingModule({controllers: [FilterProbeController]}).compile();
        app = module.createNestApplication();
        app.useGlobalFilters(new CustomErrorFilter());
        app.useGlobalPipes(new ValidationPipe({transform: true, forbidNonWhitelisted: true, exceptionFactory: validationExceptionFactory}));
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    it('[SUCCESS] 검증을 통과하면 핸들러 결과를 그대로 반환한다', async () => {
        const res = await request(app.getHttpServer()).post('/probe/validate').send({nickname: '룸리스'});

        expect(res.status).toBe(200);
        expect(res.body).toEqual({nickname: '룸리스'});
    });

    it('[FAIL:validation] 입력 오류는 400 + validation_errors 목록', async () => {
        const res = await request(app.getHttpServer()).post('/probe/validate').send({});

        expect(res.status).toBe(400);
        expect(res.body).toEqual({message: '닉네임을 입력해주세요.', validation_errors: [{property: 'nickname', message: '닉네임을 입력해주세요.'}]});
    });

    it('[FAIL:validation] 길이 초과는 maxLength 오류', async () => {
        const res = await request(app.getHttpServer()).post('/probe/validate').send({nickname: '열한글자가넘는닉네임입니다'});

        expect(res.status).toBe(400);
        expect(res.body).toEqual({message: '닉네임은 10자 이하로 입력해주세요.', validation_errors: [{property: 'nickname', message: '닉네임은 10자 이하로 입력해주세요.'}]});
    });

    it('[SUCCESS] whitelist 미설정이라 선언되지 않은 필드는 거르지 않는다 — forbidNonWhitelisted 는 whitelist:true 일 때만 동작', async () => {
        const res = await request(app.getHttpServer()).post('/probe/validate').send({nickname: '룸리스', extra: 1});

        expect(res.status).toBe(200);
        expect(res.body).toEqual({nickname: '룸리스'});
    });

    it('[FAIL:service] 비즈니스 예외는 상태 코드 유지 + validation_errors null', async () => {
        const res = await request(app.getHttpServer()).get('/probe/not-found');

        expect(res.status).toBe(404);
        expect(res.body).toEqual({message: '회원을 찾을 수 없습니다.', validation_errors: null});
    });

    it('[FAIL:unhandled] 처리되지 않은 예외는 500 + 공통 메시지, 내부 메시지 미노출', async () => {
        const res = await request(app.getHttpServer()).get('/probe/crash');

        expect(res.status).toBe(500);
        expect(res.body).toEqual({message: '요청이 실패했습니다. 관리자에게 문의해주세요.', validation_errors: null});
        expect(JSON.stringify(res.body)).not.toContain('mysql://');
    });
});

describe('InternalAuthGuard', () => {
    const original = process.env.INTERNAL_API_TOKEN;

    /**
     * 헤더만 가진 실행 컨텍스트.
     *
     * @param token x-internal-token 값
     * @returns 컨텍스트
     */
    const contextWith = (token?: string) => ({switchToHttp: () => ({getRequest: () => ({header: (name: string) => (name === 'x-internal-token' ? token : undefined)})})}) as never;

    afterEach(() => {
        process.env.INTERNAL_API_TOKEN = original;
    });

    it('[SUCCESS] 토큰이 같으면 통과', async () => {
        const {InternalAuthGuard} = await import('@app/common/internal/internal-auth.guard.js');
        process.env.INTERNAL_API_TOKEN = 'secret-token';

        expect(new InternalAuthGuard().canActivate(contextWith('secret-token'))).toBe(true);
    });

    it.each([
        ['토큰 없음', undefined, 'secret-token'],
        ['다른 토큰', 'secret-tokeN', 'secret-token'],
        ['길이가 다른 토큰', 'secret', 'secret-token'],
        ['서버에 토큰 미설정', 'anything', ''],
    ])('[FAIL] %s → 403 "내부 요청만 허용됩니다."', async (_label, received, expected) => {
        const {InternalAuthGuard} = await import('@app/common/internal/internal-auth.guard.js');
        process.env.INTERNAL_API_TOKEN = expected;

        expect(() => new InternalAuthGuard().canActivate(contextWith(received))).toThrow(ForbiddenException);
        try {
            new InternalAuthGuard().canActivate(contextWith(received));
        } catch (error) {
            expect((error as {getResponse: () => unknown}).getResponse()).toEqual({message: '내부 요청만 허용됩니다.'});
        }
    });
});
