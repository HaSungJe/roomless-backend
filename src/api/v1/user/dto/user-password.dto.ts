import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches, MaxLength } from 'class-validator';

/**
 * 비밀번호 변경 입력 (로그인 회원 공용)
 */
export class UserPasswordDto {
    @ApiProperty({description: '현재 비밀번호'})
    @MaxLength(20, {message: '비밀번호는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: '현재 비밀번호를 입력해주세요.'})
    current_password: string;

    @ApiProperty({description: '새 비밀번호 (8~20자, 영문+숫자 필수, 특수문자 !@#$%^&* 허용)'})
    @Matches(/^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z0-9!@#$%^&*]{8,20}$/, {message: '비밀번호는 8~20자이며 영문과 숫자를 반드시 포함해야 합니다. (특수문자는 !@#$%^&* 만 허용)'})
    @IsNotEmpty({message: '새 비밀번호를 입력해주세요.'})
    new_password: string;
}
