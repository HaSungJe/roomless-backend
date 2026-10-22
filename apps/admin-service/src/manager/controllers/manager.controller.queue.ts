import type {BadRequestException} from '@nestjs/common';
import {Injectable} from '@nestjs/common';
import type {ManagerFindLoginIdConfirmDto, ManagerFindLoginIdConfirmResultDto} from '@app/contracts/manager/dto/manager-find-login-id-confirm.dto.js';
import type {ManagerFindLoginIdDto, ManagerFindLoginIdResultDto} from '@app/contracts/manager/dto/manager-find-login-id.dto.js';
import type {ManagerPasswordResetConfirmDto} from '@app/contracts/manager/dto/manager-password-reset-confirm.dto.js';
import type {ManagerPasswordResetDto, ManagerPasswordResetResultDto} from '@app/contracts/manager/dto/manager-password-reset.dto.js';
import type {ManagerPasswordDto} from '@app/contracts/manager/dto/manager-password.dto.js';
import {MANAGER_COMMAND} from '@app/contracts/manager/manager.commands.js';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {ManagerService} from '../manager.service.js';

/**
 * 매니저 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.manager.*` 명령을 `@OnCommand` 로 받는다.
 * 봉투에서 입력을 꺼내 service 로 위임만 한다(로직 0). HTTP 컨트롤러가 아니라 provider 다 — 도메인 모듈 providers 에 등록한다.
 * 입력 검증은 게이트웨이의 ValidationPipe 에서 끝났으므로 다시 하지 않는다.
 */
@Injectable()
export class ManagerQueueController {
    /**
     * @param managerService 매니저 service
     */
    constructor(private readonly managerService: ManagerService) {}

    /**
     * 비밀번호 변경 — 로그인 매니저
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(MANAGER_COMMAND.PASSWORD)
    async changePassword(command: MessageEnvelope<ManagerPasswordDto>): Promise<void> {
        return this.managerService.changePassword(requireActor(command).user_id, command.payload);
    }

    /**
     * 아이디 찾기 — 인증번호 발송 (비로그인)
     *
     * @param command 명령 봉투
     * @returns 인증 ID · 만료 시각
     */
    @OnCommand(MANAGER_COMMAND.FIND_LOGIN_ID)
    async sendFindLoginId(command: MessageEnvelope<ManagerFindLoginIdDto>): Promise<ManagerFindLoginIdResultDto> {
        return this.managerService.sendFindLoginId(command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 아이디 찾기 — 인증번호 확인 (비로그인). 불일치는 반환된 BadRequestException.
     *
     * @param command 명령 봉투
     * @returns 아이디 · 등록일시 — 또는 반환된 실패
     */
    @OnCommand(MANAGER_COMMAND.FIND_LOGIN_ID_CONFIRM)
    async confirmFindLoginId(command: MessageEnvelope<ManagerFindLoginIdConfirmDto>): Promise<ManagerFindLoginIdConfirmResultDto | BadRequestException> {
        return this.managerService.confirmFindLoginId(command.payload);
    }

    /**
     * 비밀번호 초기화 — 인증번호 발송 (비로그인)
     *
     * @param command 명령 봉투
     * @returns 인증 ID · 만료 시각
     */
    @OnCommand(MANAGER_COMMAND.PASSWORD_RESET)
    async sendPasswordReset(command: MessageEnvelope<ManagerPasswordResetDto>): Promise<ManagerPasswordResetResultDto> {
        return this.managerService.sendPasswordReset(command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호 SMS (비로그인). 불일치는 반환된 BadRequestException.
     *
     * @param command 명령 봉투
     * @returns 없음 또는 반환된 실패
     */
    @OnCommand(MANAGER_COMMAND.PASSWORD_RESET_CONFIRM)
    async confirmPasswordReset(command: MessageEnvelope<ManagerPasswordResetConfirmDto>): Promise<void | BadRequestException> {
        return this.managerService.confirmPasswordReset(command.payload);
    }
}
