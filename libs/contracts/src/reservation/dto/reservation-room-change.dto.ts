import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 호실 이동 path param — 내 업체 예약만(아니면 404)
 */
export class ReservationRoomChangeParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 호실 이동 — 같은 객실 그룹의 다른 호실로(이용 시작 전 확정 예약만). 금액 · 시간은 그대로
 */
export class ReservationRoomChangeDto {
    @ApiProperty({description: '옮길 호실 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '호실 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '옮길 호실 ID를 입력해주세요.'})
    room_id: string;
}
