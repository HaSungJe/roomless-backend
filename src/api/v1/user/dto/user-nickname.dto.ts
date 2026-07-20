import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches, MaxLength } from 'class-validator';
import { i18nMsg } from '@root/common/i18n/translate';

export class UserNicknameUpdateDto {
    @ApiProperty({description: '닉네임 (최대 12자, 특수문자 불가)'})
    @MaxLength(12, {message: i18nMsg('user.dto.nickname.max_length')})  // 닉네임은 최대 12자까지 입력할 수 있습니다.
    @Matches(/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9\s]+$/, {message: i18nMsg('user.dto.nickname.special_chars')})  // 닉네임에 특수문자는 사용할 수 없습니다.
    @IsNotEmpty({message: i18nMsg('user.dto.nickname.required')})  // 닉네임을 입력해주세요.
    nickname: string;
}
