import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsInt, IsNotEmpty, Matches, Max, Min} from 'class-validator';

/**
 * 그룹 상품 수정 path param — 내 업체의 지워지지 않은 그룹 × 상품 종류
 */
export class RoomGroupPlanUpdateParamDto {
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
 * 그룹 상품 수정 — 사용 여부 · 기본 요금. 판매(is_used 1)인데 요금이 0 이면 400
 */
export class RoomGroupPlanUpdateDto {
    @ApiProperty({description: '사용 여부 (0: 이 그룹은 팔지 않음, 1: 판매 — 업체 상품 설정도 사용 중이어야 판다)', enum: [0, 1]})
    @IsIn([0, 1], {message: '사용 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '사용 여부를 입력해주세요.'})
    is_used: number;

    @ApiProperty({description: '기본 요금(원, 0 ~ 10,000,000 — 판매면 1원 이상) — 시간 이용 1회 · 1박 · 연박 1박당'})
    @IsInt({message: '요금은 원 단위 정수로 입력해주세요.'})
    @Min(0, {message: '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'})
    @Max(10000000, {message: '요금은 0 ~ 10,000,000원 사이로 입력해주세요.'})
    @IsNotEmpty({message: '요금을 입력해주세요.'})
    price: number;
}
