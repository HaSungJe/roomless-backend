import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 비밀번호 초기화 — 인증번호 확인 입력 (발송 결과의 인증 ID + 인증번호).
 * 확인되면 그 기록의 회원 비밀번호를 임시 비밀번호(영문 + 숫자 10자리)로 바꾸고 그 기록의 번호로 SMS 를 보낸다
 */
export class UserPasswordResetConfirmDto {
    @ApiProperty({description: '인증 ID (발송 결과의 sms_verification_id)', example: '0123456789abcdef0123456789abcdef'})
    @Matches(/^[a-f0-9]{32}$/, {message: '인증 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '인증 ID를 입력해주세요.'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 6자리', example: '123456'})
    @Matches(/^\d{6}$/, {message: '인증번호 6자리를 입력해주세요.'})
    @IsNotEmpty({message: '인증번호를 입력해주세요.'})
    code: string;
}
