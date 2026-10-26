import {Injectable} from '@nestjs/common';
import type {MessageEnvelope} from '@app/contracts/message-envelope.js';
import type {StoreApplicationApproveParamDto, StoreApplicationApproveResultDto} from '@app/contracts/store/dto/store-application-approve.dto.js';
import type {StoreApplicationCancelParamDto} from '@app/contracts/store/dto/store-application-cancel.dto.js';
import type {StoreApplicationFileDeleteParamDto} from '@app/contracts/store/dto/store-application-file-delete.dto.js';
import type {StoreApplicationFileDto, StoreApplicationFileParamDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import type {StoreApplicationRejectDto, StoreApplicationRejectParamDto} from '@app/contracts/store/dto/store-application-reject.dto.js';
import type {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import type {StoreMineBreaksDto} from '@app/contracts/store/dto/store-mine-breaks.dto.js';
import type {StoreMineFileDeleteParamDto} from '@app/contracts/store/dto/store-mine-file-delete.dto.js';
import type {StoreMineFileOrderDto} from '@app/contracts/store/dto/store-mine-file-order.dto.js';
import type {StoreMineFileDto, StoreMineFileResultDto} from '@app/contracts/store/dto/store-mine-file.dto.js';
import type {StoreMineHoursDto} from '@app/contracts/store/dto/store-mine-hours.dto.js';
import type {StoreMineMaintenanceDto} from '@app/contracts/store/dto/store-mine-maintenance.dto.js';
import type {StoreMineOpenDto} from '@app/contracts/store/dto/store-mine-open.dto.js';
import type {StoreMineProfileDto} from '@app/contracts/store/dto/store-mine-profile.dto.js';
import type {StoreMineUnavailablePeriodDeleteParamDto} from '@app/contracts/store/dto/store-mine-unavailable-period-delete.dto.js';
import type {StoreMineUnavailablePeriodDto, StoreMineUnavailablePeriodResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period.dto.js';
import type {StoreStateDto, StoreStateParamDto} from '@app/contracts/store/dto/store-state.dto.js';
import type {StoreUpdateDto, StoreUpdateParamDto} from '@app/contracts/store/dto/store-update.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {requireActor} from '@app/messaging/messaging.util.js';
import {OnCommand} from '@app/messaging/on-command.decorator.js';
import {StoreService} from '../store.service.js';

/**
 * store 큐 경로 컨트롤러(RabbitMQ 인바운드 어댑터) — 게이트웨이가 발행한 `admin.store.*` 명령을 `@OnCommand` 로 받는다.
 * 봉투에서 입력을 꺼내 service 로 위임만 한다(로직 0). path param 은 게이트웨이가 payload 에 합쳐 보낸다.
 * 신청자 · 업체 관리자 명령은 actor 의 user_id 가 필요해 requireActor 로 꺼내고, 총관리자 명령은 게이트웨이 관리자 가드를 지난 요청이라 actor 를 쓰지 않는다.
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
     * @returns 업체 ID · 업체코드
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

    /**
     * 내 업체 소개 수정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_PROFILE)
    async updateMyStoreProfile(command: MessageEnvelope<StoreMineProfileDto>): Promise<void> {
        return this.storeService.updateMyStoreProfile(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 사진 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 업체 정보 파일 ID
     */
    @OnCommand(STORE_COMMAND.MINE_FILE)
    async addMyStoreFile(command: MessageEnvelope<StoreMineFileDto>): Promise<StoreMineFileResultDto> {
        return this.storeService.addMyStoreFile(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 사진 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(STORE_COMMAND.MINE_FILE_DELETE)
    async removeMyStoreFile(command: MessageEnvelope<StoreMineFileDeleteParamDto>): Promise<void> {
        return this.storeService.removeMyStoreFile(requireActor(command).user_id, command.payload.store_file_id);
    }

    /**
     * 내 업체 사진 순서 변경 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_FILE_ORDER)
    async reorderMyStoreFiles(command: MessageEnvelope<StoreMineFileOrderDto>): Promise<void> {
        return this.storeService.reorderMyStoreFiles(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 영업시간 설정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_HOURS)
    async replaceMyStoreHours(command: MessageEnvelope<StoreMineHoursDto>): Promise<void> {
        return this.storeService.replaceMyStoreHours(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 브레이크타임 설정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_BREAKS)
    async replaceMyStoreBreaks(command: MessageEnvelope<StoreMineBreaksDto>): Promise<void> {
        return this.storeService.replaceMyStoreBreaks(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 정비시간 설정 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_MAINTENANCE)
    async changeMyStoreMaintenance(command: MessageEnvelope<StoreMineMaintenanceDto>): Promise<void> {
        return this.storeService.changeMyStoreMaintenance(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 영업중 여부 변경 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     */
    @OnCommand(STORE_COMMAND.MINE_OPEN)
    async changeMyStoreOpen(command: MessageEnvelope<StoreMineOpenDto>): Promise<void> {
        return this.storeService.changeMyStoreOpen(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 일시 예약불가 등록 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수)
     * @returns 일시 예약불가 ID
     */
    @OnCommand(STORE_COMMAND.MINE_UNAVAILABLE_PERIOD)
    async addMyStoreUnavailablePeriod(command: MessageEnvelope<StoreMineUnavailablePeriodDto>): Promise<StoreMineUnavailablePeriodResultDto> {
        return this.storeService.addMyStoreUnavailablePeriod(requireActor(command).user_id, command.payload);
    }

    /**
     * 내 업체 일시 예약불가 삭제 — 업체 관리자
     *
     * @param command 명령 봉투 (actor 필수, payload = path param)
     */
    @OnCommand(STORE_COMMAND.MINE_UNAVAILABLE_PERIOD_DELETE)
    async removeMyStoreUnavailablePeriod(command: MessageEnvelope<StoreMineUnavailablePeriodDeleteParamDto>): Promise<void> {
        return this.storeService.removeMyStoreUnavailablePeriod(requireActor(command).user_id, command.payload.store_unavailable_period_id);
    }
}
