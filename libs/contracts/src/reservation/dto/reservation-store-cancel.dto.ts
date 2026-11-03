import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 업체 취소 path param — 내 업체 예약만(아니면 404)
 */
export class ReservationStoreCancelParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 업체 취소 — 사유 메모 필수(이용자 SMS 에 함께 나간다). 확정 예약은 100% 환불
 */
export class ReservationStoreCancelDto {
    @ApiProperty({description: '취소 사유 (255자)'})
    @MaxLength(255, {message: '취소 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '취소 사유를 입력해주세요.'})
    cancel_reason: string;
}
