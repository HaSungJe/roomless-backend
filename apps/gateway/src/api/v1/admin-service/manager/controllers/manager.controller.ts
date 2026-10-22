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
import {ManagerLoginDto, ManagerLoginResultDto} from '@app/contracts/manager/dto/manager-login.dto.js';
import {ManagerTokenRefreshDto, ManagerTokenRefreshResultDto} from '@app/contracts/manager/dto/manager-token-refresh.dto.js';
import {MANAGER_INTERNAL_PATH} from '@app/contracts/manager/manager.commands.js';
import {InternalHttpClient} from '../../../../../modules/transport/internal-http.client.js';

/**
 * 매니저 그룹(총매니저 · 매니저) 공개 API — 동기 경로(내부 HTTP → admin-service 매니저 도메인). 로그인 · 토큰 재발급.
 * 큐 경로(비밀번호 변경 · 아이디 찾기 · 비밀번호 초기화)는 같은 경로 접두의 manager.controller.queue.ts(ManagerQueueController)에 둔다.
 */
@ApiTags('매니저')
@Controller('/api/v1/admin-service/manager')
export class ManagerController {
    /**
     * @param internalHttp 동기 경로 — admin-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * 매니저 로그인 — 총매니저 · 매니저 계정만(다른 그룹은 없는 계정과 같은 404)
     */
    @Post('/login')
    @HttpCode(200)
    @ApiOperation({summary: '매니저 로그인'})
    @ApiBody({type: ManagerLoginDto})
    @ApiOkResponse({type: ManagerLoginResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async login(@Body() dto: ManagerLoginDto, @Ip() ip: string): Promise<ManagerLoginResultDto> {
        return this.internalHttp.request<ManagerLoginResultDto>('admin', 'POST', MANAGER_INTERNAL_PATH.LOGIN, {body: dto, client_ip: ip});
    }

    /**
     * 매니저 토큰 재발급 — 매니저 그룹 회원만(다른 그룹은 401)
     */
    @Post('/token-refresh')
    @HttpCode(200)
    @ApiOperation({summary: '매니저 토큰 재발급'})
    @ApiBody({type: ManagerTokenRefreshDto})
    @ApiOkResponse({type: ManagerTokenRefreshResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async tokenRefresh(@Body() dto: ManagerTokenRefreshDto, @Ip() ip: string): Promise<ManagerTokenRefreshResultDto> {
        return this.internalHttp.request<ManagerTokenRefreshResultDto>('admin', 'POST', MANAGER_INTERNAL_PATH.TOKEN_REFRESH, {body: dto, client_ip: ip});
    }
}
