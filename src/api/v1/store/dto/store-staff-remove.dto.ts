import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

/**
 * 인력 계정 삭제 입력 (path param)
 */
export class StoreStaffRemoveParamDto {
    @ApiProperty({description: '회원 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '회원 ID 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '회원 ID를 입력해주세요.'})
    user_id: string;
}
