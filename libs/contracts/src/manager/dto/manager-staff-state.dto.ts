import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 업체 관리자 정지 · 해제 path param
 */
export class ManagerStaffStateParamDto {
    @ApiProperty({description: '업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 업체 관리자 정지 · 해제 입력 — 정지(BLOCK)는 로그인 · 재발급이 막히고, 해제(ACTIVE)는 다시 쓸 수 있다
 */
export class ManagerStaffStateDto {
    @ApiProperty({description: '바꿀 상태 (ACTIVE: 해제, BLOCK: 정지)', enum: ['ACTIVE', 'BLOCK']})
    @IsIn(['ACTIVE', 'BLOCK'], {message: '상태가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상태를 입력해주세요.'})
    state_id: string;

    @ApiProperty({description: '정지 사유 (정지할 때만 남는다 — 로그인 때 보인다)', required: false})
    @IsOptional()
    @MaxLength(255, {message: '정지 사유는 255자 이내로 입력해주세요.'})
    block_comment?: string;
}
