import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, IsOptional, Matches, Max, MaxLength, Min} from 'class-validator';

/**
 * 상품별 기간 가격 등록 path param — 내 업체의 지워지지 않은 그룹 × 상품 종류
 */
export class RoomGroupPlanPriceParamDto {
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
 * 상품별 기간 가격 등록 — 시작 ~ 종료 날짜(둘 다 포함) 동안 기본 요금 대신 쓴다. 같은 상품의 다른 기간과 날짜가 겹치면 400. 메모는 비우면 null
 */
export class RoomGroupPlanPriceDto {
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

/**
 * 상품별 기간 가격 등록 결과
 */
export class RoomGroupPlanPriceResultDto {
    @ApiProperty({description: '기간 가격 ID'})
    room_group_plan_price_id: string;
}
