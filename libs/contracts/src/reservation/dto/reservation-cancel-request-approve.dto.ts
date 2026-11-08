import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 이용 중 취소 요청 승인 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationCancelRequestApproveParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 이용 중 취소 요청 승인 결과 — 예약은 업체 취소, 결제는 전액 환불 신청(백그라운드에서 토스로)
 */
export class ReservationCancelRequestApproveResultDto {
    @ApiProperty({description: '환불 금액(원) — 결제 완료 금액 전액'})
    refund_amount: number;
}
