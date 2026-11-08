import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 예약의 이용 중 취소 요청 path param — 내 예약만(남의 예약은 404)
 */
export class ReservationCancelRequestParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 내 예약의 이용 중 취소 요청 — 그 예약의 마지막 요청(SMS 링크 화면)
 */
export class ReservationCancelRequestResultDto {
    @ApiProperty({description: '취소 요청 ID'})
    reservation_cancel_request_id: string;

    @ApiProperty({description: '요청 상태 (REQUESTED: 요청 중 — 승인 · 거절할 수 있다, APPROVED: 승인, REJECTED: 거절, EXPIRED: 만료)'})
    reservation_cancel_request_state_id: string;

    @ApiProperty({description: '상호명'})
    store_name: string;

    @ApiProperty({description: '호실명'})
    room_name: string;

    @ApiProperty({description: '업체가 적은 취소 사유'})
    cancel_reason: string;

    @ApiProperty({description: '승인하면 환불받는 금액(원) — 결제 완료 금액 전액'})
    refund_amount: number;

    @ApiProperty({description: '만료 일시 (ISO 8601) — 이 시각부터 승인 · 거절할 수 없다'})
    expires_at: string;

    @ApiProperty({description: '요청 일시 (ISO 8601)'})
    created_at: string;
}
