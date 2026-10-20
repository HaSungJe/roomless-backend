import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 아이디 찾기 — 인증번호 확인 입력 (발송 결과의 인증 ID + 인증번호)
 */
export class UserFindLoginIdConfirmDto {
    @ApiProperty({description: '인증 ID (발송 결과의 sms_verification_id)', example: '0123456789abcdef0123456789abcdef'})
    @Matches(/^[a-f0-9]{32}$/, {message: '인증 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '인증 ID를 입력해주세요.'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 6자리', example: '123456'})
    @Matches(/^\d{6}$/, {message: '인증번호 6자리를 입력해주세요.'})
    @IsNotEmpty({message: '인증번호를 입력해주세요.'})
    code: string;
}

/**
 * 아이디 찾기 결과 — 일반 계정은 login_id, SNS 계정은 sns_id (다른 쪽은 null), 그리고 가입일시
 */
export class UserFindLoginIdConfirmResultDto {
    @ApiProperty({description: '로그인 아이디 (SNS 계정이면 null)', nullable: true, type: String})
    login_id: string | null;

    @ApiProperty({description: '가입한 SNS (NAVER · KAKAO, 일반 계정이면 null)', nullable: true, type: String})
    sns_id: string | null;

    @ApiProperty({description: '가입일시 (ISO 8601)'})
    created_at: string;
}
