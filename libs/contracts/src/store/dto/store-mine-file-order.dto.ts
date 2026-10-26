import {ApiProperty} from '@nestjs/swagger';
import {ArrayMaxSize, IsArray, IsNotEmpty, Matches} from 'class-validator';

/**
 * 내 업체 사진 순서 변경 — 지금 업체 사진 ID 전부를 원하는 순서로(가장 앞이 대표)
 */
export class StoreMineFileOrderDto {
    @ApiProperty({description: '업체 사진 ID 전부를 원하는 순서로 — 빠지거나 남거나 겹치면 400', type: [String]})
    @Matches(/^[a-f0-9]{32}$/, {each: true, message: '업체 사진 ID가 올바르지 않습니다.'})
    @ArrayMaxSize(5, {message: '업체 사진은 5장까지입니다.'})
    @IsArray({message: '업체 사진 ID를 배열로 입력해주세요.'})
    @IsNotEmpty({message: '업체 사진 ID를 입력해주세요.'})
    store_file_ids: string[];
}
