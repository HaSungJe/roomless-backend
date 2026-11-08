import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 이용 중 취소 요청 거절 path param — 내 예약만(남의 예약은 404). 거절하면 요청만 끝나고 예약은 그대로다
 */
export class ReservationCancelRequestRejectParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}
