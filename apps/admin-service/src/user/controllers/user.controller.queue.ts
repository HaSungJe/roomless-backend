import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {UserStateDto, UserStateParamDto} from '@app/contracts/user/dto/user-state.dto.js';
import {USER_ADMIN_COMMAND} from '@app/contracts/user/user.commands.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {UserService} from '../user.service.js';

/**
 * 이용자 관리 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.user.*` 명령을 `@OnCommand` 로 받는다.
 * 관리자 가드는 게이트웨이에서 끝났다(업체 상태 변경 admin.store.state 와 같이 actor 를 service 에 넘기지 않는다).
 */
@Injectable()
export class UserQueueController {
    /**
     * @param userService 이용자 관리 service
     */
    constructor(private readonly userService: UserService) {}

    /**
     * 이용자 이용 제한 · 해제 — 총관리자 · 관리자
     *
     * @param command 명령 봉투 (payload = path param + 본문)
     */
    @OnCommand(USER_ADMIN_COMMAND.STATE)
    async changeUserState(command: MessageEnvelope<UserStateParamDto & UserStateDto>): Promise<void> {
        return this.userService.changeUserState(command.payload.user_id, command.payload);
    }
}
