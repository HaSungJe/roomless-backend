import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 상품별 기간 가격 수정 path param — 내 업체 그룹 상품의 지워지지 않은 기간 가격만(아니면 404)
 */
export class RoomGroupPlanPriceUpdateParamDto {
    @ApiProperty({description: '객실 그룹 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '객실 그룹 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '객실 그룹 ID를 입력해주세요.'})
    room_group_id: string;

    @ApiProperty({description: '상품 종류 ID (HOURLY: 시간 이용, NIGHT: 1박, LONG: 연박)', enum: ['HOURLY', 'NIGHT', 'LONG']})
    @IsIn(['HOURLY', 'NIGHT', 'LONG'], {message: '상품 종류가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상품 종류를 입력해주세요.'})
    room_plan_type_id: string;

    @ApiProperty({description: '기간 가격 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '기간 가격 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '기간 가격 ID를 입력해주세요.'})
    room_group_plan_price_id: string;
}

/**
 * 상품별 기간 가격 수정 — 등록과 같은 필드를 통째로. 같은 상품의 다른 기간(자기 자신 제외)과 날짜가 겹치면 400. 메모는 비우면 null
 */
export class RoomGroupPlanPriceUpdateDto {
    @ApiProperty({description: '시작 날짜 (YYYY-MM-DD, 한국 날짜 — 포함)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '시작 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '시작 날짜를 입력해주세요.'})
    start_date: string;

    @ApiProperty({description: '종료 날짜 (YYYY-MM-DD, 한국 날짜 — 포함, 시작 날짜와 같거나 늦다)'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '종료 날짜를 YYYY-MM-DD 로 입력해주세요.'})
    @IsNotEmpty({message: '종료 날짜를 입력해주세요.'})
    end_date: string;

    @ApiProperty({description: '이 기간의 요금(원, 1 ~ 10,000,000) — 기본 요금 대신'})
    @IsInt({message: '기간 요금은 원 단위 정수로 입력해주세요.'})
    @Min(1, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @Max(10000000, {message: '기간 요금은 1 ~ 10,000,000원 사이로 입력해주세요.'})
    @IsNotEmpty({message: '기간 요금을 입력해주세요.'})
    price: number;

    @ApiProperty({description: '메모 (30자 — 예: 여름 성수기)', required: false})
    @IsOptional()
    @MaxLength(30, {message: '메모는 30자 이내로 입력해주세요.'})
    memo?: string;
}
