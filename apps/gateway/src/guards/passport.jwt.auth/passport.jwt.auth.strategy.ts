import {Injectable} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import passportJwt from 'passport-jwt';
import type {UserAuthUserResultDto} from '@app/contracts/user/dto/user-auth-user.dto.js';
import {USER_INTERNAL_PATH} from '@app/contracts/user/user.commands.js';
import {InternalHttpClient} from '../../modules/transport/internal-http.client.js';
import {type AccessPayload, fetchLoginUser, jwtStrategyOptions} from './passport.jwt.auth.util.js';

const {Strategy} = passportJwt;

/**
 * 이용자 JWT 인증 전략(`jwt-user`) — 게이트웨이에서만 수행한다(서비스는 actor 를 신뢰).
 * 서명 · 만료 검증 후, 이용자 상태는 user-service 에 내부 HTTP 로 묻는다(이용자 그룹이 아니거나 로그인 불가 상태면 401).
 */
@Injectable()
export class PassportJwtAuthStrategy extends PassportStrategy(Strategy, 'jwt-user') {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {
        super(jwtStrategyOptions());
    }

    /**
     * 토큰 payload 로 로그인 이용자를 확인한다. 반환값이 `request.user` 가 된다.
     *
     * @param payload 검증된 JWT payload
     * @returns 로그인 이용자 정보
     * @throws UnauthorizedException access 토큰이 아니거나 로그인 가능 이용자가 아님
     */
    async validate(payload: AccessPayload): Promise<UserAuthUserResultDto> {
        return fetchLoginUser<UserAuthUserResultDto>(this.internalHttp, 'user', USER_INTERNAL_PATH.AUTH_USER, payload);
    }
}
