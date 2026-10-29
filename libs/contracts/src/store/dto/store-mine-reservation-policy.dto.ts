import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, Max, Min} from 'class-validator';

/**
 * 내 업체 예약 · 환불 규정 — 이용 시작 n시간 전부터 예약을 받고, n시간 전까지만 환불 신청(100% 환불)을 받는다. 예약 · 환불 때의 적용은 예약 기능(Phase 17)
 */
export class StoreMineReservationPolicyDto {
    @ApiProperty({description: '예약 가능 시작 — 이용 시작 n시간 전부터 예약을 받는다 (1 ~ 4,320시간)'})
    @IsInt({message: '예약 가능 시간은 시간 단위 정수로 입력해주세요.'})
    @Min(1, {message: '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'})
    @Max(4320, {message: '예약 가능 시간은 1 ~ 4,320시간 사이로 입력해주세요.'})
    @IsNotEmpty({message: '예약 가능 시간을 입력해주세요.'})
    booking_open_hours: number;

    @ApiProperty({description: '100% 환불 기준 — 이용 시작 n시간 전까지 환불 신청을 받는다, 이후 환불 불가 (0 ~ 168시간)'})
    @IsInt({message: '환불 기준은 시간 단위 정수로 입력해주세요.'})
    @Min(0, {message: '환불 기준은 0 ~ 168시간 사이로 입력해주세요.'})
    @Max(168, {message: '환불 기준은 0 ~ 168시간 사이로 입력해주세요.'})
    @IsNotEmpty({message: '환불 기준을 입력해주세요.'})
    refund_deadline_hours: number;
}
