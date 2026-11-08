import {ApiProperty} from '@nestjs/swagger';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 내 예약 목록 query — 페이지만. 결제 대기 만료 건은 나오지 않는다, 입실 일시 최근순
 */
export class ReservationListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<ReservationListDto>) {
        super(data);
    }
}

/**
 * 내 예약 목록 항목
 */
export class ReservationListItemResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '업체 ID'})
    store_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '호실 ID'})
    room_id: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '객실 그룹명'})
    room_group_name: string;

    @ApiProperty({description: '상품 종류 (HOURLY · NIGHT · LONG)'})
    room_plan_type_id: string;

    @ApiProperty({description: '상품 종류명'})
    room_plan_type_name: string;

    @ApiProperty({description: '예약 상태 (PENDING: 결제 대기, CONFIRMED: 예약 확정, CHECKED_IN: 이용 중, COMPLETED: 이용 완료, CANCELED: 취소)'})
    reservation_state_id: string;

    @ApiProperty({description: '예약 상태명'})
    reservation_state_name: string;

    @ApiProperty({description: '이용 시작 일시 (ISO 8601 — 이 시각에 이용 중)'})
    start_at: string;

    @ApiProperty({description: '이용 끝 일시 (ISO 8601 — 이 시각에 이용 완료)'})
    end_at: string;

    @ApiProperty({description: '합계 금액(원)'})
    total_price: number;

    @ApiProperty({description: '100% 환불 마감 일시 (ISO 8601)'})
    refund_deadline_at: string;

    @ApiProperty({description: '예약한 호실이 사용중지인지 (0 · 1) — 1 이면 확정 · 이용 중 예약을 끝 전까지 전액 환불로 취소할 수 있다'})
    is_room_disabled: number;

    @ApiProperty({description: '등록일시 (ISO 8601)'})
    created_at: string;
}

/**
 * 내 예약 목록
 */
export class ReservationListResultDto {
    @ApiProperty({description: '목록 (입실 일시 최근순)', type: () => [ReservationListItemResultDto]})
    list: ReservationListItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
