import {Body, Controller, Ip, Patch, Res, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOperation,
    ApiProduces,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {Response} from 'express';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {ADMIN_COMMAND} from '@app/contracts/admin/admin.commands.js';
import {AdminPasswordDto} from '@app/contracts/admin/dto/admin-password.dto.js';
import {PassportJwtAdminAuthGuard} from '../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {PassportActor} from '../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {CommandStreamService} from '../../../../modules/transport/command-stream.service.js';

/**
 * 관리자 그룹(총관리자 · 관리자) 공개 API — 큐 경로(RabbitMQ `admin.admin.*` → admin-service + 요청 단위 SSE). 비밀번호 변경.
 * 관리자 그룹은 아이디 찾기 · 비밀번호 초기화가 없다.
 * 동기 경로(로그인 · 재발급)는 같은 경로 접두의 admin.controller.ts(AdminController)에 둔다.
 */
@ApiTags('관리자')
@Controller('/api/v1/admin')
export class AdminQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 관리자 비밀번호 변경 — 관리자 가드(jwt-admin)라 총관리자 · 관리자 토큰만 통과한다. done 의 data 는 null.
     */
    @Patch('/password')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '관리자 비밀번호 변경'})
    @ApiBody({type: AdminPasswordDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changePassword(@PassportActor() actor: Actor, @Body() dto: AdminPasswordDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: ADMIN_COMMAND.PASSWORD, actor, payload: dto, client_ip: ip});
    }
}
