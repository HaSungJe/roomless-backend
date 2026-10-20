import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, MaxLength, ValidateIf} from 'class-validator';

export class UserLoginDto {
    @ApiProperty({description: 'SNS 유형', enum: ['NAVER', 'KAKAO']})
    @IsIn(['NAVER', 'KAKAO'], {message: '유효하지 않은 SNS 유형입니다.'})
    @IsNotEmpty({message: 'SNS 유형을 입력해주세요.'})
    sns_id: string;

    @ApiProperty({description: 'SNS 사용자 ID'})
    @MaxLength(255, {message: 'SNS 사용자 ID는 255자 이하여야 합니다.'})
    @IsNotEmpty({message: 'SNS 사용자 ID를 입력해주세요.'})
    sns_user_id: string;

    // device_os / device_token 한 세트: 둘 다 받거나 둘 다 없거나
    // ValidateIf — device_token 입력 시에만 device_os 검증. 양쪽 미입력이면 skip.
    @ApiProperty({description: '디바이스 OS (device_token 과 한 세트)', required: false})
    @ValidateIf((o) => o.device_token !== undefined && o.device_token !== null && o.device_token !== '')
    @MaxLength(20, {message: 'device_os 는 20자 이하여야 합니다.'})
    @IsNotEmpty({message: 'device_token 입력 시 device_os 도 입력해야 합니다.'})
    device_os?: string;

    @ApiProperty({description: '디바이스 토큰 (device_os 와 한 세트)', required: false})
    @ValidateIf((o) => o.device_os !== undefined && o.device_os !== null && o.device_os !== '')
    @MaxLength(255, {message: 'device_token 은 255자 이하여야 합니다.'})
    @IsNotEmpty({message: 'device_os 입력 시 device_token 도 입력해야 합니다.'})
    device_token?: string;
}

export class UserLoginResultDto {
    @ApiProperty({description: 'Access Token (유효 20분)'})
    access_token: string;

    @ApiProperty({description: 'Refresh Token (유효 365일)'})
    refresh_token: string;

    @ApiProperty({description: 'Access Token 만료일시 (ISO 8601)'})
    access_token_expires_at: string;

    @ApiProperty({description: 'Refresh Token 만료일시 (ISO 8601)'})
    refresh_token_expires_at: string;

    @ApiProperty({description: '휴대폰 SMS 인증 여부(0: 미인증, 1: 인증) — 0 이면 휴대폰 인증 화면으로'})
    is_phone_verified: number;
}
