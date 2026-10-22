import {Injectable} from '@nestjs/common';
import {ADMIN_COMMAND} from '@app/contracts/admin/admin.commands.js';
import type {AdminPasswordDto} from '@app/contracts/admin/dto/admin-password.dto.js';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {AdminService} from '../admin.service.js';

/**
 * 관리자 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.admin.*` 명령을 `@OnCommand` 로 받는다.
 * 봉투에서 입력을 꺼내 service 로 위임만 한다(로직 0). HTTP 컨트롤러가 아니라 provider 다 — 도메인 모듈 providers 에 등록한다.
 * 입력 검증은 게이트웨이의 ValidationPipe 에서 끝났으므로 다시 하지 않는다.
 */
@Injectable()
export class AdminQueueController {
    /**
     * @param adminService 관리자 service
     */
    constructor(private readonly adminService: AdminService) {}

    /**
     * 비밀번호 변경 — 로그인 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(ADMIN_COMMAND.PASSWORD)
    async changePassword(command: MessageEnvelope<AdminPasswordDto>): Promise<void> {
        return this.adminService.changePassword(requireActor(command).user_id, command.payload);
    }
}
