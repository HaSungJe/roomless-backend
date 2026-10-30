import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';
import {PaginationDto, PaginationResultDto} from '@app/common/dto/pagination.dto.js';

/**
 * 상품별 기간 가격 목록 path param — 내 업체의 지워지지 않은 그룹 × 상품 종류
 */
export class RoomGroupPlanPriceListParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;
}

/**
 * 상품별 기간 가격 목록 query — 페이지만. 지워지지 않은 기간만, 시작 날짜 순
 */
export class RoomGroupPlanPriceListDto extends PaginationDto {
    /**
     * @param data 요청 쿼리 — 빠진 페이지 값은 PaginationDto 기본값
     */
    constructor(data?: Partial<RoomGroupPlanPriceListDto>) {
        super(data);
    }
}

/**
 * 상품별 기간 가격 목록 항목
 */
export class RoomGroupPlanPriceItemResultDto {
    @ApiProperty({description: '기간 가격 ID'})
    room_group_plan_price_id: string;

    @ApiProperty({description: '시작 날짜 (YYYY-MM-DD, 한국 날짜 — 포함)'})
    start_date: string;

    @ApiProperty({description: '종료 날짜 (YYYY-MM-DD, 한국 날짜 — 포함)'})
    end_date: string;

    @ApiProperty({description: '이 기간의 요금(원) — 기본 요금 대신'})
    price: number;

    @ApiProperty({description: '메모 (예: 여름 성수기)', nullable: true, type: String})
    memo: string | null;
}

/**
 * 상품별 기간 가격 목록
 */
export class RoomGroupPlanPriceListResultDto {
    @ApiProperty({description: '목록 (시작 날짜 순)', type: () => [RoomGroupPlanPriceItemResultDto]})
    list: RoomGroupPlanPriceItemResultDto[];

    @ApiProperty({description: '페이지 정보', type: () => PaginationResultDto})
    pagination: PaginationResultDto;
}
