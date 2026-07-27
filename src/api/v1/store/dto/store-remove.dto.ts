import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, Matches } from 'class-validator';

/**
 * 가맹점 삭제 입력 (path param)
 */
export class StoreRemoveParamDto {
    @ApiProperty({description: '가맹점 ID (32자)'})
    @Matches(/^[a-f0-9]{32}$/, {message: '가맹점 ID 형식이 올바르지 않습니다.'})
    @IsNotEmpty({message: '가맹점 ID를 입력해주세요.'})
    store_id: string;
}
