import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

/**
 * 이용자 이용 제한 · 해제 path param
 */
export class UserStateParamDto {
    @ApiProperty({description: '이용자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}

/**
 * 이용자 이용 제한 · 해제 입력 — 이용 제한(BLOCK)은 로그인 · 기존 예약 이용은 되고 새 예약 · 연장만 막힌다, 해제(ACTIVE)
 */
export class UserStateDto {
    @ApiProperty({description: '바꿀 상태 (ACTIVE: 해제, BLOCK: 이용 제한)', enum: ['ACTIVE', 'BLOCK']})
    @IsIn(['ACTIVE', 'BLOCK'], {message: '상태가 올바르지 않습니다.'})
    @IsNotEmpty({message: '상태를 입력해주세요.'})
    state_id: string;

    @ApiProperty({description: '이용 제한 사유 (제한할 때만 남는다 — 이용자 로그인 결과에 보인다)', required: false})
    @IsOptional()
    @MaxLength(255, {message: '이용 제한 사유는 255자 이내로 입력해주세요.'})
    block_comment?: string;
}
