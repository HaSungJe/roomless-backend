import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {StoreApplicationCancelParamDto} from '@app/contracts/store/dto/store-application-cancel.dto.js';
import type {StoreApplicationFileDeleteParamDto} from '@app/contracts/store/dto/store-application-file-delete.dto.js';
import type {StoreApplicationFileDto, StoreApplicationFileParamDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import type {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import {STORE_USER_COMMAND} from '@app/contracts/store/store.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {StoreService} from '../store.service.js';

/**
 * store 큐 경로 컨트롤러 (이용자 입점 신청, RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `user.store.application*` 명령을 `@OnCommand` 로 받아 service 로 넘긴다(위임만).
 * 입력 검증은 게이트웨이 ValidationPipe 에서 끝났다(다시 검증하지 않는다). 모두 로그인 이용자 명령이라 actor 가 필요하다.
 */
@Injectable()
export class StoreQueueController {
    /**
     * @param storeService store 비즈니스 로직
     */
    constructor(private readonly storeService: StoreService) {}

    /**
     * 입점 신청 — 로그인 이용자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 입점 신청 ID
     */
    @OnCommand(STORE_USER_COMMAND.APPLICATION)
    async apply(command: MessageEnvelope<StoreApplicationDto>): Promise<StoreApplicationResultDto> {
        return this.storeService.apply(requireActor(command).user_id, command.payload);
    }

    /**
     * 입점 신청 취소 — 로그인 이용자 · 대기 중 내 신청
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(STORE_USER_COMMAND.APPLICATION_CANCEL)
    async cancelMyApplication(command: MessageEnvelope<StoreApplicationCancelParamDto>): Promise<void> {
        return this.storeService.cancelMyApplication(requireActor(command).user_id, command.payload.store_application_id);
    }

    /**
     * 업체 정보 파일 등록 — 로그인 이용자 · 대기 중 내 신청
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     * @returns 업체 정보 파일 ID
     */
    @OnCommand(STORE_USER_COMMAND.APPLICATION_FILE)
    async addMyApplicationFile(command: MessageEnvelope<StoreApplicationFileParamDto & StoreApplicationFileDto>): Promise<StoreApplicationFileResultDto> {
        return this.storeService.addMyApplicationFile(requireActor(command).user_id, command.payload.store_application_id, command.payload);
    }

    /**
     * 업체 정보 파일 삭제 — 로그인 이용자 · 대기 중 내 신청
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(STORE_USER_COMMAND.APPLICATION_FILE_DELETE)
    async removeMyApplicationFile(command: MessageEnvelope<StoreApplicationFileDeleteParamDto>): Promise<void> {
        return this.storeService.removeMyApplicationFile(requireActor(command).user_id, command.payload.store_application_id, command.payload.store_file_id);
    }
}
