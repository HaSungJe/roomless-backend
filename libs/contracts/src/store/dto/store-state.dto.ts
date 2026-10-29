import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 업체 상태 변경 path param (총관리자)
 */
export class StoreStateParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 상태 변경 — 탈퇴(LEAVE)는 되돌릴 수 없고 그 업체 매니저 계정을 정지한다. 영업중지(SUSPEND)면 정지 사유를 남길 수 있다
 */
export class StoreStateDto {
    @ApiProperty({description: '바꿀 상태 (ACTIVE: 활성, SUSPEND: 영업중지, LEAVE: 탈퇴)', enum: ['ACTIVE', 'SUSPEND', 'LEAVE']})
    @IsIn(['ACTIVE', 'SUSPEND', 'LEAVE'], {message: '업체 상태가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 상태를 입력해주세요.'})
    store_state_id: string;

    @ApiProperty({description: '정지 사유 (영업중지로 바꿀 때만 남는다 — 업체 관리자의 내 업체 상세에 보인다, 255자)', required: false})
    @IsOptional()
    @MaxLength(255, {message: '정지 사유는 255자 이내로 입력해주세요.'})
    suspend_comment?: string;
}
