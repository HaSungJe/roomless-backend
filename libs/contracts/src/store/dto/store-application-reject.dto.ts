import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 입점 반려 path param (총관리자)
 */
export class StoreApplicationRejectParamDto {
    @ApiProperty({description: '입점 신청 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '입점 신청 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '입점 신청 ID를 입력해주세요.'})
    store_application_id: string;
}

/**
 * 입점 반려 — 사유 필수
 */
export class StoreApplicationRejectDto {
    @ApiProperty({description: '반려 사유 — 신청자가 내 신청에서 본다'})
    @MaxLength(255, {message: '반려 사유는 255자 이내로 입력해주세요.'})
    @IsNotEmpty({message: '반려 사유를 입력해주세요.'})
    reject_comment: string;
}
