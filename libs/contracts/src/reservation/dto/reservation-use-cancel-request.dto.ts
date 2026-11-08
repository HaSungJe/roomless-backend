import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 이용 중 취소 요청 path param — 내 업체 예약만(남의 업체 예약은 404)
 */
export class ReservationUseCancelRequestParamDto {
    @ApiProperty({description: '예약 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '예약 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '예약 ID를 입력해주세요.'})
    reservation_id: string;
}

/**
 * 이용 중 취소 요청 — 이용 중인 예약을 예약자 동의로 취소한다. 예약자에게 승인 링크 SMS 가 가고, 10분(예약 끝이 먼저면 예약 끝) 안에 승인하면 전액 환불로 취소된다
 */
export class ReservationUseCancelRequestDto {
    @ApiProperty({description: '취소 사유 (255자) — 예약자 승인 화면에 보이고, 승인하면 예약의 취소 사유'})
    @MaxLength(255, {message: '취소 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '취소 사유를 입력해주세요.'})
    cancel_reason: string;
}

/**
 * 이용 중 취소 요청 결과 — 승인 · 거절 결과는 업체 예약 현황의 cancel_request_state_id 로 본다
 */
export class ReservationUseCancelRequestResultDto {
    @ApiProperty({description: '취소 요청 ID'})
    reservation_cancel_request_id: string;

    @ApiProperty({description: '만료 일시 (ISO 8601) — 요청 + 10분, 예약 끝이 먼저면 예약 끝'})
    expires_at: string;
}
