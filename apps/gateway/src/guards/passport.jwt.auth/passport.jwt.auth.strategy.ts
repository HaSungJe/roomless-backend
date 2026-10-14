import {Injectable, UnauthorizedException} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import passportJwt from 'passport-jwt';
import type {UserAuthUserResultDto} from '@app/contracts/user/dto/user-auth-user.dto.js';
import {USER_INTERNAL_PATH} from '@app/contracts/user/user.commands.js';
import {InternalHttpClient} from '../../modules/transport/internal-http.client.js';
import {AUTH_INVALID_MESSAGE} from './passport.jwt.auth.guard.js';

const {ExtractJwt, Strategy} = passportJwt;

/** access token payload */
interface AccessPayload {
    type?: string;
    user_id?: string;
    session_id?: string;
}

/**
 * JWT 인증 전략 — 게이트웨이에서만 수행한다(서비스는 actor 를 신뢰).
 * 서명 · 만료 검증 후, 회원 상태는 DB 를 소유한 user-service 에 내부 HTTP 로 묻는다(로그인 불가 상태면 401).
 */
@Injectable()
export class PassportJwtAuthStrategy extends PassportStrategy(Strategy, 'jwt-user') {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {
        super({jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: process.env.JWT_SECRET || '', ignoreExpiration: process.env.NODE_ENV === 'development'});
    }

    /**
     * 토큰 payload 로 로그인 회원을 확인한다. 반환값이 `request.user` 가 된다.
     *
     * @param payload 검증된 JWT payload
     * @returns 로그인 회원 정보
     * @throws UnauthorizedException access 토큰이 아니거나 로그인 불가 회원
     */
    async validate(payload: AccessPayload): Promise<UserAuthUserResultDto> {
        if (payload?.type !== 'access' || !payload.user_id) {
            throw new UnauthorizedException({message: AUTH_INVALID_MESSAGE});
        }
        try {
            return await this.internalHttp.request<UserAuthUserResultDto>('user', 'GET', `${USER_INTERNAL_PATH.AUTH_USER}/${encodeURIComponent(payload.user_id)}`);
        } catch {
            throw new UnauthorizedException({message: AUTH_INVALID_MESSAGE});
        }
    }
}
