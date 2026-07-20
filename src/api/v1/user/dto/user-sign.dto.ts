import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, Matches, MaxLength } from 'class-validator';
import { i18nMsg } from '@root/common/i18n/translate';

export class UserSignDto {
    @ApiProperty({description: 'SNS 유형', enum: ['GOOGLE', 'FACEBOOK', 'APPLE', 'KAKAO', 'LINE']})
    @IsIn(['GOOGLE', 'FACEBOOK', 'APPLE', 'KAKAO', 'LINE'], {message: i18nMsg('user.dto.sign.sns_id_invalid')})  // SNS 유형이 올바르지 않습니다.
    @IsNotEmpty({message: i18nMsg('user.dto.sign.sns_id_required')})  // SNS 유형을 입력해주세요.
    sns_id: string;

    @ApiProperty({description: 'SNS 사용자 ID'})
    @MaxLength(255, {message: i18nMsg('user.dto.sign.sns_user_id_max_length')})  // SNS 사용자 ID는 최대 255자까지 입력할 수 있습니다.
    @IsNotEmpty({message: i18nMsg('user.dto.sign.sns_user_id_required')})  // SNS 사용자 ID를 입력해주세요.
    sns_user_id: string;

    @ApiProperty({description: '성별', enum: ['M', 'F']})
    @IsIn(['M', 'F'], {message: i18nMsg('user.dto.sign.gender_invalid')})  // 성별이 올바르지 않습니다.
    @IsNotEmpty({message: i18nMsg('user.dto.sign.gender_required')})  // 성별을 입력해주세요.
    gender: string;

    @ApiProperty({description: '생년월일 (YYYY-MM-DD)', example: '1999-01-01'})
    @Matches(/^\d{4}-\d{2}-\d{2}$/, {message: i18nMsg('user.dto.sign.birth_format')})  // 생년월일은 YYYY-MM-DD 형식이어야 합니다.
    @IsNotEmpty({message: i18nMsg('user.dto.sign.birth_required')})  // 생년월일을 입력해주세요.
    birth: string;

    @ApiProperty({description: '닉네임 (최대 12자, 특수문자 불가)'})
    @MaxLength(12, {message: i18nMsg('user.dto.sign.nickname_max_length')})  // 닉네임은 최대 12자까지 입력할 수 있습니다.
    @Matches(/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]+$/, {message: i18nMsg('user.dto.sign.nickname_special_chars')})  // 닉네임에 특수문자는 사용할 수 없습니다.
    @IsNotEmpty({message: i18nMsg('user.dto.sign.nickname_required')})  // 닉네임을 입력해주세요.
    nickname: string;

    // 디바이스 OS는 최대 20자까지 입력할 수 있습니다.
    @ApiProperty({description: '디바이스 OS', required: false})
    @IsOptional()
    @MaxLength(20, {message: i18nMsg('user.dto.sign.device_os_max_length')})
    device_os?: string;

    // 디바이스 토큰은 최대 255자까지 입력할 수 있습니다.
    @ApiProperty({description: '디바이스 토큰', required: false})
    @IsOptional()
    @MaxLength(255, {message: i18nMsg('user.dto.sign.device_token_max_length')})
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
}
