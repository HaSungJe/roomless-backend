import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 이용자 예약 이력 path param
 */
export class UserReservationListParamDto {
    @ApiProperty({description: '이용자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 이용자 예약 이력 query — 페이지만
 */
export class UserReservationListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<UserReservationListDto>) {
        super(data);
    }
}

/**
 * 이용자 예약 이력 항목
 */
export class UserReservationListItemResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '상품 종류 (HOURLY · NIGHT · LONG)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류 이름 (시간 이용 · 1박 · 연박)'})
    room_plan_type_name: string;

    @ApiProperty({description: '예약 상태 (PENDING · CONFIRMED · CHECKED_IN · COMPLETED · CANCELED)'})
    reservation_state_id: string;

    @ApiProperty({description: '예약 상태 이름'})
    reservation_state_name: string;

    @ApiProperty({description: '이용 시작 (ISO 8601)'})
    start_at: string;

    @ApiProperty({description: '이용 끝 (ISO 8601)'})
    end_at: string;

    @ApiProperty({description: '합계 금액(원)'})
    total_price: number;

    @ApiProperty({description: '취소 시각 (ISO 8601, 취소 아니면 null)', nullable: true, type: String})
    canceled_at: string | null;

    @ApiProperty({description: '취소 주체 (USER · STORE, 취소 아니면 null)', nullable: true, type: String})
    cancel_actor: string | null;

    @ApiProperty({description: '예약일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 이용자 예약 이력
 */
export class UserReservationListResultDto {
    @ApiProperty({description: '목록 (이용 시작 최신순, 결제 대기 만료 제외)', type: () => [UserReservationListItemResultDto]})
    list: UserReservationListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
