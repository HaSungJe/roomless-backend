import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, Max, Min} from 'class-validator';

/**
 * 내 업체 예약 · 환불 규정 — 이용 시작 n시간 전부터 예약, n분 전까지 취소는 100% 환불, 그 뒤 ~ 이용 시작 전 취소는 비율 환불(원 단위 내림).
 * 예약할 때 마감 시각 · 비율을 예약에 저장한다 — 바꿔도 기존 예약은 그대로다
 */
export class StoreMineReservationPolicyDto {
    @ApiProperty({description: '예약 가능 시작 — 이용 시작 n시간 전부터 예약을 받는다 (1 ~ 4,320시간)'})
    @IsInt({message: '예약 가능 시간은 시간 단위 정수로 입력해주세요.'})
    @Min(1, {message: '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'})
    @Max(4320, {message: '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'})
    @IsNotEmpty({message: '예약 가능 시간을 입력해주세요.'})
    booking_open_hours: number;

    @ApiProperty({description: '100% 환불 마감 — 이용 시작 n분 전까지 취소하면 100% 환불 (0 ~ 10,080분)'})
    @IsInt({message: '환불 마감은 분 단위 정수로 입력해주세요.'})
    @Min(0, {message: '환불 마감은 0 ~ 10,080분 사이로 입력해주세요.'})
    @Max(10080, {message: '환불 마감은 0 ~ 10,080분 사이로 입력해주세요.'})
    @IsNotEmpty({message: '환불 마감을 입력해주세요.'})
    refund_deadline_minutes: number;

    @ApiProperty({description: '마감 뒤 환불 비율 — 환불 마감 뒤 ~ 이용 시작 전 취소의 환불 비율 (0 ~ 100%, 0 이면 환불 없이 취소)'})
    @IsInt({message: '마감 뒤 환불 비율은 정수로 입력해주세요.'})
    @Min(0, {message: '마감 뒤 환불 비율은 0 ~ 100% 사이로 입력해주세요.'})
    @Max(100, {message: '마감 뒤 환불 비율은 0 ~ 100% 사이로 입력해주세요.'})
    @IsNotEmpty({message: '마감 뒤 환불 비율을 입력해주세요.'})
    late_refund_percent: number;
}
