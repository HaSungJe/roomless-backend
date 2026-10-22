import {Body, Controller, HttpCode, Ip, Post} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiForbiddenResponse,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import {ADMIN_INTERNAL_PATH} from '@app/contracts/admin/admin.commands.js';
import {AdminLoginDto, AdminLoginResultDto} from '@app/contracts/admin/dto/admin-login.dto.js';
import {AdminTokenRefreshDto, AdminTokenRefreshResultDto} from '@app/contracts/admin/dto/admin-token-refresh.dto.js';
import {InternalHttpClient} from '../../../../modules/transport/internal-http.client.js';

/**
 * 관리자 그룹(총관리자 · 관리자) 공개 API — 동기 경로(내부 HTTP → admin-service 관리자 도메인). 로그인 · 토큰 재발급.
 * 큐 경로(비밀번호 변경)는 같은 경로 접두의 admin.controller.queue.ts(AdminQueueController)에 둔다.
 */
@ApiTags('관리자')
@Controller('/api/v1/admin')
export class AdminController {
    /**
     * @param internalHttp 동기 경로 — admin-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 관리자 로그인 — 총관리자 · 관리자 계정만(다른 그룹은 없는 계정과 같은 404)
     */
    @Post('/login')
    @HttpCode(200)
    @ApiOperation({summary: '관리자 로그인'})
    @ApiBody({type: AdminLoginDto})
    @ApiOkResponse({type: AdminLoginResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async login(@Body() dto: AdminLoginDto, @Ip() ip: string): Promise<AdminLoginResultDto> {
        return this.internalHttp.request<AdminLoginResultDto>('admin', 'POST', ADMIN_INTERNAL_PATH.LOGIN, {body: dto, client_ip: ip});
    }

    /**
     * 관리자 토큰 재발급 — 관리자 그룹 회원만(다른 그룹은 401)
     */
    @Post('/token-refresh')
    @HttpCode(200)
    @ApiOperation({summary: '관리자 토큰 재발급'})
    @ApiBody({type: AdminTokenRefreshDto})
    @ApiOkResponse({type: AdminTokenRefreshResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async tokenRefresh(@Body() dto: AdminTokenRefreshDto, @Ip() ip: string): Promise<AdminTokenRefreshResultDto> {
        return this.internalHttp.request<AdminTokenRefreshResultDto>('admin', 'POST', ADMIN_INTERNAL_PATH.TOKEN_REFRESH, {body: dto, client_ip: ip});
    }
}
