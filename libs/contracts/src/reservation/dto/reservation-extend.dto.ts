import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 연장 신청 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationExtendParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 연장 신청 결과 — 연장 구간을 잡아 뒀다. 프론트는 payment_id 를 토스 orderId 로 결제창을 열고, 승인 뒤 기존 결제 확인 API 를 부른다(결제 대기 만료 전까지)
 */
export class ReservationExtendResultDto {
    @ApiProperty({description: '예약 ID'})
    reservation_id: string;

    @ApiProperty({description: '연장 구간 ID'})
    reservation_detail_id: string;

    @ApiProperty({description: '결제 ID — 토스 orderId'})
    payment_id: string;

    @ApiProperty({description: '주문명 — 토스 orderName'})
    order_name: string;

    @ApiProperty({description: '결제 금액(원) — 토스 amount'})
    amount: number;

    @ApiProperty({description: '결제 대기 만료 일시 (ISO 8601 — 이때까지 결제가 확인되지 않으면 만료, 그 예약은 다시 연장할 수 없다)'})
    expires_at: string;

    @ApiProperty({description: '연장 시작 일시 (ISO 8601 — 지금 끝)'})
    start_at: string;

    @ApiProperty({description: '연장 뒤 끝 일시 (ISO 8601)'})
    end_at: string;
}
