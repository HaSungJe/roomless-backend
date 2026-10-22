import {Injectable} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import passportJwt from 'passport-jwt';
import type {ManagerAuthUserResultDto} from '@app/contracts/manager/dto/manager-auth-user.dto.js';
import {MANAGER_INTERNAL_PATH} from '@app/contracts/manager/manager.commands.js';
import {InternalHttpClient} from '../../modules/transport/internal-http.client.js';
import {type AccessPayload, fetchLoginUser, jwtStrategyOptions} from './passport.jwt.auth.util.js';

const {Strategy} = passportJwt;

/**
 * 매니저 JWT 인증 전략(`jwt-manager`) — 서명 · 만료 검증 후, 매니저 상태는 admin-service 에 내부 HTTP 로 묻는다
 * (매니저 그룹이 아니거나 로그인 불가 상태면 401).
 */
@Injectable()
export class PassportJwtManagerAuthStrategy extends PassportStrategy(Strategy, 'jwt-manager') {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {
        super(jwtStrategyOptions());
    }

    /**
     * 토큰 payload 로 로그인 매니저를 확인한다. 반환값이 `request.user` 가 된다.
     *
     * @param payload 검증된 JWT payload
     * @returns 로그인 매니저 정보
     * @throws UnauthorizedException access 토큰이 아니거나 로그인 가능 매니저가 아님
     */
    async validate(payload: AccessPayload): Promise<ManagerAuthUserResultDto> {
        return fetchLoginUser<ManagerAuthUserResultDto>(this.internalHttp, 'admin', MANAGER_INTERNAL_PATH.AUTH_USER, payload);
    }
}
