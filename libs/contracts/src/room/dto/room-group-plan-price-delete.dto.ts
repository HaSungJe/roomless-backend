import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 상품별 기간 가격 삭제 path param — 내 업체 그룹 상품의 지워지지 않은 기간 가격만(아니면 404)
 */
export class RoomGroupPlanPriceDeleteParamDto {
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
