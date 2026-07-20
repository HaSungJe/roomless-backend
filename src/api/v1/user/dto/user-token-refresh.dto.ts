import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';
import { i18nMsg } from '@root/common/i18n/translate';

export class UserTokenRefreshDto {
    // 리프레시 토큰을 입력해주세요.
    @ApiProperty({description: '리프레시 토큰'})
    @IsNotEmpty({message: i18nMsg('user.dto.token_refresh.refresh_token_required')})
    refresh_token: string;
}

export class UserTokenRefreshResultDto {
    @ApiProperty({description: 'Access Token (유효 20분)'})
    access_token: string;

    @ApiProperty({description: 'Refresh Token (유효 365일)'})
    refresh_token: string;

    @ApiProperty({description: 'Access Token 만료일시 (ISO 8601)'})
    access_token_expires_at: string;

    @ApiProperty({description: 'Refresh Token 만료일시 (ISO 8601)'})
    refresh_token_expires_at: string;
}
