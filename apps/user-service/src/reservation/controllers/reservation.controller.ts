import {Controller, Get, HttpCode, Param, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {ReservationAvailabilityDto, ReservationAvailabilityResultDto} from '@app/contracts/reservation/dto/reservation-availability.dto.js';
import {ReservationDetailParamDto, ReservationDetailResultDto} from '@app/contracts/reservation/dto/reservation-detail.dto.js';
import {ReservationListDto, ReservationListResultDto} from '@app/contracts/reservation/dto/reservation-list.dto.js';
import {ReservationQrParamDto, ReservationQrResultDto} from '@app/contracts/reservation/dto/reservation-qr.dto.js';
import {ReservationStoreDto, ReservationStoreResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {ReservationService} from '../reservation.service.js';

/**
 * 예약 내부 HTTP 인바운드 어댑터 — 게이트웨이의 동기 경로(조회)만 받는다(외부 비공개, Swagger 없음).
 * 정적 경로(`/availability` · `/store`)를 `/:reservation_id` 보다 먼저 선언한다. 내부 토큰 검사는 전역 InternalAuthGuard 가 한다.
 */
@Controller('/internal/v1/user-service/reservation')
export class ReservationController {
    /**
     * @param reservationService 예약 service
     */
    constructor(private readonly reservationService: ReservationService) {}

    /**
     * 객실 그룹별 예약 가능 시간 (인증 없음)
     */
    @Get('/availability')
    @HttpCode(200)
    async getAvailability(@Query() query: ReservationAvailabilityDto): Promise<ReservationAvailabilityResultDto> {
        const dto = new ReservationAvailabilityDto(query);
        return this.reservationService.getAvailability(dto);
    }

    /**
     * 내 업체 예약 현황 (매니저)
     */
    @Get('/store')
    @HttpCode(200)
    async getStoreReservations(@InternalActor('user_id') user_id: string, @Query() query: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        const dto = new ReservationStoreDto(query);
        return this.reservationService.getStoreReservations(user_id, dto);
    }

    /**
     * 내 예약 목록 (이용자)
     */
    @Get('/')
    @HttpCode(200)
    async getMyReservations(@InternalActor('user_id') user_id: string, @Query() query: ReservationListDto): Promise<ReservationListResultDto> {
        const dto = new ReservationListDto(query);
        return this.reservationService.getMyReservations(user_id, dto);
    }

    /**
     * 내 예약 상세 (이용자)
     */
    @Get('/:reservation_id')
    @HttpCode(200)
    async getMyReservation(@InternalActor('user_id') user_id: string, @Param() param: ReservationDetailParamDto): Promise<ReservationDetailResultDto> {
        return this.reservationService.getMyReservation(user_id, param.reservation_id);
    }

    /**
     * 내 예약 QR (이용자)
     */
    @Get('/:reservation_id/qr')
    @HttpCode(200)
    async getMyReservationQr(@InternalActor('user_id') user_id: string, @Param() param: ReservationQrParamDto): Promise<ReservationQrResultDto> {
        return this.reservationService.getMyReservationQr(user_id, param.reservation_id);
    }
}
