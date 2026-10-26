import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 비밀번호 초기화 path param — 임시 비밀번호는 그 업체 관리자 휴대폰으로 SMS
 */
export class ManagerStaffPasswordResetParamDto {
    @ApiProperty({description: '업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
