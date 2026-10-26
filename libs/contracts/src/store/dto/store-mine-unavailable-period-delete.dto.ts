import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 일시 예약불가 삭제 path param — 그 업체 것만(아니면 404)
 */
export class StoreMineUnavailablePeriodDeleteParamDto {
    @ApiProperty({description: '일시 예약불가 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '일시 예약불가 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '일시 예약불가 ID를 입력해주세요.'})
    store_unavailable_period_id: string;
}
