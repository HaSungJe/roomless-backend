import {Body, Controller, Delete, Ip, Param, Patch, Post, Put, Res, UseGuards} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBearerAuth,
    ApiBody,
    ApiInternalServerErrorResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiProduces,
    ApiServiceUnavailableResponse,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {Response} from 'express';
import {ApiFailResultDto} from '@app/common/dto/global.result.dto.js';
import type {Actor} from '@app/contracts/actor.js';
import {StoreApplicationApproveParamDto, StoreApplicationApproveResultDto} from '@app/contracts/store/dto/store-application-approve.dto.js';
import {StoreApplicationCancelParamDto} from '@app/contracts/store/dto/store-application-cancel.dto.js';
import {StoreApplicationFileDeleteParamDto} from '@app/contracts/store/dto/store-application-file-delete.dto.js';
import {StoreApplicationFileDto, StoreApplicationFileParamDto, StoreApplicationFileResultDto} from '@app/contracts/store/dto/store-application-file.dto.js';
import {StoreApplicationRejectDto, StoreApplicationRejectParamDto} from '@app/contracts/store/dto/store-application-reject.dto.js';
import {StoreApplicationDto, StoreApplicationResultDto} from '@app/contracts/store/dto/store-application.dto.js';
import {StoreMineBreaksDto} from '@app/contracts/store/dto/store-mine-breaks.dto.js';
import {StoreMineFileDeleteParamDto} from '@app/contracts/store/dto/store-mine-file-delete.dto.js';
import {StoreMineFileOrderDto} from '@app/contracts/store/dto/store-mine-file-order.dto.js';
import {StoreMineFileDto, StoreMineFileResultDto} from '@app/contracts/store/dto/store-mine-file.dto.js';
import {StoreMineHoursDto} from '@app/contracts/store/dto/store-mine-hours.dto.js';
import {StoreMineMaintenanceDto} from '@app/contracts/store/dto/store-mine-maintenance.dto.js';
import {StoreMineOpenDto} from '@app/contracts/store/dto/store-mine-open.dto.js';
import {StoreMineProfileDto} from '@app/contracts/store/dto/store-mine-profile.dto.js';
import {StoreMineReservationPolicyDto} from '@app/contracts/store/dto/store-mine-reservation-policy.dto.js';
import {StoreMineUnavailablePeriodDeleteParamDto} from '@app/contracts/store/dto/store-mine-unavailable-period-delete.dto.js';
import {StoreMineUnavailablePeriodDto, StoreMineUnavailablePeriodResultDto} from '@app/contracts/store/dto/store-mine-unavailable-period.dto.js';
import {StoreOpenDto, StoreOpenParamDto} from '@app/contracts/store/dto/store-open.dto.js';
import {StoreStateDto, StoreStateParamDto} from '@app/contracts/store/dto/store-state.dto.js';
import {StoreUpdateDto, StoreUpdateParamDto} from '@app/contracts/store/dto/store-update.dto.js';
import {STORE_COMMAND} from '@app/contracts/store/store.commands.js';
import {PassportJwtAdminAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.admin.guard.js';
import {PassportActor} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.decorator.js';
import {PassportJwtAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.auth.guard.js';
import {PassportJwtManagerAuthGuard} from '../../../../../guards/passport.jwt.auth/passport.jwt.manager.guard.js';
import {CommandStreamService} from '../../../../../modules/transport/command-stream.service.js';

/**
 * 업체 공개 API — 큐 경로(RabbitMQ `admin.store.*` → admin-service + 요청 단위 SSE).
 * 내 업체 설정(매니저 가드 — 업체 총관리자 · 업체 관리자), 신청 · 신청 취소 · 업체 정보 파일 등록 · 삭제(이용자 가드), 승인 · 반려 · 업체 수정 · 상태 변경 · 영업중 여부(관리자 가드). path param 은 payload 에 합쳐 보낸다.
 * `/mine…` 을 `/:store_id` 보다 먼저 선언한다. 동기 경로(조회 · 업로드 주소)는 같은 경로 접두의 store.controller.ts(StoreController)에 둔다.
 */
@ApiTags('업체')
@Controller('/api/v1/admin-service/store')
export class StoreQueueController {
    /**
     * @param commandStream 큐 경로 — 명령 발행 + 결과 SSE
     */
    constructor(private readonly commandStream: CommandStreamService) {}

    /**
     * 내 업체 소개 수정 (업체 관리자) — 소개 · 연락처 · 편의시설(통째로 교체). done 의 data 는 null.
     */
    @Patch('/mine/profile')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 소개 수정'})
    @ApiBody({type: StoreMineProfileDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateMyStoreProfile(@PassportActor() actor: Actor, @Body() dto: StoreMineProfileDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_PROFILE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 사진 등록 (업체 관리자) — 업로드 주소로 올린 사진의 키, 마지막 순서. done 의 data 는 업체 정보 파일 ID.
     */
    @Post('/mine/file')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 사진 등록'})
    @ApiBody({type: StoreMineFileDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreMineFileResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyStoreFile(@PassportActor() actor: Actor, @Body() dto: StoreMineFileDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_FILE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 사진 순서 변경 (업체 관리자) — 업체 사진 ID 전부를 원하는 순서로(가장 앞이 대표). done 의 data 는 null.
     */
    @Put('/mine/file/order')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 사진 순서 변경'})
    @ApiBody({type: StoreMineFileOrderDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async reorderMyStoreFiles(@PassportActor() actor: Actor, @Body() dto: StoreMineFileOrderDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_FILE_ORDER, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 사진 삭제 (업체 관리자) — 업체 사진만(사업자등록증은 지울 수 없다). done 의 data 는 null.
     */
    @Delete('/mine/file/:store_file_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 사진 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async removeMyStoreFile(@PassportActor() actor: Actor, @Param() param: StoreMineFileDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_FILE_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 내 업체 영업시간 설정 (업체 관리자) — 연중무휴 여부 + 요일별 영업시간 통째로 교체. done 의 data 는 null.
     */
    @Put('/mine/hours')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 영업시간 설정'})
    @ApiBody({type: StoreMineHoursDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async replaceMyStoreHours(@PassportActor() actor: Actor, @Body() dto: StoreMineHoursDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_HOURS, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 브레이크타임 설정 (업체 관리자) — 매일 같은 목록 통째로 교체, 서로 겹치면 400. done 의 data 는 null.
     */
    @Put('/mine/breaks')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 브레이크타임 설정'})
    @ApiBody({type: StoreMineBreaksDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async replaceMyStoreBreaks(@PassportActor() actor: Actor, @Body() dto: StoreMineBreaksDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_BREAKS, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 정비시간 설정 (업체 관리자). done 의 data 는 null.
     */
    @Patch('/mine/maintenance')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 정비시간 설정'})
    @ApiBody({type: StoreMineMaintenanceDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeMyStoreMaintenance(@PassportActor() actor: Actor, @Body() dto: StoreMineMaintenanceDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_MAINTENANCE, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 영업중 여부 변경 (업체 관리자) — 같은 값이면 400. done 의 data 는 null.
     */
    @Patch('/mine/open')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 영업중 여부 변경'})
    @ApiBody({type: StoreMineOpenDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeMyStoreOpen(@PassportActor() actor: Actor, @Body() dto: StoreMineOpenDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_OPEN, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 예약 · 환불 규정 설정 (업체 관리자) — 이용 시작 n시간 전부터 예약, n시간 전까지 100% 환불(이후 환불 불가). done 의 data 는 null.
     */
    @Patch('/mine/reservation-policy')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 예약 · 환불 규정 설정'})
    @ApiBody({type: StoreMineReservationPolicyDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeMyStoreReservationPolicy(@PassportActor() actor: Actor, @Body() dto: StoreMineReservationPolicyDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_RESERVATION_POLICY, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 일시 예약불가 등록 (업체 관리자) — 한국 시각 분 단위 시작 ~ 종료, 다른 일시 예약불가와 겹치면 400. done 의 data 는 일시 예약불가 ID.
     */
    @Post('/mine/unavailable-period')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 일시 예약불가 등록'})
    @ApiBody({type: StoreMineUnavailablePeriodDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreMineUnavailablePeriodResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyStoreUnavailablePeriod(@PassportActor() actor: Actor, @Body() dto: StoreMineUnavailablePeriodDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_UNAVAILABLE_PERIOD, actor, payload: dto, client_ip: ip});
    }

    /**
     * 내 업체 일시 예약불가 삭제 (업체 관리자) — 그 업체 것만. done 의 data 는 null.
     */
    @Delete('/mine/unavailable-period/:store_unavailable_period_id')
    @UseGuards(PassportJwtManagerAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '내 업체 일시 예약불가 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async removeMyStoreUnavailablePeriod(@PassportActor() actor: Actor, @Param() param: StoreMineUnavailablePeriodDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.MINE_UNAVAILABLE_PERIOD_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 입점 신청 — 업체 정보. done 의 data 는 입점 신청 ID(업체 정보 파일을 붙일 때 쓴다).
     */
    @Post('/application')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 신청'})
    @ApiBody({type: StoreApplicationDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreApplicationResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async apply(@PassportActor() actor: Actor, @Body() dto: StoreApplicationDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION, actor, payload: dto, client_ip: ip});
    }

    /**
     * 입점 신청 취소 — 대기 중 내 신청. 신청 · 업체 정보 파일이 지워져 목록 · 상세에서 사라진다. done 의 data 는 null.
     */
    @Delete('/application/mine/:store_application_id')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 신청 취소'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async cancelMyApplication(@PassportActor() actor: Actor, @Param() param: StoreApplicationCancelParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_CANCEL, actor, payload: param, client_ip: ip});
    }

    /**
     * 업체 정보 파일 등록 — 업로드 주소로 올린 파일의 키. done 의 data 는 업체 정보 파일 ID.
     */
    @Post('/application/mine/:store_application_id/file')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 파일 등록'})
    @ApiBody({type: StoreApplicationFileDto})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreApplicationFileResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async addMyApplicationFile(
        @PassportActor() actor: Actor,
        @Param() param: StoreApplicationFileParamDto,
        @Body() dto: StoreApplicationFileDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_FILE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 정보 파일 삭제 — 대기 중 내 신청의 파일. done 의 data 는 null.
     */
    @Delete('/application/mine/:store_application_id/file/:store_file_id')
    @UseGuards(PassportJwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 파일 삭제'})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async removeMyApplicationFile(@PassportActor() actor: Actor, @Param() param: StoreApplicationFileDeleteParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_FILE_DELETE, actor, payload: param, client_ip: ip});
    }

    /**
     * 입점 승인 (총관리자) — 업체 등록(업체코드) + 업체 총관리자 계정(신청 때 정한 아이디 · 비밀번호) + 승인 알림 SMS. done 의 data 는 업체 ID · 업체코드.
     */
    @Patch('/application/:store_application_id/approve')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 승인'})
    @ApiProduces('text/event-stream')
    @ApiOkResponse({type: StoreApplicationApproveResultDto})
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async approveApplication(@PassportActor() actor: Actor, @Param() param: StoreApplicationApproveParamDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_APPROVE, actor, payload: param, client_ip: ip});
    }

    /**
     * 입점 반려 (총관리자) — 사유 필수. done 의 data 는 null.
     */
    @Patch('/application/:store_application_id/reject')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '입점 반려'})
    @ApiBody({type: StoreApplicationRejectDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async rejectApplication(
        @PassportActor() actor: Actor,
        @Param() param: StoreApplicationRejectParamDto,
        @Body() dto: StoreApplicationRejectDto,
        @Ip() ip: string,
        @Res() res: Response,
    ): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.APPLICATION_REJECT, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 정보 수정 (총관리자) — 사업자등록번호 제외. done 의 data 는 null.
     */
    @Patch('/:store_id')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 정보 수정'})
    @ApiBody({type: StoreUpdateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async updateStore(@PassportActor() actor: Actor, @Param() param: StoreUpdateParamDto, @Body() dto: StoreUpdateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.UPDATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 상태 변경 (총관리자) — 활성 · 영업중지 · 탈퇴(되돌릴 수 없음 · 매니저 정지). done 의 data 는 null.
     */
    @Patch('/:store_id/state')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 상태 변경'})
    @ApiBody({type: StoreStateDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeStoreState(@PassportActor() actor: Actor, @Param() param: StoreStateParamDto, @Body() dto: StoreStateDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.STATE, actor, payload: {...param, ...dto}, client_ip: ip});
    }

    /**
     * 업체 영업중 여부 변경 (총관리자 · 관리자) — 같은 값 · 탈퇴 업체는 400. done 의 data 는 null. `/mine/open` 이 앞에 있어 `mine` 이 업체 ID 로 잡히지 않는다.
     */
    @Patch('/:store_id/open')
    @UseGuards(PassportJwtAdminAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({summary: '업체 영업중 여부 변경'})
    @ApiBody({type: StoreOpenDto})
    @ApiProduces('text/event-stream')
    @ApiBadRequestResponse({type: ApiFailResultDto})
    @ApiUnauthorizedResponse({type: ApiFailResultDto})
    @ApiNotFoundResponse({type: ApiFailResultDto})
    @ApiServiceUnavailableResponse({type: ApiFailResultDto})
    @ApiInternalServerErrorResponse({type: ApiFailResultDto})
    async changeStoreOpen(@PassportActor() actor: Actor, @Param() param: StoreOpenParamDto, @Body() dto: StoreOpenDto, @Ip() ip: string, @Res() res: Response): Promise<void> {
        await this.commandStream.dispatch(res, {type: STORE_COMMAND.OPEN, actor, payload: {...param, ...dto}, client_ip: ip});
    }
}
