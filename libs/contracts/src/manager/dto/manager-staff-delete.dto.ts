import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 관리자 삭제 path param — 탈퇴(LEAVE) 처리, 같은 아이디 · 번호로 다시 등록할 수 있다
 */
export class ManagerStaffDeleteParamDto {
    @ApiProperty({description: '업체 관리자 회원 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
