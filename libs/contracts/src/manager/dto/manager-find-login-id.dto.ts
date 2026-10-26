import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, Matches} from 'class-validator';

/**
 * 매니저 아이디 찾기 — 인증번호 발송 입력 (업체코드 + 그 업체 계정에 등록된 휴대폰 번호)
 */
export class ManagerFindLoginIdDto {
    @ApiProperty({description: '업체코드 (32자 — 매니저 화면 주소에 들어 있다)', example: '0123456789abcdef0123456789abcdef'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체코드가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체코드를 입력해주세요.'})
    store_code: string;

    @ApiProperty({description: '계정에 등록된 휴대폰 번호 (숫자만)', example: '01012345678'})
    @Matches(/^01[016789]\d{7,8}$/, {message: '휴대폰 번호를 숫자만 정확히 입력해주세요.'})
    @IsNotEmpty({message: '휴대폰 번호를 입력해주세요.'})
    phone: string;
}

/**
 * 매니저 아이디 찾기 — 인증번호 발송 결과
 */
export class ManagerFindLoginIdResultDto {
    @ApiProperty({description: '인증 ID — 확인할 때 인증번호와 함께 보낸다'})
    sms_verification_id: string;

    @ApiProperty({description: '인증번호 만료일시 (ISO 8601) — 발송 후 5분'})
    expires_at: string;
}
