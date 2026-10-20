import {Body, Controller, Get, HttpCode, Param, Post} from '@nestjs/common';
import {ClientIp} from '@app/common/internal/internal-request.decorator.js';
import {UserAuthUserParamDto, UserAuthUserResultDto} from '@app/contracts/user/dto/user-auth-user.dto.js';
import {UserGeneralLoginDto, UserGeneralLoginResultDto} from '@app/contracts/user/dto/user-general-login.dto.js';
import {UserLoginDto, UserLoginResultDto} from '@app/contracts/user/dto/user-login.dto.js';
import {UserTokenRefreshDto, UserTokenRefreshResultDto} from '@app/contracts/user/dto/user-token-refresh.dto.js';
import {UserService} from '../user.service.js';

/**
 * 회원 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로만 받는다(외부 비공개, Swagger 없음).
 * 내부 토큰 검사는 user-service 전역 InternalAuthGuard(APP_GUARD)가 한다 — 게이트웨이를 거치지 않은 요청은 여기 닿지 않는다.
 */
@Controller('/internal/v1/user')
export class UserController {
    /**
     * @param userService 회원 service
     */
    constructor(private readonly userService: UserService) {}

    /**
     * SNS 로그인
     */
    @Post('/login')
    @HttpCode(200)
    async login(@Body() dto: UserLoginDto, @ClientIp() ip: string): Promise<UserLoginResultDto> {
        return this.userService.login(dto, ip);
    }

    /**
     * 일반 로그인
     */
    @Post('/general-login')
    @HttpCode(200)
    async generalLogin(@Body() dto: UserGeneralLoginDto, @ClientIp() ip: string): Promise<UserGeneralLoginResultDto> {
        return this.userService.generalLogin(dto, ip);
    }

    /**
     * 로그인 토큰 재발급
     */
    @Post('/token-refresh')
    @HttpCode(200)
    async tokenRefresh(@Body() dto: UserTokenRefreshDto, @ClientIp() ip: string): Promise<UserTokenRefreshResultDto> {
        return this.userService.tokenRefresh(dto, ip);
    }

    /**
     * 로그인 회원 조회 (게이트웨이 JWT 전략 전용)
     */
    @Get('/auth-user/:user_id')
    @HttpCode(200)
    async authUser(@Param() param: UserAuthUserParamDto): Promise<UserAuthUserResultDto> {
        return this.userService.getLoginUser(param.user_id);
    }
}
