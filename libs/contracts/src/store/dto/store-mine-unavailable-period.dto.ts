import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 내 업체 일시 예약불가 등록 — 시작 일시 ~ 종료 일시(한국 시각 분 단위) 동안 예약을 받지 않는다. 다른 일시 예약불가와 겹치면 400
 */
export class StoreMineUnavailablePeriodDto {
    @ApiProperty({description: '시작 일시 (YYYY-MM-DD HH:mm, 한국 시각)'})
    @Matches(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/, {message: '시작 일시를 YYYY-MM-DD HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '시작 일시를 입력해주세요.'})
    starts_at: string;

    @ApiProperty({description: '종료 일시 (YYYY-MM-DD HH:mm, 한국 시각 — 시작보다 늦고 지금 이후, 이 시각부터 다시 예약을 받는다)'})
    @Matches(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/, {message: '종료 일시를 YYYY-MM-DD HH:mm 으로 입력해주세요.'})
    @IsNotEmpty({message: '종료 일시를 입력해주세요.'})
    ends_at: string;

    @ApiProperty({description: '메모 (30자 — 간단한 사유, 예: 내부 공사)', required: false})
    @IsOptional()
    @MaxLength(30, {message: '메모는 30자 이내로 입력해주세요.'})
    memo?: string;
}

/**
 * 일시 예약불가 등록 결과
 */
export class StoreMineUnavailablePeriodResultDto {
    @ApiProperty({description: '일시 예약불가 ID'})
    store_unavailable_period_id: string;
}
