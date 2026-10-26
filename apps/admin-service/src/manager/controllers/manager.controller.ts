import {Body, Controller, Get, HttpCode, Param, Post, Query} from '@nestjs/common';
import {ClientIp, InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {ManagerAuthUserParamDto, ManagerAuthUserResultDto} from '@app/contracts/manager/dto/manager-auth-user.dto.js';
import {ManagerLoginDto, ManagerLoginResultDto} from '@app/contracts/manager/dto/manager-login.dto.js';
import {ManagerStaffDetailParamDto, ManagerStaffDetailResultDto} from '@app/contracts/manager/dto/manager-staff-detail.dto.js';
import {ManagerStaffListDto, ManagerStaffListResultDto} from '@app/contracts/manager/dto/manager-staff-list.dto.js';
import {ManagerTokenRefreshDto, ManagerTokenRefreshResultDto} from '@app/contracts/manager/dto/manager-token-refresh.dto.js';
import {ManagerService} from '../manager.service.js';

/**
 * 매니저 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로만 받는다(외부 비공개, Swagger 없음).
 * 내부 토큰 검사는 admin-service 전역 InternalAuthGuard(APP_GUARD)가 한다 — 게이트웨이를 거치지 않은 요청은 여기 닿지 않는다.
 */
@Controller('/internal/v1/admin-service/manager')
export class ManagerController {
    /**
     * @param managerService 매니저 service
     */
    constructor(private readonly managerService: ManagerService) {}

    /**
     * 매니저 로그인
     */
    @Post('/login')
    @HttpCode(200)
    async login(@Body() dto: ManagerLoginDto, @ClientIp() ip: string): Promise<ManagerLoginResultDto> {
        return this.managerService.login(dto, ip);
    }

    /**
     * 매니저 토큰 재발급
     */
    @Post('/token-refresh')
    @HttpCode(200)
    async tokenRefresh(@Body() dto: ManagerTokenRefreshDto, @ClientIp() ip: string): Promise<ManagerTokenRefreshResultDto> {
        return this.managerService.tokenRefresh(dto, ip);
    }

    /**
     * 로그인 매니저 조회 (게이트웨이 jwt-manager 전략 전용)
     */
    @Get('/auth-user/:user_id')
    @HttpCode(200)
    async authUser(@Param() param: ManagerAuthUserParamDto): Promise<ManagerAuthUserResultDto> {
        return this.managerService.getLoginManager(param.user_id);
    }

    /**
     * 업체 관리자 목록 (업체 총관리자)
     */
    @Get('/staff')
    @HttpCode(200)
    async getStaffList(@InternalActor('user_id') user_id: string, @Query() query: ManagerStaffListDto): Promise<ManagerStaffListResultDto> {
        const dto = new ManagerStaffListDto(query);
        return this.managerService.getStaffList(user_id, dto);
    }

    /**
     * 업체 관리자 상세 (업체 총관리자)
     */
    @Get('/staff/:user_id')
    @HttpCode(200)
    async getStaff(@InternalActor('user_id') user_id: string, @Param() param: ManagerStaffDetailParamDto): Promise<ManagerStaffDetailResultDto> {
        return this.managerService.getStaff(user_id, param.user_id);
    }
}
