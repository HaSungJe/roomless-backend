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
import {UserGeneralLoginDto, UserGeneralLoginResultDto} from '@app/contracts/user/dto/user-general-login.dto.js';
import {UserLoginDto, UserLoginResultDto} from '@app/contracts/user/dto/user-login.dto.js';
import {UserTokenRefreshDto, UserTokenRefreshResultDto} from '@app/contracts/user/dto/user-token-refresh.dto.js';
import {USER_INTERNAL_PATH} from '@app/contracts/user/user.commands.js';
import {InternalHttpClient} from '../../../../modules/transport/internal-http.client.js';

/**
 * 회원 공개 API — 동기 경로(내부 HTTP). 게이트웨이 인바운드 어댑터.
 * 입력 검증 · 인증을 여기서 끝내고 InternalHttpClient 로 user-service 를 불러 결과를 일반 JSON 으로 돌려준다. 로직 0.
 *
 * 큐 경로(RabbitMQ + 요청 단위 SSE) 라우트는 같은 경로 접두의 user.controller.queue.ts(UserQueueController)에 둔다.
 */
@ApiTags('회원')
@Controller('/api/v1/user')
export class UserController {
    /**
     * @param internalHttp 동기 경로 — user-service 내부 HTTP
     */
    constructor(private readonly internalHttp: InternalHttpClient) {}

    /**
     * SNS 로그인
     */
    @Post('/login')
    @HttpCode(200)
    @ApiOperation({summary: 'SNS 로그인'})
    @ApiBody({type: UserLoginDto})
    @ApiOkResponse({type: UserLoginResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async login(@Body() dto: UserLoginDto, @Ip() ip: string): Promise<UserLoginResultDto> {
        return this.internalHttp.request<UserLoginResultDto>('user', 'POST', USER_INTERNAL_PATH.LOGIN, {body: dto, client_ip: ip});
    }

    /**
     * 일반 로그인
     */
    @Post('/general-login')
    @HttpCode(200)
    @ApiOperation({summary: '일반 로그인'})
    @ApiBody({type: UserGeneralLoginDto})
    @ApiOkResponse({type: UserGeneralLoginResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiForbiddenResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async generalLogin(@Body() dto: UserGeneralLoginDto, @Ip() ip: string): Promise<UserGeneralLoginResultDto> {
        return this.internalHttp.request<UserGeneralLoginResultDto>('user', 'POST', USER_INTERNAL_PATH.GENERAL_LOGIN, {body: dto, client_ip: ip});
    }

    /**
     * 로그인 토큰 재발급
     */
    @Post('/token-refresh')
    @HttpCode(200)
    @ApiOperation({summary: '로그인 토큰 재발급'})
    @ApiBody({type: UserTokenRefreshDto})
    @ApiOkResponse({type: UserTokenRefreshResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async tokenRefresh(@Body() dto: UserTokenRefreshDto, @Ip() ip: string): Promise<UserTokenRefreshResultDto> {
        return this.internalHttp.request<UserTokenRefreshResultDto>('user', 'POST', USER_INTERNAL_PATH.TOKEN_REFRESH, {body: dto, client_ip: ip});
    }
}
