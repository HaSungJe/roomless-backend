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
import type {UserFindLoginIdConfirmDto, UserFindLoginIdConfirmResultDto} from '@app/contracts/user/dto/user-find-login-id-confirm.dto.js';
import type {UserFindLoginIdDto, UserFindLoginIdResultDto} from '@app/contracts/user/dto/user-find-login-id.dto.js';
import type {UserPasswordResetConfirmDto} from '@app/contracts/user/dto/user-password-reset-confirm.dto.js';
import type {UserPasswordResetDto, UserPasswordResetResultDto} from '@app/contracts/user/dto/user-password-reset.dto.js';
import type {UserPhoneVerificationConfirmDto} from '@app/contracts/user/dto/user-phone-verification-confirm.dto.js';
import type {UserPhoneVerificationDto, UserPhoneVerificationResultDto} from '@app/contracts/user/dto/user-phone-verification.dto.js';

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

    /**
     * 휴대폰 인증번호 발송 — 로그인 회원
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 인증 ID · 만료 시각
     */
    @OnCommand(USER_COMMAND.PHONE_VERIFICATION)
    async sendPhoneVerification(command: MessageEnvelope<UserPhoneVerificationDto>): Promise<UserPhoneVerificationResultDto> {
        return this.userService.sendPhoneVerification(requireActor(command).user_id, command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 휴대폰 인증번호 확인 — 로그인 회원
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(USER_COMMAND.PHONE_VERIFICATION_CONFIRM)
    async confirmPhoneVerification(command: MessageEnvelope<UserPhoneVerificationConfirmDto>): Promise<void> {
        return this.userService.confirmPhoneVerification(requireActor(command).user_id, command.payload);
    }

    /**
     * 아이디 찾기 — 인증번호 발송 (비로그인)
     *
     * @param command 명령 봉투
     * @returns 인증 ID · 만료 시각
     */
    @OnCommand(USER_COMMAND.FIND_LOGIN_ID)
    async sendFindLoginId(command: MessageEnvelope<UserFindLoginIdDto>): Promise<UserFindLoginIdResultDto> {
        return this.userService.sendFindLoginId(command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 아이디 찾기 — 인증번호 확인 (비로그인)
     *
     * @param command 명령 봉투
     * @returns 아이디 또는 가입한 SNS
     */
    @OnCommand(USER_COMMAND.FIND_LOGIN_ID_CONFIRM)
    async confirmFindLoginId(command: MessageEnvelope<UserFindLoginIdConfirmDto>): Promise<UserFindLoginIdConfirmResultDto> {
        return this.userService.confirmFindLoginId(command.payload);
    }

    /**
     * 비밀번호 초기화 — 인증번호 발송 (비로그인)
     *
     * @param command 명령 봉투
     * @returns 인증 ID · 만료 시각
     */
    @OnCommand(USER_COMMAND.PASSWORD_RESET)
    async sendPasswordReset(command: MessageEnvelope<UserPasswordResetDto>): Promise<UserPasswordResetResultDto> {
        return this.userService.sendPasswordReset(command.payload, command.meta.client_ip ?? '');
    }

    /**
     * 비밀번호 초기화 — 인증번호 확인 → 임시 비밀번호 SMS (비로그인)
     *
     * @param command 명령 봉투
     */
    @OnCommand(USER_COMMAND.PASSWORD_RESET_CONFIRM)
    async confirmPasswordReset(command: MessageEnvelope<UserPasswordResetConfirmDto>): Promise<void> {
        return this.userService.confirmPasswordReset(command.payload);
    }
}
