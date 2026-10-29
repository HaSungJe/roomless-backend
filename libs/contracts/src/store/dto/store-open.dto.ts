import {ApiProperty} from '@nestjs/swagger';
import {IsIn, IsNotEmpty, Matches} from 'class-validator';

/**
 * 업체 영업중 여부 변경 path param (총관리자 · 관리자)
 */
export class StoreOpenParamDto {
    @ApiProperty({description: '업체 ID'})
    @Matches(/^[a-f0-9]{32}$/, {message: '업체 ID가 올바르지 않습니다.'})
    @IsNotEmpty({message: '업체 ID를 입력해주세요.'})
    store_id: string;
}

/**
 * 업체 영업중 여부 변경 (총관리자 · 관리자) — 0 이면 연중무휴 · 영업시간과 무관하게 영업중 아님
 */
export class StoreOpenDto {
    @ApiProperty({description: '영업중 여부 (0: 영업중 아님, 1: 영업중)', enum: [0, 1]})
    @IsIn([0, 1], {message: '영업중 여부가 올바르지 않습니다.'})
    @IsNotEmpty({message: '영업중 여부를 입력해주세요.'})
    is_open: number;
}
