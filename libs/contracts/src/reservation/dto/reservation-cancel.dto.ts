import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 이용자 취소 path param
 */
export class ReservationCancelParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 이용자 취소 — 사유 메모 필수. 환불 마감 전 100%, 마감 뒤 ~ 이용 시작 전은 예약 때 업체 비율, 시작 뒤에는 취소할 수 없다
 */
export class ReservationCancelDto {
    @ApiProperty({description: '취소 사유 (255자)'})
    @MaxLength(255, {message: '취소 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '취소 사유를 입력해주세요.'})
    cancel_reason: string;
}

/**
 * 이용자 취소 결과
 */
export class ReservationCancelResultDto {
    @ApiProperty({description: '환불 금액(원) — 백그라운드에서 토스로 환불한다. 0 은 환불 없이 취소, 결제 대기 예약 취소는 null', nullable: true, type: Number})
    refund_amount: number | null;
}
