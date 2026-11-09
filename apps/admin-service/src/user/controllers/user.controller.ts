import {Controller, Get, HttpCode, Param, Query} from '@nestjs/common';
import {UserDetailParamDto, UserDetailResultDto} from '@app/contracts/user/dto/user-detail.dto.js';
import {UserListDto, UserListResultDto} from '@app/contracts/user/dto/user-list.dto.js';
import {UserReservationListDto, UserReservationListParamDto, UserReservationListResultDto} from '@app/contracts/user/dto/user-reservation-list.dto.js';
import {UserService} from '../user.service.js';

/**
 * 이용자 관리 내부 HTTP 컨트롤러(동기 경로 인바운드 어댑터) — 게이트웨이가 관리자 가드를 통과시킨 요청만 온다(서비스는 전역 InternalAuthGuard).
 */
@Controller('/internal/v1/admin-service/user')
export class UserController {
    /**
     * @param userService 이용자 관리 service
     */
    constructor(private readonly userService: UserService) {}

    /**
     * 이용자 목록 (총관리자 · 관리자)
     */
    @Get('/')
    @HttpCode(200)
    async getUserList(@Query() query: UserListDto): Promise<UserListResultDto> {
        const dto = new UserListDto(query);
        return this.userService.getUserList(dto);
    }

    /**
     * 이용자 상세 (총관리자 · 관리자)
     */
    @Get('/:user_id')
    @HttpCode(200)
    async getUser(@Param() param: UserDetailParamDto): Promise<UserDetailResultDto> {
        return this.userService.getUser(param.user_id);
    }

    /**
     * 이용자 예약 이력 (총관리자 · 관리자)
     */
    @Get('/:user_id/reservation')
    @HttpCode(200)
    async getUserReservations(@Param() param: UserReservationListParamDto, @Query() query: UserReservationListDto): Promise<UserReservationListResultDto> {
        const dto = new UserReservationListDto(query);
        return this.userService.getUserReservations(param.user_id, dto);
    }
}
