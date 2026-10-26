import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches, MaxLength} from 'class-validator';

/**
 * 매니저 비밀번호 초기화 — 인증번호 발송 입력 (그 업체에서 아이디 + 휴대폰 번호가 같은 매니저 계정일 때만 보낸다)
 */
export class ManagerPasswordResetDto {
    @ApiProperty({description: '업체코드 (32자 — 매니저 화면 주소에 들어 있다)', example: '0123456789abcdef0123456789abcdef'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체코드가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체코드를 입력해주세요.'})
    store_code: string;

    @ApiProperty({description: '로그인 아이디'})
    @MaxLength(30, {message: '아이디는 30자 이하여야 합니다.'})
    @IsNotEmpty({message: '아이디를 입력해주세요.'})
    login_id: string;

    @ApiProperty({description: '계정에 등록된 휴대폰 번호 (숫자만)', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;
}

/**
 * 매니저 비밀번호 초기화 — 인증번호 발송 결과
 */
export class ManagerPasswordResetResultDto {
    @ApiProperty({description: '인증 ID — 확인할 때 인증번호와 함께 보낸다'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 만료일시 (ISO 8601) — 발송 후 5분'})
    expires_at: string;
}
