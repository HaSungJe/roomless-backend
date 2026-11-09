import {Body, Controller, Ip, Param, Patch, Res, UseGuards} from '@nestjs/common';
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
import {UserStateDto, UserStateParamDto} from '@app/contracts/user/dto/user-state.dto.js';
import {USER_ADMIN_COMMAND} from '@app/contracts/user/user.commands.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 이용자 관리 공개 API (총관리자 · 관리자) — 큐 경로(RabbitMQ `admin.user.*` → admin-service + 요청 단위 SSE). path param 은 payload 에 합쳐 보낸다.
 */
@ApiTags('이용자 관리')
@Controller('/api/v1/admin-service/user')
export class UserQueueController {
    /**
     * @param commandStream 명령 발행 + 요청 단위 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 이용자 이용 제한 · 해제 — 정상 ↔ 이용 제한만. 이용 제한 이용자는 로그인 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다. done 의 data 는 null.
     */
    @Patch('/:user_id/state')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '이용자 이용 제한 · 해제'})
    @ApiBody({type: UserStateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeUserState(@PassportActor() actor: Actor, @Param() param: UserStateParamDto, @Body() dto: UserStateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: USER_ADMIN_COMMAND.STATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }
}
