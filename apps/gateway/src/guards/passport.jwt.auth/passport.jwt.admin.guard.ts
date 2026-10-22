import {Injectable} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {passLoginUser} from './passport.jwt.auth.util.js';

/**
 * 관리자 JWT 인증 가드(`jwt-admin`) — 관리자 라우트(`/api/v1/admin-service/admin`)에 핸들러 단위로 붙인다.
 * 관리자 그룹(총관리자 · 관리자) 회원만 통과한다(다른 그룹 토큰은 admin-service 관리자 auth-user 에서 걸러져 401).
 */
@Injectable()
export class PassportJwtAdminAuthGuard extends AuthGuard('jwt-admin') {
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
