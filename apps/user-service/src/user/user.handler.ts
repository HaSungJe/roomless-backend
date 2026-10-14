import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {UserGeneralSignDto, UserGeneralSignResultDto} from '@app/contracts/user/dto/user-general-sign.dto.js';
import type {UserLeaveDto} from '@app/contracts/user/dto/user-leave.dto.js';
import type {UserPasswordDto} from '@app/contracts/user/dto/user-password.dto.js';
import type {UserSignDto, UserSignResultDto} from '@app/contracts/user/dto/user-sign.dto.js';
import {USER_COMMAND} from '@app/contracts/user/user.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {UserService} from './user.service.js';

/**
 * 회원 RabbitMQ 인바운드 어댑터 — 게이트웨이가 발행한 큐 경로 명령을 받는다.
 * controller 와 같은 역할: 봉투에서 입력을 꺼내 service 로 위임만 한다(로직 0).
 * 반환값은 done 결과로, 던진 예외는 `toFailResult()` 를 거쳐 failed 결과로 게이트웨이에 회신된다.
 * 입력 검증은 게이트웨이의 ValidationPipe 에서 끝났으므로 다시 하지 않는다.
 */
@Injectable()
export class UserCommandHandler {
    /**
     * @param userService 회원 service
     */
    constructor(private readonly userService: UserService) {}

    /**
     * SNS 회원가입
     */
    @OnCommand(USER_COMMAND.SIGN)
    async sign(command: MessageEnvelope<UserSignDto>): Promise<UserSignResultDto> {
        return this.userService.sign(command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 일반 회원가입
     */
    @OnCommand(USER_COMMAND.GENERAL_SIGN)
    async generalSign(command: MessageEnvelope<UserGeneralSignDto>): Promise<UserGeneralSignResultDto> {
        return this.userService.generalSign(command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 회원 탈퇴 신청
     */
    @OnCommand(USER_COMMAND.LEAVE)
    async leave(command: MessageEnvelope<UserLeaveDto>): Promise<void> {
        return this.userService.leave(requireActor(command).user_id, command.payload);
    }

    /**
     * 회원 탈퇴 철회
     */
    @OnCommand(USER_COMMAND.LEAVE_CANCEL)
    async cancelLeave(command: MessageEnvelope<Record<string, never>>): Promise<void> {
        return this.userService.cancelLeave(requireActor(command).user_id);
    }

    /**
     * 비밀번호 변경
     */
    @OnCommand(USER_COMMAND.PASSWORD)
    async changePassword(command: MessageEnvelope<UserPasswordDto>): Promise<void> {
        return this.userService.changePassword(requireActor(command).user_id, command.payload);
    }
}
