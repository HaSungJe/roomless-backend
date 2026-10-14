import {ExecutionContext, ForbiddenException, HttpException, UnauthorizedException} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import type {InternalHttpClient} from '../../modules/transport/internal-http.client.js';
import {PassportJwtAuthGuard} from '../passport.jwt.auth/passport.jwt.auth.guard.js';
import {PassportJwtAuthStrategy} from '../passport.jwt.auth/passport.jwt.auth.strategy.js';
import {RolesGuard} from '../roles/roles.guard.js';

const LOGIN_USER = {user_id: 'u'.repeat(32), auth_id: 'MANAGER'};

/**
 * 핸들러 · 요청 회원만 가진 실행 컨텍스트.
 *
 * @param user request.user
 * @returns 컨텍스트
 */
function contextWith(user: unknown): ExecutionContext {
    return {getHandler: () => () => undefined, getClass: () => class {}, switchToHttp: () => ({getRequest: () => ({user})})} as unknown as ExecutionContext;
}

describe('PassportJwtAuthStrategy.validate', () => {
    process.env.JWT_SECRET = 'test-secret';

    it('[SUCCESS] access 토큰이면 user-service 에 로그인 회원을 물어 request.user 로 돌려준다', async () => {
        const internalHttp = {request: vi.fn().mockResolvedValue(LOGIN_USER)} as unknown as InternalHttpClient;

        const user = await new PassportJwtAuthStrategy(internalHttp).validate({type: 'access', user_id: LOGIN_USER.user_id, session_id: 's'});

        expect(user).toEqual(LOGIN_USER);
        expect(internalHttp.request).toHaveBeenCalledWith('user', 'GET', `/internal/v1/user/auth-user/${LOGIN_USER.user_id}`);
    });

    it.each([
        ['refresh 토큰', {type: 'refresh', user_id: 'u'}],
        ['user_id 없음', {type: 'access'}],
    ])('[FAIL] %s 는 조회 없이 401', async (_label, payload) => {
        const internalHttp = {request: vi.fn()} as unknown as InternalHttpClient;

        await expect(new PassportJwtAuthStrategy(internalHttp).validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
        expect(internalHttp.request).not.toHaveBeenCalled();
    });

    it('[FAIL] user-service 가 404(로그인 불가)면 401 "로그인 정보가 유효하지 않습니다."', async () => {
        const internalHttp = {request: vi.fn().mockRejectedValue(new HttpException({message: '로그인 정보를 찾을 수 없습니다.'}, 404))} as unknown as InternalHttpClient;

        const error = await new PassportJwtAuthStrategy(internalHttp).validate({type: 'access', user_id: 'u'}).catch((e: unknown) => e);

        expect((error as UnauthorizedException).getResponse()).toEqual({message: '로그인 정보가 유효하지 않습니다.'});
    });
});

describe('PassportJwtAuthGuard.handleRequest', () => {
    const guard = new PassportJwtAuthGuard();

    it('회원이 있으면 그대로 돌려준다', () => {
        expect(guard.handleRequest(null, LOGIN_USER)).toBe(LOGIN_USER);
    });

    it.each([
        ['회원 없음', null, false],
        ['전략 오류', new Error('jwt malformed'), LOGIN_USER],
    ])('%s → 한국어 401', (_label, error, user) => {
        try {
            guard.handleRequest(error, user as never);
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(UnauthorizedException);
            expect((e as UnauthorizedException).getResponse()).toEqual({message: '로그인 정보가 유효하지 않습니다.'});
        }
    });
});

describe('RolesGuard', () => {
    it('@Roles 가 없으면 통과', () => {
        const reflector = {getAllAndOverride: vi.fn().mockReturnValue(undefined)} as unknown as Reflector;

        expect(new RolesGuard(reflector).canActivate(contextWith(LOGIN_USER))).toBe(true);
    });

    it('허용 권한에 있으면 통과', () => {
        const reflector = {getAllAndOverride: vi.fn().mockReturnValue(['ADMIN', 'MANAGER'])} as unknown as Reflector;

        expect(new RolesGuard(reflector).canActivate(contextWith(LOGIN_USER))).toBe(true);
    });

    it('허용 권한에 없으면 403 "접근 권한이 없습니다."', () => {
        const reflector = {getAllAndOverride: vi.fn().mockReturnValue(['SUPER_ADMIN', 'ADMIN'])} as unknown as Reflector;

        try {
            new RolesGuard(reflector).canActivate(contextWith(LOGIN_USER));
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(ForbiddenException);
            expect((e as ForbiddenException).getResponse()).toEqual({message: '접근 권한이 없습니다.'});
        }
    });
});
