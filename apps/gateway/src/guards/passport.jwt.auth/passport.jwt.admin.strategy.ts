import {Injectable} from '@nestjs/common';
import {PassportStrategy} from '@nestjs/passport';
import passportJwt from 'passport-jwt';
import {ADMIN_INTERNAL_PATH} from '@app/contracts/admin/admin.commands.js';
import type {AdminAuthUserResultDto} from '@app/contracts/admin/dto/admin-auth-user.dto.js';
import {InternalHttpClient} from '../../modules/transport/internal-http.client.js';
import {type AccessPayload, fetchLoginUser, jwtStrategyOptions} from './passport.jwt.auth.util.js';

const {Strategy} = passportJwt;

/**
 * 관리자 JWT 인증 전략(`jwt-admin`) — 서명 · 만료 검증 후, 관리자 상태는 admin-service 에 내부 HTTP 로 묻는다
 * (관리자 그룹이 아니거나 로그인 불가 상태면 401).
 */
@Injectable()
export class PassportJwtAdminAuthStrategy extends PassportStrategy(Strategy, 'jwt-admin') {
    /**
     * @param internalHttp 내부 HTTP 클라이언트
     */
    constructor(private readonly internalHttp: InternalHttpClient) {
        super(jwtStrategyOptions());
    }

    /**
     * 토큰 payload 로 로그인 관리자를 확인한다. 반환값이 `request.user` 가 된다.
     *
     * @param payload 검증된 JWT payload
     * @returns 로그인 관리자 정보
     * @throws UnauthorizedException access 토큰이 아니거나 로그인 가능 관리자가 아님
     */
    async validate(payload: AccessPayload): Promise<AdminAuthUserResultDto> {
        return fetchLoginUser<AdminAuthUserResultDto>(this.internalHttp, 'admin', ADMIN_INTERNAL_PATH.AUTH_USER, payload);
    }
}
