import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {StoreApplicationApproveParamDto, StoreApplicationApproveResultDto} from '@app/contracts/store/dto/store-application-approve.dto.js';
import type {StoreApplicationCancelParamDto} from '@app/contracts/store/dto/store-application-cancel.dto.js';
import type {StoreApplicationFileDeleteParamDto} from '@app/contracts/store/dto/store-application-file-delete.dto.js';
import type {StoreApplicationFileDto, StoreApplicationFileParamDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import type {StoreApplicationRejectDto, StoreApplicationRejectParamDto} from '@app/contracts/store/dto/store-application-reject.dto.js';
import type {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import type {StoreStateDto, StoreStateParamDto} from '@app/contracts/store/dto/store-state.dto.js';
import type {StoreUpdateDto, StoreUpdateParamDto} from '@app/contracts/store/dto/store-update.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {StoreService} from '../store.service.js';

/**
 * store 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.store.*` 명령을 `@OnCommand` 로 받는다.
 * 봉투에서 입력을 꺼내 service 로 위임만 한다(로직 0). path param 은 게이트웨이가 payload 에 합쳐 보낸다.
 * 신청자 명령은 actor 의 user_id 가 필요해 requireActor 로 꺼내고, 총관리자 명령은 게이트웨이 관리자 가드를 지난 요청이라 actor 를 쓰지 않는다.
 */
@Injectable()
export class StoreQueueController {
    /**
     * @param storeService store service
     */
    constructor(private readonly storeService: StoreService) {}

    /**
     * 입점 신청 — 로그인 이용자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 입점 신청 ID
     */
    @OnCommand(STORE_COMMAND.APPLICATION)
    async apply(command: MessageEnvelope<StoreApplicationDto>): Promise<StoreApplicationResultDto> {
        return this.storeService.apply(requireActor(command).user_id, command.payload);
    }

    /**
     * 입점 신청 취소 — 로그인 이용자 · 대기 중 내 신청
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(STORE_COMMAND.APPLICATION_CANCEL)
    async cancelMyApplication(command: MessageEnvelope<StoreApplicationCancelParamDto>): Promise<void> {
        return this.storeService.cancelMyApplication(requireActor(command).user_id, command.payload.store_application_id);
    }

    /**
     * 업체 정보 파일 등록 — 로그인 이용자 · 대기 중 내 신청
     *
     * @param command 명령 봉투 (actor 필수, payload = path param + 본문)
     * @returns 업체 정보 파일 ID
     */
    @OnCommand(STORE_COMMAND.APPLICATION_FILE)
    async addMyApplicationFile(command: MessageEnvelope<StoreApplicationFileParamDto & StoreApplicationFileDto>): Promise<StoreApplicationFileResultDto> {
        return this.storeService.addMyApplicationFile(requireActor(command).user_id, command.payload.store_application_id, command.payload);
    }

    /**
     * 업체 정보 파일 삭제 — 로그인 이용자 · 대기 중 내 신청
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(STORE_COMMAND.APPLICATION_FILE_DELETE)
    async removeMyApplicationFile(command: MessageEnvelope<StoreApplicationFileDeleteParamDto>): Promise<void> {
        return this.storeService.removeMyApplicationFile(requireActor(command).user_id, command.payload.store_application_id, command.payload.store_file_id);
    }

    /**
     * 입점 승인 — 총관리자
     *
     * @param command 명령 봉투 (payload = path param)
     * @returns 업체 ID · 업체 총관리자 아이디
     */
    @OnCommand(STORE_COMMAND.APPLICATION_APPROVE)
    async approveApplication(command: MessageEnvelope<StoreApplicationApproveParamDto>): Promise<StoreApplicationApproveResultDto> {
        return this.storeService.approveApplication(command.payload.store_application_id);
    }

    /**
     * 입점 반려 — 총관리자
     *
     * @param command 명령 봉투 (payload = path param + 본문)
     */
    @OnCommand(STORE_COMMAND.APPLICATION_REJECT)
    async rejectApplication(command: MessageEnvelope<StoreApplicationRejectParamDto & StoreApplicationRejectDto>): Promise<void> {
        return this.storeService.rejectApplication(command.payload.store_application_id, command.payload);
    }

    /**
     * 업체 정보 수정 — 총관리자
     *
     * @param command 명령 봉투 (payload = path param + 본문)
     */
    @OnCommand(STORE_COMMAND.UPDATE)
    async updateStore(command: MessageEnvelope<StoreUpdateParamDto & StoreUpdateDto>): Promise<void> {
        return this.storeService.updateStore(command.payload.store_id, command.payload);
    }

    /**
     * 업체 상태 변경 — 총관리자
     *
     * @param command 명령 봉투 (payload = path param + 본문)
     */
    @OnCommand(STORE_COMMAND.STATE)
    async changeStoreState(command: MessageEnvelope<StoreStateParamDto & StoreStateDto>): Promise<void> {
        return this.storeService.changeStoreState(command.payload.store_id, command.payload);
    }
}
