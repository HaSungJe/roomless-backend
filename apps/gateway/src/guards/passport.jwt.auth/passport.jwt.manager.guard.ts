import {Injectable} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {passLoginUser} from './passport.jwt.auth.util.js';

/**
 * 매니저 JWT 인증 가드(`jwt-manager`) — 매니저 라우트(`/api/v1/manager`)에 핸들러 단위로 붙인다.
 * 매니저 그룹(총매니저 · 매니저) 회원만 통과한다(다른 그룹 토큰은 admin-service 매니저 auth-user 에서 걸러져 401).
 */
@Injectable()
export class PassportJwtManagerAuthGuard extends AuthGuard('jwt-manager') {
    /**
     * 전략 결과를 받아 회원을 돌려주거나 401 을 던진다.
     *
     * @param error 전략 오류
     * @param user 전략이 돌려준 회원
     * @returns 회원
     */
    handleRequest<TUser>(error: unknown, user: TUser | false): TUser {
        return passLoginUser(error, user);
    }
}
