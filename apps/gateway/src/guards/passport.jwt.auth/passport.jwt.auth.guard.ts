import {Injectable} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {passLoginUser} from './passport.jwt.auth.util.js';

/**
 * 이용자 JWT 인증 가드(`jwt-user`) — 이용자 라우트(`/api/v1/user-service/user`)에 핸들러 단위로 붙인다.
 * 이용자 그룹 회원만 통과한다(매니저 · 관리자 토큰은 user-service auth-user 에서 걸러져 401).
 */
@Injectable()
export class PassportJwtAuthGuard extends AuthGuard('jwt-user') {
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
