import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 비밀번호 초기화 path param (총관리자 · 관리자) — 임시 비밀번호는 그 계정 휴대폰으로 SMS
 */
export class ManagerAccountPasswordResetParamDto {
    @ApiProperty({description: '업체 총관리자 · 업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
