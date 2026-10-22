import {Body, Controller, Get, HttpCode, Param, Post} from '@nestjs/common';
import {ClientIp} from '@app/common/internal/internal-request.decorator.js';
import {AdminAuthUserParamDto, AdminAuthUserResultDto} from '@app/contracts/admin/dto/admin-auth-user.dto.js';
import {AdminLoginDto, AdminLoginResultDto} from '@app/contracts/admin/dto/admin-login.dto.js';
import {AdminTokenRefreshDto, AdminTokenRefreshResultDto} from '@app/contracts/admin/dto/admin-token-refresh.dto.js';
import {AdminService} from '../admin.service.js';

/**
 * 관리자 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로만 받는다(외부 비공개, Swagger 없음).
 * 내부 토큰 검사는 admin-service 전역 InternalAuthGuard(APP_GUARD)가 한다 — 게이트웨이를 거치지 않은 요청은 여기 닿지 않는다.
 */
@Controller('/internal/v1/admin-service/admin')
export class AdminController {
    /**
     * @param adminService 관리자 service
     */
    constructor(private readonly adminService: AdminService) {}

    /**
     * 관리자 로그인
     */
    @Post('/login')
    @HttpCode(200)
    async login(@Body() dto: AdminLoginDto, @ClientIp() ip: string): Promise<AdminLoginResultDto> {
        return this.adminService.login(dto, ip);
    }

    /**
     * 관리자 토큰 재발급
     */
    @Post('/token-refresh')
    @HttpCode(200)
    async tokenRefresh(@Body() dto: AdminTokenRefreshDto, @ClientIp() ip: string): Promise<AdminTokenRefreshResultDto> {
        return this.adminService.tokenRefresh(dto, ip);
    }

    /**
     * 로그인 관리자 조회 (게이트웨이 jwt-admin 전략 전용)
     */
    @Get('/auth-user/:user_id')
    @HttpCode(200)
    async authUser(@Param() param: AdminAuthUserParamDto): Promise<AdminAuthUserResultDto> {
        return this.adminService.getLoginAdmin(param.user_id);
    }
}
