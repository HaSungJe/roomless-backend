import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, IsOptional, Matches, MaxLength} from 'class-validator';

export class UserSignDto {
    @ApiProperty({description: 'SNS 유형', enum: ['NAVER', 'KAKAO']})
    @IsIn(['NAVER', 'KAKAO'], {message: 'SNS 유형이 올바르지 않습니다.'})
    @IsNotEmpty({message: 'SNS 유형을 입력해주세요.'})
    sns_id: string;

    @ApiProperty({description: 'SNS 사용자 ID'})
    @MaxLength(255, {message: 'SNS 사용자 ID는 최대 255자까지 입력할 수 있습니다.'})
    @IsNotEmpty({message: 'SNS 사용자 ID를 입력해주세요.'})
    sns_user_id: string;

    @ApiProperty({description: '성별', enum: ['M', 'F']})
    @IsIn(['M', 'F'], {message: '성별이 올바르지 않습니다.'})
    @IsNotEmpty({message: '성별을 입력해주세요.'})
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)', example: '1999-01-01'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: '생년월일은 YYYY-MM-DD 형식이어야 합니다.'})
    @IsNotEmpty({message: '생년월일을 입력해주세요.'})
    birth: string;

    @ApiProperty({description: '닉네임 (최대 12자, 특수문자 불가)'})
    @MaxLength(12, {message: '닉네임은 최대 12자까지 입력할 수 있습니다.'})
    @Matches(/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]+$/, {message: '닉네임에 특수문자는 사용할 수 없습니다.'})
    @IsNotEmpty({message: '닉네임을 입력해주세요.'})
    nickname: string;

    @ApiProperty({description: '디바이스 OS', required: false})
    @IsOptional()
    @MaxLength(20, {message: '디바이스 OS는 최대 20자까지 입력할 수 있습니다.'})
    device_os?: string;

    @ApiProperty({description: '디바이스 토큰', required: false})
    @IsOptional()
    @MaxLength(255, {message: '디바이스 토큰은 최대 255자까지 입력할 수 있습니다.'})
    device_token?: string;
}

export class UserSignResultDto {
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
