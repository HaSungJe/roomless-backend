import {Controller, Get, HttpCode, Query} from '@nestjs/common';
import {InternalActor} from '@app/common/internal/internal-request.decorator.js';
import {ReservationStoreDto, ReservationStoreResultDto} from '@app/contracts/reservation/dto/reservation-store.dto.js';
import {ReservationService} from '../reservation.service.js';

/**
 * reservation 내부 HTTP 인바운드 어댑터 (매니저 예약) — 게이트웨이의 동기 경로(내 업체 예약 현황)만 받는다(외부 비공개, Swagger 없음).
 * 로그인 매니저는 게이트웨이가 넘긴 actor 헤더에서 꺼낸다. 내부 토큰 검사는 전역 InternalAuthGuard 가 한다.
 */
@Controller('/internal/v1/admin-service/reservation')
export class ReservationController {
    /**
     * @param reservationService reservation 비즈니스 로직
     */
    constructor(private readonly reservationService: ReservationService) {}

    /**
     * 내 업체 예약 현황 (매니저)
     */
    @Get('/store')
    @HttpCode(200)
    async getStoreReservations(@InternalActor('user_id') user_id: string, @Query() query: ReservationStoreDto): Promise<ReservationStoreResultDto> {
        const dto = new ReservationStoreDto(query);
        return this.reservationService.getStoreReservations(user_id, dto);
    }
}
