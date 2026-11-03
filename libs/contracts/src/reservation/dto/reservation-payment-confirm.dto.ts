import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 결제 확인 — 프론트가 토스 승인 뒤 받은 결제 키와 우리 결제 ID(토스 orderId). 금액은 서버가 토스에서 다시 읽어 대조한다(프론트 값은 믿지 않는다)
 */
export class ReservationPaymentConfirmDto {
    @ApiProperty({description: '결제 ID (토스 orderId)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '결제 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '결제 ID를 입력해주세요.'})
    payment_id: string;

    @ApiProperty({description: '토스 결제 키 (paymentKey, 200자)'})
    @MaxLength(200, {message: '결제 키는 200자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '결제 키를 입력해주세요.'})
    payment_key: string;
}

/**
 * 결제 확인 결과
 */
export class ReservationPaymentConfirmResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '예약 상태 (CONFIRMED: 예약 확정 — 같은 결제를 다시 확인하면 지금 상태)'})
    reservation_state_id: string;
}
